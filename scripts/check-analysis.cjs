#!/usr/bin/env node
// Gate for the `analysis` step. It makes the requirements machine-complete:
// every AC has an acceptance method, every project rule has an AC, and every
// blocking question carries a recommendation. The router reads the numbers.
//
// usage: node check-analysis.cjs <analysis.md> --rules <rules.md>
const fs = require('node:fs');
const path = require('node:path');

const argv = process.argv.slice(2);
const file = argv[0];
const rulesIdx = argv.indexOf('--rules');
const rulesFile = rulesIdx > -1 ? argv[rulesIdx + 1] : null;
if (!file || !rulesFile || !fs.existsSync(rulesFile)) {
  console.error(JSON.stringify({ failed: 1, violations: ['usage: check-analysis.cjs <analysis.md> --rules <rules.md>'] }));
  process.exit(2);
}

const read = (p) => fs.readFileSync(path.resolve(p), 'utf8').replace(/^\uFEFF/, '');
const text = read(file);
const lines = text.split(/\r?\n/);
const violations = [];
const acRows = [];
const ruleRows = [];
const questionRows = [];
let section = null;

for (const line of lines) {
  if (/^##\s+/.test(line)) {
    section = /^##\s+AC coverage/i.test(line) ? 'ac'
      : /^##\s+Rule coverage/i.test(line) ? 'rules'
      : /^##\s+Open questions/i.test(line) ? 'questions'
      : null;
    continue;
  }
  if (section === 'ac' && /^\|\s*AC-\d+\.\d+\s*\|/.test(line)) {
    const [, id, accept, check] = line.split('|').map(c => c.trim());
    acRows.push({ id, accept, check });
  }
  if (section === 'rules' && /^\|\s*HR-\d+\s*\|/.test(line)) {
    const [, rule, ac, check] = line.split('|').map(c => c.trim());
    ruleRows.push({ rule, ac, check });
  }
  if (section === 'questions' && /^\|\s*Q-\d+\s*\|/.test(line)) {
    const [, id, blocking, question, recommendation] = line.split('|').map(c => c.trim());
    questionRows.push({ id, blocking, question, recommendation });
  }
}

const rulesText = read(rulesFile);
const expectedRules = [...rulesText.matchAll(/^[-*\s]*(HR-\d+)\s*:/gm)].map(m => m[1]);
if (expectedRules.length === 0) {
  console.error(JSON.stringify({ failed: 1, violations: ['rules file has no HR-n entries'] }));
  process.exit(2);
}

const validAccept = new Set(['unit', 'visual', 'manual']);
const acIds = new Set();
for (const row of acRows) {
  if (acIds.has(row.id)) violations.push(`${row.id}: duplicate AC`);
  acIds.add(row.id);
  if (!validAccept.has(row.accept)) violations.push(`${row.id}: bad accept "${row.accept}"`);
  if (!row.check || row.check.length < 8) violations.push(`${row.id}: check is too vague`);
}
if (acRows.length === 0) violations.push('no AC rows');
if (acRows.length > 15) violations.push(`${acRows.length} AC: split the feature`);

const seenRules = new Set(ruleRows.map(r => r.rule));
for (const rule of expectedRules) {
  if (!seenRules.has(rule)) violations.push(`${rule}: missing from Rule coverage`);
}
for (const row of ruleRows) {
  if (!acIds.has(row.ac)) violations.push(`${row.rule}: unknown AC "${row.ac}"`);
  if (!row.check || row.check.length < 8) violations.push(`${row.rule}: check is too vague`);
}

const questionIds = new Set();
let blocking = 0;
for (const row of questionRows) {
  if (questionIds.has(row.id)) violations.push(`${row.id}: duplicate question id`);
  questionIds.add(row.id);
  if (!['yes', 'no'].includes(String(row.blocking).toLowerCase())) {
    violations.push(`${row.id}: Blocking must be yes or no`);
  }
  if (String(row.blocking).toLowerCase() === 'yes') {
    blocking += 1;
    if (!row.recommendation || row.recommendation.length < 3) {
      violations.push(`${row.id}: blocking question without a recommendation`);
    }
  }
  if (!row.question || row.question.length < 8) violations.push(`${row.id}: question is too vague`);
}

const result = {
  ac: acRows.length,
  ac_with_accept: acRows.filter(r => validAccept.has(r.accept)).length,
  rules: ruleRows.length,
  rules_covered: ruleRows.filter(r => acIds.has(r.ac)).length,
  questions_blocking: blocking,
  failed: violations.length,
  violations,
};
console.log(JSON.stringify(result, null, 2));
const ok = violations.length === 0 && acRows.length > 0 &&
  result.ac_with_accept === acRows.length &&
  ruleRows.length === expectedRules.length &&
  result.rules_covered === expectedRules.length;
process.exit(ok ? 0 : 1);
