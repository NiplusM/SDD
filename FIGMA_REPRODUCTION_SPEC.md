# Figma Reproduction Spec: SDD IDE Prototype Flows

## Objective

Create a high-fidelity, clickable Figma reproduction of the current desktop prototype and its interaction logic.

This is a reproduction brief, not a redesign brief.

The Figma file should preserve:

- the dense JetBrains-like desktop shell
- the current information hierarchy and panel structure
- the exact visit-booking / vet-schedules scenario copy
- the current inspection, terminal, problems, and diff workflows

If the implementation and content sources disagree, preserve the implemented layout and interaction model, but normalize the visible copy to the canonical PetClinic scenario defined below.

## Source Of Truth And Priority

Use repository sources in this order:

1. **Layout and behavior source**
   - `src/App.jsx`
   - `src/App.css`
   - `src/WelcomeScreen.jsx`
   - `src/WelcomeScreen.css`
   - `src/PlanDiffView.jsx`
   - `src/PlanDiffPage.jsx`

2. **Scenario and document content source**
   - `createSpecDocument()` in `src/App.jsx`
   - `createVetSchedulesSpecDocument()` in `src/App.jsx`
   - `AC_RUN_STATUSES`, `PLAN_RUN_STATUSES`, `ISSUE_QUICK_FIX_CONFIG`
   - `PLAN_CODE_DIFF_PRESETS`
   - `AGENT_TASKS`, `AGENT_TASK_PROBLEMS_ISSUES`, `EDITOR_PROBLEMS_BY_LABEL`

3. **Content normalization source**
   - `CONTENT.md`

4. **Design language source**
   - `AGENT_DESIGN_GUIDE.md`

### Important Normalization Rule

The current codebase still contains stale placeholder shell copy in several places, especially `payment-service`, `~/projects/payment-service`, and `Current File`.

For the Figma output:

- keep the implemented UI structure from the React code
- replace stale shell copy with the canonical PetClinic scenario below
- do **not** reproduce placeholder diff-viewer copy such as `Implement aaaa for BbbbService`

### Canonical Copy Overrides

| Surface | Current repo string | Figma string |
| --- | --- | --- |
| Project name | `payment-service` | `spring-petclinic` |
| Project root path | `~/projects/payment-service` | `~/projects/spring-petclinic` |
| Welcome recent project #1 | `payment-service` | `spring-petclinic` |
| Welcome badge initials | `PS` | `SP` |
| Toolbar run config | `Current File` | `PetClinicApplication` |
| Agent Tasks folder label | `payment-service` | `spring-petclinic` |
| Diff page project name | `payment-service` | `spring-petclinic` |
| Diff viewer placeholder plan items | `aaaa` / `BbbbService` copy | real `visit-booking` plan items |

## Deliverables

Produce one Figma page containing:

1. A reusable component set for the shared IDE shell.
2. Reusable components for agent-task overlays, problems, terminal prompts, and diff views.
3. Clickable frames for every required state listed in this spec.
4. Shared text styles, color styles, spacing tokens, and state variants.
5. Prototype links for the primary flows.

Desktop only. Do not design mobile adaptations.

## Canonical Scenario Data

Use this scenario consistently across all frames unless a section explicitly says otherwise.

| Field | Canonical value |
| --- | --- |
| Project name | `spring-petclinic` |
| Project root path | `~/projects/spring-petclinic` |
| Branch | `feature/visit-booking` |
| Run configuration | `PetClinicApplication` |
| Project icon | `SD` |
| Project accent color | blue |
| Primary task | `visit-booking.md` |
| Secondary task | `vet-schedules.md` |
| Primary breadcrumbs | `spring-petclinic` / `src/main/java` / `VisitController.java` |
| Status bar widgets | `42:1`, `UTF-8`, `LF` |
| Agent execution prompt | `Allow agent execution?` |
| Main diff file | `VisitController.java` |
| Reference chip in Plan heading | `Configuration.md` |

## Required Frames

| ID | Frame | Purpose |
| --- | --- | --- |
| F-01 | Welcome / default | Entry state with Project tool window and gradient welcome area |
| F-01a | Welcome / `New...` menu open | Context-menu variant for the left action list |
| F-02 | IDE / default workspace | Main project shell with Project tool window open |
| F-03 | Agent Tasks panel | Task list with selected, running, warning, and success variants |
| F-04 | `visit-booking.md` / done state / Version 1 | Primary generated-spec overlay |
| F-04a | `visit-booking.md` / issue intention popup | Quick-action popup for an active issue row |
| F-05 | Terminal / generate permission | `--generate` flow paused on execution permission |
| F-06 | Terminal / plan success | `--section "Plan"` completed state |
| F-07 | Terminal / acceptance criteria paused | `--section "Acceptance Criteria"` paused on AC #1 warning |
| F-08 | `visit-booking.md` / AC #1 fixed / Version 2 | Quick-fix applied and rerun-confirmed state |
| F-09 | `vet-schedules.md` / static task | Secondary task frame |
| F-10 | Problems tool window / `visit-booking.md` | Problems tree for the spec tab |
| F-11 | Problems tool window / `VisitController.java` | Problems tree for the Java tab |
| F-12 | `Diff VisitController.java` | Standalone diff view with inline review affordances |

## Global Shell Specification

### Window Sizes

Use these baselines:

- Welcome frame: `1100 x 800` exact match to the current implementation.
- IDE frames: `1440 x 800` or `1440 x 900`, keeping the current proportions and density.
- Standalone diff frame: desktop viewport with minimum visible height of about `820`.

### Main Window Structure

Across Welcome and IDE frames, preserve this shell:

- top toolbar visible
- left stripe visible
- right stripe visible
- editor tab strip visible
- status bar visible
- bottom tool windows docked, not floating

### Toolbar

Show a JetBrains-like toolbar with:

- project icon `SD`
- project name `spring-petclinic`
- branch `feature/visit-booking`
- run config `PetClinicApplication`

Keep the toolbar dense and compact. Do not turn it into a browser-like header.

### Left Stripe

Keep this order and grouping:

- top: `Project`, `Commit`, `Structure`
- separator
- top: `Agent Tasks`
- bottom: `Terminal`, `Git`, `Problems`

### Right Stripe

Use the default right-stripe items from the UI kit. They are present, but not the focus of the prototype.

### Status Bar

Show:

- breadcrumbs: `spring-petclinic` / `src/main/java` / `VisitController.java`
- widgets: `42:1`, `UTF-8`, `LF`

### Default File Tabs

Use these tabs in the IDE shell:

- `VisitController.java`
- `Visit.java`
- `createOrUpdateVisitForm.html`
- `schema.sql`

When agent-task tabs are opened, keep the existing code tabs available in the same tab strip.

### Project Tree

Use this normalized tree in the Project tool window:

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

## Visual System

### Overall Mood

- dark, dense, utility-first desktop IDE
- restrained contrast, not glossy SaaS
- compact spacing and small type throughout
- high information density without visual clutter

### Typography

Use:

- **Inter** for UI, prose, buttons, headings, tool-window labels
- **JetBrains Mono** for code, terminal lines, paths, line numbers, technical chips

Key text metrics pulled from CSS:

- done-overlay body text: `13px / 22px`, medium weight
- done-overlay heading rows: minimum height `32px`
- terminal permission prompt: `18px` line height
- diff code: JetBrains Mono `13px / 22px`
- welcome center title: `20px / 24px`, semibold
- welcome body labels: `13px / 16px`

### Key Colors

Use these implemented values or close equivalents:

- overall IDE background: `#1B1C1F`
- done overlay background: `#191A1C`
- welcome action tile idle: `#212326`
- welcome action tile hover: `#2B2D30`
- diff toolbar background: `#1B1C1F`
- diff popup background: `#191A1C`
- active diff file row: `#2E436E`
- blue accent / links: `#548AF7`
- muted success banner background: `#253627`
- success banner borders: `#375239`
- warning highlight wash: `rgba(194, 128, 19, 0.22)`
- warning icon / accent gold: `#F2C55C` to `#C7A450`
- error icon / accent red: `#DB5C5C`

### Spacing And Radii

Keep the current compact geometry:

- welcome quick tiles: `128 x 96`, radius `8`
- inspection widget: radius `6`, outer padding `3`
- toolbar icon buttons in diff view: `26 x 26`
- terminal permission options: radius `3`
- diff viewer popup: radius `16`
- diff viewer cards: radius `12`
- spec gutter width: `28`
- spec body horizontal padding: `12`

### Motion

Use the same restrained motion model as the CSS:

- fast: `0.18s`
- medium: `0.24s`
- slow: `0.42s`
- easing: soft cubic-bezier similar to `cubic-bezier(0.22, 1, 0.36, 1)`

Use motion only for:

- hover/pressed state changes
- opening menus or popups
- subtle state swaps between task versions or permission prompts
- terminal line streaming

## Frame Details

### F-01 Welcome / Default

Use the main IDE shell with the Project tool window open on the left and the welcome gradient content in the editor area.

#### Left Tool Window

Title: `Project`

Header actions:

- `more`
- `minimize`

Visible action rows:

- `New Agent Task`
- `New...`
- `Open...`
- `Clone...`
- `Remote Development...`

Search field placeholder:

- `Search recent projects`

Recent projects list:

1. `spring-petclinic` / `~/projects/spring-petclinic` / initials `SP`
2. `IntelliJ IDEA` / `Hint` / initials `II`
3. `calculator-unit-tests-java` / `Hint` / initials `CU`
4. `calculator-unit-tests-java` / `Hint` / initials `CU`

Keep the first project visually selected on click, with the standard active-row background.

#### Center Welcome Area

Header:

- `Welcome to IntelliJ IDEA`
- `Start in one click`

Quick-action grid: 3 columns, 6 tiles, in this order:

1. `New Agent Task`
2. `New Script`
3. `New Notebook`
4. `Import File`
5. `Learn`
6. `Plugins`

Segmented control:

- `Manual`
- `AI`
- default selected: `Manual`

Footer controls:

- `Theme: Dark`
- `Keymap: macOS`
- checkbox `Always show this page on startup` checked

#### F-01a Welcome / `New...` Menu Open

Open the `New...` context menu anchored to the `New...` action row.

Menu items:

- `New Project`
- separator
- `New Task`
- `New Script`
- separator
- `New Notebook`

#### Welcome Interactions

Prototype these clicks:

- recent project row -> F-02
- `New Project` -> F-02
- `New Agent Task` in left panel -> F-04
- `New Agent Task` tile in center grid -> F-04

### F-02 IDE / Default Workspace

Use the normalized PetClinic shell copy, but preserve the current layout and panel density.

Visible shell state:

- Project tool window open
- active editor tab `VisitController.java`
- status bar visible
- bottom panels closed
- left stripe visible
- right stripe visible

#### Editor Tab Content Expectations

You do not need to show every line of the source files, but the visible code should clearly signal these landmarks:

- `VisitController.java`
  - `@ModelAttribute("vets")`
  - `populateTimeSlots()`
  - `existsByVetIdAndDateAndTime(...)`
  - `DataIntegrityViolationException`
- `Visit.java`
  - `LocalDate date`
  - `LocalTime time`
  - `@ManyToOne Vet vet`
  - `@NotNull`
- `createOrUpdateVisitForm.html`
  - date input
  - vet `<select>`
  - time `<select>`
  - description textarea
  - submit button `Add Visit`
- `schema.sql`
  - `vet_id`
  - `visit_time`
  - `UNIQUE (vet_id, visit_date, visit_time)`

#### Notes

- Do not leave the shell project name as `payment-service`.
- Do not leave the run config as `Current File`.
- The Project tree root and breadcrumbs should already be normalized to `spring-petclinic` in Figma.

### F-03 Agent Tasks Panel

Replace the Project tool window with the Agent Tasks tool window.

Tool window title:

- `Agent Tasks`

Header actions:

- `add`
- `more`
- `minimize`

Tree structure:

- expandable folder row labeled `spring-petclinic`
- two task rows beneath it

Task rows:

1. `visit-booking.md` / time `2m`
2. `vet-schedules.md` / time `15m`

#### Required Row Variants

Create explicit variants for:

- default row
- selected row
- running row with loader
- warning row with warning icon
- success row with done icon

Behavior from the current implementation:

- selected rows do not show the trailing status icon
- the time label always stays at the far right
- success icons can be dismissed after the row is opened

Use these scenario mappings in the prototype:

- `visit-booking.md`: selected in the main flow
- `vet-schedules.md`: running variant in the main flow
- keep one extra example of warning and success row variants in the component set even if they are not the default visible state

### F-04 `visit-booking.md` / Done State / Version 1

This is the primary reproduction target.

Show the generated spec as a prose-like overlay inside the editor, not as a normal markdown editor.

#### Overlay Structure

- background `#191A1C`
- row gutter width `28`
- line height `22`
- body horizontal padding `12`
- heading rows minimum height `32`
- inspection widget pinned top-right

#### Toolbar State

Left side:

- markdown/agent-task context
- collapsed, read-only task text derived from the prompt/goal

Right side:

- `Run`
- `Enhance`

#### Inspection Widget

Show:

- version button `Version 1`
- warning count `3`
- error count `1`
- previous issue button
- next issue button

Do not show a comment count unless comments exist.

#### Serialized Source Copy For The Document

Use this exact content as the basis for the overlay rows:

```md
## Goal
Add vet assignment and time slot selection to the visit creation flow. When booking a visit, users pick a vet and a time slot for the chosen date. The system prevents double-booking (same vet, same date+time).

## Acceptance Criteria
- [ ] Visit form shows a dropdown of available vets for the selected date/time.
- [ ] Visit form includes a time slot picker (e.g. hourly slots 09:00-16:00).
- [ ] A vet cannot be booked for the same date+time twice (server-side validation).
- [ ] Vet and time are persisted with the visit.
- [ ] Existing visit display (owner details page) shows the assigned vet and time.
- [ ] All three DB schemas (H2, MySQL, PostgreSQL) and seed data are updated.

## Plan
- [ ] Schema changes - add vet_id (FK) and visit_time (TIME) to visits table
- [ ] Visit entity - add @ManyToOne vet and LocalTime time with @NotNull
- [ ] VisitRepository - add existsByVetIdAndDateAndTime for double-booking check
- [ ] VisitController - inject VetRepository, add @ModelAttribute("vets") with findAll()
- [ ] Form template - add <select> for vet and <select> for time slot
- [ ] Owner details - add Vet and Time columns to visit history table
- [ ] Tests - vet list in model, successful booking, double-booking rejected

## Implementation Notes
- Current Visit entity has only date (LocalDate) and description (String). No relationship to Vet.
- Visits persisted via cascade (Owner -> Pet -> Visit). No VisitRepository exists.
- VetRepository.findAll() is @Cacheable("vets"). Returns Collection<Vet>.
- Project uses Formatter<T> for form selects (see PetTypeFormatter).

## Tradeoffs

## Other
// Dynamic availability (AJAX) - not in prompt, out of scope
// Vet specialties matching - not in prompt, out of scope
```

#### Additional Rendering Rules

- Render the `Plan` heading with a trailing chip: `Configuration.md`.
- `Tradeoffs` must appear as an empty section header with no items.
- `Other` items should render as comment-style rows, not regular bullets.
- Keep the prose overlay in Inter, not JetBrains Mono.
- Preserve empty spacer rows between sections.

#### Embedded Micro-Interactions

The done overlay supports these micro-UI elements and they should exist in the component set even if not all are shown at once:

- per-line comment button
- comment count badge when comments exist
- selection toolbar with these actions:
  - `Suggest action`
  - `Comment`
  - `Bold`
  - `Italic`
  - `Strikethrough`
  - `Inline code`
  - `Insert link`
  - `List`
  - `More actions`

### F-04a `visit-booking.md` / Issue Intention Popup

Show the popup opened from an active issue row in the done overlay.

Use the warning-state popup for AC #1.

Primary actions:

- `Fix vet availability`
- `Open Problems`
- `Regenerate spec`

Secondary actions:

- `Clarify this requirement`
- `Attach reference file`
- `Move to Implementation Notes`

Footer:

- `Quick actions for the active issue.`
- `Esc to close`

Create one extra variant in the component set for a failed plan item popup where the fix label becomes `Add vet formatter` and the secondary actions are:

- `Rewrite this item`
- `Explain failure in notes`
- `Move to Tradeoffs`

### Inspection Data For F-04

The document above should be overlaid with these statuses.

#### Acceptance Criteria Statuses

1. **Warning**
   - highlight phrase: `available vets for the selected date/time`
   - issue label: `AC/Plan mismatch - AC says "available vets" but plan loads all vets`
   - issue secondary text: `Line 4`
   - checks:
     - passed `Pre-filter works on POST re-render` / chip `VisitController.java`
     - failed `Initial GET shows all vets - no date/time to filter`

2. **Warning**
   - highlight phrase: `e.g. hourly slots`
   - issue label: `Ambiguous AC - "e.g." makes time slot granularity untestable`
   - issue secondary text: `Line 5`
   - checks: none

3. **Passed**
   - `UNIQUE constraint in all 3 schema files` / chip `schema.sql`
   - `existsByVetIdAndDateAndTime check before save` / chip `VisitController.java`

4. **Passed**
   - `@ManyToOne vet persisted` / chip `Visit.java`
   - `LocalTime time persisted` / chip `Visit.java`

5. **Passed**
   - `Vet column in ownerDetails.html` / chip `ownerDetails.html`
   - `Time column in ownerDetails.html`

6. **Passed**
   - `H2, MySQL, PostgreSQL schemas updated` / chip `schema.sql`
   - `Seed data includes vet_id and visit_time` / chip `data.sql`

#### Plan Statuses

1. **Passed**
2. **Passed**
3. **Warning**
   - highlight phrase: `double-booking check`
   - issue label: `Possible race condition - check-then-act without DB constraint`
   - issue secondary text: `Line 10`
4. **Passed**
5. **Failed**
   - highlight phrase: `<select> for vet`
   - issue label: `Incomplete plan - missing VetFormatter, form POST will fail`
   - issue secondary text: `Line 12`
6. **Passed**
7. **Passed**

#### Visual Rules For Issue Rows

- issue rows receive an amber 22px highlight band
- issue gutter shows the intention bulb affordance
- active problem selection adds a neutral highlighted-row background on top of the standard row
- plan rows include a trailing button `Show diff`

### F-05 Terminal / Generate Permission

Open the bottom Terminal tool window and show the generate flow.

Command line:

- `agent run "visit-booking.md" --generate`

Output sequence:

1. `Reading visit-booking.md`
2. `Resolving referenced files...`
3. `Loading spring-petclinic context...`
4. `Generating visit-booking specification...`
5. `Processed 9 plan steps`

Then show the interactive permission prompt:

- question: `Allow agent execution?`
- options:
  - `Allow once`
  - `Allow for session`
  - `Reject`

Create continuation variants:

- **Allow once**
  - `Permission granted for this run`
  - `Starting agent execution...`
  - `Applying generated specification...`
  - `Run finished without issues`
- **Allow for session**
  - `Permission granted for this session`
  - `Starting agent execution...`
  - `Applying generated specification...`
  - `Run finished without issues`
- **Reject**
  - `Execution rejected`

#### Terminal Prompt Styling

Use the implemented terminal prompt style:

- stacked text rows
- selected option prefixed by `>`
- line height `18`
- hover/selected text becomes white
- subtle 3px rounded option highlight

### F-06 Terminal / Plan Success

Command line:

- `agent run "visit-booking.md" --section "Plan"`

Output sequence:

1. `Reading visit-booking.md`
2. `Resolving referenced files...`
3. `Loading spring-petclinic context...`
4. `Building execution plan...`
5. `Processed 9 plan steps`
6. `Run finished without issues`

This frame should show a completed terminal run without any prompt.

### F-07 Terminal / Acceptance Criteria Paused On AC #1

This is the canonical pause state for the AC warning.

Command line:

- `agent run "visit-booking.md" --section "Acceptance Criteria"`

Initial output:

1. `Reading visit-booking.md`
2. `Resolving referenced files...`
3. `Loading spring-petclinic context...`
4. `Running acceptance checks...`

Pause output:

- `AC #1 partially met. Pre-filtering works on POST re-renders (booked vets excluded via findByDateAndTime). But on initial page load, no date/time is selected - @RequestParam values are null - so all vets are shown. AC says "available vets for the selected date/time", implying always-filtered. Full filtering on date selection would require AJAX (out of scope). Suggest rewording AC.`

Then show the same three options:

- `Allow once`
- `Allow for session`
- `Reject`

Create continuation variants:

- **Allow once**
  - `> Allow once`
  - `Permission granted for this run`
  - `Continuing acceptance checks...`
  - `Processed 9 plan steps`
  - `Run finished without issues`
- **Allow for session**
  - `> Allow for session`
  - `Permission granted for this session`
  - `Continuing acceptance checks...`
  - `Processed 9 plan steps`
  - `Run finished without issues`
- **Reject**
  - `> Reject`
  - `Acceptance checks stopped after warning`

#### Important Clarification

The current implementation pauses the AC flow through the **terminal prompt**, not through a canonical full-width warning banner in the spec overlay.

Do not invent a top-of-editor warning banner as the primary representation of this state.

### F-08 `visit-booking.md` / AC #1 Fixed / Version 2

Show the post-fix, rerun-confirmed state after applying the quick fix for AC #1.

Replace AC #1 with:

- `Visit form shows a dropdown of vets, excluding those already booked for the selected date and time.`

Resolved checks:

- passed `Pre-filter on POST re-render` / chip `VisitController.java`
- passed `All vets shown on initial GET (expected)`

Additional changes for this frame:

- version button should now read `Version 2`
- warning count should drop from `3` to `2`
- error count remains `1`
- AC #1 no longer renders as a warning row after the rerun completes

If you include a version-history popup variant, it should show at least:

- `Version 1`
- `Version 2`

### F-09 `vet-schedules.md` / Static Task

Open the second task as a simpler markdown/spec frame.

Use this exact content:

```md
## Goal
Define the parallel Vet Schedules track that enables real availability checks for visit booking without blocking the initial visit-booking rollout.

## Acceptance Criteria
- [ ] Vets can have working schedules stored by day of week.
- [ ] Booking validation can reject slots outside a vet's working hours.
- [ ] Demo seed data includes at least one schedule per vet.
- [ ] Visit-booking can keep using static hourly slots while this task is in progress.

## Plan
- [ ] Add VetSchedule entity under the vet package
- [ ] Add repository queries by vet and date
- [ ] Validate requested visit_time against schedule windows
- [ ] Seed sample schedules in H2 data.sql
- [ ] Add tests for off-hours booking rejection

## Notes
- Parallel task from Beat 5 of the PetClinic demo scenario.
- Does not change the current visit-booking acceptance criteria yet.
```

Status rules for this task:

- all AC statuses passed
- all Plan statuses passed
- issue counts `0 warnings / 0 errors`

### F-10 Problems Tool Window / `visit-booking.md`

Show the Problems bottom panel when the active editor tab is `visit-booking.md`.

Root file row:

- label: `visit-booking.md`
- path: `~/projects/spring-petclinic/Agent Specifications`
- secondary suffix: `4 problems`

Child issues:

- warning `AC/Plan mismatch - AC says "available vets" but plan loads all vets` / `Line 4`
- warning `Ambiguous AC - "e.g." makes time slot granularity untestable` / `Line 5`
- warning `Possible race condition - check-then-act without DB constraint` / `Line 10`
- error `Incomplete plan - missing VetFormatter, form POST will fail` / `Line 12`

Interaction:

- clicking an issue highlights and scrolls the matching spec row in F-04

### F-11 Problems Tool Window / `VisitController.java`

Show the Problems bottom panel when the active editor tab is `VisitController.java`.

Root file row:

- label: `VisitController.java`
- path: `~/projects/spring-petclinic/src/main/java/org/springframework/samples/petclinic/owner`
- secondary suffix: `4 problems`

Child issues:

- warning `populateTimeSlots() rebuilds list on every request` / `Line 121`
- warning `@ModelAttribute("vets") loads all vets on GET - no pre-filtering` / `Line 95`
- error `DataIntegrityViolationException not caught - 500 on concurrent booking` / `Line 142`
- error `Missing VetFormatter - form binding will fail at runtime` / `Line 108`

If comment issues are shown anywhere in the component set, render them after real problems using the comment icon variant.

### F-12 `Diff VisitController.java`

Use the diff layout from `PlanDiffView.jsx`, but normalize all content to the PetClinic scenario.

#### Shell

- project name `spring-petclinic`
- branch `feature/visit-booking`
- run config `PetClinicApplication`
- tab title `Diff VisitController.java`
- status bar breadcrumbs should still end at `VisitController.java`

#### Toolbar

Preserve the current 40px dark diff toolbar with:

- compact icon buttons
- compare/select controls
- right-side meta label

Do not substitute a generic GitHub diff header.

#### Review Goal

This diff represents the optimization of `populateTimeSlots()` so the list is built once in the controller constructor.

Use this before/after logic:

```java
// before
@ModelAttribute("timeSlots")
public List<LocalTime> populateTimeSlots() {
    List<LocalTime> slots = new ArrayList<>();
    for (int hour = 9; hour <= 16; hour++) {
        slots.add(LocalTime.of(hour, 0));
    }
    return slots;
}

// after
private final List<LocalTime> timeSlots;

public VisitController(...) {
    this.timeSlots = IntStream.rangeClosed(9, 16)
        .mapToObj(hour -> LocalTime.of(hour, 0))
        .toList();
}

@ModelAttribute("timeSlots")
public List<LocalTime> populateTimeSlots() {
    return this.timeSlots;
}
```

#### Review Comment

Use this exact review line:

- `Time slots never change at runtime - build the list once in the constructor`

#### Diff Layout Rules

- use the implemented grid with a `106px` gutter area and a code column
- gutter contains old line number, new line number, and icon slot
- row types: context, removed, added, focus
- removed rows use muted red treatment
- added rows use muted green treatment
- focus row shows active numbers and visible gutter affordance
- inline comment badges reuse the comment popup language from the done overlay

#### Diff Viewer Popup

If you show the file/viewer popup, use real visit-booking plan items, not placeholder `aaaa` copy.

Good examples of plan items to list:

- `Schema changes - add vet_id (FK) and visit_time (TIME) to visits table`
- `Visit entity - add @ManyToOne vet and LocalTime time with @NotNull`
- `VisitRepository - add existsByVetIdAndDateAndTime for double-booking check`
- `VisitController - inject VetRepository, add @ModelAttribute("vets") with findAll()`
- `Form template - add <select> for vet and <select> for time slot`
- `Owner details - add Vet and Time columns to visit history table`
- `Tests - vet list in model, successful booking, double-booking rejected`

## Shared Components And Variants

Create reusable components for:

- main IDE shell
- main toolbar
- left stripe item
- tool window header
- project tree row
- welcome action row
- recent project row
- welcome quick tile
- segmented control
- editor tab
- markdown tab
- diff tab with custom icon
- agent task row
- inspection widget
- spec heading row
- spec paragraph/check/bullet/comment row
- line comment button and count badge
- selected-text toolbar
- issue intention popup
- terminal line: command/output/success/error
- terminal permission prompt
- problems file node
- problems warning/error/comment row
- diff row: context/removed/added/focus
- diff viewer popup and file rows

## Interaction Map

Prototype at least these interactions:

1. Welcome recent project -> F-02.
2. Welcome `New...` -> F-01a.
3. Left stripe `Agent Tasks` -> F-03.
4. Agent task `visit-booking.md` -> F-04.
5. Agent task `vet-schedules.md` -> F-09.
6. In F-04, click `Run` or open the matching run replay -> terminal states F-05, F-06, or F-07 depending on the demonstrated run.
7. In F-04, click an issue bulb -> F-04a.
8. In F-04, click `Show diff` on a plan row -> F-12.
9. In Problems panel F-10, click a problem -> corresponding spec line highlighted in F-04.
10. In Problems panel F-11, click a problem -> corresponding code/diff context highlighted.
11. In terminal F-05 or F-07, choose `Allow once`, `Allow for session`, or `Reject` -> corresponding continuation state.
12. In F-04a, apply `Fix vet availability` -> F-08.

## Fidelity Rules

- Reproduce current labels exactly after applying the canonical PetClinic copy normalization.
- Keep the UI dense, desktop-like, and slightly austere.
- Preserve the current panel docking model and shell hierarchy.
- Do not simplify the flows into a single linear storyboard.
- Do not replace engineering copy with polished product-marketing copy.
- Do not turn the spec overlay into a generic document editor.
- Do not use generic diff UI patterns when the current implementation already defines a denser one.
- Do not keep stale placeholders such as `payment-service`, `Current File`, or `aaaa` diff viewer items.

## Out Of Scope

- redesigning the product
- mobile or responsive variants
- inventing new features
- changing the scenario away from PetClinic visit booking
- creating a broad design system beyond what this prototype already uses
- replacing JetBrains-like conventions with generic SaaS patterns

## Acceptance Criteria For The Figma Output

The Figma result is acceptable if:

1. Every required frame in this spec exists as a clickable prototype state.
2. The shell reads as a JetBrains-like dark desktop IDE, not as a web dashboard.
3. The visible scenario copy is consistently normalized to `spring-petclinic` / `visit-booking` / `PetClinicApplication`.
4. `visit-booking.md` includes the exact Goal, 6 ACs, 7 Plan items, Implementation Notes, empty Tradeoffs section, and Other comments listed above.
5. The inspection system reflects `3 warnings / 1 error` in Version 1 and the specified issue text, line numbers, highlights, and checks.
6. The terminal flows reproduce the exact commands, pause prompts, and continuation strings listed above.
7. The Problems panel matches the two issue sets defined above for `visit-booking.md` and `VisitController.java`.
8. The diff view uses the VisitController time-slot optimization and the review comment `Time slots never change at runtime - build the list once in the constructor`.
9. Placeholder artifacts from the stale implementation are not visible in the Figma output.
10. A reviewer comparing the Figma file to the current prototype and `CONTENT.md` would recognize it as the same product, with stale shell copy corrected.
