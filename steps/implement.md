# Step contract: implement

Execute exactly one plan step. You write production code and its tests, nothing
else. The packet names the step, the files you may touch and the acceptance
command; the plan is the contract.

## Inputs you may read

- `.opencode/plans/<slug>/plan.md` — the step in your packet;
- `.opencode/plans/<slug>/architecture.md` if it exists — the decisions that
  constrain you;
- `.opencode/steps/rules.md`;
- the files in `files_allowed` (read-write);
- this contract.

Do not read other steps' reports, other artifacts, the whole repository or git
history. If a needed file is outside `files_allowed`, stop with
`status: needs_input`.

## Output

1. The code and tests for the step.
2. `.opencode/plans/<slug>/steps/<S-xx>.md`, at most 20 body lines (25 in full).

Create it with `artifact.cjs init --step implement --step-id <S-xx>`, fill the body and the machine block, then run `artifact.cjs seal --step implement`. `seal` writes the YAML header, reads the plan for `steps_done`, `steps_planned` and `visual_checks`, and compares the step's files with the baseline hashes that `init` recorded before you started. If no baseline exists, it falls back to `git status --untracked-files=all`. Never write YAML frontmatter.

```markdown
<!-- machine
status: done
refs: S-01, AC-01.1
step: S-01
tests_added: 0
deviations: 0
verify_cmd: <the step's acceptance command>
verify_exit: 0
verify_passed: 0
verify_failed: 0
-->

# Step report: S-01 <title>

## What changed
- <file: one line of what and why>

## Verification
- `<command>` -> <result>

## Deviations
- <where you left the plan and why; "none" when you followed it>
```

## Metrics

- `step` — the plan step id; you write it in the machine block;
- `steps_done` / `steps_planned` — seal reads them from the plan;
- `files_touched` — seal compares the plan's files with the `init` baseline (fallback: `git status -uall`);
- `tests_added` — new test cases; you write it in the machine block;
- `deviations` — places where the code differs from the plan; you write the
  count in the machine block. It is a note for the final report, not a reason
  for another call;
- `visual_checks` — seal copies the plan's `visual_checks` count.

## Hard rules

- Never write YAML frontmatter; `artifact.cjs seal` writes the header and
  derives `steps_done`, `steps_planned`, `files_touched` and `visual_checks`.
- One plan step per call. Do not start the next step, even if it looks small.
- KISS and YAGNI: the smallest code that satisfies the step's ACs. No
  speculative abstraction, no new dependency, no dead code.
- Decompose so the next change is local: one owner per rule, small functions,
  no duplicated normalization.
- Tests live next to the code they test. A step that owns wiring adds its
  integration spec. Do not touch specs outside `files_allowed`.
- Do not weaken an assertion to make a suite green. If a test is wrong, say so in
  `## Deviations` and leave it red.
- `build` and the step's acceptance command must be green before `status: done`.
- Never format files outside the step and never touch `.opencode/steps/**`.
