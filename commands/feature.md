---
description: Run a feature through analysis → (design) → (architecture) → plan → implement → test → close
agent: orchestrator
subagent: false
---

New feature: $ARGUMENTS

Run the chain from the orchestrator:

1. Preflight: slug, `.opencode/plans/<slug>/`, project rules
   (`.opencode/steps/rules.md`, derive and show them on the first run), and a
   green baseline.
2. `analysis` with `worker-read` → `analysis.md`: goal, scope, ACs with
   `unit|visual|manual`, rule coverage, open questions. If it has blocking
   questions, ask the user and run `analysis` once more with `attempt: 2`.
3. Scope: after a clean analysis the router returns `ask_scope` with a
   `recommend`. Ask the user whether to run `design` and/or `architecture`,
   marking the recommended choice, write the answer to
   `.opencode/plans/<slug>/scope.md`, then run the chosen steps.
4. `design` with `worker-read` (if chosen) → `design.md`; `architecture` with
   `worker-read` (if chosen) → `architecture.md`.
5. `plan` with `worker-read` → `plan.md`: 1–9 steps with `acs`, `files`,
   `acceptance`, plus the `## Visual checks` table
   (`V | AC | scenario | expected | viewport`).
6. `implement` with `worker-prod`, one step per call → code, tests,
   `steps/S-xx.md`. KISS, YAGNI, one owner per rule. If a step needs a file
   outside the plan, grant it and re-run the step.
7. `test` yourself, when the plan has visual checks → `test-report.md`: start
   the dev server, run every browser check from the plan, record findings by
   severity and AC deviations. Do not delegate this step: `worker-read` has no
   browser.
8. Close with the shell: if `test` did not run, run the build and suite; run
   `format:check` and the changed-file scope. Write `progress.md` and `retro.md`.

After every worker call run `router.cjs` with `--verify --ledger`.
`test` has no worker call: run `artifact.cjs init`/`seal` yourself and route the
report the same way. Workers seal their own artifacts; if a header is missing,
run `artifact.cjs seal` — a script, not a repair call. Act on the router's
`decision`. A reject is a content defect: report it, never reopen a worker for a
header, never a review and never a search for omissions. There is no fix loop in
this version: test findings go to the backlog.

At the end output:

- the artifact folder `.opencode/plans/<slug>/`;
- what was implemented and which checks passed;
- the number of model calls and the scope steps skipped with reasons;
- what remains unverified or in the backlog.
