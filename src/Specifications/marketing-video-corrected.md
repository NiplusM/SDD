# Working hours: marketing video recording script

This recording follows an existing Spring PetClinic booking extension. The agent implements working hours, finds an unresolved case during verification, incorporates a decision from an inline comment, then executes the affected work again. The final beat opens code review.

## 1. Start the task

**On-screen text:** Give the agent a task. Follow its work in a living document.

- The prototype opens directly in **New Session**, with the **Codex with Workspace** preset selected.
- The placeholder explains: *Describe your task. Review the plan, guide changes, and track results in one Workspace.*
- Enter `Add vet working hours and reject bookings outside them` in the task prompt and submit.
- After brief reasoning, `Vet-Schedules.md` opens across the editor.
- Only the document tab remains visible. The generating session is retained.

## 2. Run the task

**On-screen text:** See what's complete and what needs your attention.

- Click **Implement**.
- The six plan items complete, then acceptance verification begins.
- Three ACs pass. The booking rule has a red cross.

## 3. Notice the problem

**On-screen text:** Verification reveals a decision the request left open.

- Expand the failed AC's checks.
- One check confirms that new bookings at 18:00 are rejected.
- Hold on the unresolved check: *The criterion does not cover existing appointments after working hours change. Keep them or flag for rescheduling?*

The cross marks unresolved verification. No cancellation or rescheduling decision has been made automatically.

## 4. Clarify the behavior

**On-screen text:** Resolve the question directly on the criterion.

- Hover the AC and click its comment icon.
- Type: `Keep previously confirmed appointments. Apply the restriction only to new bookings.`
- Click **Add Note**, then **Revise Workspace** in the document toolbar.
- The agent updates the AC:
  > New bookings outside the vet's working hours are rejected. Previously confirmed appointments remain unchanged.
- The validation and test plan items become unchecked. The updated AC also becomes unchecked and its old evidence is cleared. All other completed items stay green.
- Hold on the updated AC. Sending comments does not run the task.

## 5. Re-execute

**On-screen text:** Continue the affected work. Verify the agreed behavior.

- Click **Implement** again.
- Only the affected work and verification run again. All items finish green.
- Expand the AC's checks:
  - Existing confirmed appointment at 18:00 is preserved after the schedule changes.
  - New booking at 18:00 is rejected. No visit is saved.

## 6. Review the code

**On-screen text:** Review the changes with their context intact.

- Scroll to **Generated Diffs**.
- Click the diff icon in the gutter beside the heading.
- The controller diff opens for review. Hold briefly, then fade out.

## Recording and verification

- Reload `/` for a fresh New Session in Workspace. Existing `/?screen=welcome` links open the same starting state.
- `npm run scenario:jvm` performs the recording sequence with a visible browser.
- `npm run scenario:jvm -- --headless` checks the flow and generates screenshots. It also checks that rerunning before feedback still leaves the unresolved AC red, and that drafting a comment does not invalidate results.
- The prototype uses deterministic execution states. Any nonempty comment on the booking-policy AC triggers the same scripted revision and partial invalidation; the suggested recording text is not a required command. It does not run Java during recording.
- The displayed Java, SQL and HTML are imported from `src/demo/petclinic/`. See that directory's README for the real code audit and baseline assumptions.
