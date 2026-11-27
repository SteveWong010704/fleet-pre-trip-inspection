import express from 'express';
import {
  hasVehicles, getVehicleByPlate, getDriverByLogin, getDriverDailyInspections,
  isSupervisor, getVehicleDailyInspection, getInspections, addInspection, waitForInspectionPhotos,
  bulkImportInspections, clearAllInspections, updateInspectionPhotoQa,
  getDriverQaPatternReport, getUninspectedDriversReport, seedSampleDriverQaAudits,
} from '../storage';
import { requireAuth, requireAdmin, requireSecurityPassword, type AuthTokenPayload } from '../http/security';

export function registerInspectionRoutes(app: express.Express) {
  // Submit Inspection (Protected: requires verified session, server-enforced identity to prevent IDOR)
  app.post('/api/inspections', requireAuth, async (req, res) => {
    try {
      const inspectionData = req.body;
      const authUser = (req as any).user as AuthTokenPayload;

      // P0 IDOR Hardening: Server strictly overrides driver identity with authenticated token claims
      if (authUser.role === 'driver') {
        inspectionData.driverId = authUser.sub;
        inspectionData.driverName = authUser.name;
      }

      if (!inspectionData.vehicleNo || !inspectionData.driverId) {
        return res.status(400).json({ success: false, message: 'Vehicle plate and driver ID are required' });
      }

      // Check if vehicle exists in fleet directory (if roster is not empty)
      if (hasVehicles()) {
        const vehicle = getVehicleByPlate(inspectionData.vehicleNo);
        if (!vehicle) {
          return res.status(400).json({ success: false, message: `Vehicle ${inspectionData.vehicleNo} does not exist in fleet registry.` });
        }
      }

      // Anti-Replay & Duplicate Inspection Defense (Supervisor up to 3, others 1):
      const driverObj = getDriverByLogin(authUser.sub) || getDriverByLogin(inspectionData.driverId);
      const isSpv = isSupervisor(inspectionData.driverDesignation || driverObj?.designation);
      const maxAllowed = isSpv ? 3 : 1;

      // 1. Has vehicle already completed inspection today?
      // (Regular drivers blocked; Supervisors permitted to audit/re-inspect up to their 3 limit)
      const existingVehicle = getVehicleDailyInspection(inspectionData.vehicleNo);
      if (existingVehicle && !isSpv) {
        return res.status(409).json({
          success: false,
          message: `Vehicle Already Inspected Today: Truck ${inspectionData.vehicleNo} has already completed daily inspection today (${existingVehicle.id}) by ${existingVehicle.driverName}. Each truck can only be inspected once per day.`,
          existingInspection: existingVehicle,
        });
      }

      // 2. Has driver already completed allowed inspections today? (Supervisor up to 3, others 1)
      if (authUser.role === 'driver') {
        const todayDriverInspections = getDriverDailyInspections(authUser.sub);
        if (todayDriverInspections.length >= maxAllowed) {
          if (isSpv) {
            return res.status(409).json({
              success: false,
              message: `Supervisor Daily Limit Reached: Supervisor ${authUser.name} has already completed the maximum limit of 3 daily inspections today.`,
              existingInspection: todayDriverInspections[0],
            });
          } else {
            const first = todayDriverInspections[0];
            return res.status(409).json({
              success: false,
              message: `Driver Daily Limit Reached: Driver ${authUser.name} has already completed an inspection today (${first?.id || 'DONE'}) for vehicle ${first?.vehicleNo || inspectionData.vehicleNo}. Each driver is restricted to 1 vehicle inspection per calendar day.`,
              existingInspection: first,
            });
          }
        }
      }

      // Server-side validation: If fail, must have remark
      if (Array.isArray(inspectionData.items)) {
        for (const it of inspectionData.items) {
          if (it.status === 'Fail' && (!it.defectNote || !it.defectNote.trim())) {
            return res.status(400).json({
              success: false,
              message: `Validation Error: Defect remark is mandatory for failed checkpoint #${it.code || ''} (${it.title || it.id}).`,
            });
          }
        }
      }

      const created = addInspection(inspectionData);
      // Reply only once the photos are on disk (they are written without blocking the server)
      await waitForInspectionPhotos(created);
      res.json({ success: true, inspection: created });
    } catch (err: any) {
      const isConflict = err.message && (err.message.includes('Limit Reached') || err.message.includes('Already Inspected'));
      res.status(isConflict ? 409 : 500).json({ success: false, error: err.message });
    }
  });

  // Bulk import inspections (Admin only)
  app.post('/api/inspections/bulk', requireAdmin, (req, res) => {
    try {
      const { inspections } = req.body;
      if (!Array.isArray(inspections) || inspections.length === 0) {
        return res.status(400).json({ success: false, message: 'Invalid inspections array' });
      }
      const result = bulkImportInspections(inspections);
      res.json({
        success: true,
        ...result,
        message: `Successfully imported ${result.added} new records and updated ${result.updated} records (${result.passed} Passed, ${result.defects} Grounded/Defects).`,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // List inspections (Requires authentication)
  app.get('/api/inspections', requireAuth, (req, res) => {
    try {
      const { vehicleNo, driverId, result, branch, route, date, dateFrom, dateTo } = req.query;
      const records = getInspections({
        vehicleNo: vehicleNo as string,
        driverId: driverId as string,
        result: result as string,
        branch: branch as string,
        route: route as string,
        date: date as string,
        dateFrom: dateFrom as string,
        dateTo: dateTo as string,
      });
      // Drivers only ever see their own inspections (the admin portal is the only screen
      // that lists inspections; the driver app does not call this endpoint).
      const authUser = (req as any).user as AuthTokenPayload;
      if (authUser?.role === 'driver') {
        const me = getDriverByLogin(authUser.sub);
        const ids = new Set(
          [authUser.sub, me?.employeeId, me?.loginId].filter(Boolean).map((x) => String(x).trim().toUpperCase())
        );
        const own = records.filter((r) => ids.has(String(r.driverId || '').trim().toUpperCase()));
        return res.json({ success: true, count: own.length, inspections: own });
      }
      res.json({ success: true, count: records.length, inspections: records });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Update photo QA audit decision (Admin only)
  app.put('/api/inspections/:id/photo-qa', requireAdmin, (req, res) => {
    try {
      const { id } = req.params;
      const { photoUrlOrSlot, photoQuality, accuracyType, adminNote, auditedBy } = req.body;
      if (!photoUrlOrSlot || !photoQuality || !accuracyType) {
        return res.status(400).json({
          success: false,
          error: 'photoUrlOrSlot, photoQuality, and accuracyType are required fields.',
        });
      }

      const updated = updateInspectionPhotoQa(id, photoUrlOrSlot, {
        photoQuality,
        accuracyType,
        adminNote,
        auditedBy: auditedBy || (req as any).user?.name || (req as any).user?.username || 'Admin',
        auditedAt: new Date().toISOString(),
      });

      if (!updated) {
        return res.status(404).json({ success: false, error: `Inspection ${id} not found.` });
      }

      res.json({ success: true, inspection: updated });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Get Driver QA & Mistake Pattern Report (Grouped by Depot and Driver)
  app.get('/api/admin/driver-qa-patterns', requireAdmin, (req, res) => {
    try {
      const { dateFrom, dateTo, depot, driverId } = req.query;
      const report = getDriverQaPatternReport({
        dateFrom: dateFrom as string,
        dateTo: dateTo as string,
        depot: depot as string,
        driverId: driverId as string,
      });
      res.json({ success: true, report });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Get Uninspected Drivers Audit Compliance Report (filter date, date range, depot, sort, and search)
  app.get('/api/admin/uninspected-drivers', requireAdmin, (req, res) => {
    try {
      const { date, dateFrom, dateTo, depot, search, designation, sortBy, sortOrder } = req.query;
      const report = getUninspectedDriversReport({
        date: date as string,
        dateFrom: dateFrom as string,
        dateTo: dateTo as string,
        depot: depot as string,
        search: search as string,
        designation: designation as string,
        sortBy: sortBy as any,
        sortOrder: sortOrder as any,
      });
      res.json({ success: true, ...report });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Seed sample QA Audits for testing pattern analytics
  app.post('/api/admin/driver-qa-seed', requireAdmin, (req, res) => {
    try {
      const result = seedSampleDriverQaAudits();
      res.json({ success: true, message: 'Sample driver QA audits successfully populated.', ...result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Clear all inspections (Admin & Master Password protected)
  app.delete('/api/inspections', requireAdmin, requireSecurityPassword, (req, res) => {
    try {
      clearAllInspections();
      res.json({ success: true, message: 'All inspections cleared. Vehicles reset to Pending Inspection.' });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });
}
