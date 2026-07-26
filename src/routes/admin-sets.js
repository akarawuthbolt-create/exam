const { validateExamSetPayload, sendValidationError } = require('../validation');
const { checkExamReadiness } = require('../exam-readiness');
const { normalizeExamDateTime } = require('../grading');

const normalizeSchedules = schedules => (Array.isArray(schedules) ? schedules : []).map(schedule => ({ ...schedule, studentIds: [...new Set((Array.isArray(schedule?.studentIds) ? schedule.studentIds : []).map(value => String(value).trim()).filter(Boolean))], availableFrom: normalizeExamDateTime(schedule?.availableFrom) || '', availableUntil: normalizeExamDateTime(schedule?.availableUntil) || '' }));

function registerAdminSetRoutes(app, { readDB, writeDB, requireAdmin, examTypes, newId, applyAcademicPeriod }) {
  app.get('/api/admin/sets', requireAdmin, (req, res) => res.json(readDB().sets));
  app.get('/api/admin/sets/:key/readiness', requireAdmin, (req, res) => { const set = readDB().sets.find(item => item.key === req.params.key); if (!set) return res.status(404).json({ error: 'not_found' }); res.json(checkExamReadiness(set)); });

  app.post('/api/sets', requireAdmin, async (req, res) => {
    const body = req.body;
    const errors = validateExamSetPayload(body);
    if (errors.length) return sendValidationError(res, errors);
    const db = readDB(); const key = body.key || newId('set'); const now = new Date().toISOString();
    const set = { key, title: body.title, courseName: body.courseName || body.title, educationLevel: body.educationLevel, tagline: body.tagline || '', desc: body.desc || '', examType: examTypes.includes(body.examType) ? body.examType : examTypes[0], teacherId: body.teacherId || null, assignedClasses: Array.isArray(body.assignedClasses) ? body.assignedClasses : [], examSchedules: normalizeSchedules(body.examSchedules), subjectTeacherName: body.subjectTeacherName || '', subjectTeacherDepartment: body.subjectTeacherDepartment || '', subjectTeacherEmail: body.subjectTeacherEmail || '', shuffleQuestions: !!body.shuffleQuestions, shuffleChoices: !!body.shuffleChoices, publishMode: body.publishMode === 'auto' ? 'auto' : 'manual', delivery: body.delivery === 'object-analysis-design' ? 'object-analysis-design' : null, availableFrom: normalizeExamDateTime(body.availableFrom) || null, availableUntil: normalizeExamDateTime(body.availableUntil) || null, lateAccessCode: body.lateAccessCode || '', sections: body.sections, createdAt: now, updatedAt: now };
    applyAcademicPeriod(set, db.settings); db.sets.push(set);
    await writeDB(db); res.status(201).json({ key });
  });

  app.put('/api/sets/:key', requireAdmin, async (req, res) => {
    const db = readDB(); const index = db.sets.findIndex(set => set.key === req.params.key);
    if (index === -1) return res.status(404).json({ error: 'not_found' });
    const body = req.body; const old = db.sets[index]; const errors = validateExamSetPayload(body, { allowKey: false });
    if (errors.length) return sendValidationError(res, errors);
    db.sets[index] = Object.assign({}, old, { title: body.title, courseName: body.courseName || body.title, educationLevel: body.educationLevel, tagline: body.tagline || '', desc: body.desc || '', examType: examTypes.includes(body.examType) ? body.examType : (old.examType || examTypes[0]), teacherId: body.teacherId !== undefined ? body.teacherId : old.teacherId, assignedClasses: Array.isArray(body.assignedClasses) ? body.assignedClasses : [], examSchedules: normalizeSchedules(body.examSchedules), subjectTeacherName: body.subjectTeacherName || '', subjectTeacherDepartment: body.subjectTeacherDepartment || '', subjectTeacherEmail: body.subjectTeacherEmail || '', shuffleQuestions: !!body.shuffleQuestions, shuffleChoices: !!body.shuffleChoices, publishMode: body.publishMode === 'auto' ? 'auto' : 'manual', availableFrom: normalizeExamDateTime(body.availableFrom) || null, availableUntil: normalizeExamDateTime(body.availableUntil) || null, lateAccessCode: body.lateAccessCode || '', sections: body.sections, updatedAt: new Date().toISOString() });
    applyAcademicPeriod(db.sets[index], db.settings);
    await writeDB(db); res.json({ ok: true });
  });

  app.post('/api/sets/:key/quick-open', requireAdmin, async (req, res) => {
    const db = readDB(); const set = db.sets.find(item => item.key === req.params.key);
    if (!set) return res.status(404).json({ error: 'not_found' });
    set.quickOpen = req.body?.open !== false;
    set.quickOpenedAt = set.quickOpen ? new Date().toISOString() : null;
    set.updatedAt = new Date().toISOString();
    await writeDB(db);
    res.json({ ok: true, quickOpen: set.quickOpen, quickOpenedAt: set.quickOpenedAt });
  });
  app.post('/api/sets/:key/open-absentees', requireAdmin, async (req, res) => {
    const db=readDB(),set=db.sets.find(item=>item.key===req.params.key);if(!set)return res.status(404).json({error:'not_found'});
    const schedules=(set.examSchedules||[]).filter(item=>!item.absenceOnly),ends=schedules.map(item=>item.availableUntil?new Date(item.availableUntil).getTime():NaN).filter(Number.isFinite);
    if(!ends.length||ends.length!==schedules.length||Math.max(...ends)>=Date.now())return res.status(409).json({error:'exam_not_finished',message:'เปิดให้ผู้ขาดสอบได้หลังหมดเวลาสอบทุกรอบแล้ว'});
    const eligible=new Set();schedules.forEach(schedule=>{db.students.filter(student=>(schedule.classes||[]).includes(student.classRoom)||(schedule.studentIds||[]).includes(student.studentId)).forEach(student=>eligible.add(student.studentId));});
    db.results.filter(result=>result.questionKey===set.key&&result.attemptType!=='resit').forEach(result=>eligible.delete(result.studentId));
    const hours=Math.min(72,Math.max(1,Number(req.body?.hours)||24)),now=new Date(),until=new Date(now.getTime()+hours*3600000);set.examSchedules=(set.examSchedules||[]).filter(item=>!item.absenceOnly);set.examSchedules.push({name:'รอบผู้ขาดสอบ',classes:['__ABSENCE_ONLY__'],studentIds:[...eligible],availableFrom:now.toISOString(),availableUntil:until.toISOString(),lateAccessCode:'',absenceOnly:true});set.updatedAt=now.toISOString();await writeDB(db);res.json({ok:true,count:eligible.size,availableUntil:until.toISOString()});
  });

  app.post('/api/sets/:key/duplicate', requireAdmin, async (req, res) => {
    const db = readDB(); const original = db.sets.find(set => set.key === req.params.key);
    if (!original) return res.status(404).json({ error: 'not_found' });
    const copy = JSON.parse(JSON.stringify(original)); copy.key = newId('set'); copy.title = `${original.title} (สำเนา)`; copy.archived = false; copy.quickOpen = false; copy.quickOpenedAt = null; delete copy.archivedAt; copy.academicYear = null; copy.semester = null; copy.semesterLabel = null; copy.assignedClasses = []; copy.examSchedules = []; copy.availableFrom = null; copy.availableUntil = null; copy.lateAccessCode = ''; copy.resitAccesses = []; copy.createdAt = new Date().toISOString(); copy.updatedAt = copy.createdAt;
    db.sets.push(copy); await writeDB(db); res.status(201).json({ key: copy.key });
  });

  app.post('/api/sets/:key/archive', requireAdmin, async (req, res) => {
    const db = readDB(); const set = db.sets.find(item => item.key === req.params.key);
    if (!set) return res.status(404).json({ error: 'not_found' });
    set.archived = true; set.quickOpen = false; set.quickOpenedAt = null; set.archivedAt = new Date().toISOString(); set.updatedAt = set.archivedAt;
    await writeDB(db); res.json({ ok: true });
  });

  app.post('/api/sets/:key/restore', requireAdmin, async (req, res) => {
    const db = readDB(); const set = db.sets.find(item => item.key === req.params.key);
    if (!set) return res.status(404).json({ error: 'not_found' });
    set.archived = false; delete set.archivedAt; delete set.deletedAt; delete set.deletedBy; set.updatedAt = new Date().toISOString();
    await writeDB(db); res.json({ ok: true });
  });

  app.delete('/api/sets/:key', requireAdmin, async (req, res) => {
    const db = readDB(); const set = db.sets.find(item => item.key === req.params.key);
    if (!set) return res.status(404).json({ error: 'not_found' });
    const now = new Date().toISOString();
    set.archived = true; set.quickOpen = false; set.quickOpenedAt = null; set.archivedAt = now; set.deletedAt = now; set.deletedBy = 'admin'; set.updatedAt = now;
    await writeDB(db); res.json({ ok: true, recoverable: true });
  });

  app.delete('/api/sets/:key/permanent', requireAdmin, async (req, res) => {
    const db = readDB(); const index = db.sets.findIndex(item => item.key === req.params.key);
    if (index < 0) return res.status(404).json({ error: 'not_found' });
    if (!db.sets[index].deletedAt) return res.status(409).json({ error: 'not_in_trash', message: 'ต้องย้ายชุดข้อสอบไปถังขยะก่อนลบถาวร' });
    const resultCount = db.results.filter(item => item.questionKey === req.params.key).length;
    const draftCount = db.drafts.filter(item => item.questionKey === req.params.key).length;
    db.sets.splice(index, 1);
    db.results = db.results.filter(item => item.questionKey !== req.params.key);
    db.drafts = db.drafts.filter(item => item.questionKey !== req.params.key);
    await writeDB(db); res.json({ ok: true, permanent: true, deletedResults: resultCount, deletedDrafts: draftCount });
  });
}
module.exports = { registerAdminSetRoutes };
