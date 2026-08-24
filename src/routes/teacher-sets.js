const { validateExamSetPayload, sendValidationError } = require('../validation');
const { checkExamReadiness } = require('../exam-readiness');
const { normalizeExamDateTime, haveAllExamSchedulesEnded } = require('../grading');

function normalizeSetSchedule(set) {
  set.availableFrom = normalizeExamDateTime(set.availableFrom) || null;
  set.availableUntil = normalizeExamDateTime(set.availableUntil) || null;
  set.examSchedules = (Array.isArray(set.examSchedules) ? set.examSchedules : []).map(schedule => ({ ...schedule, studentIds: [...new Set((Array.isArray(schedule?.studentIds) ? schedule.studentIds : []).map(value => String(value).trim()).filter(Boolean))], availableFrom: normalizeExamDateTime(schedule?.availableFrom) || '', availableUntil: normalizeExamDateTime(schedule?.availableUntil) || '' }));
  return set;
}

function registerTeacherSetRoutes(app, { readDB, writeDB, requireTeacher, examTypes, newId, applyAcademicPeriod }) {
  const owned = (db, key, teacherId) => db.sets.find(set => set.key === key && set.teacherId === teacherId);
  app.get('/api/teacher/sets', requireTeacher, (req, res) => res.json(readDB().sets.filter(set => set.teacherId === req.teacherId && !set.permanentlyDeletedAt)));
  app.get('/api/teacher/sets/:key/readiness', requireTeacher, (req, res) => { const set = owned(readDB(), req.params.key, req.teacherId); if (!set) return res.status(404).json({ error: 'not_found' }); res.json(checkExamReadiness(set)); });
  app.post('/api/teacher/sets', requireTeacher, async (req, res) => {
    const body = req.body; const errors = validateExamSetPayload(body);
    if (errors.length) return sendValidationError(res, errors);
    if (body.delivery === 'object-analysis-design') return res.status(403).json({ error: 'admin_only', message: 'การสร้างข้อสอบ DFD สงวนสิทธิ์สำหรับผู้ดูแลระบบ' });
    const now = new Date().toISOString(); const db = readDB(); const key = body.key || newId('set');
    const teacher = db.teachers.find(item => item.id === req.teacherId);
    const subjectTeacherName = teacher ? `${teacher.firstName} ${teacher.lastName}`.trim() : '';
    const set = normalizeSetSchedule({ ...body, key, educationLevel: body.educationLevel, teacherId: req.teacherId, subjectTeacherName, subjectTeacherDepartment: teacher?.department || '', subjectTeacherEmail: teacher?.email || '', examType: examTypes.includes(body.examType) ? body.examType : examTypes[0], assignedClasses: Array.isArray(body.assignedClasses) ? body.assignedClasses : [], publishMode: body.publishMode === 'auto' ? 'auto' : 'manual', delivery: null, createdAt: now, updatedAt: now });
    applyAcademicPeriod(set, db.settings); db.sets.push(set); await writeDB(db); res.status(201).json({ key, academicYear: set.academicYear || null, semester: set.semester || null, semesterLabel: set.semesterLabel || null });
  });
  app.put('/api/teacher/sets/:key', requireTeacher, async (req, res) => {
    const db = readDB(); const set = owned(db, req.params.key, req.teacherId); if (!set) return res.status(404).json({ error: 'not_found' });
    const errors = validateExamSetPayload(req.body, { allowKey: false });
    if (errors.length) return sendValidationError(res, errors);
    const teacher = db.teachers.find(item => item.id === req.teacherId);
    const subjectTeacherName = teacher ? `${teacher.firstName} ${teacher.lastName}`.trim() : set.subjectTeacherName;
    Object.assign(set, { ...req.body, key: set.key, teacherId: set.teacherId, subjectTeacherName, subjectTeacherDepartment: teacher?.department || '', subjectTeacherEmail: teacher?.email || '', examType: examTypes.includes(req.body.examType) ? req.body.examType : set.examType, assignedClasses: Array.isArray(req.body.assignedClasses) ? req.body.assignedClasses : [], updatedAt: new Date().toISOString() });
    normalizeSetSchedule(set);
    applyAcademicPeriod(set, db.settings); await writeDB(db); res.json({ ok: true, academicYear: set.academicYear || null, semester: set.semester || null, semesterLabel: set.semesterLabel || null });
  });
  app.post('/api/teacher/sets/:key/quick-open', requireTeacher, async (req, res) => {
    const db = readDB(); const set = owned(db, req.params.key, req.teacherId);
    if (!set) return res.status(404).json({ error: 'not_found' });
    set.quickOpen = req.body?.open !== false;
    set.quickOpenedAt = set.quickOpen ? new Date().toISOString() : null;
    set.updatedAt = new Date().toISOString();
    await writeDB(db);
    res.json({ ok: true, quickOpen: set.quickOpen, quickOpenedAt: set.quickOpenedAt });
  });
  app.post('/api/teacher/sets/:key/open-absentees', requireTeacher, async (req, res) => {
    const db=readDB(),set=owned(db,req.params.key,req.teacherId);if(!set)return res.status(404).json({error:'not_found'});
    const schedules=(set.examSchedules||[]).filter(item=>!item.absenceOnly);
    if(!haveAllExamSchedulesEnded(schedules))return res.status(409).json({error:'exam_not_finished',message:'เปิดให้ผู้ขาดสอบได้หลังหมดเวลาสอบทุกรอบแล้ว'});
    const eligible=new Set();schedules.forEach(schedule=>{db.students.filter(student=>(schedule.classes||[]).includes(student.classRoom)||(schedule.studentIds||[]).some(value=>String(value)===String(student.studentId))).forEach(student=>eligible.add(String(student.studentId)));});
    db.results.filter(result=>result.questionKey===set.key&&result.attemptType!=='resit').forEach(result=>eligible.delete(String(result.studentId)));
    const hours=Math.min(72,Math.max(1,Number(req.body?.hours)||24)),now=new Date(),until=new Date(now.getTime()+hours*3600000);set.examSchedules=(set.examSchedules||[]).filter(item=>!item.absenceOnly);set.examSchedules.push({name:'รอบผู้ขาดสอบ',classes:['__ABSENCE_ONLY__'],studentIds:[...eligible],availableFrom:now.toISOString(),availableUntil:until.toISOString(),lateAccessCode:'',absenceOnly:true});set.updatedAt=now.toISOString();await writeDB(db);res.json({ok:true,count:eligible.size,availableUntil:until.toISOString()});
  });
  app.post('/api/teacher/sets/:key/duplicate', requireTeacher, async (req, res) => {
    const db = readDB(); const set = owned(db, req.params.key, req.teacherId); if (!set) return res.status(404).json({ error: 'not_found' });
    const copy = JSON.parse(JSON.stringify(set)); copy.key = newId('set'); copy.title += ' (สำเนา)'; copy.archived = false; copy.quickOpen = false; copy.quickOpenedAt = null; delete copy.archivedAt; copy.academicYear = null; copy.semester = null; copy.semesterLabel = null; copy.assignedClasses = []; copy.examSchedules = []; copy.availableFrom = null; copy.availableUntil = null; copy.lateAccessCode = ''; copy.resitAccesses = []; copy.createdAt = copy.updatedAt = new Date().toISOString(); db.sets.push(copy); await writeDB(db); res.status(201).json({ key: copy.key });
  });
  app.post('/api/teacher/sets/:key/archive', requireTeacher, async (req, res) => {
    const db = readDB(); const set = owned(db, req.params.key, req.teacherId); if (!set) return res.status(404).json({ error: 'not_found' });
    set.archived = true; set.quickOpen = false; set.quickOpenedAt = null; set.archivedAt = set.updatedAt = new Date().toISOString(); await writeDB(db); res.json({ ok: true });
  });
  app.post('/api/teacher/sets/:key/restore', requireTeacher, async (req, res) => {
    const db = readDB(); const set = owned(db, req.params.key, req.teacherId); if (!set) return res.status(404).json({ error: 'not_found' });
    set.archived = false; delete set.archivedAt; delete set.deletedAt; delete set.deletedBy; set.updatedAt = new Date().toISOString(); await writeDB(db); res.json({ ok: true });
  });
  app.delete('/api/teacher/sets/:key', requireTeacher, async (req, res) => {
    const db = readDB(); const set = owned(db, req.params.key, req.teacherId);
    if (!set) return res.status(404).json({ error: 'not_found' });
    const now = new Date().toISOString();
    set.archived = true; set.quickOpen = false; set.quickOpenedAt = null; set.archivedAt = now; set.deletedAt = now; set.deletedBy = 'teacher'; set.updatedAt = now;
    await writeDB(db); res.json({ ok: true, recoverable: true });
  });

  app.delete('/api/teacher/sets/:key/permanent', requireTeacher, async (req, res) => {
    const db = readDB(); const index = db.sets.findIndex(item => item.key === req.params.key && item.teacherId === req.teacherId);
    if (index < 0) return res.status(404).json({ error: 'not_found' });
    if (!db.sets[index].deletedAt) return res.status(409).json({ error: 'not_in_trash', message: 'ต้องย้ายชุดข้อสอบไปถังขยะก่อนลบถาวร' });
    const draftCount = db.drafts.filter(item => item.questionKey === req.params.key).length;
    db.sets[index].permanentlyDeletedAt = new Date().toISOString();
    db.sets[index].updatedAt = db.sets[index].permanentlyDeletedAt;
    db.drafts = db.drafts.filter(item => item.questionKey !== req.params.key);
    await writeDB(db); res.json({ ok: true, permanent: true, preservedResults: db.results.filter(item => item.questionKey === req.params.key).length, deletedDrafts: draftCount });
  });
}
module.exports = { registerTeacherSetRoutes };
