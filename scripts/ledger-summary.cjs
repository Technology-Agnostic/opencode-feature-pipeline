#!/usr/bin/env node
// Summarize ledger.md for progress.md and retro.md. The numbers in those files
// are otherwise hand-counted, and a hand count drifts from the trace.
//
// usage: node ledger-summary.cjs <ledger.md> [--md]
const fs = require('node:fs');

const file = process.argv[2];
if (!file) {
  console.error('usage: node ledger-summary.cjs <ledger.md> [--md]');
  process.exit(2);
}
const markdown = process.argv.includes('--md');
const lines = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/);

const rows = [];
for (const line of lines) {
  if (!/^\|\s*(H|SK)-\d+\s*\|/.test(line)) continue;
  const cells = line.split('|').slice(1, -1).map(cell => cell.trim());
  if (cells[0].startsWith('SK-')) {
    rows.push({
      id: cells[0], step: cells[1], decision: 'skipped', reason: cells[3] || '',
      time: cells[5] || cells[4] || '', model: false,
    });
    continue;
  }
  const [, step, decision, reason, , time] = cells;
  // A project-command reject is the router re-running the worker's acceptance
  // command; the worker was not called again. The row documents a router run, not
  // a model call. Every other row belongs to a model call: accepted, human, or a
  // rejected artifact.
  const model = !(decision === 'reject' && /^project command failed/i.test(String(reason)));
  rows.push({ id: cells[0], step, decision, reason, time, model });
}

const is = (value) => (row) => row.decision === value;
const accepted = rows.filter(row => !['reject', 'human', 'skipped'].includes(row.decision)).length;
const reject = rows.filter(is('reject')).length;
const human = rows.filter(is('human')).length;
const skipped = rows.filter(is('skipped')).length;

const byStep = {};
for (const row of rows) {
  const bucket = byStep[row.step] ||= { rows: 0, model: 0, worker: 0, accepted: 0, reject: 0, human: 0, skipped: 0 };
  bucket.rows += 1;
  if (row.model) {
    bucket.model += 1;
    if (row.step !== 'test') bucket.worker += 1;
  }
  if (row.decision === 'reject') bucket.reject += 1;
  else if (row.decision === 'human') bucket.human += 1;
  else if (row.decision === 'skipped') bucket.skipped += 1;
  else bucket.accepted += 1;
}

const modelCalls = rows.filter(row => row.model).length;
const workerCalls = rows.filter(row => row.model && row.step !== 'test').length;
const testCalls = modelCalls - workerCalls;

const reasons = {};
for (const row of rows.filter(is('reject'))) {
  const key = String(row.reason).split(';')[0].trim().slice(0, 80);
  reasons[key] = (reasons[key] || 0) + 1;
}
const rejectReasons = Object.entries(reasons)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 5)
  .map(([reason, count]) => ({ reason, count }));

const parseTime = (value) => {
  const match = String(value).match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/);
  return match ? new Date(`${match[1]}T${match[2]}:00`).getTime() : NaN;
};
const times = rows.map(row => parseTime(row.time)).filter(Number.isFinite);
const first = times.length ? Math.min(...times) : null;
const last = times.length ? Math.max(...times) : null;
const spanMinutes = first !== null ? Math.round((last - first) / 60000) : null;
const fmt = (ms) => (ms === null ? null : new Date(ms).toLocaleString('sv-SE').slice(0, 16));

const summary = {
  rows: rows.length,
  // A ledger row is one router run. `calls` keeps its budget meaning: worker
  // model calls only (test is the orchestrator's own work). `model_calls` adds
  // that test call back, so the two numbers cannot be confused again.
  model_calls: modelCalls,
  worker_calls: workerCalls,
  test_calls: testCalls,
  router_runs: rows.length,
  calls: workerCalls,
  accepted,
  reject,
  human,
  skipped,
  first: fmt(first),
  last: fmt(last),
  span_minutes: spanMinutes,
  by_step: byStep,
  reject_reasons: rejectReasons,
};

if (!markdown) {
  console.log(JSON.stringify(summary, null, 2));
  process.exit(0);
}

const out = ['| step | rows | model | worker | accepted | reject | human |', '|---|---:|---:|---:|---:|---:|---:|'];
for (const [step, bucket] of Object.entries(byStep)) {
  out.push(`| ${step} | ${bucket.rows} | ${bucket.model} | ${bucket.worker} | ${bucket.accepted} | ${bucket.reject} | ${bucket.human} |`);
}
out.push('');
out.push(`Rows: ${summary.rows} (${summary.accepted} accepted, ${summary.reject} reject, ${summary.human} human${summary.skipped ? `, ${summary.skipped} skipped` : ''}); model calls: ${summary.model_calls} (worker ${summary.worker_calls}, test ${summary.test_calls}); router runs: ${summary.router_runs}; span ${summary.span_minutes} min.`);
if (rejectReasons.length) {
  out.push(`Rejects: ${rejectReasons.map(item => `${item.reason} x${item.count}`).join('; ')}.`);
}
console.log(out.join('\n'));
