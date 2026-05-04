---
name: New Feature
description: Build a new capability — scope it, plan, verify with tests
---

## Goal
<what to build: user-facing capability, target behavior, success scenarios>

## Plan
- [ ] Add the data model in [@ClassName](com.example.ClassName) — <fields, constraints>
  - [ ] <sub-task>
- [ ] Wire the new feature into [@ClassName#methodName](com.example.ClassName#methodName)
  - [ ] <sub-task with detail>
    <details>
    <summary>Context / rationale</summary>

    Reasoning, design choices, trade-offs.

    </details>
- [ ] Add tests covering the golden path and main edge cases

## Acceptance Criteria
- [ ] `./tests.cmd --test com.example.NewFeatureTests` passes
- [ ] <scenario>: running <command> produces <expected output>
- [ ] `./tests.cmd --module affected.module` passes with no new failures

## Investigation Notes
<related call chains, similar prior features, integration points discovered during spec generation>

---

Generation guidelines:

- Goal: describe the capability concisely — what the user can do after, and the success scenarios.
- Plan: task tree of concrete actions with file/symbol locations. Use @-mention links: `[@Class](fqn)`, `[@method](fqn#method)`, `[@file](path)`. 2–5 top-level items, each independently completable.
- Acceptance Criteria: each item must be verifiable by running a command or inspecting output. 2–4 items.
- Investigation Notes: record findings that help the executing agent — related code, prior similar features, integration points.
