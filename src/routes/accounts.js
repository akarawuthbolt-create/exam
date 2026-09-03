const MAX_LOGIN_FAILURES = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const express = require('express');
const { validateTeacherPayload, sendValidationError } = require('../validation');
const { validateRestoredBackup } = require('../restore-drill');
const { buildTeacherImportTemplate, buildTeacherExport, parseTeacherImport, validateTeacherImportRows } = require('../teacher-import');

function purgeExpiredLoginFailures(store, now = Date.now()) {
  let removed = 0;
  for (const [key, entry] of store) {
    const expiresAt = Math.max(entry.windowStartedAt + LOGIN_WINDOW_MS, entry.lockedUntil || 0);
    if (expiresAt <= now) { store.delete(key); removed += 1; }
  }
  return removed;
}

function clientKey(req) { return req.ip || req.socket?.remoteAddress || 'unknown'; }
function canAttempt(store, key) {
  const entry = store.get(key);
  if (!entry) return true;
  if (entry.lockedUntil && entry.lockedUntil > Date.now()) return false;
  if (entry.windowStartedAt + LOGIN_WINDOW_MS <= Date.now()) store.delete(key);
  return true;
}
function registerFailure(store, key) {
  const now = Date.now();
  const entry = store.get(key);
  const current = entry && entry.windowStartedAt + LOGIN_WINDOW_MS > now ? entry : { count: 0, windowStartedAt: now, lockedUntil: 0 };
  current.count += 1;
  if (current.count >= MAX_LOGIN_FAILURES) current.lockedUntil = now + LOGIN_WINDOW_MS;
  store.set(key, current);
  return !!current.lockedUntil;
}

function registerAccountRoutes(app, dependencies) {
  const {
    ADMIN_KEY, readDB, writeDB, replaceDB, hashPassword, verifyPassword, requireAdmin,
    requireTeacher, createTeacherSession, removeTeacherSessions, sessionStore, backupService, newId
  } = dependencies;
  const adminLoginFailures = new Map();
  const teacherLoginFailures = new Map();
  const cleanupTimer = setInterval(() => {
    purgeExpiredLoginFailures(adminLoginFailures);
    purgeExpiredLoginFailures(teacherLoginFailures);
  }, LOGIN_WINDOW_MS);
  cleanupTimer.unref();

  app.post('/api/admin/verify', (req, res) => {
    const key = clientKey(req);
    if (!canAttempt(adminLoginFailures, key)) return res.status(429).json({ ok: false, error: 'rate_limited', message: 'ลองรหัสผิดหลายครั้ง กรุณารอ 15 นาทีแล้วลองใหม่' });
    if (req.get('x-admin-key') === ADMIN_KEY) { adminLoginFailures.delete(key); return res.json({ ok: true }); }
    const locked = registerFailure(adminLoginFailures, key);
    return res.status(locked ? 429 : 401).json({ ok: false, error: locked ? 'rate_limited' : 'invalid_credentials', message: locked ? 'ลองรหัสผิดครบ 5 ครั้ง กรุณารอ 15 นาทีแล้วลองใหม่' : 'รหัสผู้ดูแลระบบไม่ถูกต้อง' });
  });

  app.get('/api/admin/backup.json', requireAdmin, (req, res) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="exam-system-backup-${new Date().toISOString().slice(0, 10)}.json"`);
    res.json({ version: 1, exportedAt: new Date().toISOString(), database: readDB() });
  });

  app.post('/api/admin/restore.json', requireAdmin, express.raw({ type:'application/x-exam-backup+json', limit:'25mb' }), async (req, res) => {
    try {
      if (req.get('x-restore-confirm') !== 'RESTORE') return res.status(400).json({ error:'confirmation_required', message:'กรุณายืนยันการกู้คืนข้อมูล' });
      if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error:'invalid_backup', message:'ไม่พบข้อมูลในไฟล์สำรอง' });
      const payload = JSON.parse(req.body.toString('utf8').replace(/^\uFEFF/, ''));
      const counts = validateRestoredBackup(payload);
      if (backupService?.status().configured) {
        const safetyBackup = await backupService.run();
        if (!safetyBackup.created) return res.status(503).json({ error:'safety_backup_failed', message:'สร้างไฟล์สำรองก่อนกู้คืนไม่สำเร็จ จึงยกเลิกการกู้คืนเพื่อความปลอดภัย' });
      }
      await replaceDB(payload.database);
      await Promise.all([sessionStore.clear('teacher'), sessionStore.clear('student')]);
      res.json({ ok:true, exportedAt:payload.exportedAt, counts });
    } catch (error) {
      if (error instanceof SyntaxError || /backup|collection|duplicate|missing|settings/i.test(error.message)) return res.status(400).json({ error:'invalid_backup', message:'ไฟล์สำรองไม่ถูกต้องหรือข้อมูลไม่ครบ' });
      throw error;
    }
  });

  app.get('/api/teachers', requireAdmin, (req, res) => {
    const db = readDB();
    res.json(db.teachers.map(t => ({ id: t.id, firstName: t.firstName, lastName: t.lastName, username: t.username, department: t.department || '', email: t.email || '', createdAt: t.createdAt })));
  });

  app.post('/api/teachers', requireAdmin, async (req, res) => {
    const body = req.body;
    const errors = validateTeacherPayload(body);
    if (errors.length) return sendValidationError(res, errors);
    const db = readDB();
    if (db.teachers.some(t => t.username === body.username)) {
      return res.status(409).json({ error: 'duplicate', message: 'มี username นี้อยู่ในระบบแล้ว' });
    }
    const teacher = {
      id: newId('teacher'), firstName: body.firstName.trim(), lastName: body.lastName.trim(),
      username: body.username.trim(), department: body.department.trim(), email: String(body.email || '').trim().toLowerCase(), passwordHash: hashPassword(body.password), createdAt: new Date().toISOString()
    };
    db.teachers.push(teacher);
    await writeDB(db);
    res.status(201).json({ id: teacher.id });
  });

  app.patch('/api/teachers/:id/password', requireAdmin, async (req, res) => {
    const password = req.body?.password;
    if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
      return res.status(400).json({ error: 'weak_password', message: 'รหัสผ่านใหม่ต้องมี 8-128 ตัวอักษร' });
    }
    const db = readDB();
    const teacher = db.teachers.find(item => item.id === req.params.id);
    if (!teacher) return res.status(404).json({ error: 'not_found', message: 'ไม่พบบัญชีอาจารย์นี้' });
    teacher.passwordHash = hashPassword(password);
    teacher.passwordChangedAt = new Date().toISOString();
    await writeDB(db);
    await removeTeacherSessions(teacher.id);
    res.json({ ok: true });
  });

  app.get('/api/teachers/import-template.xlsx', requireAdmin, async (req, res) => {
    const buffer = await buildTeacherImportTemplate();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="teacher-account-template.xlsx"');
    res.send(buffer);
  });

  app.get('/api/teachers/export.xlsx', requireAdmin, async (req, res) => {
    const buffer = await buildTeacherExport(readDB().teachers);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="teacher-list-${new Date().toISOString().slice(0, 10)}.xlsx"`);
    res.send(buffer);
  });

  app.post('/api/teachers/import-xlsx', requireAdmin, express.raw({ type: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', 'application/octet-stream'], limit: '2mb' }), async (req, res) => {
    if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: 'invalid_file', message: 'กรุณาเลือกไฟล์ Excel' });
    try {
      const rows = await parseTeacherImport(req.body);
      const db = readDB();
      const { accepted, errors } = validateTeacherImportRows(rows, db.teachers.map(item => item.username));
      const createdAt = new Date().toISOString();
      for (const body of accepted) db.teachers.push({
        id: newId('teacher'), firstName: body.firstName, lastName: body.lastName,
        username: body.username, department: body.department,
        email: body.email.toLowerCase(), passwordHash: hashPassword(body.password), createdAt
      });
      if (accepted.length) await writeDB(db);
      res.json({ imported: accepted.length, errors });
    } catch (error) {
      res.status(400).json({ error: 'invalid_file', message: error.message || 'ไม่สามารถอ่านไฟล์ Excel นี้ได้' });
    }
  });

  app.patch('/api/teachers/:id/email', requireAdmin, async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'invalid_email', message: 'รูปแบบอีเมลไม่ถูกต้อง' });
    const db = readDB(); const teacher = db.teachers.find(item => item.id === req.params.id);
    if (!teacher) return res.status(404).json({ error: 'not_found', message: 'ไม่พบบัญชีอาจารย์นี้' });
    teacher.email = email; await writeDB(db); res.json({ ok: true, email });
  });

  app.patch('/api/teachers/:id/profile', requireAdmin, async (req, res) => {
    const department = String(req.body?.department || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!department || department.length > 150) return res.status(400).json({ error: 'invalid_department', message: 'สาขาวิชาต้องมี 1-150 ตัวอักษร' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'invalid_email', message: 'รูปแบบอีเมลไม่ถูกต้อง' });
    const db = readDB(); const teacher = db.teachers.find(item => item.id === req.params.id);
    if (!teacher) return res.status(404).json({ error: 'not_found', message: 'ไม่พบบัญชีอาจารย์นี้' });
    teacher.department = department; teacher.email = email;
    db.sets.forEach(set => { if (set.teacherId === teacher.id) { set.subjectTeacherDepartment = department; set.subjectTeacherEmail = email; } });
    await writeDB(db); res.json({ ok: true, department, email });
  });

  app.patch('/api/teachers/:id/department', requireAdmin, async (req, res) => {
    const department = String(req.body?.department || '').trim();
    if (!department || department.length > 150) return res.status(400).json({ error: 'invalid_department', message: 'สาขาวิชาต้องมี 1-150 ตัวอักษร' });
    const db = readDB(); const teacher = db.teachers.find(item => item.id === req.params.id);
    if (!teacher) return res.status(404).json({ error: 'not_found', message: 'ไม่พบบัญชีอาจารย์นี้' });
    teacher.department = department;
    db.sets.forEach(set => { if (set.teacherId === teacher.id) set.subjectTeacherDepartment = department; });
    await writeDB(db); res.json({ ok: true, department });
  });

  app.delete('/api/teachers/:id', requireAdmin, async (req, res) => {
    const db = readDB();
    db.teachers = db.teachers.filter(t => t.id !== req.params.id);
    db.sets.forEach(set => { if (set.teacherId === req.params.id) set.teacherId = null; });
    await writeDB(db);
    await removeTeacherSessions(req.params.id);
    res.json({ ok: true });
  });

  app.post('/api/teacher/login-lockouts/reset', requireAdmin, (req, res) => {
    teacherLoginFailures.clear();
    res.json({ ok: true });
  });

  app.post('/api/teacher/login', async (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'invalid_payload', message: 'กรุณากรอก username และ password' });
    const key = clientKey(req);
    if (!canAttempt(teacherLoginFailures, key)) return res.status(429).json({ error: 'rate_limited', message: 'ลองรหัสผิดหลายครั้ง กรุณารอ 15 นาทีแล้วลองใหม่' });
    const teacher = readDB().teachers.find(t => t.username === username.trim());
    if (!teacher || !verifyPassword(password, teacher.passwordHash)) {
      const locked = registerFailure(teacherLoginFailures, key);
      return res.status(locked ? 429 : 401).json({ error: locked ? 'rate_limited' : 'invalid_credentials', message: locked ? 'ลองรหัสผิดครบ 5 ครั้ง กรุณารอ 15 นาทีแล้วลองใหม่' : 'username หรือ password ไม่ถูกต้อง' });
    }
    teacherLoginFailures.delete(key);
    const token = await createTeacherSession(teacher.id);
    res.json({ token, teacherId: teacher.id, firstName: teacher.firstName, lastName: teacher.lastName, department: teacher.department || '' });
  });

  app.post('/api/teacher/change-password', requireTeacher, async (req, res) => {
    const { currentPassword, newPassword } = req.body || {};
    if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
      return res.status(400).json({ error: 'invalid_payload', message: 'กรุณากรอกรหัสผ่านให้ครบ' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'weak_password', message: 'รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร' });
    }
    if (currentPassword === newPassword) {
      return res.status(400).json({ error: 'same_password', message: 'รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านเดิม' });
    }

    const db = readDB();
    const teacher = db.teachers.find(item => item.id === req.teacherId);
    if (!teacher || !verifyPassword(currentPassword, teacher.passwordHash)) {
      return res.status(401).json({ error: 'invalid_credentials', message: 'รหัสผ่านเดิมไม่ถูกต้อง' });
    }

    teacher.passwordHash = hashPassword(newPassword);
    teacher.passwordChangedAt = new Date().toISOString();
    await writeDB(db);
    await removeTeacherSessions(teacher.id);
    const token = await createTeacherSession(teacher.id);
    res.json({ ok: true, token });
  });

  app.post('/api/teacher/logout', requireTeacher, async (req, res) => {
    await sessionStore.remove('teacher', req.get('x-teacher-token'));
    res.json({ ok: true });
  });
}

module.exports = { registerAccountRoutes, purgeExpiredLoginFailures, LOGIN_WINDOW_MS };
