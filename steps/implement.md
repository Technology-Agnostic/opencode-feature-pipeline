# Step contract: implement

Execute exactly one plan step. You write production code and its tests, nothing
else. The packet names the step, the files you may touch and the acceptance
command; the plan is the contract.

## Inputs you may read

- `.opencode/plans/<slug>/plan.md` — the step, its `## Context` and its compiled
  `design:` / `architecture:` constraint; this is the only requirement artifact;
- `.opencode/steps/rules.md`;
- the files in `files_allowed` (read-write);
- this contract.

The plan already carries the design and architecture decisions. Do not read
`analysis.md`, `design.md` or `architecture.md`: they are inputs to `plan`, not
to you. If the plan does not state a constraint you need, do not guess — seal
`status: blocked` with the missing constraint in the evidence.

Do not read other steps' reports, other artifacts, the whole repository or git
history. If a file you must write or read is outside `files_allowed`, finish
with `status: needs_input` and list that file in the machine block's
`needs_files` (comma-separated paths). The orchestrator grants it and re-runs
the step; you do not widen `files_allowed` yourself.

## Output

1. The code and tests for the step.
2. `.opencode/plans/<slug>/steps/<S-xx>.md`, at most 20 body lines.

Create it with `node "$HOME/.config/opencode/scripts/artifact.cjs" init --step implement --step-id <S-xx>` as your **first command, before you edit code**: the baseline hash is only useful if it is taken before the step. Fill the body and the machine block, then run `artifact.cjs seal --step implement`. `seal` writes the YAML header, reads the plan for `steps_done`, `steps_planned` and `visual_checks`, and compares the plan's files with the baseline hashes that `init` recorded before you started. If no baseline exists, it falls back to `git status --untracked-files=all`. Never write YAML frontmatter.

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
needs_files:
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
- `files_touched` — seal compares every file in the plan with the `init` baseline
  (fallback: `git status -uall`). It can exceed your step's list when the
  orchestrator granted a file from a neighbouring step. That is the audit trail,
  not a wider permission: keep writing only `files_allowed`.
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
- When the step touches a template or a stylesheet, the step's `design:` line and
  `## Context` are the contract for states, copy keys, tokens, focus and
  responsive widths. Implement them as written; a different pattern is a
  deviation, not a free choice.
- Decompose so the next change is local: one owner per rule, small functions,
  no duplicated normalization.
- Tests live next to the code they test. A step that owns wiring adds its
  integration spec. Do not touch specs outside `files_allowed`.
- Do not weaken an assertion to make a suite green. If a test is wrong, say so in
  `## Deviations` and leave it red.
- `build` and the step's acceptance command must be green before `status: done`.
- Never format files outside the step and never touch `.opencode/steps/**`.
