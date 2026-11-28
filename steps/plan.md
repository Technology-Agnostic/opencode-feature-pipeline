# Step contract: plan

Compile the analysis, design and architecture into two executable documents:
`plan.md` (implementation steps a worker can run one call at a time) and
`test-plan.md` (the user-level checks the test step runs). You write no code.

The plan is the only requirement artifact downstream: `implement` reads
`plan.md`; `test` reads `test-plan.md`. Neither reads analysis, design or
architecture. Everything they need must therefore be compiled into these two
files — a constraint left only in design or architecture is lost.

## Inputs you may read

- `.opencode/plans/<slug>/analysis.md`;
- `.opencode/plans/<slug>/design.md` and `architecture.md` if they exist;
- `.opencode/steps/rules.md`;
- the file listing the analysis points at (read-only);
- this contract and `steps/test-plan.md`.

Do not read code files beyond the listing, other artifacts or git history. The
ACs already exist: do not invent new ones.

## Output

Two files in `.opencode/plans/<slug>/`:

1. `plan.md`, at most 130 body lines — the implementation contract. The compiled
   `design:`/`architecture:` lines make it longer than the old execution-only
   plan; 130 fits a 9-step feature with wrapped constraints.
2. `test-plan.md`, at most 50 body lines — the visual test contract, written per
   `steps/test-plan.md`.

For each file run `artifact.cjs init --step <step> --out <path>`, fill the body
and the machine block, then `artifact.cjs seal --step <step>`. Seal the test plan
first: the plan gate reads it. Never write YAML frontmatter.

```markdown
<!-- machine
status: done
refs: S-01, AC-01.1
-->

# Plan: <name>

## Context

- <the compiled rules every step shares: project rules that change code, tokens,
  copy namespace, module ownership, interfaces, the one pattern to reuse>
- <a design or architecture decision that would otherwise be lost>

## Steps

### S-01: <title>
- goal: <one line>
- acs: AC-01.1, AC-01.2
- files: `path/one.ts`, `path/one.spec.ts`
- acceptance: `<project test command> --include=<the spec for path/one.spec.ts>`
- depends: none | S-xx
- risk: low | medium | high (<what exactly>)
- design: none | D-01, D-02 — <the states, copy keys, tokens, focus and widths this step implements>
- architecture: none | A-01, A-02 — <the module, interface and ownership constraint this step must keep>

## Risks

- <what can go wrong and where it will show>

## Open questions

| ID | Blocking | Question | Recommendation |
|----|----------|----------|----------------|
| Q-01 | no | <what needs a product decision before the plan is executable> | <what you recommend> |
```

The test plan has its own template in `steps/test-plan.md`; its `## Checks`
table replaces the old `## Visual checks` section of the plan.

## How to compile

- Read the design and architecture decisions, then put every constraint the
  implementer needs into `## Context` or the step's `design:` / `architecture:`
  line. The implement worker will not see the sources.
- `design: none` and `architecture: none` are valid only when the step truly has
  no UI or structural constraint; do not leave them empty. Keep each `- design:`
  and `- architecture:` line on one physical line: the gate reads that line.
- A screen, state, copy key, token, focus rule or interface that matters must
  appear in a step. A `D-` or `A-` id without its concrete instruction is a
  pointer, not a compiled constraint.
- Every `visual` AC gets a `V` row in `test-plan.md` with a user scenario, an
  expected result, a viewport and a seed. The test step will not read the
  analysis or the design.

## How to split

- 3–5 AC per step and 3–5 files per step. More means the step is too big: split
  it before adding another AC.
- Steps are ordered so the repo compiles after each one. A pure helper lands
  before its consumer; a store method lands with its fakes.
- `files` is the complete list the worker may touch, including its unit spec.
  If the step owns the wiring, include its integration spec.
- `acceptance` proves the `unit` ACs of the step. A `visual` AC is proven by the
  test plan and has a `V` row instead.
- 1–9 steps. A small feature can be one step; more than 9 means the feature is
  too big: say so and recommend a split.

## Metrics

- `ac` — AC count from the analysis (the gate reads it);
- `ac_assigned` — ACs that appear in at least one step (must equal `ac`);
- `steps` / `steps_with_acceptance`;
- `visual_checks` — rows in `test-plan.md` (the gate reads it);
- `files_estimate` — distinct files across the steps;
- `questions_blocking` — questions with `Blocking: yes` (the gate counts them);
- `design_refs` / `architecture_refs` — step lines that name a D/A id (the gate
  counts them; `none` rows are allowed).

## Hard rules

- Never write YAML frontmatter; `artifact.cjs seal` writes the header.
- The plan must be executable without reading analysis, design or architecture.
  If a decision is missing from the plan, compile it in; do not leave a pointer.
- Every analysis AC is assigned to a step; an AC no step owns cannot be built.
- Every `visual` AC has at least one `V` row in `test-plan.md` with a user
  scenario, an expected result, a viewport and a seed. No selectors, no "check
  the DOM".
- No new AC, no new dependency, no route or storage change unless the analysis
  says so.
- A step's acceptance command must fail when its AC is violated.
- A question that changes the plan is `Blocking: yes` in `## Open questions` with
  a recommendation; never guess and bury the guess in a risk.
- The test plan has its own hard rules in `steps/test-plan.md`; read them before
  writing it.
