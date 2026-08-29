const { monitorEventLoopDelay } = require('perf_hooks');

function createRuntimeMetrics({ now = () => Date.now() } = {}) {
  const startedAt = new Date(now()).toISOString();
  let totalRequests = 0;
  let serverErrors = 0;
  let controlledRejections = 0;
  let totalDurationMs = 0;
  let inFlight = 0;
  const recentFailures = [];
  const eventLoopDelay = monitorEventLoopDelay({ resolution: 20 });
  eventLoopDelay.enable();

  function middleware(req, res, next) {
    if (!req.path.startsWith('/api') || req.path === '/api/admin/operations/stream') return next();
    const requestStartedAt = now();
    let completed = false;
    inFlight += 1;
    const complete = () => {
      if (completed) return;
      completed = true;
      const durationMs = Math.max(0, now() - requestStartedAt);
      inFlight = Math.max(0, inFlight - 1);
      totalRequests += 1;
      totalDurationMs += durationMs;
      if (res.locals?.runtimeMetricCategory === 'controlled_rejection') {
        controlledRejections += 1;
      } else if (res.statusCode >= 500) {
        serverErrors += 1;
        recentFailures.unshift({ occurredAt: new Date(now()).toISOString(), method: req.method, path: req.path, status: res.statusCode, durationMs });
        recentFailures.splice(10);
      }
    };
    res.once('finish', complete);
    res.once('close', complete);
    next();
  }

  function snapshot() {
    const eventLoopDelayMs = Number.isFinite(eventLoopDelay.percentile(99)) ? Math.round(eventLoopDelay.percentile(99) / 1e6) : 0;
    eventLoopDelay.reset();
    return {
      startedAt,
      totalRequests,
      serverErrors,
      controlledRejections,
      errorRatePercent: totalRequests ? Number((serverErrors / totalRequests * 100).toFixed(2)) : 0,
      averageResponseMs: totalRequests ? Math.round(totalDurationMs / totalRequests) : 0,
      inFlight,
      eventLoopDelayMs,
      recentFailures: [...recentFailures]
    };
  }

  return { middleware, snapshot };
}

module.exports = { createRuntimeMetrics };
