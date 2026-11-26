#!/usr/bin/env node
// Gate for the `plan` step. It proves the plan is executable and complete:
// every analysis AC is owned by exactly one step, every visual AC has a user
// check, and every spec a step touches is run by that step.
//
// usage: node check-plan.cjs <plan.md> --analysis <analysis.md>
const fs = require('node:fs');
const path = require('node:path');

const argv = process.argv.slice(2);
const file = argv[0];
const analysisIdx = argv.indexOf('--analysis');
const analysisFile = analysisIdx > -1 ? argv[analysisIdx + 1] : null;
if (!file || !analysisFile || !fs.existsSync(analysisFile)) {
  console.error(JSON.stringify({ failed: 1, violations: ['usage: check-plan.cjs <plan.md> --analysis <analysis.md>'] }));
  process.exit(2);
}

// --- analysis ACs ---------------------------------------------------------
const analysis = fs.readFileSync(path.resolve(analysisFile), 'utf8').split(/\r?\n/);
const accept = new Map();
let inAc = false;
for (const line of analysis) {
  if (/^##\s+/.test(line)) { inAc = /^##\s+AC coverage/i.test(line); continue; }
  if (inAc && /^\|\s*AC-\d+\.\d+\s*\|/.test(line)) {
    const [, id, method] = line.split('|').map(c => c.trim());
    accept.set(id, method);
  }
}

// --- plan ----------------------------------------------------------------
const lines = fs.readFileSync(path.resolve(file), 'utf8').split(/\r?\n/);
const violations = [];
const steps = [];
const checks = [];
let current = null;
let section = null;

for (const line of lines) {
  const h = line.match(/^###\s+(S-\d+)\s*:/);
  if (h) {
    current = { id: h[1], acs: [], files: [], acceptance: null };
    steps.push(current);
    section = 'steps';
    continue;
  }
  if (/^##\s+/.test(line)) {
    section = /^##\s+Steps/i.test(line) ? 'steps'
      : /^##\s+Visual checks/i.test(line) ? 'checks'
      : null;
    current = null;
    continue;
  }
  if (section === 'checks' && /^\|\s*V-\d+\s*\|/.test(line)) {
    const [, id, ac, scenario, expected, viewport] = line.split('|').map(c => c.trim());
    checks.push({ id, ac, scenario, expected, viewport });
    continue;
  }
  if (!current) continue;
  const acs = line.match(/^-\s+acs:\s*(.*)$/);
  if (acs) current.acs.push(...[...acs[1].matchAll(/AC-\d+\.\d+/g)].map(m => m[0]));
  const files = line.match(/^-\s+files:\s*(.*)$/);
  if (files) current.files.push(...[...files[1].matchAll(/`([^`]+)`/g)].map(m => m[1]));
  const acceptance = line.match(/^-\s+acceptance:\s*(.*)$/);
  if (acceptance && !current.acceptance) current.acceptance = acceptance[1].trim();
}

if (steps.length === 0) violations.push('no steps');
if (steps.length > 8) violations.push(`${steps.length} steps: split the feature`);

const assigned = new Map();
for (const step of steps) {
  if (!step.acceptance) violations.push(`${step.id}: no acceptance command`);
  if (step.files.length === 0) violations.push(`${step.id}: no files listed`);
  if (step.acs.length === 0) violations.push(`${step.id}: no - acs line`);
  for (const ac of step.acs) {
    if (!accept.has(ac)) violations.push(`${step.id}: unknown AC "${ac}"`);
    if (assigned.has(ac)) violations.push(`${ac}: owned by ${assigned.get(ac)} and ${step.id}`);
    assigned.set(ac, step.id);
  }

  // The gate does not know the project's runner. A spec token or a common include
  // flag counts as a targeted run; without one, the command is assumed to run the
  // whole suite, which is what a production-only step needs.
  const acceptance = String(step.acceptance || '');
  const includes = [
    ...[...acceptance.matchAll(/--(?:include|testPathPattern|testPathPatterns)[= ](\S+)/g)]
      .map(m => m[1].replace(/`/g, '').replace(/[),]+$/, '')),
    ...acceptance.split(/\s+/)
      .map(token => token.replace(/`/g, '').replace(/[),]+$/, ''))
      .filter(token => /\.(spec|test)\.[a-z]+/i.test(token)),
  ];
  const fullSuite = includes.length === 0;
  for (const f of step.files.filter(x => /\.(spec|test)\.[a-z]+$/i.test(x))) {
    if (fullSuite) break;
    const norm = f.replace(/^\.?\//, '');
    const base = norm.split('/').pop();
    const covered = includes.some(p => {
      if (p.includes('**')) {
        const dirTail = p.split('**')[0].replace(/\/$/, '').split('/').pop();
        return norm.split('/').slice(0, -1).includes(dirTail);
      }
      return p.split('/').pop() === base;
    });
    if (!covered) violations.push(`${step.id}: acceptance does not run ${base}`);
  }
}

for (const ac of accept.keys()) {
  if (!assigned.has(ac)) violations.push(`${ac}: no step owns it`);
}

const visualAcs = [...accept.entries()].filter(([, m]) => m === 'visual').map(([id]) => id);
const checkAcs = new Set();
for (const check of checks) {
  if (!accept.has(check.ac)) violations.push(`${check.id}: unknown AC "${check.ac}"`);
  else if (accept.get(check.ac) !== 'visual') violations.push(`${check.id}: ${check.ac} is not a visual AC`);
  checkAcs.add(check.ac);
  if (!check.scenario || check.scenario.length < 8) violations.push(`${check.id}: scenario is too vague`);
  if (!check.expected || check.expected.length < 8) violations.push(`${check.id}: expected result is too vague`);
  if (!check.viewport) violations.push(`${check.id}: no viewport`);
}
for (const ac of visualAcs) {
  if (!checkAcs.has(ac)) violations.push(`${ac}: visual AC has no V check`);
}

const files = new Set(steps.flatMap(s => s.files));
const result = {
  ac: accept.size,
  ac_assigned: [...accept.keys()].filter(a => assigned.has(a)).length,
  steps: steps.length,
  steps_with_acceptance: steps.filter(s => s.acceptance).length,
  visual_checks: checks.length,
  files_estimate: files.size,
  failed: violations.length,
  violations,
};
console.log(JSON.stringify(result, null, 2));
const ok = violations.length === 0 && steps.length > 0 &&
  result.ac_assigned === result.ac &&
  result.steps_with_acceptance === steps.length;
process.exit(ok ? 0 : 1);
