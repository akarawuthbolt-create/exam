const test = require('node:test');
const assert = require('node:assert/strict');
const { createQuietHoursCheck } = require('../src/quiet-hours');

test('quiet hours wrap past midnight and are timezone-aware', () => {
  const isQuietHours = createQuietHoursCheck({ enabled: true, startHour: 23, endHour: 7, timeZone: 'Asia/Bangkok' });
  // 2026-01-01 16:30 UTC = 23:30 in Asia/Bangkok (UTC+7) -> inside quiet hours
  assert.equal(isQuietHours(Date.parse('2026-01-01T16:30:00Z')), true);
  // 2026-01-01 23:30 UTC = 06:30 in Asia/Bangkok -> still inside quiet hours (before end)
  assert.equal(isQuietHours(Date.parse('2026-01-01T23:30:00Z')), true);
  // 2026-01-01 05:00 UTC = 12:00 in Asia/Bangkok -> outside quiet hours
  assert.equal(isQuietHours(Date.parse('2026-01-01T05:00:00Z')), false);
});

test('quiet hours check is disabled by default behavior', () => {
  const isQuietHours = createQuietHoursCheck({ enabled: false, startHour: 23, endHour: 7 });
  assert.equal(isQuietHours(Date.parse('2026-01-01T16:30:00Z')), false);
});
