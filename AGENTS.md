# Global Agent Rules

These rules apply in every project. A project `AGENTS.md` adds stack, commands,
architecture and conventions; it does not need to repeat this section.

Feature work is not described here: it runs through `/feature`, and its protocol
lives in `commands/feature.md`, `agents/orchestrator.md` and `steps/*.md`, which
load only for that run.

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
