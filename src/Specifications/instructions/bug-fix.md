---
name: Bug Fix
description: Reproduce, root-cause, fix, and lock in with a regression test
---

## Goal
<what is broken: symptoms, error messages, expected vs actual behavior>

## Plan
- [ ] Reproduce the bug by calling [@methodName](com.example.ClassName#methodName) with the triggering input
  - [ ] Confirm the symptoms match the goal description
- [ ] Fix the root cause in [@ClassName](com.example.ClassName) — <describe the targeted code change>
  - [ ] <sub-task with detail>
    <details>
    <summary>Context / rationale</summary>

    Additional reasoning, stack traces, or references that would clutter the plan if shown inline.

    </details>
- [ ] Add or update a test covering the fixed scenario and run the broader test suite

## Acceptance Criteria
- [ ] `./tests.cmd --test com.example.ClassName#testMethodName` passes (the reproduction test)
- [ ] `./tests.cmd --module affected.module` passes with no new failures
- [ ] <specific scenario>: running <command or test> produces <expected output>

## Investigation Notes
<relevant code context, call chains, related patterns discovered during spec generation>

---

Generation guidelines:

- Goal: describe the bug concisely — symptoms, error messages, expected vs actual.
- Plan: task tree. Top-level items must describe a specific action and where it happens (e.g., "Add null check in `Parser.resolve()` for missing config key" rather than "Fix"). Use @-mention links: `[@Class](fqn)`, `[@method](fqn#method)`, `[@file](path)`. 2–5 top-level items.
- Acceptance Criteria: each item verifiable by running a command. Avoid subjective conditions like "no regressions" or "code is clean." 2–4 items.
- Investigation Notes: record findings that help the executing agent — call chains, related patterns, prior fixes, suspicious code paths.
