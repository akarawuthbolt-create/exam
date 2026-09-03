const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
process.env.NODE_ENV = 'test';
const app = require('../server');
const { ADMIN_KEY } = require('../src/config');
const { readDB, databaseReady } = require('../src/database');
const { createStudentSession } = require('../src/auth');

async function studentHeaders() {
  await Promise.all([databaseReady, app.ready]);
  const student = readDB().students[0];
  return { 'x-student-token': await createStudentSession(student.studentId) };
}

function request(path, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      const requestHeaders = { ...headers };
      if (body) requestHeaders['content-type'] = 'application/json';
      const clientRequest = http.request({ hostname: '127.0.0.1', port, path, method, headers: requestHeaders }, response => {
        let body = '';
        response.on('data', chunk => { body += chunk; });
        response.on('end', () => { server.close(); resolve({ status: response.statusCode, body, headers: response.headers }); });
      });
      clientRequest.on('error', error => { server.close(); reject(error); });
      if (body) clientRequest.write(JSON.stringify(body));
      clientRequest.end();
    });
  });
}

test('public exam types endpoint remains available', async () => {
  const response = await request('/api/exam-types');
  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(response.body), ['กลางภาค', 'ปลายภาค', 'บล็อคคอร์ส']);
  assert.equal(response.headers['x-content-type-options'], 'nosniff');
  assert.equal(response.headers['x-frame-options'], 'DENY');
  assert.equal(response.headers['strict-transport-security'], 'max-age=31536000');
  assert.match(response.headers['content-security-policy'], /default-src 'self'/);
  assert.match(response.headers['content-security-policy'], /script-src 'self' 'nonce-[^']+' https:\/\/cdnjs\.cloudflare\.com/);
  assert.match(response.headers['content-security-policy'], /frame-ancestors 'none'/);
  assert.match(response.headers['permissions-policy'], /camera=\(\)/);
  assert.equal(response.headers['x-powered-by'], undefined);
});

test('health and readiness endpoints report application state', async () => {
  await app.ready;
  const health = await request('/health');
  assert.equal(health.status, 200);
  const healthBody = JSON.parse(health.body);
  assert.equal(healthBody.status, 'ok');
  assert.equal(Number.isInteger(healthBody.uptimeSeconds), true);

  const ready = await request('/ready');
  assert.equal(ready.status, 200);
  const readyBody = JSON.parse(ready.body);
  assert.equal(readyBody.status, 'ready');
  assert.equal(readyBody.database.status, 'connected');
  assert.equal(typeof readyBody.database.latencyMs, 'number');
  assert.equal(readyBody.sessions.status, 'connected');
});

test('student logout revokes the current session', async () => {
  const headers = await studentHeaders();
  const logout = await request('/api/student/session', { method: 'DELETE', headers });
  assert.equal(logout.status, 200);
  assert.deepEqual(JSON.parse(logout.body), { ok: true });
  const afterLogout = await request('/api/student/session', { headers });
  assert.equal(afterLogout.status, 401);
});

test('Google Forms callback inline script is authorized by the request CSP nonce', async () => {
  const response = await request('/api/google-forms/callback');
  assert.equal(response.status, 400);
  const nonce = response.headers['content-security-policy'].match(/'nonce-([^']+)'/)?.[1];
  assert.ok(nonce);
  assert.match(response.body, new RegExp(`<script nonce="${nonce.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}">`));
});

test('frontend pages load extracted CSS and JavaScript assets', async () => {
  const admin = await request('/admin');
  assert.equal(admin.status, 200);
  assert.match(admin.body, /href="\/assets\/admin\.css(?:\?v=[^"]+)?"/);
  assert.match(admin.body, /src="\/assets\/admin-main\.js(?:\?v=[^"]+)?"/);
  assert.match(admin.body, /data-settings-target="learning-plans"/);
  assert.match(admin.body, /data-settings-target="score-emails"/);
  assert.doesNotMatch(admin.body, /class="admin-tab-btn" data-atab="(?:learning-plans|score-emails)"/);
  assert.match(admin.body, /src="\/assets\/admin-learning-plans\.js(?:\?v=[^"]+)?"/);
  const teacherTab = admin.body.match(/id="atab-teachers"[\s\S]*?id="atab-learning-plans"/)?.[0] || '';
  const settingsTab = admin.body.match(/id="atab-settings"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>\s*<dialog/)?.[0] || '';
  assert.doesNotMatch(teacherTab, /teacherExcelFile/);
  assert.match(settingsTab, /openTeacherImportDialogBtn/);
  assert.match(admin.body, /id="teacherImportDialog"/);
  assert.match(admin.body, /id="teacherExcelFile"/);
  assert.match(admin.body, /id="openExamImportDialogBtn"/);
  assert.match(admin.body, /id="examImportChoiceDialog"/);
  assert.match(admin.body, /id="questionFileImportDialog"/);
  assert.match(admin.body, /id="manageTeacherDialog"/);
  assert.doesNotMatch(admin.body, /<style>/);
  const student = await request('/student');
  assert.equal(student.status, 200);
  assert.doesNotMatch(student.body, /id="selectScoreWrap"/);
  assert.match(student.body, /id="studentIdentityConfirmModal"/);
  assert.match(student.body, /id="pinRecoveryScreen"/);
  assert.doesNotMatch(student.body, /id="pinSetupScreen"/);
  assert.doesNotMatch(student.body, /id="pinVerifyScreen"/);
  const teacherPage = await request('/teacher');
  assert.equal(teacherPage.status, 200);
  assert.doesNotMatch(teacherPage.body, /id="newDfdSetBtn"/);
  const [css, script, learningPlanScript] = await Promise.all([request('/assets/admin.css'), request('/assets/admin-main.js'), request('/assets/admin-learning-plans.js')]);
  assert.equal(css.status, 200);
  assert.match(css.headers['content-type'], /text\/css/);
  assert.equal(script.status, 200);
  assert.match(script.headers['content-type'], /javascript/);
  assert.match(script.body, /score-verification-detail-btn/);
  assert.match(script.body, /examOpenDateLabel/);
  assert.match(script.body, /examScheduleStatus/);
  assert.match(script.body, /data-manageteacher/);
  assert.match(script.body, /adminLearningPlanBridge/);
  assert.match(script.body, /addEventListener\('click'/);
  assert.doesNotMatch(script.body, /onclick="openScoreVerificationIssues/);
  assert.equal(learningPlanScript.status, 200);
  assert.match(learningPlanScript.body, /addLearningUnitBtn/);
  assert.match(learningPlanScript.body, /data-unit-field/);
});

test('exam roster embeds TH Sarabun font and waits for it before printing', async () => {
  const [regular, bold, script] = await Promise.all([
    request('/assets/fonts/th-sarabun/THSarabunNew-webfont.woff'),
    request('/assets/fonts/th-sarabun/THSarabunNew_bold-webfont.woff'),
    request('/assets/teacher-main.js')
  ]);
  assert.equal(regular.status, 200);
  assert.equal(bold.status, 200);
  assert.match(regular.headers['content-type'], /font|woff|octet-stream/);
  assert.match(script.body, /font-family:\"THSarabunPSK\"/);
  assert.match(script.body, /document\.fonts&&document\.fonts\.ready/);
});

test('result tables label totals with each exam actual maximum score', async () => {
  const [adminScript, teacherScript] = await Promise.all([
    request('/assets/admin-main.js'),
    request('/assets/teacher-main.js')
  ]);
  for (const response of [adminScript, teacherScript]) {
    assert.equal(response.status, 200);
    assert.match(response.body, /function resultScoreMax\(/);
    assert.match(response.body, /<th>(?:รวม|\$\{tr\('รวม'\)\})\/\$\{scoreMax\}<\/th>/);
    assert.doesNotMatch(response.body, /<th>รวม\/20<\/th>/);
  }
});

test('student exam selection shows a preparing state before countdown', async () => {
  const [page, script, styles] = await Promise.all([
    request('/'),
    request('/assets/student-main.js'),
    request('/assets/student.css')
  ]);
  assert.equal(page.status, 200);
  assert.match(page.body, /id="examPreparingOverlay"/);
  assert.match(page.body, /กำลังเตรียมข้อสอบ/);
  assert.match(script.body, /setExamPreparing\(true\)/);
  assert.match(script.body, /if\(examPreparing\) return/);
  assert.match(script.body, /pinRecoveryScreen/);
  assert.doesNotMatch(script.body, /pinSetupScreen|pinVerifyScreen/);
  assert.match(styles.body, /\.exam-preparing-spinner/);
});

test('unknown API endpoints return a JSON 404 response', async () => {
  const response = await request('/api/endpoint-that-does-not-exist');
  assert.equal(response.status, 404);
  assert.match(response.headers['content-type'], /application\/json/);
  assert.deepEqual(JSON.parse(response.body), {
    error: 'not_found',
    message: 'API endpoint not found: GET /api/endpoint-that-does-not-exist'
  });
});

test('exam sets require a verified student session', async () => {
  const response = await request('/api/sets');
  assert.equal(response.status, 401);
});

test('admin routes reject requests without an admin key', async () => {
  const response = await request('/api/admin/sets');
  assert.equal(response.status, 401);
});

test('operations requires admin access and reports system health', async () => {
  assert.equal((await request('/api/admin/operations')).status, 401);
  const response = await request('/api/admin/operations', { headers: { 'x-admin-key': ADMIN_KEY } });
  assert.equal(response.status, 200);
  const body = JSON.parse(response.body);
  assert.equal(body.status, 'operational');
  assert.equal(body.database.status, 'connected');
  assert.equal(typeof body.database.latencyMs, 'number');
  assert.equal(typeof body.backup.configured, 'boolean');
  assert.equal(typeof body.alerts.configured, 'boolean');
  assert.equal(typeof body.jobs.pending, 'number');
  assert.equal(body.jobs.concurrency, 2);
  assert.equal(body.sessions.engine, 'Memory');
  assert.equal(body.sessions.connected, true);
  assert.equal(typeof body.restoreDrill.configured, 'boolean');
  assert.equal(Number.isInteger(body.uptimeSeconds), true);
  assert.equal(typeof body.counts.students, 'number');
  assert.equal(body.submissions.maxConcurrent, 75);
  assert.equal(body.submissions.maxPending, 1200);
  assert.equal(typeof body.scoreVerification.verified, 'number');
  assert.equal(typeof body.scoreVerification.mismatch, 'number');
  assert.equal(typeof body.examReadiness.ready, 'number');
  assert.equal(typeof body.examReadiness.blocked, 'number');
  assert.equal(Array.isArray(body.recentActivity), true);
});

test('manual restore drill requires encrypted backup configuration', async () => {
  const response = await request('/api/admin/operations/restore-drill', { method: 'POST', headers: { 'x-admin-key': ADMIN_KEY } });
  assert.equal(response.status, 409);
  assert.equal(JSON.parse(response.body).error, 'restore_drill_not_configured');
});

test('full-system restore requires admin access and a valid backup file', async () => {
  assert.equal((await request('/api/admin/restore.json', { method:'POST' })).status, 401);
  const invalid = await request('/api/admin/restore.json', { method:'POST', headers:{ 'x-admin-key':ADMIN_KEY, 'x-restore-confirm':'RESTORE', 'content-type':'application/x-exam-backup+json' } });
  assert.equal(invalid.status, 400);
  assert.equal(JSON.parse(invalid.body).error, 'invalid_backup');
});

test('live Operations stream requires administrator authentication', async () => {
  const response = await request('/api/admin/operations/stream');
  assert.equal(response.status, 401);
});

test('score verification detail report is admin-only and omits answer data', async () => {
  assert.equal((await request('/api/admin/operations/score-verification')).status, 401);
  const response = await request('/api/admin/operations/score-verification', { headers: { 'x-admin-key': ADMIN_KEY } });
  assert.equal(response.status, 200);
  const body = JSON.parse(response.body);
  assert.equal(Array.isArray(body.issues), true);
  const containsForbiddenKey = value => value && typeof value === 'object' && (Object.keys(value).some(key => ['answers', 'correctMap', 'keywords', 'answerCode'].includes(key)) || Object.values(value).some(containsForbiddenKey));
  assert.equal(containsForbiddenKey(body), false);
});

test('student lookup returns a stable not-found response', async () => {
  const response = await request('/api/students/not-a-student');
  assert.equal(response.status, 404);
  assert.equal(JSON.parse(response.body).error, 'not_found');
});

test('teacher login requires both username and password', async () => {
  const response = await request('/api/teacher/login', { method: 'POST', body: { username: 'teacher' } });
  assert.equal(response.status, 400);
  assert.equal(JSON.parse(response.body).error, 'invalid_payload');
});

test('teacher password reset is admin-only and validates password strength', async () => {
  const unauthorized = await request('/api/teachers/teacher-missing/password', { method: 'PATCH', body: { password: 'new-password' } });
  assert.equal(unauthorized.status, 401);
  const weak = await request('/api/teachers/teacher-missing/password', { method: 'PATCH', headers: { 'x-admin-key': ADMIN_KEY }, body: { password: 'short' } });
  assert.equal(weak.status, 400);
  assert.equal(JSON.parse(weak.body).error, 'weak_password');
});

test('teacher results require a teacher session', async () => {
  const response = await request('/api/teacher/results');
  assert.equal(response.status, 401);
  assert.equal(JSON.parse(response.body).error, 'unauthorized');
});

test('submissions reject a missing student or exam identifier', async () => {
  const response = await request('/api/results', { method: 'POST', headers: await studentHeaders(), body: {} });
  assert.equal(response.status, 400);
  assert.equal(JSON.parse(response.body).error, 'invalid_payload');
});

test('public exam data never includes answer keys', async () => {
  const response = await request('/api/sets', { headers: await studentHeaders() });
  assert.equal(response.status, 200);
  const sets = JSON.parse(response.body);
  for (const set of sets) {
    for (const question of set.sections.mc.questions) assert.equal(Object.hasOwn(question, 'answer'), false);
    assert.equal(Object.hasOwn(set.sections.matching, 'correctMap'), false);
    for (const question of set.sections.written.questions) assert.equal(Object.hasOwn(question, 'keywords'), false);
  }
});

test('result exports require the correct role', async () => {
  const [adminExport, teacherExport] = await Promise.all([
    request('/api/export/results.xlsx'),
    request('/api/teacher/export/results.xlsx')
  ]);
  assert.equal(adminExport.status, 401);
  assert.equal(teacherExport.status, 401);
});

test('audit logs require the correct role', async () => {
  assert.equal((await request('/api/audit-logs')).status, 401);
  assert.equal((await request('/api/teacher/audit-logs')).status, 401);
});

test('gradebook endpoints require authentication', async () => {
  assert.equal((await request('/api/gradebook/options')).status, 401);
  assert.equal((await request('/api/teacher/gradebook/options')).status, 401);
  assert.equal((await request('/api/export/gradebook.xlsx?setKey=set_seed_sample1')).status, 401);
});

test('gradebook export waits for at least one midterm or final result', async () => {
  const response = await request('/api/export/gradebook.xlsx?setKey=set_seed_sample1', { headers: { 'x-admin-key': ADMIN_KEY } });
  assert.equal(response.status, 409);
  assert.equal(JSON.parse(response.body).error, 'gradebook_not_ready');
});

test('admin result export returns an Excel workbook', async () => {
  const response = await request('/api/export/results.xlsx', { headers: { 'x-admin-key': ADMIN_KEY } });
  assert.equal(response.status, 200);
  assert.match(response.headers['content-type'], /spreadsheetml/);
  assert.ok(response.body.length > 0);
});

test('admin can export an exam paper PDF without answer keys', async () => {
  await Promise.all([databaseReady, app.ready]);
  const setKey = readDB().sets[0].key;
  const denied = await request('/api/export/exam.pdf?setKey=' + encodeURIComponent(setKey));
  assert.equal(denied.status, 401);
  const response = await request('/api/export/exam.pdf?setKey=' + encodeURIComponent(setKey), { headers: { 'x-admin-key': ADMIN_KEY } });
  assert.equal(response.status, 200);
  assert.match(response.headers['content-type'], /application\/pdf/);
  assert.match(response.headers['content-disposition'], /filename\*=UTF-8''/);
  assert.ok(response.body.length > 100);
});

test('question analysis requires admin access and exports Excel and Word forms', async () => {
  await Promise.all([databaseReady, app.ready]);
  const setKey = readDB().sets[0].key;
  const denied = await request('/api/question-analysis?setKey=' + encodeURIComponent(setKey));
  assert.equal(denied.status, 401);
  const [analysis, workbook, wordForm] = await Promise.all([
    request('/api/question-analysis?setKey=' + encodeURIComponent(setKey), { headers: { 'x-admin-key': ADMIN_KEY } }),
    request('/api/export/question-analysis.xlsx?setKey=' + encodeURIComponent(setKey), { headers: { 'x-admin-key': ADMIN_KEY } }),
    request('/api/export/question-analysis.docx?setKey=' + encodeURIComponent(setKey), { headers: { 'x-admin-key': ADMIN_KEY } })
  ]);
  assert.equal(analysis.status, 200);
  assert.ok(Array.isArray(JSON.parse(analysis.body).items));
  assert.equal(workbook.status, 200);
  assert.match(workbook.headers['content-type'], /spreadsheetml/);
  assert.equal(wordForm.status, 200);
  assert.match(wordForm.headers['content-type'], /wordprocessingml/);
  assert.ok(wordForm.body.length > 1000);
});

test('student lookup returns identity details for confirmation before PIN entry', async () => {
  await app.ready;
  const student = readDB().students[0];
  const response = await request('/api/students/' + encodeURIComponent(student.studentId));
  assert.equal(response.status, 200);
  const body = JSON.parse(response.body);
  assert.equal(body.studentId, student.studentId);
  assert.equal(body.firstName, student.firstName);
  assert.equal(body.lastName, student.lastName);
  assert.equal(body.classRoom, student.classRoom);
  assert.equal(typeof body.hasPin, 'boolean');
});

test('admin can create, update, list, and delete a multi-unit learning plan', async () => {
  const denied = await request('/api/admin/learning-plans');
  assert.equal(denied.status, 401);
  const headers = { 'x-admin-key': ADMIN_KEY };
  const createdResponse = await request('/api/admin/learning-plans', { method: 'POST', headers, body: {
    subjectName: 'การเขียนโปรแกรม', subjectCode: '20001', teacherName: 'อาจารย์ทดสอบ',
    units: [{ unitNo: '1', unitTitle: 'พื้นฐาน' }, { unitNo: '2', unitTitle: 'เงื่อนไข' }]
  } });
  assert.equal(createdResponse.status, 201);
  const created = JSON.parse(createdResponse.body);
  assert.equal(created.units.length, 2);
  const updatedResponse = await request('/api/admin/learning-plans/' + encodeURIComponent(created.id), { method: 'PUT', headers, body: { ...created, subjectName: 'การเขียนโปรแกรมเบื้องต้น' } });
  assert.equal(updatedResponse.status, 200);
  assert.equal(JSON.parse(updatedResponse.body).subjectName, 'การเขียนโปรแกรมเบื้องต้น');
  const listResponse = await request('/api/admin/learning-plans', { headers });
  assert.equal(JSON.parse(listResponse.body).some(plan => plan.id === created.id && plan.units.length === 2), true);
  const wordResponse = await request('/api/admin/learning-plans/' + encodeURIComponent(created.id) + '.docx', { headers });
  assert.equal(wordResponse.status, 200);
  assert.match(wordResponse.headers['content-type'], /wordprocessingml/);
  assert.ok(wordResponse.body.length > 1000);
  const deletedResponse = await request('/api/admin/learning-plans/' + encodeURIComponent(created.id), { method: 'DELETE', headers });
  assert.equal(deletedResponse.status, 200);
});

test('admin set creation rejects an incomplete payload without changing data', async () => {
  const response = await request('/api/sets', { method: 'POST', headers: { 'x-admin-key': ADMIN_KEY }, body: {} });
  assert.equal(response.status, 400);
  assert.equal(JSON.parse(response.body).error, 'invalid_payload');
});

test('bulk student import skips invalid records without changing the database', async () => {
  const studentId = '../invalid-bulk-student';
  const before = readDB().students.length;
  const response = await request('/api/students/bulk', {
    method: 'POST',
    headers: { 'x-admin-key': ADMIN_KEY },
    body: { text: `${studentId},สมชาย,ใจดี,ปวช.1/1` }
  });
  assert.equal(response.status, 200);
  const result = JSON.parse(response.body);
  assert.equal(result.imported, 0);
  assert.equal(result.updated, 0);
  assert.equal(result.errors.length, 1);
  assert.equal(readDB().students.length, before);
  assert.equal(readDB().students.some(student => student.studentId === studentId), false);
});

test('teacher set management requires a teacher session', async () => {
  const response = await request('/api/teacher/sets');
  assert.equal(response.status, 401);
  assert.equal(JSON.parse(response.body).error, 'unauthorized');
});

test('teacher question file import requires a teacher session', async () => {
  const response = await request('/api/teacher/question-file/preview', { method: 'POST' });
  assert.equal(response.status, 401);
  assert.equal(JSON.parse(response.body).error, 'unauthorized');
});

test('Google Forms list requires the staff role', async () => {
  const [admin, teacher] = await Promise.all([
    request('/api/admin/google-forms/list'),
    request('/api/teacher/google-forms/list')
  ]);
  assert.equal(admin.status, 401);
  assert.equal(teacher.status, 401);
});

test('result deletion requires administrator authentication', async () => {
  const response = await request('/api/results/does-not-matter', { method: 'DELETE' });
  assert.equal(response.status, 401);
  assert.equal(JSON.parse(response.body).error, 'unauthorized');
});

test('late-access verification rejects an unknown exam set', async () => {
  const response = await request('/api/sets/unknown-set/verify-late-code', { method: 'POST', headers: await studentHeaders(), body: { code: 'anything' } });
  assert.equal(response.status, 404);
  assert.equal(JSON.parse(response.body).ok, false);
});

test('submissions reject an unknown exam set', async () => {
  const response = await request('/api/results', { method: 'POST', headers: await studentHeaders(), body: { questionKey: 'unknown-set' } });
  assert.equal(response.status, 404);
  assert.equal(JSON.parse(response.body).error, 'not_found');
});
