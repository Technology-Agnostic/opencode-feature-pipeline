# Artifact contract: test plan

The test plan is the only input to the `test` step. The `plan` step writes it next
to `plan.md`, and the orchestrator runs it against the real app. It must be
runnable without reading the implementation, the analysis or the design: every
row names the user scenario, the expected result, the viewport and how to reach
the state.

## Output

`.opencode/plans/<slug>/test-plan.md`, at most 50 body lines.

Run `node "$HOME/.config/opencode/scripts/artifact.cjs" init --step test-plan --out .opencode/plans/<slug>/test-plan.md`,
fill the body and the machine block, then run
`artifact.cjs seal --step test-plan --out .opencode/plans/<slug>/test-plan.md`.
Seal the test plan before `plan.md`: the plan gate reads it. Never write YAML
frontmatter.

```markdown
<!-- machine
status: done
refs: V-01, V-02
-->

# Test plan: <name>

## Checks

| V | AC | Scenario | Expected | Viewport | Seed |
|---|----|----------|----------|----------|------|
| V-01 | AC-01.2 | select two tasks, open Tags, press Escape | sheet closes, focus returns to Tags | 390 | seed two tasks through the UI |

## Copy checks

- `constructor.tasks.bulkTags.applyAdd` -> the sheet's apply button
- `constructor.tasks.status.tagsChanged` -> the page live region

## Notes

- <state seeding, locale, theme, what is not tested and why>
```

## How to write a row

- `Scenario` is what the tester does, in user language.
- `Expected` is what the user sees; it is checkable by looking at the page. No
  selectors, no "the DOM contains".
- `Viewport` is `390`, `320`, or a comma list when the row is width-specific.
- `Seed` is how to reach the state: UI steps, a storage key and schema, a
  fixture, or `default`. The test step may not read source to discover state.
- One row per user-visible result. A row with two unrelated clauses is two rows.

## Metrics

- `rows` — data rows in `## Checks` (the gate counts them).

## Hard rules

- Never write YAML frontmatter; `artifact.cjs seal` writes the header.
- Every `visual` AC from the analysis has at least one row.
- A non-visual AC does not belong here; it is proven by a unit test in the plan.
- The plan is self-contained: the test step may not read `analysis.md`,
  `design.md` or `plan.md`. Put the copy keys, seed and locale in this file.
- The `Retest` column of `fix-report.md` names these `V` ids; never invent one.
- Do not repeat implementation steps, file paths or code.
