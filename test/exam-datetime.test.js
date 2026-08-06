const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeExamDateTime, getExamSchedule, hasExamAccess } = require('../src/grading');

test('normalizes a legacy Buddhist year stored as a Gregorian year', () => {
  assert.equal(normalizeExamDateTime('2569-07-21T05:00:00.000Z'), '2026-07-21T05:00:00.000Z');
});

test('an individually assigned student uses the selected round even when enrolled in another room', () => {
  const set = { examSchedules: [
    { name: 'รอบเช้า', classes: ['CC.1/1'], studentIds: ['20999'], availableFrom: '2026-07-21T02:00:00.000Z' },
    { name: 'รอบบ่าย', classes: ['CC.2/1'], studentIds: [], availableFrom: '2026-07-21T07:00:00.000Z' }
  ] };
  assert.equal(getExamSchedule(set, 'OTHER.1/1', '20999').name, 'รอบเช้า');
  assert.equal(hasExamAccess(set, 'OTHER.1/1', '20999'), true);
  assert.equal(hasExamAccess(set, 'OTHER.1/1', '20888'), false);
});

test('an absentee-only round overrides the expired classroom round', () => {
  const set = { examSchedules: [
    { name: 'รอบปกติ', classes: ['CIT.2/5'], studentIds: ['20999'], availableFrom: '2026-07-20T02:00:00.000Z', availableUntil: '2026-07-20T03:00:00.000Z' },
    { name: 'รอบผู้ขาดสอบ', classes: ['__ABSENCE_ONLY__'], studentIds: [20999], availableFrom: '2026-08-06T02:00:00.000Z', availableUntil: '2026-08-07T02:00:00.000Z', absenceOnly: true }
  ] };
  assert.equal(getExamSchedule(set, 'CIT.2/5', '20999').name, 'รอบผู้ขาดสอบ');
  assert.equal(hasExamAccess(set, 'CIT.2/5', '20999'), true);
  assert.equal(getExamSchedule(set, 'CIT.2/5', '20888').name, 'รอบปกติ');
});

test('leaves a correctly stored Gregorian date unchanged', () => {
  assert.equal(normalizeExamDateTime('2026-07-21T05:00:00.000Z'), '2026-07-21T05:00:00.000Z');
});

test('returns normalized dates from the class schedule', () => {
  const set = { examSchedules: [{ classes: ['CIT.2/5'], availableFrom: '2569-07-21T05:00:00.000Z', availableUntil: '2569-07-21T07:30:00.000Z' }] };
  assert.deepEqual(getExamSchedule(set, 'CIT.2/5'), {
    classes: ['CIT.2/5'],
    availableFrom: '2026-07-21T05:00:00.000Z',
    availableUntil: '2026-07-21T07:30:00.000Z'
  });
});
