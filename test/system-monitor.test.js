const test = require('node:test');
const assert = require('node:assert/strict');
const { createSystemMonitor } = require('../src/system-monitor');

test('monitor alerts once when database fails and reports recovery', async () => {
  let available = false;
  const alerts = [];
  const monitor = createSystemMonitor({
    pingDatabase: async () => { if (!available) throw new Error('down'); return { status: 'connected', engine: 'SQLite', latencyMs: 1 }; },
    runtimeMetrics: { snapshot: () => ({ totalRequests: 0, errorRatePercent: 0 }) },
    submissionGate: { snapshot: () => ({ pending: 0, maxPending: 500 }) },
    alertManager: { send: async alert => { alerts.push(alert.type); } }
  });
  await monitor.check();
  await monitor.check();
  available = true;
  await monitor.check();
  assert.deepEqual(alerts, ['database_down', 'database_recovered']);
  assert.equal(monitor.status().database.status, 'connected');
});

test('monitor reports shared session store failure and recovery', async () => {
  let available = false;
  const alerts = [];
  const monitor = createSystemMonitor({
    pingDatabase: async () => ({ status: 'connected', engine: 'PostgreSQL', latencyMs: 1 }),
    sessionStore: { ping: async () => { if (!available) throw new Error('down'); return { status: 'connected', engine: 'Redis', latencyMs: 2 }; }, status: () => ({ engine: 'Redis' }) },
    runtimeMetrics: { snapshot: () => ({ totalRequests: 0, errorRatePercent: 0 }) },
    submissionGate: { snapshot: () => ({ pending: 0, maxPending: 500 }) },
    alertManager: { send: async alert => { alerts.push(alert.type); } }
  });
  await monitor.check();
  available = true;
  await monitor.check();
  assert.deepEqual(alerts, ['session_store_down', 'session_store_recovered']);
  assert.equal(monitor.status().sessions.engine, 'Redis');
});

test('monitor skips its checks during quiet hours instead of pinging the database', async () => {
  let pings = 0;
  const monitor = createSystemMonitor({
    pingDatabase: async () => { pings++; return { status: 'connected', engine: 'SQLite', latencyMs: 1 }; },
    runtimeMetrics: { snapshot: () => ({ totalRequests: 0, errorRatePercent: 0 }) },
    submissionGate: { snapshot: () => ({ pending: 0, maxPending: 500 }) },
    alertManager: { send: async () => {} },
    isQuietHours: () => true
  });
  await monitor.check();
  assert.equal(pings, 0);
  assert.equal(monitor.status().skippedForQuietHours, true);
});
