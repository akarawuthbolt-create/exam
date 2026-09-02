const path = require('path');

const HELP_HOSTS = (process.env.HELP_SUBDOMAIN || 'help.examkub.com')
  .split(',')
  .map(host => host.trim().toLowerCase())
  .filter(Boolean);

function registerPages(app, publicDir, express) {
  // Serve the teacher guide on its own subdomain (e.g. help.examkub.com), sharing
  // this same deployment/DB rather than needing a separate service. Asset and API
  // requests pass through untouched so /assets and /api keep working on that host too.
  app.use((req, res, next) => {
    const host = String(req.hostname || '').toLowerCase();
    if (!HELP_HOSTS.includes(host)) return next();
    if (req.path.startsWith('/assets/') || req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(publicDir, 'help.html'));
  });

  const sarabunFontDir = path.join(path.dirname(require.resolve('font-th-sarabun-new/package.json')), 'fonts');
  app.use('/assets/fonts/th-sarabun', express.static(sarabunFontDir, { immutable: true, maxAge: '1y' }));
  app.get('/admin', (req, res) => res.sendFile(path.join(publicDir, 'admin.html')));
  app.get('/help', (req, res) => res.sendFile(path.join(publicDir, 'help.html')));
  app.get('/teacher', (req, res) => res.sendFile(path.join(publicDir, 'teacher.html')));
  app.get('/object-analysis-design', (req, res) => res.sendFile(path.join(publicDir, 'object-analysis-design.html')));
  app.get('/', (req, res) => res.sendFile(path.join(publicDir, 'student.html')));
  app.use(express.static(publicDir));
}

function registerFallback(app, publicDir) {
  app.use('/api', (req, res) => {
    res.status(404).json({
      error: 'not_found',
      message: `API endpoint not found: ${req.method} ${req.originalUrl}`
    });
  });
  app.get('*', (req, res) => res.sendFile(path.join(publicDir, 'student.html')));
}

function registerErrorHandler(app) {
  app.use((error, req, res, next) => {
    console.error(`${req.method} ${req.originalUrl} failed.`, error);
    if (res.headersSent) return next(error);
    const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 600
      ? error.status
      : 500;
    res.status(status).json({
      error: status === 500 ? 'internal_server_error' : 'request_failed',
      message: status === 500 ? 'เกิดข้อผิดพลาดภายในระบบ' : error.message
    });
  });
}

module.exports = { registerPages, registerFallback, registerErrorHandler };
