const express = require('express');

function uploadHandler(storage, ownerFor) {
  return async (req, res) => {
    try {
      const encodedName = req.get('x-file-name') || '';
      let fileName = encodedName;
      try { fileName = decodeURIComponent(encodedName); } catch (_) { /* use the original header */ }
      const asset = await storage.upload({ buffer: req.body, contentType: String(req.get('content-type') || '').split(';')[0].toLowerCase(), fileName, owner: ownerFor(req) });
      res.status(201).json(asset);
    } catch (error) {
      const serviceUnavailable = error.code === 'storage_not_configured' || error.code === 'storage_unreachable' || error.code === 'storage_bucket_failed';
      res.status(serviceUnavailable ? 503 : 400).json({ error: error.code || 'upload_failed', message: error.message });
    }
  };
}

function registerAssetRoutes(app, { requireAdmin, requireTeacher, assetStorage }) {
  const raw = express.raw({ type: () => true, limit: '5mb' });
  app.get('/api/admin/assets/status', requireAdmin, (req, res) => res.json({ configured: assetStorage.configured, maxBytes: assetStorage.maxBytes, allowedTypes: assetStorage.allowedTypes }));
  app.post('/api/admin/assets', requireAdmin, raw, uploadHandler(assetStorage, () => 'admin'));
  app.post('/api/teacher/assets', requireTeacher, raw, uploadHandler(assetStorage, req => `teacher-${req.teacherId}`));
}

module.exports = { registerAssetRoutes };
