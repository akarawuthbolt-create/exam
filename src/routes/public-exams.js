const { activeResitAccess } = require('../resit');
const { checkExamReadiness } = require('../exam-readiness');
function registerPublicExamRoutes(app, { readDB, readDBView, examTypes, sanitizeSetForStudent, getExamSchedule, hasExamAccess, isPastDeadline, isBeforeStart, requireStudent }) {
  app.get('/api/exam-types', (req, res) => res.json(examTypes));

  app.get('/api/sets', requireStudent, (req, res) => {
    const db = readDBView ? readDBView() : readDB();
    const student = db.students.find(item => item.studentId === req.studentId);
    if (!student) return res.status(401).json({ error: 'unauthorized' });
    const sets = db.sets
      .map(set => ({ set, resit: activeResitAccess(set, student.studentId) }))
      .filter(({ set, resit }) => !set.archived && checkExamReadiness(set).ready && (!set.delivery || set.delivery === 'object-analysis-design') && (resit || (hasExamAccess(set, student.classRoom, student.studentId) && !isBeforeStart(set, student.classRoom, student.studentId) && !isPastDeadline(set, student.classRoom, student.studentId))))
      .map(({ set, resit }) => Object.assign(sanitizeSetForStudent(set, student.classRoom, student.studentId), { delivery: set.delivery || null }, resit ? { accessMode: 'resit', resitAccessId: resit.id, availableFrom: resit.availableFrom, availableUntil: resit.availableUntil, lateAccessRequired: false, resitScoreMax: resit.scoreMax } : {}));
    res.json(sets);
  });

  app.post('/api/sets/:key/verify-late-code', requireStudent, (req, res) => {
    const db = readDB();
    const student = db.students.find(item => item.studentId === req.studentId);
    const set = db.sets.find(item => item.key === req.params.key);
    if (!set) return res.status(404).json({ ok: false });
    if (!student || set.archived || set.delivery || !hasExamAccess(set, student.classRoom, student.studentId)) return res.status(403).json({ ok: false });
    if (!isPastDeadline(set, student.classRoom, student.studentId)) return res.json({ ok: true });
    const schedule=getExamSchedule(set, student.classRoom, student.studentId);
    res.json({ ok: !!schedule?.lateAccessCode && (req.body && req.body.code || '') === schedule.lateAccessCode });
  });
}

module.exports = { registerPublicExamRoutes };
