# Spec: Replace the prototype's demo content with the Spring PetClinic SDD scenario

## Goal

Replace all placeholder data in the prototype (`aaaa`, `bbbb`, `payment-service`) with real content from the Spring PetClinic SDD demo scenario (`visit-booking`). The prototype should show the full SDD workflow: spec generation, inspections, execution with PAUSE on AC, and code review, using the example of adding visit booking to PetClinic.

## Content Source

Repository: `spring-petclinic-sdd`. Key files:

- `specs/jvm-scenario.md` — demo scenario (6 beats)
- `specs/prd.md` — PRD for the Visit Scheduling feature
- `specs/visit-booking-initial-prompt.md` — developer prompt
- `specs/visit-booking-v0.md` → `v1.md` → `v2.md` — spec evolution
- `specs/visit-booking-inspections.md` — 4 inspections with explanations
- `specs/visit-booking-beat-3-execution.md` — execution log, PAUSE on AC #1
- `specs/visit-booking-code-review-moment.md` — code review moment
- `specs/vet-schedules.md` — parallel task (Beat 5)

---

## Acceptance Criteria

1. The project name in the toolbar, status bar, and terminal is `spring-petclinic`, not `payment-service`.
2. The spec document (the `visit-booking.md` tab) contains content from `visit-booking-v0.md`: Goal, 6 ACs, 7 Plan steps, Implementation Notes, Out of scope.
3. Inspections (warnings/errors) match the 4 findings from `visit-booking-inspections.md`: Missing VetFormatter, Race condition, AC/Plan mismatch, Ambiguous AC.
4. AC Run Statuses reflect the execution log: ACs 2–6 passed, AC 1 is warning/PAUSE with a finding about the pre-filtering gap.
5. Plan Run Statuses: 9 steps, all passed, with deviations (Vet.toString, i18n, test fixes) logged.
6. The quick fix for AC #1 replaces the text with the rewording from v2: `vets, excluding those already booked for the selected date and time`.
7. The editor tabs show PetClinic files: `Visit.java`, `VisitController.java`, `createOrUpdateVisitForm.html`, `schema.sql`.
8. The project tree reflects the PetClinic structure: `src/main/java/…/owner/`, `…/vet/`, `src/main/resources/`.
9. The terminal output uses the commands `agent run "visit-booking.md"` and text matching the PetClinic context.
10. The second task in Agent Tasks is `vet-schedules.md` with status `running`.

## Plan

### Step 1. Project metadata — `src/App.jsx` (constants at the top of the file)

- [ ] `PROJECT_NAME` → `'spring-petclinic'`
- [ ] `BRANCH_NAME` → `'feature/visit-booking'`
- [ ] `RUN_CONFIG_NAME` → `'PetClinicApplication'`
- [ ] `PRIMARY_BREADCRUMBS` → `['spring-petclinic', 'src/main/java', 'VisitController.java']`
- [ ] `TERMINAL_TASK_TAB_BASE_LABEL` → `'visit-booking.md'`

### Step 2. Editor tabs and content — `src/App.jsx` (`MY_EDITOR_TABS`, `MY_EDITOR_TAB_CONTENTS`)

- [ ] Replace the tabs with:
  ```js
  { id: '1', label: 'VisitController.java',          icon: 'fileTypes/java', closable: true },
  { id: '2', label: 'Visit.java',                    icon: 'fileTypes/java', closable: true },
  { id: '3', label: 'createOrUpdateVisitForm.html',   icon: 'fileTypes/html', closable: true },
  { id: '4', label: 'schema.sql',                    icon: 'fileTypes/text', closable: true },
  ```
- [ ] Replace the tab contents with the corresponding PetClinic code:
  - Tab 1: `VisitController.java` — controller with `@ModelAttribute("vets")`, `processNewVisitForm`, double-booking check, `DataIntegrityViolationException` catch.
  - Tab 2: `Visit.java` — entity with fields `@ManyToOne Vet vet`, `LocalTime time`, `@NotNull`.
  - Tab 3: `createOrUpdateVisitForm.html` — Thymeleaf form with `<select>` for vet and time.
  - Tab 4: `schema.sql` — H2 schema with `vet_id`, `visit_time`, `UNIQUE(vet_id, visit_date, visit_time)`.

### Step 3. Project tree — `src/App.jsx` (file tree)

- [ ] Replace the tree with the PetClinic structure:
  ```
  spring-petclinic/
    src/main/java/…/petclinic/
      owner/
        Visit.java
        VisitController.java
        VisitRepository.java
        Owner.java
        Pet.java
        PetTypeFormatter.java
      vet/
        Vet.java
        VetRepository.java
        VetFormatter.java
        VetSchedule.java
      model/
        BaseEntity.java
        Person.java
    src/main/resources/
      templates/pets/createOrUpdateVisitForm.html
      templates/owners/ownerDetails.html
      db/h2/schema.sql
      db/h2/data.sql
      application.properties
    src/test/java/…/
      VisitControllerTests.java
      ClinicServiceTests.java
  ```

### Step 4. Spec Document — `src/App.jsx` (`createSpecDocument()`, around lines 2118–2178)

- [ ] Replace the contents with `visit-booking-v0`:

  **Goal section** (`type: 'paragraph'`):
  `Add vet assignment and time slot selection to the visit creation flow. When booking a visit, users pick a vet and a time slot for the chosen date. The system prevents double-booking (same vet, same date+time).`

  **Acceptance Criteria** (6 items, `type: 'check', kind: 'ac'`):
  1. `Visit form shows a dropdown of available vets for the selected date/time.`
  2. `Visit form includes a time slot picker (e.g. hourly slots 09:00–16:00).`
  3. `A vet cannot be booked for the same date+time twice (server-side validation).`
  4. `Vet and time are persisted with the visit.`
  5. `Existing visit display (owner details page) shows the assigned vet and time.`
  6. `All three DB schemas (H2, MySQL, PostgreSQL) and seed data are updated.`

  **Plan** (7 items, `type: 'check', kind: 'plan'`):
  1. `Schema changes — add vet_id (FK) and visit_time (TIME) to visits table`
  2. `Visit entity — add @ManyToOne vet and LocalTime time with @NotNull`
  3. `VisitRepository — add existsByVetIdAndDateAndTime for double-booking check`
  4. `VisitController — inject VetRepository, add @ModelAttribute("vets") with findAll()`
  5. `Form template — add <select> for vet and <select> for time slot`
  6. `Owner details — add Vet and Time columns to visit history table`
  7. `Tests — vet list in model, successful booking, double-booking rejected`

  **Implementation Notes** (`type: 'bullet'`):
  - `Current Visit entity has only date (LocalDate) and description (String). No relationship to Vet.`
  - `Visits persisted via cascade (Owner → Pet → Visit). No VisitRepository exists.`
  - `VetRepository.findAll() is @Cacheable("vets"). Returns Collection<Vet>.`
  - `Project uses Formatter<T> for form selects (see PetTypeFormatter).`

  **Tradeoffs**: leave empty (it will be filled after inspections).

  **Other** (`type: 'comment'`):
  - `Dynamic availability (AJAX) — not in prompt, out of scope`
  - `Vet specialties matching — not in prompt, out of scope`

### Step 5. Inspections — `src/App.jsx`

#### 5a. AC inspections (`AC_RUN_STATUSES`, around lines 659–709)

- [ ] AC #0 (index 0): **warning** / PAUSE
  - `status: 'warning'`
  - `highlight: { match: 'available vets for the selected date/time', className: 'spec-inline-warning-highlight' }`
  - `issue: { severity: 'warning', label: 'AC/Plan mismatch — AC says "available vets" but plan loads all vets', secondaryText: 'Line 4' }`
  - `checks`:
    - `{ status: 'passed', text: 'Pre-filter works on POST re-render', chip: 'VisitController.java' }`
    - `{ status: 'failed', text: 'Initial GET shows all vets — no date/time to filter', chip: null }`
  - Quick fix (`ISSUE_QUICK_FIX_CONFIG.ac[0]`):
    - `replacementText: 'Visit form shows a dropdown of vets, excluding those already booked for the selected date and time.'`
    - `resolvedStatus: { status: 'passed', checks: [{ status: 'passed', text: 'Pre-filter on POST re-render', chip: 'VisitController.java' }, { status: 'passed', text: 'All vets shown on initial GET (expected)', chip: null }] }`

- [ ] AC #1 (index 1): **warning**
  - `issue: { severity: 'warning', label: 'Ambiguous AC — "e.g." makes time slot granularity untestable', secondaryText: 'Line 5' }`
  - `highlight: { match: 'e.g. hourly slots', className: 'spec-inline-warning-highlight' }`
  - Quick fix: `replacementText: 'Visit form includes a time slot picker with hourly slots from 09:00 to 16:00 (last bookable slot). Slot range is configurable.'`

- [ ] AC #2 (index 2): **passed** — `checks: [{ status: 'passed', text: 'UNIQUE constraint in all 3 schema files', chip: 'schema.sql' }, { status: 'passed', text: 'existsByVetIdAndDateAndTime check before save', chip: 'VisitController.java' }]`

- [ ] AC #3 (index 3): **passed** — `checks: [{ status: 'passed', text: '@ManyToOne vet persisted', chip: 'Visit.java' }, { status: 'passed', text: 'LocalTime time persisted', chip: 'Visit.java' }]`

- [ ] AC #4 (index 4): **passed** — `checks: [{ status: 'passed', text: 'Vet column in ownerDetails.html', chip: 'ownerDetails.html' }, { status: 'passed', text: 'Time column in ownerDetails.html', chip: null }]`

- [ ] AC #5 (index 5): **passed** — `checks: [{ status: 'passed', text: 'H2, MySQL, PostgreSQL schemas updated', chip: 'schema.sql' }, { status: 'passed', text: 'Seed data includes vet_id and visit_time', chip: 'data.sql' }]`

#### 5b. Plan inspections (`PLAN_RUN_STATUSES`, around lines 711–739)

- [ ] Plan #2 (index 2): **warning**
  - `issue: { severity: 'warning', label: 'Possible race condition — check-then-act without DB constraint', secondaryText: 'Line 10' }`
  - `highlight: { match: 'double-booking check', className: 'spec-inline-warning-highlight' }`
  - Quick fix: `replacementText: 'VisitRepository — add double-booking query + UNIQUE(vet_id, visit_date, visit_time) constraint'`

- [ ] Plan #4 (index 4): **error**
  - `issue: { severity: 'error', label: 'Incomplete plan — missing VetFormatter, form POST will fail', secondaryText: 'Line 12' }`
  - `highlight: { match: '<select> for vet', className: 'spec-inline-error-highlight' }`
  - Quick fix: `replacementText: 'Form template — add <select> for vet with VetFormatter (per PetTypeFormatter pattern) and time slot'`

- [ ] All other plan steps: `{ status: 'passed' }`

#### 5c. Problems panel data (around lines 1355–1405)

- [ ] Update `PROBLEMS_PER_TAB` (or equivalent) for the `visit-booking.md` tab:
  ```js
  { severity: 'warning', label: 'AC/Plan mismatch — AC says "available vets" but plan loads all vets', secondaryText: 'Line 4' },
  { severity: 'warning', label: 'Ambiguous AC — "e.g." makes time slot granularity untestable', secondaryText: 'Line 5' },
  { severity: 'warning', label: 'Possible race condition — check-then-act without DB constraint', secondaryText: 'Line 10' },
  { severity: 'error',   label: 'Incomplete plan — missing VetFormatter, form POST will fail', secondaryText: 'Line 12' },
  ```

- [ ] Update the problems for `VisitController.java`:
  ```js
  { severity: 'warning', label: 'populateTimeSlots() rebuilds list on every request', secondaryText: 'Line 121' },
  { severity: 'warning', label: '@ModelAttribute("vets") loads all vets on GET — no pre-filtering', secondaryText: 'Line 95' },
  { severity: 'error',   label: 'DataIntegrityViolationException not caught — 500 on concurrent booking', secondaryText: 'Line 142' },
  { severity: 'error',   label: 'Missing VetFormatter — form binding will fail at runtime', secondaryText: 'Line 108' },
  ```

### Step 6. AC Warning Banner — `src/App.jsx`

- [ ] Text for the PAUSE banner on the AC #1 warning:
  > AC #1 partially met. POST re-renders filter booked vets, but initial load shows all vets because date/time are empty. Fully filtering by selected date/time would require AJAX, so the AC wording should be adjusted.

### Step 7. Terminal output — `src/App.jsx` (`buildTerminalRunSequence` and context strings)

- [ ] `'payment-service'` → `'spring-petclinic'` in all terminal output strings
- [ ] Generate command: `agent run "visit-booking.md" --generate`
- [ ] Section run: `agent run "visit-booking.md" --section "Plan"` / `--section "Acceptance Criteria"`
- [ ] Context loading: `Loading spring-petclinic context...`
- [ ] Success: `Processed 9 plan steps` (instead of 4 task nodes)

### Step 8. Agent Tasks — `src/App.jsx` (`AGENT_TASKS`, around lines 5281–5286)

- [ ] Replace with:
  ```js
  const AGENT_TASKS = [
    { id: 't1', label: 'visit-booking.md',   time: '2m',  status: null },
    { id: 't2', label: 'vet-schedules.md',   time: '15m', status: 'running' },
  ];
  ```

### Step 9. Code Review diff (optional) — `src/App.jsx` or `src/PlanDiffView.jsx`

- [ ] If the diff tab supports arbitrary content: add a preset for `VisitController.java` step 5:
  - Before: `populateTimeSlots()` creates `List<LocalTime>` on every call
  - After: `List<LocalTime> timeSlots` is created in the constructor, `populateTimeSlots()` returns `this.timeSlots`
  - Review comment: `Time slots never change at runtime — build the list once in the constructor`

### Step 10. Status bar — `src/App.jsx`

- [ ] Breadcrumbs: `['spring-petclinic', 'src/main/java', 'VisitController.java']`

---

## Implementation Notes

**All data is hardcoded in `App.jsx`.** Replacing the content means replacing JS constant values and function bodies. There is no API.

**`createSpecDocument()`** (around lines 2118–2178): returns `[ { id, title, items: [{ id, type, text, checked? }] } ]`. Item types: `paragraph`, `check`, `bullet`, `comment`.

**`serializeSpecDocument()`** (around lines 2180–2198): `## Title\n- [ ] check\n- bullet\n// comment`.

**`AC_RUN_STATUSES`** (around lines 659–709): `[{ status: 'passed'|'warning'|'failed'|'skipped', checks: [{ status, text, chip }], highlight?, issue? }]`.

**`PLAN_RUN_STATUSES`** (around lines 711–739): same structure.

**`ISSUE_QUICK_FIX_CONFIG`** (around lines 741–780): `{ ac: { [index]: { replacementText, resolvedStatus } }, plan: { [index]: ... } }`.

**Problems panel** (around lines 1355–1405): `[{ severity: 'warning'|'error', label, secondaryText }]` bound to tabs.

**Terminal**: `buildTerminalRunSequence()` returns `{ initialLines: [{ type, text }], permissionPrompt? }`.
