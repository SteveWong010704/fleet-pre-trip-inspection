import express from 'express';
import {
  getDrivers, verifyDriverLogin, updateDriver, createDriver, deleteDriver,
  bulkImportDrivers, unlockDriver,
} from '../storage';
import { passwordForStorage } from '../passwordHash';
import { requireAdmin, authRateLimiter, signToken, tryGetAuthUser } from '../http/security';

export function registerDriverRoutes(app: express.Express) {
  // Drivers list (Requires authentication; unauthenticated requests only receive count)
  app.get('/api/drivers', (req, res) => {
    try {
      const authUser = tryGetAuthUser(req);
      const { depot, status, search } = req.query;
      const drivers = getDrivers({
        depot: depot as string,
        status: status as string,
        search: search as string,
      });

      if (!authUser) {
        // Unauthenticated caller (e.g. login screen displaying total active drivers)
        return res.json({ success: true, count: drivers.length, drivers: [] });
      }

      // Hide sensitive password fields from all API responses
      const safeDrivers = drivers.map(({ password, ...rest }) => rest);
      res.json({ success: true, count: safeDrivers.length, drivers: safeDrivers });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Create single driver (Admin only)
  app.post('/api/drivers/create', requireAdmin, async (req, res) => {
    try {
      const driverData = { ...req.body };
      if (!driverData.name && !driverData.employeeId && !driverData.loginId) {
        return res.status(400).json({ success: false, message: 'Driver details required' });
      }
      if (driverData.password) driverData.password = await passwordForStorage(String(driverData.password));
      const { password: _pw, ...created } = createDriver(driverData);
      res.json({ success: true, driver: created });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Update driver (Admin only)
  app.post('/api/drivers/update', requireAdmin, async (req, res) => {
    try {
      const { identifier, updates, originalIdentifier, originalEmployeeId, originalLoginId } = req.body;
      const targetId = originalIdentifier || originalEmployeeId || originalLoginId || identifier;
      if (!targetId) {
        return res.status(400).json({ success: false, message: 'Driver identifier is required' });
      }
      const safeUpdates = { ...(updates || {}) };
      if (safeUpdates.password) safeUpdates.password = await passwordForStorage(String(safeUpdates.password));
      const updated = updateDriver(targetId, safeUpdates, {
        originalEmployeeId,
        originalLoginId,
        fallbackIdentifier: identifier,
      });
      if (!updated) {
        return res.status(404).json({ success: false, message: 'Driver not found' });
      }
      const { password: _pw, ...safeUpdated } = updated;
      res.json({ success: true, driver: safeUpdated });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Delete driver (Admin only)
  app.delete('/api/drivers/:id', requireAdmin, (req, res) => {
    try {
      const deleted = deleteDriver(req.params.id);
      if (!deleted) {
        return res.status(404).json({ success: false, message: 'Driver not found' });
      }
      res.json({ success: true, message: `Driver ${req.params.id} successfully removed.` });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Driver Authentication (with brute-force protection & JWT token issuance)
  app.post('/api/drivers/login', authRateLimiter, async (req, res) => {
    try {
      const { loginId, password } = req.body;
      if (!loginId) {
        return res.status(400).json({ success: false, message: 'Driver ID is required' });
      }
      const result = await verifyDriverLogin(String(loginId), String(password || ''));
      if (!result.success || !result.driver) {
        return res.status(401).json(result);
      }
      const token = signToken({
        sub: result.driver.employeeId || result.driver.loginId,
        name: result.driver.name,
        role: 'driver',
      });
      // Never send the password (or its hash) back to the client
      const { password: _omitPassword, ...safeDriver } = result.driver;
      res.json({ ...result, driver: safeDriver, token });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Unlock driver account (Admin only)
  app.post('/api/drivers/unlock', requireAdmin, (req, res) => {
    try {
      const { identifier } = req.body;
      if (!identifier) {
        return res.status(400).json({ success: false, message: 'Driver identifier is required' });
      }
      const result = unlockDriver(identifier);
      if (!result.success) {
        return res.status(404).json(result);
      }
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Bulk import drivers (Admin only)
  app.post('/api/drivers/bulk', requireAdmin, async (req, res) => {
    try {
      const { drivers } = req.body;
      if (!Array.isArray(drivers) || drivers.length === 0) {
        return res.status(400).json({ success: false, message: 'Invalid drivers array' });
      }
      const result = await bulkImportDrivers(drivers);
      res.json({ success: true, ...result, message: `Successfully updated ${result.updated} and added ${result.added} drivers.` });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });
}
