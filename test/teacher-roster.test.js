const test = require('node:test');
const assert = require('node:assert/strict');
const { registerTeacherClassRoutes } = require('../src/routes/teacher-classes');

function rosterHandler(database, path = '/api/teacher/exam-roster') {
  const routes = new Map();
  const app = { get(path, ...handlers) { routes.set(path, handlers.at(-1)); } };
  registerTeacherClassRoutes(app, {
    readDB: () => database,
    requireTeacher: (_req, _res, next) => next(),
    getExamSchedule: set => set.examSchedules[0]
  });
  return routes.get(path);
}

function responseCapture() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

test('teacher exam roster returns owned exam metadata and sorted room students', () => {
  const db = {
    sets: [{ key: 'set-1', teacherId: 'teacher-1', title: 'ปลายภาค', courseName: 'เทคโนโลยีดิจิทัล', examType: 'ปลายภาค', assignedClasses: ['CC.1/4'], subjectTeacherName: 'อาจารย์ทดสอบ', examSchedules: [{ classes: ['CC.1/4'], availableFrom: '2026-07-24T06:30:00.000Z', availableUntil: '2026-07-24T07:30:00.000Z' }] }],
    students: [
      { studentId: '20', firstName: 'คน', lastName: 'ที่สอง', classRoom: 'CC.1/4', examPeriod: 'เช้า' },
      { studentId: '3', firstName: 'คน', lastName: 'แรก', classRoom: 'CC.1/4', examPeriod: 'เช้า' },
      { studentId: '1', firstName: 'คน', lastName: 'อื่น', classRoom: 'ปวช.1/5' }
    ]
  };
  const res = responseCapture();
  rosterHandler(db)({ query: { setKey: 'set-1', classRoom: 'CC.1/4' }, teacherId: 'teacher-1', protocol: 'https', get: name => name === 'host' ? 'exam.example' : '' }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.students.map(student => student.studentId), ['3', '20']);
  assert.equal(res.body.exam.examLink, 'https://exam.example/');
  assert.equal(res.body.exam.teacherName, 'อาจารย์ทดสอบ');
  assert.equal(res.body.examPeriod, 'เช้า');
  assert.equal(res.body.program, 'เทคโนโลยีธุรกิจดิจิทัล');
  assert.equal(res.body.educationLevel, 'ปวช');
});

test('teacher exam roster cannot read another teacher exam', () => {
  const res = responseCapture();
  rosterHandler({ sets: [{ key: 'set-1', teacherId: 'teacher-2' }], students: [] })({ query: { setKey: 'set-1', classRoom: 'ปวช.1/4' }, teacherId: 'teacher-1', get: () => '' }, res);
  assert.equal(res.statusCode, 404);
});

test('teacher exam roster appends individually assigned students after the room roster', () => {
  const db = {
    sets: [{ key: 'set-1', teacherId: 'teacher-1', assignedClasses: ['CC.1/4'], examSchedules: [{ classes: ['CC.1/4'], studentIds: ['99', '3'] }] }],
    students: [
      { studentId: '20', firstName: 'Room', lastName: 'Two', classRoom: 'CC.1/4' },
      { studentId: '3', firstName: 'Room', lastName: 'One', classRoom: 'CC.1/4' },
      { studentId: '99', firstName: 'Extra', lastName: 'Student', classRoom: 'CC.2/4' }
    ]
  };
  const res = responseCapture();
  rosterHandler(db)({ query: { setKey: 'set-1', classRoom: 'CC.1/4' }, teacherId: 'teacher-1', protocol: 'https', get: () => '' }, res);
  assert.deepEqual(res.body.students.map(student => student.studentId), ['3', '20', '99']);
  assert.deepEqual(res.body.students.map(student => student.number), [1, 2, 3]);
  assert.equal(res.body.students[2].additionalAccess, true);
  assert.equal(res.body.students[0].additionalAccess, false);
});

test('absence summary marks missing students only after the exam has ended', () => {
  const db = {
    sets: [{ key: 'set-1', teacherId: 'teacher-1', assignedClasses: ['CC.1/4'], examSchedules: [{ classes: ['CC.1/4'], availableUntil: '2020-01-01T00:00:00.000Z', studentIds: ['99'] }] }],
    students: [{ studentId: '3', firstName: 'Sent', lastName: 'Student', classRoom: 'CC.1/4' }, { studentId: '4', firstName: 'Absent', lastName: 'Student', classRoom: 'CC.1/4' }, { studentId: '99', firstName: 'Extra', lastName: 'Student', classRoom: 'OTHER' }],
    results: [{ studentId: '3', questionKey: 'set-1', attemptType: 'normal' }], drafts: []
  };
  const res = responseCapture();
  rosterHandler(db, '/api/teacher/exam-absence-summary')({ query: { setKey: 'set-1', classRooms: 'CC.1/4' }, teacherId: 'teacher-1' }, res);
  assert.equal(res.body.total, 3);
  assert.equal(res.body.counts.submitted, 1);
  assert.equal(res.body.counts.absent, 2);
  assert.equal(res.body.students.find(student => student.studentId === '99').additionalAccess, true);
});
