const express = require('express');
const { ExcelJS, addObjectSheet, workbookBuffer, worksheetMatrix } = require('../excel-workbook');
const { validateStudentPayload, sendValidationError } = require('../validation');
const { nextDraftRevision } = require('../draft-revision');

function findRecoverableExamDraft(db, payload, now = Date.now()) {
  const studentId = String(payload?.studentId || '').trim(), questionKey = String(payload?.questionKey || '').trim(), deviceId = String(payload?.deviceId || '');
  if (!studentId || !questionKey || !/^[a-z0-9_-]{12,80}$/i.test(deviceId)) return null;
  const examEndAt = value => {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : Date.parse(value);
  };
  return (db.drafts || []).find(draft => draft.studentId === studentId && draft.questionKey === questionKey && draft.deviceId === deviceId &&
    String(draft.resitAccessId || '') === String(payload?.resitAccessId || '') && Number.isFinite(examEndAt(draft.examEndTime)) && examEndAt(draft.examEndTime) + 15 * 60 * 1000 >= now) || null;
}

function registerStudentRoutes(app, { readDB, readDBView, writeDB, mutateDB, mutateExamDraft, requireAdmin, requireStudent, hashPassword, verifyPassword, createStudentSession, sessionStore }) {
  const findStudent = (students, studentId) => students.find(student => student.studentId === studentId.trim());
  const publicStudent = student => ({ studentId: student.studentId, firstName: student.firstName, lastName: student.lastName, classRoom: student.classRoom, examPeriod: student.examPeriod || '' });
  const pinRecoveryFailures = new Map();
  const pinRecoveryCleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of pinRecoveryFailures) {
      if (Math.max((entry.startedAt || 0) + 15 * 60 * 1000, entry.lockedUntil || 0) <= now) pinRecoveryFailures.delete(key);
    }
  }, 15 * 60 * 1000);
  pinRecoveryCleanupTimer.unref();
  const recoveryKey = req => req.ip || req.socket?.remoteAddress || 'unknown';
  const educationRank = room => /\.\s*\d+\s*\//.test(String(room || '')) ? 0 : 1;
  const byRoomThenStudentId = (a, b) => educationRank(a.classRoom) - educationRank(b.classRoom) || String(a.classRoom ?? '').localeCompare(String(b.classRoom ?? ''), 'th', { numeric: true }) || String(a.studentId ?? '').localeCompare(String(b.studentId ?? ''), 'th', { numeric: true });

  app.get('/api/students/import-template.xlsx', requireAdmin, async (req, res) => {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Exam System';
    const sheet = workbook.addWorksheet('รายชื่อนักเรียน');
    const headers = ['รหัสนักเรียน', 'ชื่อ', 'นามสกุล', 'ห้อง', 'รอบเรียน'];
    sheet.addRow(headers);
    sheet.addRow(['10001', 'สมชาย', 'ใจดี', 'ม.3/1', 'เช้า']);
    sheet.addRow(['10002', 'สมหญิง', 'รักเรียน', 'ม.3/1', '']);
    sheet.columns = [{ width: 16 }, { width: 18 }, { width: 18 }, { width: 14 }, { width: 12 }];
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    sheet.autoFilter = 'A1:E1';
    sheet.getRow(1).eachCell(cell => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });
    sheet.getRow(1).height = 24;

    const help = workbook.addWorksheet('คำอธิบาย');
    help.addRows([
      ['คอลัมน์', 'จำเป็น', 'รูปแบบข้อมูล'],
      ['รหัสนักเรียน', 'จำเป็น', 'ตัวเลข/ตัวอักษรไม่ซ้ำกัน ใช้ล็อกอินเข้าสอบ — รหัสซ้ำจะอัปเดตข้อมูลเดิมแทนการเพิ่มซ้ำโดยไม่ลบ PIN'],
      ['ชื่อ', 'จำเป็น', 'ชื่อนักเรียน'],
      ['นามสกุล', 'จำเป็น', 'นามสกุลนักเรียน'],
      ['ห้อง', 'จำเป็น', 'เช่น ม.3/1, ปวช.1/2'],
      ['รอบเรียน', 'ไม่บังคับ', 'เช้า หรือ บ่าย — เว้นว่างได้หากยังไม่กำหนด'],
      ['', '', 'กรอกข้อมูลต่อจากแถวตัวอย่างในชีต “รายชื่อนักเรียน” หรือลบแถวตัวอย่างก่อนนำเข้า']
    ]);
    help.columns = [{ width: 16 }, { width: 14 }, { width: 78 }];
    help.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    help.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
    help.getColumn(3).alignment = { wrapText: true, vertical: 'top' };

    const output = await workbookBuffer(workbook);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="student-import-template.xlsx"');
    res.send(output);
  });

  app.get('/api/students/export.xlsx', requireAdmin, async (req, res) => {
    const rows = readDB().students
      .sort(byRoomThenStudentId)
      .map(student => ({ 'รหัสนักเรียน': student.studentId, 'ชื่อ': student.firstName, 'นามสกุล': student.lastName, 'ห้อง': student.classRoom, 'รอบเรียน': student.examPeriod || '', 'ตั้ง PIN แล้ว': student.pinHash ? 'ใช่' : 'ไม่' }));
    const workbook = new ExcelJS.Workbook();
    addObjectSheet(workbook, 'รายชื่อนักเรียน', rows, ['รหัสนักเรียน', 'ชื่อ', 'นามสกุล', 'ห้อง', 'รอบเรียน', 'ตั้ง PIN แล้ว']);
    const output = await workbookBuffer(workbook);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="students.xlsx"');
    res.send(output);
  });

  app.get('/api/students/:studentId', (req, res) => {
    const student = findStudent(readDB().students, req.params.studentId);
    if (!student) return res.status(404).json({ error: 'not_found', message: 'ไม่พบรหัสนักเรียนนี้ในระบบ' });
    res.json({ ...publicStudent(student), hasPin: Boolean(student.pinHash) });
  });

  app.get('/api/student/session', requireStudent, (req, res) => {
    const student = findStudent((readDBView ? readDBView() : readDB()).students, req.studentId);
    if (!student) return res.status(401).json({ error: 'unauthorized' });
    res.json({ student: publicStudent(student) });
  });

  app.delete('/api/student/session', requireStudent, async (req, res) => {
    await sessionStore.remove('student', req.get('x-student-token'));
    res.json({ ok: true });
  });

  const draftId = (questionKey, resitAccessId) => `${questionKey}::${resitAccessId || 'normal'}`;
  const lockActive = draft => draft?.deviceId && new Date(draft.lockUntil || 0).getTime() > Date.now();
  const lockUntil = () => new Date(Date.now() + 90 * 1000).toISOString();
  const updateDraft = mutateExamDraft || ((key, updater) => mutateDB(db => {
    const current = db.drafts.find(item => item.draftKey === key) || null;
    const next = updater(current);
    db.drafts = db.drafts.filter(item => item.draftKey !== key);
    if (next) db.drafts.push(next);
    return next;
  }));
  app.post('/api/student/session/recover-exam', async (req, res) => {
    const db = readDBView ? readDBView() : readDB(), draft = findRecoverableExamDraft(db, req.body);
    if (!draft) return res.status(401).json({ error:'exam_session_unavailable', message:'ไม่สามารถกู้เซสชันสอบจากอุปกรณ์นี้ได้ กรุณายืนยัน PIN ใหม่' });
    const student = findStudent(db.students, draft.studentId);
    if (!student) return res.status(401).json({ error:'unauthorized' });
    res.json({ ok:true, token:await createStudentSession(student.studentId), student:publicStudent(student) });
  });
  app.post('/api/exam-drafts/:questionKey/claim', requireStudent, async (req, res) => {
    const db = readDBView ? readDBView() : readDB(); const deviceId = String(req.body?.deviceId || ''); const questionKey = String(req.params.questionKey || ''); const resitAccessId=req.body?.resitAccessId || null;
    if (!/^[a-z0-9_-]{12,80}$/i.test(deviceId) || !db.sets.some(set => set.key === questionKey)) return res.status(400).json({ error:'invalid_payload', message:'ไม่สามารถยืนยันอุปกรณ์สอบได้' });
    try {
      const key=`${req.studentId}::${draftId(questionKey,resitAccessId)}`;
      const draft = await updateDraft(key, current => {
        if(lockActive(current) && current.deviceId!==deviceId) { const error=new Error('active_on_other_device'); error.code='ACTIVE_OTHER_DEVICE'; throw error; }
        return {...(current||{}),revision:Number(current?.revision)||0,draftKey:key,studentId:req.studentId,questionKey,resitAccessId,deviceId,lockUntil:lockUntil(),savedAt:new Date().toISOString()};
      });
      res.json({ok:true,draft});
    } catch(error) {
      if(error.code==='ACTIVE_OTHER_DEVICE') return res.status(409).json({ error:'active_on_other_device', message:'กำลังทำข้อสอบนี้อยู่บนอุปกรณ์อื่น กรุณากลับไปทำต่อที่อุปกรณ์เดิม หรือรอประมาณ 2 นาทีหลังปิดอุปกรณ์เดิม' });
      throw error;
    }
  });
  app.get('/api/exam-drafts/:questionKey', requireStudent, (req, res) => {
    const db = readDBView ? readDBView() : readDB();
    const resitAccessId = req.query.resitAccessId || null;
    const submitted = db.results.some(result => result.studentId === req.studentId && result.questionKey === req.params.questionKey && (resitAccessId ? result.resitAccessId === resitAccessId : result.attemptType !== 'resit'));
    if (submitted) return res.json({ draft: null, submitted: true });
    const draft = db.drafts.find(item => item.draftKey === `${req.studentId}::${draftId(req.params.questionKey, req.query.resitAccessId)}`);
    res.json({ draft: draft || null, submitted: false });
  });
  app.put('/api/exam-drafts/:questionKey', requireStudent, async (req, res) => {
    const db = readDBView ? readDBView() : readDB(); const student = findStudent(db.students, req.studentId);
    const questionKey = String(req.params.questionKey || ''); const payload = req.body?.draft;
    if (!student || !db.sets.some(set => set.key === questionKey)) return res.status(404).json({ error: 'not_found' });
    if (!payload || typeof payload !== 'object' || JSON.stringify(payload).length > 250000) return res.status(400).json({ error: 'invalid_payload', message: 'ข้อมูลร่างข้อสอบไม่ถูกต้อง' });
    try {
      const key = `${student.studentId}::${draftId(questionKey, payload.resitAccessId)}`;
      const draft = await updateDraft(key, current => {
        const deviceId=String(payload.deviceId||'');
        if(lockActive(current) && current.deviceId!==deviceId) { const error=new Error('active_on_other_device'); error.code='ACTIVE_OTHER_DEVICE'; throw error; }
        const revision=nextDraftRevision(current,payload.revision);
        const next = { ...payload, revision, draftKey: key, studentId: student.studentId, questionKey, deviceId, lockUntil:lockUntil(), savedAt: new Date().toISOString() };
        return next;
      });
      res.json({ ok: true, savedAt: draft.savedAt, revision:draft.revision });
    } catch(error) {
      if(error.code==='ACTIVE_OTHER_DEVICE') return res.status(409).json({ error:'active_on_other_device', message:'อุปกรณ์นี้ไม่ได้รับสิทธิ์ทำข้อสอบ' });
      if(error.code==='DRAFT_CONFLICT') return res.status(409).json({ error:'draft_conflict', message:'มีคำตอบเวอร์ชันใหม่กว่าบนเซิร์ฟเวอร์', currentRevision:error.currentRevision });
      throw error;
    }
  });
  app.delete('/api/exam-drafts/:questionKey', requireStudent, async (req, res) => {
    const key = `${req.studentId}::${draftId(req.params.questionKey, req.query.resitAccessId)}`;
    await updateDraft(key, () => null);
    res.status(204).end();
  });

  app.post('/api/students/:studentId/set-pin', async (req, res) => {
    const db = readDB();
    const student = findStudent(db.students, req.params.studentId);
    if (!student) return res.status(404).json({ error: 'not_found', message: 'ไม่พบรหัสนักเรียนนี้ในระบบ' });
    if (student.pinHash) return res.status(409).json({ error: 'pin_already_set', message: 'ตั้ง PIN แล้ว กรุณาติดต่อผู้ดูแลระบบหากลืม PIN' });
    const pin = String(req.body?.pin || '').trim();
    if (!/^\d{4,6}$/.test(pin)) return res.status(400).json({ error: 'invalid_pin', message: 'PIN ต้องเป็นตัวเลข 4-6 หลัก' });
    student.pinHash = hashPassword(pin);
    student.pinFailedAttempts = 0;
    await writeDB(db);
    res.json({ ok: true, token: await createStudentSession(student.studentId), student: publicStudent(student) });
  });

  app.post('/api/students/:studentId/verify-pin', async (req, res) => {
    const db = readDB();
    const student = findStudent(db.students, req.params.studentId);
    if (!student) return res.status(404).json({ error: 'not_found', message: 'ไม่พบรหัสนักเรียนนี้ในระบบ' });
    if (!student.pinHash) return res.status(409).json({ error: 'pin_not_set', message: 'ยังไม่ได้ตั้ง PIN' });
    if ((student.pinFailedAttempts || 0) >= 5) return res.status(423).json({ error: 'pin_locked', message: 'PIN ถูกล็อก กรุณาใช้ “ลืม PIN” เพื่อตั้งใหม่' });

    const pin = String(req.body?.pin || '').trim();
    if (verifyPassword(pin, student.pinHash)) {
      student.pinFailedAttempts = 0;
      await writeDB(db);
      return res.json({ ok: true, token: await createStudentSession(student.studentId), student: publicStudent(student) });
    }
    student.pinFailedAttempts = (student.pinFailedAttempts || 0) + 1;
    await writeDB(db);
    const remainingAttempts = Math.max(0, 5 - student.pinFailedAttempts);
    res.json({ ok: false, remainingAttempts, locked: remainingAttempts === 0 });
  });

  // A student may recover a forgotten PIN using the name kept in the school's
  // roster.  The student ID has already been entered on the previous screen;
  // require both name fields and a new PIN in the same request.
  app.post('/api/students/:studentId/recover-pin', async (req, res) => {
    const db = readDB();
    const student = findStudent(db.students, req.params.studentId);
    const normalizeName = value => String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('th-TH');
    const key = recoveryKey(req); const prior = pinRecoveryFailures.get(key);
    if (prior?.lockedUntil > Date.now()) return res.status(429).json({ error: 'recovery_rate_limited', message: 'ลองยืนยันตัวตนหลายครั้งเกินไป กรุณารอ 15 นาที' });
    if (!student || normalizeName(req.body?.firstName) !== normalizeName(student.firstName) || normalizeName(req.body?.lastName) !== normalizeName(student.lastName)) {
      const failures = prior?.startedAt + 15 * 60 * 1000 > Date.now() ? prior : { count: 0, startedAt: Date.now() };
      failures.count += 1; if (failures.count >= 5) failures.lockedUntil = Date.now() + 15 * 60 * 1000;
      pinRecoveryFailures.set(key, failures);
      return res.status(401).json({ error: 'identity_mismatch', message: 'ชื่อหรือนามสกุลไม่ตรงกับข้อมูลในระบบ' });
    }
    const pin = String(req.body?.pin || '').trim();
    if (!/^\d{4,6}$/.test(pin)) return res.status(400).json({ error: 'invalid_pin', message: 'PIN ต้องเป็นตัวเลข 4-6 หลัก' });
    student.pinHash = hashPassword(pin);
    student.pinFailedAttempts = 0;
    pinRecoveryFailures.delete(key);
    await writeDB(db);
    res.json({ ok: true, token: await createStudentSession(student.studentId), student: publicStudent(student) });
  });

  app.post('/api/students/:studentId/reset-pin', requireAdmin, async (req, res) => {
    const db = readDB();
    const student = findStudent(db.students, req.params.studentId);
    if (!student) return res.status(404).json({ error: 'not_found' });
    delete student.pinHash;
    student.pinFailedAttempts = 0;
    await writeDB(db);
    res.json({ ok: true });
  });

  // Score lookup is intentionally available by student ID from the public score-check page.
  // Scores remain null until the teacher publishes them.
  app.get('/api/students/:studentId/results', (req, res) => {
    const results = readDB().results.filter(result => result.studentId === req.params.studentId.trim()).sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt)).map(result => ({ questionKey: result.questionKey, questionTitle: result.questionTitle, examType: result.examType, submittedAt: result.submittedAt, attemptType: result.attemptType || 'normal', resitScoreMax: result.resitScoreMax || null, published: !!result.published, overallScore20: result.published ? result.overallScore20 : null, convertedScore: result.published && result.attemptType === 'resit' ? result.convertedScore : null, sectionScores: result.published ? result.sectionScores : null }));
    res.json(results);
  });

  app.get('/api/students', requireAdmin, (req, res) => {
    let students = readDB().students;
    if (req.query.classRoom) students = students.filter(student => student.classRoom === req.query.classRoom);
    res.json([...students].sort(byRoomThenStudentId).map(student => ({ studentId: student.studentId, firstName: student.firstName, lastName: student.lastName, classRoom: student.classRoom, examPeriod: student.examPeriod || '', hasPin: Boolean(student.pinHash) })));
  });

  app.post('/api/students', requireAdmin, async (req, res) => {
    const body = req.body;
    const errors = validateStudentPayload(body);
    if (errors.length) return sendValidationError(res, errors);
    const db = readDB();
    const studentId = body.studentId.trim();
    if (db.students.some(student => student.studentId === studentId)) return res.status(409).json({ error: 'duplicate', message: 'มีรหัสนักเรียนนี้อยู่ในระบบแล้ว' });
    db.students.push({ studentId, firstName: body.firstName.trim(), lastName: body.lastName.trim(), classRoom: body.classRoom.trim(), examPeriod: ['เช้า','บ่าย','ทวิภาคี'].includes(body.examPeriod) ? body.examPeriod : '', pinFailedAttempts: 0, createdAt: new Date().toISOString() });
    await writeDB(db);
    res.status(201).json({ ok: true });
  });

  app.post('/api/students/bulk', requireAdmin, async (req, res) => {
    const lines = ((req.body && req.body.text) || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const db = readDB(); const byId = new Map(db.students.map(student => [student.studentId, student]));
    let imported = 0, updated = 0; const errors = [];
    lines.forEach((line, index) => {
      const [studentId, firstName, lastName, classRoom, examPeriod] = (line.includes('\t') ? line.split('\t') : line.split(',')).map(value => (value || '').trim());
      const validationErrors = validateStudentPayload({ studentId, firstName, lastName, classRoom });
      if (validationErrors.length) { errors.push(`บรรทัดที่ ${index + 1}: ${validationErrors.join(', ')}`); return; }
      if (byId.has(studentId)) { Object.assign(byId.get(studentId), { firstName, lastName, classRoom, examPeriod: ['เช้า','บ่าย','ทวิภาคี'].includes(examPeriod) ? examPeriod : '' }); updated++; }
      else { const student = { studentId, firstName, lastName, classRoom, examPeriod: ['เช้า','บ่าย','ทวิภาคี'].includes(examPeriod) ? examPeriod : '', pinFailedAttempts: 0, createdAt: new Date().toISOString() }; byId.set(studentId, student); db.students.push(student); imported++; }
    });
    await writeDB(db); res.json({ imported, updated, errors });
  });

  app.post('/api/students/import-xlsx', requireAdmin, express.raw({ type: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'], limit: '2mb' }), async (req, res) => {
    if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: 'invalid_file', message: 'กรุณาเลือกไฟล์ Excel' });
    let rows;
    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(req.body);
      const matrix = worksheetMatrix(workbook.worksheets[0], 10000, 100);
      const firstCell = String(matrix[0]?.[0] ?? '').trim();
      rows = /^\d{5,}$/.test(firstCell)
        ? matrix.filter(row => row.some(value => String(value).trim())).map(row => ({ studentid: row[0], firstname: row[1], lastname: row[2], classroom: row[3], examperiod: row[4] }))
        : matrix.slice(1).filter(row => row.some(value => String(value).trim())).map(row => Object.fromEntries((matrix[0] || []).map((header, index) => [String(header), row[index] ?? ''])));
    } catch { return res.status(400).json({ error: 'invalid_file', message: 'ไม่สามารถอ่านไฟล์ Excel นี้ได้' }); }
    const valueOf = (row, names) => {
      const key = Object.keys(row).find(column => names.includes(String(column).trim().toLowerCase()));
      return key === undefined ? '' : String(row[key] ?? '').trim();
    };
    const db = readDB(); const byId = new Map(db.students.map(student => [student.studentId, student]));
    let imported = 0, updated = 0; const errors = [];
    rows.forEach((row, index) => {
      const studentId = valueOf(row, ['รหัสนักเรียน', 'studentid', 'student_id', 'id']);
      const firstName = valueOf(row, ['ชื่อ', 'firstname', 'first_name']);
      const lastName = valueOf(row, ['นามสกุล', 'lastname', 'last_name']);
      const classRoom = valueOf(row, ['ห้อง', 'classroom', 'class_room', 'class']); const examPeriod = valueOf(row, ['รอบเรียน', 'รอบ', 'period', 'examperiod']);
      const validationErrors = validateStudentPayload({ studentId, firstName, lastName, classRoom });
      if (validationErrors.length) { errors.push(`แถว ${index + 2}: ${validationErrors.join(', ')}`); return; }
      if (byId.has(studentId)) { Object.assign(byId.get(studentId), { firstName, lastName, classRoom, examPeriod: ['เช้า','บ่าย'].includes(examPeriod) ? examPeriod : '' }); updated += 1; }
      else { const student = { studentId, firstName, lastName, classRoom, examPeriod: ['เช้า','บ่าย'].includes(examPeriod) ? examPeriod : '', pinFailedAttempts: 0, createdAt: new Date().toISOString() }; byId.set(studentId, student); db.students.push(student); imported += 1; }
    });
    await writeDB(db); res.json({ imported, updated, errors });
  });

  app.put('/api/students/:studentId', requireAdmin, async (req, res) => {
    const db = readDB(); const student = findStudent(db.students, req.params.studentId);
    if (!student) return res.status(404).json({ error: 'not_found' });
    const errors = validateStudentPayload({ ...student, ...req.body, studentId: student.studentId });
    if (errors.length) return sendValidationError(res, errors);
    Object.assign(student, { firstName: req.body.firstName ?? student.firstName, lastName: req.body.lastName ?? student.lastName, classRoom: req.body.classRoom ?? student.classRoom, examPeriod: req.body.examPeriod === '' ? '' : (['เช้า','บ่าย','ทวิภาคี'].includes(req.body.examPeriod) ? req.body.examPeriod : student.examPeriod) });
    await writeDB(db); res.json({ ok: true });
  });
  app.post('/api/classes/:classRoom/exam-period', requireAdmin, async (req, res) => {
    const examPeriod = String(req.body?.examPeriod || '');
    if (!['เช้า', 'บ่าย', 'ทวิภาคี', ''].includes(examPeriod)) return res.status(400).json({ error: 'invalid_payload' });
    const db = readDB(); const room = req.params.classRoom; let updated = 0;
    db.students.forEach(student => { if (student.classRoom === room) { student.examPeriod = examPeriod; updated++; } });
    if (!updated) return res.status(404).json({ error: 'not_found' });
    await writeDB(db); res.json({ ok: true, updated });
  });

  app.delete('/api/students/:studentId', requireAdmin, async (req, res) => {
    const db = readDB(); db.students = db.students.filter(student => student.studentId !== req.params.studentId);
    await writeDB(db); res.json({ ok: true });
  });

  app.get('/api/classes', requireAdmin, (req, res) => { const period=String(req.query.period||''); res.json([...new Set(readDB().students.filter(student=>!period||(period==='unset'?!student.examPeriod:student.examPeriod===period)).map(student => student.classRoom))].sort()); });
}

module.exports = { registerStudentRoutes, findRecoverableExamDraft };
