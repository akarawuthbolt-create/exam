const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'database.js'), 'utf8');

function functionBody(name, nextName) {
  const start = source.indexOf(`function ${name}(`);
  const end = source.indexOf(`function ${nextName}(`, start + 1);
  assert.ok(start >= 0 && end > start, `missing ${name}`);
  return source.slice(start, end);
}

test('ordinary PostgreSQL writes never download the full database', () => {
  const write = functionBody('writeDB', 'mutateDB');
  const mutate = functionBody('mutateDB', 'mutateExamDraft');
  assert.doesNotMatch(write, /readPostgresDatabase\s*\(/);
  assert.doesNotMatch(mutate, /readPostgresDatabase\s*\(/);
});

test('exam draft autosave locks only its own PostgreSQL row', () => {
  const draft = functionBody('mutateExamDraft', 'saveExamSubmission');
  assert.match(draft, /SELECT\s+data\s+FROM\s+exam_drafts\s+WHERE\s+draft_key\s*=\s*\$1\s+FOR\s+UPDATE/i);
  assert.match(draft, /INSERT INTO exam_drafts/);
  assert.doesNotMatch(draft, /pg_advisory_xact_lock/);
});

test('normal exam submission inserts one result without the global write lock', () => {
  const save = functionBody('saveExamSubmission', 'replaceDB');
  assert.match(save, /INSERT INTO results/);
  assert.match(save, /ON CONFLICT \(attempt_key\)/);
  assert.doesNotMatch(save, /pg_advisory_xact_lock/);
  assert.doesNotMatch(save, /writeChain/);
});

test('only startup and explicit full restore may read all PostgreSQL tables', () => {
  const calls = [...source.matchAll(/readPostgresDatabase\s*\(/g)].length;
  assert.equal(calls, 3);
});

test('changed PostgreSQL rows are upserted once per table as a batch', () => {
  const persist = functionBody('persistPostgresRows', 'persistPostgresChanges');
  assert.match(source, /function bulkUpsertRows\(/);
  assert.match(persist, /jsonb_to_recordset\(\$1::jsonb\)/);
  assert.doesNotMatch(persist, /for \(const .*client\.query/);
});
