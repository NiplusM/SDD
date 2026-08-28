#!/usr/bin/env node
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const outputDir = path.join(projectRoot, 'test-results', 'jvm-scenario');
const baseUrl = process.env.SCENARIO_URL || 'http://127.0.0.1:4173/';
const headless = process.argv.includes('--headless') || process.env.HEADLESS === '1';
const reuseExistingServer = process.argv.includes('--reuse-existing') || Boolean(process.env.SCENARIO_URL);
const slowMo = Number(process.env.SLOW_MO ?? (headless ? 0 : 280));
const startupTimeoutMs = Number(process.env.SCENARIO_STARTUP_TIMEOUT_MS ?? 30000);
const demoPace = Number(process.env.SCENARIO_DEMO_PACE ?? (headless ? 1 : 1.6));
const screenshotMode = (
  process.env.SCENARIO_SCREENSHOT_MODE
  || (headless ? 'full' : 'off')
).toLowerCase();
let screenshotIndex = 1;
let devServer = null;

function slugify(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'step';
}

async function pause(ms) {
  const duration = Math.max(0, Math.round(ms * demoPace));
  if (!duration) {
    return;
  }
  await delay(duration);
}

async function waitForServer(url, timeoutMs) {
  const start = Date.now();
  let lastError = null;

  while ((Date.now() - start) < timeoutMs) {
    try {
      const response = await fetch(url, { method: 'GET' });
      if (response.ok) {
        return;
      }
      lastError = new Error(`Unexpected status: ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await pause(250);
  }

  throw lastError ?? new Error(`Timed out waiting for ${url}`);
}

async function startServer() {
  devServer = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', '4173'], {
    cwd: projectRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      FORCE_COLOR: '1',
    },
  });

  devServer.stdout.on('data', (chunk) => {
    process.stdout.write(`[vite] ${chunk}`);
  });
  devServer.stderr.on('data', (chunk) => {
    process.stderr.write(`[vite] ${chunk}`);
  });

  devServer.on('exit', (code) => {
    if (code !== null && code !== 0) {
      process.stderr.write(`\n[vite] dev server exited with code ${code}\n`);
    }
  });

  await waitForServer(baseUrl, startupTimeoutMs);
}

async function stopServer() {
  if (!devServer || devServer.killed) return;

  devServer.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => devServer.once('exit', resolve)),
    pause(4000).then(() => {
      if (!devServer.killed) {
        devServer.kill('SIGKILL');
      }
    }),
  ]);
}

async function ensureOutputDir() {
  await fs.rm(outputDir, { recursive: true, force: true });
  await fs.mkdir(outputDir, { recursive: true });
}

async function installScenarioOverlay(page) {
  await page.addStyleTag({
    content: `
      html {
        scroll-behavior: auto !important;
      }
      *, *::before, *::after {
        animation-duration: 1ms !important;
        animation-delay: 0ms !important;
        transition-duration: 1ms !important;
        transition-delay: 0ms !important;
        caret-color: transparent !important;
      }
      #jvm-scenario-overlay {
        position: fixed;
        inset: 0;
        pointer-events: none;
        z-index: 2147483647;
        font-family: Inter, -apple-system, BlinkMacSystemFont, sans-serif;
      }
      #jvm-scenario-cursor {
        position: fixed;
        top: 0;
        left: 0;
        width: 22px;
        height: 22px;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.95);
        border: 2px solid rgba(31, 31, 31, 0.9);
        box-shadow: 0 10px 24px rgba(0, 0, 0, 0.24);
        transform: translate(96px, 96px);
        transition: transform 360ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 120ms ease, scale 120ms ease;
      }
      #jvm-scenario-cursor::after {
        content: '';
        position: absolute;
        inset: -12px;
        border-radius: 50%;
        border: 2px solid rgba(255, 255, 255, 0.28);
        opacity: 0;
        transform: scale(0.8);
      }
      #jvm-scenario-cursor.is-clicking {
        scale: 0.92;
        box-shadow: 0 6px 16px rgba(0, 0, 0, 0.28);
      }
      #jvm-scenario-cursor.is-clicking::after {
        opacity: 1;
        transform: scale(1.18);
        transition: opacity 220ms ease, transform 220ms ease;
      }
      #jvm-scenario-caption {
        position: fixed;
        right: 24px;
        bottom: 24px;
        max-width: min(440px, calc(100vw - 48px));
        padding: 14px 16px;
        border-radius: 14px;
        background: rgba(24, 25, 28, 0.94);
        border: 1px solid rgba(255, 255, 255, 0.08);
        box-shadow: 0 18px 48px rgba(0, 0, 0, 0.34);
        color: #f3f4f6;
        backdrop-filter: blur(10px);
      }
      #jvm-scenario-caption-beat {
        display: block;
        margin-bottom: 6px;
        color: #7dd3fc;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      #jvm-scenario-caption-text {
        display: block;
        font-size: 14px;
        line-height: 1.4;
        font-weight: 600;
      }
    `,
  });

  await page.evaluate(() => {
    const existing = document.getElementById('jvm-scenario-overlay');
    if (existing) {
      existing.remove();
    }

    const overlay = document.createElement('div');
    overlay.id = 'jvm-scenario-overlay';

    const cursor = document.createElement('div');
    cursor.id = 'jvm-scenario-cursor';

    const caption = document.createElement('div');
    caption.id = 'jvm-scenario-caption';
    caption.innerHTML = [
      '<span id="jvm-scenario-caption-beat">Scenario</span>',
      '<span id="jvm-scenario-caption-text">Preparing JVM scenario…</span>',
    ].join('');

    overlay.append(cursor, caption);
    document.body.append(overlay);
  });
}

async function updateOverlay(page, { x = null, y = null, beat = 'Scenario', text = '' } = {}) {
  await page.evaluate(({ x, y, beat, text }) => {
    const cursor = document.getElementById('jvm-scenario-cursor');
    const beatEl = document.getElementById('jvm-scenario-caption-beat');
    const textEl = document.getElementById('jvm-scenario-caption-text');

    if (cursor && Number.isFinite(x) && Number.isFinite(y)) {
      cursor.style.transform = `translate(${x}px, ${y}px)`;
    }

    if (beatEl) {
      beatEl.textContent = beat;
    }

    if (textEl && text) {
      textEl.textContent = text;
    }
  }, { x, y, beat, text });
}

async function pulseCursor(page, enabled) {
  await page.evaluate((active) => {
    const cursor = document.getElementById('jvm-scenario-cursor');
    if (!cursor) return;
    cursor.classList.toggle('is-clicking', active);
  }, enabled);
}

async function getLocatorPoint(locator) {
  let lastError = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      await locator.waitFor({ state: 'visible', timeout: 20000 });
      await locator.scrollIntoViewIfNeeded();
      const box = await locator.boundingBox();
      if (!box) throw new Error('Target has no bounding box');
      return {
        x: box.x + (box.width / 2),
        y: box.y + (box.height / 2),
      };
    } catch (error) {
      lastError = error;
      if (!/not attached|not stable/iu.test(String(error?.message || error))) throw error;
      await pause(180);
    }
  }
  throw lastError ?? new Error('Target could not be focused');
}

async function waitForEnabled(locator, timeoutMs = 20000) {
  const start = Date.now();

  while ((Date.now() - start) < timeoutMs) {
    const isEnabled = await locator.evaluate((node) => (
      node instanceof HTMLButtonElement
        ? !node.disabled && node.getAttribute('aria-disabled') !== 'true'
        : true
    )).catch(() => false);

    if (isEnabled) {
      return;
    }

    await pause(150);
  }

  throw new Error('Timed out waiting for an enabled control');
}

async function demoFocus(page, locator, beat, text, pauseMs = 520) {
  const point = await getLocatorPoint(locator);
  await updateOverlay(page, { ...point, beat, text });
  await pause(pauseMs);
}

async function demoClick(page, locator, beat, text, options = {}) {
  await demoFocus(page, locator, beat, text, options.focusPauseMs ?? 520);
  await pulseCursor(page, true);
  await locator.click({ force: true, timeout: 20000 });
  await pause(options.clickPauseMs ?? 180);
  await pulseCursor(page, false);
  await pause(options.afterPauseMs ?? 340);
}

async function demoType(page, locator, beat, text, value) {
  await demoFocus(page, locator, beat, text);
  await locator.click({ force: true, timeout: 20000 });
  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
  await page.keyboard.press(`${modifier}+A`).catch(() => {});
  await page.keyboard.press('Backspace').catch(() => {});
  await page.keyboard.type(value, { delay: 18 });
  await pause(280);
}

async function capture(page, name) {
  if (screenshotMode === 'off' || screenshotMode === 'none') {
    return;
  }

  const fileName = `${String(screenshotIndex).padStart(2, '0')}-${slugify(name)}.png`;
  screenshotIndex += 1;
  await page.screenshot({
    path: path.join(outputDir, fileName),
    fullPage: screenshotMode === 'full',
    animations: 'disabled',
    caret: 'hide',
  });
}

async function logDomSummary(page, label) {
  const summary = await page.evaluate(() => {
    const isVisible = (node) => node instanceof HTMLElement && node.getClientRects().length > 0;
    const describe = (node) => ({
      className: typeof node.className === 'string' ? node.className : '',
      text: (node.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120),
      title: node.getAttribute('title') || '',
      ariaLabel: node.getAttribute('aria-label') || '',
    });

    return {
      url: window.location.href,
      bodyClassName: document.body.className,
      shells: Array.from(document.querySelectorAll('.main-window')).filter(isVisible).map(describe),
      tabs: Array.from(document.querySelectorAll('.main-window-editor-tabs .tab')).filter(isVisible).map(describe),
      leftStripes: Array.from(document.querySelectorAll('.main-window-stripe-left .stripe')).filter(isVisible).map(describe),
      panels: Array.from(document.querySelectorAll('.main-window-tool-window')).filter(isVisible).map(describe),
    };
  });
  process.stdout.write(`\n[dom-summary:${label}] ${JSON.stringify(summary)}\n`);
}

async function clickByDemoId(page, demoId, beat, text, options = {}) {
  const locator = page.locator(`[data-demo-id="${demoId}"]`).first();
  await demoClick(page, locator, beat, text, options);
}

async function focusSpecRow(page, demoId, beat, text) {
  const row = page.locator(`[data-demo-id="${demoId}"]`).first();
  const inlineInspection = row.locator('[data-inline-inspection="true"]').first();
  const editable = row.locator('[contenteditable]').first();
  const target = await inlineInspection.count().catch(() => 0)
    ? inlineInspection
    : (await editable.count().catch(() => 0) ? editable : row);
  await demoClick(page, target, beat, text);
}

async function getVisibleAgentTaskRow(page, selector) {
  let locator = page.locator(`${selector}:visible`).first();
  if (!await locator.isVisible().catch(() => false)) {
    const stripe = page.locator('.main-window-stripe-left [title="Agent Tasks"]').first();
    await stripe.waitFor({ state: 'visible', timeout: 10000 });
    await stripe.click();
    await page.locator('.agent-tasks-window:visible').waitFor({ state: 'visible', timeout: 10000 });
    locator = page.locator(`${selector}:visible`).first();
  }
  return locator;
}

async function clickTaskRow(page, label, beat, text) {
  const selector = `[data-demo-id="agent-task-row-${slugify(label)}"]`;
  const escapedLabel = String(label).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const labelPattern = new RegExp(escapedLabel, 'i');
  const visibleEditorTab = page.locator('.main-window-editor-tabs .tab:visible', { hasText: labelPattern }).first();
  const selectedTab = page.locator('.main-window-editor-tabs .tab.tab-selected:visible', { hasText: labelPattern }).first();

  if (await visibleEditorTab.isVisible().catch(() => false)) {
    await demoClick(page, visibleEditorTab, beat, `Activate the existing ${label} editor tab.`);
    await selectedTab.waitFor({ state: 'visible', timeout: 10000 });
    await pause(250);
    return;
  }

  const locator = await getVisibleAgentTaskRow(page, selector);
  await demoFocus(page, locator, beat, text);
  await pulseCursor(page, true);
  await locator.evaluate((node) => node.click());
  await pause(180);
  await pulseCursor(page, false);
  await selectedTab.waitFor({ state: 'visible', timeout: 10000 });
  await pause(250);
}

async function clickSpecSectionRun(page, sectionTitle, beat, text) {
  const sectionRow = page.locator('.spec-done-row').filter({
    has: page.getByRole('heading', { name: sectionTitle, exact: true }),
  }).first();
  const runButton = sectionRow.locator('.spec-done-gutter-item-run-btn').first();
  await demoClick(page, runButton, beat, text);
}

async function clickByText(page, selector, text, beat, description, options = {}) {
  const locator = page.locator(selector, { hasText: text }).first();
  await demoClick(page, locator, beat, description, options);
}

async function finishOptionalSpecificationLaunch(page, beat) {
  const initialLoading = page.locator('.sdd-generation-stream:visible').first();
  await initialLoading.waitFor({ state: 'visible', timeout: 10000 });
  const initialLoadingText = (await initialLoading.locator('p').first().textContent() ?? '').trim();
  if (!initialLoadingText.startsWith('I’m creating Vet-Schedules.md for')) {
    throw new Error(`Unexpected initial SDD loading text: ${JSON.stringify(initialLoadingText)}`);
  }
  const activeInitialStep = initialLoading.locator('.sdd-generation-stream-step.is-active', { hasText: 'Looking up project context' });
  await activeInitialStep.waitFor({ state: 'visible' });
  await activeInitialStep.locator('.loader-spinner').waitFor({ state: 'visible' });
  const activeStepColors = await activeInitialStep.evaluate((step) => ({
    label: getComputedStyle(step.querySelector('.sdd-generation-stream-step-label')).color,
    detail: getComputedStyle(step.querySelector('.sdd-generation-stream-step-detail')).color,
  }));
  if (activeStepColors.label !== activeStepColors.detail) {
    throw new Error(`Active SDD generation step uses mixed text colors: ${JSON.stringify(activeStepColors)}`);
  }
  await capture(page, 'beat-1-initial-loading');

  await pause(520);
  const appendedLoadingText = (await initialLoading.locator('p').first().textContent() ?? '').trim();
  if (!appendedLoadingText.startsWith(initialLoadingText) || appendedLoadingText.length <= initialLoadingText.length) {
    throw new Error(`Initial SDD response did not append monotonically: ${JSON.stringify({ initialLoadingText, appendedLoadingText })}`);
  }
  await capture(page, 'beat-1-initial-streaming');

  const permission = page.locator('[data-demo-id="terminal-permission-allow-once"]').first();
  if (await permission.waitFor({ state: 'visible', timeout: 1800 }).then(() => true).catch(() => false)) {
    await demoClick(page, permission, beat, 'Allow the agent execution for this run.');
  }

  const run = page.locator('[data-demo-id="agent-task-run"]').first();
  if (await run.waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false)) {
    await pause(1600);
    return;
  }

  // Newer prototype builds complete Specify in its own chat without a separate
  // terminal permission surface. In the SDD flow the generated document opens
  // directly, while other entry points keep the source chat visible.
  const completedDocument = page.locator('.spec-done-overlay:visible').first();
  if (await completedDocument.isVisible().catch(() => false)) {
    await pause(800);
    return;
  }

  // The next beat reopens the source task.
  await page.locator('.aiux543-conversation:visible').first().waitFor({ state: 'visible', timeout: 10000 });
  await pause(800);
}

async function runScenario(page) {
  const prompt = 'Add vet working hours, and reject bookings outside them';
  const noteText = 'cover the exclusive end boundary in the regression tests';

  console.log('Running JVM scenario automation…');
  await updateOverlay(page, { beat: 'Beat 1', text: 'Loading the welcome screen…' });
  await page.goto(`${baseUrl}?screen=welcome`, { waitUntil: 'networkidle' });
  await installScenarioOverlay(page);
  await updateOverlay(page, { beat: 'Beat 1', text: 'Preparing project setup…' });
  await pause(400);

  await clickByDemoId(page, 'welcome-new-agent-task', 'Beat 1', 'Open “New Task for Agent”.');
  await capture(page, 'beat-1-new-task');

  const editor = page.locator('textarea[aria-label="Task prompt"]:visible').first();
  await demoType(page, editor, 'Beat 1', 'Type the initial visit-booking prompt.', prompt);
  await capture(page, 'beat-1-prompt');

  await demoClick(
    page,
    page.getByRole('button', { name: 'Send', exact: true }).last(),
    'Beat 1',
    'Send the initial task to the agent.',
    { clickPauseMs: 40, afterPauseMs: 0 },
  );
  await finishOptionalSpecificationLaunch(page, 'Beat 1');
  await clickTaskRow(page, 'Vet-Schedules.md', 'Beat 1', 'Open the generated Vet-Schedules.md document.');
  const document = page.locator('.spec-done-overlay:visible').first();
  await document.getByRole('heading', { name: 'Reference Files', exact: true }).waitFor({ state: 'visible' });
  await document.getByText('Demo seed data includes at least one valid schedule window for each of the six seeded vets.', { exact: true }).waitFor({ state: 'visible' });
  await capture(page, 'beat-1-generated-spec');

  const testPlanRow = page.locator('[data-demo-id="spec-row-plan-14"]').first();
  await testPlanRow.hover();
  const testSourceChip = testPlanRow.locator('[data-ref-target="VisitControllerTests.java"]').first();
  await demoClick(page, testSourceChip, 'Beat 2', 'Open the linked VisitControllerTests.java source next to the document.');
  await page.locator('.main-window-editor-tabs .tab.tab-selected:visible', { hasText: 'VisitControllerTests.java' }).waitFor({ state: 'visible' });
  await clickTaskRow(page, 'Vet-Schedules.md', 'Beat 2', 'Return to the specification.');

  const acValidationRow = page.locator('[data-demo-id="spec-row-ac-1"]').first();
  const acValidationEditable = acValidationRow.locator('[contenteditable="true"]').first();
  await demoFocus(page, acValidationEditable, 'Beat 2', 'Replace the generic Validation subject with a method reference.');
  const selected = await acValidationEditable.evaluate((node) => {
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const textNode = walker.currentNode;
      const start = textNode.textContent.indexOf('Validation');
      if (start < 0) continue;
      const range = document.createRange();
      range.setStart(textNode, start);
      range.setEnd(textNode, start + 'Validation'.length);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      return true;
    }
    return false;
  });
  if (!selected) throw new Error('Could not select the Validation text in AC #2');
  await page.keyboard.type('@process', { delay: 18 });
  const processMethodCompletion = page.locator('.at-popup-row', { hasText: 'processNewVisitForm()' }).first();
  await demoClick(page, processMethodCompletion, 'Beat 2', 'Insert the existing controller method reference from completion.');
  await acValidationRow.getByText('processNewVisitForm()', { exact: true }).waitFor({ state: 'visible' });

  await clickTaskRow(page, 'VisitControllerTests.java', 'Beat 2', 'Switch away to verify the manual document edit is retained.');
  await clickTaskRow(page, 'Vet-Schedules.md', 'Beat 2', 'Return to the edited specification.');
  await acValidationRow.getByText('processNewVisitForm()', { exact: true }).waitFor({ state: 'visible' });

  await testPlanRow.hover();
  await clickByDemoId(page, 'spec-comment-plan-14', 'Beat 3', 'Add a targeted note to the regression-test Plan item.');
  const noteInput = page.locator('[data-demo-id="diff-comment-input"]:visible').first();
  await demoType(page, noteInput, 'Beat 3', 'Describe the exclusive end-boundary coverage.', noteText);
  await demoClick(page, page.locator('[data-demo-id="diff-comment-submit"]:visible').first(), 'Beat 3', 'Attach the note to the Plan item.');

  const sendToAgent = page.getByRole('button', { name: 'Send Comments', exact: true }).first();
  await demoClick(page, sendToAgent, 'Beat 3', 'Apply the targeted note without opening a chat split.');
  const noteLoading = page.locator('.agent-task-toolbar .at-generating-label:visible').first();
  await noteLoading.waitFor({ state: 'visible', timeout: 10000 });
  await noteLoading.waitFor({ state: 'hidden', timeout: 30000 });
  await testPlanRow.getByText(noteText, { exact: false }).waitFor({ state: 'visible' });
  await acValidationRow.getByText('processNewVisitForm()', { exact: true }).waitFor({ state: 'visible' });
  await capture(page, 'beat-3-note-applied');

  await testPlanRow.hover();
  const planItemRun = testPlanRow.locator('.spec-done-gutter-item-run-btn:visible').first();
  await demoClick(page, planItemRun, 'Beat 4', 'Run only the regression-test Plan item.');
  const passedPlanItemsAfterSingleRun = await page.locator('.spec-done-row-plan-parent .spec-check-status-passed:visible').count();
  const passedAcItemsAfterPlanItemRun = await page.locator('.spec-done-row-ac-item .spec-check-status-passed:visible').count();
  if (passedPlanItemsAfterSingleRun !== 1 || passedAcItemsAfterPlanItemRun !== 0) {
    throw new Error(`A single Plan-item run must affect only that item: ${JSON.stringify({ passedPlanItemsAfterSingleRun, passedAcItemsAfterPlanItemRun })}`);
  }

  const planSectionRun = page.locator('[data-demo-id="spec-run-section-plan"]:visible').first();
  await demoClick(page, planSectionRun, 'Beat 4', 'Run only the Plan section.');
  await page.waitForFunction(() => (
    document.querySelectorAll('.spec-done-row-plan-parent .spec-check-status-passed').length > 1
  ));
  const passedPlanItemsAfterSectionRun = await page.locator('.spec-done-row-plan-parent .spec-check-status-passed:visible').count();
  const passedAcItemsAfterPlanSectionRun = await page.locator('.spec-done-row-ac-item .spec-check-status-passed:visible').count();
  if (passedPlanItemsAfterSectionRun <= 1 || passedAcItemsAfterPlanSectionRun !== 0) {
    throw new Error(`A Plan section run must not trigger Acceptance Criteria: ${JSON.stringify({ passedPlanItemsAfterSectionRun, passedAcItemsAfterPlanSectionRun })}`);
  }

  await acValidationRow.hover();
  const acItemRun = acValidationRow.locator('.spec-done-gutter-item-run-btn:visible').first();
  await demoClick(page, acItemRun, 'Beat 4', 'Run only the edited acceptance criterion.');
  const passedAcItemsAfterSingleRun = await page.locator('.spec-done-row-ac-item .spec-check-status-passed:visible').count();
  if (passedAcItemsAfterSingleRun !== 1) {
    throw new Error(`A single Acceptance Criteria item run must affect only that item: ${passedAcItemsAfterSingleRun}`);
  }

  const acSectionRun = page.locator('[data-demo-id="spec-run-section-ac"]:visible').first();
  await demoClick(page, acSectionRun, 'Beat 4', 'Run only the Acceptance Criteria section.');
  await page.waitForFunction(() => (
    document.querySelectorAll('.spec-done-row-ac-item .spec-check-status-passed').length > 1
  ));
  const passedAcItemsAfterSectionRun = await page.locator('.spec-done-row-ac-item .spec-check-status-passed:visible').count();
  if (passedAcItemsAfterSectionRun <= 1) {
    throw new Error(`An Acceptance Criteria section run must affect the complete section: ${passedAcItemsAfterSectionRun}`);
  }

  await demoClick(page, page.getByRole('button', { name: 'Execute', exact: true }).first(), 'Beat 4', 'Execute the refined document.');
  const documentLoading = page.locator('.agent-task-toolbar .at-generating-label:visible', { hasText: 'Building...' }).first();
  await documentLoading.waitFor({ state: 'visible', timeout: 10000 });
  const sectionRunButtons = page.locator('.spec-done-gutter-cell-section-run .spec-done-gutter-item-run-btn:visible');
  if (await sectionRunButtons.count() !== 2) {
    throw new Error(`Expected Plan and Acceptance Criteria run buttons during execution, got ${await sectionRunButtons.count()}`);
  }
  const sectionRunButtonOpacities = await sectionRunButtons.evaluateAll((nodes) => (
    nodes.map((node) => getComputedStyle(node).opacity)
  ));
  if (sectionRunButtonOpacities.some((opacity) => opacity !== '1')) {
    throw new Error(`Section run buttons must remain visible during execution: ${JSON.stringify(sectionRunButtonOpacities)}`);
  }
  await capture(page, 'beat-4-document-executing');
  await documentLoading.waitFor({ state: 'hidden', timeout: 30000 });
  await page.locator('.spec-done-scroll:visible').evaluate((node) => {
    node.scrollTop = node.scrollHeight;
  });
  await pause(200);
  const expectedGeneratedDiffs = [
    'VetSchedule.java+59',
    'VetScheduleRepository.java+4',
    'schema.sql+11',
    'data.sql+9',
    'VetFormatter.java+29',
    'VisitController.java+15-1',
    'VisitControllerTests.java+74-2',
  ];
  const renderedGeneratedDiffs = await page.locator('.spec-changed-files-chip:visible').evaluateAll((nodes) => (
    nodes.map((node) => (node.textContent || '').replace(/\s+/g, ''))
  ));
  if (JSON.stringify(renderedGeneratedDiffs) !== JSON.stringify(expectedGeneratedDiffs)) {
    throw new Error(`Generated diff list mismatch: ${JSON.stringify(renderedGeneratedDiffs)}`);
  }
  await capture(page, 'beat-4-execution-complete');

  const controllerDiffChip = page.locator('.spec-changed-files-chip:visible', { hasText: 'VisitController.java' }).first();
  await demoClick(page, controllerDiffChip, 'Beat 5', 'Open the generated controller diff next to Vet-Schedules.md.');
  await page.locator('.main-window-editor-tabs .tab.tab-selected:visible', { hasText: 'Diff VisitController.java' }).waitFor({ state: 'visible' });
  await page.locator('.plan-diff-fragment:visible', { hasText: 'isBefore(schedule.getEndTime())' }).first().waitFor({ state: 'visible' });

  await clickTaskRow(page, 'Vet-Schedules.md', 'Beat 5', 'Return to the specification before opening the regression-test diff.');
  const testDiffChip = page.locator('.spec-changed-files-chip:visible', { hasText: 'VisitControllerTests.java' }).first();
  await demoClick(page, testDiffChip, 'Beat 5', 'Open the generated regression-test diff next to Vet-Schedules.md.');
  await page.locator('.main-window-editor-tabs .tab.tab-selected:visible', { hasText: 'Diff VisitControllerTests.java' }).waitFor({ state: 'visible' });
  await page.locator('.plan-diff-fragment:visible', { hasText: 'acceptsBookingAtScheduleStartBoundary' }).first().waitFor({ state: 'visible' });
  await page.locator('.plan-diff-fragment:visible', { hasText: 'rejectsBookingAtScheduleEndBoundary' }).first().waitFor({ state: 'visible' });
  await capture(page, 'beat-5-generated-diffs');

  await updateOverlay(page, { beat: 'Complete', text: 'JVM scenario automation finished.' });
  await pause(1400);
  return;

  const inspectionCounts = page.locator('[data-demo-id="spec-inspection-counts"]').first();
  if (!await inspectionCounts.isVisible().catch(() => false)) {
    await clickSpecSectionRun(page, 'Plan', 'Beat 2', 'Build the spec to produce current inspection results.');
  }
  await inspectionCounts.waitFor({ state: 'visible', timeout: 20000 });
  await page.locator('[data-demo-id="spec-row-ac-0"][data-issue-severity="warning"]').waitFor({
    state: 'visible',
    timeout: 20000,
  });
  await capture(page, 'beat-2-vet-schedules');

  await clickByDemoId(page, 'spec-inspection-counts', 'Beat 2', 'Open the issues detected in the spec.');
  await pause(700);

  await focusSpecRow(page, 'spec-row-ac-0', 'Beat 2', 'Focus AC #1 and inspect the mismatch.');
  await clickByDemoId(page, 'spec-issue-actions-ac-0', 'Beat 2', 'Open quick actions for AC #1.');
  await clickByDemoId(page, 'issue-popup-apply-fix-ac-0', 'Beat 2', 'Apply the vet availability quick fix.');
  await pause(700);

  await focusSpecRow(page, 'spec-row-ac-1', 'Beat 2', 'Focus AC #2 and add a clarifying comment.');
  await clickByDemoId(page, 'spec-comment-ac-1', 'Beat 2', 'Open inline comments for AC #2.');
  const specCommentInput = page.locator('[data-demo-id="diff-comment-input"]:visible').first();
  await demoType(page, specCommentInput, 'Beat 2', 'Describe the exact time-slot behavior.', acComment);
  await demoClick(page, page.locator('[data-demo-id="diff-comment-submit"]:visible').first(), 'Beat 2', 'Attach the AC #2 AI Note.');
  await pause(600);

  await focusSpecRow(page, 'spec-row-plan-2', 'Beat 2', 'Focus the race-condition plan step.');
  await clickByDemoId(page, 'spec-issue-actions-plan-2', 'Beat 2', 'Open issue actions for the race-condition warning.');
  await clickByDemoId(page, 'issue-popup-apply-fix-plan-2', 'Beat 2', 'Add the booking constraint quick fix.');
  await pause(600);

  await focusSpecRow(page, 'spec-row-plan-4', 'Beat 2', 'Focus the missing formatter plan step.');
  await clickByDemoId(page, 'spec-issue-actions-plan-4', 'Beat 2', 'Open issue actions for the formatter error.');
  await clickByDemoId(page, 'issue-popup-apply-fix-plan-4', 'Beat 2', 'Add the VetFormatter follow-up step.');
  await pause(600);
  await capture(page, 'beat-2-fixes-applied');

  await clickSpecSectionRun(page, 'Plan', 'Beat 3', 'Build the refined spec with the fixes and AI Note context.');
  await page.locator('[data-demo-id="spec-row-plan-2"] .spec-check-status-passed').waitFor({
    state: 'visible',
    timeout: 20000,
  });
  await page.locator('[data-demo-id="spec-row-ac-0"] .spec-check-status-passed').waitFor({
    state: 'visible',
    timeout: 20000,
  });
  await pause(1000);
  await capture(page, 'beat-2-enhanced-spec');
  await capture(page, 'beat-3-run-results');

  await clickByDemoId(page, 'plan-show-diff-plan-3', 'Beat 4', 'Open the VisitController diff for review.');
  await pause(1200);
  await capture(page, 'beat-4-diff-open');

  const diffRow = page.locator('.plan-diff-row', { hasText: 'return this.timeSlots;' }).first();
  await demoClick(page, diffRow, 'Beat 4', 'Focus the cached time-slots change in the diff.');
  await demoClick(page, diffRow.locator('[data-demo-id^=\"diff-comment-toggle-\"]').first(), 'Beat 4', 'Open inline review comments for the diff row.');
  const diffCommentInput = page.locator('[data-demo-id="diff-comment-input"]:visible').first();
  await demoType(page, diffCommentInput, 'Beat 4', 'Leave a compact controller review note.', diffComment);
  await demoClick(page, page.locator('[data-demo-id="diff-comment-submit"]:visible').first(), 'Beat 4', 'Attach the controller AI Note.');
  await capture(page, 'beat-4-diff-comment');
  await logDomSummary(page, 'beat-4-diff-comment');

  await page.locator('.plan-diff-inline-comment:visible', { hasText: diffComment }).first().waitFor({
    state: 'visible',
    timeout: 10000,
  });
  await updateOverlay(page, {
    beat: 'Beat 5',
    text: 'The AI Note remains anchored to the reviewed diff and Visit-Booking.md context.',
  });
  await capture(page, 'beat-5-review-context-retained');

  const diffCodeReviewButton = page.locator('.plan-diff-code-review-button:visible').first();
  await waitForEnabled(diffCodeReviewButton);
  await demoFocus(page, diffCodeReviewButton, 'Beat 6', 'The reviewed diff is ready for a follow-up Code Review.');

  await capture(page, 'beat-6-wrap-up');
  await updateOverlay(page, { beat: 'Complete', text: 'JVM scenario automation finished.' });
  await pause(1400);
}

async function main() {
  await ensureOutputDir();

  const hasExistingServer = await waitForServer(baseUrl, 1200)
    .then(() => true)
    .catch(() => false);

  if (!reuseExistingServer && !hasExistingServer) {
    await startServer();
  } else {
    await waitForServer(baseUrl, startupTimeoutMs);
  }

  const browser = await chromium.launch({
    headless,
    slowMo,
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
  });

  const page = await context.newPage();

  const cleanup = async () => {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
    await stopServer().catch(() => {});
  };

  const handleSignal = async (signal) => {
    process.stderr.write(`\nReceived ${signal}, stopping scenario…\n`);
    await cleanup();
    process.exit(1);
  };

  process.on('SIGINT', handleSignal);
  process.on('SIGTERM', handleSignal);

  try {
    await runScenario(page);
    await cleanup();
    if (screenshotMode === 'off' || screenshotMode === 'none') {
      process.stdout.write('\nScenario run finished with screenshots disabled.\n');
    } else {
      process.stdout.write(`\nSaved scenario screenshots to ${outputDir}\n`);
    }
  } catch (error) {
    await capture(page, 'failed').catch(() => {});
    await cleanup();
    throw error;
  }
}

main().catch((error) => {
  console.error('\nJVM scenario automation failed.');
  console.error(error);
  process.exit(1);
});
