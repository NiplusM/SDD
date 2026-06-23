# AGENTS.md

## Project Overview

This repository is a Vite + React prototype for JetBrains-style code review and plan-diff flows. The app uses `@jetbrains/int-ui-kit` as the primary component system and includes a Figma plugin export under `figma-plugin/`.

## Repository Structure

- `src/` contains the React application.
- `src/main.jsx` chooses between the main app and the standalone plan-diff page based on the current path.
- `src/App.jsx` contains the main IDE-like prototype flow.
- `src/PlanDiffPage.jsx`, `src/PlanDiffView.jsx`, and `src/planDiffPageState.js` contain the standalone plan-diff experience and shared state helpers.
- `src/Specifications/` contains design and scenario reference material. Treat these as source requirements, not generated output.
- `figma-plugin/` contains the Figma plugin manifest, controller code, and UI HTML.
- `scripts/run-jvm-scenario.mjs` runs the JVM scenario with Playwright and can create screenshots under `test-results/`.

## Development Commands

- Install dependencies with `npm install` when needed.
- Start the local app with `npm run dev`.
- Build production assets with `npm run build`.
- Preview a production build with `npm run preview`.
- Run the JVM scenario with `npm run scenario:jvm`.
- For deterministic CI-style scenario output, use `npm run scenario:jvm -- --headless`.

## Implementation Guidelines

- Prefer existing JetBrains Int UI Kit components and local helper components over custom controls.
- Preserve the IDE-like shell: compact density, dark layered surfaces, editor-first layout, tool windows, tabs, stripes, and status bar rhythm.
- Keep visual changes consistent with `src/Specifications/AGENT_DESIGN_GUIDE.md` and the other files in `src/Specifications/`.
- Keep product-specific demo constants near the existing constants in the relevant component unless they are shared by multiple modules.
- Use `Inter` for UI text and `JetBrains Mono` for code/editor-like content, following the existing CSS.
- Keep route/path behavior centralized through `planDiffPageState.js` when changing the standalone plan-diff page.
- Do not introduce unrelated icon systems when an Int UI Kit icon or existing local icon component is available.

## Generated And External Artifacts

- Do not edit `node_modules/`.
- Do not edit `dist/` unless the task explicitly asks for committed build output.
- Do not edit `test-results/` or `playwright-report/` by hand; regenerate them through scripts.
- Avoid committing local environment files, caches, screenshots, and IDE metadata covered by `.gitignore`.

## Verification

- Run `npm run build` after application code changes.
- Run `npm run scenario:jvm -- --headless` when changes affect the JVM scenario, plan-diff flow, or the interaction sequence.
- If a change is limited to documentation or this instruction file, a build is not required.

## Working Notes For Agents

- The dependency on `@jetbrains/int-ui-kit` is sourced from a GitHub package URL in `package.json`; network access may be needed to reinstall dependencies.
- The Vite config patches the Int UI Kit stylesheet to remove the remote Google Fonts import. Preserve this behavior unless the font-loading strategy is intentionally changed.
- The app intentionally exposes `window.React` in `src/main.jsx` for bundled library compatibility. Do not remove it without verifying the Int UI Kit bundle still renders correctly.
