#!/usr/bin/env node
// Gate for the `test` step. It proves every visual check from the plan was run
// and that findings are classified. It never judges the UI itself.
//
// usage: node check-test.cjs <test-report.md> --plan <plan.md> --analysis <analysis.md>
const fs = require('node:fs');
const path = require('node:path');

const argv = process.argv.slice(2);
const file = argv[0];
const planIdx = argv.indexOf('--plan');
const planFile = planIdx > -1 ? argv[planIdx + 1] : null;
const analysisIdx = argv.indexOf('--analysis');
const analysisFile = analysisIdx > -1 ? argv[analysisIdx + 1] : null;
if (!file || !planFile || !fs.existsSync(planFile)) {
  console.error(JSON.stringify({ failed: 1, violations: ['usage: check-test.cjs <report.md> --plan <plan.md> --analysis <analysis.md>'] }));
  process.exit(2);
}

// --- the checks the plan asked for ---------------------------------------
const plan = fs.readFileSync(path.resolve(planFile), 'utf8').split(/\r?\n/);
const wanted = new Map();
let inChecks = false;
for (const line of plan) {
  if (/^##\s+/.test(line)) { inChecks = /^##\s+Visual checks/i.test(line); continue; }
  if (inChecks && /^\|\s*V-\d+\s*\|/.test(line)) {
    const [, id, ac] = line.split('|').map(c => c.trim());
    wanted.set(id, ac);
  }
}

const acceptedAcs = new Set();
if (analysisFile && fs.existsSync(analysisFile)) {
  let inAc = false;
  for (const line of fs.readFileSync(path.resolve(analysisFile), 'utf8').split(/\r?\n/)) {
    if (/^##\s+/.test(line)) { inAc = /^##\s+AC coverage/i.test(line); continue; }
    if (inAc && /^\|\s*AC-\d+\.\d+\s*\|/.test(line)) {
      acceptedAcs.add(line.split('|')[1].trim());
    }
  }
}

// --- report ---------------------------------------------------------------
const lines = fs.readFileSync(path.resolve(file), 'utf8').split(/\r?\n/);
const violations = [];
const checks = new Map();
const findings = [];
const deviations = [];
let section = null;

for (const line of lines) {
  if (/^##\s+/.test(line)) {
    section = /^##\s+Checks/i.test(line) ? 'checks'
      : /^##\s+Findings/i.test(line) ? 'findings'
      : /^##\s+AC deviations/i.test(line) ? 'deviations'
      : null;
    continue;
  }
  if (section === 'checks' && /^\|\s*V-\d+\s*\|/.test(line)) {
    const [, id, result, evidence] = line.split('|').map(c => c.trim());
    if (checks.has(id)) violations.push(`${id}: duplicate check row`);
    checks.set(id, { result, evidence });
  }
  if (section === 'findings' && /^\|\s*(F-\d+|N-\d+)\s*\|/.test(line)) {
    const [, id, severity, what] = line.split('|').map(c => c.trim());
    findings.push({ id, severity, what });
  }
  if (section === 'deviations' && /^\|\s*AC-\d+\.\d+\s*\|/.test(line)) {
    const [, ac, why] = line.split('|').map(c => c.trim());
    deviations.push({ ac, why });
  }
}

for (const [id] of wanted) {
  const row = checks.get(id);
  if (!row) { violations.push(`${id}: not run`); continue; }
  if (!['pass', 'fail', 'blocked'].includes(row.result)) violations.push(`${id}: bad result "${row.result}"`);
  if (!row.evidence || row.evidence.length < 8) violations.push(`${id}: no evidence`);
}
for (const id of checks.keys()) {
  if (!wanted.has(id)) violations.push(`${id}: not in the plan`);
}

// A deviation says "the code does what the user needs, the AC text is wrong".
// That only makes sense for a check that actually failed; otherwise it is a
// finding dressed up to avoid counting a defect.
const failedAcs = new Set();
for (const [id, row] of checks) {
  if (row.result === 'fail' || row.result === 'blocked') {
    const ac = wanted.get(id);
    if (ac) failedAcs.add(ac);
  }
}

for (const f of findings) {
  if (f.severity === 'none') continue;
  if (!['blocker', 'major', 'minor'].includes(f.severity)) violations.push(`${f.id}: bad severity "${f.severity}"`);
  if (!f.what || f.what.length < 8) violations.push(`${f.id}: finding is too vague`);
}
for (const d of deviations) {
  if (acceptedAcs.size && !acceptedAcs.has(d.ac)) violations.push(`${d.ac}: unknown AC in deviations`);
  if (!failedAcs.has(d.ac)) violations.push(`${d.ac}: deviation without a failed check`);
  if (!d.why || d.why.length < 8) violations.push(`${d.ac}: deviation has no reason`);
}

const counted = findings.filter(f => f.severity !== 'none');
const result = {
  checks_total: wanted.size,
  checks_passed: [...checks.values()].filter(r => r.result === 'pass').length,
  findings_blocker: counted.filter(f => f.severity === 'blocker').length,
  findings_major: counted.filter(f => f.severity === 'major').length,
  findings_minor: counted.filter(f => f.severity === 'minor').length,
  ac_deviations: deviations.length,
  failed: violations.length,
  violations,
};
console.log(JSON.stringify(result, null, 2));
process.exit(violations.length === 0 ? 0 : 1);
