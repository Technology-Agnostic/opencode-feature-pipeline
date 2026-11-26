# Step contract: plan

Turn the analysis (and design/architecture when they exist) into implementation
steps a worker can execute one call at a time, plus the visual test plan the test
step will run. You write no code.

## Inputs you may read

- `.opencode/plans/<slug>/analysis.md`;
- `.opencode/plans/<slug>/design.md` and `architecture.md` if they exist;
- `.opencode/steps/rules.md`;
- the file listing the analysis points at (read-only);
- this contract.

Do not read code files beyond the listing, other artifacts or git history. The
ACs already exist: do not invent new ones.

## Output

`.opencode/plans/<slug>/plan.md`, at most 80 body lines (100 in full).

Run `node "$HOME/.config/opencode/scripts/artifact.cjs" init` (the packet gives `out`), fill the body and the machine block, then run `artifact.cjs seal`. `seal` writes the YAML header and runs `check-plan`; if the gate fails, it returns the violations, so fix the body and run it again. Never write YAML frontmatter.

```markdown
<!-- machine
status: done
refs: S-01, AC-01.1
-->

# Plan: <name>

## Steps
### S-01: <title>
- goal: <one line>
- acs: AC-01.1, AC-01.2
- files: `path/one.ts`, `path/one.spec.ts`
- acceptance: `<project test command> --include=<the spec for path/one.spec.ts>`
- depends: none | S-xx
- risk: low | medium | high (<what exactly>)

## Visual checks
| V | AC | Scenario | Expected | Viewport |
|---|----|----------|----------|----------|
| V-01 | AC-01.2 | select two tasks, open Tags, press Escape | sheet closes, focus returns to Tags | 390 |

## Risks
- <what can go wrong and where it will show>
```

## How to split

- 3–5 AC per step and 3–5 files per step. More means the step is too big: split
  it before adding another AC.
- Steps are ordered so the repo compiles after each one. A pure helper lands
  before its consumer; a store method lands with its fakes.
- `files` is the complete list the worker may touch, including its unit spec.
  If the step owns the wiring, include its integration spec.
- `acceptance` proves the `unit` ACs of the step. A `visual` AC is proven by the
  test step and has a `V` row instead.
- 1–9 steps. A small feature can be one step; more than 9 means the feature is
  too big: say so and recommend a split.

## Metrics

- `ac` — AC count from the analysis (the gate reads it);
- `ac_assigned` — ACs that appear in at least one step (must equal `ac`);
- `steps` / `steps_with_acceptance`;
- `visual_checks` — rows in `## Visual checks`;
- `files_estimate` — distinct files across the steps.

## Hard rules

- Never write YAML frontmatter; `artifact.cjs seal` writes the header.
- Every analysis AC is assigned to a step; an AC no step owns cannot be built.
- Every `visual` AC has at least one `V` row with a user scenario, an expected
  result and a viewport. No selectors, no "check the DOM".
- Do not repeat the analysis goal, the design or the architecture; the plan is
  execution only.
- No new AC, no new dependency, no route or storage change unless the analysis
  says so.
- A step's acceptance command must fail when its AC is violated.
- If a step cannot be planned without a product decision, return
  `status: needs_input` and name it.
