#!/usr/bin/env node
// Gate for the `plan` step. It proves the plan is executable without reading
// analysis, design or architecture: every AC is owned by a step, every step
// carries the design/architecture constraint it implements, and every visual AC
// has a user-level check in the separate test plan.
//
// usage: node check-plan.cjs <plan.md> --analysis <analysis.md> --test-plan <test-plan.md>
//                                      [--design <design.md>] [--architecture <architecture.md>]
const fs = require('node:fs');
const path = require('node:path');

const argv = process.argv.slice(2);
const file = argv[0];
const flag = (name) => {
  const i = argv.indexOf(name);
  return i > -1 ? argv[i + 1] : null;
};
const analysisFile = flag('--analysis');
const testPlanFile = flag('--test-plan');
const designFile = flag('--design');
const architectureFile = flag('--architecture');
if (!file || !analysisFile || !testPlanFile || !fs.existsSync(analysisFile) || !fs.existsSync(testPlanFile)) {
  console.error(JSON.stringify({
    failed: 1,
    violations: ['usage: check-plan.cjs <plan.md> --analysis <analysis.md> --test-plan <test-plan.md> [--design <design.md>] [--architecture <architecture.md>]'],
  }));
  process.exit(2);
}

const read = (target) => fs.readFileSync(path.resolve(target), 'utf8').split(/\r?\n/);

// --- analysis ACs ---------------------------------------------------------
const analysis = read(analysisFile);
const accept = new Map();
let inAc = false;
for (const line of analysis) {
  if (/^##\s+/.test(line)) { inAc = /^##\s+AC coverage/i.test(line); continue; }
  if (inAc && /^\|\s*AC-\d+\.\d+\s*\|/.test(line)) {
    const [, id, method] = line.split('|').map((cell) => cell.trim());
    accept.set(id, method);
  }
}

// --- design and architecture ids (optional) ------------------------------
function ids(target, prefix, heading) {
  const set = new Set();
  if (!target || !fs.existsSync(target)) return set;
  let inSection = false;
  for (const line of read(target)) {
    if (/^##\s+/.test(line)) { inSection = new RegExp(`^##\\s+${heading}`, 'i').test(line); continue; }
    if (!inSection) continue;
    const match = line.match(new RegExp(`^\\|\\s*(${prefix}-\\d+)\\s*\\|`));
    if (match) set.add(match[1]);
  }
  return set;
}
const designIds = ids(designFile, 'D', 'Screens');
const architectureIds = ids(architectureFile, 'A', 'Modules');

// --- plan ----------------------------------------------------------------
const lines = read(file);
const violations = [];
const steps = [];
let current = null;
let section = null;

for (const line of lines) {
  const heading = line.match(/^###\s+(S-\d+)\s*:/);
  if (heading) {
    current = { id: heading[1], acs: [], files: [], acceptance: null, design: null, architecture: null };
    steps.push(current);
    section = 'steps';
    continue;
  }
  if (/^##\s+/.test(line)) {
    section = /^##\s+Steps/i.test(line) ? 'steps' : null;
    current = null;
    continue;
  }
  if (!current) continue;
  const acs = line.match(/^-\s+acs:\s*(.*)$/);
  if (acs) current.acs.push(...[...acs[1].matchAll(/AC-\d+\.\d+/g)].map((m) => m[0]));
  const files = line.match(/^-\s+files:\s*(.*)$/);
  if (files) current.files.push(...[...files[1].matchAll(/`([^`]+)`/g)].map((m) => m[1]));
  const acceptance = line.match(/^-\s+acceptance:\s*(.*)$/);
  if (acceptance && !current.acceptance) current.acceptance = acceptance[1].trim();
  const design = line.match(/^-\s+design:\s*(.*)$/);
  if (design) current.design = design[1].trim();
  const architecture = line.match(/^-\s+architecture:\s*(.*)$/);
  if (architecture) current.architecture = architecture[1].trim();
}

if (!lines.some((line) => /^##\s+Context/i.test(line))) violations.push('missing ## Context');
if (!lines.some((line) => /^##\s+Steps/i.test(line))) violations.push('missing ## Steps');
if (steps.length === 0) violations.push('no steps');
if (steps.length > 9) violations.push(`${steps.length} steps: split the feature`);

// A step must say which design/architecture decision it compiles. `none` is
// valid; an id that does not exist in the source artifact is a broken pointer.
function checkRefs(stepId, field, value, known, prefix) {
  if (value === null) { violations.push(`${stepId}: no - ${field} line`); return; }
  if (/^none\b/i.test(value)) return;
  const found = [...value.matchAll(new RegExp(`${prefix}-\\d+`, 'g'))].map((m) => m[0]);
  if (found.length === 0) { violations.push(`${stepId}: ${field} must be none or ${prefix}-xx`); return; }
  for (const id of found) if (!known.has(id)) violations.push(`${stepId}: ${field} names unknown ${id}`);
}

const assigned = new Map();
for (const step of steps) {
  if (!step.acceptance) violations.push(`${step.id}: no acceptance command`);
  if (step.files.length === 0) violations.push(`${step.id}: no files listed`);
  if (step.acs.length === 0) violations.push(`${step.id}: no - acs line`);
  checkRefs(step.id, 'design', step.design, designIds, 'D');
  checkRefs(step.id, 'architecture', step.architecture, architectureIds, 'A');
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
      .map((m) => m[1].replace(/`/g, '').replace(/[),]+$/, '')),
    ...acceptance.split(/\s+/)
      .map((token) => token.replace(/`/g, '').replace(/[),]+$/, ''))
      .filter((token) => /\.(spec|test)\.[a-z]+/i.test(token)),
  ];
  const fullSuite = includes.length === 0;
  for (const candidate of step.files.filter((x) => /\.(spec|test)\.[a-z]+$/i.test(x))) {
    if (fullSuite) break;
    const norm = candidate.replace(/^\.?\//, '');
    const base = norm.split('/').pop();
    const covered = includes.some((p) => {
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

// --- test plan -----------------------------------------------------------
const testLines = read(testPlanFile);
const checks = [];
let inChecks = false;
for (const line of testLines) {
  if (/^##\s+/.test(line)) { inChecks = /^##\s+Checks/i.test(line); continue; }
  if (inChecks && /^\|\s*V-\d+\s*\|/.test(line)) {
    const [, id, ac, scenario, expected, viewport] = line.split('|').map((cell) => cell.trim());
    checks.push({ id, ac, scenario, expected, viewport });
  }
}

const visualAcs = [...accept.entries()].filter(([, method]) => method === 'visual').map(([id]) => id);
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

// A plan may carry open questions for the user. Questions are not a defect; the
// gate counts the blocking ones so the router can pause for the human.
let questionsBlocking = 0;
for (let i = 0; i < lines.length; i += 1) {
  if (!/^##\s+Open questions/i.test(lines[i])) continue;
  for (let j = i + 1; j < lines.length && !/^##\s+/.test(lines[j]); j += 1) {
    const cells = lines[j].trim().split('|').map((cell) => cell.trim());
    const body = cells.slice(1, -1);
    if (/^Q-\d+$/i.test(body[0]) && String(body[1]).toLowerCase() === 'yes') questionsBlocking += 1;
  }
}

const files = new Set(steps.flatMap((step) => step.files));
const result = {
  ac: accept.size,
  ac_assigned: [...accept.keys()].filter((ac) => assigned.has(ac)).length,
  steps: steps.length,
  steps_with_acceptance: steps.filter((step) => step.acceptance).length,
  visual_checks: checks.length,
  files_estimate: files.size,
  questions_blocking: questionsBlocking,
  design_refs: steps.filter((step) => /D-\d+/.test(step.design || '')).length,
  architecture_refs: steps.filter((step) => /A-\d+/.test(step.architecture || '')).length,
  failed: violations.length,
  violations,
};
console.log(JSON.stringify(result, null, 2));
const ok = violations.length === 0 && steps.length > 0 &&
  result.ac_assigned === result.ac &&
  result.steps_with_acceptance === steps.length;
process.exit(ok ? 0 : 1);
