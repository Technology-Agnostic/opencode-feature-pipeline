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
