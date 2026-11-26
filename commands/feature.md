---
description: Run a feature through analysis → (design) → (architecture) → plan → implement → test → close
agent: orchestrator
subagent: false
---

New feature: $ARGUMENTS

If the request starts with `standard` or `full`, treat that word as the mode and
remove it from the description. Otherwise apply the mode matrix in the
orchestrator: the default is `standard`, and if it is unclear between the two
modes, choose `full`. Record the mode and one line of reasoning in
`progress.md`.

Run the chain from the orchestrator:

1. Preflight: slug, `.opencode/plans/<slug>/`, project rules
   (`.opencode/steps/rules.md`, derive and show them on the first run), a green
   baseline, and the mode.
2. `analysis` with `worker-read` → `analysis.md`: goal, scope, ACs with
   `unit|visual|manual`, rule coverage, open questions. If it has blocking
   questions, ask the user and run `analysis` once more with `attempt: 2`.
3. `design` with `worker-read`, only when the analysis has `ui` or `a11y` risk →
   `design.md`.
4. `architecture` with `worker-read`, only when the change is larger than 10
   files, has an auth/money/migration/public risk, or mode is `full` →
   `architecture.md`.
5. `plan` with `worker-read` → `plan.md`: 1–9 steps with `acs`, `files`,
   `acceptance`, plus the `## Visual checks` table (`V | AC | scenario |
   expected | viewport`).
6. `implement` with `worker-prod`, one step per call → code, tests,
   `steps/S-xx.md`. KISS, YAGNI, one owner per rule.
7. `test` yourself, when the plan has visual checks → `test-report.md`: start the
   dev server, run the browser checks, record findings by severity and AC
   deviations. `smoke` in `standard`, `audit` in `full`. Do not delegate this
   step: `worker-read` has no browser.
8. Close with the shell: if `test` did not run, run the build and suite; run
   `format:check` and the changed-file scope. Write `progress.md` and `retro.md`.

After every worker call run `router.cjs` with `--verify --mode <mode> --ledger`.
`test` has no worker call: run `artifact.cjs init`/`seal` yourself and route the
report the same way. Workers seal their own artifacts; if a header is missing,
run `artifact.cjs seal` — a script, not a repair call. Act on the router's
`decision`. A reject is a content defect: report it, never reopen a worker for a
header, never a review and never a search for omissions. There is no fix loop in
this version: test findings go to the backlog.

At the end output:

- the artifact folder `.opencode/plans/<slug>/`;
- what was implemented and which checks passed;
- the number of model calls and skipped steps with reasons;
- what remains unverified or in the backlog.
