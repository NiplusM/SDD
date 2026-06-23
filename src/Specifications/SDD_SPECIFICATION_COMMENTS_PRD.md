# PRD: Comments on SDD Specifications

This PRD describes comments on SDD / markdown specification documents and on related code artifacts.

---

## Problem and Goal

### Context

In the SDD flow, the developer works from a markdown specification that becomes the execution contract for the agent.

During this flow, the user needs to leave precise feedback in several places:

- directly in the specification document, when the issue concerns the plan, acceptance criteria, or wording;
- in generated diffs;
- in editor files;
- in the AI Assistant chat, when all feedback is sent back to the agent.

Without a comment model that understands specification context, this feedback fragments between the markdown document, code files, diffs, the Problems view, and chat messages.

### Problem

The IDE needs a way to treat comments as part of the active specification context, not just as standalone editor annotations or chat attachments.

The user should be able to leave a comment where they noticed the issue, and the system should preserve the link between that comment and the relevant specification, making it available to chats that will specify, build, or revise that specification.

### Goal

Allow the user to add lightweight comments to SDD markdown documents and related implementation surfaces, aggregate them under the active specification, and send them to the agent as structured context during `Specify`, `Build`, and regular chat flows.

The flow should display comments in the editor, AI Assistant chat, Problems view, and inspection widget, reusing the already-defined Code Notes behavior for creating comments, attachments, hover previews, session awareness, diff comments, and file comments.

---

## Product Concept

### Specification comments

A specification comment is a comment that belongs to a specific SDD markdown document. It can be anchored to:

- a line within the markdown specification itself;
- a generated diff related to the specification;
- an editor file connected to the execution context of the specification.

All such comments are aggregated as specification comments. The user can see them on the source surface where they were created, in an attachment in the AI Assistant chat, in the Problems view, and in the inspection widget of the specification.

### Relation to Code Notes

This PRD does not redefine the base comment mechanics. It reuses Code Notes / chat comments behavior for:

- gutter icons and anchors on a line/range;
- the simplified inline composer;
- comment popups under the source line;
- belonging to active and inactive chat sessions;
- attachment chips in the AI Assistant chat;
- hover previews for draft and sent attachments;
- expandable multi-source attachment chips;
- the `⌥⇧K` shortcut tooltip;
- banner and settings behavior for enabling comments in editor files;
- comments in generated diffs, enabled by default.

The SDD-specific layer adds specification context: comments from different surfaces are grouped under the markdown specification and included in the context whenever `Specify`, `Build`, or a regular chat message send is triggered from a chat attached to the specification.

---

## Target Users

Engineers working with the agent through the SDD flow, where the markdown specification is the source of truth for implementation work. They iteratively refine the specification, run `Specify` or `Build`, review the generated changes, and send follow-up feedback to the agent.

This flow is not primarily intended for standalone code review without an attached specification. That scenario is covered by the Code Notes / chat comments PRD.

---

## Scope

### In Scope

- Comments on SDD markdown documents.
- Comments on generated diffs related to the specification.
- Comments on editor files related to the specification.
- Aggregation of all related comments under the specification.
- Specification-aware attachment chips in the AI Assistant chat.
- Sending specification context + unresolved comments through `Specify`, `Build`, and manual chat sends.
- Nesting of comments in the Problems view.
- Comment count and attention indicator in the inspection widget.
- Reusing Code Notes behavior for edit, delete, hover previews, shortcut tooltip, and enablement banners.

### Out of Scope

- Replacing the base Code Notes / chat comments behavior.
- Final visual design for archived or resolved comments after a re-run by the agent.
- A full task-management system for comments.
- VCS commit review behavior not related to the active specification.
- Loading state for comments (e.g. skeletons or progress indicators while comments are being fetched or restored).

---

## User Flow — Specification comments as AI context

### Entry Point

The user works with an SDD markdown document, for example `Visit-Booking.md`, open in the editor.

The document can be used from several actions:

- `Specify` — refine or update the specification, using the current markdown document as context;
- `Build` — execute implementation based on the current markdown document as context;
- a manual message send in the AI Assistant chat, either in the chat already attached to this document, or in another chat (including a brand-new one) where the specification is added as context.

The right-side AI Assistant chat is attached to the attached markdown document.

### Initial Setup

When a markdown document is open in the editor:

- the specification is considered the active SDD context for the current `Specify` or `Build` chat;
- the input in the AI Assistant chat shows the specification attachment chip, e.g. `Visit-Booking.md`;
- if the user creates a comment while this markdown document is active, the default target is the specification itself;
- the user can still route the comment to a related specification chat or another chat via the target picker;
- if a different chat is chosen, the specification context is attached to that chat together with the comment.

The AI Assistant chat remains the place where comments become agent context. The markdown document remains the place where comments are created and reviewed in context.

---

## Comments on the markdown specification

This section describes only comments left directly in the markdown specification document itself. Behavior for comments in generated diffs and editor files is described below, in the "Comments on related diffs and files" section.

### Creating a comment

The user can add a comment on the markdown document via:

- the gutter comment icon next to a line;
- the `⌥⇧K` shortcut at the caret position;
- the equivalent editor action that opens the same composer.

The composer is a simplified version of the Code Notes composer:

- appears inline under the target line; a comment can be anchored to a single line or to a blank line; line ranges are not supported;
- shows the specification name, e.g. `Visit-Booking.md`;
- uses a text field with the placeholder `Write a comment`;
- contains the `Cancel` and `Add a Comment` actions;
- does not show chat-specific controls, which are not needed when the current target is clearly the active specification;
- preserves the current line selection highlight when opening, and automatically moves focus into the text field.

After submission:

- the comment stays visible under the line in the markdown document;
- the gutter icon becomes a comment badge; if multiple comments are anchored to a single line, the badge shows their total count;
- on hover, the badge shows a `+` for quickly adding another comment to the same line;
- the specification tab and status area may show an attention indicator when there are comments;
- the specification attachment in the AI Assistant chat updates its comment count.

### Line behavior

The comment anchor follows the same line model as Code Notes:

- a single-line comment is anchored to a single markdown line;
- comments stay under the line where they were created;
- a single line may have multiple comments; each is counted separately;
- when multiple comments exist on one line, they are displayed in the popup grouped by session/source: each group has its own context header (chat or specification name), with the comments listed beneath it.

---

## Choosing chat or specification

### Default Target

When the active editor tab is the SDD markdown document, the comment's default target becomes the active specification. This lets the user write a comment without manually choosing a chat.

The comment is automatically linked to the specification and becomes part of the context for chats that specify, build, or otherwise process this specification.

### Choosing a different target

The user can choose a different target while composing a comment:

- a chat already related to the specification;
- a new chat for the specification;
- any other chat.

If the user chooses a different chat, the comment belongs to that chat, but the specification context is still attached to it. This preserves the link between the comment and the source specification even when the right-side AI Assistant chat is not the active specification chat.

Active and inactive states apply only to comments in diffs and editor files. Comments in the markdown document itself are always considered active because they have a single target — the active specification.

For comments in diffs and editor files:

- a comment is Active when its target chat is open in the AI Assistant chat;
- a comment is Inactive when its target chat differs from the currently open chat;
- inactive comments remain visible on their source surface;
- actions and navigation follow general Code Notes rules.

---

## Attachments in the AI Assistant chat

### Draft Attachment

Comments related to the specification are represented in the AI Assistant chat input as a specification attachment chip.

The chip:

- uses a markdown/specification icon;
- shows the specification name, e.g. `Visit-Booking.md`;
- aggregates comments from all related sources (the markdown specification itself, generated diffs, and editor files) under a single chip;
- shows the total count of comments attached to the specification across all sources;
- shows a preview of the comment contents on hover (with the source name and text for each previewed comment);
- can be removed from the input via the standard Code Notes removal behavior;
- can be sent without an additional text message.

If comments come from multiple sources, the user sees one aggregated specification chip rather than several unrelated chips.

When switching between chats, draft attachment chips of an inactive session are hidden from the input — the user sees only chips related to the currently open chat or to the active specification.

### Removing the Attachment Chip

The user can remove a draft attachment chip from the input via the `×` on the chip. This is not a dismissal — it is a global deletion of all comments aggregated under the chip:

- every comment included in the chip is removed at once from the markdown document, generated diffs, editor files, the Problems view, the inspection widget, and any other surface where it appeared;
- no copy of the comments is kept anywhere — the system does not retain them in a hidden state to restore later;
- the attachment chip does not reappear until the user creates a new comment linked to the specification on any surface (markdown line, diff, or editor file).

This is the same outcome as deleting each underlying comment individually from its source surface or from the Problems view — see "Editing and Deleting" below for the symmetry.

### Expanded Attachment

If the specification has comments from multiple sources, the attachment can be expanded via a chevron.

The expanded list shows one row per source:

- `Visit-Booking.md` for comments left directly in the specification;
- editor files, e.g. `VisitController.java`;
- generated diffs, e.g. `Diff VisitController.java`.

Each row shows its own comment count. Clicking a row navigates the user to that source and focuses the corresponding comment.

### Hover Preview

Hover on an attachment shows the contents of the comments without navigation.

For an aggregated specification attachment, the preview shows:

- a title like `Comments · 4`;
- the source name for each previewed comment;
- the comment text;
- a `+N more` line if there are more comments than fit in the preview.

Hover on a row inside an expanded attachment may show the comment text for that source.

The same hover behavior applies to sent attachments in chat history. Sent attachments cannot be removed from history.

---

## Specify and Build actions

### Sending specification context

When the user clicks `Specify`, `Build`, or simply sends a message manually in the AI Assistant chat attached to the specification, the message includes:

- the specification context;
- the relevant section context if the action is scoped to a section, e.g. `Context: Visit-Booking.md > Plan`;
- unresolved comments currently attached to the specification.

The chat message preserves the attachment. Hover on the sent attachment shows the comments that were included as context for that run.

### Build Chat behavior

For `Build`, the chat explicitly shows the scope:

- the build context is scoped to the attached markdown document;
- unresolved document comments attached to the specification are included;
- generated implementation files and diffs remain linked to the specification.

After the build completes, the specification continues to be the aggregation root for comments in the generated diff and related editor files.

### Specify Chat behavior

For `Specify`, the same model applies, but the expected agent output is a refined specification rather than implementation changes.

The specification attachment and unresolved comments are sent as structured context for the refine / specification step.

### Manual message send in chat

In addition to `Specify` and `Build`, the user can send any message in the AI Assistant chat attached to the specification. If the specification has unresolved comments, they are automatically included in that message as a specification attachment, using the same model:

- the specification attachment chip is present in the input, with an aggregated comment count;
- on send, the message preserves the attachment;
- hover on the sent attachment shows the included comments;
- the comments remain available for further iterations in the chat.

Agent comment handling is bound to the `Specify` and `Build` buttons as well as to a regular message send in a specification-attached chat — all three triggers include the comment context for the agent.

---

## Comments on related diffs and files

### Generated Diffs

When the user opens a diff generated from the specification, comments in diffs are enabled by default.

The user can:

- leave a comment on a line or range in the diff;
- see the comment under the diff line/range;
- see the diff comment inside the specification attachment;
- navigate from the AI Assistant chat attachment back to the diff comment.

Diff comments use the base Code Notes behavior. The SDD-specific aspect is that the diff comment is also linked back to the source specification.

### Editor Files

When the user opens an editor file related to the specification, file comments follow the enablement model from Code Notes:

- file comments are disabled by default;
- after a relevant trigger, the AI Assistant chat may show a banner to enable comments in editor files;
- the `+` menu and settings are synchronized with the feature's state;
- once enabled, comments can be created in editor files via the same composer and shortcut model.

If an editor file is connected to the active specification, comments created there can be aggregated under that specification and included in the specification attachment.

---

## Problems View

### Specification-Level View

When the markdown specification is the active context, the Problems view shows the specification as the root item.

The root item may include:

- the specification file name and path;
- the total problem count;
- the total comment count;
- a nested `Comments` section;
- regular warnings and errors for the specification.

The `Comments` section is a first-level child under the specification. Individual comments are second-level children.

Each comment row shows:

- the source icon;
- the comment text;
- the source file or diff name;
- the line number.

Example structure:

```text
Visit-Booking.md
  Comments 3
    one more comment    Visit-Booking.md · Line 13
    comment             VisitController.java · Line 23
    comment             Diff VisitController.java · Line 7
  Possible race condition ...
  Incomplete plan ...
```

Selecting a comment in the Problems view navigates to the corresponding source and focuses the comment.

### File-Level View

When an editor file is active, the Problems view may show comments for that file alongside regular inspections.

This local file view does not replace the specification-level aggregation. It is a scoped view for the active file, while the specification view remains the full aggregation root.

---

## Inspection Widget

The specification editor's inspection widget includes a comments indicator when comments are attached to the active specification.

The widget:

- shows a comment icon;
- shows the total number of comments related to the specification;
- shows warnings/errors as usual;
- may show a blue dot when new comments appear from related files or diffs and the user should be aware that the specification context has changed.

Clicking the comment indicator opens or focuses the `Comments` section in the Problems view.

The blue dot is an attention signal, not a separate comment state. It should be cleared once the user has opened the corresponding aggregation surface with the comments.

---

## Comment Lifecycle

### Draft Comments

Before submission, comments are draft context for the target chat / specification.

Draft comments:

- remain visible on their source surface;
- count toward the specification attachment in the AI Assistant chat input;
- appear in the Problems view;
- are included when `Specify`, `Build`, or a manual message send in a specification-attached chat sends the specification context with these comments as attachments.

### Sent Comments

After sending:

- the chat message preserves the specification attachment;
- the sent attachment can be hovered to view the included comments;
- comments remain in the chat history.

### Pending Comments

After sending, while the agent is processing the request, comments in that message are in a pending state:

- a loader is shown in the comment's context header on the source surface;
- the comment is read-only — editing and deletion are not available until processing finishes;
- the pending state clears once the agent completes processing and the comment transitions to the final state described in Sent Comments.

### Editing and Deleting

Editing and deletion follow general Code Notes rules:

- active comments can be edited or deleted from the comment's `...` menu;
- a comment can be deleted from any surface it appears on — the input attachment chip, the markdown document body, the Problems view, an editor file, or a diff — and deletion is global: the comment disappears from every surface at once, not only from the place where the user invoked the action;
- removing the draft attachment chip from the input (`×` on the chip) is a bulk deletion: all comments aggregated under that chip are deleted globally in one step (see "Removing the Attachment Chip" above);
- deletion is permanent — the system does not keep deleted comments in a hidden or restorable state; the attachment chip reappears only when the user creates a new comment linked to the specification;
- deleting a comment recalculates gutter badges, attachment counts, Problems view counts, and inspection widget counts;
- sent attachments in message history cannot be removed this way.

---

## Discoverability and Enablement

### Shortcut tooltip

A one-time shortcut tooltip appears after the user leaves their first comment in a diff:

```text
Add comments faster
Press ⌥⇧K from the editor
```

The tooltip is shown once and never returns.

### Banner for File Comments

The banner that enables file comments in editor files follows the Code Notes PRD logic. It may appear after the user has already used comments in the current context and then ends up in a state where file comments would be helpful.

For SDD, the banner should explicitly explain that enabling file comments allows attaching comments from related editor files to the current specification context.

### Settings

Comment settings live under `Tools → AI Assistant → Comments`. They include:

- `Comments in diffs` — enabled by default. Toggles whether the user can leave comments on lines/ranges in generated diffs.
- `Comments in editor files` — disabled by default. Toggles whether the user can leave comments on lines/ranges in regular editor files.

Comments in the markdown specification document itself are not gated by these settings — they are always available when a markdown specification is open in the editor.

Settings state is shared across the workspace and persists between sessions.

### File comments enablement entry points

Enabling and disabling file comments in editor files is available from several places, all kept in sync:

- `Tools → AI Assistant → Comments` in Settings;
- the gutter context menu (right-click on the gutter), with `Enable/Disable Diff Comments` and `Enable/Disable File Comments` items;
- the `+` menu next to the AI Assistant chat input;
- the in-chat banner after a relevant trigger.

A change made in any of these places updates the rest.

### Behavior when a surface is disabled with existing comments

If the user disables comments on a surface that already has comments:

- gutter badges on that surface are hidden;
- the comments themselves are not deleted;
- the attachment chip with these comments stays in the AI Assistant chat input;
- a message send still includes these comments as context;
- re-enabling the surface restores badges on the original lines.

### Markdown-only mode when diff and file comments are disabled

If the user turns off both `Comments in diffs` and `Comments in editor files`, the feature degrades to a markdown-only mode:

- only comments in the markdown specification document remain creatable;
- existing diff and file comments remain attached to the specification per the rule above — hidden from gutters but kept in attachment chips and the Problems view;
- the specification attachment in the chat continues to aggregate the markdown comments;
- `Specify`, `Build`, and manual sends still include the markdown comments as context.

This makes the markdown specification a stable place to leave feedback even when the user has chosen to opt out of inline diff and file comments.

### Add Context Menu

The `+` menu in the AI Assistant chat continues to show comment surfaces per the general Code Notes model:

- comments in diffs are enabled by default;
- comments in editor files are disabled by default;
- `New` labels and the blue dot follow the existing discoverability behavior.

---

## Common Flows

### Flow 1. Commenting on the specification and starting Build

1. The user opens `Visit-Booking.md`.
2. The AI Assistant chat is attached to the specification and shows the spec attachment.
3. The user clicks the gutter comment icon next to a plan item or presses `⌥⇧K`.
4. The simplified composer opens under the markdown line.
5. The user writes a comment and clicks `Add a Comment`.
6. The comment stays under the markdown line; the gutter badge and inspection widget count update.
7. The `Visit-Booking.md` attachment in the AI Assistant chat shows the comment count.
8. The user clicks `Build` or simply sends a message in the chat.
9. The chat sends the specification context + unresolved comments.
10. The sent message preserves the attachment; hover shows the comment contents.

### Flow 2. Commenting on a generated diff related to the specification

1. The user runs `Build` from the specification.
2. The agent generates implementation changes and a diff.
3. The user opens `Diff VisitController.java`.
4. Diff comments are available by default.
5. The user leaves a comment on a diff range.
6. The comment appears under the diff line/range.
7. The AI Assistant chat still shows a single specification attachment, but its count now includes the diff comment.
8. When expanded, the attachment shows `Diff VisitController.java` as a nested source.

### Flow 3. Commenting on an editor file related to the specification

1. The user opens `VisitController.java` from the generated task/files list.
2. File comments are enabled via the general Code Notes banner, settings, gutter menu, or `+` menu.
3. The user leaves a comment on a line/range in the file.
4. The comment is linked to `Visit-Booking.md` because the file belongs to the active specification context.
5. The attachment count in the AI Assistant chat updates.
6. The Problems view shows the comment in the specification-level `Comments` section and in the local comments view of the active file when that file is selected.

### Flow 4. Reviewing aggregated comments before sending

1. The specification has comments from the markdown document, an editor file, and a generated diff.
2. The AI Assistant chat input shows a single aggregated `Visit-Booking.md` attachment with a total count.
3. The user expands the attachment.
4. The expanded list shows each source with its own count.
5. Hovering the aggregate chip or a source row shows a preview of the comment texts.
6. Clicking a source navigates to the corresponding markdown/file/diff location.

### Flow 5. Problems View as the specification's comment inbox

1. The user opens the Problems view while the specification is active.
2. The root row is `Visit-Booking.md`.
3. Under it, a separate `Comments N` section appears.
4. Comments from the markdown document, generated diffs, and editor files appear as nested rows.
5. Selecting a row navigates to the source and focuses the comment popup.

---

## Acceptance Criteria

- The user can create a comment directly in an SDD markdown document via the gutter icon or `⌥⇧K`.
- A markdown comment uses the simplified composer and stays visible under the target line after saving; line ranges in the markdown specification are not supported.
- A comment is linked to the active specification by default when a markdown document is open.
- The user can choose a different chat target, and the specification context is attached to that chat together with the comment.
- The AI Assistant chat shows a specification attachment with a comment count.
- The specification attachment aggregates comments from the markdown document, generated diffs, and related editor files.
- The attachment can be expanded into per-source rows.
- Hover on draft or sent attachments shows a preview of the comment contents.
- `Specify`, `Build`, and manual message sends in a specification-attached chat all send the specification context + unresolved comments attached to the specification.
- Sent chat messages preserve the specification attachment and hover preview.
- Generated diff comments are enabled by default and can be linked back to the specification.
- Comments in editor files follow the general Code Notes enablement model and can be linked back to the specification.
- The Problems view shows a first-level `Comments` section under the specification and second-level rows for individual comments.
- The inspection widget shows the total comment count for the specification.
- The inspection widget may show a blue dot when comments from related files/diffs need the user's attention.
- Editing or deleting a comment updates editor badges, attachment counts in the AI Assistant chat, Problems view counts, and inspection widget counts.
- Deleting a comment from any surface (markdown body, Problems view, editor file, or diff) removes it from every surface at once.
- Removing the draft attachment chip from the input deletes all comments aggregated under it globally; the chip reappears only when the user creates a new comment linked to the specification.
- A pending state on a sent comment is indicated by a loader in the context header; the comment is read-only until the agent completes processing.
- Hover on a gutter badge shows a `+` to add another comment to the same line.
- Multiple comments on a single line are displayed in the popup grouped by session/source.
- Disabling a feature on a surface hides the gutter badges but preserves attachment chips and the ability to send.
- Enabling and disabling file comments is synchronized across Settings, the gutter context menu, the `+` menu, and the in-chat banner.
- When the composer is opened, the current line selection stays highlighted and focus is moved to the text field.
- Draft attachment chips of an inactive session are hidden from the input when switching between chats.
- Comment settings live under `Tools → AI Assistant → Comments` and include `Comments in diffs` (on by default) and `Comments in editor files` (off by default); markdown specification comments are not gated by these settings.
- When both diff and file comments are turned off, the markdown specification still supports creating new comments, and existing diff/file comments remain attached to the specification.

---
