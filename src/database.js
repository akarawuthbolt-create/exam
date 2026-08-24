const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');
const { Pool } = require('pg');
const { DATA_DIR, SQLITE_PATH, LEGACY_DB_PATH } = require('./config');
const { normalizeStudentEnrollments } = require('./student-enrollments');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function emptyDatabase() {
  return { sets: [], results: [], students: [], teachers: [], questionBank: [], drafts: [], auditLogs: [], settings: { academicCalendar: [] } };
}

function normalizeDatabase(db) {
  const students = Array.isArray(db?.students) ? db.students.map(student => {
    const normalized = { ...student };
    normalizeStudentEnrollments(normalized);
    return normalized;
  }) : [];
  const drafts = Array.isArray(db?.drafts) ? db.drafts : [];
  students.forEach(student => {
    Object.values(student.examDrafts || {}).forEach(draft => {
      if (!draft?.questionKey) return;
      const draftKey = `${student.studentId}::${draft.questionKey}::${draft.resitAccessId || 'normal'}`;
      if (!drafts.some(item => item.draftKey === draftKey)) drafts.push({ ...draft, draftKey, studentId: student.studentId });
    });
    delete student.examDrafts;
  });
  return {
    sets: Array.isArray(db?.sets) ? db.sets : [],
    results: Array.isArray(db?.results) ? db.results : [],
    students,
    teachers: Array.isArray(db?.teachers) ? db.teachers : [],
    questionBank: Array.isArray(db?.questionBank) ? db.questionBank : [],
    drafts,
    auditLogs: Array.isArray(db?.auditLogs) ? db.auditLogs : [],
    settings: { ...(db?.settings || {}), academicCalendar: Array.isArray(db?.settings?.academicCalendar) ? db.settings.academicCalendar : [] }
  };
}

/* SQLite remains available for local development and as the migration source. */
const sqlite = new DatabaseSync(SQLITE_PATH);
sqlite.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS exam_sets (key TEXT PRIMARY KEY, data TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS students (student_id TEXT PRIMARY KEY, class_room TEXT, data TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS teachers (id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, data TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS question_bank (id TEXT PRIMARY KEY, data TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS results (
    id TEXT PRIMARY KEY, student_id TEXT NOT NULL, question_key TEXT NOT NULL,
    submitted_at TEXT, published INTEGER NOT NULL DEFAULT 0, data TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS exam_drafts (draft_key TEXT PRIMARY KEY, student_id TEXT NOT NULL, question_key TEXT NOT NULL, updated_at TEXT, data TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS system_settings (id TEXT PRIMARY KEY, data TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS audit_logs (id TEXT PRIMARY KEY, event_at TEXT NOT NULL, actor_type TEXT NOT NULL, actor_id TEXT, action TEXT NOT NULL, target_id TEXT, question_key TEXT, data TEXT NOT NULL);
  CREATE INDEX IF NOT EXISTS idx_students_class_room ON students(class_room);
  CREATE INDEX IF NOT EXISTS idx_results_question_key ON results(question_key);
  CREATE INDEX IF NOT EXISTS idx_results_student_id ON results(student_id);
  CREATE INDEX IF NOT EXISTS idx_exam_drafts_student ON exam_drafts(student_id);
  CREATE INDEX IF NOT EXISTS idx_audit_logs_event_at ON audit_logs(event_at DESC);
  CREATE INDEX IF NOT EXISTS idx_audit_logs_target_id ON audit_logs(target_id);
  CREATE INDEX IF NOT EXISTS idx_audit_logs_question_key ON audit_logs(question_key);
`);

function ensureSqliteResultAttemptsSchema() {
  const indexes = sqlite.prepare('PRAGMA index_list(results)').all();
  const legacyUnique = indexes.some(index => index.unique && sqlite.prepare(`PRAGMA index_info(${index.name})`).all().map(column => column.name).join(',') === 'student_id,question_key');
  if (!legacyUnique) return;
  sqlite.exec(`
    BEGIN IMMEDIATE;
    CREATE TABLE results_rebuilt (
      id TEXT PRIMARY KEY, student_id TEXT NOT NULL, question_key TEXT NOT NULL,
      submitted_at TEXT, published INTEGER NOT NULL DEFAULT 0, data TEXT NOT NULL
    );
    INSERT INTO results_rebuilt (id, student_id, question_key, submitted_at, published, data)
      SELECT id, student_id, question_key, submitted_at, published, data FROM results;
    DROP TABLE results;
    ALTER TABLE results_rebuilt RENAME TO results;
    CREATE INDEX idx_results_question_key ON results(question_key);
    CREATE INDEX idx_results_student_id ON results(student_id);
    COMMIT;
  `);
}
ensureSqliteResultAttemptsSchema();

function ensureSqliteAttemptKeysAndIndexes() {
  const columns = sqlite.prepare('PRAGMA table_info(results)').all().map(column => column.name);
  if (!columns.includes('attempt_key')) sqlite.exec('ALTER TABLE results ADD COLUMN attempt_key TEXT');
  sqlite.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_results_attempt_key ON results(attempt_key) WHERE attempt_key IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_results_question_submitted ON results(question_key, submitted_at DESC);
    CREATE INDEX IF NOT EXISTS idx_results_student_question ON results(student_id, question_key);
    CREATE INDEX IF NOT EXISTS idx_exam_drafts_question ON exam_drafts(question_key);
  `);
}
ensureSqliteAttemptKeysAndIndexes();

function parseSqliteRows(statement) {
  return statement.all().map(row => JSON.parse(row.data));
}

function readSqliteDatabase() {
  try {
    return {
      sets: parseSqliteRows(sqlite.prepare('SELECT data FROM exam_sets ORDER BY rowid')),
      results: parseSqliteRows(sqlite.prepare('SELECT data FROM results ORDER BY rowid')),
      students: parseSqliteRows(sqlite.prepare('SELECT data FROM students ORDER BY rowid')),
      teachers: parseSqliteRows(sqlite.prepare('SELECT data FROM teachers ORDER BY rowid')),
      questionBank: parseSqliteRows(sqlite.prepare('SELECT data FROM question_bank ORDER BY rowid')),
      drafts: parseSqliteRows(sqlite.prepare('SELECT data FROM exam_drafts ORDER BY updated_at')),
      auditLogs: parseSqliteRows(sqlite.prepare('SELECT data FROM audit_logs ORDER BY event_at, id')),
      settings: JSON.parse(sqlite.prepare("SELECT data FROM system_settings WHERE id = 'main'").get()?.data || '{"academicCalendar":[]}')
    };
  } catch (error) {
    console.error('Failed to read SQLite database, returning an empty database.', error);
    return emptyDatabase();
  }
}

function replaceSqliteDatabase(db) {
  const insertSet = sqlite.prepare('INSERT INTO exam_sets (key, data) VALUES (?, ?)');
  const insertStudent = sqlite.prepare('INSERT INTO students (student_id, class_room, data) VALUES (?, ?, ?)');
  const insertTeacher = sqlite.prepare('INSERT INTO teachers (id, username, data) VALUES (?, ?, ?)');
  const insertResult = sqlite.prepare('INSERT INTO results (id, student_id, question_key, attempt_key, submitted_at, published, data) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const insertBankQuestion = sqlite.prepare('INSERT INTO question_bank (id, data) VALUES (?, ?)');
  const insertDraft = sqlite.prepare('INSERT INTO exam_drafts (draft_key, student_id, question_key, updated_at, data) VALUES (?, ?, ?, ?, ?)');
  const insertAudit = sqlite.prepare('INSERT INTO audit_logs (id, event_at, actor_type, actor_id, action, target_id, question_key, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  const insertSettings = sqlite.prepare('INSERT INTO system_settings (id, data) VALUES (?, ?)');
  const clean = normalizeDatabase(db);

  sqlite.exec('BEGIN IMMEDIATE');
  try {
    sqlite.exec('DELETE FROM results; DELETE FROM exam_sets; DELETE FROM students; DELETE FROM teachers; DELETE FROM question_bank; DELETE FROM exam_drafts; DELETE FROM audit_logs; DELETE FROM system_settings;');
    for (const set of clean.sets) insertSet.run(set.key, JSON.stringify(set));
    for (const student of clean.students) insertStudent.run(student.studentId, student.classRoom || null, JSON.stringify(student));
    for (const teacher of clean.teachers) insertTeacher.run(teacher.id, teacher.username, JSON.stringify(teacher));
    for (const result of clean.results) insertResult.run(result.id, result.studentId, result.questionKey, result.attemptKey || null, result.submittedAt || null, result.published ? 1 : 0, JSON.stringify(result));
    for (const question of clean.questionBank) insertBankQuestion.run(question.id, JSON.stringify(question));
    for (const draft of clean.drafts) insertDraft.run(draft.draftKey, draft.studentId, draft.questionKey, draft.savedAt || null, JSON.stringify(draft));
    for (const event of clean.auditLogs) insertAudit.run(event.id, event.eventAt, event.actorType, event.actorId || null, event.action, event.targetId || null, event.questionKey || null, JSON.stringify(event));
    insertSettings.run('main', JSON.stringify(clean.settings));
    sqlite.exec('COMMIT');
  } catch (error) {
    sqlite.exec('ROLLBACK');
    throw error;
  }
}

function applyCollectionChanges(baseRows, intendedRows, freshRows, idField) {
  const changed = changedRows(baseRows, intendedRows, idField);
  const removed = new Set(deletedIds(baseRows, intendedRows, idField));
  const replacements = new Map(changed.map(row => [row[idField], row]));
  const merged = freshRows.filter(row => !removed.has(row[idField])).map(row => replacements.get(row[idField]) || row);
  const existing = new Set(merged.map(row => row[idField]));
  changed.forEach(row => { if (!existing.has(row[idField])) merged.push(row); });
  return merged;
}

function mergeDatabaseChanges(base, intended, fresh) {
  const before = normalizeDatabase(base);
  const next = normalizeDatabase(intended);
  const latest = normalizeDatabase(fresh);
  return normalizeDatabase({
    sets: applyCollectionChanges(before.sets, next.sets, latest.sets, 'key'),
    results: applyCollectionChanges(before.results, next.results, latest.results, 'id'),
    students: applyCollectionChanges(before.students, next.students, latest.students, 'studentId'),
    teachers: applyCollectionChanges(before.teachers, next.teachers, latest.teachers, 'id'),
    questionBank: applyCollectionChanges(before.questionBank, next.questionBank, latest.questionBank, 'id'),
    drafts: applyCollectionChanges(before.drafts, next.drafts, latest.drafts, 'draftKey'),
    auditLogs: applyCollectionChanges(before.auditLogs, next.auditLogs, latest.auditLogs, 'id'),
    settings: JSON.stringify(before.settings) === JSON.stringify(next.settings) ? latest.settings : next.settings
  });
}

function persistSqliteChanges(previous, next) {
  const before = normalizeDatabase(previous);
  const clean = normalizeDatabase(next);
  const operations = [
    ['exam_sets', 'key', before.sets, clean.sets, 'key', sqlite.prepare('INSERT INTO exam_sets (key, data) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET data=excluded.data'), row => [row.key, JSON.stringify(row)]],
    ['students', 'student_id', before.students, clean.students, 'studentId', sqlite.prepare('INSERT INTO students (student_id, class_room, data) VALUES (?, ?, ?) ON CONFLICT(student_id) DO UPDATE SET class_room=excluded.class_room, data=excluded.data'), row => [row.studentId, row.classRoom || null, JSON.stringify(row)]],
    ['teachers', 'id', before.teachers, clean.teachers, 'id', sqlite.prepare('INSERT INTO teachers (id, username, data) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET username=excluded.username, data=excluded.data'), row => [row.id, row.username, JSON.stringify(row)]],
    ['question_bank', 'id', before.questionBank, clean.questionBank, 'id', sqlite.prepare('INSERT INTO question_bank (id, data) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data'), row => [row.id, JSON.stringify(row)]],
    ['results', 'id', before.results, clean.results, 'id', sqlite.prepare('INSERT INTO results (id, student_id, question_key, attempt_key, submitted_at, published, data) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET student_id=excluded.student_id, question_key=excluded.question_key, attempt_key=excluded.attempt_key, submitted_at=excluded.submitted_at, published=excluded.published, data=excluded.data'), row => [row.id, row.studentId, row.questionKey, row.attemptKey || null, row.submittedAt || null, row.published ? 1 : 0, JSON.stringify(row)]],
    ['exam_drafts', 'draft_key', before.drafts, clean.drafts, 'draftKey', sqlite.prepare('INSERT INTO exam_drafts (draft_key, student_id, question_key, updated_at, data) VALUES (?, ?, ?, ?, ?) ON CONFLICT(draft_key) DO UPDATE SET student_id=excluded.student_id, question_key=excluded.question_key, updated_at=excluded.updated_at, data=excluded.data'), row => [row.draftKey, row.studentId, row.questionKey, row.savedAt || null, JSON.stringify(row)]],
    ['audit_logs', 'id', before.auditLogs, clean.auditLogs, 'id', sqlite.prepare('INSERT INTO audit_logs (id, event_at, actor_type, actor_id, action, target_id, question_key, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING'), row => [row.id, row.eventAt, row.actorType, row.actorId || null, row.action, row.targetId || null, row.questionKey || null, JSON.stringify(row)]]
  ];
  sqlite.exec('BEGIN IMMEDIATE');
  try {
    for (const [table, column, oldRows, newRows, idField, upsert, values] of operations) {
      for (const id of deletedIds(oldRows, newRows, idField)) sqlite.prepare(`DELETE FROM ${table} WHERE ${column} = ?`).run(id);
      for (const row of changedRows(oldRows, newRows, idField)) upsert.run(...values(row));
    }
    if (JSON.stringify(before.settings) !== JSON.stringify(clean.settings)) sqlite.prepare("INSERT INTO system_settings (id, data) VALUES ('main', ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data").run(JSON.stringify(clean.settings));
    sqlite.exec('COMMIT');
  } catch (error) {
    sqlite.exec('ROLLBACK');
    throw error;
  }
}

function migrateLegacyJsonToSqlite() {
  const sqliteData = readSqliteDatabase();
  if (sqliteData.sets.length || sqliteData.results.length || sqliteData.students.length || sqliteData.teachers.length || sqliteData.questionBank.length || !fs.existsSync(LEGACY_DB_PATH)) return;
  try {
    replaceSqliteDatabase(JSON.parse(fs.readFileSync(LEGACY_DB_PATH, 'utf8')));
    console.log(`Migrated legacy JSON data to SQLite: ${SQLITE_PATH}`);
  } catch (error) {
    console.error('Failed to migrate legacy JSON database to SQLite.', error);
  }
}

migrateLegacyJsonToSqlite();

const DATABASE_URL = process.env.NODE_ENV === 'test' ? '' : process.env.DATABASE_URL;
let pool = null;
let currentDatabase = DATABASE_URL ? emptyDatabase() : readSqliteDatabase();
let writeChain = Promise.resolve();
const directWrites = new Set();

function trackDirectWrite(promise) {
  directWrites.add(promise);
  promise.then(() => directWrites.delete(promise), () => directWrites.delete(promise));
  return promise;
}

function hasData(db) {
  return db.sets.length || db.results.length || db.students.length || db.teachers.length || db.questionBank.length || db.drafts.length;
}

async function readPostgresDatabase(queryable = pool) {
  const statements = [
    'SELECT data FROM exam_sets ORDER BY created_at, key',
    'SELECT data FROM results ORDER BY submitted_at, id',
    'SELECT data FROM students ORDER BY class_room, student_id',
    'SELECT data FROM teachers ORDER BY username',
    'SELECT data FROM question_bank ORDER BY created_at, id',
    'SELECT data FROM exam_drafts ORDER BY updated_at',
    'SELECT data FROM audit_logs ORDER BY event_at, id',
    "SELECT data FROM system_settings WHERE id = 'main'"
  ];
  // A Pool can run these in parallel on different connections. A checked-out
  // client must run them sequentially (pg 9 removes concurrent client.query).
  const rows = queryable === pool
    ? await Promise.all(statements.map(statement => queryable.query(statement)))
    : await statements.reduce(async (pending, statement) => [...await pending, await queryable.query(statement)], Promise.resolve([]));
  const [sets, results, students, teachers, questionBank, drafts, auditLogs, settings] = rows;
  return normalizeDatabase({
    sets: sets.rows.map(row => row.data), results: results.rows.map(row => row.data),
    students: students.rows.map(row => row.data), teachers: teachers.rows.map(row => row.data),
    questionBank: questionBank.rows.map(row => row.data), drafts: drafts.rows.map(row => row.data), auditLogs: auditLogs.rows.map(row => row.data),
    settings: settings.rows[0]?.data || { academicCalendar: [] }
  });
}

function changedRows(previous, next, idField) {
  const before = new Map(previous.map(row => [row[idField], JSON.stringify(row)]));
  return next.filter(row => before.get(row[idField]) !== JSON.stringify(row));
}

function deletedIds(previous, next, idField) {
  const remaining = new Set(next.map(row => row[idField]));
  return previous.filter(row => !remaining.has(row[idField])).map(row => row[idField]);
}

async function deleteRows(client, table, column, ids) {
  if (ids.length) await client.query(`DELETE FROM ${table} WHERE ${column} = ANY($1::text[])`, [ids]);
}

async function bulkUpsertRows(client, rows, sql, serialize) {
  if (!rows.length) return;
  await client.query(sql, [JSON.stringify(rows.map(serialize))]);
}

async function persistPostgresRows(client, previous, next) {
  const before = normalizeDatabase(previous);
  const clean = normalizeDatabase(next);
  const changes = {
    sets: changedRows(before.sets, clean.sets, 'key'),
    students: changedRows(before.students, clean.students, 'studentId'),
    teachers: changedRows(before.teachers, clean.teachers, 'id'),
    questionBank: changedRows(before.questionBank, clean.questionBank, 'id'),
    results: changedRows(before.results, clean.results, 'id'),
    drafts: changedRows(before.drafts, clean.drafts, 'draftKey'),
    auditLogs: changedRows(before.auditLogs, clean.auditLogs, 'id'),
    settingsChanged: JSON.stringify(before.settings) !== JSON.stringify(clean.settings)
  };
  try {
    await deleteRows(client, 'results', 'id', deletedIds(before.results, clean.results, 'id'));
    await deleteRows(client, 'question_bank', 'id', deletedIds(before.questionBank, clean.questionBank, 'id'));
    await deleteRows(client, 'exam_sets', 'key', deletedIds(before.sets, clean.sets, 'key'));
    await deleteRows(client, 'students', 'student_id', deletedIds(before.students, clean.students, 'studentId'));
    await deleteRows(client, 'teachers', 'id', deletedIds(before.teachers, clean.teachers, 'id'));
    await deleteRows(client, 'exam_drafts', 'draft_key', deletedIds(before.drafts, clean.drafts, 'draftKey'));
    await bulkUpsertRows(client, changes.sets,
      'INSERT INTO exam_sets (key,title,teacher_id,delivery,available_from,available_until,created_at,updated_at,data) SELECT key,title,teacher_id,delivery,available_from,available_until,created_at,updated_at,data FROM jsonb_to_recordset($1::jsonb) AS x(key text,title text,teacher_id text,delivery text,available_from timestamptz,available_until timestamptz,created_at timestamptz,updated_at timestamptz,data jsonb) ON CONFLICT (key) DO UPDATE SET title=EXCLUDED.title,teacher_id=EXCLUDED.teacher_id,delivery=EXCLUDED.delivery,available_from=EXCLUDED.available_from,available_until=EXCLUDED.available_until,created_at=EXCLUDED.created_at,updated_at=EXCLUDED.updated_at,data=EXCLUDED.data',
      set => ({ key: set.key, title: set.title || '', teacher_id: set.teacherId || null, delivery: set.delivery || null, available_from: set.availableFrom || null, available_until: set.availableUntil || null, created_at: set.createdAt || null, updated_at: set.updatedAt || null, data: set }));
    await bulkUpsertRows(client, changes.students,
      'INSERT INTO students (student_id,first_name,last_name,class_room,created_at,data) SELECT student_id,first_name,last_name,class_room,created_at,data FROM jsonb_to_recordset($1::jsonb) AS x(student_id text,first_name text,last_name text,class_room text,created_at timestamptz,data jsonb) ON CONFLICT (student_id) DO UPDATE SET first_name=EXCLUDED.first_name,last_name=EXCLUDED.last_name,class_room=EXCLUDED.class_room,created_at=EXCLUDED.created_at,data=EXCLUDED.data',
      student => ({ student_id: student.studentId, first_name: student.firstName || '', last_name: student.lastName || '', class_room: student.classRoom || null, created_at: student.createdAt || null, data: student }));
    await bulkUpsertRows(client, changes.teachers,
      'INSERT INTO teachers (id,username,first_name,last_name,created_at,data) SELECT id,username,first_name,last_name,created_at,data FROM jsonb_to_recordset($1::jsonb) AS x(id text,username text,first_name text,last_name text,created_at timestamptz,data jsonb) ON CONFLICT (id) DO UPDATE SET username=EXCLUDED.username,first_name=EXCLUDED.first_name,last_name=EXCLUDED.last_name,created_at=EXCLUDED.created_at,data=EXCLUDED.data',
      teacher => ({ id: teacher.id, username: teacher.username, first_name: teacher.firstName || '', last_name: teacher.lastName || '', created_at: teacher.createdAt || null, data: teacher }));
    await bulkUpsertRows(client, changes.questionBank,
      'INSERT INTO question_bank (id,owner_id,course_name,created_at,data) SELECT id,owner_id,course_name,created_at,data FROM jsonb_to_recordset($1::jsonb) AS x(id text,owner_id text,course_name text,created_at timestamptz,data jsonb) ON CONFLICT (id) DO UPDATE SET owner_id=EXCLUDED.owner_id,course_name=EXCLUDED.course_name,created_at=EXCLUDED.created_at,data=EXCLUDED.data',
      question => ({ id: question.id, owner_id: question.ownerId || null, course_name: question.courseName || '', created_at: question.createdAt || null, data: question }));
    await bulkUpsertRows(client, changes.results,
      'INSERT INTO results (id,student_id,question_key,attempt_key,submitted_at,published,overall_score_20,data) SELECT id,student_id,question_key,attempt_key,submitted_at,published,overall_score_20,data FROM jsonb_to_recordset($1::jsonb) AS x(id text,student_id text,question_key text,attempt_key text,submitted_at timestamptz,published boolean,overall_score_20 double precision,data jsonb) ON CONFLICT (id) DO UPDATE SET student_id=EXCLUDED.student_id,question_key=EXCLUDED.question_key,attempt_key=EXCLUDED.attempt_key,submitted_at=EXCLUDED.submitted_at,published=EXCLUDED.published,overall_score_20=EXCLUDED.overall_score_20,data=EXCLUDED.data',
      result => ({ id: result.id, student_id: result.studentId, question_key: result.questionKey, attempt_key: result.attemptKey || null, submitted_at: result.submittedAt || null, published: !!result.published, overall_score_20: result.overallScore20 ?? null, data: result }));
    await bulkUpsertRows(client, changes.drafts,
      'INSERT INTO exam_drafts (draft_key,student_id,question_key,updated_at,data) SELECT draft_key,student_id,question_key,updated_at,data FROM jsonb_to_recordset($1::jsonb) AS x(draft_key text,student_id text,question_key text,updated_at timestamptz,data jsonb) ON CONFLICT (draft_key) DO UPDATE SET student_id=EXCLUDED.student_id,question_key=EXCLUDED.question_key,updated_at=EXCLUDED.updated_at,data=EXCLUDED.data',
      draft => ({ draft_key: draft.draftKey, student_id: draft.studentId, question_key: draft.questionKey, updated_at: draft.savedAt || new Date().toISOString(), data: draft }));
    await bulkUpsertRows(client, changes.auditLogs,
      'INSERT INTO audit_logs (id,event_at,actor_type,actor_id,action,target_type,target_id,question_key,data) SELECT id,event_at,actor_type,actor_id,action,target_type,target_id,question_key,data FROM jsonb_to_recordset($1::jsonb) AS x(id text,event_at timestamptz,actor_type text,actor_id text,action text,target_type text,target_id text,question_key text,data jsonb) ON CONFLICT (id) DO NOTHING',
      event => ({ id: event.id, event_at: event.eventAt, actor_type: event.actorType, actor_id: event.actorId || null, action: event.action, target_type: event.targetType || null, target_id: event.targetId || null, question_key: event.questionKey || null, data: event }));
    if (changes.settingsChanged) await client.query(
      'INSERT INTO system_settings (id, data, updated_at) VALUES ($1,$2::jsonb,NOW()) ON CONFLICT (id) DO UPDATE SET data=EXCLUDED.data, updated_at=NOW()',
      ['main', JSON.stringify(clean.settings)]
    );
  } catch (error) { throw error; }
}

async function persistPostgresChanges(previous, next) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('exam_system_write'))");
    await persistPostgresRows(client, previous, next);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

async function persistPostgres(db) {
  return persistPostgresChanges(emptyDatabase(), db);
}

async function initializePostgres() {
  pool = new Pool({
    connectionString: DATABASE_URL,
    // Neon requires TLS. Set DATABASE_SSL=false only for a local PostgreSQL server without TLS.
    ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false }
  });
  await pool.query(`
    CREATE TABLE IF NOT EXISTS exam_sets (
      key TEXT PRIMARY KEY, title TEXT NOT NULL DEFAULT '', teacher_id TEXT, delivery TEXT,
      available_from TIMESTAMPTZ, available_until TIMESTAMPTZ, created_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ, data JSONB NOT NULL
    );
    CREATE TABLE IF NOT EXISTS students (
      student_id TEXT PRIMARY KEY, first_name TEXT NOT NULL DEFAULT '', last_name TEXT NOT NULL DEFAULT '',
      class_room TEXT, created_at TIMESTAMPTZ, data JSONB NOT NULL
    );
    CREATE TABLE IF NOT EXISTS teachers (
      id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, first_name TEXT NOT NULL DEFAULT '',
      last_name TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ, data JSONB NOT NULL
    );
    CREATE TABLE IF NOT EXISTS question_bank (
      id TEXT PRIMARY KEY, owner_id TEXT, course_name TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ, data JSONB NOT NULL
    );
    CREATE TABLE IF NOT EXISTS results (
      id TEXT PRIMARY KEY, student_id TEXT NOT NULL, question_key TEXT NOT NULL, attempt_key TEXT, submitted_at TIMESTAMPTZ,
      published BOOLEAN NOT NULL DEFAULT FALSE, overall_score_20 DOUBLE PRECISION, data JSONB NOT NULL
    );
    CREATE TABLE IF NOT EXISTS exam_drafts (
      draft_key TEXT PRIMARY KEY, student_id TEXT NOT NULL, question_key TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), data JSONB NOT NULL
    );
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY, event_at TIMESTAMPTZ NOT NULL, actor_type TEXT NOT NULL, actor_id TEXT,
      action TEXT NOT NULL, target_type TEXT, target_id TEXT, question_key TEXT, data JSONB NOT NULL
    );
    ALTER TABLE results DROP CONSTRAINT IF EXISTS results_student_id_question_key_key;
    ALTER TABLE results ADD COLUMN IF NOT EXISTS attempt_key TEXT;
    CREATE INDEX IF NOT EXISTS idx_exam_sets_teacher_id ON exam_sets(teacher_id);
    CREATE INDEX IF NOT EXISTS idx_exam_sets_available_from ON exam_sets(available_from);
    CREATE INDEX IF NOT EXISTS idx_students_class_room ON students(class_room);
    CREATE INDEX IF NOT EXISTS idx_results_question_key ON results(question_key);
    CREATE INDEX IF NOT EXISTS idx_results_student_id ON results(student_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_results_attempt_key ON results(attempt_key) WHERE attempt_key IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_results_question_submitted ON results(question_key, submitted_at DESC);
    CREATE INDEX IF NOT EXISTS idx_results_student_question ON results(student_id, question_key);
    CREATE INDEX IF NOT EXISTS idx_exam_drafts_student ON exam_drafts(student_id);
    CREATE INDEX IF NOT EXISTS idx_exam_drafts_question ON exam_drafts(question_key);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_event_at ON audit_logs(event_at DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_target_id ON audit_logs(target_id);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_question_key ON audit_logs(question_key);
    CREATE INDEX IF NOT EXISTS idx_question_bank_owner_id ON question_bank(owner_id);
    CREATE TABLE IF NOT EXISTS exam_system_state (
      id SMALLINT PRIMARY KEY CHECK (id = 1),
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
    ;
    CREATE TABLE IF NOT EXISTS system_settings (
      id TEXT PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  const normalized = await readPostgresDatabase();
  if (hasData(normalized)) {
    currentDatabase = normalized;
    return;
  }

  const state = await pool.query('SELECT data FROM exam_system_state WHERE id = 1');
  if (state.rowCount && hasData(normalizeDatabase(state.rows[0].data))) {
    currentDatabase = normalizeDatabase(state.rows[0].data);
    await persistPostgres(currentDatabase);
    console.log('Migrated PostgreSQL legacy state into normalized tables.');
    return;
  }

  const sqliteData = readSqliteDatabase();
  if (hasData(sqliteData)) {
    currentDatabase = normalizeDatabase(sqliteData);
    await persistPostgres(currentDatabase);
    console.log('Migrated local SQLite data to PostgreSQL tables.');
  }
}

const databaseReady = DATABASE_URL ? initializePostgres() : Promise.resolve();

async function pingDatabase({ timeoutMs = 3000 } = {}) {
  const startedAt = Date.now();
  const probe = DATABASE_URL
    ? pool.query('SELECT 1')
    : Promise.resolve(sqlite.prepare('SELECT 1 AS ok').get());
  let timer;
  try {
    await Promise.race([
      probe,
      new Promise((resolve, reject) => {
        timer = setTimeout(() => reject(new Error('Database readiness probe timed out')), timeoutMs);
        timer.unref?.();
      })
    ]);
    return { status: 'connected', engine: DATABASE_URL ? 'PostgreSQL' : 'SQLite', latencyMs: Date.now() - startedAt };
  } finally {
    clearTimeout(timer);
  }
}

function readDB() {
  return structuredClone(currentDatabase);
}

// High-volume student routes only inspect these objects. Returning the live
// read-only view avoids cloning every student, draft and result per request.
// Mutating/admin routes must continue to use readDB() and writeDB()/mutateDB().
function readDBView() {
  return currentDatabase;
}

function writeDB(db) {
  const intended = normalizeDatabase(structuredClone(db));
  const base = currentDatabase;
  const operation = writeChain.catch(() => {}).then(async () => {
    if (!DATABASE_URL) {
      const fresh = readSqliteDatabase();
      const merged = mergeDatabaseChanges(base, intended, fresh);
      persistSqliteChanges(fresh, merged);
      currentDatabase = merged;
      return;
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT pg_advisory_xact_lock(hashtext('exam_system_write'))");
      // Application reads are served from currentDatabase, so a second instance would
      // already have stale reads. Keep writes consistent with that architecture and merge
      // this request's delta into the latest in-process snapshot. persistPostgresRows then
      // sends only changed/deleted rows to Postgres instead of downloading every table.
      const fresh = currentDatabase;
      const merged = mergeDatabaseChanges(base, intended, fresh);
      await persistPostgresRows(client, fresh, merged);
      await client.query('COMMIT');
      currentDatabase = merged;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  });
  writeChain = operation.catch(() => {});
  return operation;
}

let mutationChain = Promise.resolve();
function mutateDB(mutator) {
  const run = writeChain.catch(() => {}).then(async () => {
    if (!DATABASE_URL) {
      const fresh = readSqliteDatabase();
      const snapshot = structuredClone(fresh);
      const value = await mutator(snapshot);
      const clean = normalizeDatabase(snapshot);
      persistSqliteChanges(fresh, clean);
      currentDatabase = clean;
      return value;
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT pg_advisory_xact_lock(hashtext('exam_system_write'))");
      const fresh = currentDatabase;
      const snapshot = structuredClone(fresh);
      const value = await mutator(snapshot);
      const clean = normalizeDatabase(snapshot);
      await persistPostgresRows(client, fresh, clean);
      await client.query('COMMIT');
      currentDatabase = clean;
      return value;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  });
  writeChain = run.catch(() => {});
  mutationChain = writeChain;
  return run;
}

function mutateExamDraft(draftKey, mutator) {
  if (!DATABASE_URL) {
    return mutateDB(db => {
      const current = db.drafts.find(draft => draft.draftKey === draftKey) || null;
      const next = mutator(current ? structuredClone(current) : null);
      db.drafts = db.drafts.filter(draft => draft.draftKey !== draftKey);
      if (next) db.drafts.push(next);
      return next;
    });
  }
  const run = (async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Lock only this student's draft. Different students can now autosave in
      // parallel instead of waiting behind one application-wide advisory lock.
      const selected = await client.query('SELECT data FROM exam_drafts WHERE draft_key = $1 FOR UPDATE', [draftKey]);
      const current = selected.rows[0]?.data || null;
      const next = mutator(current ? structuredClone(current) : null);
      if (next) {
        await client.query(
          'INSERT INTO exam_drafts (draft_key, student_id, question_key, updated_at, data) VALUES ($1,$2,$3,$4,$5::jsonb) ON CONFLICT (draft_key) DO UPDATE SET student_id=EXCLUDED.student_id, question_key=EXCLUDED.question_key, updated_at=EXCLUDED.updated_at, data=EXCLUDED.data',
          [draftKey, next.studentId, next.questionKey, next.savedAt || new Date().toISOString(), JSON.stringify(next)]
        );
      } else {
        await client.query('DELETE FROM exam_drafts WHERE draft_key = $1', [draftKey]);
      }
      await client.query('COMMIT');
      currentDatabase.drafts = currentDatabase.drafts.filter(draft => draft.draftKey !== draftKey);
      if (next) currentDatabase.drafts.push(structuredClone(next));
      return next;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  })();
  return trackDirectWrite(run);
}

function saveExamSubmission(record, { resit = null } = {}) {
  if (!DATABASE_URL) {
    return mutateDB(latest => {
      const existing = latest.results.find(item => item.attemptKey === record.attemptKey);
      if (existing) return existing;
      latest.results.push(record);
      latest.drafts = latest.drafts.filter(draft => draft.draftKey !== `${record.studentId}::${record.questionKey}::${resit?.id || 'normal'}`);
      if (resit) {
        const latestSet = latest.sets.find(item => item.key === record.questionKey);
        const latestResit = (latestSet?.resitAccesses || []).find(item => item.id === resit.id);
        if (latestResit) { latestResit.usedResultId = record.id; latestResit.usedAt = record.submittedAt; }
      }
      return record;
    });
  }
  const run = (async () => {
    const client = await pool.connect();
    let updatedSet = null;
    try {
      await client.query('BEGIN');
      const inserted = await client.query(
        `INSERT INTO results (id,student_id,question_key,attempt_key,submitted_at,published,overall_score_20,data)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
         ON CONFLICT (attempt_key) WHERE attempt_key IS NOT NULL DO NOTHING
         RETURNING data`,
        [record.id, record.studentId, record.questionKey, record.attemptKey, record.submittedAt, !!record.published, record.overallScore20 ?? null, JSON.stringify(record)]
      );
      if (!inserted.rowCount) {
        const existing = await client.query('SELECT data FROM results WHERE attempt_key = $1', [record.attemptKey]);
        await client.query('ROLLBACK');
        return existing.rows[0]?.data || record;
      }
      await client.query('DELETE FROM exam_drafts WHERE draft_key = $1', [`${record.studentId}::${record.questionKey}::${resit?.id || 'normal'}`]);
      if (resit) {
        const selected = await client.query('SELECT data FROM exam_sets WHERE key = $1 FOR UPDATE', [record.questionKey]);
        updatedSet = selected.rows[0]?.data || null;
        const latestResit = (updatedSet?.resitAccesses || []).find(item => item.id === resit.id);
        if (latestResit) {
          latestResit.usedResultId = record.id;
          latestResit.usedAt = record.submittedAt;
          updatedSet.updatedAt = new Date().toISOString();
          await client.query('UPDATE exam_sets SET data=$2::jsonb, updated_at=$3 WHERE key=$1', [record.questionKey, JSON.stringify(updatedSet), updatedSet.updatedAt]);
        }
      }
      await client.query('COMMIT');
      if (!currentDatabase.results.some(item => item.attemptKey === record.attemptKey)) currentDatabase.results.push(structuredClone(record));
      currentDatabase.drafts = currentDatabase.drafts.filter(draft => draft.draftKey !== `${record.studentId}::${record.questionKey}::${resit?.id || 'normal'}`);
      if (updatedSet) currentDatabase.sets = currentDatabase.sets.map(set => set.key === updatedSet.key ? structuredClone(updatedSet) : set);
      return record;
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch {}
      throw error;
    } finally { client.release(); }
  })();
  return trackDirectWrite(run);
}

function replaceDB(db) {
  const intended = normalizeDatabase(structuredClone(db));
  const run = writeChain.catch(() => {}).then(async () => {
    if (!DATABASE_URL) {
      const fresh = readSqliteDatabase();
      persistSqliteChanges(fresh, intended);
      currentDatabase = intended;
      return;
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT pg_advisory_xact_lock(hashtext('exam_system_write'))");
      const fresh = await readPostgresDatabase(client);
      await persistPostgresRows(client, fresh, intended);
      await client.query('COMMIT');
      currentDatabase = intended;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  });
  writeChain = run.catch(() => {});
  mutationChain = writeChain;
  return run;
}

async function closeDatabase() {
  let failure = null;
  try { await mutationChain; } catch (error) { failure = error; }
  try { await writeChain; } catch (error) { failure = error; }
  try { await Promise.allSettled([...directWrites]); } catch (error) { failure = error; }
  try {
    if (pool) {
      await pool.end();
      pool = null;
    }
  } catch (error) {
    failure ||= error;
  }
  try { sqlite.close(); } catch (error) { failure ||= error; }
  if (failure) throw failure;
}

module.exports = { readDB, readDBView, writeDB, mutateDB, mutateExamDraft, saveExamSubmission, replaceDB, closeDatabase, databaseReady, pingDatabase, changedRows, deletedIds, mergeDatabaseChanges };
