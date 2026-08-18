# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A Vite + React prototype for JetBrains-style code review and plan-diff flows. It uses `@jetbrains/int-ui-kit` (installed from a GitHub package URL) as the primary component system, and includes a Figma plugin export under `figma-plugin/`. This is a UI prototype, not a production app — there is no test framework beyond scripted Playwright scenarios.

## Commands

- `npm install` — install dependencies (may need network access; `@jetbrains/int-ui-kit` is fetched from a GitHub URL, not npm).
- `npm run dev` — start the Vite dev server.
- `npm run build` — build production assets. Run this after any application code change to verify.
- `npm run preview` — preview a production build.
- `npm run scenario:jvm` — run the "JVM scenario" end-to-end walkthrough via `scripts/run-jvm-scenario.mjs` (Playwright-driven, starts its own dev server on port 4173).
  - `npm run scenario:jvm -- --headless` for deterministic, CI-style output. Run this when changes affect the JVM scenario, plan-diff flow, or the interaction sequence.
  - `SCENARIO_URL=<url>` reuses an already-running server instead of spawning one.
  - Screenshots land in `test-results/jvm-scenario/`.
- `node scripts/run-ai-review-scenario.mjs` — a second scripted scenario (AI review flow), same conventions as above (`--headed` to show the browser, `AI_REVIEW_SCENARIO_URL`/`SCENARIO_URL` to reuse a server). Not wired into `package.json` — invoke directly with `node`.
- If a change is limited to documentation only, a build is not required.

There is no lint script and no unit test runner configured — verification is via `npm run build` (compiles/type-checks JSX) and the Playwright scenario scripts (behavioral smoke tests).

## Architecture

### Entry and routing

`src/main.jsx` is the sole entry point. It picks between two independent root components based on `window.location.pathname`:
- `App.jsx` — the main IDE-like prototype (editor, tool windows, AI chat, commit review, etc.).
- `PlanDiffPage.jsx` — a standalone plan-diff review page.

Routing is not a real router — `planDiffPageState.js` centralizes the one route decision (`isPlanDiffPagePath`, `PLAN_DIFF_PAGE_ROUTE = '/diff-tab'`, plus the `/plan-diff` alias) and the localStorage key (`PLAN_DIFF_PAGE_STORAGE_KEY`) used to hand state between the two pages. Any change to which paths map to which page must go through this file so both root components and any links/redirects stay in sync.

In dev mode (`import.meta.env.DEV`), `FlowRecorder.jsx` is also mounted alongside the root component — it's a dev-only tool for recording/replaying interaction flows, unrelated to the app's real UI.

`window.React` is deliberately exposed as a global in `main.jsx` because the bundled Int UI Kit calls `React.createElement` without importing React in some code paths. Don't remove this without confirming the kit still renders.

### `App.jsx`: single-file monolith

`App.jsx` is ~34k lines and is the main prototype surface — it is not split into a components directory. It contains, in one file: the AI chat toolbar/dropdown, commit tool window and file-severity grouping/sorting, terminal/agent-run simulation (building terminal blocks/frames/sequences for a scripted agent run), issue/checklist state machines (run statuses, quick fixes, outdated tracking, remapping indices when issues are removed), the success banner, and the final `export default function App()` composing all of it. When making changes here, search for the relevant top-level `function`/`const ... = forwardRef(...)` first rather than assuming a conventional component-per-file layout — related logic (e.g., "issue index remapping") is usually clustered by name (`mapOriginalIssueIndexToVisible`, `remapRunStatusesForRemovedIssueIndices`, etc.) rather than by file.

Sibling files pulled out of `App.jsx`'s domain by concern:
- `commentCounts.js` — the single source of truth for counting messages in a comment thread (a comment can carry an `agentReply` and a `userReply`, so one stored object can represent up to 3 messages) and for whether text is a "question" (`textLooksLikeQuestion`, i.e., contains `?`). Every UI surface that shows a comment/thread count (gutter balloon, chat-history folder, composer chip) must go through these helpers — don't reimplement the counting logic inline.
- `aiChatCommentPreview.js`, `aiChatAttachmentParts.jsx`, `aiNoteHints.js`, `AiChatAddContextPopup.jsx`, `AiChatListParts.jsx`, `ChatsHistory.jsx`, `ComposerFollowUpQueue.jsx` — AI chat composer/history/attachment support code split out of `App.jsx`.
- `finalPresetModel.js`, `FinalPresetDialog.jsx`, `FinalPresetParts.jsx` — the "final preset" flow's model and UI.
- `EditorSelectionToolbar.jsx`, `IjAirFollowUpBulletIcon.jsx`, `AgentsCatalogueEditor.jsx` — smaller focused components.

### Plan-diff flow

`PlanDiffPage.jsx` composes `MainToolbar`/`MainWindow`/`ThemeProvider` from the Int UI Kit with `PlanDiffEditorArea` from `PlanDiffView.jsx` (~6.4k lines: the diff rendering engine — row kinds like `context`/added/removed, fragments with tone, gutter, comments-on-diff UI). Default row/demo data for the plan-diff view lives inline near the top of `PlanDiffPage.jsx`.

### Styling

- `App.css` (~23k lines) holds essentially all custom CSS for the main app, layered on top of the Int UI Kit's own stylesheet.
- Fonts: `Inter` for UI text, `JetBrains Mono` for code/editor content (see `fonts.css`). `vite.config.js` patches the Int UI Kit's bundled stylesheet at build/dev time (`patchIntUiKitStyles` plugin) to strip its remote Google Fonts `@import`, since fonts are self-hosted via `fonts.css` instead — preserve this behavior unless intentionally changing the font-loading strategy.

### Specifications directory

`src/Specifications/` contains the design/requirements documents this prototype implements (e.g., `AGENT_DESIGN_GUIDE.md`, `COMMENTS_IMPLEMENTED_SPEC.md`, `PRD_FILE_DIFF_COMMENTS_FLOW.md`, `spec-flow.md`). Treat these as source-of-truth requirements to consult, not generated output — don't edit them to match code; edit code to match them (or flag the mismatch).

### Figma plugin

`figma-plugin/` (`manifest.json`, `code.js`, `ui.html`) is a separate, self-contained Figma plugin export for reproducing the IDE prototype's design in Figma. It's independent of the Vite app's build.

## Working conventions

- Prefer existing `@jetbrains/int-ui-kit` components and existing local helper components over new custom controls; don't introduce an unrelated icon system when a Kit icon or existing local icon component already covers the case.
- Preserve the IDE-like shell: compact density, dark layered surfaces, editor-first layout, tool windows, tabs, stripes, status bar rhythm. Keep visual changes consistent with `src/Specifications/AGENT_DESIGN_GUIDE.md` and the other spec files.
- Keep product-specific demo constants near the existing constants in the component that uses them, unless shared across modules.
- Do not edit `node_modules/`, `dist/` (unless a task explicitly asks for committed build output), or `test-results/`/`playwright-report/` (regenerate via the scenario scripts instead).
