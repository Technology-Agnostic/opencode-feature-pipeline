# Step contract: analysis

Turn the brief into testable requirements. This is the only step that defines
acceptance criteria; every later step refers to its AC ids and never invents new
ones. You write no code and no plan.

## Inputs you may read

- the brief in the packet;
- `.opencode/steps/rules.md` (read it first, it is the spec);
- the project `AGENTS.md`, the file listing and the files the brief names
  (read-only);
- on attempt 2, the previous `analysis.md` and the user's answers in the packet;
- this contract.

Do not read other artifacts, git history, test output or the whole repository.
If the brief names a file, read that file; otherwise stop at the listing.

## Output

`.opencode/plans/<slug>/analysis.md`, at most 55 body lines (frontmatter excluded; 75 in full).

Run `node "$HOME/.config/opencode/scripts/artifact.cjs" init` (the packet gives `out`), fill the body and the machine block, then run `artifact.cjs seal`. `seal` writes the YAML header and runs `check-analysis`; if the gate fails, it returns the violations, so fix the body and run it again. Never write YAML frontmatter.

```markdown
<!-- machine
status: done
refs: AC-01.1, Q-01
risk_flags: ui, a11y
files_estimate: 0
assumptions: 0
-->

# Analysis: <name>

## Goal
<two sentences: what the user gets and why>

## In scope / Out of scope
- in: <one line>
- out: <one line>

## AC coverage
| AC | accept | check |
|----|--------|-------|
| AC-01.1 | unit | the helper returns a new array with the tag once |
| AC-01.2 | visual | the sheet opens at 390 px and Escape closes it |

## Rule coverage
| Rule | AC | Check |
|------|----|-------|
| HR-1 | AC-01.1 | the helper has no I/O |

## Open questions
| ID | Blocking | Question | Recommendation |
|----|----------|----------|----------------|
| Q-01 | no | keep or clear the filter? | keep it and show the empty state |

## Risks and assumptions
- <what can go wrong and what you assumed>
```

## How to decide `accept`

- `unit` — provable in the normal test runner, including a TestBed spec that
  drives real components and stores;
- `visual` — only provable in the browser (layout, focus, keyboard, contrast);
- `manual` — neither can assert it (grammar, screen-reader speech, a platform
  gesture). Manual is a last resort: say why.

A `visual` AC must name the observable user result, not a selector.

## Metrics

- `ac` — rows in `## AC coverage`;
- `questions_blocking` — questions with `Blocking: yes`;
- `risk_flags` — subset of `{auth, money, migration, public, ui, data, a11y}`;
- `rules` / `rules_covered` — from the gate;
- `files_estimate` — a rough count of files the feature will touch;
- `assumptions` — assumptions you made instead of asking.

## Hard rules

- Never write YAML frontmatter; `artifact.cjs seal` writes the header.
- 3-15 AC. More means the feature is too big: say so in `## Open questions` as
  a blocking question and recommend a split.
- Every AC has one observable check; "works correctly" is not a check.
- Every rule from `.opencode/steps/rules.md` appears in `## Rule coverage` and
  points at an AC that asserts it.
- A question that changes the ACs or scope is `Blocking: yes` with a
  recommendation. Never choose silently.
- Do not write a plan, file list or implementation advice: that is the next
  step's job.
- On attempt 2, change only what the answers require and set
  `questions_blocking` to the number that is still open.
