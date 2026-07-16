# Visual Specification: SDD Code Review Prototype

## Goal

Define the target visual behavior for the SDD code review prototype: a dense JetBrains-style IDE shell that demonstrates specification authoring, agent execution, plan/acceptance verification, warnings, quick fixes, and final code review for the Spring PetClinic `visit-booking` scenario.

This is a visual and interaction specification. It should guide implementation and Figma reproduction without changing the product scenario.

## Source Of Truth

Use repository sources in this order:

1. `src/App.jsx` for the implemented main prototype flow.
2. `src/PlanDiffPage.jsx`, `src/PlanDiffView.jsx`, and `src/planDiffPageState.js` for standalone plan-diff behavior.
3. `src/Specifications/CONTENT.md` for canonical PetClinic scenario content.
4. `src/Specifications/AGENT_DESIGN_GUIDE.md` for JetBrains Int UI Kit visual rules.
5. `src/Specifications/FIGMA_REPRODUCTION_SPEC.md` for Figma frame coverage and normalized copy.

If implementation and documentation disagree, preserve the implemented interaction model and normalize visible copy to the Spring PetClinic scenario.

## Visual Direction

The prototype must feel like a JetBrains IDE, not a generic web dashboard.

- Use compact density, dark layered surfaces, editor-first layout, tool windows, tabs, left and right stripes, and a status bar.
- Prefer `@jetbrains/int-ui-kit` components and local helpers over custom controls.
- Use `Inter` for UI text and `JetBrains Mono` only for code, paths, terminal output, line numbers, and technical values.
- Keep the dark Islands-style surface language: rounded panels, subtle gaps, layered backgrounds, and restrained highlights.
- Avoid decorative UI that does not support the code review or SDD workflow.

## Canonical Scenario

| Field | Value |
| --- | --- |
| Project | `spring-petclinic` |
| Branch | `feature/visit-booking` |
| Run configuration | `PetClinicApplication` |
| Primary task | `visit-booking.md` |
| Secondary task | `vet-schedules.md` |
| Main file | `VisitController.java` |
| Reference document | `Configuration.md` |
| Core feature | Vet assignment and time slot selection for visit booking |

## Required Shell

Every IDE-state frame must include:

- Top toolbar with project name, branch, and run configuration.
- Left tool stripe with `Project`, `Commit`, `Structure`, `Agent Tasks`, `Terminal`, `Git`, and `Problems`.
- Right tool stripe with default auxiliary IDE tools.
- Editor tab strip with PetClinic files and generated specification tabs.
- Bottom tool window area for terminal, problems, or run output.
- Status bar with breadcrumbs and technical widgets.

## Required Editor Tabs

The default editor tabs must be:

- `VisitController.java`
- `Visit.java`
- `createOrUpdateVisitForm.html`
- `schema.sql`

When specification tabs are opened, keep the code tabs available in the same tab strip.

## Required Project Tree

The Project tool window must show a Spring PetClinic-oriented tree:

```text
spring-petclinic/
  src/main/java
    owner
      Visit.java
      VisitController.java
      VisitRepository.java
      Owner.java
      Pet.java
      PetTypeFormatter.java
    vet
      Vet.java
      VetRepository.java
      VetFormatter.java
      VetSchedule.java
    model
      BaseEntity.java
      Person.java
  src/main/resources
    templates
      pets
        createOrUpdateVisitForm.html
      owners
        ownerDetails.html
    db
      h2
        schema.sql
        data.sql
    application.properties
  src/test/java
    VisitControllerTests.java
    ClinicServiceTests.java
  Agent Specifications
    Configuration.md
    visit-booking.md
    vet-schedules.md
```

## Required Specification Content

The `visit-booking.md` tab must present:

- Goal for adding vet assignment and time slot selection.
- Six acceptance criteria.
- Seven plan steps.
- Implementation notes about the existing `Visit` entity, persistence model, `VetRepository`, and formatter pattern.
- Out-of-scope notes for dynamic availability and specialty matching.

Warnings and errors must appear inline in the spec document, with corresponding entries in the Problems tool window.

## Required Inspection Findings

The visual flow must include these four findings:

| Severity | Finding | Surface |
| --- | --- | --- |
| Warning | AC/Plan mismatch: AC says available vets, plan loads all vets | `visit-booking.md` |
| Warning | Ambiguous AC: `e.g.` makes slot granularity untestable | `visit-booking.md` |
| Warning | Possible race condition: check-then-act needs DB constraint | Plan section |
| Error | Missing `VetFormatter`: form POST will fail | Plan section |

## Required Flow States

- Welcome/default state with the PetClinic project visible.
- IDE/default workspace with Project tool window open.
- Agent Tasks panel with selected, running, warning, and completed tasks.
- `visit-booking.md` generated spec state.
- Inline issue popup with quick-fix actions.
- Terminal permission pause for agent execution.
- Terminal plan success state.
- Acceptance Criteria pause on AC #1 warning.
- AC #1 fixed state after quick fix.
- `vet-schedules.md` secondary task state.
- Problems tool window for the spec tab.
- Problems tool window for `VisitController.java`.
- Standalone `Diff VisitController.java` review state.

## Interaction Rules

- Quick fixes must visibly change the affected spec line and update the corresponding status.
- Terminal states must use PetClinic-specific commands, especially `agent run "visit-booking.md"`.
- Acceptance Criteria execution must pause on AC #1 before the quick fix and pass after the fix.
- Plan execution must show completed steps while preserving warning/error context where relevant.
- Problems panel entries must navigate conceptually to the matching spec or code surface.
- The standalone diff page must preserve route behavior through `planDiffPageState.js`.

## Plan

- [ ] Normalize visible project metadata to Spring PetClinic across toolbar, status bar, terminal, welcome screen, and Agent Tasks.
- [ ] Ensure editor tabs and project tree use PetClinic files instead of placeholder `payment-service` content.
- [ ] Ensure `visit-booking.md` includes the canonical Goal, Acceptance Criteria, Plan, Implementation Notes, and Out-of-scope sections.
- [ ] Render the four required inspection findings inline and in the Problems tool window.
- [ ] Implement quick-fix visual states for AC #1 and the plan findings.
- [ ] Ensure terminal states show permission, plan success, AC pause, and rerun/fixed outcomes.
- [ ] Ensure the standalone plan-diff page shows the PetClinic `VisitController.java` review flow.

## Acceptance Criteria

- [ ] No visible primary surface uses `payment-service`, `aaaa`, `bbbb`, or generic placeholder copy.
- [ ] The prototype reads visually as a JetBrains IDE shell with compact density, tool windows, tabs, stripes, and status bar.
- [ ] The `visit-booking.md` document shows six ACs, seven plan steps, implementation notes, and out-of-scope items.
- [ ] The four required findings are visible with correct severities and matching problem entries.
- [ ] AC #1 can be shown in both warning/paused and fixed/passed visual states.
- [ ] The terminal flow uses PetClinic-specific commands and reflects the SDD execution sequence.
- [ ] The diff/review surface focuses on `VisitController.java` and shows review affordances for the plan/code relationship.
- [ ] Production build passes after application-code changes that implement this visual specification.

## Non-Goals

- Do not redesign the prototype into a new product surface.
- Do not add mobile layouts.
- Do not replace JetBrains Int UI Kit with another component system.
- Do not hand-edit generated screenshots, `dist/`, `test-results/`, or `playwright-report/`.
