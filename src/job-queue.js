const crypto = require('crypto');

function createJobQueue({ concurrency = 2, maxPending = 100, historyLimit = 50, baseRetryMs = 1000, now = () => Date.now(), logger = console } = {}) {
  concurrency = Math.max(1, Math.floor(Number(concurrency) || 1));
  maxPending = Math.max(1, Math.floor(Number(maxPending) || 1));
  historyLimit = Math.max(1, Math.floor(Number(historyLimit) || 1));
  const handlers = new Map();
  const pending = [];
  const active = new Map();
  const retryTimers = new Map();
  const history = [];
  const idleWaiters = [];
  let accepting = true;
  let completed = 0;
  let failed = 0;
  let retried = 0;

  function register(type, handler) {
    if (!type || typeof handler !== 'function') throw new Error('Job type and handler are required');
    if (handlers.has(type)) throw new Error(`Job handler already registered: ${type}`);
    handlers.set(type, handler);
  }

  function isIdle() { return pending.length === 0 && active.size === 0 && retryTimers.size === 0; }
  function resolveIdle() {
    if (!isIdle()) return;
    while (idleWaiters.length) idleWaiters.shift()();
  }

  function publicJob(job) {
    return { id: job.id, type: job.type, status: job.status, attempt: job.attempt, maxAttempts: job.maxAttempts, createdAt: job.createdAt, startedAt: job.startedAt || null, finishedAt: job.finishedAt || null, durationMs: job.durationMs ?? null, error: job.error || null };
  }

  function archive(job) {
    history.unshift(publicJob(job));
    history.splice(historyLimit);
  }

  function withTimeout(promise, timeoutMs, controller) {
    let timer;
    return Promise.race([
      promise,
      new Promise((resolve, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new Error(`Job timed out after ${timeoutMs}ms`)); }, timeoutMs);
      })
    ]).finally(() => clearTimeout(timer));
  }

  function dispatch() {
    while (active.size < concurrency && pending.length) {
      const job = pending.shift();
      void execute(job);
    }
    resolveIdle();
  }

  async function execute(job) {
    const handler = handlers.get(job.type);
    job.status = 'running';
    job.attempt += 1;
    job.startedAt = new Date(now()).toISOString();
    active.set(job.id, job);
    const started = now();
    const controller = new AbortController();
    try {
      await withTimeout(Promise.resolve().then(() => handler({ signal: controller.signal, attempt: job.attempt, payload: job.payload })), job.timeoutMs, controller);
      job.status = 'completed';
      job.finishedAt = new Date(now()).toISOString();
      job.durationMs = Math.max(0, now() - started);
      completed += 1;
      archive(job);
    } catch (error) {
      job.error = error?.name === 'AbortError' || String(error?.message || '').startsWith('Job timed out') ? 'JobTimeoutError' : String(error?.code || error?.name || 'JobExecutionError').slice(0, 80);
      if (job.attempt < job.maxAttempts && accepting) {
        job.status = 'retrying';
        retried += 1;
        const delay = Math.min(baseRetryMs * (2 ** (job.attempt - 1)), 60_000);
        const timer = setTimeout(() => {
          retryTimers.delete(job.id);
          pending.push(job);
          dispatch();
        }, delay);
        retryTimers.set(job.id, timer);
      } else {
        job.status = 'failed';
        job.finishedAt = new Date(now()).toISOString();
        job.durationMs = Math.max(0, now() - started);
        failed += 1;
        archive(job);
        logger.error(`[jobs] ${job.type} failed after ${job.attempt} attempt(s):`, job.error);
      }
    } finally {
      active.delete(job.id);
      dispatch();
    }
  }

  function enqueue(type, { maxAttempts = 3, timeoutMs = 300_000, dedupeKey = '', payload = null } = {}) {
    if (!accepting) return { accepted: false, reason: 'stopping' };
    if (!handlers.has(type)) throw new Error(`No handler registered for job type: ${type}`);
    if (pending.length + retryTimers.size >= maxPending) return { accepted: false, reason: 'queue_full' };
    if (dedupeKey) {
      const duplicate = [...pending, ...active.values()].some(job => job.dedupeKey === dedupeKey) || [...retryTimers.keys()].some(id => id.startsWith(`${dedupeKey}:`));
      if (duplicate) return { accepted: false, reason: 'duplicate' };
    }
    const id = dedupeKey ? `${dedupeKey}:${crypto.randomUUID()}` : crypto.randomUUID();
    const job = { id, type, status: 'pending', attempt: 0, maxAttempts, timeoutMs, dedupeKey, payload, createdAt: new Date(now()).toISOString() };
    pending.push(job);
    queueMicrotask(dispatch);
    return { accepted: true, id };
  }

  function onIdle() { return isIdle() ? Promise.resolve() : new Promise(resolve => idleWaiters.push(resolve)); }
  async function stop({ drain = true } = {}) {
    accepting = false;
    for (const timer of retryTimers.values()) clearTimeout(timer);
    retryTimers.clear();
    if (!drain) {
      pending.splice(0);
    }
    dispatch();
    if (drain) await onIdle();
  }
  function snapshot() {
    return { accepting, concurrency, maxPending, pending: pending.length + retryTimers.size, active: active.size, completed, failed, retried, recentJobs: history.map(job => ({ ...job })) };
  }

  return { register, enqueue, onIdle, stop, snapshot };
}

module.exports = { createJobQueue };
