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
function ownerKey(role, req) { return role === 'admin' ? 'admin' : `teacher:${req.teacherId}`; }
function encryptionKey(config) { return config.tokenEncryptionKey ? crypto.createHash('sha256').update(String(config.tokenEncryptionKey)).digest() : null; }
function encryptRefreshToken(value, config) {
  const key = encryptionKey(config); if (!key || !value) return null;
  const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', key, iv), encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]), tag = cipher.getAuthTag();
  return `v1.${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
}
function decryptRefreshToken(value, config) {
  const key = encryptionKey(config), parts = String(value || '').split('.'); if (!key || parts.length !== 4 || parts[0] !== 'v1') return null;
  try { const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(parts[1], 'base64url')); decipher.setAuthTag(Buffer.from(parts[2], 'base64url')); return Buffer.concat([decipher.update(Buffer.from(parts[3], 'base64url')), decipher.final()]).toString('utf8'); } catch (_) { return null; }
}

function ownerMatches(connection, req, role) {
  return connection && connection.role === role && (role === 'admin' || connection.ownerId === req.teacherId);
}

function startAuth(config, role) {
  return (req, res) => {
    if (!configured(config)) return res.status(503).json({ error: 'google_forms_not_configured', message: 'ยังไม่ได้ตั้งค่า Google Forms Import' });
    purgeExpired(oauthStates);
    const state = token();
    oauthStates.set(state, { role, ownerId: role === 'teacher' ? req.teacherId : null, expiresAt: Date.now() + OAUTH_STATE_TTL_MS });
    const params = new URLSearchParams({ client_id: config.clientId, redirect_uri: config.redirectUri, response_type: 'code', scope: 'https://www.googleapis.com/auth/forms.body.readonly https://www.googleapis.com/auth/drive.metadata.readonly', access_type: 'offline', state, prompt: 'consent' });
    res.json({ authorizationUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params}`, requestId: state });
  };
}

async function connectionFor(req, role, config, readDB, mutateDB) {
  purgeExpired(connections);
  const connection = connections.get(req.get('x-google-forms-connection'));
  if (ownerMatches(connection, req, role)) return connection;
  const saved = readDB()?.settings?.googleFormsRefreshTokens?.[ownerKey(role, req)];
  const refreshToken = decryptRefreshToken(saved?.token, config);
  if (!refreshToken) return null;
  const body = new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' });
  const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const payload = await response.json();
  if (!response.ok || !payload.access_token) {
    await mutateDB(db => { if (db.settings?.googleFormsRefreshTokens) delete db.settings.googleFormsRefreshTokens[ownerKey(role, req)]; });
    return null;
  }
  const connectionId = token();
  connections.set(connectionId, { role, ownerId: role === 'teacher' ? req.teacherId : null, accessToken: payload.access_token, expiresAt: Date.now() + Math.max(60, Number(payload.expires_in) || 1800) * 1000 });
  return connections.get(connectionId);
}

async function fetchParsedForm(req, role, config, readDB, mutateDB) {
  const connection = await connectionFor(req, role, config, readDB, mutateDB);
  if (!connection) throw Object.assign(new Error('กรุณาเชื่อมต่อ Google ก่อนนำเข้า'), { status: 401, code: 'google_connection_required' });
  const formId = formIdFrom(req.body?.formUrl);
  if (!formId) throw Object.assign(new Error('กรุณาใช้ลิงก์หน้าแก้ไข Google Forms (/forms/d/.../edit) ไม่ใช่ลิงก์ตอบแบบฟอร์ม (/forms/d/e/.../viewform)'), { status: 400, code: 'invalid_form_url' });
  const response = await fetch(`https://forms.googleapis.com/v1/forms/${encodeURIComponent(formId)}`, { headers: { Authorization: `Bearer ${connection.accessToken}` } });
  if (!response.ok) throw Object.assign(new Error(response.status === 403 ? 'บัญชี Google นี้ไม่มีสิทธิ์อ่านแบบฟอร์ม หรือแบบฟอร์มไม่ใช่ Quiz' : 'ไม่สามารถอ่าน Google Forms นี้ได้'), { status: response.status === 403 ? 403 : 400, code: 'google_form_fetch_failed' });
  return { connection, parsed: parseGoogleForm(await response.json()) };
}

function previewForm(role, config, readDB, mutateDB) {
  return async (req, res) => {
    try {
      res.json((await fetchParsedForm(req, role, config, readDB, mutateDB)).parsed);
    } catch (error) { res.status(error.status || 502).json({ error: error.code || 'google_form_fetch_failed', message: error.status ? error.message : 'เชื่อมต่อ Google Forms ไม่สำเร็จ' }); }
  };
}

function listForms(role, config, readDB, mutateDB) {
  return async (req, res) => {
    try {
      const connection = await connectionFor(req, role, config, readDB, mutateDB);
      if (!connection) throw Object.assign(new Error('กรุณาเชื่อมต่อ Google ก่อนนำเข้า'), { status: 401, code: 'google_connection_required' });
      const params = new URLSearchParams({ q: "mimeType = 'application/vnd.google-apps.form' and trashed = false", orderBy: 'modifiedTime desc', pageSize: '100', fields: 'files(id,name,modifiedTime),nextPageToken' });
      const response = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, { headers: { Authorization: `Bearer ${connection.accessToken}` } });
      if (!response.ok) throw Object.assign(new Error(response.status === 403 ? 'กรุณาเชื่อมต่อ Google ใหม่เพื่ออนุญาตการแสดงรายการ Google Forms' : 'ไม่สามารถอ่านรายการ Google Forms ได้'), { status: response.status === 403 ? 403 : 502, code: 'google_forms_list_failed' });
      const payload = await response.json();
      res.json({ forms: (payload.files || []).map(file => ({ id: file.id, title: file.name || 'ไม่มีชื่อ', modifiedTime: file.modifiedTime || null, editUrl: `https://docs.google.com/forms/d/${encodeURIComponent(file.id)}/edit` })) });
    } catch (error) { res.status(error.status || 502).json({ error: error.code || 'google_forms_list_failed', message: error.status ? error.message : 'เชื่อมต่อ Google Forms ไม่สำเร็จ' }); }
  };
}

function imageFileName(question, index, contentType) {
  const extension = ({ 'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp' })[contentType] || '.png';
  return `google-form-${question.sourceId || 'question'}-${index + 1}${extension}`;
}

function importForm(role, assetStorage, config, readDB, mutateDB) {
  return async (req, res) => {
    try {
      const { connection, parsed } = await fetchParsedForm(req, role, config, readDB, mutateDB);
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

function connectionStatus(role, config, readDB, mutateDB) {
  return async (req, res) => {
    purgeExpired(completedConnections);
    const completed = completedConnections.get(String(req.query.requestId || ''));
    if (ownerMatches(completed, req, role)) { completedConnections.delete(String(req.query.requestId || '')); return res.json({ connected: true, connectionId: completed.connectionId }); }
    const connection = await connectionFor(req, role, config, readDB, mutateDB);
    const connectionId = [...connections.entries()].find(([, value]) => value === connection)?.[0];
    res.json(connectionId ? { connected: true, connectionId } : { connected: false });
  };
}

function registerGoogleFormsRoutes(app, { requireAdmin, requireTeacher, googleFormsConfig, assetStorage, readDB, mutateDB }) {
  const closeScript = res => `<script nonce="${res.locals.cspNonce}">window.close()</script>`;
  app.post('/api/admin/google-forms/start', requireAdmin, startAuth(googleFormsConfig, 'admin'));
  app.post('/api/admin/google-forms/preview', requireAdmin, previewForm('admin', googleFormsConfig, readDB, mutateDB));
  app.get('/api/admin/google-forms/list', requireAdmin, listForms('admin', googleFormsConfig, readDB, mutateDB));
  app.post('/api/admin/google-forms/import', requireAdmin, importForm('admin', assetStorage, googleFormsConfig, readDB, mutateDB));
  app.get('/api/admin/google-forms/status', requireAdmin, connectionStatus('admin', googleFormsConfig, readDB, mutateDB));
  app.post('/api/teacher/google-forms/start', requireTeacher, startAuth(googleFormsConfig, 'teacher'));
  app.post('/api/teacher/google-forms/preview', requireTeacher, previewForm('teacher', googleFormsConfig, readDB, mutateDB));
  app.get('/api/teacher/google-forms/list', requireTeacher, listForms('teacher', googleFormsConfig, readDB, mutateDB));
  app.post('/api/teacher/google-forms/import', requireTeacher, importForm('teacher', assetStorage, googleFormsConfig, readDB, mutateDB));
  app.get('/api/teacher/google-forms/status', requireTeacher, connectionStatus('teacher', googleFormsConfig, readDB, mutateDB));
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
      const encryptedRefreshToken = encryptRefreshToken(payload.refresh_token, googleFormsConfig);
      if (encryptedRefreshToken) await mutateDB(db => { db.settings = { ...(db.settings || {}), googleFormsRefreshTokens: { ...(db.settings?.googleFormsRefreshTokens || {}), [state.role === 'admin' ? 'admin' : `teacher:${state.ownerId}`]: { token: encryptedRefreshToken, updatedAt: new Date().toISOString() } } }; });
      completedConnections.set(req.query.state, { role: state.role, ownerId: state.ownerId, connectionId, expiresAt: Date.now() + OAUTH_STATE_TTL_MS });
      const safeToken = JSON.stringify(connectionId);
      res.type('html').send(`<!doctype html><title>เชื่อมต่อแล้ว</title><script nonce="${res.locals.cspNonce}">window.opener&&window.opener.postMessage({type:'google-forms-connected',connectionId:${safeToken}},window.location.origin);window.close()</script>เชื่อมต่อ Google สำเร็จ สามารถปิดหน้านี้ได้`);
    } catch (_) { res.status(502).send(`${closeScript(res)}เชื่อมต่อ Google ไม่สำเร็จ กรุณาลองใหม่`); }
  });
}

module.exports = { registerGoogleFormsRoutes };
