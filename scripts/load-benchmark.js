/* Local, isolated end-to-end load test. It never uses DATABASE_URL or production data. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { performance, monitorEventLoopDelay } = require('perf_hooks');

const USERS = Math.max(1, Number(process.argv[2] || 1000));
const AUTOSAVES = Math.max(0, Number(process.argv[3] || 1));
const REQUEST_CONCURRENCY = Math.max(1, Number(process.argv[4] || 200));
const tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'exam-load-test-'));
const envFile = path.join(__dirname, '..', '.env');
const localEnv = fs.existsSync(envFile) ? require('dotenv').parse(fs.readFileSync(envFile)) : {};
const loadTestDatabaseUrl = String(process.env.LOAD_TEST_DATABASE_URL || '').trim();
if (loadTestDatabaseUrl) {
  if (process.env.LOAD_TEST_ALLOW_RESET !== 'YES') throw new Error('PostgreSQL load test requires LOAD_TEST_ALLOW_RESET=YES because it resets the target database.');
  if (localEnv.DATABASE_URL && loadTestDatabaseUrl === localEnv.DATABASE_URL) throw new Error('Refusing to reset the production DATABASE_URL from .env. Use a separate staging database.');
}
process.env.NODE_ENV = loadTestDatabaseUrl ? 'load-test' : 'test';
process.env.DATABASE_URL = loadTestDatabaseUrl;
process.env.REDIS_URL = '';
process.env.EXAM_DATA_DIR = tempDataDir;
process.env.BACKUP_ENABLED = 'false';
process.env.RESTORE_DRILL_ENABLED = 'false';

const app = require('../server');
const { readDB, replaceDB, closeDatabase } = require('../src/database');
const { createStudentSession, sessionStore } = require('../src/auth');

const eventLoop = monitorEventLoopDelay({ resolution: 20 });
eventLoop.enable();

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

async function phase(name, tasks, sampleServerLoad) {
  const started = performance.now();
  const results = new Array(tasks.length);
  let cursor = 0;
  const loadSamples = [];
  let sampling = true;
  const sample = async () => {
    try { const snapshot = await sampleServerLoad(); if (snapshot) loadSamples.push(snapshot); } catch {}
  };
  await sample();
  const sampler = setInterval(() => { if (sampling) void sample(); }, 250);
  sampler.unref?.();
  async function worker() {
    while (cursor < tasks.length) {
      const index = cursor++;
      results[index] = await tasks[index]();
    }
  }
  await Promise.all(Array.from({ length: Math.min(REQUEST_CONCURRENCY, tasks.length) }, worker));
  sampling = false;
  clearInterval(sampler);
  const elapsedMs = performance.now() - started;
  const latencies = results.map(result => result.ms);
  const statuses = {};
  const errors = {};
  for (const result of results) statuses[result.status] = (statuses[result.status] || 0) + 1;
  for (const result of results) if (result.error) errors[result.error] = (errors[result.error] || 0) + 1;
  const peakLoad = loadSamples.reduce((peak, sample) => !peak || sample.percent > peak.percent ? sample : peak, null);
  return {
    name,
    requests: results.length,
    seconds: +(elapsedMs / 1000).toFixed(3),
    requestsPerSecond: +(results.length / (elapsedMs / 1000)).toFixed(1),
    latencyMs: {
      p50: +percentile(latencies, 50).toFixed(1),
      p95: +percentile(latencies, 95).toFixed(1),
      p99: +percentile(latencies, 99).toFixed(1),
      max: +Math.max(...latencies).toFixed(1)
    },
    statuses,
    ...(Object.keys(errors).length ? { errors } : {}),
    serverLoad: peakLoad ? { samples: loadSamples.length, peakPercent: peakLoad.percent, peakLevel: peakLoad.level, peakComponents: peakLoad.components } : null
  };
}

async function main() {
  await app.ready;
  const now = Date.now();
  const set = {
    key: 'load_exam', title: 'Load test exam', courseName: 'Load test', examType: 'กลางภาค',
    assignedClasses: ['LOAD/1'], availableFrom: new Date(now - 3600000).toISOString(),
    availableUntil: new Date(now + 3600000).toISOString(), publishMode: 'manual',
    sections: {
      mc: { title: 'MC', desc: '', questions: [{ id: 'mc1', text: '1+1?', choices: ['1', '2'], answer: 1, points: 10 }] },
      matching: { title: 'Matching', desc: '', left: [], right: [], correctMap: {}, pointsEach: 0 },
      written: { title: 'Written', desc: '', questions: [{ id: 'w1', text: 'Answer test', keywords: ['test'], maxPoints: 10 }] }
    },
    createdAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString()
  };
  const students = Array.from({ length: USERS }, (_, index) => ({
    studentId: `load_${String(index + 1).padStart(5, '0')}`,
    firstName: 'Load', lastName: `User ${index + 1}`, classRoom: 'LOAD/1', createdAt: new Date(now).toISOString()
  }));
  await replaceDB({ sets: [set], results: [], students, teachers: [], questionBank: [], drafts: [], auditLogs: [], settings: { academicCalendar: [] } });
  const tokens = await Promise.all(students.map(student => createStudentSession(student.studentId)));

  const server = await new Promise(resolve => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const adminKey = localEnv.ADMIN_KEY || 'changeme123';
  const sampleServerLoad = async () => {
    const response = await fetch(baseUrl + '/api/admin/operations', { headers: { 'x-admin-key': adminKey } });
    if (!response.ok) return null;
    const data = await response.json();
    return data.serverLoad || null;
  };
  const call = (index, route, options = {}) => async () => {
    const started = performance.now();
    const retries = Number(options.retries || 0);
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await fetch(baseUrl + route, {
          ...options,
          headers: { 'x-student-token': tokens[index], ...(options.body ? { 'content-type': 'application/json' } : {}), ...(options.headers || {}) }
        });
        await response.arrayBuffer();
        if (response.status !== 503 || attempt === retries) return { status: response.status, ms: performance.now() - started };
      } catch (error) {
        if (attempt === retries) return { status: 'network_error', ms: performance.now() - started, error: error.message };
      }
      await new Promise(resolve => setTimeout(resolve, 250 * (2 ** attempt)));
    }
  };

  const report = [];
  report.push(await phase('session_and_exam_reads', students.flatMap((_, i) => [
    call(i, '/api/student/session'), call(i, '/api/sets')
  ]), sampleServerLoad));
  report.push(await phase('claim_exam_device', students.map((_, i) => call(i, '/api/exam-drafts/load_exam/claim', {
    method: 'POST', body: JSON.stringify({ deviceId: `device_load_${String(i).padStart(12, '0')}` })
  })), sampleServerLoad));
  for (let revision = 0; revision < AUTOSAVES; revision++) {
    report.push(await phase(`autosave_${revision + 1}`, students.map((_, i) => call(i, '/api/exam-drafts/load_exam', {
      method: 'PUT', body: JSON.stringify({ draft: {
        deviceId: `device_load_${String(i).padStart(12, '0')}`, revision,
        examEndTime: new Date(now + 3600000).toISOString(), draftAnswers: { mc: { mc1: 1 }, matching: {}, written: { w1: 'test' } }
      } })
    })), sampleServerLoad));
  }
  report.push(await phase('final_submission', students.map((_, i) => call(i, '/api/results', {
    method: 'POST', retries: 2, body: JSON.stringify({
      questionKey: 'load_exam', deviceId: `device_load_${String(i).padStart(12, '0')}`,
      answers: { mc: { mc1: 1 }, matching: {}, written: { w1: 'test' } }
    })
  })), sampleServerLoad));

  const memory = process.memoryUsage();
  const finalDatabase = readDB();
  const output = {
    environment: { users: USERS, requestConcurrency: REQUEST_CONCURRENCY, autosavesPerUser: AUTOSAVES, database: loadTestDatabaseUrl ? 'staging PostgreSQL' : 'isolated SQLite', sessions: 'in-process memory', node: process.version, platform: `${process.platform}/${process.arch}`, cpuCount: os.cpus().length },
    phases: report,
    eventLoopDelayMs: { mean: +(eventLoop.mean / 1e6).toFixed(1), p99: +(eventLoop.percentile(99) / 1e6).toFixed(1), max: +(eventLoop.max / 1e6).toFixed(1) },
    memoryMB: { rss: +(memory.rss / 1048576).toFixed(1), heapUsed: +(memory.heapUsed / 1048576).toFixed(1) },
    integrity: { storedResults: finalDatabase.results.length, duplicateAttemptKeys: finalDatabase.results.length - new Set(finalDatabase.results.map(result => result.attemptKey)).size, remainingDrafts: finalDatabase.drafts.length }
  };
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  await new Promise(resolve => server.close(resolve));
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  eventLoop.disable();
  try { await sessionStore.close(); } catch {}
  try { await closeDatabase(); } catch {}
  try { fs.rmSync(tempDataDir, { recursive: true, force: true }); } catch {}
});
