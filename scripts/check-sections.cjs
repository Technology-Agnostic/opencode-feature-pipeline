#!/usr/bin/env node
// Generic structural gate for steps whose output is a table rather than numbers:
// design screens, architecture modules.
//
// usage: node check-sections.cjs <file> [--require "## A" "## B"]
//                                      [--table "## Findings"]
//                                      [--columns "ID,Severity,File,Summary"]
//                                      [--min-rows N] [--allow-empty]
//                                      [--questions "## Open questions"]
const fs = require('node:fs');
const path = require('node:path');

const argv = process.argv.slice(2);
const file = argv[0];
if (!file) {
  console.error('usage: node check-sections.cjs <file> [--require ...] [--table ...] [--columns ...] [--min-rows N] [--allow-empty] [--questions ...]');
  process.exit(2);
}
const flag = (name) => {
  const i = argv.indexOf(name);
  if (i < 0) return null;
  const out = [];
  for (let j = i + 1; j < argv.length && !argv[j].startsWith('--'); j += 1) out.push(argv[j]);
  return out;
};
const required = flag('--require') || [];
const tableHeading = (flag('--table') || [])[0] || null;
const columns = ((flag('--columns') || [])[0] || '').split(',').map(s => s.trim()).filter(Boolean);
const minRows = Number((flag('--min-rows') || ['0'])[0]);
const allowEmpty = argv.includes('--allow-empty');
const questionsHeading = (flag('--questions') || [])[0] || null;

const text = fs.readFileSync(path.resolve(file), 'utf8');
const lines = text.split(/\r?\n/);
const violations = [];

for (const heading of required) {
  if (!lines.some(l => l.trim().toLowerCase().startsWith(heading.trim().toLowerCase()))) {
    violations.push(`missing section ${heading}`);
  }
}

let rows = 0;
if (tableHeading) {
  const start = lines.findIndex(l => l.trim().toLowerCase().startsWith(tableHeading.trim().toLowerCase()));
  if (start < 0) {
    violations.push(`missing table ${tableHeading}`);
  } else {
    let i = start + 1;
    while (i < lines.length && !/^##\s+/.test(lines[i])) {
      const line = lines[i].trim();
      if (line.startsWith('|')) {
        const cells = line.split('|').map(c => c.trim());
        const body = cells.slice(1, -1);
        const isHeader = body.length === columns.length && body.every(c => !/^\d/.test(c) && c.length > 0) && i === start + 1;
        const isSeparator = body.every(c => /^:?-{2,}:?$/.test(c));
        if (!isHeader && !isSeparator) {
          rows += 1;
          if (columns.length && body.length !== columns.length) {
            violations.push(`row ${rows}: expected ${columns.length} columns, found ${body.length}`);
          }
          body.forEach((cell, idx) => {
            if (!cell || cell === '—' || cell === '-') {
              if (!allowEmpty) violations.push(`row ${rows}: empty "${columns[idx] || idx}"`);
            }
          });
        }
      }
      i += 1;
    }
  }
}

if (tableHeading && rows < minRows) violations.push(`${rows} rows, at least ${minRows} required`);

// A step may carry open questions for the user. Questions are not a defect: the
// gate only counts the blocking ones so the router can send the step back to the
// human instead of continuing. The section is optional; its absence means 0.
let questionsBlocking = 0;
if (questionsHeading) {
  const start = lines.findIndex(l => l.trim().toLowerCase().startsWith(questionsHeading.trim().toLowerCase()));
  if (start >= 0) {
    let i = start + 1;
    while (i < lines.length && !/^##\s+/.test(lines[i])) {
      const line = lines[i].trim();
      if (line.startsWith('|')) {
        const cells = line.split('|').map(c => c.trim());
        const body = cells.slice(1, -1);
        // The header `| ID | Blocking | ...` and the `|----|` separator are skipped;
        // a data row has a Q- id in the first cell.
        if (/^Q-\d+$/i.test(body[0]) && String(body[1]).toLowerCase() === 'yes') questionsBlocking += 1;
      }
      i += 1;
    }
  }
}

console.log(JSON.stringify({ rows, questions_blocking: questionsBlocking, failed: violations.length, violations }, null, 2));
process.exit(violations.length === 0 ? 0 : 1);
