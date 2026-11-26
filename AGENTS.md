# Clear Explanation Rules

Rules for writing clear, accessible explanations that a human can actually understand.

You are writing for a human who is intelligent but does **not** already live inside this codebase or domain.

Your goal is **understanding**, not looking smart.

Applies to answers and explanations to user questions: chat replies, JSDoc, and comments that explain behavior.

---

## Core Principles

1. **Start with the purpose**
    - First sentence must answer: "What is this for?"
    - Never start with implementation details, jargon, or clever phrasing.

2. **One idea per paragraph / comment block**
    - Do not mix _what_, _why_, and _how_ in the same sentence.
    - Structure:
        1. What it does
        2. How it works (only if needed)
        3. Important caveats / edge cases

3. **Define terms the moment you use them**
    - If you introduce a domain word ("template", "materialize", "lock", "due day"), immediately explain what it means in this context.
    - Never assume the reader already knows internal vocabulary.

4. **Prefer concrete language over abstract language**
    - Bad: "Lazy auto-post of due recurring expenses"
    - Good: "Automatically creates the recurring expense transactions that are due this month"

5. **Explain the non-obvious _why_**
    - If a decision is surprising (e.g. "we never backfill past months"), say why.
    - Do not leave the reader thinking "why the hell does it work this way?"

6. **Write so the comment is useful even without reading the code**
    - After reading the explanation, the person should understand the responsibility and the important constraints.

7. **Match the reader's current level**
    - Assume they know the general technology (TypeScript, frameworks, databases...).
    - Do **not** assume they know _this_ system's internal concepts yet.

8. **Avoid density**
    - Short sentences > long clever sentences.
    - Prefer lists when there are multiple conditions or steps.

---

## Anti-patterns (never do these)

- Packing multiple ideas into one long sentence
- Using internal jargon without definition
- Writing comments that only make sense to the person who wrote the code
- Starting with clever or "senior-engineer" phrasing
- Assuming the reader already understands the domain model

---

## Quick checklist before you finish any explanation

- [ ] Can someone who has never seen this file understand the purpose from the first 1–2 sentences?
- [ ] Are domain terms defined when they first appear?
- [ ] Is the _why_ explained for non-obvious decisions?
- [ ] Is there only one main idea per paragraph?
- [ ] Does the explanation reduce cognitive load instead of adding to it?

---

# Agent Workflow And Safety

These rules apply in every project. A project `AGENTS.md` adds stack, commands,
architecture and conventions; it does not need to repeat this section.

## Feature pipeline

- Feature work goes through `/feature`; its protocol is `commands/feature.md`,
  `agents/orchestrator.md` and the step contracts. Do not reimplement the chain
  by hand, and do not add a plan review, a code review or a fix loop to a run.
- Two workers, split by what they may touch: `worker-prod` writes code and tests
  (`implement`); `worker-read` writes only its artifact (`analysis`, `design`,
  `architecture`, `plan`). `test` belongs to the orchestrator: the browser is
  attached to its session, and a worker has no browser tool.
- Gates are scripts and the router is the only verdict. A reject is a content
  defect: report it, never reopen a worker to rewrite content. Calls are one-shot:
  `artifact.cjs seal` writes the header, a model never does.

## Artifacts and handoffs

- Feature artifacts live in `.opencode/plans/<slug>/`: `analysis.md`, `design.md`,
  `architecture.md`, `plan.md`, `steps/S-xx.md`, `test-report.md`, `progress.md`,
  `retro.md`, `ledger.md`.
- `analysis.md` is the only place ACs are born; every later step refers to its
  `AC-` ids and never invents new ones.
- The sealed header is the handoff: `step`, `status`, `refs`, `changed`, `metrics`,
  plus `verify` for `implement` and `test`. The model writes only the body and the
  machine block; a number a gate can compute is copied from the gate.
- `ledger.md` is written by `router.cjs`; never hand-edit its rows. `progress.md`
  and `retro.md` are written once at close, and their counts come from
  `ledger-summary.cjs`, not a hand count.
- `.opencode/steps/rules.md` is project configuration, not output: it lists the
  `HR-` rules every analysis is checked against. Keep it in version control.
- Do not paraphrase a step, a finding or a report in a handoff. Pass paths and IDs.
  Stable IDs: `AC-`, `HR-`, `S-`, `A-`, `D-`, `V-`, `F-`, `Q-`, `SK-`, `H-`.

## Safety

- Use only commands that exist in the project. Do not invent `lint`, `e2e`, or
  `typecheck` scripts.
- Report the exact commands you ran and their result; a claim without evidence
  is not accepted.
- Do not add dependencies, test frameworks, or e2e/a11y tooling without
  explicit approval.
- Do not commit or push unless the user asks.
- Never edit generated or vendored output such as `dist/`, `build/`, or
  `node_modules/`.
- Never delete or weaken a failing test to make a suite green. Use a skipped
  test with a defect ID, or fix the defect.

## Language

- Agent instructions and skills are written in English.
- Plan artifacts are internal working documents and are written in English.
- Keep user quotes, UI strings, and domain terms in their original language.
- User replies follow the language of the request.
