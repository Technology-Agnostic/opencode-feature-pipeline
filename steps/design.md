# Step contract: design

Turn the analysis into a UI/UX decision: what the user sees, in which states, at
which widths, with which keyboard and copy. This step runs only when the user
asks for it — the analysis recommends it when it carries `ui` or `a11y` risk.
You write no code.

## Inputs you may read

- `.opencode/plans/<slug>/analysis.md`;
- `.opencode/steps/rules.md`;
- the components, styles and theme tokens the analysis or the file listing points
  at (read-only);
- this contract.

Do not read the plan (it does not exist yet), other artifacts or git history.

## Output

`.opencode/plans/<slug>/design.md`, at most 50 body lines.

Run `node "$HOME/.config/opencode/scripts/artifact.cjs" init` (the packet gives `out`), fill the body and the machine block, then run `artifact.cjs seal`. `seal` writes the YAML header and runs `check-sections`; if the gate fails, it returns the violations, so fix the body and run it again. Never write YAML frontmatter.

```markdown
<!-- machine
status: done
refs: AC-01.2
screens: 0
states: 0
a11y_checks: 0
files_estimate: 0
risk_flags: ui, a11y
-->

# Design: <name>

## Screens
| ID | Screen | States | Notes |
|----|--------|--------|-------|
| D-01 | tag sheet | empty, mixed, all-present | one Apply, rows 48px |

## States
- <what replaces the surface at zero selection, loading, write failure>

## Responsive
- 320 and 390 px: <the one row that must not overflow, the thumb zone>

## Accessibility
- focus in, tab order, Enter/Space, Escape, focus return, labels, live region

## Copy
- <keys under the existing namespace; both locales; plural-safe wording>

## Open questions
| ID | Blocking | Question | Recommendation |
|----|----------|----------|----------------|
| Q-01 | no | <what needs a product decision> | <what you recommend> |
```

## Metrics

- `screens` — rows in `## Screens`;
- `states` — the distinct states covered;
- `a11y_checks` — keyboard, focus, labels, contrast checks you specified;
- `files_estimate` — rough count the design implies (the plan refines it);
- `risk_flags` — copied from the analysis; the router uses it to decide whether
  architecture is still needed after the design;
- `questions_blocking` — questions with `Blocking: yes` (the gate counts them).

## Hard rules

- Never write YAML frontmatter; `artifact.cjs seal` writes the header.
- Reuse the project's existing components and design tokens; a new pattern
  needs a reason in `Notes`.
- Mobile first: 320 and 390 px, 48 px targets, no hover-only affordance.
- Keyboard and focus are part of the design, not a later fix.
- Every user-facing string goes through the project's i18n layer and exists in
  every supported locale.
- No code, no file contents, no implementation steps. The plan owns those.
- A question that changes the design is `Blocking: yes` in `## Open questions`
  with a recommendation. Never choose silently. Ask as soon as it appears; do
  not guess and bury the guess in a note.
