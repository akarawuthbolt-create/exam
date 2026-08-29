/* Read-only production benchmark. It only sends GET requests and never writes exam data. */
const { performance } = require('perf_hooks');

const baseUrl = String(process.env.RAILWAY_LOAD_URL || 'https://examz.up.railway.app').replace(/\/$/, '');
const total = Math.max(1, Number(process.argv[2] || 1000));
const concurrency = Math.max(1, Number(process.argv[3] || 100));
if (baseUrl !== 'https://examz.up.railway.app') throw new Error('This benchmark is restricted to the approved Railway production URL.');

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p / 100) - 1)] || 0;
}

async function main() {
  const results = new Array(total);
  let cursor = 0;
  const started = performance.now();
  async function worker() {
    while (cursor < total) {
      const index = cursor++;
      const at = performance.now();
      try {
        const response = await fetch(baseUrl + '/api/sets', { headers: { 'cache-control': 'no-cache' }, signal: AbortSignal.timeout(15_000) });
        await response.arrayBuffer();
        results[index] = { status: response.status, ms: performance.now() - at };
      } catch (error) { results[index] = { status: error.name === 'TimeoutError' ? 'timeout' : 'network_error', ms: performance.now() - at, error: error.message }; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, total) }, worker));
  const elapsed = performance.now() - started;
  const statuses = {};
  for (const result of results) statuses[result.status] = (statuses[result.status] || 0) + 1;
  const values = results.map(result => result.ms);
  process.stdout.write(JSON.stringify({ target: baseUrl + '/api/sets', readOnly: true, requests: total, concurrency, durationSeconds: +(elapsed / 1000).toFixed(2), requestsPerSecond: +(total / (elapsed / 1000)).toFixed(1), latencyMs: { p50: +percentile(values, 50).toFixed(1), p95: +percentile(values, 95).toFixed(1), p99: +percentile(values, 99).toFixed(1), max: +Math.max(...values).toFixed(1) }, statuses }, null, 2) + '\n');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
