const test = require('node:test');
const assert = require('node:assert/strict');
const { archiveExpiredExamSets, examLastEndAt } = require('../src/exam-auto-archive');

test('auto archive uses the latest exam round and waits a full 30 days', () => {
  const db = { sets: [{ key:'old', examSchedules:[{ availableUntil:'2026-01-01T10:00:00Z' },{ availableUntil:'2026-01-05T10:00:00Z' }], quickOpen:true }, { key:'recent', availableUntil:'2026-01-20T10:00:00Z' }] };
  assert.equal(examLastEndAt(db.sets[0]), Date.parse('2026-01-05T10:00:00Z'));
  const keys = archiveExpiredExamSets(db, Date.parse('2026-02-04T10:00:00Z'));
  assert.deepEqual(keys, ['old']); assert.equal(db.sets[0].archived, true); assert.equal(db.sets[0].quickOpen, false); assert.equal(db.sets[1].archived, undefined);
});

test('auto archive ignores unscheduled, already archived, and deleted exams', () => {
  const db = { sets: [{ key:'none' },{ key:'archived', archived:true, availableUntil:'2020-01-01' },{ key:'deleted', deletedAt:'2020-01-02', availableUntil:'2020-01-01' }] };
  assert.deepEqual(archiveExpiredExamSets(db, Date.parse('2026-01-01')), []);
});

test('auto archive normalizes legacy Buddhist years before calculating 30 days', () => {
  const db = { sets: [{ key: 'buddhist-year', examSchedules: [{ availableUntil: '2569-07-21T07:30:00.000Z' }] }] };
  const now = Date.parse('2026-08-24T07:30:00.000Z');
  assert.equal(examLastEndAt(db.sets[0]), Date.parse('2026-07-21T07:30:00.000Z'));
  assert.deepEqual(archiveExpiredExamSets(db, now), ['buddhist-year']);
  assert.equal(db.sets[0].archived, true);
});
