const EDUCATION_LEVELS = ['ปวช.', 'ปวส.'];
const SET_KEY_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;
const USERNAME_PATTERN = /^[A-Za-z0-9._-]{3,50}$/;
const STUDENT_ID_PATTERN = /^[A-Za-z0-9_-]{1,50}$/;

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateExamSetPayload(body, { allowKey = true } = {}) {
  const errors = [];
  if (!isObject(body)) return ['payload ต้องเป็น JSON object'];

  if (typeof body.title !== 'string' || !body.title.trim()) errors.push('กรุณาระบุชื่อชุดข้อสอบ');
  else if (body.title.trim().length > 200) errors.push('ชื่อชุดข้อสอบต้องไม่เกิน 200 ตัวอักษร');

  if (!EDUCATION_LEVELS.includes(body.educationLevel)) errors.push('กรุณาเลือกระดับ ปวช. หรือ ปวส.');
  if (!isObject(body.sections)) errors.push('sections ต้องเป็น JSON object');

  if (allowKey && body.key !== undefined && (typeof body.key !== 'string' || !SET_KEY_PATTERN.test(body.key))) {
    errors.push('key ใช้ได้เฉพาะตัวอักษรภาษาอังกฤษ ตัวเลข _ และ - ไม่เกิน 100 ตัวอักษร');
  }
  if (body.assignedClasses !== undefined && !Array.isArray(body.assignedClasses)) errors.push('assignedClasses ต้องเป็น array');
  if (body.examSchedules !== undefined && !Array.isArray(body.examSchedules)) errors.push('examSchedules ต้องเป็น array');

  return errors;
}

function sendValidationError(res, errors) {
  return res.status(400).json({ error: 'invalid_payload', message: errors[0], details: errors });
}

function validateTeacherPayload(body) {
  const errors = [];
  if (!isObject(body)) return ['payload ต้องเป็น JSON object'];
  if (typeof body.firstName !== 'string' || !body.firstName.trim() || body.firstName.trim().length > 100) errors.push('ชื่อต้องมี 1-100 ตัวอักษร');
  if (typeof body.lastName !== 'string' || !body.lastName.trim() || body.lastName.trim().length > 100) errors.push('นามสกุลต้องมี 1-100 ตัวอักษร');
  if (typeof body.username !== 'string' || !USERNAME_PATTERN.test(body.username.trim())) errors.push('username ต้องมี 3-50 ตัว และใช้เฉพาะอักษรอังกฤษ ตัวเลข . _ หรือ -');
  if (typeof body.password !== 'string' || body.password.length < 8 || body.password.length > 200) errors.push('password ต้องมี 8-200 ตัวอักษร');
  if (typeof body.department !== 'string' || !body.department.trim() || body.department.trim().length > 150) errors.push('สาขาวิชาต้องมี 1-150 ตัวอักษร');
  if (body?.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(body.email).trim())) errors.push('รูปแบบอีเมลไม่ถูกต้อง');
  return errors;
}

function validateStudentPayload(body) {
  const errors = [];
  if (!isObject(body)) return ['payload ต้องเป็น JSON object'];
  if (typeof body.studentId !== 'string' || !STUDENT_ID_PATTERN.test(body.studentId.trim())) errors.push('รหัสนักเรียนต้องมี 1-50 ตัว และใช้เฉพาะอักษรอังกฤษ ตัวเลข _ หรือ -');
  if (typeof body.firstName !== 'string' || !body.firstName.trim() || body.firstName.trim().length > 100) errors.push('ชื่อต้องมี 1-100 ตัวอักษร');
  if (typeof body.lastName !== 'string' || !body.lastName.trim() || body.lastName.trim().length > 100) errors.push('นามสกุลต้องมี 1-100 ตัวอักษร');
  if (typeof body.classRoom !== 'string' || !body.classRoom.trim() || body.classRoom.trim().length > 100) errors.push('ห้องเรียนต้องมี 1-100 ตัวอักษร');
  return errors;
}

module.exports = {
  validateExamSetPayload, validateTeacherPayload, validateStudentPayload, sendValidationError, USERNAME_PATTERN
};
