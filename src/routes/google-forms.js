const crypto = require('crypto');
const { formIdFrom, parseGoogleForm } = require('../google-forms');

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const CONNECTION_TTL_MS = 30 * 60 * 1000;
const oauthStates = new Map();
const connections = new Map();
const completedConnections = new Map();

function token() { return crypto.randomBytes(24).toString('hex'); }
function configured(config = {}) { return Boolean(config.clientId && config.clientSecret && config.redirectUri); }
function purgeExpired(store) { const now = Date.now(); for (const [key, value] of store) if (value.expiresAt <= now) store.delete(key); }

function ownerMatches(connection, req, role) {
  return connection && connection.role === role && (role === 'admin' || connection.ownerId === req.teacherId);
}

function startAuth(config, role) {
  return (req, res) => {
    if (!configured(config)) return res.status(503).json({ error: 'google_forms_not_configured', message: 'ยังไม่ได้ตั้งค่า Google Forms Import' });
    purgeExpired(oauthStates);
    const state = token();
    oauthStates.set(state, { role, ownerId: role === 'teacher' ? req.teacherId : null, expiresAt: Date.now() + OAUTH_STATE_TTL_MS });
    const params = new URLSearchParams({ client_id: config.clientId, redirect_uri: config.redirectUri, response_type: 'code', scope: 'https://www.googleapis.com/auth/forms.body.readonly', access_type: 'online', state, prompt: 'consent' });
    res.json({ authorizationUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params}`, requestId: state });
  };
}

function connectionFor(req, role) {
  purgeExpired(connections);
  const connection = connections.get(req.get('x-google-forms-connection'));
  return ownerMatches(connection, req, role) ? connection : null;
}

async function fetchParsedForm(req, role) {
  const connection = connectionFor(req, role);
  if (!connection) throw Object.assign(new Error('กรุณาเชื่อมต่อ Google ก่อนนำเข้า'), { status: 401, code: 'google_connection_required' });
  const formId = formIdFrom(req.body?.formUrl);
  if (!formId) throw Object.assign(new Error('กรุณาใช้ลิงก์หน้าแก้ไข Google Forms (/forms/d/.../edit) ไม่ใช่ลิงก์ตอบแบบฟอร์ม (/forms/d/e/.../viewform)'), { status: 400, code: 'invalid_form_url' });
  const response = await fetch(`https://forms.googleapis.com/v1/forms/${encodeURIComponent(formId)}`, { headers: { Authorization: `Bearer ${connection.accessToken}` } });
  if (!response.ok) throw Object.assign(new Error(response.status === 403 ? 'บัญชี Google นี้ไม่มีสิทธิ์อ่านแบบฟอร์ม หรือแบบฟอร์มไม่ใช่ Quiz' : 'ไม่สามารถอ่าน Google Forms นี้ได้'), { status: response.status === 403 ? 403 : 400, code: 'google_form_fetch_failed' });
  return { connection, parsed: parseGoogleForm(await response.json()) };
}

function previewForm(role) {
  return async (req, res) => {
    try {
      res.json((await fetchParsedForm(req, role)).parsed);
    } catch (error) { res.status(error.status || 502).json({ error: error.code || 'google_form_fetch_failed', message: error.status ? error.message : 'เชื่อมต่อ Google Forms ไม่สำเร็จ' }); }
  };
}

function imageFileName(question, index, contentType) {
  const extension = ({ 'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp' })[contentType] || '.png';
  return `google-form-${question.sourceId || 'question'}-${index + 1}${extension}`;
}

function importForm(role, assetStorage) {
  return async (req, res) => {
    try {
      const { connection, parsed } = await fetchParsedForm(req, role);
      const warnings = [];
      for (const question of parsed.questions) {
        const attachments = [];
        for (let index = 0; index < question.images.length; index += 1) {
          try {
            if (!assetStorage?.configured) throw new Error('ยังไม่ได้ตั้งค่า Supabase Storage');
            const imageResponse = await fetch(question.images[index].contentUri, { headers: { Authorization: `Bearer ${connection.accessToken}` } });
            if (!imageResponse.ok) throw new Error('ดาวน์โหลดรูปจาก Google ไม่สำเร็จ');
            const contentType = String(imageResponse.headers.get('content-type') || '').split(';')[0].toLowerCase();
            if (!contentType.startsWith('image/')) throw new Error('ไฟล์จาก Google ไม่ใช่รูปภาพ');
            const contentLength = Number(imageResponse.headers.get('content-length'));
            if (Number.isFinite(contentLength) && contentLength > assetStorage.maxBytes) throw new Error('รูปมีขนาดเกิน 5 MB');
            const buffer = Buffer.from(await imageResponse.arrayBuffer());
            if (buffer.length > assetStorage.maxBytes) throw new Error('รูปมีขนาดเกิน 5 MB');
            attachments.push(await assetStorage.upload({ buffer, contentType, fileName: imageFileName(question, index, contentType), owner: role === 'admin' ? 'admin' : `teacher-${req.teacherId}` }));
          } catch (error) { warnings.push(`รูปของ “${question.text}” ไม่ถูกนำเข้า: ${error.message}`); }
        }
        question.resources = { attachments };
        delete question.images;
      }
      res.json({ ...parsed, warnings });
    } catch (error) { res.status(error.status || 502).json({ error: error.code || 'google_form_import_failed', message: error.status ? error.message : 'นำเข้า Google Forms ไม่สำเร็จ' }); }
  };
}

function connectionStatus(role) {
  return (req, res) => {
    purgeExpired(completedConnections);
    const completed = completedConnections.get(String(req.query.requestId || ''));
    if (!ownerMatches(completed, req, role)) return res.json({ connected: false });
    completedConnections.delete(String(req.query.requestId || ''));
    res.json({ connected: true, connectionId: completed.connectionId });
  };
}

function registerGoogleFormsRoutes(app, { requireAdmin, requireTeacher, googleFormsConfig, assetStorage }) {
  const closeScript = res => `<script nonce="${res.locals.cspNonce}">window.close()</script>`;
  app.post('/api/admin/google-forms/start', requireAdmin, startAuth(googleFormsConfig, 'admin'));
  app.post('/api/admin/google-forms/preview', requireAdmin, previewForm('admin'));
  app.post('/api/admin/google-forms/import', requireAdmin, importForm('admin', assetStorage));
  app.get('/api/admin/google-forms/status', requireAdmin, connectionStatus('admin'));
  app.post('/api/teacher/google-forms/start', requireTeacher, startAuth(googleFormsConfig, 'teacher'));
  app.post('/api/teacher/google-forms/preview', requireTeacher, previewForm('teacher'));
  app.post('/api/teacher/google-forms/import', requireTeacher, importForm('teacher', assetStorage));
  app.get('/api/teacher/google-forms/status', requireTeacher, connectionStatus('teacher'));
  app.get('/api/google-forms/callback', async (req, res) => {
    const state = oauthStates.get(req.query.state);
    oauthStates.delete(req.query.state);
    if (!state || state.expiresAt <= Date.now() || req.query.error || !req.query.code || !configured(googleFormsConfig)) return res.status(400).send(`${closeScript(res)}เชื่อมต่อ Google ไม่สำเร็จ กรุณาลองใหม่`);
    try {
      const body = new URLSearchParams({ code: req.query.code, client_id: googleFormsConfig.clientId, client_secret: googleFormsConfig.clientSecret, redirect_uri: googleFormsConfig.redirectUri, grant_type: 'authorization_code' });
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
      const payload = await tokenResponse.json();
      if (!tokenResponse.ok || !payload.access_token) throw new Error('token exchange failed');
      const connectionId = token();
      connections.set(connectionId, { role: state.role, ownerId: state.ownerId, accessToken: payload.access_token, expiresAt: Date.now() + CONNECTION_TTL_MS });
      completedConnections.set(req.query.state, { role: state.role, ownerId: state.ownerId, connectionId, expiresAt: Date.now() + OAUTH_STATE_TTL_MS });
      const safeToken = JSON.stringify(connectionId);
      res.type('html').send(`<!doctype html><title>เชื่อมต่อแล้ว</title><script nonce="${res.locals.cspNonce}">window.opener&&window.opener.postMessage({type:'google-forms-connected',connectionId:${safeToken}},window.location.origin);window.close()</script>เชื่อมต่อ Google สำเร็จ สามารถปิดหน้านี้ได้`);
    } catch (_) { res.status(502).send(`${closeScript(res)}เชื่อมต่อ Google ไม่สำเร็จ กรุณาลองใหม่`); }
  });
}

module.exports = { registerGoogleFormsRoutes };
