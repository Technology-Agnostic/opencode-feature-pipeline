// The one source of truth for step gates. Both the router (which decides a
// step) and artifact.cjs (which seals a header) call the same spec, so a gate
// cannot drift between "what the worker ran" and "what the router ran".
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

// The rules file lives at the project root, not next to the artifact. Walk up
// from the feature folder so the gate works from any cwd and in test fixtures.
function findRules(file) {
  let dir = path.dirname(path.resolve(file));
  for (;;) {
    const candidate = path.join(dir, '.opencode', 'steps', 'rules.md');
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

// The step contract is the only place that states a body budget. Both seal and
// the router read the same line, so the packet cannot invent a second number and
// the two gates cannot drift. The contract phrases it as:
//   at most 50 body lines
function budgetFor(step) {
  if (!step) return null;
  const contract = path.join(__dirname, '..', '..', 'steps', `${step}.md`);
  if (!fs.existsSync(contract)) return null;
  const text = fs.readFileSync(contract, 'utf8');
  const match = text.match(/at most\s+(\d+)\s+body lines/i);
  if (!match) return null;
  return Number(match[1]);
}

const GATES = {
  analysis: {
    script: 'check-analysis.cjs',
    args: (dir, file) => ['--rules', findRules(file) || '.opencode/steps/rules.md'],
  },
  design: {
    script: 'check-sections.cjs',
    args: () => ['--require', '## Screens', '## States', '## Responsive', '## Accessibility', '## Copy',
      '--table', '## Screens', '--columns', 'ID,Screen,States,Notes', '--min-rows', '1',
      '--questions', '## Open questions'],
  },
  architecture: {
    script: 'check-sections.cjs',
    args: () => ['--require', '## Modules', '## Interfaces', '## Change scope', '## Migration order',
      '--table', '## Modules', '--columns', 'ID,Module,Files,Responsibility', '--min-rows', '1',
      '--questions', '## Open questions'],
  },
  plan: {
    script: 'check-plan.cjs',
    args: (dir) => [
      '--analysis', path.join(dir, 'analysis.md'),
      '--test-plan', path.join(dir, 'test-plan.md'),
      '--design', path.join(dir, 'design.md'),
      '--architecture', path.join(dir, 'architecture.md'),
    ],
  },
  'test-plan': {
    script: 'check-sections.cjs',
    args: () => ['--require', '## Checks', '## Copy checks', '## Notes',
      '--table', '## Checks', '--columns', 'V,AC,Scenario,Expected,Viewport,Seed', '--min-rows', '0'],
  },
  fix: {
    script: 'check-fix.cjs',
    args: (dir) => ['--test', path.join(dir, 'test-report.md'), '--test-plan', path.join(dir, 'test-plan.md')],
  },
  test: {
    script: 'check-test.cjs',
    args: (dir) => ['--test-plan', path.join(dir, 'test-plan.md'), '--analysis', path.join(dir, 'analysis.md')],
  },
};

function parse(text) {
  try { return JSON.parse(text); } catch { return { raw: String(text).slice(0, 200) }; }
}

// Returns { output, error }. A gate failure is a result, not an exception: the
// caller decides whether it is a reject or a step the worker must fix.
function runGate(step, file) {
  const spec = GATES[step];
  if (!spec) return { output: null, error: null };
  const dir = path.dirname(path.resolve(file));
  const args = [path.resolve(file), ...spec.args(dir, file)];
  try {
    const out = execFileSync(process.execPath, [path.join(__dirname, '..', spec.script), ...args], {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { output: parse(out), error: null };
  } catch (e) {
    const parsed = parse(e.stdout || '');
    const detail = Array.isArray(parsed.violations) && parsed.violations.length
      ? parsed.violations.slice(0, 5).join('; ')
      : String(e.message).slice(0, 200);
    return { output: parsed, error: `gate ${step} failed: ${detail}` };
  }
}

module.exports = { GATES, budgetFor, findRules, parse, runGate };
