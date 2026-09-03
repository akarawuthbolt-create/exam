function createQuietHoursCheck({ enabled = false, startHour = 23, endHour = 7, timeZone = 'Asia/Bangkok' } = {}) {
  const formatter = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hour12: false });
  return function isQuietHours(now = Date.now()) {
    if (!enabled) return false;
    const hour = Number(formatter.format(now)) % 24;
    return startHour <= endHour
      ? hour >= startHour && hour < endHour
      : hour >= startHour || hour < endHour;
  };
}

module.exports = { createQuietHoursCheck };
