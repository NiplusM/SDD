---
name: Refactoring
description: Restructure code without changing behavior — preserve tests, improve shape
---

## Goal
<what to restructure and why: current shape, target shape, motivating constraint>

## Plan
- [ ] Extract / inline / rename in [@ClassName](com.example.ClassName) — <specific transformation>
  - [ ] Update call sites in [@CallerClass](com.example.CallerClass)
- [ ] Move <component> from [@oldLocation](path/old) to [@newLocation](path/new)
  - [ ] <sub-task with detail>
    <details>
    <summary>Context / rationale</summary>

    Why this shape is better, and any constraints (binary compat, public API, etc.).

    </details>
- [ ] Re-run the affected test modules and confirm behavior is preserved

## Acceptance Criteria
- [ ] `./tests.cmd --module affected.module` passes with no new failures (behavior preserved)
- [ ] No public API surface changed (or: <documented intentional change>)
- [ ] <metric>: <before> → <after> (e.g., file size, cyclomatic complexity, dependency count)

## Investigation Notes
<call chains touched, public-API risk, similar prior refactors, deprecation chains>

---

Generation guidelines:

- Goal: describe the current shape, the target shape, and why the change is worth the churn.
- Plan: task tree of concrete code moves. Each top-level item must name the transformation and its location. Use @-mention links. 2–5 top-level items.
- Acceptance Criteria: focus on behavior preservation (tests still pass) and a measurable shape improvement. Avoid "code is cleaner". 2–4 items.
- Investigation Notes: record callers, public API exposure, and any prior refactors in the same area.
