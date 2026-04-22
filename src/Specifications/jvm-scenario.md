# JVM Demo Scenario

## Beat 1 — Project Setup & Spec Generation

Developer shows the project.

> "We'll be using a well-known Spring template: PetClinic. Right now visits in Pet Clinic are just a date + description attached to a pet. There's no concept of appointment time, no vet assignment, and no way to manage visit lifecycle. We want to turn this into a proper scheduling system — owners book a specific vet at a specific time, the system prevents conflicts, and everyone can see what's coming up. Look, I even have a PRD for it."

Developer shows a YouTrack ticket with contents of `prd.md`.

> "But I won't be feeding it all to the agent, we'll do it in smaller chunks."

Developer opens context menu: **File → New → New Task for Agent** (shortcut visible). An empty `.md` file opens with an inline prompt area at the top.

Developer writes prompt using autocomplete (and maybe even mentioning YT issue with `@`?).

**Enter** — spec content streams below the prompt.

The prompt area collapses but remains accessible — visually distinct from the spec. Clear affordance: this was the input; the spec below is what matters now. The prompt won't be included in the agent context.

The resulting spec is already alive: code references highlighted, md affordances rendered, etc.

In a special task view, `visit-booking.md` appears. There is also another spec there, marked as running.

The developer expands the prompt area — it's clear he can retype it, and the spec will be regenerated when he hits Enter. No need to create a new file for a new prompt.

> "If I don't like what came out, I can go back to the prompt and regenerate the whole spec — same file, fresh start. But this looks reasonable, so let's see what's missing."

He minimises the prompt back.

---

## Beat 2 — Spec Inspections

> "I could hit Play right now — nothing stops me. But IDE shows some issues with spec. This spec was generated from a pretty vague prompt, so let's see what the IDE caught."

### Inspection 1: AC/Plan mismatch (AC #1)

On AC #1: **AC/Plan mismatch** — AC says "available vets" but plan loads all vets via `findAll()`.

IDE suggests options:
- Filter the dropdown and exclude booked vets
- Show all, validate on submit, catch conflicts at booking time
- Text field

Developer picks **"Filter the dropdown and exclude booked vets"**.

> "The AC and the plan disagree. Both prevent double-booking, just different UX. I want the dropdown to be smart — the agent will figure out the wiring."

### Inspection 2: Ambiguous AC (AC #2)

On AC #2: **Ambiguous AC.**

IDE suggests an input field, maybe with hint like "specify time slot details".

Developer types: *Fixed hourly slots from 09:00 to 16:00. Use `<select>` with predefined options. Last bookable slot is 16:00. Slot range configurable.*

Comment appears inline. Readiness bar: "Pending regeneration".

> "This is not something the IDE can guess, so I'm leaving a comment here. But I fully agree that *e.g.* in acceptance criteria is unacceptable!"

### Inspection 3: Race condition (Plan Step 3)

On Plan Step 3: **Possible race condition.** App-level check-then-act without a DB constraint.

IDE suggests options:
- Add UNIQUE constraint to schema
- App-level check is sufficient
- Decide yourself

Developer picks **"Decide yourself."**

> "The decision here depends on the scale of the project. I'll let the agent decide and review the reasoning later."

### Inspection 4: Incomplete plan (Plan Step 5)

Plan Step 5: **Incomplete plan.** This project uses `Formatter<T>` to bind form selects to entities (see `PetTypeFormatter`). Plan adds a `<select>` for Vet but no `VetFormatter`. Form POST will fail.

Suggestion appears as ghost text: *"Add VetFormatter step (following PetTypeFormatter pattern)"*

Developer accepts the completion. New step appears in the plan.

> "The spec generator didn't see `PetTypeFormatter`. The agent would probably hit this during implementation and self-correct itself, but why waste time on something the IDE catches almost instantly?"

### Regeneration

Spec shows that regeneration is required.

Developer opens Play dropdown, picks **"Refresh spec"**. Spec regenerates. AC #2 is now concrete. AC #3 now reads "server-side validation + database unique constraint" — the agent chose to add both. Plan has new steps: VetFormatter, config properties, pre-filter logic. A Decisions section appears with the agent's reasoning about dual-layer double-booking prevention.

### Manual edit

The developer reads the regenerated AC #2:

> *Visit form includes a time slot picker with hourly slots from 09:00 to 16:00 (last bookable slot). Slot range is configurable via application.properties.*

He deletes "via application.properties." — this is implementation detail, not acceptance criteria. The configurability stays in the plan.

> "The agent took my comment and ran with it — put configurability in both the AC and the plan. But `application.properties` doesn't belong in acceptance criteria. This is just a file — I edit it like any other."

### Final diff

Developer opens diff — standard IDE local history diff.

> "I haven't generated a single line of code, but we caught a runtime error, a race condition, and two ambiguities in my own intent. I delegated one decision, and the agent made the right call. Look at where we started and where we are now."

---

## Beat 3 — Execution (Loop Mode)

> "By default, for this task IDE configures the execution as a simple loop — run until all acceptance criteria pass, max three cycles. It's up to the agent how to validate each AC."

The developer navigates to the definition of this execution mode string, and we see that this is just an md file in the IDE configuration!

> "This is just text in the spec — I could run it from a terminal and get the same result. But the IDE suggests validated defaults so I wouldn't have to generate all that, enforces the hooks, and maps execution to the plan in real time. This is a small task, so I'm ok with Ralphing it. Let's go back."

Developer goes back, hits **Play**.

Agent log opens at the bottom — like a terminal/build output. Raw execution streams there: step completion and test results. In the task view, `visit-booking.md` changes from gray to a spinner. The other spec is still marked as running.

In the spec, steps update live: checkboxes fill in, gutter icons change, inline references to diffs appear. Agent log shows smaller, on-the-fly adaptations as the agent works through the plan:

- *"Added Vet.toString() — not in plan, required by selectField Thymeleaf fragment."*
- *"Added i18n keys to all 8 locale files — required by I18nPropertiesSyncTest."*
- *"Fixed ClinicServiceTests.shouldAddNewVisitForPet — @NotNull on new fields broke existing test."*

All 9 steps complete. Agent moves to AC verification.

> "We could specify more verification information for each AC — but we didn't, so the agent verifies acceptance criteria itself, to its best knowledge — reads the spec, looks at the code, and makes a judgment call."

AC status appears: AC 1 ⚠️ · AC 2 ✅ · AC 3 ✅ · AC 4 ✅ · AC 5 ✅ · AC 6 ✅.

Loop pauses. IDE sends a notification. In the task view, the spinner on `visit-booking.md` changes to a yellow pause icon. In the agent log: *"Paused — AC 1 requires spec update."* It's clickable.

AC 1 in the spec lights up with the agent's finding:

> AC 1 partially met. Pre-filtering works on POST re-renders (booked vets excluded via `findByDateAndTime`). But on initial page load, no date/time is selected — `@RequestParam` values are null — so all vets are shown. AC says "available vets for the selected date/time", implying the dropdown is always filtered. Full filtering on date selection would require AJAX (out of scope).

Suggested reword appears inline — strikethrough on old text, green on new. Accept / Reject right there.

~~available vets for the selected date/time~~ → **vets, excluding those already booked for the selected date and time**

Developer reads the suggestion, clicks **Accept**. AC 1 updates in place. A new entry appears in the Decisions section: *"Vet dropdown shows all vets on initial page load. Pre-filtering kicks in on form re-renders where date and time are known. Double-booking check on submit is the safety net. Full real-time filtering would require AJAX (out of scope)."*

Loop resumes. Agent log: *"Run 2 | Fresh agent | Reading spec… AC 1 reworded. Re-verifying."*

AC status: AC 1 ✅ · AC 2 ✅ · AC 3 ✅ · AC 4 ✅ · AC 5 ✅ · AC 6 ✅. All green. Two runs out of max three. In the task view, `visit-booking.md` changes to a green icon.

> "Two runs. The agent caught something that wasn't visible during spec analysis — the pre-filtering gap only became clear during implementation."

---

## Beat 4 — Code Review

Task view: `visit-booking.md` shows green — all AC passed.

> "All green. Theoretically, I could merge right now. But I want to look at the controller — it's the biggest change, and I want to know what I'm owning."

The developer goes to step 5 in the spec (VisitController updates). There's a diff link attached; he clicks it, and the diff view opens in a separate tab. Standard IDE diff, nothing custom.

The developer reads through the controller changes. Stops at `populateTimeSlots()` — it rebuilds the same list of hourly slots on every single request, even though the values come from config and never change at runtime.

> "This works, but these time slots are fixed at startup — no reason to rebuild the list on every request. I'd just compute it once in the constructor."

Developer leaves a review comment right in the diff: *"Time slots never change at runtime — build the list once in the constructor"*

Switches back to the spec. The comment is already there — attached to plan step 5, flowed automatically from the diff. The checkbox is unchecked — the spec knows this step needs rework.

> "I left a comment in the diff, and it appeared on the plan step in my spec. The spec tracks everything — I don't have to."

The developer clicks the small Play icon in the gutter next to step 5 — not the big Play on the Plan header, he knows the change is very small, just does not want to type it. Just this one step re-executes with the comment as guidance.

Step re-executes. Checkbox fills back in.

AC status goes stale — all six turn gray. Code changed, verification outdated.

> "With a good spec, code review is five minutes, not an hour. I'm not hunting for logic bugs — the ACs already covered that. I'm just checking that I'm comfortable owning this code."

Developer hits **Play**. Agent log: *"All steps complete. Verifying acceptance criteria…"*

Task view: spinner returns on `visit-booking.md`. And right below it, `vet-schedules.md` shows a yellow pause icon — it's been running in parallel and is now waiting. The developer doesn't wait — he switches to the second spec.

---

## Beat 5 — Step-Through Mode (Vet Schedules)

> "And this wasn't my only task. I can see in the task view that the vet schedules spec has been paused — waiting for me. For this one, I configured a different execution mode. Let's take a look."

The toolbar run config widget updates as the developer switches to the second spec's tab: **"vet-schedules · Step-through ▶"**. Same Play button, different config.

The developer scrolls to the plan section. Six steps, step-through mode. Steps 1–2 already done — green checkboxes. This was running in parallel while the developer worked on the first task, in a separate branch and worktree.

Step 3 is the big one — four sub-steps:
- 3a. VetScheduleController ✅ (done, paused at breakpoint)
- 3b. Templates — `scheduleList.html`, `vetSchedule.html`, `editScheduleEntry.html` (ahead)
- 3c. i18n keys (ahead)

Steps 4–6 still ahead.

> "Step-through, not a loop. Steps 1 and 2 were just schema and repository — scaffolding. But step 3 is the first CRUD page this project has ever had. I set a breakpoint after the controller to check it before the agent builds three templates on top of it."

The developer opens the diff for step 3a. The controller works — endpoints for listing, adding, editing, deleting schedule entries. But `populateDaysOfWeek()` always returns all 7 days. The "add entry" form will show Monday through Sunday — including days the vet already has configured. User picks Monday, submits, hits a duplicate error.

Developer leaves a comment on step 3a: *"Expose only unconfigured days for the add form — subtract the vet's existing schedule days from the full set. Don't push that filtering to the template."*

Then sets a breakpoint on this step again and reruns.

> "This is the first CRUD pattern in the project — whatever the agent builds here, every future CRUD page will follow. I want to tighten control. But first — let me wrap up the first task."

Developer switches back to `visit-booking.md`.

---

## Beat 6 — Wrap-Up & Knowledge Extraction

The developer returns to the first spec. Task view tells the story: `visit-booking.md` — green (done), `vet-schedules.md` — spinner (still running).

IDE shows a hint: *"Ready to merge."*

> "All green, we're good."

The developer expands the agent log panel and scrolls. Wall of text — raw execution output, step logs, test results, AC verification traces, multiple runs of agent output.

> "This log is what the agent actually did — every command, every test run, every decision. In a terminal, this would be my whole interface. But with the spec, I didn't need it once."

The developer scrolls to the Decisions section. Next to each decision, an action: **"Extract to project context."**

The developer clicks on the dual-layer validation decision: *"When using both app-level check and DB constraint, always catch DataIntegrityViolationException and return a user-friendly error."*

Clicks **"Add to project context."**

Opens `CLAUDE.md` — the decision is there. The file lights up with the same inspection tooling.

> "This started as an inspection finding in spec review, became a decision during execution, and now it's a project rule. Next time an agent adds a unique constraint anywhere in this project, it'll know to handle the exception from the start. Same inspection tooling works for all agentic markdown — `CLAUDE.md`, `AGENTS.md`, your custom specs. Here, it's just inspections — no execution needed."
