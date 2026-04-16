# Figma Reproduction Spec: IDE Prototype Flows

## Purpose

Create a faithful Figma reconstruction of the current desktop prototype and its interaction logic.

This is not a redesign. The goal is to reproduce the existing UX, visual density, layout behavior, content, and state transitions as a clickable Figma prototype.

Use the current repository implementation as the source of truth, especially:

- `src/App.jsx`
- `src/App.css`
- `src/WelcomeScreen.jsx`
- `src/WelcomeScreen.css`
- `src/PlanDiffView.jsx`
- `src/PlanDiffPage.jsx`

If any detail is ambiguous, prefer matching the current prototype rather than inventing a cleaner or more generic solution.

## Deliverables

Produce a Figma page with:

1. A reusable component set for the shared IDE shell.
2. A second component set for agent-task-specific overlays and terminal states.
3. Clickable frames for the main flows listed below.
4. Shared text styles, color styles, and spacing tokens.
5. Prototype links between frames for primary interactions.

Target a desktop-only experience. Do not design mobile layouts.

## Overall Product Framing

This prototype is a JetBrains-like dark IDE shell with a built-in "Agent Tasks" workflow.

The narrative context is:

- Project: `spring-petclinic`
- Branch: `feature/visit-booking`
- Run configuration: `PetClinicApplication`
- Main agent task: `visit-booking.md`
- Secondary task: `vet-schedules.md`

The core experience combines:

- a welcome screen
- a main IDE workspace
- an Agent Tasks side panel
- an agent-task markdown workflow
- terminal-run simulations
- inspection/problem highlighting
- a code-review diff flow

## Visual Direction

### General

- Dark, dense, desktop IDE UI.
- Strong JetBrains desktop-app feel, not SaaS.
- Tight spacing, small typography, compact controls.
- High information density with restrained contrast.

### Typography

- UI text: Inter or a close equivalent.
- Code and technical labels: JetBrains Mono or a close equivalent.
- Avoid large marketing typography.

### Color / Mood

- Base app background is near-black charcoal.
- Editor overlays sit on `#191A1C`-like surfaces.
- Neutral cards are in the `#212326` to `#2B2D30` range.
- Warnings use a brown/gold family, especially for the AC warning banner.
- Success states are muted green, not bright neon.
- Welcome screen uses soft radial gradients over a dark base.

### Motion

- Keep transitions subtle and desktop-like.
- Use short fades and state swaps, roughly 180-240ms.
- Avoid playful motion.

## Primary Frames To Build

Create at least these frames.

### 1. Welcome Screen

State:

- Main window frame in dark theme.
- Left tool window titled `Project`.
- Center editor area replaced by a gradient welcome surface.

Visible content:

- Left action list:
  - `New Agent Task`
  - `New...`
  - `Open...`
  - `Clone...`
  - `Remote Development...`
- Search input: `Search recent projects`
- Recent projects list:
  - `MyProject`
  - `IntelliJ IDEA`
  - `calculator-unit-tests-java`
  - `calculator-unit-tests-java`
- Center title:
  - `Welcome to IntelliJ IDEA`
  - `Start in one click`
- Quick action tiles:
  - `New Script`
  - `New Notebook`
  - `Import File`
  - `Learn`
  - `Plugins`
- Segmented control:
  - `Manual`
  - `AI`
- Footer controls:
  - `Theme: Dark`
  - `Keymap: macOS`
  - checkbox `Always show this page on startup`

Behavior:

- Clicking a recent project or `New Project` transitions into the IDE.
- Clicking `New Agent Task` opens a new agent-task tab in the IDE.

### 2. IDE Default Workspace

State:

- Main IDE shell after entering the project.
- Left stripe visible.
- Project tree visible.
- Editor tabs visible.
- Status bar visible.

Global metadata:

- Project: `spring-petclinic`
- Branch: `feature/visit-booking`
- Run config: `PetClinicApplication`
- Breadcrumbs:
  - `spring-petclinic`
  - `src/main/java`
  - `VisitController.java`

Editor tabs:

- `VisitController.java`
- `Visit.java`
- `createOrUpdateVisitForm.html`
- `schema.sql`

Project tree:

- `spring-petclinic/`
  - `src/main/java`
    - `owner`
      - `Visit.java`
      - `VisitController.java`
      - `VisitRepository.java`
      - `Owner.java`
      - `Pet.java`
      - `PetTypeFormatter.java`
    - `vet`
      - `Vet.java`
      - `VetRepository.java`
      - `VetFormatter.java`
      - `VetSchedule.java`
    - `model`
      - `BaseEntity.java`
      - `Person.java`
  - `src/main/resources`
    - `templates/pets/createOrUpdateVisitForm.html`
    - `templates/owners/ownerDetails.html`
    - `db/h2/schema.sql`
    - `db/h2/data.sql`
    - `application.properties`
  - `src/test/java`
    - `VisitControllerTests.java`
    - `ClinicServiceTests.java`
  - `Agent Specifications`
    - `visit-booking.md`
    - `vet-schedules.md`

### 3. Agent Tasks Panel

State:

- Left tool window titled `Agent Tasks`.
- Project-level expandable row with label `spring-petclinic`.

Task rows:

- `visit-booking.md`, time `2m`
- `vet-schedules.md`, time `15m`, status `running`

Important row states:

- default
- selected
- running with loader
- done with green done icon
- warning with warning icon

Interaction:

- Clicking `visit-booking.md` opens the interactive agent-task spec tab.
- Clicking `vet-schedules.md` opens a static markdown tab.

### 4. visit-booking Agent Task: Done State

This is the most important frame.

It should show the generated markdown content as a prose overlay inside the editor, not as a raw code editor.

Top bar state:

- Left:
  - agent-task icon
  - collapsed read-only task title derived from the Goal text
- Right:
  - `Run`
  - `Enhance`

Top-right inspection widget:

- `Version 1`
- warning/error counters
- previous/next issue navigation buttons

Markdown content:

#### Goal

Render this paragraph as two visual lines:

`Add vet assignment and time slot selection to the visit creation flow.`

`When booking, users pick a vet and a time slot for the chosen date. The system prevents double-booking (same vet, same date+time).`

#### Acceptance Criteria

- `Visit form shows a dropdown of available vets for the selected date/time.`
- `Visit form includes a time slot picker (e.g. hourly slots 09:00-16:00).`
- `A vet cannot be booked for the same date+time twice (server-side validation).`
- `Vet and time are persisted with the visit.`
- `Existing visit display (owner details page) shows the assigned vet and time.`
- `All three DB schemas (H2, MySQL, PostgreSQL) and seed data are updated.`

#### Plan

- `Schema changes - add vet_id (FK) and visit_time (TIME) to visits table`
- `Visit entity - add @ManyToOne vet and LocalTime time with @NotNull`
- `VisitRepository - add existsByVetIdAndDateAndTime for double-booking check`
- `VisitController - inject VetRepository, add @ModelAttribute("vets") with findAll()`
- `Form template - add <select> for vet and <select> for time slot`
- `Owner details - add Vet and Time columns to visit history table`
- `Tests - vet list in model, successful booking, double-booking rejected`

#### Implementation Notes

- `Current Visit entity has only date (LocalDate) and description (String). No relationship to Vet.`
- `Visits persisted via cascade (Owner -> Pet -> Visit). No VisitRepository exists.`
- `VetRepository.findAll() is @Cacheable("vets"). Returns Collection<Vet>.`
- `Project uses Formatter<T> for form selects (see PetTypeFormatter).`

#### Tradeoffs

- Empty section header with no items.

#### Other

- `Dynamic availability (AJAX) - not in prompt, out of scope`
- `Vet specialties matching - not in prompt, out of scope`

### 5. visit-booking Agent Task: Inspection State

Overlay the generated document with per-line status logic.

Acceptance Criteria statuses:

1. Warning
   - highlight phrase: `available vets for the selected date/time`
   - issue label: `AC/Plan mismatch - AC says "available vets" but plan loads all vets`
   - checks:
     - passed `Pre-filter works on POST re-render`
     - failed `Initial GET shows all vets - no date/time to filter`

2. Warning
   - highlight phrase: `e.g. hourly slots`
   - issue label: `Ambiguous AC - "e.g." makes time slot granularity untestable`

3. Passed
   - checks:
     - `UNIQUE constraint in all 3 schema files`
     - `existsByVetIdAndDateAndTime check before save`

4. Passed
   - checks:
     - `@ManyToOne vet persisted`
     - `LocalTime time persisted`

5. Passed
   - checks:
     - `Vet column in ownerDetails.html`
     - `Time column in ownerDetails.html`

6. Passed
   - checks:
     - `H2, MySQL, PostgreSQL schemas updated`
     - `Seed data includes vet_id and visit_time`

Plan statuses:

1. Passed
2. Passed
3. Warning
   - highlight phrase: `double-booking check`
   - issue label: `Possible race condition - check-then-act without DB constraint`
4. Passed
5. Failed
   - highlight phrase: `<select> for vet`
   - issue label: `Incomplete plan - missing VetFormatter, form POST will fail`
6. Passed
7. Passed

### 6. AC Warning Banner State

Create a variant of the done-state frame with a full-width warning banner at the top.

Banner text:

`AC #1 partially met. POST re-renders filter booked vets, but initial load shows all vets because date/time are empty. Fully filtering by selected date/time would require AJAX, so AC wording should be adjusted.`

Banner actions:

- `Allow once`
- `Allow for session`
- `Reject`

Style:

- Brown warning background
- thin top and bottom borders
- compact desktop banner height

### 7. Terminal Flow: Generate / Plan / Acceptance Criteria

Create dedicated frames for the bottom terminal panel in these states.

#### Generate run

Command:

- `agent run "visit-booking.md" --generate`

Output sequence:

- `Reading visit-booking.md`
- `Resolving referenced files...`
- `Loading spring-petclinic context...`
- `Generating visit-booking specification...`
- `Processed 9 plan steps`

Then show a terminal permission prompt with:

- question `Allow agent execution?`
- options:
  - `Allow once`
  - `Allow for session`
  - `Reject`

#### Plan run

Command:

- `agent run "visit-booking.md" --section "Plan"`

Output sequence:

- `Reading visit-booking.md`
- `Resolving referenced files...`
- `Loading spring-petclinic context...`
- `Building execution plan...`
- `Processed 9 plan steps`
- `Run finished without issues`

#### Acceptance Criteria run

Command:

- `agent run "visit-booking.md" --section "Acceptance Criteria"`

Output sequence:

- `Reading visit-booking.md`
- `Resolving referenced files...`
- `Loading spring-petclinic context...`
- `Running acceptance checks...`

Then pause on the AC warning state and show the banner/permission continuation behavior.

### 8. Problems Panel

Build the Problems bottom panel for two contexts.

#### Problems for visit-booking.md

- warning `AC/Plan mismatch - AC says "available vets" but plan loads all vets` / `Line 4`
- warning `Ambiguous AC - "e.g." makes time slot granularity untestable` / `Line 5`
- warning `Possible race condition - check-then-act without DB constraint` / `Line 10`
- error `Incomplete plan - missing VetFormatter, form POST will fail` / `Line 12`

#### Problems for VisitController.java

- warning `populateTimeSlots() rebuilds list on every request` / `Line 121`
- warning `@ModelAttribute("vets") loads all vets on GET - no pre-filtering` / `Line 95`
- error `DataIntegrityViolationException not caught - 500 on concurrent booking` / `Line 142`
- error `Missing VetFormatter - form binding will fail at runtime` / `Line 108`

Interaction:

- Selecting a problem highlights the corresponding row in the spec overlay.

### 9. visit-booking Quick-Fix / Enhanced State

Create at least one frame showing the post-fix state after applying the quick fix to AC #1.

Replace AC #1 with:

`Visit form shows a dropdown of vets, excluding those already booked for the selected date and time.`

Resolved checks:

- passed `Pre-filter on POST re-render`
- passed `All vets shown on initial GET (expected)`

### 10. vet-schedules.md Static Task Frame

Build a simpler markdown tab for the second task.

Content:

#### Goal

`Define the parallel Vet Schedules track that enables real availability checks for visit booking without blocking the initial visit-booking rollout.`

#### Acceptance Criteria

- `Vets can have working schedules stored by day of week.`
- `Booking validation can reject slots outside a vet's working hours.`
- `Demo seed data includes at least one schedule per vet.`
- `Visit-booking can keep using static hourly slots while this task is in progress.`

#### Plan

- `Add VetSchedule entity under the vet package`
- `Add repository queries by vet and date`
- `Validate requested visit_time against schedule windows`
- `Seed sample schedules in H2 data.sql`
- `Add tests for off-hours booking rejection`

#### Notes

- `Parallel task from Beat 5 of the PetClinic demo scenario.`
- `Does not change the current visit-booking acceptance criteria yet.`

### 11. Code Review Diff View

Build a dedicated diff frame for `VisitController.java`.

Title:

- `Diff VisitController.java`

Core review idea:

- before: `populateTimeSlots()` creates a new list every request
- after: time slots are precomputed once in the constructor and `populateTimeSlots()` returns `this.timeSlots`

Review comment to display:

- `Time slots never change at runtime - build the list once in the constructor`

The diff should include:

- context rows
- removed rows
- added rows
- line numbers
- subtle gutter styling
- focus row state
- inline comment affordance

## Shared Component Requirements

Create reusable components and variants for:

- main IDE shell
- top toolbar
- editor tab
- left stripe item
- tool window
- project tree row
- agent task row
- terminal line
- terminal permission prompt
- markdown spec row
- AC / Plan status row
- inspection widget
- warning banner
- comment badge and comment popup
- inline selection toolbar
- diff row: context / removed / added / focus

## Interaction Map

Prototype these interactions at minimum:

1. Welcome screen -> IDE.
2. Open Agent Tasks panel.
3. Click `visit-booking.md` -> open done-state agent task.
4. Click `vet-schedules.md` -> open static task tab.
5. Click `Run` in `visit-booking.md` -> terminal run flow.
6. Terminal permission prompt -> show continuation state.
7. AC warning banner -> show allow/reject branch.
8. Click a problem -> corresponding spec line highlighted.
9. Click plan issue -> open diff frame.
10. Apply quick fix for AC #1 -> show resolved frame.

## Layout / Sizing Guidance

Use desktop artboards.

Recommended frame baselines:

- Welcome: around 1100x800 content area
- IDE: around 1440x900 or equivalent desktop frame
- Keep left and bottom panels as docked tool windows
- Preserve dense IDE spacing; do not inflate controls for presentation

## Fidelity Rules

- Reproduce current text labels exactly.
- Preserve the dark JetBrains-like visual language.
- Keep the interface intentionally utilitarian.
- Do not simplify the flows into a single polished storyboard.
- Do not replace engineering-oriented copy with marketing copy.
- Do not redesign icons unless necessary; use close neutral placeholders where exact icons are unavailable.

## Out of Scope

- Reimagining the product
- Responsive/mobile adaptations
- New feature ideas
- Changing content from `spring-petclinic` to another scenario
- Creating a design system broader than what this prototype already implies

## Acceptance Criteria For The Figma Output

The Figma result is acceptable if:

1. The main flows above are all present as clickable frames.
2. `spring-petclinic` / `visit-booking` content is used consistently.
3. The agent-task done overlay, terminal prompt, AC warning banner, Problems panel, and diff view are all represented.
4. The UI still reads as a dense desktop IDE, not a generic app mock.
5. A reviewer can compare the Figma output to the current prototype and clearly recognize it as the same product.
