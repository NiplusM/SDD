# JVM Scenario: Reproduced and Automated Flow

This file describes not the original storyboard from `jvm-scenario.md`, but the scenario that is currently automated in `scripts/run-jvm-scenario.mjs`.

## What Is Automated

The scenario runs through Playwright, opens the current project UI, performs real clicks on interface elements, enters text into the editor and comment fields, switches task tabs, opens the diff view, and saves screenshots to `test-results/jvm-scenario`.

This is the closest reproduction of the demo scenario in the current state of the application, not a full 1:1 implementation of every beat from `jvm-scenario.md`.

## Preconditions

1. The application is available at `http://127.0.0.1:4173/`, or the scenario starts the dev server itself.
2. The project exposes UI states for the `visit-booking.md` and `vet-schedules.md` tasks.
3. The UI contains `data-demo-id` attributes that the auto-click flow relies on.

## Step-by-Step Scenario

### Beat 1. Task Creation and Initial Spec Generation

1. The welcome screen opens.
2. The script clicks the new agent task button: `welcome-new-agent-task`.
3. Focus moves to the main task editor: `.main-window-editor-content .editor .pce-textarea`.
4. The script enters the prompt:

```text
Create a spec for visit booking in PetClinic based on prd.md
```

5. The script clicks the generate button: `agent-task-generate`.
6. In the terminal permission popup, it clicks `terminal-permission-allow-once`.
7. The script waits for the `agent-task-run` button to appear, which indicates that the first spec generation is complete.

### Beat 2. Spec Inspections and Fixes

1. In the Agent Tasks list, the script opens `visit-booking.md` through `agent-task-row-visit-booking-md`.
2. It clicks the spec issue counter: `spec-inspection-counts`.
3. It focuses AC #1: `spec-row-ac-0`.
4. It opens quick actions for AC #1: `spec-issue-actions-ac-0`.
5. It applies the quick fix for AC #1: `issue-popup-apply-fix-ac-0`.
6. It focuses AC #2: `spec-row-ac-1`.
7. It opens comments for AC #2: `spec-comment-ac-1`.
8. In the `Write a comment` field, it enters:

```text
Fixed hourly slots from 09:00 to 16:00. Use <select> with predefined options. Last bookable slot is 16:00. Slot range configurable.
```

9. It clicks `Add a Comment`.
10. It focuses the plan step with the race condition issue: `spec-row-plan-2`.
11. It opens quick actions: `spec-issue-actions-plan-2`.
12. It applies the quick fix: `issue-popup-apply-fix-plan-2`.
13. It focuses the plan step with the missing formatter: `spec-row-plan-4`.
14. It opens quick actions: `spec-issue-actions-plan-4`.
15. It applies the quick fix: `issue-popup-apply-fix-plan-4`.
16. Once the `agent-task-enhance` button becomes enabled, it clicks `Enhance`.
17. The script waits for the `agent-task-run` button to reappear, meaning spec regeneration is complete.

### Beat 3. Execution Start

1. The script clicks `agent-task-run`.
2. It waits for the current execution cycle to complete.
3. At this stage, it captures the result state after the refined spec has been executed.

### Beat 4. Code Review Through Diff and Comment Sync

1. The script opens the diff for the plan step through `plan-show-diff-plan-3`.
2. In the diff, it finds the line containing `return this.timeSlots;`.
3. On that row, it opens the comment toggle: `diff-comment-toggle-*`.
4. In the `Write a comment` field, it enters the review comment:

```text
Time slots never change at runtime — build the list once in the constructor
```

5. It clicks `Add a Comment`.
6. The script returns to the `visit-booking.md` tab.
7. It captures the state where the review comment has already been synced back into the spec.

### Beat 5. Parallel `vet-schedules.md` Task

1. In the task list, the script opens `vet-schedules.md` through `agent-task-row-vet-schedules-md`.
2. It clicks `agent-task-generate`.
3. In the permission popup, it clicks `terminal-permission-allow-once`.
4. The script waits for `agent-task-run` to appear, meaning spec generation for the second task is complete.

### Beat 6. Return to `visit-booking.md` and Wrap-Up

1. The script returns to the `visit-booking.md` tab.
2. It clicks `agent-task-run` to re-check the task after the review comment.
3. If the `Add to project context` button is visible on screen, the script clicks it.
4. The script saves the final screenshot and completes the run.

## Elements Used by the Scenario

### 1. Start and Task Creation

| Element | Type | Purpose |
| --- | --- | --- |
| `welcome-new-agent-task` | `data-demo-id` | Opens a new agent task from the welcome screen |
| `.main-window-editor-content .editor .pce-textarea` | CSS locator | Main prompt input field |
| `agent-task-generate` | `data-demo-id` | Starts the first spec generation |
| `terminal-permission-allow-once` | `data-demo-id` | Grants permission to run the agent |
| `agent-task-run` | `data-demo-id` | Starts execution or verification after generation |

### 2. Task Navigation

| Element | Type | Purpose |
| --- | --- | --- |
| `agent-task-row-visit-booking-md` | `data-demo-id` | Opens the `visit-booking.md` task |
| `agent-task-row-vet-schedules-md` | `data-demo-id` | Opens the `vet-schedules.md` task |
| `.main-window-editor-tabs .tab.tab-selected` | CSS locator | Verifies that the correct tab is open |

### 3. Spec Inspections and Fixes

| Element | Type | Purpose |
| --- | --- | --- |
| `spec-inspection-counts` | `data-demo-id` | Opens the list of issues in the spec |
| `spec-row-ac-0` | `data-demo-id` | Acceptance criterion #1 row |
| `spec-row-ac-1` | `data-demo-id` | Acceptance criterion #2 row |
| `spec-row-plan-2` | `data-demo-id` | Plan step row with the race-condition issue |
| `spec-row-plan-4` | `data-demo-id` | Plan step row with the missing formatter issue |
| `spec-issue-actions-ac-0` | `data-demo-id` | Quick actions menu for AC #1 |
| `spec-issue-actions-plan-2` | `data-demo-id` | Quick actions menu for plan step #3 |
| `spec-issue-actions-plan-4` | `data-demo-id` | Quick actions menu for plan step #5 |
| `issue-popup-apply-fix-ac-0` | `data-demo-id` | Applies the quick fix for AC #1 |
| `issue-popup-apply-fix-plan-2` | `data-demo-id` | Applies the quick fix for the race condition |
| `issue-popup-apply-fix-plan-4` | `data-demo-id` | Adds or applies the `VetFormatter` step |
| `spec-comment-ac-1` | `data-demo-id` | Opens inline comments for AC #2 |
| `Write a comment` | placeholder | Input field for a spec comment or diff comment |
| `Add a Comment` | button text | Saves the entered comment |
| `agent-task-enhance` | `data-demo-id` | Regenerates the spec after fixes and comments |

### 4. Diff and Review

| Element | Type | Purpose |
| --- | --- | --- |
| `plan-show-diff-plan-3` | `data-demo-id` | Opens the diff for the selected plan step |
| `.plan-diff-row` with text `return this.timeSlots;` | CSS locator + text filter | Selects the specific row in the diff |
| `diff-comment-toggle-*` | `data-demo-id` | Opens inline review comments for the diff row |
| `Write a comment` | placeholder | Input field for the diff review comment |
| `Add a Comment` | button text | Saves the diff comment |

### 5. Finalization

| Element | Type | Purpose |
| --- | --- | --- |
| `agent-task-run` | `data-demo-id` | Starts the final re-run |
| `Add to project context` | text locator | Extracts the decision into project context when the action is available |

## What the Scenario Does Not Fully Cover

1. After the diff comment is added, the flow shows the comment syncing back into the spec, but it does not perform a separate `Enhance` run for just that single step, because the current UI state does not always reliably mark the step as pending rework.
2. For `vet-schedules.md`, the automation covers generation and task switching, but not the full step-through mode flow from the original storyboard.
3. The `Add to project context` button is clicked only if it is actually visible in the UI during the run.

## Run Artifacts

After the scenario finishes, screenshots for each key stage are saved to:

```text
test-results/jvm-scenario
```

Filenames follow the step order, for example:

```text
01-beat-1-new-task.png
02-beat-1-prompt.png
...
```
