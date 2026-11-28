#!/usr/bin/env node
// Gate for the `fix` step. It proves the fix report accounts for every blocker
// and major finding in the test report, and that every retest row names a real
// visual check. It never judges the code or the UI.
//
// usage: node check-fix.cjs <fix-report.md> --test <test-report.md> --test-plan <test-plan.md>
const fs = require('node:fs');
const path = require('node:path');

const argv = process.argv.slice(2);
const file = argv[0];
const flag = (name) => {
  const i = argv.indexOf(name);
  return i > -1 ? argv[i + 1] : null;
};
const testFile = flag('--test');
const planFile = flag('--test-plan');
if (!file || !testFile || !planFile || !fs.existsSync(testFile) || !fs.existsSync(planFile)) {
  console.error(JSON.stringify({
    failed: 1,
    violations: ['usage: check-fix.cjs <fix-report.md> --test <test-report.md> --test-plan <test-plan.md>'],
  }));
  process.exit(2);
}

const readLines = (target) => fs.readFileSync(path.resolve(target), 'utf8').split(/\r?\n/);

// --- findings the test step reported -------------------------------------
const findings = new Map();
let section = null;
for (const line of readLines(testFile)) {
  if (/^##\s+/.test(line)) {
    section = /^##\s+Findings/i.test(line) ? 'findings' : null;
    continue;
  }
  if (section === 'findings' && /^\|\s*(F-\d+|N-\d+)\s*\|/.test(line)) {
    const [, id, severity] = line.split('|').map((cell) => cell.trim());
    if (severity !== 'none') findings.set(id, severity);
  }
}

// --- visual checks the test plan asked for -------------------------------
const checks = new Set();
section = null;
for (const line of readLines(planFile)) {
  if (/^##\s+/.test(line)) {
    section = /^##\s+Checks/i.test(line) ? 'checks' : null;
    continue;
  }
  if (section === 'checks' && /^\|\s*V-\d+\s*\|/.test(line)) {
    checks.add(line.split('|')[1].trim());
  }
}

// --- fix report -----------------------------------------------------------
const fixed = [];
const notFixed = [];
const violations = [];
section = null;
for (const line of readLines(file)) {
  if (/^##\s+/.test(line)) {
    section = /^##\s+Fixed/i.test(line) ? 'fixed'
      : /^##\s+Not fixed/i.test(line) ? 'not-fixed'
        : null;
    continue;
  }
  if (section === 'fixed' && /^\|\s*F-\d+\s*\|/.test(line)) {
    const [, id, finding, change, retest] = line.split('|').map((cell) => cell.trim());
    fixed.push({ id, finding, change, retest });
  }
  if (section === 'not-fixed' && /^\|\s*F-\d+\s*\|/.test(line)) {
    const [, id, why] = line.split('|').map((cell) => cell.trim());
    notFixed.push({ id, why });
  }
}

const seen = new Set();
for (const row of [...fixed, ...notFixed]) {
  if (seen.has(row.id)) violations.push(`${row.id}: reported twice`);
  seen.add(row.id);
  if (!findings.has(row.id)) violations.push(`${row.id}: not a finding in the test report`);
}
for (const row of fixed) {
  if (!row.change || row.change.length < 8) violations.push(`${row.id}: change is too vague`);
  const retests = String(row.retest || 'none').split(',').map((id) => id.trim()).filter(Boolean);
  for (const id of retests) {
    if (id !== 'none' && !checks.has(id)) {
      violations.push(`${row.id}: retest "${id}" is not a V row`);
    }
  }
}
for (const row of notFixed) {
  if (!row.why || row.why.length < 8) violations.push(`${row.id}: no reason for leaving it open`);
}
// A done fix report with nothing fixed is not a fix: the honest status is
// blocked. A blocked report skips this gate in seal, so the run still closes.
if (fixed.length === 0) violations.push('no fixed finding; seal status blocked instead');

const open = [...findings.entries()]
  .filter(([, severity]) => severity === 'blocker' || severity === 'major')
  .map(([id]) => id);
const fixedIds = new Set(fixed.map((row) => row.id));
const remaining = open.filter((id) => !fixedIds.has(id)).length;
const retest = fixed.filter((row) => String(row.retest || '').split(',').some((id) => id.trim() && id.trim() !== 'none')).length;

const result = {
  fixed: fixed.length,
  remaining,
  retest,
  findings_blocker: [...findings.values()].filter((s) => s === 'blocker').length,
  findings_major: [...findings.values()].filter((s) => s === 'major').length,
  failed: violations.length,
  violations,
};
console.log(JSON.stringify(result, null, 2));
process.exit(violations.length === 0 ? 0 : 1);
