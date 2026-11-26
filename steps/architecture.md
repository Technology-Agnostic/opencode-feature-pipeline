# Step contract: architecture

Place the change in the existing repository: which modules and files change, who
owns what, which interfaces move, and in what order the repo compiles at every
step. This step runs only for a large change (`files_estimate > 10`), a risk flag
(`auth`, `money`, `migration`, `public`) or `full` mode. You write no code.

## Inputs you may read

- `.opencode/plans/<slug>/analysis.md` and `design.md` if it exists;
- `.opencode/steps/rules.md`;
- the project `AGENTS.md`, the file listing and the existing interfaces, stores
  and modules the change touches (read-only);
- this contract.

Do not read the plan (it does not exist yet) or other artifacts.

## Output

`.opencode/plans/<slug>/architecture.md`, at most 45 body lines (60 in full).

Run `node "$HOME/.config/opencode/scripts/artifact.cjs" init` (the packet gives `out`), fill the body and the machine block, then run `artifact.cjs seal`. `seal` writes the YAML header and runs `check-sections`; if the gate fails, it returns the violations, so fix the body and run it again. Never write YAML frontmatter.

```markdown
<!-- machine
status: done
refs: AC-02.1
modules: 0
interfaces: 0
files_estimate: 0
new_files: 0
-->

# Architecture: <name>

## Modules
| ID | Module | Files | Responsibility |
|----|--------|-------|----------------|
| A-01 | store | `src/.../store.ts` | the only writer; one bulk call |

## Interfaces
- <what is added or changed; signature; owner; rejected alternative>

## Change scope
- <files touched, files deliberately untouched, and why the split is SOLID>

## Migration order
1. <what lands first so the repo compiles and tests stay green>
2. ...

## Rejected alternatives
- <one line each: what and why not>
```

## Metrics

- `modules` — rows in `## Modules`;
- `interfaces` — public contracts added or changed;
- `files_estimate` — distinct files the change touches;
- `new_files` — files the analysis did not name.

## Hard rules

- Never write YAML frontmatter; `artifact.cjs seal` writes the header.
- One owner per rule: persistence, presentation and pure math do not leak into
  each other.
- The smallest structure that satisfies the analysis; no speculative layer, no
  new dependency, route, barrel or storage bump.
- Every step of `## Migration order` leaves the repo compiling and the suite
  green; a step that breaks the build is not a step.
- If a decision changes the analysis ACs, return `status: needs_input`; do not
  rewrite the ACs here.
