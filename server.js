/* ======================================================================
   Exam System Backend
   - Express REST API
   - SQLite database (using Node.js built-in SQLite support)
   - Grading happens SERVER-SIDE ONLY. The public /api/sets endpoint never
     sends answer keys (correct choice / correct pairs / keywords) to the
     browser, since these are now formal midterm/final exams where scores
     must stay confidential until the teacher announces them.
   - Serves separate frontend pages for students, teachers, administrators,
     and object-analysis assignments.
   ====================================================================== */
require('dotenv').config();
const express = require('express');
const config = require('./src/config');
const { PORT, ADMIN_KEY, EXAM_TYPES, PUBLIC_DIR, SUPABASE_URL, SUPABASE_SECRET_KEY, SUPABASE_STORAGE_BUCKET, GOOGLE_FORMS_CLIENT_ID, GOOGLE_FORMS_CLIENT_SECRET, GOOGLE_FORMS_REDIRECT_URI, GOOGLE_FORMS_TOKEN_ENCRYPTION_KEY } = config;
const { readDB, readDBView, writeDB, mutateDB, mutateExamDraft, saveExamSubmission, replaceDB, closeDatabase, databaseReady, pingDatabase } = require('./src/database');
const { hashPassword, verifyPassword, requireTeacher, requireAdmin, requireStudent, createTeacherSession, createStudentSession, removeTeacherSessions, teacherSessions, sessionStore } = require('./src/auth');
const { round2, gradeMC, gradeMatching, gradeWritten, getExamSchedule, hasExamAccess, isPastDeadline, isBeforeStart, sanitizeSetForStudent } = require('./src/grading');
const { registerPages, registerFallback, registerErrorHandler } = require('./src/pages');
const { registerRoutes } = require('./src/routes');
const { buildResultsWorkbook: buildResultsWorkbookModule, buildGradebookWorkbook, buildMultiCourseGradebookWorkbook } = require('./src/results-workbook');
const { buildQuestionAnalysis, buildQuestionAnalysisWorkbook } = require('./src/question-analysis');
const { applySecurityHeaders } = require('./src/security');
const { newId } = require('./src/ids');
const { createAssetStorage } = require('./src/asset-storage');
const { applyAcademicPeriod } = require('./src/academic-calendar');
const { buildQuestionAnalysisDocx } = require('./src/question-analysis-docx');
const { buildLearningPlanDocx } = require('./src/learning-plan-docx');
const { createShutdownHandler, registerShutdownSignals } = require('./src/shutdown');
const { createRuntimeMetrics } = require('./src/runtime-metrics');
const { createSubmissionGate } = require('./src/submission-gate');
const { createAlertManager } = require('./src/alerts');
const { createBackupService } = require('./src/backup');
const { createSystemMonitor } = require('./src/system-monitor');
const { createQuietHoursCheck } = require('./src/quiet-hours');
const { createJobQueue } = require('./src/job-queue');
const { createRestoreDrill } = require('./src/restore-drill');
const { createScoreEmailService } = require('./src/score-email');
const { createExamAutoArchive } = require('./src/exam-auto-archive');

if (ADMIN_KEY === 'changeme123') {
  console.warn('[WARNING] Using the default ADMIN_KEY. Set ADMIN_KEY in your .env file before deploying for real use.');
}
/* Seed one example exam set (full score = 20) + example students on first run */
async function seedIfEmpty() {
  await databaseReady;
  const db = readDB();
  if (db.sets.length > 0) return;
  const now = new Date().toISOString();
  db.sets.push({
    key: 'set_seed_sample1',
    title: 'ความรู้พื้นฐานคอมพิวเตอร์ (ตัวอย่าง)',
    courseName: 'ความรู้พื้นฐานคอมพิวเตอร์',
    tagline: 'Sample Question Set',
    desc: 'ชุดข้อสอบตัวอย่างสำหรับทดสอบระบบ ผู้ดูแลระบบสามารถแก้ไขหรือลบชุดนี้ได้ คะแนนเต็มรวม 20 คะแนน',
    examType: 'กลางภาค',
    teacherId: null,
    assignedClasses: [],
    subjectTeacherName: 'อาจารย์ตัวอย่าง',
    subjectTeacherEmail: '',
    sections: {
      mc: {
        title: 'ส่วนที่ 1 — ปรนัย (เลือกตอบ)',
        desc: 'เลือกคำตอบที่ถูกต้องที่สุดเพียงข้อเดียวในแต่ละข้อ',
        questions: [
          { id: 'mc1', text: 'อุปกรณ์ใดต่อไปนี้ทำหน้าที่เป็นหน่วยประมวลผลกลางของคอมพิวเตอร์?', choices: ['RAM', 'CPU', 'HDD', 'PSU'], answer: 1, points: 2 },
          { id: 'mc2', text: 'ข้อใดคือความหมายของคำว่า "Software"?', choices: ['อุปกรณ์ที่จับต้องได้ของคอมพิวเตอร์', 'ชุดคำสั่งหรือโปรแกรมที่สั่งให้คอมพิวเตอร์ทำงาน', 'สายไฟที่เชื่อมต่ออุปกรณ์', 'จอแสดงผล'], answer: 1, points: 2 },
          { id: 'mc3', text: 'หน่วยความจำชนิดใดที่ข้อมูลจะหายไปเมื่อปิดเครื่อง?', choices: ['ROM', 'RAM', 'Hard Disk', 'Flash Drive'], answer: 1, points: 2 },
          { id: 'mc4', text: 'ระบบปฏิบัติการ (Operating System) มีหน้าที่หลักคืออะไร?', choices: ['จัดการทรัพยากรของเครื่องและเป็นตัวกลางระหว่างผู้ใช้กับฮาร์ดแวร์', 'ต่ออินเทอร์เน็ตเท่านั้น', 'พิมพ์เอกสารเท่านั้น', 'เล่นเกมเท่านั้น'], answer: 0, points: 2 },
          { id: 'mc5', text: 'ข้อใดเป็นตัวอย่างของอุปกรณ์ Input?', choices: ['จอภาพ', 'เครื่องพิมพ์', 'คีย์บอร์ด', 'ลำโพง'], answer: 2, points: 2 }
        ]
      },
      matching: {
        title: 'ส่วนที่ 2 — จับคู่',
        desc: 'คลิกเลือกรายการทางซ้าย แล้วคลิกรายการทางขวาที่สัมพันธ์กัน เพื่อจับคู่',
        left: [{ id: 'l1', text: 'CPU' }, { id: 'l2', text: 'RAM' }, { id: 'l3', text: 'Hard Disk' }, { id: 'l4', text: 'Keyboard' }, { id: 'l5', text: 'Monitor' }],
        right: [{ id: 'r1', text: 'อุปกรณ์แสดงผลภาพ' }, { id: 'r2', text: 'หน่วยประมวลผลกลาง' }, { id: 'r3', text: 'อุปกรณ์รับข้อมูลชนิดปุ่มกด' }, { id: 'r4', text: 'หน่วยความจำสำรองแบบถาวร' }, { id: 'r5', text: 'หน่วยความจำหลักชั่วคราว' }],
        correctMap: { l1: 'r2', l2: 'r5', l3: 'r4', l4: 'r3', l5: 'r1' },
        pointsEach: 1
      },
      written: {
        title: 'ส่วนที่ 3 — อัตนัย (เขียนตอบ)',
        desc: 'ตอบคำถามด้วยคำพูดของตนเองให้ครบถ้วน',
        questions: [
          { id: 'w1', text: 'จงอธิบายความแตกต่างระหว่าง Hardware และ Software พร้อมยกตัวอย่างอย่างละ 2 ชนิด', keywords: ['ฮาร์ดแวร์', 'Hardware', 'ซอฟต์แวร์', 'Software', 'จับต้องได้', 'คำสั่ง', 'โปรแกรม'], maxPoints: 2.5 },
          { id: 'w2', text: 'เพราะเหตุใดคอมพิวเตอร์จึงจำเป็นต้องมีทั้งหน่วยความจำหลัก (RAM) และหน่วยความจำสำรอง (Storage)?', keywords: ['RAM', 'ชั่วคราว', 'ถาวร', 'ความเร็ว', 'เก็บข้อมูล', 'ปิดเครื่อง', 'หาย'], maxPoints: 2.5 }
        ]
      }
    },
    createdAt: now,
    updatedAt: now
  });
  db.students.push(
    { studentId: '10001', firstName: 'สมชาย', lastName: 'ใจดี', classRoom: 'ม.3/1', createdAt: now },
    { studentId: '10002', firstName: 'สมหญิง', lastName: 'รักเรียน', classRoom: 'ม.3/1', createdAt: now },
    { studentId: '10003', firstName: 'วิชัย', lastName: 'ตั้งใจ', classRoom: 'ม.3/2', createdAt: now }
  );
  await writeDB(db);
}
const seedReady = seedIfEmpty();
const examAutoArchive = createExamAutoArchive({ mutateDB });

/* ---------------------------- APP SETUP ---------------------------- */
const app = express();
app.ready = Promise.all([databaseReady, seedReady, sessionStore.ready]).then(() => examAutoArchive.run());
app.disable('x-powered-by');
// Railway sits behind a reverse proxy. Trust the first
// hop so login rate limits and audit records use the visitor IP.
app.set('trust proxy', 1);
app.use(applySecurityHeaders);
const runtimeMetrics = createRuntimeMetrics();
const submissionGate = createSubmissionGate({ maxConcurrent: config.SUBMISSION_MAX_CONCURRENT, maxPending: config.SUBMISSION_MAX_PENDING });
const alertManager = createAlertManager({ webhookUrl: config.ALERT_WEBHOOK_URL, cooldownMs: config.ALERT_COOLDOWN_MINUTES * 60_000 });
const jobQueue = createJobQueue({ concurrency: config.JOB_CONCURRENCY, maxPending: config.JOB_MAX_PENDING, baseRetryMs: config.JOB_RETRY_BASE_MS });
const scoreEmailService = createScoreEmailService({ apiKey: config.RESEND_API_KEY, fromEmail: config.SCORE_REPORT_FROM_EMAIL, readDB, buildWorkbook: buildMultiCourseGradebookWorkbook });
jobQueue.register('score_email_report', ({ payload }) => scoreEmailService.sendTeacher(payload.teacherId));
const enqueueScoreEmail = teacherId => jobQueue.enqueue('score_email_report', { maxAttempts: 1, timeoutMs: 300_000, dedupeKey: `score-email-${teacherId}`, payload: { teacherId } });
const backupService = createBackupService({ enabled: config.BACKUP_ENABLED, backupDir: config.BACKUP_DIR, intervalMs: config.BACKUP_INTERVAL_HOURS * 3_600_000, retentionMs: config.BACKUP_RETENTION_DAYS * 86_400_000, encryptionKey: config.BACKUP_ENCRYPTION_KEY, readDB, alertManager });
const restoreDrill = createRestoreDrill({ enabled: config.RESTORE_DRILL_ENABLED, backupDir: config.BACKUP_DIR, encryptionKey: config.BACKUP_ENCRYPTION_KEY, maxBytes: config.RESTORE_DRILL_MAX_BYTES, alertManager });
jobQueue.register('restore_drill', async () => {
  const result = await restoreDrill.run();
  if (!result.verified && result.reason === 'failed') throw new Error('Automated restore drill failed');
  return result;
});
const enqueueRestoreDrill = () => jobQueue.enqueue('restore_drill', { maxAttempts: 3, timeoutMs: 300_000, dedupeKey: 'restore-drill' });
jobQueue.register('database_backup', async () => {
  const result = await backupService.run();
  if (!result.created && result.reason === 'failed') throw new Error('Encrypted database backup failed');
  if (result.created && restoreDrill.status().configured) enqueueRestoreDrill();
  return result;
});
const enqueueBackup = () => jobQueue.enqueue('database_backup', { maxAttempts: 3, timeoutMs: 300_000, dedupeKey: 'automatic-backup' });
const isQuietHours = createQuietHoursCheck({ enabled: config.QUIET_HOURS_ENABLED, startHour: config.QUIET_HOURS_START_HOUR, endHour: config.QUIET_HOURS_END_HOUR, timeZone: config.QUIET_HOURS_TIMEZONE });
const systemMonitor = createSystemMonitor({ pingDatabase, sessionStore, runtimeMetrics, submissionGate, alertManager, intervalMs: config.MONITOR_INTERVAL_SECONDS * 1000, databaseTimeoutMs: config.DATABASE_READINESS_TIMEOUT_MS, errorRateThreshold: config.ALERT_ERROR_RATE_PERCENT, queuePercentThreshold: config.ALERT_QUEUE_PERCENT, isQuietHours });
app.use(runtimeMetrics.middleware);
app.use(express.json({ limit: '2mb' }));

/* ---------------------------- PAGES ---------------------------- */
registerPages(app, PUBLIC_DIR, express);

const assetStorage = createAssetStorage({ url: SUPABASE_URL, serviceRoleKey: SUPABASE_SECRET_KEY, bucket: SUPABASE_STORAGE_BUCKET });
console.log(`Supabase Storage: ${assetStorage.configured ? 'configured' : 'not configured'} (URL: ${SUPABASE_URL ? 'present' : 'missing'}, secret key: ${SUPABASE_SECRET_KEY ? 'present' : 'missing'})`);
registerRoutes(app, { ready: app.ready, readinessTimeoutMs: config.DATABASE_READINESS_TIMEOUT_MS, pingDatabase, backupService, restoreDrill, enqueueRestoreDrill, systemMonitor, alertManager, jobQueue, sessionStore, scoreEmailService, enqueueScoreEmail, ADMIN_KEY, EXAM_TYPES, readDB, readDBView, writeDB, mutateDB, mutateExamDraft, saveExamSubmission, replaceDB, hashPassword, verifyPassword, requireAdmin, requireTeacher, requireStudent, createTeacherSession, createStudentSession, removeTeacherSessions, teacherSessions, newId, sanitizeSetForStudent, getExamSchedule, hasExamAccess, isPastDeadline, isBeforeStart, gradeMC, gradeMatching, gradeWritten, round2, applyAcademicPeriod, buildResultsWorkbook: buildResultsWorkbookModule, buildGradebookWorkbook, buildQuestionAnalysis, buildQuestionAnalysisWorkbook, buildQuestionAnalysisDocx, buildLearningPlanDocx, assetStorage, runtimeMetrics, submissionGate, googleFormsConfig: { clientId: GOOGLE_FORMS_CLIENT_ID, clientSecret: GOOGLE_FORMS_CLIENT_SECRET, redirectUri: GOOGLE_FORMS_REDIRECT_URI, tokenEncryptionKey: GOOGLE_FORMS_TOKEN_ENCRYPTION_KEY } });

registerFallback(app, PUBLIC_DIR);
registerErrorHandler(app);

if (require.main === module) {
  app.ready
    .then(() => {
      systemMonitor.start();
      examAutoArchive.start();
      backupService.schedule(enqueueBackup);
      if (backupService.status().configured) enqueueBackup();
      const server = app.listen(PORT, () => {
        console.log(`Exam system backend running at http://localhost:${PORT}  (admin: http://localhost:${PORT}/admin)`);
      });
      registerShutdownSignals(createShutdownHandler({ server, closeDatabase: async () => {
        systemMonitor.stop();
        examAutoArchive.stop();
        backupService.stop();
        await jobQueue.stop();
        await sessionStore.close();
        await closeDatabase();
      } }));
    })
    .catch(error => {
      console.error('Database initialization failed.', error);
      process.exitCode = 1;
    });
}

module.exports = app;
