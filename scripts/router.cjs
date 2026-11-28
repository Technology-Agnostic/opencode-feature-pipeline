#!/usr/bin/env node
// The router: the whole "connection" layer between steps. It reads ONE file —
// the YAML frontmatter of an artifact — validates it mechanically, applies the
// transition table, and appends a ledger row. It never reads the artifact body.
//
// usage: node router.cjs <artifact.md> [--verify] [--attempt N] [--ledger <ledger.md>]
//
// Exit 0 when the header is valid, 1 when it is not.
const fs = require('node:fs');
const path = require('node:path');
const { budgetFor, runGate } = require('./lib/gates.cjs');

const argv = process.argv.slice(2);
const file = argv[0];
if (!file) {
  console.error('usage: node router.cjs <artifact.md> [--verify] [--attempt N] [--ledger <ledger.md>]');
  process.exit(2);
}
const flag = (name) => {
  const i = argv.indexOf(name);
  return i > -1 ? argv[i + 1] : null;
};
const has = (name) => argv.includes(name);
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
// Steps that may carry open questions for the user. A blocking question pauses
// the run; implement and test never ask, they report a gap instead.
const READ_STEPS = ['analysis', 'design', 'architecture', 'plan'];
const METRICS = {
  analysis: ['ac', 'questions_blocking', 'risk_flags', 'rules', 'rules_covered', 'files_estimate', 'assumptions'],
  design: ['screens', 'states', 'a11y_checks', 'files_estimate', 'risk_flags', 'questions_blocking'],
  architecture: ['modules', 'interfaces', 'files_estimate', 'new_files', 'questions_blocking'],
  plan: ['ac', 'ac_assigned', 'steps', 'steps_with_acceptance', 'visual_checks', 'files_estimate', 'questions_blocking', 'design_refs', 'architecture_refs'],
  implement: ['step', 'steps_done', 'steps_planned', 'files_touched', 'tests_added', 'deviations', 'visual_checks'],
  fix: ['fixed', 'remaining', 'retest', 'files_touched', 'tests_added', 'deviations'],
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

if (header.status === 'done') {
  // Only steps with a real project command need a verify object. Read steps are
  // verified by the router's gate; implement reports its acceptance command; test
  // reports the suite. The worker's reported numbers are trusted: the router does
  // not re-run the project command, only the structural gate.
  if (['test', 'implement', 'fix'].includes(step)) {
    if (!header.verify || typeof header.verify !== 'object') v.push('done without verify object');
    else {
      if (!header.verify.cmd) v.push('verify.cmd is required');
      if (header.verify.exit !== 0) v.push(`verify exit ${header.verify.exit}`);
      if (header.verify.failed) v.push(`verify reported ${header.verify.failed} failed`);
    }
  }
  if (Number(header.metrics?.questions_blocking ?? 0) > 0 && !READ_STEPS.includes(step)) {
    v.push('done with blocking questions');
  }
}
if (header.status === 'needs_input' && step === 'implement' && !Array.isArray(header.needs_files)) {
  v.push('needs_input without needs_files');
}

const bodyLines = raw.slice(fm[0].length).split(/\r?\n/).filter(l => l.trim()).length;
const budget = budgetFor(step);
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
// The router re-runs the step's structural gate. A missing or malformed header
// cannot skip the check, and the gate's violations become the router's
// violations, so a reject says what is actually wrong. The project command is
// NOT re-run here: the worker already ran it and reported real numbers, and the
// close step runs the full build and suite once. The gate specs live in
// lib/gates.cjs, shared with artifact.cjs.
let gate = null;
const corrected = [];

if (has('--verify') && header.status === 'done') {
  const ran = runGate(step, file);
  if (ran.error) v.push(ran.error);
  if (ran.output) gate = { ...(gate || {}), ...ran.output };
  const derived = step === 'analysis'
    ? ['ac', 'rules', 'rules_covered', 'questions_blocking']
    : step === 'plan'
      ? ['ac', 'ac_assigned', 'steps', 'steps_with_acceptance', 'visual_checks', 'files_estimate', 'questions_blocking', 'design_refs', 'architecture_refs']
      : step === 'test'
        ? ['checks_total', 'checks_passed', 'findings_blocker', 'findings_major', 'findings_minor', 'ac_deviations']
        : step === 'fix'
          ? ['fixed', 'remaining', 'retest']
          : (step === 'design' || step === 'architecture')
            ? ['questions_blocking']
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

// The deterministic scope recommendation. The human may override it; the router
// only recommends, it never decides to run design or architecture on its own.
const recommend = {
  design: risk.includes('ui') || risk.includes('a11y'),
  architecture: files > 10 || risky.length > 0,
};

// The scope the user chose, recorded by the orchestrator in scope.md. When the
// file is absent (an older or hand-driven run) the router falls back to its
// recommendation so design -> architecture still routes.
function readScope(dir) {
  const file = path.join(dir, 'scope.md');
  if (!fs.existsSync(file)) return null;
  const out = {};
  for (const line of fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const m = line.match(/^([a-z_]+):\s*(yes|no)\s*$/i);
    if (m) out[m[1]] = m[2].toLowerCase() === 'yes';
  }
  return out;
}

function blockingReason(step, blocking) {
  return attempt >= 2
    ? `${blocking} blocking question(s) still open after one answer round`
    : `${blocking} blocking question(s); ask the user, then re-run ${step}`;
}

let decision = 'human';
let reason = 'no rule matched';

if (header.status && header.status !== 'done') {
  // A needs_input implement step names the files it still needs; the
  // orchestrator can grant them and re-run the same step.
  if (header.status === 'needs_input' && step === 'implement') {
    decision = 'grant';
    reason = 'needs_input: grant the listed files and re-run the step';
  } else {
    decision = 'human';
    reason = `status: ${header.status}`;
  }
} else if (READ_STEPS.includes(step)) {
  const blocking = Number(metrics.questions_blocking ?? 0);
  if (blocking > 0) {
    decision = 'human';
    reason = blockingReason(step, blocking);
  } else if (step === 'analysis') {
    decision = 'ask_scope';
    reason = 'analysis valid; ask the user which of design/architecture to run';
  } else if (step === 'design') {
    const scope = readScope(path.dirname(path.resolve(file)));
    const runArch = scope ? scope.architecture === true : recommend.architecture;
    if (runArch) {
      decision = 'architecture';
      reason = 'scope says architecture next';
    } else {
      decision = 'plan';
      reason = 'design complete; plan next';
    }
  } else if (step === 'architecture') {
    decision = 'plan';
    reason = `${metrics.modules} module(s), ${metrics.files_estimate} files; plan next`;
  } else if (step === 'plan') {
    decision = 'implement';
    reason = `${metrics.steps} step(s), ${metrics.visual_checks} visual check(s); start S-01`;
  }
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
} else if (step === 'fix') {
  const fixed = Number(metrics.fixed ?? 0);
  const retest = Number(metrics.retest ?? 0);
  const remaining = Number(metrics.remaining ?? 0);
  if (fixed > 0 && retest > 0) {
    decision = 'test';
    reason = `${fixed} finding(s) fixed; re-run the named visual check(s)`;
  } else {
    decision = 'close';
    reason = `${fixed} finding(s) fixed; ${remaining} blocker/major left; close`;
  }
} else if (step === 'test') {
  const failed = ['build', 'unit'].filter(k => String(metrics[k]) === 'fail');
  if (failed.length) {
    decision = 'close';
    reason = `blocked: ${failed.join(', ')} failed`;
  } else {
    const openFindings = Number(metrics.findings_blocker ?? 0) + Number(metrics.findings_major ?? 0);
    recommend.fix = openFindings > 0;
    const dir = path.dirname(path.resolve(file));
    const fixReport = path.join(dir, 'fix-report.md');
    const scope = readScope(dir);
    const fixChosen = scope ? scope.fix : undefined;
    // The fix step is offered once, after test, and only when a blocker or a
    // major finding is open. The user decides; a declined fix goes to the
    // backlog. A fix-report already on disk means the one fix call was spent.
    if (openFindings > 0 && !fs.existsSync(fixReport) && fixChosen === undefined) {
      decision = 'ask_fix';
      reason = `${openFindings} blocker/major finding(s); ask the user whether to run fix`;
    } else if (openFindings > 0 && !fs.existsSync(fixReport) && fixChosen === true) {
      decision = 'fix';
      reason = 'scope says fix next';
    } else {
      decision = 'close';
      const left = openFindings > 0 ? `; ${openFindings} finding(s) in the backlog` : '';
      reason = `${metrics.checks_passed}/${metrics.checks_total} checks passed; ${metrics.findings_major} major, ${metrics.findings_minor} minor, ${metrics.ac_deviations} AC deviation(s)${left}`;
    }
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
  decision,
  reason,
  recommend,
  needs_files: Array.isArray(header.needs_files) ? header.needs_files : null,
  corrected,
  warnings,
  metrics: Object.keys(metrics).length ? metrics : null,
  gate,
  ledger: ledgerRow,
};
console.log(JSON.stringify(result, null, 2));
process.exit(v.length ? 1 : 0);
