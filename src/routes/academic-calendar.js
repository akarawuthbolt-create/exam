const { normalizeAcademicCalendar } = require('../academic-calendar');

function registerAcademicCalendarRoutes(app, { readDB, writeDB, requireAdmin, ADMIN_KEY, timingSafeStringEqual }) {
  app.get('/api/admin/academic-calendar', requireAdmin, (req, res) => {
    const settings = readDB().settings || {};
    res.json({ academicCalendar: settings.academicCalendar || [], locked: !!settings.academicCalendarLocked });
  });

  app.put('/api/admin/academic-calendar', requireAdmin, async (req, res) => {
    const academicCalendar = normalizeAcademicCalendar(req.body?.academicCalendar);
    if (!academicCalendar.length) return res.status(400).json({ error: 'invalid_payload', message: 'กรุณากำหนดปีการศึกษาและช่วงวันของภาคเรียนอย่างน้อย 1 รายการ' });
    const duplicateYears = academicCalendar.some((item, index) => academicCalendar.findIndex(other => other.academicYear === item.academicYear) !== index);
    if (duplicateYears) return res.status(400).json({ error: 'invalid_payload', message: 'ปีการศึกษาซ้ำกัน' });
    const invalidOverlap = academicCalendar.some(year => year.terms.some((term, index) => year.terms.slice(index + 1).some(other => term.startsOn <= other.endsOn && other.startsOn <= term.endsOn)));
    if (invalidOverlap) return res.status(400).json({ error: 'invalid_payload', message: 'ช่วงวันของภาคเรียนซ้อนกัน' });
    const db = readDB();
    if (db.settings?.academicCalendarLocked && !timingSafeStringEqual(req.body?.adminPassword, ADMIN_KEY)) return res.status(403).json({ error: 'reauth_required', message: 'กรุณายืนยันรหัสแอดมินก่อนแก้ไขปฏิทิน' });
    db.settings = { ...(db.settings || {}), academicCalendar, academicCalendarLocked: true };
    await writeDB(db);
    res.json({ ok: true, academicCalendar });
  });
}

module.exports = { registerAcademicCalendarRoutes };
