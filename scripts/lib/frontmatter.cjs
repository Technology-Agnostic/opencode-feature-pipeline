// Reading and writing the artifact header. The worker writes a small machine
// block in the body; seal turns it plus the gate output into YAML frontmatter.
const fs = require('node:fs');

const LIST_KEYS = new Set(['refs', 'risk_flags', 'viewports', 'files', 'sections']);

function read(file) {
  return fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
}

// The machine block is plain `key: value` lines, not YAML and not JSON. That is
// deliberate: quotes, backslashes and nested JSON are what the model got wrong.
function parseMachine(text) {
  const match = text.match(/<!--\s*machine\s*([\s\S]*?)-->/i);
  if (!match) return null;
  const fields = {};
  for (const line of match[1].split(/\r?\n/)) {
    const row = line.match(/^\s*([a-z0-9_]+)\s*:\s*(.*)$/i);
    if (!row) continue;
    const [, key, raw] = row;
    const value = raw.trim();
    // A blank list key means "the list is empty", not "the field is missing".
    // `risk_flags: ` and `viewports: ` are the common cases; turning them into []
    // keeps them visible to the router instead of failing with `metrics missing`.
    if (!value) { fields[key] = LIST_KEYS.has(key) ? [] : ''; continue; }
    if (LIST_KEYS.has(key)) fields[key] = value.split(',').map(s => s.trim()).filter(Boolean);
    else if (/^-?\d+(\.\d+)?$/.test(value)) fields[key] = Number(value);
    else fields[key] = value;
  }
  return { fields, block: match[0] };
}

function stripMachine(text) {
  return text
    .replace(/<!--\s*machine\s*[\s\S]*?-->/i, '')
    .replace(/^\s*\n+/, '')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd() + '\n';
}

function scalar(value) {
  if (Array.isArray(value) || (value && typeof value === 'object')) return JSON.stringify(value);
  return String(value);
}

function yaml(header) {
  const lines = ['---'];
  for (const [key, value] of Object.entries(header)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value) && value.length === 0) { lines.push(`${key}: []`); continue; }
    lines.push(`${key}: ${scalar(value)}`);
  }
  lines.push('---', '');
  return lines.join('\n') + '\n';
}

// Body lines the budget counts: non-empty lines after the frontmatter. Kept here
// so seal can warn before the router sees the file.
function bodyLines(text) {
  const withoutHeader = text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
  return withoutHeader.split(/\r?\n/).filter(line => line.trim()).length;
}

module.exports = { read, parseMachine, stripMachine, yaml, bodyLines };
