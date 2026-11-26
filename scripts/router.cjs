#!/usr/bin/env node
// The router: the whole "connection" layer between steps. It reads ONE file —
// the YAML frontmatter of an artifact — validates it mechanically, applies the
// transition table, and appends a ledger row. It never reads the artifact body.
//
// usage: node router.cjs <artifact.md> [--verify] [--mode standard|full]
//                                  [--attempt N] [--ledger <ledger.md>]
//
// Exit 0 when the header is valid, 1 when it is not.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { budgetFor, parse, runGate } = require('./lib/gates.cjs');

const argv = process.argv.slice(2);
const file = argv[0];
if (!file) {
  console.error('usage: node router.cjs <artifact.md> [--verify] [--mode standard|full] [--attempt N] [--ledger <ledger.md>]');
  process.exit(2);
}
const flag = (name) => {
  const i = argv.indexOf(name);
  return i > -1 ? argv[i + 1] : null;
};
const has = (name) => argv.includes(name);
const mode = flag('--mode') || 'standard';
const attempt = Number(flag('--attempt') || 0);

// --- frontmatter ---------------------------------------------------------
// The harness file writer adds a UTF-8 BOM on Windows; strip it before the
// frontmatter regex, or every artifact written by a tool looks headerless.
const raw = fs.readFileSync(path.resolve(file), 'utf8').replace(/^\uFEFF/, '');
const fm = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
if (!fm) {
  console.log(JSON.stringify({ valid: false, violations: ['no YAML frontmatter'], decision: 'reject' }, null, 2));
  process.exit(1);
}
const header = {};
for (const line of fm[1].split(/\r?\n/)) {
  const m = line.match(/^([a-z_]+):\s*(.*)$/);
  if (!m) continue;
  const [, key, value] = m;
  if (value.startsWith('{') || value.startsWith('[')) {
    try { header[key] = JSON.parse(value); } catch { header[key] = value; }
  } else if (/^-?\d+$/.test(value)) {
    header[key] = Number(value);
  } else {
    header[key] = value.trim();
  }
}

const v = [];
const warnings = [];
const STATUSES = ['done', 'blocked', 'needs_input', 'rejected', 'skipped'];
const METRICS = {
  analysis: ['ac', 'questions_blocking', 'risk_flags', 'rules', 'rules_covered', 'files_estimate', 'assumptions'],
  design: ['screens', 'states', 'a11y_checks', 'files_estimate', 'risk_flags'],
  architecture: ['modules', 'interfaces', 'files_estimate', 'new_files'],
  plan: ['ac', 'ac_assigned', 'steps', 'steps_with_acceptance', 'visual_checks', 'files_estimate'],
  implement: ['step', 'steps_done', 'steps_planned', 'files_touched', 'tests_added', 'deviations', 'visual_checks'],
  test: ['build', 'unit', 'checks_passed', 'checks_total', 'findings_blocker', 'findings_major', 'findings_minor', 'ac_deviations', 'viewports'],
};
// Budgets are body lines, blank lines excluded and frontmatter not counted.
// The number lives in the step contract; lib/gates.cjs parses that one line so
// the packet, seal and router cannot disagree.

// --- validation ----------------------------------------------------------
// `next` is informational: the router decides. It is no longer required or
// validated, so a model cannot break the run by guessing the next step.
for (const key of ['step', 'status', 'metrics']) {
  if (!(key in header)) v.push(`missing field: ${key}`);
}
if (!STATUSES.includes(header.status)) v.push(`bad status: ${header.status}`);
if (header.changed !== undefined && !Array.isArray(header.changed)) v.push('changed must be a JSON array');

const step = header.step;
if (step && !METRICS[step]) v.push(`unknown step: ${step}`);
if (step && !['standard', 'full'].includes(mode)) v.push(`unknown mode: ${mode}`);

if (header.status === 'done') {
  // Only steps with a real project command need a verify object. Read steps are
  // verified by the router's gate; implement by its acceptance command; test by
  // the suite.
  if (['test', 'implement'].includes(step)) {
    if (!header.verify || typeof header.verify !== 'object') v.push('done without verify object');
    else {
      if (!header.verify.cmd) v.push('verify.cmd is required');
      if (header.verify.exit !== 0) v.push(`verify exit ${header.verify.exit}`);
      if (header.verify.failed) v.push(`verify reported ${header.verify.failed} failed`);
    }
  }
  if (Number(header.metrics?.questions_blocking ?? 0) > 0 && step !== 'analysis') {
    v.push('done with blocking questions');
  }
}
if (header.status === 'needs_input' && Array.isArray(header.changed)) {
  const outside = header.changed.filter(f => !String(f).replace(/\\/g, '/').startsWith('.opencode/plans/'));
  if (outside.length) v.push('needs_input with changed files outside the plan folder');
}

const bodyLines = raw.slice(fm[0].length).split(/\r?\n/).filter(l => l.trim()).length;
const budget = budgetFor(step, mode);
if (step && budget && bodyLines > budget) {
  const over = `body ${bodyLines} lines > budget ${budget} (frontmatter excluded)`;
  // A budget is a cost target, not a correctness rule. A repair call costs more
  // than the extra lines, so an overrun is recorded and allowed; only twice the
  // budget is a runaway and rejects.
  if (bodyLines > budget * 2) v.push(over);
  else warnings.push(over);
}

const metrics = header.metrics && typeof header.metrics === 'object' ? header.metrics : {};
for (const key of METRICS[step] || []) {
  if (!(key in metrics)) v.push(`metrics missing: ${key}`);
}

if (step === 'plan') {
  if (Number(metrics.steps) !== Number(metrics.steps_with_acceptance)) v.push('not every step has an acceptance command');
  if (Number(metrics.ac) !== Number(metrics.ac_assigned)) v.push('not every AC is assigned to a step');
}
if (step === 'test') {
  for (const key of ['build', 'unit']) {
    if (!['pass', 'fail'].includes(String(metrics[key]))) v.push(`${key} must be pass or fail`);
  }
}

// --- trust but verify ----------------------------------------------------
let gate = null;
let verifyRan = false;
const corrected = [];
// Gate commands quote arguments, for example --require "## Decisions". A naive
// split on spaces would turn that into `"##` and `Decisions"`, so the gate would
// fail (or, worse, silently check a section named `##`).
function tokenize(cmd) {
  const out = [];
  let cur = '';
  let quote = null;
  for (const ch of String(cmd)) {
    if (quote) {
      if (ch === quote) quote = null;
      else cur += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (/\s/.test(ch)) {
      if (cur) { out.push(cur); cur = ''; }
    } else {
      cur += ch;
    }
  }
  if (cur) out.push(cur);
  return out;
}
function runCommand(cmd) {
  const parts = tokenize(cmd);
  const isNode = parts[0] === 'node';
  let bin = isNode ? process.execPath : parts[0];
  const args = parts.slice(1);
  // Bare npm/npx/ng are shims without an extension on Windows; use the .cmd.
  if (process.platform === 'win32' && /^(npm|npx|ng)$/i.test(bin)) bin += '.cmd';
  // Node refuses to spawn .cmd/.bat directly on Windows (EINVAL), so batch
  // shims go through cmd.exe as one command line; `node` stays direct.
  if (process.platform === 'win32' && /\.(cmd|bat)$/i.test(bin)) {
    const line = [bin, ...args].map(quoteArg).join(' ');
    return execFileSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `"${line}"`], {
      cwd: process.cwd(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      // Two things must hold at once. Node must not re-quote the line: it escapes
      // quotes as \" and cmd.exe does not understand that. And cmd.exe with /s
      // strips exactly one outer pair of quotes, so the line needs that pair even
      // when it already starts with a quoted path; otherwise a command such as
      // "C:\tools\npm.cmd" run build loses its first quote and the path breaks.
      windowsVerbatimArguments: true,
    });
  }
  return execFileSync(bin, args, { cwd: process.cwd(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}
function quoteArg(value) {
  return /^[\w@%+=:,./-]+$/.test(value) ? value : '"' + value.replace(/"/g, '""') + '"';
}
// The router runs the step's gate itself. A missing or malformed `verify.gate`
// can no longer skip the check, and the gate's violations become the router's
// violations, so a reject says what is actually wrong. The gate specs live in
// lib/gates.cjs, shared with artifact.cjs.

if (has('--verify') && header.status === 'done') {
  // Only steps with a real project command run one. Read steps are verified by
  // the router's gate; design and architecture have no project command at all.
  // `test` never changes code: its report already records the build and suite,
  // so re-running the whole suite here is pure duplication. An implement step
  // runs when its report shows code, new tests, or no file evidence at all. A
  // report-only step has no code, no tests and only its own report in `changed`,
  // so it is verified by the gate alone. New test files are a reliable signal
  // even when `changed` misses an untracked directory (the `files_touched` gap).
  const changed = Array.isArray(header.changed) ? header.changed : [];
  const changedCode = changed.length === 0
    || changed.some(file => !String(file).replace(/\\/g, '/').startsWith('.opencode/'));
  const changedTests = Number(metrics.tests_added ?? 0) > 0;
  const shouldVerify = step === 'implement'
    && header.verify?.cmd
    && (changedCode || changedTests);
  if (shouldVerify) {
    verifyRan = true;
    try {
      gate = parse(runCommand(header.verify.cmd));
    } catch (e) {
      gate = { ...(gate || {}), error: String(e.stdout || e.message).slice(0, 400) };
      // A missing binary and a red test both land here. The exit code tells them
      // apart: a number means the command ran and failed, so the trace should not
      // look like a broken harness. A launch failure has no exit status.
      const why = typeof e.status === 'number' ? `exit ${e.status}` : 'could not start';
      v.push(`project command failed (${why})`);
    }
  }
  const ran = runGate(step, file);
  if (ran.error) v.push(ran.error);
  if (ran.output) gate = { ...(gate || {}), ...ran.output };
  const derived = step === 'analysis'
    ? ['ac', 'rules', 'rules_covered', 'questions_blocking']
    : step === 'plan'
      ? ['ac', 'ac_assigned', 'steps', 'steps_with_acceptance', 'visual_checks', 'files_estimate']
      : step === 'test'
        ? ['checks_total', 'checks_passed', 'findings_blocker', 'findings_major', 'findings_minor', 'ac_deviations']
        : [];
  // The gate is the source of truth for every number it computes. A mismatch
  // is corrected and recorded instead of becoming a repair call: the model is
  // bad at copying numbers, the gate is not.
  if (ran.output && !ran.error && typeof ran.output === 'object') {
    for (const key of derived) {
      if (key in ran.output && Number(metrics[key]) !== Number(ran.output[key])) {
        corrected.push(`${key}: ${metrics[key] ?? 'missing'} -> ${ran.output[key]}`);
        metrics[key] = ran.output[key];
      }
    }
  }
}

// --- decisions -----------------------------------------------------------
const risk = Array.isArray(metrics.risk_flags) ? metrics.risk_flags : [];
const risky = risk.filter(r => ['auth', 'money', 'migration', 'public'].includes(r));
const files = Number(metrics.files_estimate ?? 0);
const wantsDesign = risk.includes('ui') || risk.includes('a11y');
const wantsArchitecture = files > 10 || risky.length > 0 || mode === 'full';

let decision = 'human';
let reason = 'no rule matched';

if (header.status && header.status !== 'done') {
  decision = 'human';
  reason = `status: ${header.status}`;
} else if (step === 'analysis') {
  const blocking = Number(metrics.questions_blocking ?? 0);
  if (blocking > 0) {
    decision = 'human';
    reason = attempt >= 2
      ? `${blocking} blocking question(s) still open after one answer round`
      : `${blocking} blocking question(s); ask the user, then re-run analysis`;
  } else if (wantsDesign) {
    decision = 'design';
    reason = 'ui/a11y risk: design before the plan';
  } else if (wantsArchitecture) {
    decision = 'architecture';
    reason = `architecture: ${files} files, risk ${risky.join(', ') || 'full mode'}`;
  } else {
    decision = 'plan';
    reason = 'small change: no design or architecture needed';
  }
} else if (step === 'design') {
  if (wantsArchitecture) {
    decision = 'architecture';
    reason = `architecture: ${files} files, risk ${risky.join(', ') || 'full mode'}`;
  } else {
    decision = 'plan';
    reason = 'design complete; small change';
  }
} else if (step === 'architecture') {
  decision = 'plan';
  reason = `${metrics.modules} module(s), ${metrics.files_estimate} files; plan next`;
} else if (step === 'plan') {
  decision = 'implement';
  reason = `${metrics.steps} step(s), ${metrics.visual_checks} visual check(s); start S-01`;
} else if (step === 'implement') {
  const done = Number(metrics.steps_done ?? 0);
  const planned = Number(metrics.steps_planned ?? 0);
  if (done < planned) {
    decision = 'implement';
    reason = `${done}/${planned} steps done`;
  } else if (Number(metrics.visual_checks ?? 0) > 0) {
    decision = 'test';
    reason = 'all steps done; visual checks remain';
  } else {
    decision = 'close';
    reason = 'all steps done; no visual checks';
  }
} else if (step === 'test') {
  const failed = ['build', 'unit'].filter(k => String(metrics[k]) === 'fail');
  if (failed.length) {
    decision = 'close';
    reason = `blocked: ${failed.join(', ')} failed`;
  } else {
    decision = 'close';
    reason = `${metrics.checks_passed}/${metrics.checks_total} checks passed; ${metrics.findings_major} major, ${metrics.findings_minor} minor, ${metrics.ac_deviations} AC deviation(s)`;
  }
}

if (v.length) {
  decision = 'reject';
  reason = 'invalid header';
}

// --- ledger --------------------------------------------------------------
let ledgerRow = null;
const ledgerPath = flag('--ledger');
if (ledgerPath) {
  const abs = path.resolve(ledgerPath);
  const existing = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : '';
  const n = (existing.match(/^\|\s*H-\d+/gm) || []).length + 1;
  const id = `H-${String(n).padStart(2, '0')}`;
  const art = file.replace(/\\/g, '/').split('/').slice(-2).join('/');
  const when = new Date().toLocaleString('sv-SE').slice(0, 16);
  const extra = [
    ...corrected.map(c => `corrected ${c}`),
    ...warnings.map(w => `warning: ${w}`),
  ];
  const reasonText = extra.length ? `${reason}; ${extra.join('; ')}` : reason;
  ledgerRow = `| ${id} | ${step} | ${decision} | ${String(reasonText).replace(/\|/g, '/')} | ${art} | ${when} |`;
  if (decision === 'reject' && v.length) {
    // Keep the trace self-explaining: the next analysis should not need the session log.
    ledgerRow = `| ${id} | ${step} | reject | ${v.slice(0, 2).join('; ').replace(/\|/g, '/')} | ${art} | ${when} |`;
  }
  if (!existing) {
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, '# Ledger\n\n| ID | Step | Decision | Reason | Artifact | Time |\n|----|------|----------|--------|----------|------|\n', 'utf8');
  }
  fs.appendFileSync(abs, `${ledgerRow}\n`, 'utf8');
}

const result = {
  valid: v.length === 0,
  violations: v,
  step,
  mode,
  decision,
  reason,
  corrected,
  warnings,
  metrics: Object.keys(metrics).length ? metrics : null,
  verify_ran: verifyRan,
  gate,
  ledger: ledgerRow,
};
console.log(JSON.stringify(result, null, 2));
process.exit(v.length ? 1 : 0);
