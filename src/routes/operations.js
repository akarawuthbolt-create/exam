const fs = require('fs');
const { DATABASE_URL, SQLITE_PATH } = require('../config');
const { verificationSummary, verificationReport } = require('../score-verification');
const { readinessSummary } = require('../exam-readiness');
const { appendAuditLog } = require('../audit-log');

function serverLoadSnapshot({ submissions = {}, jobs = {}, requests = {} }, memory = process.memoryUsage()) {
  const heapPercent = memory.heapTotal ? (memory.heapUsed / memory.heapTotal) * 100 : 0;
  const submissionPercent = submissions.maxConcurrent ? (submissions.active / submissions.maxConcurrent) * 100 : 0;
  const submissionQueuePercent = submissions.maxPending ? (submissions.pending / submissions.maxPending) * 100 : 0;
  const jobQueuePercent = jobs.maxPending ? (jobs.pending / jobs.maxPending) * 100 : 0;
  const inFlightPercent = Math.min(100, (requests.inFlight / 50) * 100);
  const eventLoopPercent = Math.min(100, (Number(requests.eventLoopDelayMs) / 500) * 100);
  const weightedPercent = heapPercent * .2 + submissionPercent * .3 + submissionQueuePercent * .2 + jobQueuePercent * .15 + inFlightPercent * .05 + eventLoopPercent * .1;
  const percent = Math.round(Math.min(100, Math.max(weightedPercent, eventLoopPercent)));
  return { percent, level: percent >= 85 ? 'critical' : percent >= 60 ? 'warning' : 'normal', components: { heapPercent: Math.round(heapPercent), submissionPercent: Math.round(submissionPercent), submissionQueuePercent: Math.round(submissionQueuePercent), jobQueuePercent: Math.round(jobQueuePercent), inFlightPercent: Math.round(inFlightPercent), eventLoopDelayMs: Math.round(Number(requests.eventLoopDelayMs) || 0) } };
}

function liveOperationsSnapshot(db, { submissions, jobs, requests }, now = Date.now()) {
  const activeStudentIds = new Set(db.drafts.filter(draft => draft.studentId && new Date(draft.lockUntil || 0).getTime() > now).map(draft => draft.studentId));
  const recentCutoff = now - 5 * 60 * 1000;
  const activeExams = db.sets.filter(set => !set.archived && !set.deletedAt && (!set.availableFrom || new Date(set.availableFrom).getTime() <= now) && (!set.availableUntil || new Date(set.availableUntil).getTime() >= now)).length;
  return {
    generatedAt: new Date(now).toISOString(), activeStudents: activeStudentIds.size, activeExams,
    resultsLast5Minutes: db.results.filter(result => new Date(result.submittedAt || 0).getTime() >= recentCutoff).length,
    submissions: { active: submissions.active, pending: submissions.pending, overloaded: submissions.overloaded },
    jobs: { active: jobs.active, pending: jobs.pending, failed: jobs.failed },
    api: { inFlight: requests.inFlight, errorRatePercent: requests.errorRatePercent },
    serverLoad: serverLoadSnapshot({ submissions, jobs, requests })
  };
}

function examPulseSnapshot(db, now = Date.now()) {
  const students = new Map((db.students || []).map(student => [String(student.studentId), student]));
  const sets = new Map((db.sets || []).map(set => [String(set.key), set]));
  const rank = { offline: 0, ending: 1, active: 2, ended: 3 };
  const entries = (db.drafts || []).map(draft => {
    const savedAt = Date.parse(draft.savedAt || 0), endAt = Date.parse(draft.examEndTime || 0), lastSavedSeconds = Number.isFinite(savedAt) ? Math.max(0, Math.floor((now - savedAt) / 1000)) : null, remainingSeconds = Number.isFinite(endAt) ? Math.floor((endAt - now) / 1000) : null;
    const student = students.get(String(draft.studentId)) || {}, set = sets.get(String(draft.questionKey)) || {};
    const status = remainingSeconds !== null && remainingSeconds <= 0 ? 'ended' : lastSavedSeconds !== null && lastSavedSeconds > 90 ? 'offline' : remainingSeconds !== null && remainingSeconds <= 300 ? 'ending' : 'active';
    return { draftKey: draft.draftKey, studentId: String(draft.studentId || ''), studentName: `${student.firstName || ''} ${student.lastName || ''}`.trim(), classRoom: student.classRoom || '', questionKey: draft.questionKey, examTitle: set.title || draft.questionKey, savedAt: draft.savedAt || null, lastSavedSeconds, remainingSeconds, status, canRescue: status !== 'ended' };
  }).filter(entry => entry.remainingSeconds === null || entry.remainingSeconds > -15 * 60).sort((a, b) => rank[a.status] - rank[b.status] || (b.lastSavedSeconds || 0) - (a.lastSavedSeconds || 0));
  return { generatedAt: new Date(now).toISOString(), summary: { active: entries.filter(item => item.status === 'active').length, ending: entries.filter(item => item.status === 'ending').length, offline: entries.filter(item => item.status === 'offline').length }, entries };
}

function registerOperationsRoutes(app, { requireAdmin, readDB, mutateDB, newId, assetStorage, runtimeMetrics, submissionGate, pingDatabase, readinessTimeoutMs, backupService, restoreDrill, enqueueRestoreDrill, systemMonitor, alertManager, jobQueue, sessionStore, scoreEmailService }) {
  app.get('/api/admin/exam-pulse', requireAdmin, (req, res) => res.json(examPulseSnapshot(readDB())));
  app.post('/api/admin/exam-pulse/:draftKey/rescue', requireAdmin, async (req, res) => {
    const reason = String(req.body?.reason || '').trim(); if (!reason || reason.length > 300) return res.status(400).json({ error: 'invalid_reason', message: 'กรุณาระบุเหตุผลไม่เกิน 300 ตัวอักษร' });
    let released = false;
    await mutateDB(db => { const draft = (db.drafts || []).find(item => item.draftKey === req.params.draftKey); if (!draft) return; const before = { deviceId: draft.deviceId || null, lockUntil: draft.lockUntil || null }; draft.lockUntil = new Date().toISOString(); draft.rescuedAt = new Date().toISOString(); appendAuditLog(db, { newId, actorType: 'admin', actorId: 'admin', action: 'exam_pulse_release_device', targetType: 'exam_draft', targetId: draft.draftKey, questionKey: draft.questionKey, before, after: { deviceId: draft.deviceId || null, lockUntil: draft.lockUntil }, reason }); released = true; });
    if (!released) return res.status(404).json({ error: 'not_found', message: 'ไม่พบสถานะการทำข้อสอบนี้' }); res.json({ ok: true });
  });
  app.delete('/api/admin/exam-pulse/:draftKey', requireAdmin, async (req, res) => {
    const reason = String(req.body?.reason || '').trim(); if (!reason || reason.length > 300) return res.status(400).json({ error: 'invalid_reason', message: 'กรุณาระบุเหตุผลไม่เกิน 300 ตัวอักษร' });
    let removed = false;
    await mutateDB(db => {
      const index = (db.drafts || []).findIndex(item => item.draftKey === req.params.draftKey);
      if (index === -1) return;
      const [draft] = db.drafts.splice(index, 1);
      appendAuditLog(db, { newId, actorType: 'admin', actorId: 'admin', action: 'exam_pulse_delete_draft', targetType: 'exam_draft', targetId: draft.draftKey, questionKey: draft.questionKey, before: { studentId: draft.studentId, questionKey: draft.questionKey }, after: null, reason });
      removed = true;
    });
    if (!removed) return res.status(404).json({ error: 'not_found', message: 'ไม่พบสถานะการทำข้อสอบนี้' }); res.json({ ok: true });
  });
  app.get('/api/admin/operations/score-verification', requireAdmin, (req, res) => {
    const db = readDB();
    res.json({ generatedAt: new Date().toISOString(), summary: verificationSummary(db), issues: verificationReport(db) });
  });

  let activeStreams = 0;
  app.get('/api/admin/operations/stream', requireAdmin, (req, res) => {
    if (activeStreams >= 5) return res.status(429).json({ error: 'stream_limit', message: 'Too many live Operations connections.' });
    activeStreams += 1;
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    res.write('retry: 3000\n\n');
    const publish = () => {
      const snapshot = liveOperationsSnapshot(readDB(), { submissions: submissionGate.snapshot(), jobs: jobQueue.snapshot(), requests: runtimeMetrics.snapshot() });
      res.write(`event: operations\ndata: ${JSON.stringify(snapshot)}\n\n`);
    };
    publish();
    const timer = setInterval(publish, 3000);
    timer.unref?.();
    let closed = false;
    const close = () => { if (closed) return; closed = true; clearInterval(timer); activeStreams = Math.max(0, activeStreams - 1); };
    req.once('close', close);
    res.once('close', close);
  });

  app.post('/api/admin/operations/restore-drill', requireAdmin, (req, res) => {
    if (!restoreDrill.status().configured) return res.status(409).json({ error: 'restore_drill_not_configured', message: 'Encrypted backup and restore drill must be configured first.' });
    const queued = enqueueRestoreDrill();
    res.status(queued.accepted ? 202 : 409).json(queued);
  });

  app.get('/api/admin/operations', requireAdmin, async (req, res) => {
    const db = readDB();
    const memory = process.memoryUsage();
    const requests = runtimeMetrics.snapshot();
    requests.inFlight = Math.max(0, requests.inFlight - 1);
    let databaseBytes = null;
    if (!DATABASE_URL) {
      try { databaseBytes = fs.statSync(SQLITE_PATH).size; } catch (error) { databaseBytes = null; }
    }
    const recentActivity = [...db.auditLogs]
      .sort((a, b) => String(b.eventAt || '').localeCompare(String(a.eventAt || '')))
      .slice(0, 8)
      .map(event => ({ id: event.id, eventAt: event.eventAt, action: event.action, actorType: event.actorType, actorId: event.actorId || '', targetId: event.targetId || '' }));

    let database;
    try { database = await pingDatabase({ timeoutMs: readinessTimeoutMs }); }
    catch (error) { database = { status: 'disconnected', engine: DATABASE_URL ? 'PostgreSQL' : 'SQLite' }; }
    database.sizeBytes = databaseBytes;

    const activeTeacherSessions = await sessionStore.count('teacher');
    const submissions = submissionGate.snapshot(), jobs = jobQueue.snapshot();
    const serverLoad = serverLoadSnapshot({ submissions, jobs, requests }, memory);
    res.json({
      generatedAt: new Date().toISOString(),
      status: 'operational',
      uptimeSeconds: Math.floor(process.uptime()),
      database,
      backup: backupService.status(),
      restoreDrill: restoreDrill.status(),
      monitoring: systemMonitor.status(),
      alerts: alertManager.status(),
      jobs,
      scoreEmails: scoreEmailService.status(),
      sessions: sessionStore.status(),
      storage: { status: assetStorage.configured ? 'configured' : 'not_configured', maxBytes: assetStorage.maxBytes },
      memory: { rssBytes: memory.rss, heapUsedBytes: memory.heapUsed, heapTotalBytes: memory.heapTotal },
      requests,
      submissions,
      serverLoad,
      scoreVerification: verificationSummary(db),
      examReadiness: readinessSummary(db.sets),
      counts: {
        students: db.students.length,
        teachers: db.teachers.length,
        examSets: db.sets.length,
        results: db.results.length,
        drafts: db.drafts.length,
        auditLogs: db.auditLogs.length,
        activeTeacherSessions
      },
      recentActivity
    });
  });
}

module.exports = { registerOperationsRoutes, liveOperationsSnapshot, examPulseSnapshot };
