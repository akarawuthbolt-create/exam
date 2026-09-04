function registerSystemReportRoutes(app, { readDB, writeDB, requireTeacher, requireAdmin, newId }) {
  app.post('/api/teacher/system-reports', requireTeacher, async (req, res) => {
    const message = String(req.body?.message || '').trim();
    if (!message) return res.status(400).json({ error: 'invalid_payload', message: 'กรุณากรอกรายละเอียดปัญหา' });
    if (message.length > 2000) return res.status(400).json({ error: 'invalid_payload', message: 'ข้อความยาวเกินไป' });
    const db = readDB();
    const teacher = db.teachers.find(item => item.id === req.teacherId);
    const report = { id: newId('report'), teacherId: req.teacherId, teacherName: teacher ? `${teacher.firstName} ${teacher.lastName}` : 'ไม่ทราบชื่อ', message, createdAt: new Date().toISOString() };
    const reports = [report, ...(Array.isArray(db.settings.systemReports) ? db.settings.systemReports : [])].slice(0, 200);
    db.settings = { ...db.settings, systemReports: reports };
    await writeDB(db);
    res.status(201).json({ ok: true });
  });

  app.get('/api/admin/system-reports', requireAdmin, (req, res) => {
    const db = readDB();
    res.json(Array.isArray(db.settings.systemReports) ? db.settings.systemReports : []);
  });

  app.delete('/api/admin/system-reports/:id', requireAdmin, async (req, res) => {
    const db = readDB();
    const reports = (Array.isArray(db.settings.systemReports) ? db.settings.systemReports : []).filter(item => item.id !== req.params.id);
    db.settings = { ...db.settings, systemReports: reports };
    await writeDB(db);
    res.json({ ok: true });
  });
}
module.exports = { registerSystemReportRoutes };
