# JetBrains Int UI Kit — Agent Design Guide

> **Reference repository:** https://github.com/helloeldar/my-component-library.git
>
> This file is a self-contained specification for AI agents generating new web projects based on the JetBrains Int UI Kit (`@jetbrains/int-ui-kit`). Do **not** copy the repository into a new project — install it as a dependency (see §1). Use this guide as the single source of truth for design decisions, component props, exact token values, and behavioral rules.

---

## Table of Contents

1. [Project Setup](#1-project-setup)
2. [Core Architecture](#2-core-architecture)
3. [Themes](#3-themes)
4. [Typography](#4-typography)
5. [Color Tokens](#5-color-tokens)
6. [Icon System](#6-icon-system)
7. [Layout Principles](#7-layout-principles)
8. [Components — Full Reference](#8-components--full-reference)
   - [MainWindow](#81-mainwindow)
   - [ToolWindow](#82-toolwindow)
   - [Button](#83-button)
   - [Tooltip family](#84-tooltip-family)
   - [Dialog & Alert](#85-dialog--alert)
   - [Popup](#86-popup)
   - [Tree](#87-tree)
   - [StatusBar](#88-statusbar)
   - [TabBar & Tab](#89-tabbar--tab)
   - [Form Controls](#810-form-controls)
   - [Specialized Tool Windows](#811-specialized-tool-windows)
   - [Custom Welcome Screen](#812-custom-welcome-screen-welcomeprojectspanel)
9. [Behavioral Patterns](#9-behavioral-patterns)
10. [Anti-patterns](#10-anti-patterns)
11. [Complete Starter Template](#11-complete-starter-template)

---

## 1. Project Setup 

### Install the library (never copy the source)

```bash
# From npm (published):
npm install @jetbrains/int-ui-kit

# From Git (latest, including unpublished changes):
npm install git+https://github.com/helloeldar/my-component-library.git
```

### Peer dependencies

```bash
npm install react@^18 react-dom@^18
```

### App entry point (required)

The library is compiled with the **classic JSX runtime** and calls `React.createElement` as a bare global — it does **not** import React under that name. You must expose React on `window` before the first render, otherwise you will get `ReferenceError: React is not defined`.

**`src/main.jsx`** — copy this exactly:

```jsx
// src/main.jsx
import '@jetbrains/int-ui-kit/styles.css';   // ← MUST be first import
import * as React from 'react';              // ← namespace import
import { createRoot } from 'react-dom/client';
import App from './App.jsx';

window.React = React;                        // ← REQUIRED: exposes React globally for the library

createRoot(document.getElementById('root')).render(<App />);
```

**`src/App.jsx`** — root component:

```jsx
// src/App.jsx
import { useState } from 'react';
import { ThemeProvider, MainWindow } from '@jetbrains/int-ui-kit';

export default function App() {
  return (
    <ThemeProvider defaultTheme="dark">
      <MainWindow />
    </ThemeProvider>
  );
}
```

> **Why `window.React = React`?** The library bundle calls `React.createElement(...)` as a global variable reference. Setting `window.React` before `createRoot(...).render(...)` makes it available in the browser global scope at render time. Without this line the app renders a blank black page with a `ReferenceError` in the console.

### Build tooling

Works with Vite (recommended), Create React App, Next.js. No special bundler configuration needed — the `window.React` fix above is sufficient.

---

## 2. Core Architecture

The library provides three levels of abstraction:

| Level | What you get | When to use |
|---|---|---|
| **Full IDE screens** | `MainWindow`, `WelcomeDialog`, `SettingsDialog` — complete layouts with realistic defaults | Start here for IDE prototypes |
| **Tool windows** | `ToolWindow`, `TerminalWindow`, `ProjectWindow`, etc. | Composing panels inside a layout |
| **UI primitives** | `Button`, `Input`, `Tree`, `Icon`, `Tooltip`, etc. | Building custom content inside panels |

### The "override only what matters" philosophy

Every prop is optional and has a realistic default. Start from `<MainWindow />` with no props, then add props one at a time until the prototype matches the scenario. Never rebuild from scratch what the library already provides.

### Default data exports

Import these to tweak without replacing entire data structures:

| Export | Contains |
|---|---|
| `DEFAULT_LEFT_STRIPE_ITEMS` | Left stripe button definitions |
| `DEFAULT_RIGHT_STRIPE_ITEMS` | Right stripe button definitions |
| `DEFAULT_EDITOR_TABS` | 5 editor tab definitions |
| `DEFAULT_EDITOR_TAB_CONTENTS` | Code + language per default tab |
| `DEFAULT_JAVA_CODE` | Java source code string |
| `DEFAULT_PROJECT_TREE_DATA` | Project file tree |
| `DEFAULT_BREADCRUMBS` | Status bar breadcrumbs |
| `DEFAULT_WIDGETS` | Status bar widget items |
| `DEFAULT_PROJECTS` | WelcomeDialog recent projects |
| `DEFAULT_SETTINGS_TREE_ITEMS` | SettingsDialog navigation tree |
| `DEFAULT_COMMITS` | VCSLogWindow commit entries |
| `DEFAULT_COMMIT_DETAILS` | VCSLogWindow commit metadata |
| `defaultLeftPanelContent` | Default left panel renderer function |
| `defaultRightPanelContent` | Default right panel renderer function |
| `defaultBottomPanelContent` | Default bottom panel renderer function |

---

## 3. Themes

### Available themes

| Theme | CSS class | Description |
|---|---|---|
| **Dark** (default) | `theme-dark` | Islands dark — rounded panels, gaps, gradient backgrounds |
| **Light** | `theme-light` | Islands light variant |

**Rule:** Use dark theme by default. The Islands visual style (rounded panels, gaps, gradient backgrounds) is the only supported theme. Do NOT implement or reference the old flat "New UI" theme.

### ThemeProvider

```jsx
import { ThemeProvider, useTheme } from '@jetbrains/int-ui-kit';

// Force dark
<ThemeProvider defaultTheme="dark">...</ThemeProvider>

// Toggle
function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  return <button onClick={toggleTheme}>Theme: {theme}</button>;
}
```

---

## 4. Typography

### Typefaces

| Context | Font | Import |
|---|---|---|
| All UI text | **Inter** | Loaded via library CSS |
| Code, terminals, paths, line numbers | **JetBrains Mono** | Loaded via library CSS |

**Rule:** Never set `font-family` explicitly on normal UI text inside tool windows — it is inherited from `body`. Only set `font-family: 'JetBrains Mono', monospace` for content that is **code or directly code-related**.

### UI text styles (Inter)

| Style | CSS class | Size | Weight | Line-height | Use for |
|---|---|---|---|---|---|
| H1 | `.text-ui-h1` | 20px | 600 | 24px | Main page header (plugin name) |
| H2 | `.text-ui-h2` | 16px | 600 | 20px | Dialog titles, page headers |
| Default | `.text-ui-default` | 13px | 500 | 16px | Labels, inputs, links, trees, tables |
| Default semibold | `.text-ui-default-semibold` | 13px | 600 | 16px | Dialog/popup/notification/tool window headers |
| Paragraph | `.text-ui-paragraph` | 13px | 500 | 18px | Multiline description text |
| Small (Medium) | `.text-ui-small` | 12px | 500 | 16px | Help text, muted secondary info |
| Small semibold | `.text-ui-small-semibold` | 12px | 600 | 16px | Group headers in popups |

### Editor text styles (JetBrains Mono)

| Style | CSS class | Size | Weight | Line-height |
|---|---|---|---|---|
| Default | `.text-editor-default` | 13px | 400 | 22px |
| Default bold | `.text-editor-default-bold` | 13px | 700 | 22px |
| Small | `.text-editor-small` | 12px | 400 | 22px |
| Small bold | `.text-editor-small-bold` | 12px | 700 | 22px |

### When to use JetBrains Mono

✅ Use for: code snippets, file paths, terminal output, line/column numbers (`5:2`), encoding labels (`UTF-8`, `LF`), technical durations (`2m`, `3h`)

❌ Do NOT use for: task names, labels, descriptions, tool window titles, section headers, prose text, timestamps like "2 hours ago"

### Weight mapping note

Figma uses Medium (500) for most UI text. This library follows Figma weights directly. The actual IntelliJ IDE maps Medium → Regular due to platform rendering — this library matches Figma, not the IDE renderer.

---

## 5. Color Tokens

All colors are CSS custom properties. Always use tokens — never hardcode hex values in component code.

### Text tokens

| Token | Light | Dark | Use for |
|---|---|---|---|
| `--text-primary` | `#000000` | `#D1D3D9` | Primary text |
| `--text-default` | `#000000` | `#BBBBBB` | Default labels, inputs |
| `--text-muted` | `#5F6269` | `#9FA2A8` | Secondary info, shortcuts, help text |
| `--text-disabled` | `#8C8C8C` | `#777777` | Disabled controls |
| `--text-link` | `#2F5EB9` | `#71A1FE` | Links, modified file count |

### Control tokens

| Token | Use for |
|---|---|
| `--control-border` | Default control border (input, button secondary) |
| `--control-border-disabled` | Disabled control border |
| `--control-focus-border-brand` | Focus ring color (2px solid) |
| `--button-primary-bg` | Primary button background (blue) |
| `--button-primary-text` | Primary button text (white) |
| `--button-secondary-bg` | Secondary button background (transparent) |
| `--button-secondary-border` | Secondary button border |

### Selection tokens

| Token | Use for |
|---|---|
| `--selection-bg-hovered` | Row hover background |
| `--selection-bg-active` | Selected row background |

### Tool window tokens

| Token | Use for |
|---|---|
| `--tool-window-border` | Tool window borders and separators |
| `--tool-window-tab-selected-bg` | Inactive selected tab background |
| `--tool-window-tab-selected-bg-active` | Active (focused) selected tab background |
| `--tool-window-tab-selected-border` | Inactive selected tab border |
| `--tool-window-tab-selected-border-active` | Active (focused) selected tab border |

### Tooltip tokens

| Token | Light | Dark |
|---|---|---|
| `--tooltip-bg` | `#FFFFFF` | `#33353B` |
| `--tooltip-text` | `#000000` | `#D1D3D9` |
| `--tooltip-border` | `#D1D3D9` | `#33353B` |
| `--tooltip-shortcut` | `#5F6269` | `#9FA2A8` |

### Dialog tokens

| Token | Light | Dark |
|---|---|---|
| `--dialog-bg` | `var(--white)` | `#26282C` |
| `--dialog-border` | `var(--gray-130)` | `var(--gray-50)` |
| `--dialog-shadow` | `0 8px 32px rgba(0,0,0,0.15)` | `0 8px 32px rgba(0,0,0,0.4)` |

### Validation tokens

| Token | Light | Dark |
|---|---|---|
| `--validation-error-bg` | `#FFF6F5` | `#56272B` |
| `--validation-error-border` | `#FFC4C5` | `#80383E` |
| `--validation-warning-bg` | `#FFF6E9` | `#44321D` |
| `--validation-warning-border` | `#F4CD9A` | `#694820` |

### VCS status tokens

| Status | Token | Light | Dark |
|---|---|---|---|
| Modified | `--text-link` | Blue | Blue |
| Added | `--vcs-added-text` | `var(--green-70)` | `var(--green-100)` |
| Deleted | `--vcs-deleted-text` | `var(--red-80)` | `var(--red-90)` |

### Transparent overlay tokens

Use these for subtle always-on backgrounds and hover states on custom items (e.g. disclosure buttons):

| Token | Value | Use for |
|---|---|---|
| `--transparent-white-10` | `#ffffff12` (~7%) | Default background on custom interactive rows |
| `--transparent-white-20` | `#ffffff17` (~9%) | Hover state for the above |
| `--transparent-white-30` | `#ffffff21` (~13%) | Pressed / active state |
| `--transparent-black-10` | `#00000008` | Same purpose in light theme |

> `--selection-bg-hovered` equals `--transparent-white-10` in dark mode — use the transparent tokens directly when you need both resting and hover backgrounds.

### Stripe token overrides (Islands theme)

The Islands theme stripes sit on a dark background — they use transparent white overlays:

| State | Token | Value |
|---|---|---|
| Hovered | `toolbar/toolbar-bg-hovered` | `#FFFFFF17` (9% white) |
| Pressed / Inactive | `toolbar/toolbar-bg-pressed` | `#FFFFFF29` (16% white) |

### Icon action color palette

| Color | Light hex | Dark hex | Use for |
|---|---|---|---|
| Grey | `#6E6E6E` | `#AFB1B3` | Default monochromatic action icons |
| Green | `#59A869` | `#499C54` | Positive: run, create |
| Red | `#DB5860` | `#C75450` | Destructive: stop, remove, force |
| Blue | `#389FD6` | `#3592C4` | Accent, popular icons, small elements |
| Yellow | `#EDA200` | `#F0A732` | Warning: attract attention, optimization hints |

---

## 6. Icon System

The library includes **1,884 icons** from the IntelliJ Platform icon set.

### How to reference icons

Icons are referenced by path string — folder + filename, no `.svg`, no `_dark` suffix. The library auto-selects the themed variant.

```jsx
import { Icon } from '@jetbrains/int-ui-kit';

<Icon name="fileTypes/java" size={16} />
<Icon name="nodes/folder" size={16} />
<Icon name="toolwindows/terminal@20x20" size={20} />
```

Icons also work in component props:

```jsx
{ id: '1', label: 'App.tsx', icon: 'fileTypes/typescript', closable: true }  // editor tab
{ id: 'src', label: 'src', icon: 'nodes/folder' }                            // tree node
{ id: 'terminal', icon: 'toolwindows/terminal@20x20', tooltip: 'Terminal' }  // stripe button
```

### Icon size guidelines

| Context | Size | Icon variant |
|---|---|---|
| Gutter, status bar | 12px | Standard |
| Tool window stripe | 13px | Standard |
| **Default: toolbar, tree, tabs** | **16px** | Standard |
| Dialogs | 32px | Standard |
| Left/right stripe buttons | 20px | `@20x20` variants |

### Icon categories

#### `fileTypes/` — File type icons (editor tabs, trees)

`java` · `javaScript` · `typeScript` · `kotlin` · `python` · `css` · `html` · `json` · `jsonSchema` · `xml` · `yaml` · `text` · `properties` · `config` · `svg` · `image` · `archive` · `csv` · `manifest` · `regexp` · `http` · `gitignore` · `editorConfig` · `modified` · `changedFile` · `ignored` · `markdown`

#### `nodes/` — Tree / project structure icons

`folder` · `sourceRoot` · `testRoot` · `resourcesRoot` · `package` · `class` · `classAbstract` · `interface` · `enum` · `record` · `method` · `methodAbstract` · `field` · `variable` · `function` · `lambda` · `parameter` · `constant` · `property` · `constructor` · `annotation` · `module` · `moduleJava` · `library` · `libraryFolder` · `jdk` · `plugin` · `ppLibFolder` · `homeFolder` · `star` · `shared` · `symlink` · `unknown`

#### `toolwindows/` — Stripe icons (use `@20x20` in stripes)

`project@20x20` · `commit@20x20` · `terminal@20x20` · `problems@20x20` · `vcs@20x20` · `structure@20x20` · `find@20x20` · `run@20x20` · `debug@20x20` · `build@20x20` · `notifications@20x20` · `hierarchy@20x20` · `messages@20x20` · `coverage@20x20` · `profiler@20x20` · `dependencies@20x20` · `bookmarks@20x20` · `documentation@20x20` · `services@20x20` · `endpoints@20x20` · `changes@20x20` · `dbms@20x20` · `maven@20x20` · `gradle@20x20` · `npm@20x20` · `todo@20x20` · `learn@20x20` · `pullRequests@20x20` · `settingSync@20x20`

**AI:** `aiAssistant/toolWindowChat@20x20`

#### `general/` — General UI

`settings` · `search` · `filter` · `add` · `remove` · `close` · `collapseAll` · `expandAll` · `more` · `inline/close` · `inline/search` · `locked` · `unlocked` · `help` · `warning` · `error` · `information` · `copy` · `paste` · `refresh` · `print` · `gear` · `hideToolWindow` · `externalToolsSmall`

#### `actions/` — Action icons

`addFile` · `addDirectory` · `newFolder` · `install` · `preview` · `deploy` · `lightning` · `highlighting` · `refresh` · `forceRefresh` · `groupByModule` · `groupByPackage` · `groupByFile` · `minimap` · `inSelection` · `findForward` · `findBackward` · `learn`

#### `run/` — Run configs

`run` · `debug` · `stop` · `restart` · `rerun`

#### `vcs/` — Version control

`vcs` · `commit` · `push` · `fetch` · `update` · `merge` · `diff` · `revert` · `changelist` · `changes` · `shelve` · `unshelve` · `patch` · `remove` · `abort` · `arrowLeft` · `arrowRight`

> **Note:** `vcs/branch`, `vcs/pull`, `vcs/rollback` do **not** exist in the library. Use `vcs/vcs` as the general VCS icon (e.g. for a "Clone" button).

#### `status/` — Status indicators

`success` · `warning` · `error` · `info` · `failed`

#### `debugger/` — Debugger

`db_set_breakpoint` · `db_invalid_breakpoint` · `threadRunning` · `threadSuspended` · `stackFrame` · `watch` · `evaluate` · `stepOver` · `stepInto` · `stepOut`

### Icon design rules

- Flat geometric style, straight corners and edges — no 3D forms
- Use 45°/90° angles (or 30°/60° where possible)
- 2px stroke as main drawing line
- Icon visible area for 16px icons: 14×14px (1px transparent border)
- SVG format, camelCase names: `iconName.svg`, dark variant: `iconName_dark.svg`
- Do NOT use color as the only differentiator — shapes must be distinguishable
- No gradients, no shadows
- Default icons are grey/monochromatic; use color only for semantic meaning (green=run, red=stop, etc.)

### Animated status icon

For "running" status — use the animated `<Loader>` component, NOT `<Icon name="loader">`:

```jsx
import { Loader } from '@jetbrains/int-ui-kit';
<Loader size={16} />
```

---

## 7. Layout Principles

### Dialog layout rules

- Put input controls with similar-length labels on different lines, left-aligned
- Max 2 columns for short inputs (up to 10 chars label, short box)
- Always left-align labels (consistent across all platforms)
- Independent checkboxes/radio buttons on different lines by default
- 2–3 short checkboxes (1–3 word labels) can share a line
- Do NOT arrange radio buttons in columns (breaks visual grouping)
- 2–3 buttons up to 30 chars each → same line; more → column
- Use vertical insets to group related controls; incorrect insets create false groupings

### Dependent controls

- Dependent controls align with the **left border of the input box** of the parent
- When parent is a checkbox/radio, align dependents with the label text
- Controls that take full width → left-align all dependents

### Lists, trees, tables

- Width to show most common values; full dialog width if needed
- Do NOT put independent controls to the right of a list/tree/table

---

## 8. Components — Full Reference

### 8.1 MainWindow

The complete IDE layout component. Provides editor, stripes, tool windows, toolbar, status bar.

```jsx
import { ThemeProvider, MainWindow } from '@jetbrains/int-ui-kit';

<ThemeProvider defaultTheme="dark">
  <MainWindow
    height={800}                          // px or '100%', default 800
    projectName="my-project"
    projectIcon="MP"                      // 2-letter initials shown in toolbar
    projectColor="blue"                   // cobalt | blue | green | purple | orange | red
    branchName="feature/login"
    runConfig="MyApplication"

    editorTabs={[
      { id: '1', label: 'App.tsx', icon: 'fileTypes/typescript', closable: true },
    ]}
    editorCode={`const x = 1;`}
    editorLanguage="typescript"           // java | typescript | javascript | python | etc.
    editorTabContents={{                  // per-tab code override
      '1': { language: 'typescript', code: 'const x = 1;' },
    }}

    projectTreeData={[ /* TreeNodeData[] */ ]}

    leftStripeItems={[ /* StripeItemDef[] */ ]}
    rightStripeItems={[ /* StripeItemDef[] */ ]}
    defaultOpenToolWindows={['project', 'terminal']}

    leftPanelContent={(id, ctx) => { /* render function */ }}
    rightPanelContent={(id, ctx) => { /* render function */ }}
    bottomPanelContent={(id, ctx) => { /* render function */ }}

    statusBarProps={{ breadcrumbs: [], widgets: [] }}
    toolbar={<MyCustomToolbar />}         // replaces entire toolbar
    overlays={<SettingsDialog />}         // dialogs/modals render here

    onNavChange={(id) => {}}
  />
</ThemeProvider>
```

#### StripeItemDef shape

```ts
{
  id: string;
  icon: string | ReactNode;   // icon name or React element
  tooltip: string;
  section: 'top' | 'bottom';
  panel?: 'bottom';           // omit for left/right panels
  separator?: boolean;        // creates a split point in the left panel
  monochrome?: boolean;       // grayscale custom icons (see §9)
}
```

#### Built-in panel IDs

| Stripe item ID | `defaultLeftPanelContent` renders |
|---|---|
| `project` | `ProjectWindow` with project file tree |
| `commit` | `CommitWindow` with staged files + commit message |
| anything else | Generic `ToolWindow` placeholder |

| Stripe item ID | `defaultRightPanelContent` renders |
|---|---|
| `ai` | `AIAssistantWindow` |
| anything else | Generic `ToolWindow` placeholder |

| Stripe item ID (with `panel: 'bottom'`) | `defaultBottomPanelContent` renders |
|---|---|
| `terminal` | `TerminalWindow` with tab management |
| `git` | `VCSLogWindow` |
| `problems` | `ProblemsWindow` |
| anything else | Generic `ToolWindow` placeholder |

#### PanelContext type

```ts
interface PanelContext {
  projectName: string;
  projectTreeData: TreeNodeData[];
  defaultSelectedNodeId?: string;
  focusedPanel: 'editor' | 'left' | 'right' | 'bottom';
  setFocusedPanel: (panel: 'editor' | 'left' | 'right' | 'bottom') => void;
  setShowLeftPanel: (show: boolean) => void;
  setShowRightPanel: (show: boolean) => void;
  setShowBottomPanel: (show: boolean) => void;
  terminalTabs: { label: string; closable?: boolean }[];
  activeTerminalTab: number;
  setActiveTerminalTab: (index: number) => void;
  handleTerminalTabClose: (index: number) => void;
  handleTerminalTabAdd: () => void;
}
```

#### Split left panel

Add a `separator` item to split the left column into two independent sub-panels:

```jsx
const leftStripeItems = [
  { id: 'project',     icon: 'toolwindows/project@20x20',   tooltip: 'Project',     section: 'top' },
  { id: '_sep',        separator: true,                                               section: 'top' },  // ← split point
  { id: 'agent-tasks', icon: myReactIcon,                    tooltip: 'Agent Tasks', section: 'top', monochrome: true },
  { id: 'terminal',    icon: 'toolwindows/terminal@20x20',   tooltip: 'Terminal',    panel: 'bottom', section: 'bottom' },
];
```

Items before separator → top sub-panel. Items after → bottom sub-panel. Both independently open/closeable.

---

### 8.2 ToolWindow

Generic container for all tool window panels.

```jsx
import { ToolWindow } from '@jetbrains/int-ui-kit';

<ToolWindow
  title="Panel Title"
  icon="nodes/folder"              // optional header icon
  width={300}                      // number or string CSS value
  height={400}                     // number or 'auto'
  headerType="label"               // 'label' | 'tabs'
  tabs={[{ label: 'Tab 1' }]}      // for headerType="tabs"
  activeTab={0}
  showSeparator={false}            // 1px line under header
  actions={['add', 'more', 'minimize']}
  toolbarExtra={<MyButtons />}     // custom content between title and actions
  focused={false}
  onFocus={() => {}}
  onActionClick={(action, ...args) => {
    if (action === 'add')      handleAdd();
    if (action === 'minimize') ctx.setShowLeftPanel(false);
    if (action === 'tabClose') handleTabClose(args[0]);  // args[0] = tab index
  }}
  className="main-window-tool-window main-window-tool-window-left"
>
  {/* content */}
</ToolWindow>
```

#### Action strings

| String | Icon | Use for |
|---|---|---|
| `'add'` | `+` | Create new item (tab, task, chat…) |
| `'more'` | `⋮` | Overflow menu |
| `'minimize'` | `—` | Hide / collapse the panel |
| `'close'` | `✕` | Close (floating windows) |

#### Header layout

```
[ Title ] [ toolbarExtra? ] [ ...actions ]
```

#### Sidebar toolbar pattern (horizontal tool windows)

Horizontal tool windows (bottom panel) carry a **vertical** sidebar toolbar. Use this CSS structure:

```css
.xxx-body {
  display: flex;
  flex-direction: row;
  flex: 1;
  min-height: 0;
}
.xxx-sidebar-toolbar {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 35px;
  flex-shrink: 0;
  padding: 7px 5px 7px 4px;
  border-left: 1px solid var(--tool-window-border);
  box-sizing: border-box;
}
```

#### Toolbar buttons rule

Every button inside any IDE toolbar must use a toolbar component — never raw `<button>`:

| Need | Use | Not |
|---|---|---|
| Icon-only action | `<IconButton icon="..." />` | `<button><Icon /></button>` |
| Text + icon | `<ToolbarButton text="..." icon="..." />` | custom `<button>` |
| Separator | `<ToolbarSeparator />` | `<div style={{ borderLeft: ... }} />` |

---

### 8.3 Button

```jsx
import { Button } from '@jetbrains/int-ui-kit';

<Button type="primary" size="default" disabled={false}>OK</Button>
<Button type="secondary">Cancel</Button>
<Button type="secondary" size="slim">Action</Button>
```

#### Props

| Prop | Values | Default | Description |
|---|---|---|---|
| `type` | `'primary'` \| `'secondary'` | `'secondary'` | Visual style — always set explicitly |
| `size` | `'default'` \| `'slim'` | `'default'` | Height variant |
| `disabled` | boolean | `false` | Disabled state |
| `focused` | boolean | `false` | Keyboard focus ring |

#### Exact sizes

| Size | Height | Padding | Font | Min-width |
|---|---|---|---|---|
| Default | 28px | `5px 12px` | 13px / 500 | 72px |
| Slim | 24px | `3px 12px` | 13px / 500 | 72px |

#### Visual tokens

| Type | Background | Text | Border |
|---|---|---|---|
| Primary | `var(--button-primary-bg)` (blue) | `var(--button-primary-text)` (white) | — |
| Secondary | `var(--button-secondary-bg)` (transparent) | `var(--text-default)` | `1px solid var(--button-secondary-border)` |
| Disabled (both) | `transparent` | `var(--text-disabled)` | `1px solid var(--control-border-disabled)` |

#### Focus ring

`::after` pseudo-element when `:focus-visible`:
- `inset: -4px`
- `border: 2px solid var(--control-focus-border-brand)`
- `border-radius: 7px`

#### Usage rules

| Context | Type |
|---|---|
| Dialog primary action (OK, Apply) | `primary` |
| Dialog secondary action (Cancel) | `secondary` |
| Popup footer action | `secondary` |
| Inline actions in tool windows | `secondary` |

---

### 8.4 Tooltip family

#### Tooltip (action tooltip)

Shows action name + optional keyboard shortcut on hover.

```jsx
import { Tooltip } from '@jetbrains/int-ui-kit';

<Tooltip text="Commit changes" shortcut="⌘K" placement="bottom" delay={500}>
  <button>Commit</button>
</Tooltip>
```

**Exact specs:**
- Padding: `8px` all sides
- Gap between text and shortcut: `8px`
- Border-radius: `4px`
- Border: `1px solid var(--tooltip-border)`
- Font: Inter 13px / 500
- Shadow: `0px 3px 12px rgba(27, 31, 38, 0.18)`
- Delay: 500ms
- Gap from trigger: 4px

Props: `text`, `shortcut?`, `placement` (`top|bottom|left|right`, default `bottom`), `delay` (ms, default `500`), `alwaysVisible?` (showcase only)

#### TooltipHelp (help tooltip)

Rich tooltip with header, body, shortcut, external link.

**Exact specs:**
- Width: `251px`
- Padding: `12px 16px`
- Gap between sections: `6px`
- Border-radius: `8px`
- Header: 13px / 600 (`text-ui-default-semibold`)
- Body: 13px / 500 (`text-ui-default`), color `--text-muted`
- Same shadow as Tooltip

Props: `header?`, `body`, `shortcut?`, `link?: { text, href, external }`

#### ValidationTooltip

Inline validation feedback near input fields.

**Exact specs:**
- Without actions: padding `8px` all sides
- With actions: padding `10px 12px 12px 12px`
- Gap between text and actions: `6px`
- Gap between action links: `16px`
- Border-radius: `4px`
- Same shadow as Tooltip

```jsx
<ValidationTooltip text="Value is required" type="error" actions={[{ label: 'Fix', onClick: handleFix }]} />
```

Props: `text`, `type` (`'error'|'warning'`, default `'error'`), `actions?: Array<{ label, onClick }>`

#### GotItTooltip

Feature discovery tooltip shown once per user.

**Exact specs:**
- Width: `280px` (top/bottom arrow) or `288px` (left/right arrow)
- Body padding: `12px 16px`
- Border-radius: `8px`
- Arrow: 16×8px (top/bottom), 8×16px (left/right), placed 16px from body edge
- Shadow: `0px 4px 12px rgba(0, 0, 0, 0.16)`
- Step counter: JetBrains Mono 13px / 500
- Header: 13px / 600
- Body: 13px / 500 / line-height 18px
- "Got It" button: border `1px solid var(--got-it-control-border)`, radius 4px, padding `6px 12px`, min-width 72px

Dark theme: background `#2E4D89` (blue), no visible border (same color)

Props: `header?`, `children`, `step?`, `link?`, `linkHref?`, `buttonText` (default `'Got It'`), `skipText?`, `arrowPosition` (`top|bottom|left|right`, default `top`), `onGotIt?`, `onSkip?`

---

### 8.5 Dialog & Alert

#### Alert

Simple modal with icon, title, body, optional checkbox, footer buttons.

```jsx
import { Alert } from '@jetbrains/int-ui-kit';

<Alert
  type="question"       // 'question' | 'error' | 'warning'
  title="Delete file?"
  body="This action cannot be undone."
  buttons={[
    { children: 'Delete', type: 'primary', onClick: handleDelete },
    { children: 'Cancel', onClick: handleCancel },
  ]}
/>
```

**Exact specs:**
- Width: `420px`
- Border-radius: `8px`
- Icon: 28×28px at top-left (`19px` from edges)
- Content left padding: `60px` (for icon clearance)
- Title: `text-ui-h2` (16px / 600)
- Body: `text-ui-paragraph` (13px / 500 / 18px)
- Footer: absolute, `bottom: 13px`, `left/right: 19px`, height `40px`
- Button gap: `12px`
- Shadow: `0 8px 32px rgba(0,0,0,0.4)` (dark) / `rgba(0,0,0,0.15)` (light)

Icon types:
- `question` → `general/questionDialog` (blue circle, `?`)
- `error` → `general/errorDialog` (red circle, `!`)
- `warning` → `general/warningDialog` (yellow triangle, `!`)

#### Dialog

Full dialog with macOS traffic lights, scrollable content, footer separator, footer buttons.

```jsx
import { Dialog } from '@jetbrains/int-ui-kit';

<Dialog title="Settings" onClose={handleClose} width={800} height={500}>
  <div style={{ padding: 20 }}>Content here</div>
</Dialog>
```

**Specs:**
- Border-radius: `8px`
- Header + footer separators: `1px solid var(--tool-window-border)`
- Same container tokens as Alert (`--dialog-bg`, `--dialog-border`, `--dialog-shadow`)

#### SettingsDialog

```jsx
import { SettingsDialog, DEFAULT_SETTINGS_TREE_ITEMS } from '@jetbrains/int-ui-kit';

<SettingsDialog
  title="Settings"
  width={900}
  height={600}
  treeItems={DEFAULT_SETTINGS_TREE_ITEMS}
  buttons={[
    { children: 'Cancel', onClick: handleClose },
    { children: 'OK', type: 'primary', onClick: handleSave },
  ]}
  onClose={handleClose}
>
  {/* optional: replaces the default right-panel content */}
</SettingsDialog>
```

---

### 8.6 Popup

Context menus and dropdowns. Must render above all layers.

```jsx
import { PositionedPopup, Popup, PopupCell } from '@jetbrains/int-ui-kit';

const [open, setOpen] = useState(false);
const [rect, setRect] = useState(null);

<button onClick={e => { setRect(e.currentTarget.getBoundingClientRect()); setOpen(true); }}>
  Open menu
</button>

{open && (
  <PositionedPopup triggerRect={rect} onDismiss={() => setOpen(false)} gap={4}>
    <Popup visible style={{ position: 'static' }}>
      <PopupCell icon="general/copy" shortcut="⌘C" onClick={handleCopy}>Copy</PopupCell>
      <PopupCell icon="general/paste" shortcut="⌘V" onClick={handlePaste}>Paste</PopupCell>
      <PopupCell type="separator" />
      <PopupCell icon="general/delete" onClick={handleDelete}>Delete</PopupCell>
    </Popup>
  </PositionedPopup>
)}
```

> **Critical:** `PositionedPopup` handles positioning only — it renders no background. Always wrap children in `<Popup visible style={{ position: 'static' }}>` to get the dark background, border-radius, and shadow.

#### PopupCell types

| `type` | Description | Key props |
|---|---|---|
| *(default / `"line"`)* | Standard menu item with icon + text + shortcut | `icon`, `children` (label), `shortcut`, `submenu`, `selected`, `onClick` |
| `"separator"` | Horizontal divider line | `text?` (optional label above the line) |
| `"header"` | Section header (non-clickable) | `children` (header text) |
| `"footer"` | Footer row | `children` |
| `"multiline"` | Icon + primary text + hint below | `icon`, `children`, `hint` |
| `"advanced"` | Icon + name + path/hint + shortcut/module | `icon`, `children`, `hint`, `shortcut`, `module`, `moduleIcon` |
| `"search"` | Inline search field | `placeholder`, `value`, `onChange` |

**Positioning rules:**
- Default: below trigger, left-aligned with trigger (`position: fixed`, `z-index: 10000`)
- Flips right→left when no space on right
- Flips bottom→top when no space on bottom
- Gap between trigger and popup: `4px`
- Click-outside overlay: `z-index: 9999`
- Only one popup open at a time — opening one closes others
- Trigger button keeps "pressed" visual state while popup is open

---

### 8.7 Tree

Use for any interactive list — not just file hierarchies. In the real IDE, `Tree` is reused for run configurations, bookmarks, AI chat sessions, agent tasks, etc.

```jsx
import { Tree } from '@jetbrains/int-ui-kit';

// Hierarchical tree
<Tree
  data={treeData}
  onNodeSelect={(id) => setSelected(id)}
/>

// Flat list (hides chevrons and indentation)
<Tree
  flat
  data={items}
  onNodeSelect={(id) => setSelected(id)}
/>
```

#### TreeNodeData shape

```ts
{
  id: string;
  label: string;
  icon?: string | ReactNode;       // icon name or React element
  secondaryText?: string;          // trailing muted text
  isExpanded?: boolean;
  children?: TreeNodeData[];
}
```

#### Custom row sizing (if not using Tree)

```css
.my-list-row {
  height: 24px;
  padding: 0 8px;
  display: flex;
  align-items: center;
  gap: 6px;
  border-radius: 4px;
  cursor: pointer;
}
.my-list-row:hover    { background: var(--selection-bg-hovered); }
.my-list-row.selected { background: var(--selection-bg-active); }
```

**Warning:** `.tool-window-content` already has `padding: 0 8px`. Do NOT add extra horizontal padding on the wrapper — it doubles the indent.

---

### 8.8 StatusBar

```jsx
import { StatusBar } from '@jetbrains/int-ui-kit';

<StatusBar
  breadcrumbs={[
    { label: 'my-project', module: true },
    { label: 'src' },
    { label: 'App.tsx', icon: true, iconName: 'fileTypes/typescript' },
  ]}
  widgets={[
    { type: 'text', text: '12:1' },
    { type: 'text', text: 'UTF-8' },
    { type: 'text', text: 'LF' },
  ]}
/>
```

Pass `breadcrumbs={[]} widgets={[]}` for intentionally empty status bar.

---

### 8.9 TabBar & Tab

Both editor tabs and tool window header tabs use the **same shared `Tab` component** — consistent height, gap, and styling across the entire IDE layout.

```jsx
import { TabBar, Tab } from '@jetbrains/int-ui-kit';

<TabBar>
  <Tab label="App.tsx" icon="fileTypes/typescript" active closable focused={focusedPanel === 'editor'} />
  <Tab label="index.html" icon="fileTypes/html" closable />
</TabBar>
```

#### Focus behavior

| State | Effect |
|---|---|
| Tool window focused (clicked) | Tab becomes Active (blue bg/border from `--tool-window-tab-selected-bg-active`) |
| Tool window unfocused (open but not clicked) | Tab uses gray selected style (`--tool-window-tab-selected-bg`) |
| Editor focused | Editor tabs Active; all tool windows Inactive |
| Stripe button | Selected = filled bg + white icon; Inactive = gray filled bg; Default = transparent |

---

### 8.10 Form Controls

#### Input

```jsx
import { Input } from '@jetbrains/int-ui-kit';

<Input label="Project name" placeholder="Enter name..." value={val} onChange={setVal} />
<Input label="Path" error="Path is required" />
```

#### Checkbox

```jsx
import { Checkbox } from '@jetbrains/int-ui-kit';

<Checkbox label="Enable feature" checked={checked} onChange={setChecked} />
<Checkbox label="Disabled option" disabled />
```

Focus ring uses CSS `:focus-visible` sibling selector (NOT JS state).

#### Radio / RadioGroup

```jsx
import { RadioGroup } from '@jetbrains/int-ui-kit';

<RadioGroup
  options={[
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
  ]}
  value={theme}
  onChange={setTheme}
/>
```

Do NOT arrange radio buttons in columns.

#### Toggle

```jsx
import { Toggle } from '@jetbrains/int-ui-kit';
<Toggle checked={on} onChange={setOn} label="Enable dark mode" />
```

#### Dropdown / Combobox

```jsx
import { Dropdown, Combobox } from '@jetbrains/int-ui-kit';

<Dropdown
  options={[{ value: 'opt1', label: 'Option 1' }]}
  value={selected}
  onChange={setSelected}
  placeholder="Select..."
/>
```

#### Search

```jsx
import { Search } from '@jetbrains/int-ui-kit';
<Search placeholder="Search files..." value={query} onChange={setQuery} />
```

---

### 8.11 Specialized Tool Windows

All specialized windows accept the same base `ToolWindow` props plus their own. They automatically forward `toolbarExtra` and `actions` — no special handling needed.

#### TerminalWindow

```jsx
import { TerminalWindow } from '@jetbrains/int-ui-kit';

<TerminalWindow
  showSeparator={true}           // always true for Terminal
  toolbarButtons={[
    { icon: 'general/add', tooltip: 'New Terminal' },
    { icon: 'actions/suspend', tooltip: 'Stop' },
  ]}
  onActionClick={(action, ...args) => {
    if (action === 'minimize') ctx.setShowBottomPanel(false);
    if (action === 'tabClose') handleTabClose(args[0]);
    if (action === 'add')      handleNewTab();
  }}
/>
```

#### ProjectWindow

```jsx
import { ProjectWindow } from '@jetbrains/int-ui-kit';

<ProjectWindow
  projectName="my-project"
  treeData={projectTree}
  onNodeSelect={(id) => handleSelect(id)}
/>
```

#### CommitWindow

```jsx
import { CommitWindow } from '@jetbrains/int-ui-kit';

<CommitWindow
  title="Commit"
  commitLabel="Commit"
  commitAndPushLabel="Commit and Push..."
  files={[ /* tree data with status: 'modified'|'added'|'deleted' */ ]}
  onCommit={handleCommit}
/>
```

#### VCSLogWindow

```jsx
import { VCSLogWindow, DEFAULT_COMMITS } from '@jetbrains/int-ui-kit';

<VCSLogWindow
  commits={DEFAULT_COMMITS}
  selectedCommitId={1}
  onCommitSelect={(id) => setSelected(id)}
/>
```

#### AIAssistantWindow

```jsx
import { AIAssistantWindow } from '@jetbrains/int-ui-kit';

<AIAssistantWindow onActionClick={(a) => { if (a === 'minimize') ctx.setShowRightPanel(false); }} />
```

#### WelcomeDialog

```jsx
import { WelcomeDialog, DEFAULT_PROJECTS } from '@jetbrains/int-ui-kit';

<WelcomeDialog
  ideTitle="IntelliJ IDEA"
  ideVersion="2025.2"
  projects={DEFAULT_PROJECTS}
  onProjectSelect={(id) => setScreen('ide')}
  onNewProject={() => setScreen('ide')}
/>
```

---

### 8.12 Custom Welcome Screen (WelcomeProjectsPanel)

A fully custom welcome screen built inside `MainWindow` instead of using `WelcomeDialog`. Used when the welcome experience needs to be embedded as a tool window panel alongside a gradient editor area.

#### Structure

The welcome screen consists of two exported components:

| Component | Role | Slot in MainWindow |
|---|---|---|
| `WelcomeProjectsPanel` | Left panel — action buttons + recent projects | `leftPanelContent` for `id === 'project'` |
| `WelcomeGradientArea` | Editor slot — full-bleed gradient background | `editorTopBar` prop |

#### WelcomeProjectsPanel

Rendered as a `ToolWindow` titled **"Project"** with `actions={['more', 'minimize']}`.

**Internal layout** (`.ws-panel-body`, flex column):

```
┌─────────────────────────────┐
│  .ws-actions-section        │  ← 4 disclosure buttons
│    New...     [chevron]     │
│    Open...                  │
│    Clone...                 │
│    Remote Development...    │
├─────────────────────────────┤  ← border-top: 1px --tool-window-border
│  .ws-search-bar             │  ← Search component, border-bottom
│  .ws-project-list           │  ← scrollable recent project rows
│    [badge] Name             │
│            path             │
└─────────────────────────────┘
```

#### Disclosure buttons (.ws-actions-section / .ws-disclosure-item)

```css
.ws-actions-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 12px 12px;
}

.ws-disclosure-item {
  all: unset;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 8px 10px 12px;   /* 12px left, 8px right */
  border-radius: 8px;
  cursor: pointer;
  width: 100%;
  box-sizing: border-box;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-default);
  background: var(--transparent-white-10);   /* always-visible background */
}
.ws-disclosure-item:hover { background: var(--transparent-white-20); }
```

#### Action items data shape

```js
const ACTION_ITEMS = [
  { id: 'new',    label: 'New...',                icon: 'general/add',   chevron: true  },
  { id: 'open',   label: 'Open...',               icon: 'nodes/folder',  chevron: false },
  { id: 'clone',  label: 'Clone...',              icon: 'vcs/vcs',       chevron: false },
  { id: 'remote', label: 'Remote Development...', customIcon: 'ssh',     chevron: false },
];
```

`customIcon: 'ssh'` renders a hand-crafted SVG (dark rect + terminal arrow + line) — the only place in the project where a custom icon SVG is used instead of a library icon.

#### New... popup

Clicking **New...** toggles a `PositionedPopup`. The chevron rotates 0° → 180° with `transition: transform 0.15s`.

```js
const NEW_MENU_ITEMS = [
  { id: 'project',  label: 'New Project',  icon: 'general/projectStructure' },
  { id: 'sep1',     type: 'separator' },
  { id: 'task',     label: 'New Task',     icon: 'general/add' },
  { id: 'script',   label: 'New Script',   icon: 'general/externalTools' },
  { id: 'sep2',     type: 'separator' },
  { id: 'notebook', label: 'New Notebook', icon: 'general/layout' },
];
```

Popup rendered as sibling inside `ToolWindow` — `position: fixed` escapes any `overflow: hidden`:

```jsx
{open && rect && (
  <PositionedPopup triggerRect={rect} onDismiss={close} gap={4}>
    <Popup visible style={{ position: 'static' }}>
      {NEW_MENU_ITEMS.map(item =>
        item.type === 'separator'
          ? <PopupCell key={item.id} type="separator" />
          : <PopupCell key={item.id} icon={item.icon} onClick={...}>{item.label}</PopupCell>
      )}
    </Popup>
  </PositionedPopup>
)}
```

#### Recent project row (.ws-project-cell)

```css
.ws-project-cell {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  cursor: pointer;
}
.ws-project-cell:hover    { background: var(--selection-bg-hovered); }
.ws-project-cell.selected { background: var(--selection-bg-active); }
```

Badge: `20×20px`, `border-radius: 4px`, gradient background per project. Initials in JetBrains Mono 8px / 700 white.

```js
// Project data shape
{ id: '1', name: 'MyProject', path: 'ec2-…', initials: 'MP',
  bg: 'linear-gradient(180deg, #E08855 0%, #E9806F 100%)' }
```

#### WelcomeGradientArea

Replaces the editor body with a full-bleed gradient. Injected via `editorTopBar` prop — two CSS `:has()` rules hide the editor body and stretch the top bar to fill the space:

```css
.editor-top-bar:has(.ws-gradient-area) { flex: 1; }
.editor:has(.ws-gradient-area) .editor-body { display: none; }

.ws-gradient-area {
  width: 100%; height: 100%;
  background:
    radial-gradient(ellipse 480px 380px at 92%  -8%,  rgba(0,167,227,0.45) 0%, transparent 65%),
    radial-gradient(ellipse 380px 380px at 108% 22%,  rgba(0,243,98, 0.32) 0%, transparent 60%),
    radial-gradient(ellipse 320px 280px at 100% 46%,  rgba(253,251,0,0.22) 0%, transparent 60%),
    #1e1f22;
}
```

#### How it wires into MainWindow

```jsx
// Welcome screen state
<MainWindow
  editorTabs={[]}
  editorTopBar={<WelcomeGradientArea />}

  leftPanelContent={(id, ctx) => {
    if (id === 'project') return (
      <WelcomeProjectsPanel
        onNewProject={() => setScreen('ide')}
        onProjectSelect={() => setScreen('ide')}
        ctx={ctx}
      />
    );
    return defaultLeftPanelContent(id, ctx);
  }}
/>
```

---

## 9. Behavioral Patterns

### Pattern 1 — Actions belong in the header, not at the bottom

Real IDE: `+` buttons for new tab/task/chat live in the **ToolWindow header toolbar**, not at the bottom of the content area. A bottom button is a web/mobile pattern — it doesn't feel IDE-native.

```jsx
// ✅ Correct
<ToolWindow title="Agent Tasks" actions={['add', 'minimize']} onActionClick={...}>
  {/* list */}
</ToolWindow>

// ❌ Wrong
<ToolWindow title="Agent Tasks">
  <div>{/* list */}</div>
  <Button style={{ width: '100%' }}>+ New Task</Button>  {/* web pattern */}
</ToolWindow>
```

### Pattern 2 — Single `onActionClick` callback

All tool window actions flow through one callback with string identifiers:

```jsx
onActionClick={(action, ...args) => {
  if (action === 'add')      handleAdd();
  if (action === 'more')     handleMore();
  if (action === 'minimize') ctx.setShowLeftPanel(false);
  if (action === 'tabClose') handleTabClose(args[0]);  // args[0] = tab index
}}
```

### Pattern 3 — Defaults + Override

Import default data, change only what you need, pass it back:

```jsx
import { DEFAULT_LEFT_STRIPE_ITEMS, DEFAULT_EDITOR_TABS } from '@jetbrains/int-ui-kit';

// Add a custom stripe button
const myStripe = [
  ...DEFAULT_LEFT_STRIPE_ITEMS,
  { id: 'agent-tasks', icon: myIcon, tooltip: 'Agent Tasks', section: 'top' },
];

// Remove one item
const stripeWithoutDebug = DEFAULT_LEFT_STRIPE_ITEMS.filter(i => i.id !== 'debug');

// Add a tab
const myTabs = [...DEFAULT_EDITOR_TABS, { id: '6', label: 'New.kt', icon: 'fileTypes/kotlin', closable: true }];
```

### Pattern 4 — Overlays inside MainWindow

Dialogs and modals render inside `MainWindow` via the `overlays` prop — this ensures correct layering over IDE chrome:

```jsx
const [showSettings, setShowSettings] = useState(false);

<MainWindow
  overlays={showSettings ? <SettingsDialog onClose={() => setShowSettings(false)} /> : null}
/>
```

### Pattern 5 — Custom panel with fallback

Add a custom tool window alongside built-in ones by using `defaultLeftPanelContent` as fallback:

```jsx
import { MainWindow, defaultLeftPanelContent, ToolWindow } from '@jetbrains/int-ui-kit';

function MyPanel({ ctx }) {
  return (
    <ToolWindow
      title="My Panel"
      width="100%" height="auto"
      actions={['add', 'minimize']}
      focused={ctx.focusedPanel === 'left'}
      onFocus={() => ctx.setFocusedPanel('left')}
      onActionClick={(a) => { if (a === 'minimize') ctx.setShowLeftPanel(false); }}
      className="main-window-tool-window main-window-tool-window-left"
    >
      {/* content */}
    </ToolWindow>
  );
}

<MainWindow
  leftStripeItems={[...DEFAULT_LEFT_STRIPE_ITEMS, { id: 'my-panel', icon: myIcon, tooltip: 'My Panel', section: 'top' }]}
  leftPanelContent={(id, ctx) => {
    if (id === 'my-panel') return <MyPanel ctx={ctx} />;
    return defaultLeftPanelContent(id, ctx);  // keep built-in Project, Commit, etc.
  }}
/>
```

### Pattern 6 — Custom stripe icons

Pass any React element as `icon` in stripe items. Add `monochrome: true` for colored custom icons so they match built-in icon behavior:

```jsx
const myIcon = <img src={myIconUrl} width={20} height={20} alt="My Tool" style={{ display: 'block' }} />;

{ id: 'my-tool', icon: myIcon, tooltip: 'My Tool', section: 'top', monochrome: true }
```

| State | `monochrome: true` effect |
|---|---|
| Default / inactive | `filter: grayscale(1)` |
| Selected | `filter: brightness(0) invert(1)` (pure white) |

### Pattern 7 — Disclosure button list with chevron popup (Welcome screen)

Action buttons that always show a background and open a context menu on click:

```jsx
// CSS
.ws-disclosure-item {
  all: unset;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;          /* 12px left, 8px right */
  border-radius: 8px;
  cursor: pointer;
  width: 100%;
  box-sizing: border-box;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-default);
  background: var(--transparent-white-10);  /* always-on background */
}
.ws-disclosure-item:hover { background: var(--transparent-white-20); }

.ws-actions-section {
  display: flex;
  flex-direction: column;
  gap: 8px;                    /* 8px between buttons */
  padding: 8px 12px 12px;
}
```

```jsx
// JSX — chevron rotates when menu is open
const [open, setOpen] = useState(false);
const [rect, setRect]  = useState(null);

<button
  className="ws-disclosure-item"
  onClick={e => { setRect(e.currentTarget.getBoundingClientRect()); setOpen(o => !o); }}
>
  <Icon name="general/add" size={16} />
  <span style={{ flex: 1 }}>New...</span>
  <ChevronIcon rotated={open} />  {/* rotate(180deg) when open */}
</button>

{open && rect && (
  <PositionedPopup triggerRect={rect} onDismiss={() => setOpen(false)} gap={4}>
    <Popup visible style={{ position: 'static' }}>
      <PopupCell icon="general/projectStructure" onClick={() => { setOpen(false); onNewProject(); }}>
        New Project
      </PopupCell>
      <PopupCell type="separator" />
      <PopupCell icon="general/add">New Task</PopupCell>
    </Popup>
  </PositionedPopup>
)}
```

**Rules:**
- Buttons always have background (`--transparent-white-10`), hover brightens it (`--transparent-white-20`)
- Gap between buttons: `8px`
- Chevron animates `0deg → 180deg` with `transition: transform 0.15s`
- `PositionedPopup` is rendered as sibling (inside same `ToolWindow`) — its `position: fixed` escapes any `overflow: hidden`

### Pattern 9 — Focus rings are keyboard-only

Use CSS `:focus-visible` — never plain `:focus` for focus rings on interactive controls:

```css
/* ✅ Correct */
.my-button:focus { outline: none; }
.my-button:focus-visible { outline: 2px solid var(--control-focus-border-brand); }

/* ❌ Wrong — shows ring on mouse click */
.my-button:focus { outline: 2px solid ... }
```

Exception: `<input>`, `<textarea>` — keep `:focus` so users know where they're typing.

### Pattern 10 — Font usage in tool windows

```jsx
// ✅ Correct timestamp
<span style={{ fontSize: 11, color: 'var(--text-muted)' }}>2m</span>

// ❌ Wrong — mono font on a plain timestamp
<span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>2m</span>
```

---

## 10. Anti-patterns

| Anti-pattern | Why it's wrong | Correct approach |
|---|---|---|
| Hardcoding hex colors | Breaks theming | Use CSS token variables (`var(--text-primary)`) |
| Raw `<button>` in toolbar | Wrong sizing, missing states | Use `<IconButton>` or `<ToolbarButton>` |
| Bottom "Create" button in tool window | Web/mobile pattern | Put `'add'` action in `actions={['add', ...]}` |
| `font-family: 'JetBrains Mono'` on prose text | Wrong aesthetics | Only for code/paths/technical values |
| Creating custom SVG icons | Inconsistent | Use existing library icons; stop and ask if none fit |
| `position: absolute` popup not in `fixed` | Clips inside panels | Always use `position: fixed` + high `z-index` |
| Multiple popups open | Confusing UX | Opening one must close others |
| Extra padding inside `.tool-window-content` | Doubles indent | The container already has `padding: 0 8px` |
| Inline styles for hover/selected rows | `:hover` won't work | Use CSS classes with `:hover` and `.selected` |
| `:focus` for focus rings | Fires on mouse click | Use `:focus-visible` |
| Re-implementing Project/Commit windows | Duplicate work | Use `defaultLeftPanelContent` as fallback |
| Modals rendered outside `MainWindow` | Wrong z-index layering | Pass as `overlays` prop |

---

## 11. Complete Starter Template

A full, working prototype — Welcome screen → IDE → Settings. Copy and adapt.

**`src/main.jsx`** (required boilerplate — do not change):

```jsx
import '@jetbrains/int-ui-kit/styles.css';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';

window.React = React; // required — see §1

createRoot(document.getElementById('root')).render(<App />);
```

**`src/App.jsx`**:

```jsx
import { useState } from 'react';
import {
  ThemeProvider,
  MainWindow,
  WelcomeDialog,
  SettingsDialog,
  ToolWindow,
  Loader,
  DEFAULT_EDITOR_TABS,
  DEFAULT_EDITOR_TAB_CONTENTS,
  DEFAULT_LEFT_STRIPE_ITEMS,
  DEFAULT_PROJECT_TREE_DATA,
  defaultLeftPanelContent,
} from '@jetbrains/int-ui-kit';
import './App.css'; // agent-task-row styles

// ─── Data ───────────────────────────────────────────────────────────────────

const MY_PROJECTS = [
  { id: '1', name: 'payment-service', path: '~/projects/payment-service', initials: 'PS', gradient: ['#3b82f6', '#1d4ed8'] },
  { id: '2', name: 'auth-module',     path: '~/projects/auth-module',     initials: 'AM', gradient: ['#8b5cf6', '#6d28d9'] },
];

const MY_EDITOR_TABS = [
  { id: '1', label: 'PaymentController.java', icon: 'fileTypes/java',     closable: true },
  { id: '2', label: 'application.yml',        icon: 'fileTypes/yaml',     closable: true },
];

const MY_PROJECT_TREE = [
  {
    id: 'root', label: 'payment-service', icon: 'nodes/folder', isExpanded: true,
    children: [
      { id: 'src', label: 'src/main/java', icon: 'nodes/sourceRoot', isExpanded: true, children: [
        { id: 'ctrl', label: 'PaymentController.java', icon: 'fileTypes/java' },
        { id: 'svc',  label: 'PaymentService.java',    icon: 'fileTypes/java' },
      ]},
      { id: 'cfg', label: 'application.yml', icon: 'fileTypes/yaml' },
    ],
  },
];

// Strip to only the panels needed for this scenario
const MY_LEFT_STRIPE = DEFAULT_LEFT_STRIPE_ITEMS.filter(i =>
  ['project', 'commit', 'terminal'].includes(i.id)
);

// ─── Agent Tasks data ────────────────────────────────────────────────────────
// status: null | 'running' | 'warning' | 'done'

const AGENT_TASKS = [
  { id: 't1', label: 'Task 1.md',                     time: '2m', status: null },
  { id: 't3', label: 'Understanding Configuration.md', time: '1h', status: 'warning' },
  { id: 't4', label: 'Create a class with 3 int.md',   time: '1h', status: 'done' },
];

// ─── Agent Tasks icon SVGs ───────────────────────────────────────────────────
// Use inline SVGs — do NOT use <Icon> for custom non-library icons.

function IconMdTask() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path fillRule="evenodd" clipRule="evenodd" d="M12.5929 9.9438L12.5929 4.70001L13.7929 4.70002L13.7929 9.94379L15.0763 8.66037L15.9248 9.5089L13.1929 12.2409L10.4609 9.5089L11.3095 8.66037L12.5929 9.9438Z" fill="#548AF7"/>
      <path d="M0.5 4.70001H2.94558L4.65385 9.14463L4.76288 9.60155L4.85635 9.14463L6.51269 4.70001H8.98423V11.9692H7.14096V7.59732L7.17212 7.12482L5.34442 11.9692H4.08269L2.31212 7.17155L2.34327 7.59732V11.9692H0.5V4.70001Z" fill="#548AF7"/>
    </svg>
  );
}

function IconWarning() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path fillRule="evenodd" clipRule="evenodd" d="M1.27603 10.8634L6.3028 1.98903C7.04977 0.670323 8.94893 0.670326 9.69589 1.98903L14.7227 10.8634C15.516 12.2639 14.5047 14 12.8956 14H3.10308C1.494 14 0.482737 12.2639 1.27603 10.8634Z" fill="#F2C55C"/>
      <path d="M9 5C9 4.44772 8.55228 4 8 4C7.44772 4 7 4.44772 7 5V7.5C7 8.05229 7.44772 8.5 8 8.5C8.55229 8.5 9 8.05228 9 7.5L9 5Z" fill="#5E4D33"/>
      <path d="M8 12C8.55228 12 9 11.5523 9 11C9 10.4477 8.55228 10 8 10C7.44772 10 7 10.4477 7 11C7 11.5523 7.44772 12 8 12Z" fill="#5E4D33"/>
    </svg>
  );
}

function IconDone() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="8" cy="8" r="7" fill="#57965C"/>
      <path d="M4.5 8L7 10.5L11.5 6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

// ─── Agent Tasks panel ───────────────────────────────────────────────────────
// IMPORTANT: Do NOT use <Tree flat> here — custom rows give correct layout.
// IMPORTANT: actions must include 'more' (3-dot overflow menu).
// CSS for .agent-task-row must be in a separate App.css file (see below).

function AgentTasksPanel({ ctx }) {
  const [selected, setSelected] = useState('t1');
  return (
    <ToolWindow
      title="Agent Tasks"
      width="100%" height="auto"
      actions={['add', 'more', 'minimize']}
      focused={ctx.focusedPanel === 'left'}
      onFocus={() => ctx.setFocusedPanel('left')}
      onActionClick={(action) => {
        if (action === 'minimize') ctx.setShowLeftPanel(false);
      }}
      className="main-window-tool-window main-window-tool-window-left"
    >
      <div style={{ flex: 1, overflow: 'auto', padding: '4px 0' }}>
        {AGENT_TASKS.map(task => (
          <div
            key={task.id}
            className={`agent-task-row${selected === task.id ? ' selected' : ''}`}
            onClick={() => setSelected(task.id)}
          >
            <IconMdTask />
            <span className="agent-task-label">{task.label}</span>
            {task.status === 'running' && <Loader size={16} />}
            {task.status === 'warning' && <IconWarning />}
            {task.status === 'done'    && <IconDone />}
            <span className="agent-task-time">{task.time}</span>
          </div>
        ))}
      </div>
    </ToolWindow>
  );
}

// ─── App ────────────────────────────────────────────────────────────────────

export default function App() {
  const [screen, setScreen] = useState('welcome'); // 'welcome' | 'ide' | 'settings'

  if (screen === 'welcome') {
    return (
      <ThemeProvider defaultTheme="dark">
        <WelcomeDialog
          ideTitle="IntelliJ IDEA"
          ideVersion="2025.2"
          projects={MY_PROJECTS}
          onNewProject={() => setScreen('ide')}
          onProjectSelect={() => setScreen('ide')}
        />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider defaultTheme="dark">
      <MainWindow
        height={800}
        projectName="payment-service"
        projectColor="blue"
        branchName="feature/stripe-integration"
        runConfig="PaymentApplication"

        editorTabs={MY_EDITOR_TABS}
        editorTabContents={{
          '1': { language: 'java', code: '@RestController\npublic class PaymentController {\n\n    @PostMapping("/charge")\n    public ResponseEntity<String> charge() {\n        return ResponseEntity.ok("ok");\n    }\n}' },
          '2': { language: 'yaml', code: 'server:\n  port: 8080\nspring:\n  datasource:\n    url: jdbc:postgresql://localhost/payments' },
        }}

        projectTreeData={MY_PROJECT_TREE}

        leftStripeItems={[
          ...MY_LEFT_STRIPE,
          { id: '_sep',        separator: true,                                             section: 'top' },
          { id: 'agent-tasks', icon: <span style={{ fontSize: 14 }}>🤖</span>, tooltip: 'Agent Tasks', section: 'top', monochrome: true },
        ]}
        defaultOpenToolWindows={['project', 'terminal']}
        leftPanelContent={(id, ctx) => {
          if (id === 'agent-tasks') return <AgentTasksPanel ctx={ctx} />;
          return defaultLeftPanelContent(id, ctx);
        }}

        statusBarProps={{
          breadcrumbs: [
            { label: 'payment-service', module: true },
            { label: 'src/main/java' },
            { label: 'PaymentController.java', icon: true, iconName: 'fileTypes/java' },
          ],
          widgets: [
            { type: 'text', text: '42:1' },
            { type: 'text', text: 'UTF-8' },
            { type: 'text', text: 'LF' },
          ],
        }}

        overlays={
          screen === 'settings'
            ? <SettingsDialog onClose={() => setScreen('ide')} />
            : null
        }
      />
    </ThemeProvider>
  );
}
```

**`src/App.css`** — required for agent-task-row hover/selected states:

```css
.agent-task-row {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 24px;
  padding: 0 8px;
  cursor: pointer;
  border-radius: 4px;
}
.agent-task-row:hover   { background: var(--selection-bg-hovered); }
.agent-task-row.selected { background: var(--selection-bg-active); }

.agent-task-label {
  flex: 1;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-default);
}

.agent-task-time {
  font-size: 11px;
  color: var(--text-muted);
  flex-shrink: 0;
}
```

> **Why not `<Tree flat>`?** `Tree` doesn't support per-row status icons or the `Loader` spinner. Custom rows give full control over layout while matching the 24px height, `padding: 0 8px`, and hover/selected tokens of native tree rows.

---

## Quick Reference Checklist

Before delivering a generated project, verify:

- [ ] `@jetbrains/int-ui-kit` installed from npm or git repo (not copied)
- [ ] `src/main.jsx` sets `window.React = React` **before** `createRoot(...).render(...)` — without this the app is blank with `ReferenceError: React is not defined`
- [ ] `import '@jetbrains/int-ui-kit/styles.css'` is the **first** import in `main.jsx`
- [ ] `<ThemeProvider defaultTheme="dark">` wraps everything
- [ ] Islands theme used (not flat/New UI)
- [ ] Inter for UI text, JetBrains Mono only for code/paths/technical values
- [ ] CSS token variables used for all colors (`var(--text-primary)`, etc.)
- [ ] Actions (add/minimize/more) in ToolWindow header, not at bottom of content
- [ ] `<IconButton>` / `<ToolbarButton>` used in toolbars, not raw `<button>`
- [ ] `<PositionedPopup>` with `position: fixed` for context menus
- [ ] Focus rings use `:focus-visible`, not `:focus`
- [ ] Stripe icons for left/right panels use `@20x20` suffix
- [ ] Custom colored stripe icons have `monochrome: true`
- [ ] Modals passed as `overlays` prop to `MainWindow`
- [ ] `defaultLeftPanelContent` used as fallback when adding custom panels
- [ ] `<Loader size={16} />` for animated loading state (not icon)
- [ ] Only one popup open at a time; popups close on outside click
