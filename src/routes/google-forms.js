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

function previewForm(role) {
  return async (req, res) => {
    const connection = connectionFor(req, role);
    if (!connection) return res.status(401).json({ error: 'google_connection_required', message: 'กรุณาเชื่อมต่อ Google ก่อนนำเข้า' });
    const formId = formIdFrom(req.body?.formUrl);
    if (!formId) return res.status(400).json({ error: 'invalid_form_url', message: 'กรุณาใช้ลิงก์หน้าแก้ไข Google Forms (/forms/d/.../edit) ไม่ใช่ลิงก์ตอบแบบฟอร์ม (/forms/d/e/.../viewform)' });
    try {
      const response = await fetch(`https://forms.googleapis.com/v1/forms/${encodeURIComponent(formId)}`, { headers: { Authorization: `Bearer ${connection.accessToken}` } });
      if (!response.ok) return res.status(response.status === 403 ? 403 : 400).json({ error: 'google_form_fetch_failed', message: response.status === 403 ? 'บัญชี Google นี้ไม่มีสิทธิ์อ่านแบบฟอร์ม หรือแบบฟอร์มไม่ใช่ Quiz' : 'ไม่สามารถอ่าน Google Forms นี้ได้' });
      res.json(parseGoogleForm(await response.json()));
    } catch (_) { res.status(502).json({ error: 'google_form_fetch_failed', message: 'เชื่อมต่อ Google Forms ไม่สำเร็จ' }); }
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

function registerGoogleFormsRoutes(app, { requireAdmin, requireTeacher, googleFormsConfig }) {
  const closeScript = res => `<script nonce="${res.locals.cspNonce}">window.close()</script>`;
  app.post('/api/admin/google-forms/start', requireAdmin, startAuth(googleFormsConfig, 'admin'));
  app.post('/api/admin/google-forms/preview', requireAdmin, previewForm('admin'));
  app.get('/api/admin/google-forms/status', requireAdmin, connectionStatus('admin'));
  app.post('/api/teacher/google-forms/start', requireTeacher, startAuth(googleFormsConfig, 'teacher'));
  app.post('/api/teacher/google-forms/preview', requireTeacher, previewForm('teacher'));
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
