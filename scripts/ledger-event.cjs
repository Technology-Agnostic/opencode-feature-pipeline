#!/usr/bin/env node
// Append a non-artifact event to the ledger. The router logs one row per routed
// artifact; a continuation after a step-limit stop produces no new artifact but
// is still a model call, so it needs its own row. Without it the ledger's call
// total undercounts and the budget drifts from the trace.
//
// usage: node ledger-event.cjs <ledger.md> --step <step> --decision <name> --reason <text>
const fs = require('node:fs');
const path = require('node:path');

const file = process.argv[2];
const flag = (name) => {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : null;
};
const step = flag('--step');
const decision = flag('--decision') || 'continuation';
const reason = flag('--reason') || '';

if (!file || !step) {
  console.error('usage: node ledger-event.cjs <ledger.md> --step <step> --decision <name> --reason <text>');
  process.exit(2);
}

const abs = path.resolve(file);
const existing = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : '';
const n = (existing.match(/^\|\s*E-\d+/gm) || []).length + 1;
const id = `E-${String(n).padStart(2, '0')}`;
const when = new Date().toLocaleString('sv-SE').slice(0, 16);
const row = `| ${id} | ${step} | ${decision} | ${String(reason).replace(/\|/g, '/')} | - | ${when} |`;

if (!existing) {
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(
    abs,
    '# Ledger\n\n| ID | Step | Decision | Reason | Artifact | Time |\n|----|------|----------|--------|----------|------|\n',
    'utf8',
  );
}
fs.appendFileSync(abs, `${row}\n`, 'utf8');
console.log(row);
