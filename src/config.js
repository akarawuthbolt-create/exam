const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.resolve(process.env.EXAM_DATA_DIR || path.join(ROOT_DIR, 'data'));

function positiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function enabled(value, fallback = false) {
  if (value === undefined || value === '') return fallback;
  return String(value).toLowerCase() === 'true';
}

function hourOfDay(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 23 ? parsed : fallback;
}

module.exports = {
  ROOT_DIR,
  DATA_DIR,
  SQLITE_PATH: path.join(DATA_DIR, 'exam-system.sqlite'),
  LEGACY_DB_PATH: path.join(DATA_DIR, 'db.json'),
  PUBLIC_DIR: path.join(ROOT_DIR, 'public'),
  PORT: process.env.PORT || 3000,
  DATABASE_URL: process.env.DATABASE_URL || '',
  DATABASE_READINESS_TIMEOUT_MS: positiveNumber(process.env.DATABASE_READINESS_TIMEOUT_MS, 3000),
  ADMIN_KEY: process.env.ADMIN_KEY || 'changeme123',
  SUPABASE_URL: (process.env.SUPABASE_URL || '').replace(/\/$/, ''),
  // New Supabase secret keys replace legacy service-role keys. Keep the fallback for older projects.
  SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  SUPABASE_STORAGE_BUCKET: process.env.SUPABASE_STORAGE_BUCKET || 'exam-assets',
  GOOGLE_FORMS_CLIENT_ID: process.env.GOOGLE_FORMS_CLIENT_ID || '',
  GOOGLE_FORMS_CLIENT_SECRET: process.env.GOOGLE_FORMS_CLIENT_SECRET || '',
  GOOGLE_FORMS_REDIRECT_URI: process.env.GOOGLE_FORMS_REDIRECT_URI || '',
  GOOGLE_FORMS_TOKEN_ENCRYPTION_KEY: process.env.GOOGLE_FORMS_TOKEN_ENCRYPTION_KEY || process.env.BACKUP_ENCRYPTION_KEY || '',
  BACKUP_ENABLED: enabled(process.env.BACKUP_ENABLED),
  BACKUP_DIR: path.resolve(process.env.BACKUP_DIR || path.join(ROOT_DIR, 'data', 'backups')),
  BACKUP_INTERVAL_HOURS: positiveNumber(process.env.BACKUP_INTERVAL_HOURS, 24),
  BACKUP_RETENTION_DAYS: positiveNumber(process.env.BACKUP_RETENTION_DAYS, 30),
  BACKUP_ENCRYPTION_KEY: process.env.BACKUP_ENCRYPTION_KEY || '',
  RESTORE_DRILL_ENABLED: enabled(process.env.RESTORE_DRILL_ENABLED, true),
  RESTORE_DRILL_MAX_BYTES: positiveNumber(process.env.RESTORE_DRILL_MAX_BYTES, 250 * 1024 * 1024),
  ALERT_WEBHOOK_URL: process.env.ALERT_WEBHOOK_URL || '',
  MONITOR_INTERVAL_SECONDS: positiveNumber(process.env.MONITOR_INTERVAL_SECONDS, 300),
  // Skip the periodic database/session health-check ping during these off-hours (no
  // real exam traffic expected then) so an idle Railway Postgres plugin isn't kept
  // artificially busy overnight. Wraps past midnight when start > end.
  QUIET_HOURS_ENABLED: enabled(process.env.QUIET_HOURS_ENABLED, true),
  QUIET_HOURS_START_HOUR: hourOfDay(process.env.QUIET_HOURS_START_HOUR, 23),
  QUIET_HOURS_END_HOUR: hourOfDay(process.env.QUIET_HOURS_END_HOUR, 7),
  QUIET_HOURS_TIMEZONE: process.env.QUIET_HOURS_TIMEZONE || 'Asia/Bangkok',
  ALERT_COOLDOWN_MINUTES: positiveNumber(process.env.ALERT_COOLDOWN_MINUTES, 15),
  ALERT_ERROR_RATE_PERCENT: positiveNumber(process.env.ALERT_ERROR_RATE_PERCENT, 5),
  ALERT_QUEUE_PERCENT: positiveNumber(process.env.ALERT_QUEUE_PERCENT, 80),
  JOB_CONCURRENCY: positiveNumber(process.env.JOB_CONCURRENCY, 2),
  JOB_MAX_PENDING: positiveNumber(process.env.JOB_MAX_PENDING, 100),
  JOB_RETRY_BASE_MS: positiveNumber(process.env.JOB_RETRY_BASE_MS, 1000),
  SUBMISSION_MAX_CONCURRENT: positiveNumber(process.env.SUBMISSION_MAX_CONCURRENT, 75),
  SUBMISSION_MAX_PENDING: positiveNumber(process.env.SUBMISSION_MAX_PENDING, 1200),
  REDIS_URL: process.env.REDIS_URL || '',
  SESSION_KEY_PREFIX: process.env.SESSION_KEY_PREFIX || 'exam',
  RESEND_API_KEY: process.env.RESEND_API_KEY || '',
  SCORE_REPORT_FROM_EMAIL: process.env.SCORE_REPORT_FROM_EMAIL || '',
  EXAM_TYPES: ['กลางภาค', 'ปลายภาค', 'บล็อคคอร์ส']
};
