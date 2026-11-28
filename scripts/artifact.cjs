#!/usr/bin/env node
// `init` creates an artifact with a machine block; `seal` turns that block plus
// the gate output into YAML frontmatter. The model never writes the header.
//
// usage:
//   node artifact.cjs init --step analysis --feature <slug> [--out <path>]
//   node artifact.cjs init --step implement --feature <slug> --step-id S-01
//   node artifact.cjs seal --step analysis --out <path> [--worker <id>]
//
// `seal` runs the same gate as the router. If the body fails the gate it exits
// 1 and writes nothing, so the worker can fix the body in its own turn.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { read, parseMachine, stripMachine, yaml, bodyLines } = require('./lib/frontmatter.cjs');
const { budgetFor, runGate } = require('./lib/gates.cjs');

const ARTIFACT = {
  analysis: 'analysis',
  design: 'design',
  architecture: 'architecture',
  plan: 'plan',
  implement: 'step-report',
  test: 'test-report',
};
const DEFAULT_WORKER = {
  analysis: 'worker-read',
  design: 'worker-read',
  architecture: 'worker-read',
  plan: 'worker-read',
  implement: 'worker-prod',
  test: 'orchestrator',
};
const TITLES = {
  analysis: 'Analysis',
  design: 'Design',
  architecture: 'Architecture',
  plan: 'Plan',
  implement: 'Step report',
  test: 'Test report',
};
const MACHINE = {
  analysis: ['status', 'refs', 'risk_flags', 'files_estimate', 'assumptions'],
  design: ['status', 'refs', 'screens', 'states', 'a11y_checks', 'files_estimate', 'risk_flags'],
  architecture: ['status', 'refs', 'modules', 'interfaces', 'files_estimate', 'new_files'],
  plan: ['status', 'refs'],
  implement: ['status', 'refs', 'step', 'tests_added', 'deviations',
    'verify_cmd', 'verify_exit', 'verify_passed', 'verify_failed', 'needs_files'],
  test: ['status', 'refs', 'build', 'unit', 'viewports',
    'verify_cmd', 'verify_exit', 'verify_passed', 'verify_failed'],
};
const GATE_METRICS = {
  analysis: ['ac', 'rules', 'rules_covered', 'questions_blocking'],
  design: ['questions_blocking'],
  architecture: ['questions_blocking'],
  plan: ['ac', 'ac_assigned', 'steps', 'steps_with_acceptance', 'visual_checks', 'files_estimate', 'questions_blocking'],
  test: ['checks_total', 'checks_passed', 'findings_blocker', 'findings_major', 'findings_minor', 'ac_deviations'],
};
const BLOCK_METRICS = {
  analysis: ['risk_flags', 'files_estimate', 'assumptions'],
  design: ['screens', 'states', 'a11y_checks', 'files_estimate', 'risk_flags'],
  architecture: ['modules', 'interfaces', 'files_estimate', 'new_files'],
  plan: [],
  implement: ['tests_added', 'deviations'],
  test: ['build', 'unit', 'viewports'],
};


const argv = process.argv.slice(2);
const command = argv[0];
const flag = (name) => {
  const i = argv.indexOf(name);
  return i > -1 ? argv[i + 1] : null;
};

function fail(message, extra = {}) {
  console.log(JSON.stringify({ ok: false, violations: [message], ...extra }, null, 2));
  process.exit(1);
}

function rel(file) {
  return path.relative(process.cwd(), path.resolve(file)).replace(/\\/g, '/');
}

function featureFrom(out) {
  const parts = String(out).replace(/\\/g, '/').split('/');
  const i = parts.lastIndexOf('plans');
  return i > -1 ? parts[i + 1] : null;
}

function defaultOut(step, feature, stepId) {
  if (!feature) return null;
  const base = path.join('.opencode', 'plans', feature);
  if (step === 'implement') return stepId ? path.join(base, 'steps', `${stepId}.md`) : null;
  return path.join(base, ARTIFACT[step] === 'step-report' ? 'step-report.md' : `${ARTIFACT[step]}.md`);
}

function machineBlock(step, stepId, verifyCmd = '') {
  const values = {
    status: 'done',
    refs: '',
    risk_flags: '',
    files_estimate: 0,
    assumptions: 0,
    screens: 0,
    states: 0,
    a11y_checks: 0,
    modules: 0,
    interfaces: 0,
    new_files: 0,
    step: stepId || 'S-01',
    tests_added: 0,
    deviations: 0,
    build: 'pass',
    unit: 'pass',
    viewports: '390, 320',
    verify_cmd: verifyCmd,
    verify_exit: 0,
    verify_passed: 0,
    verify_failed: 0,
    needs_files: '',
  };
  const lines = MACHINE[step].map(key => `${key}: ${values[key]}`);
  return `<!-- machine\n${lines.join('\n')}\n-->`;
}

function init(step, out, feature, stepId) {
  if (!MACHINE[step]) fail(`unknown step: ${step}`);
  const target = out || defaultOut(step, feature, stepId);
  if (!target) fail('init needs --out or --feature (and --step-id for implement)');
  if (fs.existsSync(target)) fail(`${rel(target)} already exists; edit it and seal, or choose another path`);

  // `steps/S-02.md` already names the step. Without this, init wrote S-01 and the
  // router kept sending the run back to the first step.
  if (step === 'implement') {
    const fileStep = path.basename(target, '.md');
    if (!stepId && /^S-\d+$/.test(fileStep)) stepId = fileStep;
    if (stepId && /^S-\d+$/.test(fileStep) && stepId !== fileStep) {
      fail(`--step-id ${stepId} does not match ${fileStep}.md`);
    }
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  // An implement step already has its acceptance command in the plan. Copy it so
  // the worker does not retype a project-specific command.
  let verifyCmd = '';
  let planFile = null;
  let planFiles = [];
  if (step === 'implement' && stepId) {
    planFile = path.join(path.dirname(target), '..', 'plan.md');
    if (fs.existsSync(planFile)) {
      const plan = parsePlan(planFile);
      const item = plan.steps.find(candidate => candidate.id === stepId);
      if (item?.acceptance) verifyCmd = item.acceptance;
      // Hash the whole plan, not just this step's list. A step can be granted a
      // file that belongs to a neighbouring step; a per-step baseline would drop
      // that edit from `changed` and the audit would silently miss it.
      planFiles = unionFiles(plan.steps);
    }
  }
  const title = step === 'implement' ? `# Step report: ${stepId || 'S-01'}` : `# ${TITLES[step]}: ${feature || featureFrom(target) || ''}`;
  fs.writeFileSync(target, `${machineBlock(step, stepId, verifyCmd)}\n\n${title}\n`, 'utf8');
  // Capture the pre-step state now; seal compares against it after the worker.
  if (step === 'implement' && stepId && planFile && fs.existsSync(planFile)) {
    writeBaseline(target, stepId, planFiles);
  }
  const hint = verifyCmd ? undefined : (step === 'test' ? 'fill verify_cmd with the project test command' : (step === 'implement' ? 'fill verify_cmd with the acceptance command' : undefined));
  console.log(JSON.stringify({
    ok: true,
    file: rel(target),
    step,
    budget: budgetFor(step),
    ...(hint ? { hint } : {}),
  }, null, 2));
}

// --- plan helpers ---------------------------------------------------------
function parsePlan(planFile) {
  const text = read(planFile);
  const steps = [];
  let current = null;
  let inVisual = false;
  let visual = 0;
  for (const line of text.split(/\r?\n/)) {
    if (/^##\s+Visual checks/i.test(line)) { inVisual = true; continue; }
    if (/^##\s+/.test(line)) inVisual = false;
    const heading = line.match(/^###\s+(S-\d+)\b/);
    if (heading) {
      current = { id: heading[1], files: [] };
      steps.push(current);
      continue;
    }
    if (current && /^-\s+files:/i.test(line)) {
      current.files = [...line.matchAll(/`([^`]+)`/g)].map(m => m[1]);
    }
    if (current && /^-\s+acceptance:/i.test(line)) {
      current.acceptance = line.replace(/^-\s+acceptance:\s*/i, '').replace(/`/g, '').trim();
    }
    if (inVisual && /^\|\s*V-\d+\s*\|/.test(line)) visual += 1;
  }
  return { steps, visual };
}

function unionFiles(steps) {
  return [...new Set(steps.flatMap(step => step.files))];
}

function gitChanged(files) {
  if (!files.length) return [];
  let out = '';
  try {
    // -uall expands an untracked directory into its files; without it a new
    // folder is one `?? dir/` line that matches none of the plan's files.
    out = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch {
    return [];
  }
  const changed = new Set();
  for (const line of out.split(/\r?\n/)) {
    const match = line.match(/^(?:..|\?\?)\s+(.+)$/);
    if (!match) continue;
    changed.add(match[1].replace(/\\/g, '/').replace(/^"|"$/g, ''));
  }
  return files.filter(file => changed.has(file.replace(/\\/g, '/')));
}

function baselinePath(out, stepId) {
  const key = crypto.createHash('sha1').update(`${path.resolve(out)}|${stepId}`).digest('hex');
  // Keep the baseline out of the project: the close step treats every dirty file
  // outside the plan as a scope violation, and a hidden tool file would look like one.
  return path.join(os.tmpdir(), 'opencode', 'baselines', `${key}.json`);
}

function hashFile(file) {
  try {
    return crypto.createHash('sha1').update(fs.readFileSync(path.resolve(file))).digest('hex');
  } catch {
    return null;
  }
}

// `init` runs before the worker touches anything. It records the content hash of
// every file the plan allows this step to edit; `seal` then compares hashes, so
// `changed` and `files_touched` mean "this step", not "everything dirty so far".
function writeBaseline(out, stepId, files) {
  const file = baselinePath(out, stepId);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const data = { step: stepId, files: Object.fromEntries(files.map(name => [name, hashFile(name)])) };
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

function changedSinceBaseline(out, stepId) {
  const file = baselinePath(out, stepId);
  if (!fs.existsSync(file)) return null;
  let data;
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
  if (data.step !== stepId || !data.files) return null;
  // Compare every file init hashed. The baseline already scopes the check to the
  // time between init and seal, so using the whole plan here keeps "this step"
  // accurate and still reports a file borrowed from another step.
  return Object.keys(data.files).filter(name => hashFile(name) !== (data.files[name] ?? null));
}

// --- seal -----------------------------------------------------------------
function seal(step, out, worker, feature) {
  if (!MACHINE[step]) fail(`unknown step: ${step}`);
  if (!out) fail('seal needs --out');
  const machine = parseMachine(read(out));
  if (!machine) fail(`${rel(out)} has no machine block; run init first`);

  const fields = machine.fields;
  const status = fields.status || 'done';

  // Validate everything the router will check before the header is written.
  // Once seal has written the header it has already removed the machine block, so
  // a late rejection leaves the worker with no way to repair its own artifact.
  const STATUSES = ['done', 'blocked', 'needs_input', 'rejected', 'skipped'];
  if (!STATUSES.includes(status)) {
    fail(`machine field status must be one of ${STATUSES.join(', ')}`);
  }
  for (const key of BLOCK_METRICS[step] || []) {
    if (fields[key] === undefined || fields[key] === '') {
      fail(`machine field ${key} is required`);
    }
  }
  if (step === 'implement') {
    if (!fields.step) fail('machine field step is required');
    const fileStep = path.basename(out, '.md');
    if (/^S-\d+$/.test(fileStep) && fields.step !== fileStep) {
      fail(`machine step ${fields.step} does not match ${fileStep}.md`);
    }
  }
  if (['implement', 'test'].includes(step) && status === 'done') {
    if (!fields.verify_cmd) fail('machine field verify_cmd is required');
    if (Number(fields.verify_exit ?? 0) !== 0) fail('machine field verify_exit must be 0 for status done');
    if (Number(fields.verify_failed ?? 0) !== 0) fail('machine field verify_failed must be 0 for status done');
  }

  const gate = runGate(step, out);
  // A blocked artifact is allowed to fail its gate: the point is to report the
  // gap, not to pass. A done artifact must pass; the worker fixes the body.
  if (status === 'done' && gate.error) {
    fail(gate.error, { gate: gate.output, violations: gate.output?.violations || [gate.error] });
  }

  const metrics = {};
  for (const key of GATE_METRICS[step] || []) {
    if (gate.output && gate.output[key] !== undefined) metrics[key] = gate.output[key];
  }
  for (const key of BLOCK_METRICS[step] || []) {
    if (fields[key] !== undefined && fields[key] !== '') {
      metrics[key] = key === 'viewports'
        ? (fields[key] || []).map(Number).filter(Number.isFinite)
        : fields[key];
    }
  }

  let changed = [rel(out)];
  if (step === 'implement') {
    const stepId = fields.step;
    const planFile = path.join(path.dirname(out), '..', 'plan.md');
    if (!fs.existsSync(planFile)) fail(`${rel(planFile)} not found; implement needs the plan next to its folder`);
    const plan = parsePlan(planFile);
    const index = plan.steps.findIndex(item => item.id === stepId);
    if (index < 0) fail(`plan has no ${stepId}`);
    const item = plan.steps[index];
    metrics.step = stepId;
    metrics.steps_done = index + 1;
    metrics.steps_planned = plan.steps.length;
    metrics.visual_checks = plan.visual;
    const fromBaseline = changedSinceBaseline(out, stepId);
    if (fromBaseline) {
      changed = fromBaseline;
    } else {
      // Older runs and hand-written reports have no baseline; keep the expanded
      // git fallback so an untracked new directory still reports its files. It
      // stays limited to the step's own list: without a pre-step snapshot there
      // is no way to tell which plan file this call changed.
      changed = gitChanged(item.files);
    }
    metrics.files_touched = changed.length;
  }

  if (step === 'test') {
    for (const key of ['build', 'unit']) {
      if (!['pass', 'fail'].includes(String(metrics[key]))) {
        fail(`machine field ${key} must be pass or fail`);
      }
    }
  }

  const header = {
    artifact: ARTIFACT[step],
    feature: feature || featureFrom(out) || '',
    produced_by: worker || DEFAULT_WORKER[step],
    step,
    status,
    refs: fields.refs || [],
  };
  if ((step === 'test' || step === 'implement') && status === 'done') {
    if (!fields.verify_cmd) fail('machine field verify_cmd is required');
    header.verify = {
      cmd: fields.verify_cmd,
      exit: Number(fields.verify_exit ?? 0),
      passed: Number(fields.verify_passed ?? 0),
      failed: Number(fields.verify_failed ?? 0),
    };
  }
  // A blocked or needs_input implement step names what it still needs. For a
  // missing file this is the grant list the orchestrator reads to widen
  // `files_allowed`; seal exposes it so the orchestrator never reads the body.
  if (step === 'implement' && status === 'needs_input') {
    header.needs_files = fields.needs_files || [];
  }
  header.changed = changed;
  header.metrics = metrics;

  const body = stripMachine(read(out)).replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
  const sealed = yaml(header) + body;
  fs.writeFileSync(out, sealed, 'utf8');
  const lines = bodyLines(sealed);
  const budget = budgetFor(step);
  console.log(JSON.stringify({
    ok: true,
    file: rel(out),
    step,
    status,
    gate: gate.output,
    metrics,
    changed,
    body_lines: lines,
    budget,
    over_budget: budget ? lines > budget : false,
  }, null, 2));
}

// --- main -----------------------------------------------------------------
if (!['init', 'seal'].includes(command)) {
  fail('usage: node artifact.cjs init|seal --step <step> --out <path> [--feature <slug>] [--step-id S-01]');
}
const step = flag('--step');
const out = flag('--out');
const feature = flag('--feature');
const worker = flag('--worker');
const stepId = flag('--step-id');
if (!step) fail('--step is required');

if (command === 'init') init(step, out, feature, stepId);
else seal(step, out, worker, feature);
