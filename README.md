# Feature pipeline (global config)

A feature runs as a chain of typed steps:
`analysis → (design) → (architecture) → plan → implement ×N → (test) → close`.
The worker steps are `analysis`, `design`, `architecture`, `plan` and
`implement`; `test` and `close` run in the orchestrator because that is where the
browser and the shell live. `design` and `architecture` are added only when the
feature needs them. A deterministic router reads the artifact frontmatter and
decides what runs next; gates are scripts, not opinions.

## Files

```
agents/
  orchestrator.md    router: packets, routing, ledger, close (primary)
  worker-prod.md     implement only: code + tests
  worker-read.md     analysis, design, architecture, plan
steps/
  analysis.md        brief -> ACs + questions + rule coverage
  design.md          UI/UX, only for ui/a11y risk
  architecture.md    modules, files, interfaces, migration order
  plan.md            steps + visual checks
  implement.md       one step -> code + tests + steps/S-xx.md
  test.md            visual checks on the running app (orchestrator)
scripts/
  router.cjs         validate frontmatter, run the gate, decide, append to ledger
  artifact.cjs       init a machine block, seal it into frontmatter
  ledger-summary.cjs counts for progress.md and retro.md
  lib/gates.cjs      the single source of gate specs and body budgets
  lib/frontmatter.cjs machine block parse, YAML write
  check-analysis.cjs ACs, rule coverage, blocking questions
  check-plan.cjs     AC ownership, visual checks, spec-run rule
  check-test.cjs     every plan check has a result and evidence
  check-sections.cjs generic table/section gate (design, architecture)
commands/feature.md  the /feature entry point
instructions/
  clear-explanations.md  always-on rules for replies, comments and JSDoc
```

`opencode.jsonc` adds `instructions/clear-explanations.md` to every session.
`AGENTS.md` is the other always-on file and holds only cross-project safety and
language rules; the pipeline itself is loaded only when `/feature` runs.

Scripts are invoked as `node "$HOME/.config/opencode/scripts/<script>.cjs"`.
`$HOME` resolves in PowerShell and in POSIX shells, so the same instruction works
for any user instead of naming one home directory.

`agents/*.md` and `commands/*.md` start with YAML frontmatter. A scalar that
contains `: ` must be quoted; otherwise the parser reads a nested mapping and the
file fails to load.

`service.json` is local state, not configuration to share: it holds the password
OpenCode clients use to authenticate to the background service. Never commit or
publish it.

## Use

1. In a project, run `/feature <description>` (optionally `standard|full`).
2. First run only: the orchestrator derives `.opencode/steps/rules.md` and shows
   it to you. Approve it once — that file is the spec every analysis is checked
   against.
3. Watch `.opencode/plans/<slug>/ledger.md`: one row per routed artifact,
   including rejects, with the decision and its reason.
4. `progress.md` is the human summary; `retro.md` says which steps paid for
   themselves.

## Modes

| Mode | Steps | Worker calls |
|---|---|---|
| `standard` | analysis → (design) → (architecture) → plan → implement → (test smoke) → close | ≤12 |
| `full` | analysis → (design) → architecture → plan → implement → (test audit) → close | ≤16 |

The budget counts worker calls; `test` is the orchestrator's own step. `design`
runs only when the analysis carries `ui` or `a11y` risk. `architecture` runs only
for more than 10 files, an auth/money/migration/public risk, or `full` mode.
`test` runs when the plan has a `visual` AC; the orchestrator runs it itself
because a worker has no browser.

There is no `light` mode: work that fits in a single edit is one prompt to
`build`, not a feature with artifacts.

## Budgets and gates

An artifact budget counts **body lines only**: blank lines and the frontmatter
do not count. `full` mode has a larger cap because the same step has more states
and checks to describe. An overrun is recorded as a warning, not a repair: a
repair call costs more than the extra lines. Only twice the budget rejects. The
limit itself is stated once, in the step contract (`at most N body lines`); both
`seal` and the router read it from there. The router runs `check-analysis`,
`check-plan`, `check-test` or `check-sections` itself; the model does not print a
gate command. A gate-derived metric that disagrees with the gate is corrected and
recorded in the ledger, not turned into a repair call.

## One-shot calls

Every worker step is one fresh call. `artifact.cjs seal` writes the header, so
there is no header repair call: a forgotten seal is fixed by running the script.
A gate failure is content; report it, never reopen a worker to rewrite content,
never a review, never a search for omissions. `test` is not a worker call: the
orchestrator writes and seals that report directly.

`files_touched` is audited against a snapshot of every file in the plan, taken
just before the step. If a step touches a file that belongs to a neighbouring
step, it appears in `changed`, so the trace shows the real blast radius even when
the orchestrator had to grant that file.

## Evolution

`retro.md` is the tuning artifact: for every step it records `used/skipped`,
`why`, the findings it produced, and which defects escaped to `test`. After a
few runs, add the step that would have caught the escaped defect — plan review
first, then code review, then a fix loop. Remove a step that never finds
anything. That is the only mechanism that changes the graph; there is no
self-modifying prompt.

## Project rules

`.opencode/steps/rules.md` is project configuration, not output. Keep it in
version control.

```
- HR-1: no new dependency, route change or storage schema bump
- HR-2: reuse the existing write path; a second path is a defect
- HR-3: both locales, no hardcoded user-facing string
```

Every rule needs an AC in the analysis that asserts it. The analysis gate derives
the expected list from this file, so adding a line is enough to make it
mandatory.

## Changing a step

Edit the contract in `steps/`. The shape is fixed: inputs you may read, a body
plus the machine block, metrics, hard rules. `artifact.cjs seal` writes the
frontmatter; the contract does not contain YAML. If you need a new machine check,
add a script to `scripts/` and register it in `scripts/lib/gates.cjs`; both seal
and the router pick it up from there.
