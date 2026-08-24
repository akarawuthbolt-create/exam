const { normalizeExamDateTime } = require('./grading');

const DEFAULT_ARCHIVE_AFTER_MS = 30 * 24 * 60 * 60 * 1000;

function examLastDateAt(set) {
  const regularSchedules = (Array.isArray(set?.examSchedules) ? set.examSchedules : [])
    .filter(schedule => schedule && !schedule.absenceOnly);
  const candidates = regularSchedules.length
    ? regularSchedules.map(schedule => schedule.availableFrom)
    : [set?.availableFrom];
  const values = candidates
    .map(value => Date.parse(normalizeExamDateTime(value))).filter(Number.isFinite);
  return values.length ? Math.max(...values) : null;
}

function archiveExpiredExamSets(db, now = Date.now(), archiveAfterMs = DEFAULT_ARCHIVE_AFTER_MS) {
  const archivedKeys = [], archivedAt = new Date(now).toISOString();
  for (const set of db.sets || []) {
    if (set.archived || set.deletedAt || set.permanentlyDeletedAt) continue;
    const examDateAt = examLastDateAt(set);
    if (examDateAt === null || examDateAt + archiveAfterMs > now) continue;
    set.archived = true; set.archivedAt = archivedAt; set.autoArchivedAt = archivedAt;
    set.autoArchiveReason = 'exam_date_30_days_ago'; set.quickOpen = false; set.quickOpenedAt = null; set.updatedAt = archivedAt;
    archivedKeys.push(set.key);
  }
  return archivedKeys;
}

function createExamAutoArchive({ mutateDB, intervalMs = 6 * 60 * 60 * 1000, now = () => Date.now() }) {
  let timer = null;
  const run = () => mutateDB(db => ({ archivedKeys: archiveExpiredExamSets(db, now()), checkedAt: new Date(now()).toISOString() }));
  const start = () => { if (!timer) { timer = setInterval(() => { void run().catch(() => {}); }, intervalMs); timer.unref(); } };
  const stop = () => { if (timer) clearInterval(timer); timer = null; };
  return { run, start, stop };
}

module.exports = { DEFAULT_ARCHIVE_AFTER_MS, examLastDateAt, examLastEndAt: examLastDateAt, archiveExpiredExamSets, createExamAutoArchive };
