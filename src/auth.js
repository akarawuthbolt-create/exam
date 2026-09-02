const crypto = require('crypto');
const { ADMIN_KEY, REDIS_URL, SESSION_KEY_PREFIX } = require('./config');
const { createSessionStore } = require('./session-store');

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const check = crypto.scryptSync(password, salt, 64).toString('hex');
  try { return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(check, 'hex')); }
  catch { return false; }
}

function timingSafeStringEqual(a, b) {
  const bufA = Buffer.from(String(a ?? ''), 'utf8');
  const bufB = Buffer.from(String(b ?? ''), 'utf8');
  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

const TEACHER_SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const STUDENT_SESSION_TTL_MS = 2 * 60 * 60 * 1000;
const SESSION_CLEANUP_INTERVAL_MS = 15 * 60 * 1000;
const sessionStore = createSessionStore({ redisUrl: REDIS_URL, prefix: SESSION_KEY_PREFIX });
const teacherSessions = sessionStore.memory.teacher;
const studentSessions = sessionStore.memory.student;

function purgeExpiredSessions(now = Date.now()) { return sessionStore.purgeExpired(now); }
const sessionCleanupTimer = setInterval(purgeExpiredSessions, SESSION_CLEANUP_INTERVAL_MS);
sessionCleanupTimer.unref();

async function requireTeacher(req, res, next) {
  try {
    const teacherId = await sessionStore.getAndTouch('teacher', req.get('x-teacher-token'), TEACHER_SESSION_TTL_MS);
    if (!teacherId) return res.status(401).json({ error: 'unauthorized', message: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบอาจารย์ใหม่อีกครั้ง' });
    req.teacherId = teacherId;
    next();
  } catch (error) { next(error); }
}

function requireAdmin(req, res, next) {
  const key = req.get('x-admin-key');
  if (!key || !timingSafeStringEqual(key, ADMIN_KEY)) return res.status(401).json({ error: 'unauthorized', message: 'ต้องระบุรหัสผู้ดูแลระบบที่ถูกต้อง' });
  next();
}

async function requireStudent(req, res, next) {
  try {
    const studentId = await sessionStore.getAndTouch('student', req.get('x-student-token'), STUDENT_SESSION_TTL_MS);
    if (!studentId) return res.status(401).json({ error: 'unauthorized', message: 'Student session expired. Please sign in again.' });
    req.studentId = studentId;
    next();
  } catch (error) { next(error); }
}

async function createTeacherSession(teacherId) {
  const token = crypto.randomBytes(24).toString('hex');
  await sessionStore.set('teacher', token, teacherId, TEACHER_SESSION_TTL_MS);
  return token;
}

async function createStudentSession(studentId) {
  const token = crypto.randomBytes(24).toString('hex');
  await sessionStore.set('student', token, studentId, STUDENT_SESSION_TTL_MS);
  return token;
}

async function removeTeacherSessions(teacherId) { await sessionStore.removeBySubject('teacher', teacherId); }

module.exports = {
  hashPassword, verifyPassword, requireTeacher, requireAdmin, requireStudent,
  createTeacherSession, createStudentSession, removeTeacherSessions,
  teacherSessions, studentSessions, purgeExpiredSessions, sessionStore,
  timingSafeStringEqual
};
