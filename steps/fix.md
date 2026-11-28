# Step contract: fix

Repair the findings the test report left open. This step runs only when the user
asks for it after `test`; the router recommends it when a blocker or a major
finding is open. You fix the named findings, not the plan: no new AC, no new
feature, no refactor, no new dependency.

## Inputs you may read

- `.opencode/plans/<slug>/test-report.md` — the `## Checks` and `## Findings` tables;
- `.opencode/plans/<slug>/plan.md` — the step, its `## Context` and its compiled
  `design:` / `architecture:` constraint; the only requirement artifact;
- `.opencode/plans/<slug>/test-plan.md` — the `V` rows for the retest;
- `.opencode/steps/rules.md`;
- the files in `files_allowed` (read-write);
- this contract.

The plan already carries the design and architecture decisions; do not read
`analysis.md`, `design.md` or `architecture.md`. Do not read other step reports,
the ledger or the whole repository. Fix only the findings the packet names. If a
finding needs a file outside `files_allowed`, finish with `status: needs_input`
and list it in the machine block's `needs_files`.

## Output

`.opencode/plans/<slug>/fix-report.md`, at most 20 body lines.

Run `node "$HOME/.config/opencode/scripts/artifact.cjs" init --step fix --out <out>`
as your **first command**, before you edit code: it snapshots the files the plan
allows, and `seal` uses that snapshot to report the real blast radius.
Fill the body and the machine block, then run `artifact.cjs seal --step fix`.
If the file already exists (a continuation), edit it and seal again. Never
write YAML frontmatter.

```markdown
<!-- machine
status: done
refs: F-01, V-03
fixed: 1
remaining: 0
tests_added: 0
deviations: 0
verify_cmd: <project test command>
verify_exit: 0
verify_passed: 0
verify_failed: 0
needs_files:
-->

# Fix report: <name>

## Fixed
| ID | Finding | Change | Retest |
|----|---------|--------|--------|
| F-01 | focus lands on Close | open the sheet with `autoFocus: false` and focus the mode toggle after it opens | V-03 |

## Not fixed
| ID | Why |
|----|-----|

## Verification
- `<command>` -> <result>

## Deviations
- <where you left the finding and why; "none" when you fixed it as written>
```

## Metrics

- `fixed` — rows in `## Fixed`; the gate counts them;
- `remaining` — blocker/major findings from `test-report.md` that are not in
  `## Fixed`; the gate counts them, so a fix that gives up is still honest;
- `retest` — fixed rows whose `Retest` names a `V` row; the gate counts them;
- `tests_added` — new test cases, if the fix needed one;
- `deviations` — places where the code differs from the finding's stated cause;
- `files_touched` — `seal` compares every plan file with the `init` baseline.

## Hard rules

- Never write YAML frontmatter; `artifact.cjs seal` writes the header.
- One fix call. Fix only the findings in the packet; do not add an AC, a route, a
  schema change or a dependency, and do not fix a finding the packet did not
  name.
- Do not weaken an assertion to make a suite green. If a test is wrong, say so in
  `## Deviations` and leave it red.
- Run the project formatter on the files you touched and only those, before
  sealing; a format-red fix is not done.
- `build` and the acceptance command must be green before `status: done`.
- Put a finding you cannot fix in `## Not fixed` with a reason and seal
  `status: done`; the gate counts it as remaining. Use `status: blocked` only
  when no finding could be attempted.
- `Retest` names the `V` rows that prove the user-visible result, comma-separated,
  or `none` when the unit suite proves it. Never invent a `V` row.
