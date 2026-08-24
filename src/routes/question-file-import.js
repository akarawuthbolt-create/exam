const express = require('express');
const { parseQuestionFile } = require('../question-file-import');

function registerQuestionFileImportRoutes(app, { requireAdmin }) {
  app.post('/api/admin/question-file/preview', requireAdmin, express.raw({ type: ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/plain', 'application/octet-stream'], limit: '10mb' }), async (req, res) => {
    if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: 'invalid_file', message: 'กรุณาเลือกไฟล์ข้อสอบ' });
    try {
      const filename = decodeURIComponent(String(req.get('x-file-name') || 'question-file'));
      if (filename.length > 255 || /[\\/\0]/.test(filename)) return res.status(400).json({ error: 'invalid_file', message: 'ชื่อไฟล์ไม่ถูกต้อง' });
      res.json(await parseQuestionFile(req.body, filename));
    }
    catch (error) { res.status(400).json({ error: 'question_file_parse_failed', message: error.message || 'ไม่สามารถอ่านข้อสอบจากไฟล์นี้ได้' }); }
  });
}

module.exports = { registerQuestionFileImportRoutes };
