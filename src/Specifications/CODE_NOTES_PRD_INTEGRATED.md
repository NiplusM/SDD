# Code Notes PRD — Integrated Draft

This draft preserves the structure and intent of the original AIDEV-65 PRD and folds in the detailed prototype behavior captured from the screen recording.

---

## Problem & Objective

### Context

Developers working with an AI coding agent run the same loop many times a day: assign a task, then review the resulting diff. At both ends of this loop they constantly need to point the agent at specific places in the code. When assigning a task, they need to indicate which chunk to work on: "rewrite this function", "fix this loop". When reviewing the result, they need to indicate what in the diff needs to change.

Today this requires a grab-bag of workarounds: copying file paths and line numbers, attaching files, pasting snippets, using `@` mentions in the input, or leaving comments directly in code and referencing them from the prompt. These workarounds create friction and slow down iteration with the agent.

### Problem

Before committing to a final interaction model, we need to understand where the friction lives at both ends of the loop:

- How do developers reference specific code when writing tasks for an agent today, and what is painful about it?
- How do developers write code-review comments for an agent today, and what is painful about it?

### Objective

Make it meaningfully easier for developers to point an agent at specific code on both ends of the loop, both when assigning work and when reviewing its output, so the back-and-forth feels as fast and precise as pointing at code in a conversation with a teammate.

The discovery work described in this PRD is the first step toward that outcome.

---

## Code Notes

Code Notes is a proposed feature that lets developers attach lightweight annotations directly to code locations and lets the agent consume them as structured context. The same primitive can support both sides of the agent loop:

- task assignment: "work on this selected line/range/comment";
- review feedback: "fix the thing described in these comments on the generated diff".

The MVP should focus on review comments for agent-generated diffs and ordinary editor files, because this part of the workflow is underdeveloped, easier to scope, and strongly represented in modern review-oriented agent tools.

---

## Reasoning

Existing task-assignment mechanics are already relatively mature across the industry: selection-to-chat, inline edit, `@` mentions, and context actions. Current research and metrics do not yet show a strong signal that an entirely new interaction model is needed on the task-assignment side.

Review workflows for agent-generated changes remain fragmented and underdeveloped. Users still struggle to precisely communicate requested fixes inside diffs, while feedback is often split between chat, VCS, and code. Modern code review tools are moving toward iterative review workflows, creating a strong market expectation in this area.

Review comments for agent-generated diffs are also easier to scope, prototype, validate, and measure. The mechanics introduced in this flow can later become reusable primitives for broader Code Notes workflows, including task assignment and SDD flows.

---

## Target Users

Engineers for whom working with an AI coding agent is a recurring loop of "assign a task -> review the result" on an existing codebase. At both ends of this loop they need to point the agent at specific places in the code many times a day.

This is not the greenfield "prompt-to-app" user who sends the agent one instruction and accepts the output as-is.

---

## Validation

### 1. Referencing Code in Agent Tasks

Metrics to validate whether referencing specific places in code when writing a task is inconvenient:

- How often people use special characters in the chat input when composing a prompt.
- How often people attach files when writing a prompt or add file/code context.
- How often people copy content from the editor into the input while composing a prompt.
- Whether people use additional solutions to add IDE context into the input.
- Whether users leave comments directly in code and then reference them in the input when writing a prompt.

### 2. Competitor Review: Selection / Context-to-Chat

The closest AI-IDE comparators show that selection-to-chat is already a universal primitive.

| Product | Selection / context to chat |
|---|---|
| Cursor | `⌘K` inline edit; `⌘⇧L` send selection to chat; `⌘I` Composer/Agent |
| Windsurf | `⌘I` / `Ctrl+I` Command mode; `⌘/Ctrl+⇧+.` Explain & Fix from an error |
| Copilot | `⌘I` / `Ctrl+I` Inline Chat; `⌘N` new chat inside the panel |
| Zed | `⌘↵` / `Ctrl+Enter` Inline Assistant |
| JetBrains AI Assistant / Junie | AI Actions context menu; hotkeys assigned manually |
| Codex | `chatgpt.addToThread`; `chatgpt.implementTodo` |
| Antigravity | Selection + `⌘L`; `@` in composer |
| Kiro | Selection + `⌘L`; `@` in chat for files, URLs, Docs |

Takeaways:

- Selection-to-chat has become a universal primitive.
- Inline edit is a parallel track for small in-place edits.
- `@` mentions cover context that is not currently selected.
- Code-comments-as-context is mostly unexplored; Code Notes would extend into this territory.

### 3. Review Comments for Agent-Generated Changes

Research should validate whether writing code-review comments for an agent is inconvenient:

- Conduct problem-focused research on the flow of reviewing agent-made changes in a diff.
- Compare similar features in CodeRabbit, Greptile, Qodo, Claude Code Review mode, Cursor Bugbot, Sweep AI, Bito AI Code Review, CodiumAI / PR-Agent, and Graphite.

---

## Success Criteria

### 1. Referencing Code in Agent Tasks

Friction reduction:

- At least 20% reduction in time from code selection to task submission.

### 2. Attach Code Review Comment for Agent

Users actively discover and use inline comments during agent review sessions.

- Measured as the percentage of users who create at least one inline comment after opening an agent-generated diff.
- Baseline: 0% because the feature does not exist today.
- Initial target: 25%+ of users who open an agent-generated diff create at least one inline comment.

Users send review comments back to the agent as part of an iteration workflow.

- Measured as the percentage of created comments that are submitted to the agent.
- Baseline: no structured review-comment workflow exists today.

Review comment workflow retention.

- Measured as W7 and W14 retention of users who created at least one inline comment.
- Cohort entry: user creates at least one inline comment during an agent review session.
- Reference benchmark: Generate Commit Message feature shows approximately 40% W7 retention.
- Initial target: 25-30% W7 retention.

---

## Scope Decision

### 1. Referencing Code in Agent Tasks

Based on current reports, users actively use existing solutions and usage is fairly high. There is no clear signal that an additional new solution is needed immediately.

### 2. Attach Code Review Comment for Agent

There is a clear signal to implement this functionality. It is becoming an industry-standard pattern in review-oriented agent tools. The mechanics can also be reused later for task assignment and SDD flows.

The MVP scope should therefore prioritize review comments on agent-generated diffs, with support for ordinary editor files as the first extension of the same primitive.

---

## User Flow

### Agent Change Review — Commenting Flow

#### Entry Point

The user is working inside an already active agent session. The session can originate from:

- Chat
- VCS
- SDD flow
- Terminal flow

Within this active session, the user can leave comments for the agent directly inside an agent-generated diff.

The user can open the diff from:

- the Commit tool window;
- the AI Assistant chat message or file card that summarizes agent-generated changes.

#### Initial Setup

The AI Assistant chat is visible on the right. It contains the active chat session for the current agent task.

New comments are linked to the currently open chat session by default. The user can choose another session in the comment composer before saving the comment.

The AI Assistant input has a `+` button for adding context. Before the user first opens the updated context menu, the `+` button shows a blue dot. The menu contains comment-related context options:

- comments in diffs;
- comments in files.

Each new menu item keeps its `New` label until the user clicks that specific item.

Default availability:

- diff comments are enabled by default;
- comments in ordinary editor files are disabled by default.

#### Enabling File Comments

After the user has left one or more diff comments, sent them to the agent, and tries to continue using comments, the AI Assistant input can show a banner:

`You can now leave comments directly on editor files.`

The banner action is:

`Enable File Comments`

After the action is clicked, ordinary editor files show gutter controls for adding comments to file lines.

#### Shortcut Discoverability

After the first comment is created, the IDE shows a tooltip explaining that the same action can be triggered with:

`⌥⇧K`

This tooltip should teach the user that comments can be created from the keyboard, not only from the gutter icon.

---

## Leaving Comments on Agent Changes

During change review, the user leaves inline comments directly on modified code sections.

### Diff Comment Creation

1. User opens an agent-generated diff.
2. Diff comments are already enabled.
3. User clicks a gutter comment control near a changed line or hunk.
4. The IDE opens an inline composer above the diff hunk.
5. The composer shows:
   - target chat session name;
   - `Active Chat` badge if the target session is currently open in the AI Assistant chat;
   - chat session selector;
   - text input;
   - `Cancel`;
   - `Add a Comment`;
   - line/range summary, for example `Comments on lines 1 to 7`.
6. User enters a comment.
7. If the text exceeds the default input height, the input grows vertically.
8. User clicks `Add a Comment`.
9. The comment remains visible inline next to the diff hunk.
10. The gutter shows a comment indicator and count.
11. The AI Assistant input receives a diff attachment with comment count.

### Multiple Comments on the Same Line or Range

The user can leave one or more comments on the same line or range.

When multiple comments exist:

- the inline card lists multiple comments;
- each comment keeps its own text and line/range summary;
- the gutter count updates;
- the AI Assistant attachment count updates;
- hovering the attachment shows all attached comment contents.

### Comment Menu

Each comment has a `...` menu.

Actions:

- `Edit`
- `Delete`

Deleting a comment through this menu updates:

- inline card state;
- gutter count;
- AI Assistant attachment count.

---

## Session-Aware Comments

Comments are scoped to a specific chat session / execution context.

### Active Session

If a comment belongs to the chat session currently open in the AI Assistant chat, the comment card shows:

`Active Chat`

### Inactive Session

If the user selects another chat session while creating the comment, and that session is not currently open in the AI Assistant chat, the comment is shown as inactive relative to the current chat.

Inactive comments expose an action:

`To Context`

`To Context` adds the inactive comment to the context of the currently open chat session.

This behavior applies both to:

- diff comments;
- ordinary editor-file comments.

### Switching Sessions

When switching between sessions:

- the user should only see comments related to the selected session, plus clearly marked inactive comments when they are relevant in the current file/diff context;
- comments remain visible in the diff until the next agent run or until they are explicitly removed;
- if the user does not send a message to the agent, comments continue to exist in a draft state.

---

## Sending Feedback to the Agent

Once the user finishes reviewing changes:

- comments are collected automatically;
- they appear in the AI Assistant chat input as an attachment;
- the attachment contains:
  - references to specific diff sections or file lines;
  - comment content;
  - contextual metadata such as file, line/range, and source surface.

Inside the input, this appears as an attachment chip with an icon and comment counter.

The user can:

- add an additional message to the agent;
- or send only the collected comments.

### Attachment Hover

The user can hover the attachment to see comment content.

This works for:

- draft attachments in the unsent chat input;
- sent attachments in chat history.

### Removing Comment Context

The user can remove comment context in two ways:

- delete the attachment from the AI Assistant input;
- delete the comment from the comment card `...` menu.

If the attachment is removed from the input, the comment is removed from the message context. If that attachment was the only reference to the comment in the session context, it disappears from the attachment list.

---

## Agent Re-Run

After the message is sent:

1. The agent receives the comments as structured context.
2. A new iteration cycle starts.
3. Inline comments that were sent to the agent move into a processed state.
4. Processed comments should no longer behave like unsent draft comments.

Open behavior to validate:

- whether processed comments disappear from the diff immediately;
- whether they remain visible but marked as processed;
- whether the next agent run clears only sent comments or all comments attached to that execution context.

---

## Comments in Ordinary Editor Files

The same comment primitive should work in ordinary editor files after file comments are enabled.

### File Comment Creation

1. User opens an ordinary source file.
2. File comments are enabled through the banner, settings, or context menu.
3. The editor gutter shows comment controls.
4. User clicks the control on a specific line.
5. The IDE opens an inline composer.
6. The composer shows the selected chat session and active/inactive state.
7. User can select another chat session before saving.
8. User enters a comment.
9. If the comment exceeds the default input height, the input grows vertically.
10. User clicks `Add a Comment`.
11. The comment card remains anchored to the source line.
12. The gutter shows a per-line comment indicator.
13. The AI Assistant chat receives a file attachment.
14. Hovering the attachment shows comment content.

This flow is independent from diff comments. The comment is anchored to a source file line, not to a diff hunk.

---

## Settings and Entry Points

### Settings

Settings path:

`Tools > AI Assistant > Comments`

Settings:

- `Enable Comments in Files`
- `Enable Comments in Diffs`

These toggles are independent because file comments and diff comments have different defaults and can be enabled separately.

### Gutter Context Menu

The gutter context menu exposes the relevant action for the current surface:

- in diffs: `Enable Diff Comments`;
- in ordinary editor files: `Enable File Comments`.

### AI Assistant `+` Context Menu

The AI Assistant `+` context menu exposes comment-related context options. It also supports first-use discoverability with:

- blue dot on `+` before the menu is first opened;
- `New` label on each new comment-related menu item until that item is clicked.

---

## History & Navigation

Comment history is preserved inside chat history.

The sent message displays an attachment indicating review comments.

When clicking the attachment:

- the user is navigated back to the diff or file;
- the corresponding file and comments are opened;
- this works both for active and historical sessions.

Hovering the attachment should show comment content without navigating.

---

## UI States

| State | Expected behavior |
|---|---|
| Diff comments enabled by default | Diff gutter shows comment controls without additional setup. |
| File comments disabled by default | Ordinary editor files do not show comment controls until enabled. |
| Chat `+` has updates | `+` button in AI Assistant shows a blue dot before the updated menu is first opened. |
| Context menu has new items | Comment-related items in the `+` menu show `New` until clicked. |
| First comment tooltip | After first comment, tooltip shows shortcut `⌥⇧K`. |
| Composer open | Composer shows session selector, input, `Cancel`, `Add a Comment`, and line/range summary. |
| Composer input expanded | Long comment text grows the input vertically. |
| Active chat comment | Comment card shows `Active Chat`. |
| Inactive chat comment | Comment card shows inactive state and `To Context`. |
| Comment saved | Comment card stays anchored to line/range. |
| Multiple comments | Card lists multiple comments; gutter and attachment counts update. |
| Comment menu | `...` menu exposes `Edit` and `Delete`. |
| Draft attachment | Attachment is visible in the unsent input; hover shows comment content. |
| Sent attachment | Attachment remains in chat history; hover shows comment content. |
| File comments banner | AI Assistant input shows `Enable File Comments` banner when conditions are met. |

---

## Acceptance Criteria

- Diff comments are available by default in agent-generated diffs.
- Ordinary editor-file comments are disabled by default.
- The AI Assistant `+` button shows a blue dot before the new context menu is first opened.
- Comment-related options in the `+` menu show `New` until each item is clicked.
- User can create one or more comments on a diff line/range.
- User can create one or more comments on an ordinary editor-file line after file comments are enabled.
- After the first comment, the IDE shows a tooltip with shortcut `⌥⇧K`.
- The comment composer lets the user select another chat session before saving.
- Long comment text expands the composer input vertically.
- Comment cards show active/inactive session state.
- Inactive comments provide `To Context`.
- Comment `...` menu provides `Edit` and `Delete`.
- Draft attachments in the AI Assistant input can be hovered to reveal comment content.
- Sent attachments in chat history can be hovered to reveal comment content.
- User can remove comment context by deleting the attachment or deleting the comment from the `...` menu.
- Attachment count updates when comments are added or removed.
- AI Assistant receives submitted comments as structured context.
- Settings include independent toggles for `Enable Comments in Files` and `Enable Comments in Diffs`.
- Gutter context menu includes `Enable File Comments` and `Enable Diff Comments` on the relevant surfaces.

---

## Open Question: VCS Integration

Should VCS / file tree additionally indicate that a file contains unresolved agent feedback?

Possible directions:

- badge or indicator on the file;
- comment counter;
- diff decoration;
- session-specific marker.

This remains an exploration area for now, but is especially important for VCS and SDD entry points.
