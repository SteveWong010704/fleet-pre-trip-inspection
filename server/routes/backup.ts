import express from 'express';
import fs from 'fs';
import path from 'path';
import {
  getBackupStatus,
  performDailyBackup,
  getBackupRootDir,
  getAdmZip,
  restoreFromBackupZip,
} from '../backupService';
import { requireAdmin, backupHeavyLimiter } from '../http/security';

export function registerBackupRoutes(app: express.Express) {
  // Automated Rolling Backup Endpoints (Admin only)
  app.get('/api/backup/status', requireAdmin, async (req, res) => {
    try {
      const status = await getBackupStatus();
      res.json({ success: true, ...status });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/backup/run', requireAdmin, backupHeavyLimiter, async (req, res) => {
    try {
      const result = await performDailyBackup('manual_admin_trigger');
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Download entire day's backup (Admin only)
  app.get('/api/backup/download/:date', requireAdmin, (req, res) => {
    try {
      const date = req.params.date;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ success: false, message: 'Invalid date format (expected YYYY-MM-DD)' });
      }

      const rootDir = path.resolve(getBackupRootDir());
      const zipPath = path.resolve(rootDir, `backup_${date}.zip`);
      const folderPath = path.resolve(rootDir, `backup_${date}`);

      if (!zipPath.startsWith(rootDir) || !folderPath.startsWith(rootDir)) {
        return res.status(403).json({ success: false, message: 'Access denied: invalid path traversal' });
      }

      if (fs.existsSync(zipPath)) {
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="fleet_backup_${date}.zip"`);
        return res.sendFile(zipPath);
      }

      if (fs.existsSync(folderPath)) {
        const AdmZipClass = getAdmZip();
        if (AdmZipClass) {
          const zip = new AdmZipClass();
          zip.addLocalFolder(folderPath);
          const zipBuffer = zip.toBuffer();
          res.setHeader('Content-Type', 'application/zip');
          res.setHeader('Content-Disposition', `attachment; filename="fleet_backup_${date}.zip"`);
          return res.send(zipBuffer);
        } else {
          return res.status(200).json({
            success: false,
            message: `Backup folder exists at ${folderPath}, but 'adm-zip' is not yet installed on this server to compress it on-the-fly. Please run 'npm install adm-zip' in your server console, or access the files directly in ${folderPath}.`,
          });
        }
      }

      return res.status(404).json({ success: false, message: `Backup archive for ${date} not found.` });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Download specific file from a day's backup (Admin only)
  app.get('/api/backup/file/:date/:filename', requireAdmin, (req, res) => {
    try {
      const { date, filename } = req.params;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ success: false, message: 'Invalid date format (expected YYYY-MM-DD)' });
      }

      const cleanFileName = path.basename(filename);
      const rootDir = path.resolve(getBackupRootDir());
      const filePath = path.resolve(rootDir, `backup_${date}`, cleanFileName);

      // Path traversal security check
      if (!filePath.startsWith(rootDir)) {
        return res.status(403).json({ success: false, message: 'Access denied: invalid file path' });
      }

      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ success: false, message: `File ${cleanFileName} not found in ${date} backup` });
      }

      if (cleanFileName.endsWith('.csv')) {
        res.setHeader('Content-Type', 'text/csv');
      } else if (cleanFileName.endsWith('.json')) {
        res.setHeader('Content-Type', 'application/json');
      } else {
        res.setHeader('Content-Type', 'text/plain');
      }

      res.setHeader('Content-Disposition', `attachment; filename="${cleanFileName}"`);
      return res.sendFile(filePath);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Serve or view backed-up photo from date archive (supports flat names or nested paths like plate/01_Tires_Wheels.jpg)
  app.get(['/api/backup/photos/:date/:photoName', '/api/backup/photos/:date/*'], (req, res) => {
    try {
      const date = req.params.date;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ success: false, message: 'Invalid date format' });
      }

      const rawParam = req.params.photoName || (req.params as any)[0] || '';
      const cleanParam = decodeURIComponent(rawParam).replace(/\\/g, '/');
      const rootDir = path.resolve(getBackupRootDir());
      const dayFolder = path.resolve(rootDir, `backup_${date}`);

      if (!dayFolder.startsWith(rootDir)) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }

      if (!fs.existsSync(dayFolder)) {
        return res.status(404).json({ success: false, message: 'Backup folder not found for date' });
      }

      // Candidate paths to check in priority order
      const candidatePaths = [
        path.resolve(dayFolder, 'upload', date, cleanParam),
        path.resolve(dayFolder, 'photos', cleanParam),
        path.resolve(dayFolder, cleanParam),
        path.resolve(dayFolder, 'photos', path.basename(cleanParam)),
      ];

      for (const p of candidatePaths) {
        // Enforce boundary check
        if (!p.startsWith(dayFolder)) continue;
        if (fs.existsSync(p) && fs.statSync(p).isFile()) {
          res.setHeader('Content-Type', 'image/jpeg');
          // Cache photo responses to avoid re-fetching
          res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
          return res.sendFile(p);
        }
      }

      // Fallback recursive search inside dayFolder by basename
      const baseName = path.basename(cleanParam);
      const findFileRecursive = (dir: string): string | null => {
        if (!fs.existsSync(dir)) return null;
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const full = path.resolve(dir, entry.name);
          if (!full.startsWith(dayFolder)) continue;
          if (entry.isDirectory()) {
            const found = findFileRecursive(full);
            if (found) return found;
          } else if (entry.isFile() && entry.name === baseName) {
            return full;
          }
        }
        return null;
      };

      const found = findFileRecursive(dayFolder);
      if (found) {
        res.setHeader('Content-Type', 'image/jpeg');
        res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
        return res.sendFile(found);
      }

      return res.status(404).json({ success: false, message: 'Photo not found in backup archive' });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Upload and restore from a day's backup ZIP archive (Admin only with rate limiting)
  app.post('/api/backup/restore', requireAdmin, backupHeavyLimiter, async (req, res) => {
    try {
      let zipBuffer: Buffer | null = null;
      let originalFilename = (req.headers['x-filename'] as string) || '';

      if (Buffer.isBuffer(req.body)) {
        zipBuffer = req.body;
      } else if (req.body && typeof req.body === 'object' && req.body.zipBase64) {
        zipBuffer = Buffer.from(req.body.zipBase64, 'base64');
        if (req.body.filename) originalFilename = req.body.filename;
      }

      if (!zipBuffer || zipBuffer.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No ZIP payload received. Please upload a valid .zip backup file.',
        });
      }

      if (originalFilename) {
        try {
          originalFilename = decodeURIComponent(originalFilename);
        } catch {}
      }

      const result = await restoreFromBackupZip(zipBuffer, originalFilename);
      res.json(result);
    } catch (err: any) {
      console.error('[Backup Restore Error]', err);
      res.status(500).json({ success: false, error: err.message || 'Failed to restore backup archive' });
    }
  });
}
