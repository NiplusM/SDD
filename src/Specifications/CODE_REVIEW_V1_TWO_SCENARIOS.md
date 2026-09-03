# Code Review for Changes in the IDE

## V1 User Flow: Two Review Scenarios

**Status:** V1 target specification  
**Scope:** GUI-based pre-commit review

## Overview

After the Code Review processes the selected changes, the user receives a Review Preview with the `Open` status. The Preview presents:

- a short and expanded summary;
- the number of reviewed files and findings;
- the main risks;
- the severity distribution: `Critical`, `Warning`, and `Info`;
- synchronized finding statuses and available fixes.

Each finding is connected to a file and code anchor. A finding can be `Open`, `Accepted`, `Dismissed`, `Deleted`, or `Pending update`.

The Preview, Full Review, chat review block, and related code represent the same review session. Decisions, counters, statuses, fixes, and summaries stay synchronized across all views.

Once the first result is available, the user can choose one of three global actions:

- **Complete Review** — records the current review as final.
- **Submit Review** — sends feedback to the agent and starts another iteration of the same review.
- **Cancel Review** — explicitly cancels the review and reverts changes proposed by the review.

The result can then be handled through one of two primary scenarios.

---

## Scenario 1 — Review Quickly and Complete

### User goal

Obtain an independent assessment of the changes before committing them and make a decision without investigating every finding in detail.

### 1. Evaluate the Review Preview

The user reads the short summary, expands it when necessary, and checks the primary risks and severity distribution without leaving the Preview.

**Intermediate result:** The user understands the overall risk level and decides whether the available information is sufficient.

### 2. Decide Whether Findings Need Action

If the high-level assessment is sufficient, the user can proceed directly to **Complete Review**. Open findings do not block completion.

If the user wants to make quick decisions, actions can be applied at three levels:

- **Entire review** — apply all compatible fixes or dismiss all proposals.
- **Severity group** — apply compatible fixes or dismiss all findings in the selected severity group.
- **Individual finding** — reply, accept and apply the fix, dismiss, leave open, or delete.

Bulk actions affect only compatible findings. Every affected finding receives its own status, and counters and summaries are recalculated immediately.

**Intermediate result:** The review remains unchanged or reflects the user's individual, group, or review-wide decisions.

### 3. Choose the Next Review Action

The user chooses one of the following:

- **Complete Review** — changes the review status from `Open` to `Completed`, records the final counters and summaries, and makes the result read-only.
- **Submit Review** — lets the user add feedback and starts a new iteration in the same review session.
- **Cancel Review** — changes the status to `Cancelled`, rejects the review, reverts its proposed changes, and makes the result read-only.

Cancel Review is not an alternative form of completion. Complete records an accepted final result, Submit continues the work, and Cancel explicitly rejects the review.

### 4. Receive the Result

- After **Complete Review**, the session is read-only with the final `Completed` status.
- After **Cancel Review**, the session is read-only with the final `Cancelled` status.
- After **Submit Review**, the status changes to `Updating`, file-level progress appears again, and the agent processes the current scope using the complete history of decisions and feedback. When processing finishes, the result receives the intermediate `Updated` status.

During processing, the user can stop the run only through **Stop** in the chat input.

### Scenario outcome

The user receives an independent assessment and controls how deeply to engage with it. They can read the result, make quick decisions at any supported scope, and then complete, continue, or explicitly cancel the review.

---

## Scenario 2 — Investigate in Detail and Improve the Changes

### User goal

Understand the reasons behind the findings, connect them to the complete code context, and progressively bring the changes to the required quality level.

### 1. Open the Detailed View

The user opens the result in split view or Full Review. This does not create another review: the Preview and Full Review are two views of the same synchronized session.

**Intermediate result:** The user gains more working space without losing the review context, decisions, or statuses.

### 2. Configure Review Depth and Presentation

The user can configure:

- **Grouping** — by severity, file, status, or agent;
- **Filtering** — by severity and finding state;
- **Visual representation** — from a high-level list to a code-connected view;
- **Code comparison** — Split or Unified diff;
- **Full code context** — the complete file, surrounding implementation, and relevant dependencies;
- **Inline context** — findings displayed next to the related code while preserving severity and status.

**Intermediate result:** The user selects a view that provides enough context to understand the findings and their relationship to the changes.

### 3. Investigate Findings and Record Decisions

The user can:

- reply to a finding;
- ask the agent for clarification;
- accept and apply a fix;
- dismiss a recommendation;
- leave a finding `Open`;
- delete a finding;
- apply actions to an individual finding, severity group, or the entire result;
- add comments to code lines and fragments in Full Review.

Replies, decisions, fixes, and manual comments are retained as context for the current review.

**Intermediate result:** Finding statuses, counters, and summaries reflect the latest decisions, and the accumulated feedback is ready for completion or another iteration.

### 4. Choose the Next Review Action

The user chooses one of the same three global actions:

- **Complete Review** — records the current result as final and makes it read-only.
- **Submit Review** — sends the accumulated feedback to the next iteration.
- **Cancel Review** — cancels the review, reverts its proposed changes, and makes the result read-only.

### 5. Run Another Iteration

If the user selects **Submit Review**, the IDE creates one feedback batch containing:

- the message to the agent;
- replies and clarification requests;
- accepted and dismissed findings;
- applied fixes;
- open and deleted findings;
- comments from the chat and files;
- the current state of the changes.

The status changes from `Open` to `Updating`. The agent processes the current scope in the same review session and uses the complete context of all previous iterations.

File-level progress is shown again using `Queued`, `Processing`, `Reviewed`, and `Failed`. The run can be stopped only with **Stop** in the chat input.

When processing finishes, the result receives the `Updated` status. Findings, statuses, counters, and summaries are refreshed. The user can then:

- complete the review quickly;
- continue the detailed investigation;
- submit another iteration;
- cancel the review.

The iteration cycle can be repeated as many times as necessary.

### 6. Complete the Scenario

After **Complete Review** or **Cancel Review**, no further actions are available in that review session. The user returns to the Commit tool window, which displays the current uncommitted changes, including applied fixes, later iterations, and manual edits.

The user can then:

- commit the changes;
- continue working manually;
- start a new Code Review.

A new review creates a new session and does not overwrite the completed review history.

### Scenario outcome

The user can investigate findings in full code context, provide additional information, preserve decisions across iterations, and progressively improve the changes before making the final commit decision.

---

## Special Case — No Findings

If the review produces no findings, the Preview shows `No findings` and the final summary.

- **Complete Review** remains available and completes the review normally.
- **Submit Review** is unavailable until the user provides feedback.
- **Cancel Review** remains available only when the user explicitly wants to cancel the review and its proposed changes.

## Final States

| Status | Meaning | Further actions |
| --- | --- | --- |
| `Open` | The result is available for review and decisions. | Complete, Submit, or Cancel |
| `Updating` | The agent is processing another iteration. | Stop from the chat input |
| `Updated` | A later iteration has completed and refreshed the result. | Complete, Submit again, or Cancel |
| `Completed` | The result was recorded as final. | None; read-only |
| `Cancelled` | The review was explicitly rejected and its proposed changes were reverted. | None; read-only |
