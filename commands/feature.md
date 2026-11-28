---
description: Run a feature through analysis → (design) → (architecture) → plan → implement → test → (fix) → test → close
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
5. `plan` with `worker-read`: read analysis, design and architecture, then
   write two files — `plan.md` (1–9 steps with `acs`, `files`, `acceptance`,
   `design:` and `architecture:` constraints per step) and `test-plan.md`
   (`V | AC | scenario | expected | viewport | seed`). The plan is the compiler:
   implement and test will read only these two files.
6. `implement` with `worker-prod`, one step per call → code, tests,
   `steps/S-xx.md`. The packet's `artifacts` is `plan.md` and the rules only;
   do not send analysis, design or architecture. KISS, YAGNI, one owner per
   rule. If a step needs a file outside the plan, grant it and re-run the step.
7. `test` yourself, when the test plan has checks → `test-report.md`: start the
   dev server, run every browser check from `test-plan.md`, record findings by
   severity and AC deviations. Do not delegate this step: `worker-read` has no
   browser.
8. If `test` reports a blocker or a major finding, the router returns `ask_fix`.
   Ask the user whether to run the one `fix` step (recommended for a blocker or
   a major accessibility defect), append `fix: yes|no` to `scope.md`, and if yes
   call `worker-prod` with the test report, `plan.md` and `test-plan.md` →
   `fix-report.md`. One fix per run.
9. After a fix with visual retest rows, run `test` again for those rows only:
   keep the other results, drop the findings that now pass, and seal the amended
   report.
10. Close with the shell: if `test` did not run, run the build and suite; run
    `format:check` and the changed-file scope. Write `progress.md` and
    `retro.md`, including the fix outcome and the backlog.

After every worker call run `router.cjs` with `--verify --ledger`.
`test` has no worker call: run `artifact.cjs init`/`seal` yourself and route the
report the same way. Workers seal their own artifacts; if a header is missing,
run `artifact.cjs seal` — a script, not a repair call. Act on the router's
`decision`. A reject is a content defect: report it, never reopen a worker for a
header, never a review and never a search for omissions. There is no plan review
and no code review.

If a worker stops at its step limit and returns without sealing, do not re-run it
cold. Ask the user whether to continue; on yes, send a follow-up to the same
worker session with `mode: continue`, log it with `ledger-event.cjs`, and let it
finish the same step. One continuation round per step.

At the end output:

- the artifact folder `.opencode/plans/<slug>/`;
- what was implemented and which checks passed;
- the fix outcome (fixed ids, remaining ids) or that the user declined it;
- the number of model calls (including continuations) and the scope steps
  skipped with reasons;
- what remains unverified or in the backlog.
