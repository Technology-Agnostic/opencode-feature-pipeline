# Step contract: test

Run the visual test plan from `plan.md` against the real app, and prove the
project is still green. This is the only browser step, and the orchestrator runs
it: the browser is attached to the orchestrator's session, not to a worker. Do
not delegate this step. You do not fix code: you report what you saw.

## Inputs you may read

- `.opencode/plans/<slug>/plan.md` — the `## Visual checks` table;
- `.opencode/plans/<slug>/analysis.md` — the ACs the checks prove;
- `.opencode/plans/<slug>/design.md` — when it exists, the states and copy the controls must match;
- `.opencode/steps/rules.md`;
- the running app through the browser tool;
- this contract.

Do not read code to decide how a check should behave. The check list is
user-level; if a check cannot be run from the page, it is `blocked`, not a
reason to read source.

## Output

`.opencode/plans/<slug>/test-report.md`, at most 40 body lines (55 in full).

Run `artifact.cjs init --step test --out .opencode/plans/<slug>/test-report.md` (this step has no packet, so pass `--out` explicitly), fill the body and the machine block, then run `artifact.cjs seal --step test`. If `test-report.md` already exists from a blocked run, replace its body and machine block; init only creates a new file. `seal` writes the YAML header and runs `check-test`; if the gate fails, it returns the violations, so fix the body and run it again. Never write YAML frontmatter.

```markdown
<!-- machine
status: done
build: pass
unit: pass
viewports: 390, 320
verify_cmd: <project test command>
verify_exit: 0
verify_passed: 0
verify_failed: 0
-->

# Test report: <name>

Method: <build and suite result; browser; how the state was seeded>

## Checks
| V | Result | Evidence |
|---|--------|----------|
| V-01 | pass | Enter opened the sheet; Escape closed it; focus returned to Tags |

## Findings
| ID | Severity | What |
|----|----------|------|
| F-01 | minor | <what a user would see> |

## AC deviations
| AC | Why the AC is wrong |
|----|---------------------|

## Notes
- <console errors, flaky checks, what was not run and why>
```

## Order of work

1. Run `npm run build` and the whole suite. If either fails, set
   `status: blocked` with the first failing output and stop: the visual checks
   would test a broken app.
2. Start the dev server (`npm start`) in the background and wait for the URL it
   prints (usually `http://localhost:4200`). Open it in the browser. Stop the
   server when the report is written.
3. Seed the state the checks need. Prefer the UI. If the app persists state,
   use its own storage key and schema; set it and reload. Do not edit source.
4. Run every `V` row from the plan. `smoke` (the `standard` depth) means every
   row, the keyboard path and one screenshot per viewport; `audit` (the `full`
   depth) adds contrast, forced-colors and performance. No row may be skipped.
5. Write the report, then run `artifact.cjs seal --step test`. Seal runs
   `check-test` and returns the violations if the body is incomplete; fix the
   body and seal again, then route with `router.cjs`. The router runs the same
   gate again.

`status: done` means the report is complete: every `V` row has a result, even if
some are `fail` or `blocked`. Use `status: blocked` only when no check could run
at all (no browser, red build); say why in one line and finish the step, and the
close step records `Verification: blocked`. A `done` report with blocked rows
still closes the run, with `Verification: partial`.

## Metrics

- `build` / `unit` — `pass` or `fail` from step 1;
- `checks_passed` / `checks_total` — `V` rows with `pass`;
- `findings_blocker` / `findings_major` / `findings_minor` — findings by user
  impact; a failed check is `major` unless the user cannot complete the flow;
- `ac_deviations` — failed checks caused by a wrong AC, not by the code;
- `viewports` — widths actually tested.

## Hard rules

- Never write YAML frontmatter; `artifact.cjs seal` writes the header and runs
  `check-test`. You run both yourself; this step has no worker.
- Use the **browser tool** only. Load the `browser` skill before the first call;
  it documents snapshots, refs, waits and screenshots. Never write a browser
  driver: no Playwright, Puppeteer, Selenium or a hand-written CDP script.
- The browser tool has no viewport command. For a width-specific row, load the
  app in a same-origin iframe of that width (`390` or `320` px, height `844`)
  and screenshot the iframe element; the iframe shares `localStorage` with the
  page. If it does not render the app, mark that width `blocked`. Two minutes on
  tooling is the cap.
- Start the dev server in the background and stop it before you finish. Do not
  leave the dev-server port occupied.
- Evidence per check: what you did, what you saw. "Looks fine" is not evidence.
- A `V` row is `pass` only when every clause of its Expected holds. If one
  clause fails, the row is `fail` and the missing behaviour is a finding.
- `ac_deviations` is only for a check where the code does what the user needs
  but the AC text is wrong. It is not an excuse for a defect, and the same
  problem cannot be both a finding and a deviation.
- Take one screenshot per viewport and keep its path. If the capture path is
  denied, record that and say which rows rest on DOM measurement instead of
  pixels.
- If the design names copy keys, check that at least one control renders them.
  A key that exists in the locale files but is used by no template is a `minor`
  finding: the design was not implemented as written.
- A check you did not run is `blocked`, never `pass`.
- `minor` is not a blocker. A failed check caused by a wrong AC is an
  `ac_deviation`, not a code defect.
- Do not edit code, tests or styles. Do not run a formatter or a command that
  writes files.
