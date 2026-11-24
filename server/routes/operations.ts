import express from 'express';
import {
  getRegions, createRegion, updateRegion, deleteRegion,
  getDepots, createDepot, updateDepot, deleteDepot,
  getRoutes, createRoute, updateRoute, deleteRoute, syncRoutes,
} from '../storage';
import { requireAuth, requireAdmin } from '../http/security';

export function registerOperationsRoutes(app: express.Express) {
  // ----------------- OPERATIONS HIERARCHY API (REGIONS, DEPOTS, ROUTES) -----------------
  app.get('/api/operations/regions', requireAuth, (req, res) => {
    try {
      res.json({ success: true, data: getRegions() });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/operations/regions', requireAdmin, (req, res) => {
    try {
      const created = createRegion(req.body);
      res.json({ success: true, data: created });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  app.put('/api/operations/regions/:id', requireAdmin, (req, res) => {
    try {
      const updated = updateRegion(req.params.id, req.body);
      res.json({ success: true, data: updated });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  app.delete('/api/operations/regions/:id', requireAdmin, (req, res) => {
    try {
      const deleted = deleteRegion(req.params.id);
      res.json({ success: true, deleted });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  app.get('/api/operations/depots', requireAuth, (req, res) => {
    try {
      res.json({ success: true, data: getDepots() });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/operations/depots', requireAdmin, (req, res) => {
    try {
      const created = createDepot(req.body);
      res.json({ success: true, data: created });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  app.put('/api/operations/depots/:id', requireAdmin, (req, res) => {
    try {
      const updated = updateDepot(req.params.id, req.body);
      res.json({ success: true, data: updated });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  app.delete('/api/operations/depots/:id', requireAdmin, (req, res) => {
    try {
      const deleted = deleteDepot(req.params.id);
      res.json({ success: true, deleted });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  app.get('/api/operations/routes', requireAuth, (req, res) => {
    try {
      res.json({ success: true, data: getRoutes() });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/operations/routes', requireAdmin, (req, res) => {
    try {
      const created = createRoute(req.body);
      res.json({ success: true, data: created });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  app.put('/api/operations/routes/:id', requireAdmin, (req, res) => {
    try {
      const updated = updateRoute(req.params.id, req.body);
      res.json({ success: true, data: updated });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  app.delete('/api/operations/routes/:id', requireAdmin, (req, res) => {
    try {
      const deleted = deleteRoute(req.params.id);
      res.json({ success: true, deleted });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  app.post('/api/operations/routes/sync', requireAdmin, (req, res) => {
    try {
      const syncRes = syncRoutes();
      res.json({ success: true, ...syncRes });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });
}
