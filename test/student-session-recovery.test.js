const test = require('node:test');
const assert = require('node:assert/strict');
const { findRecoverableExamDraft } = require('../src/routes/students');

test('recovers an active exam only for the original device secret', () => {
  const now = Date.parse('2026-07-20T08:00:00.000Z');
  const draft = { studentId:'1001', questionKey:'exam-1', resitAccessId:null, deviceId:'device_123456789', examEndTime:'2026-07-20T08:30:00.000Z' };
  const db = { drafts:[draft] };
  assert.equal(findRecoverableExamDraft(db,{studentId:'1001',questionKey:'exam-1',deviceId:'device_123456789'},now),draft);
  assert.equal(findRecoverableExamDraft(db,{studentId:'1001',questionKey:'exam-1',deviceId:'device_wrong9999'},now),null);
});

test('does not recover a session after the submission grace period', () => {
  const draft = { studentId:'1001', questionKey:'exam-1', deviceId:'device_123456789', examEndTime:'2026-07-20T08:00:00.000Z' };
  assert.equal(findRecoverableExamDraft({drafts:[draft]},{studentId:'1001',questionKey:'exam-1',deviceId:'device_123456789'},Date.parse('2026-07-20T08:16:00.000Z')),null);
});

test('recovers a mobile exam draft whose end time is a millisecond timestamp', () => {
  const now = Date.parse('2026-07-20T08:00:00.000Z');
  const draft = { studentId:'1001', questionKey:'exam-1', deviceId:'device_123456789', examEndTime:now + 30 * 60 * 1000 };
  assert.equal(findRecoverableExamDraft({drafts:[draft]},{studentId:'1001',questionKey:'exam-1',deviceId:'device_123456789'},now),draft);
});
