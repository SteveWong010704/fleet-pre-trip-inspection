import express from 'express';
import {
  getVehicles, getVehicleByPlate, updateVehicle, createVehicle, deleteVehicle,
  regenerateVehicleQrToken, bulkImportVehicles,
} from '../storage';
import { requireAdmin, requireSecurityPassword, tryGetAuthUser } from '../http/security';

export function registerVehicleRoutes(app: express.Express) {
  // Vehicles list with filters (Mask sensitive fuel PIN and QR security token for non-admins)
  app.get('/api/vehicles', (req, res) => {
    try {
      const authUser = tryGetAuthUser(req);
      const isAdmin = authUser?.role === 'admin';
      const { branch, status, search } = req.query;
      const rawVehicles = getVehicles({
        branch: branch as string,
        status: status as string,
        search: search as string,
      });
      const vehicles = isAdmin
        ? rawVehicles
        : rawVehicles.map((v) => ({ ...v, pinNo: '****' }));
      res.json({ success: true, count: vehicles.length, vehicles });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Verify Vehicle QR Code endpoint
  app.get('/api/vehicles/verify-qr', (req, res) => {
    try {
      const plate = ((req.query.plate as string) || '').trim().toUpperCase();
      const token = (
        (req.query.token as string) ||
        (req.query.qrToken as string) ||
        (req.query.t as string) ||
        ''
      ).trim().toUpperCase();

      if (!plate || !token) {
        return res.status(400).json({
          success: false,
          valid: false,
          message: 'Both vehicle plate and QR security token are required for verification',
        });
      }

      const vehicle = getVehicleByPlate(plate);
      if (!vehicle) {
        return res.status(404).json({
          success: false,
          valid: false,
          message: `Vehicle ${plate} was not found in fleet roster`,
        });
      }

      const isValid = Boolean(vehicle.qrToken && vehicle.qrToken.toUpperCase() === token);
      if (!isValid) {
        return res.status(403).json({
          success: false,
          valid: false,
          message: 'Invalid or expired QR security token. Please scan the genuine vehicle windshield decal.',
        });
      }

      const safeVehicle = {
        ...vehicle,
        pinNo: '****',
      };

      return res.json({
        success: true,
        valid: true,
        vehicle: safeVehicle,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Vehicle by plate (Checks QR security token when supplied)
  app.get('/api/vehicles/:plate', (req, res) => {
    try {
      const authUser = tryGetAuthUser(req);
      const isAdmin = authUser?.role === 'admin';
      const vehicle = getVehicleByPlate(req.params.plate);
      if (!vehicle) {
        return res.status(404).json({ success: false, message: 'Vehicle not found' });
      }

      const queryToken = (
        (req.query.token as string) ||
        (req.query.qrToken as string) ||
        (req.query.t as string) ||
        ''
      ).trim().toUpperCase();

      const isTokenMatched = Boolean(
        vehicle.qrToken && queryToken && vehicle.qrToken.toUpperCase() === queryToken
      );

      if (isAdmin) {
        return res.json({ success: true, vehicle, qrVerified: true });
      }

      const safeVehicle = {
        ...vehicle,
        pinNo: '****',
        qrToken: isTokenMatched ? vehicle.qrToken : '****',
      };

      res.json({
        success: true,
        vehicle: safeVehicle,
        qrVerified: isTokenMatched,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Regenerate static QR token for vehicle (Admin & Master Password protected)
  app.post('/api/vehicles/:plate/regenerate-qr-token', requireAdmin, requireSecurityPassword, (req, res) => {
    try {
      const updated = regenerateVehicleQrToken(req.params.plate);
      if (!updated) {
        return res.status(404).json({ success: false, message: 'Vehicle not found' });
      }
      res.json({ success: true, vehicle: updated });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Create single vehicle (Admin only)
  app.post('/api/vehicles/create', requireAdmin, (req, res) => {
    try {
      const vehicleData = req.body;
      if (!vehicleData.vehicleNo) {
        return res.status(400).json({ success: false, message: 'Vehicle plate number is required' });
      }
      const created = createVehicle(vehicleData);
      res.json({ success: true, vehicle: created });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Update vehicle (Admin only)
  app.post('/api/vehicles/update', requireAdmin, (req, res) => {
    try {
      const { vehicleNo, updates } = req.body;
      if (!vehicleNo) {
        return res.status(400).json({ success: false, message: 'Vehicle plate is required' });
      }
      const updated = updateVehicle(vehicleNo, updates);
      if (!updated) {
        return res.status(404).json({ success: false, message: 'Vehicle not found' });
      }
      res.json({ success: true, vehicle: updated });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Delete vehicle (Admin only)
  app.delete('/api/vehicles/:plate', requireAdmin, (req, res) => {
    try {
      const deleted = deleteVehicle(req.params.plate);
      if (!deleted) {
        return res.status(404).json({ success: false, message: 'Vehicle not found' });
      }
      res.json({ success: true, message: `Vehicle ${req.params.plate} successfully deleted.` });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Bulk import vehicles (Admin only)
  app.post('/api/vehicles/bulk', requireAdmin, async (req, res) => {
    try {
      const { vehicles } = req.body;
      if (!Array.isArray(vehicles) || vehicles.length === 0) {
        return res.status(400).json({ success: false, message: 'Invalid vehicles array' });
      }
      const result = await bulkImportVehicles(vehicles);
      res.json({ success: true, ...result, message: `Successfully updated ${result.updated} and added ${result.added} vehicles.` });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });
}
