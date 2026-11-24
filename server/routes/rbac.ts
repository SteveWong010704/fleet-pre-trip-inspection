import express from 'express';
import {
  getRbacRoles, createRbacRole, updateRbacRole, deleteRbacRole,
  getRbacUsers, createRbacUser, updateRbacUser, deleteRbacUser,
} from '../storage';
import { ADMIN_FEATURES } from '../../src/types';
import { requireAdmin } from '../http/security';

export function registerRbacRoutes(app: express.Express) {
  // ================= RBAC & USER MANAGEMENT ENDPOINTS =================
  app.get('/api/rbac/features', requireAdmin, (req, res) => {
    res.json({ success: true, features: ADMIN_FEATURES });
  });

  app.get('/api/rbac/roles', requireAdmin, (req, res) => {
    try {
      const roles = getRbacRoles();
      res.json({ success: true, roles });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/rbac/roles', requireAdmin, (req, res) => {
    try {
      const { name, description, permissions } = req.body;
      const role = createRbacRole({ name, description, permissions });
      res.status(201).json({ success: true, role });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  app.put('/api/rbac/roles/:id', requireAdmin, (req, res) => {
    try {
      const { name, description, permissions } = req.body;
      const role = updateRbacRole(req.params.id, { name, description, permissions });
      res.json({ success: true, role });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  app.delete('/api/rbac/roles/:id', requireAdmin, (req, res) => {
    try {
      const success = deleteRbacRole(req.params.id);
      res.json({ success });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  app.get('/api/rbac/users', requireAdmin, (req, res) => {
    try {
      const users = getRbacUsers();
      res.json({ success: true, users });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/rbac/users', requireAdmin, async (req, res) => {
    try {
      const { username, name, password, role, assignedDepot } = req.body;
      const user = await createRbacUser({ username, name, password, role, assignedDepot });
      res.status(201).json({ success: true, user });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  app.put('/api/rbac/users/:username', requireAdmin, async (req, res) => {
    try {
      const { name, password, role, assignedDepot, active } = req.body;
      const user = await updateRbacUser(req.params.username, { name, password, role, assignedDepot, active });
      res.json({ success: true, user });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  app.delete('/api/rbac/users/:username', requireAdmin, (req, res) => {
    try {
      const success = deleteRbacUser(req.params.username);
      res.json({ success });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  });
}
