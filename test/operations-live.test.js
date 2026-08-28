const test = require('node:test');
const assert = require('node:assert/strict');
const { liveOperationsSnapshot, examPulseSnapshot } = require('../src/routes/operations');

test('live Operations snapshot exposes aggregate exam activity only', () => {
  const now = Date.parse('2026-07-18T10:00:00.000Z');
  const db = {
    drafts: [
      { studentId: 'secret-1', lockUntil: '2026-07-18T10:01:00.000Z' },
      { studentId: 'secret-1', lockUntil: '2026-07-18T10:02:00.000Z' },
      { studentId: 'secret-2', lockUntil: '2026-07-18T09:59:00.000Z' }
    ],
    sets: [{ key: 'open' }, { key: 'archived', archived: true }],
    results: [{ id: 'recent', submittedAt: '2026-07-18T09:58:00.000Z' }, { id: 'old', submittedAt: '2026-07-18T09:30:00.000Z' }]
  };
  const snapshot = liveOperationsSnapshot(db, { submissions: { active: 2, pending: 3, overloaded: 0 }, jobs: { active: 1, pending: 0, failed: 0 }, requests: { inFlight: 4, errorRatePercent: 1 } }, now);
  assert.equal(snapshot.activeStudents, 1);
  assert.equal(snapshot.activeExams, 1);
  assert.equal(snapshot.resultsLast5Minutes, 1);
  assert.equal(JSON.stringify(snapshot).includes('secret-1'), false);
});

test('Exam Pulse exposes safe progress signals without draft answers', () => {
  const now = Date.parse('2026-08-29T10:00:00.000Z');
  const snapshot = examPulseSnapshot({ students:[{studentId:'1001',firstName:'สมชาย',lastName:'ใจดี',classRoom:'ม.1/1'}], sets:[{key:'set-a',title:'วิทยาศาสตร์'}], drafts:[{draftKey:'1001::set-a::normal',studentId:'1001',questionKey:'set-a',savedAt:'2026-08-29T09:57:30.000Z',examEndTime:'2026-08-29T10:04:00.000Z',draftAnswers:{mc:{secret:1}}}] },now);
  assert.equal(snapshot.entries.length,1);
  assert.equal(snapshot.entries[0].status,'offline');
  assert.equal(snapshot.entries[0].studentName,'สมชาย ใจดี');
  assert.equal(snapshot.entries[0].examTitle,'วิทยาศาสตร์');
  assert.equal('draftAnswers' in snapshot.entries[0],false);
});
