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
  const prompt = 'Add vet working hours and reject bookings outside them';
  const noteText = headless ? 'Please clarify this.' : 'Keep previously confirmed appointments. Apply the restriction only to new bookings.';
  const runtimeErrors = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  console.log('Running corrected marketing-video scenario…');
  await page.goto(`${baseUrl}?screen=welcome`, { waitUntil: 'networkidle' });
  await installScenarioOverlay(page);
  const initialPrompt = page.locator('textarea[aria-label="Task prompt"]:visible').first();
  await initialPrompt.waitFor();
  const initialTabs = page.locator('.main-window-editor-tabs .tab:visible');
  if (await initialTabs.count() !== 1 || !(await initialTabs.first().innerText()).includes('New Session')) {
    throw new Error(`Expected a fresh New Session at startup: ${await initialTabs.allTextContents()}`);
  }
  await capture(page, '00-new-session-start');
  await demoType(page, page.locator('textarea[aria-label="Task prompt"]:visible').first(), '1. Start the task', 'Add working hours to the existing booking flow.', prompt);
  await capture(page, '01-task-prompt');
  await demoClick(page, page.getByRole('button', { name: 'Send', exact: true }).last(), '1. Start the task', 'Follow the task in a living document.', { afterPauseMs: 0 });
  await finishOptionalSpecificationLaunch(page, '1. Start the task');

  const document = page.locator('.spec-done-overlay:visible').first();
  await document.getByText('Add vet working hours and reject bookings outside them.', { exact: true }).waitFor();
  const tabs = page.locator('.main-window-editor-tabs .tab:visible');
  if (await tabs.count() !== 1 || !(await tabs.first().innerText()).includes('Vet-Schedules.md')) {
    throw new Error(`Only the generated file should be open: ${await tabs.allTextContents()}`);
  }
  if (await page.locator('[data-demo-id="spec-inspection-counts"]:visible').count()) {
    throw new Error('The clean document must not show the green Problems shortcut.');
  }
  await capture(page, '02-generated-document');

  const plan = document.locator('.spec-done-row-plan-parent');
  const ac = document.locator('.spec-done-row-ac-item');
  const affectedAc = document.locator('[data-demo-id="spec-row-ac-1"]');
  const statusCount = (rows, status) => rows.locator(`.spec-check-status-${status}`).count();
  const assertCounts = async (planPassed, acPassed, acFailed) => {
    const actual = [await statusCount(plan, 'passed'), await statusCount(ac, 'passed'), await statusCount(ac, 'failed')];
    if (JSON.stringify(actual) !== JSON.stringify([planPassed, acPassed, acFailed])) {
      throw new Error(`Unexpected Plan/AC states: ${actual}; expected ${[planPassed, acPassed, acFailed]}`);
    }
  };
  const execute = page.getByRole('button', { name: 'Implement', exact: true }).first();
  await demoClick(page, execute, '2. Run the task', 'Watch the plan complete, then verification begins.', { afterPauseMs: 0 });
  await page.getByText('Building...', { exact: true }).first().waitFor();
  await capture(page, '03-executing-plan');
  await affectedAc.locator('.spec-check-status-failed').waitFor({ timeout: 30000 });
  await execute.waitFor();
  await assertCounts(6, 3, 1);
  await capture(page, '04-verification-needs-decision');

  await demoClick(page, affectedAc.locator('.ac-checks-toggle'), '3. Notice the problem', 'Verification reveals a decision the request left open.');
  await affectedAc.getByText('The criterion does not cover existing appointments after working hours change. Keep them or flag for rescheduling?', { exact: true }).waitFor();
  const subcheckBounds = await affectedAc.locator('.ac-subcheck-text').evaluateAll(nodes => nodes.map(node => {
    const text = node.getBoundingClientRect();
    const icon = node.previousElementSibling.getBoundingClientRect();
    return { textX: text.x, iconX: icon.x, iconOffsetY: icon.y - text.y };
  }));
  if (subcheckBounds.some(bounds => Math.abs(bounds.textX - subcheckBounds[0].textX) > 0.5 || Math.abs(bounds.iconX - subcheckBounds[0].iconX) > 0.5 || Math.abs(bounds.iconOffsetY - 3) > 0.5)) {
    throw new Error(`AC subchecks are misaligned: ${JSON.stringify(subcheckBounds)}`);
  }
  await capture(page, '05-confirmed-appointment-conflict');

  // Rerunning before feedback must not manufacture a pass.
  if (headless) {
    await execute.click();
    await execute.waitFor();
    await assertCounts(6, 3, 1);
  }
  await affectedAc.hover();
  await clickByDemoId(page, 'spec-comment-ac-1', '4. Clarify the behavior', 'Respond directly on the acceptance criterion.');
  await demoType(page, page.locator('[data-demo-id="diff-comment-input"]:visible').first(), '4. Clarify the behavior', 'Keep confirmed appointments; validate only new bookings.', noteText);
  await capture(page, '06-criterion-comment');
  await demoClick(page, page.locator('[data-demo-id="diff-comment-submit"]:visible').first(), '4. Clarify the behavior', 'Attach the comment.');
  await assertCounts(6, 3, 1); // Drafting feedback must not change verification.
  const reviseButton = page.getByRole('button', { name: 'Revise Workspace', exact: true }).first();
  const [implementBox, reviseBox] = await Promise.all([execute.boundingBox(), reviseButton.boundingBox()]);
  if (!implementBox || !reviseBox || Math.abs(implementBox.height - reviseBox.height) > 0.5) throw new Error('Toolbar actions must have equal heights.');
  if (await document.getByText(/^Note \d+$/).count()) throw new Error('Submitted comments must not show numbered Note labels.');
  await demoClick(page, page.getByRole('button', { name: 'Revise Workspace', exact: true }).first(), '4. Clarify the behavior', 'Update the document before executing again.', { afterPauseMs: 0 });
  await page.getByText('Processing...', { exact: true }).first().waitFor();
  if (!(await execute.isDisabled())) throw new Error('Execute must be disabled while feedback is applied.');
  await affectedAc.getByText('New bookings outside the vet\'s working hours are rejected. Previously confirmed appointments remain unchanged.', { exact: true }).waitFor();
  if (await affectedAc.locator('strong, .ac-revised-text').count()) throw new Error('Revised AC must use plain text.');
  await page.getByText('Processing...', { exact: true }).first().waitFor({ state: 'hidden' });
  await assertCounts(4, 3, 0);
  if (await statusCount(plan, 'pending') !== 2 || await statusCount(ac, 'pending') !== 1) {
    throw new Error('Only validation, tests and the affected AC must be unchecked.');
  }
  if (await affectedAc.locator('.ac-subcheck-list').count()) throw new Error('Old evidence must be cleared after the AC changes.');
  if (await tabs.count() !== 1) throw new Error('Sending feedback must keep only the file tab visible.');
  await capture(page, '07-updated-ac-awaiting-execute');
  if (await document.getByText(/^Note \d+$/).count()) throw new Error('Sent comments must not show numbered Note labels.');

  await demoClick(page, execute, '5. Re-execute', 'Continue the affected work. Keep completed steps.', { afterPauseMs: 0 });
  if (await statusCount(plan, 'passed') < 4 || await statusCount(ac, 'passed') < 3) {
    throw new Error('Re-execution must preserve unaffected completed results.');
  }
  await affectedAc.locator('.spec-check-status-passed').waitFor({ timeout: 30000 });
  await execute.waitFor();
  await assertCounts(6, 4, 0);
  await demoClick(page, affectedAc.locator('.ac-checks-toggle'), '5. Re-execute', 'Both outcomes are verified.');
  await affectedAc.getByText('Existing confirmed appointment at 18:00 is preserved after the schedule changes.', { exact: true }).waitFor();
  await affectedAc.getByText('New booking at 18:00 is rejected. No visit is saved.', { exact: true }).waitFor();
  await capture(page, '08-verified-outcomes');

  const review = page.getByRole('button', { name: 'Review generated diffs', exact: true });
  await review.scrollIntoViewIfNeeded();
  const reviewBounds = await review.boundingBox();
  const runBounds = await document.locator('.spec-done-gutter-cell-section-run .spec-done-gutter-item-run-btn').first().boundingBox();
  if (!reviewBounds || !runBounds || Math.abs(reviewBounds.x - runBounds.x) > 0.5 || Math.abs(reviewBounds.width - runBounds.width) > 0.5) {
    throw new Error(`Gutter buttons are misaligned: ${JSON.stringify({ reviewBounds, runBounds })}`);
  }
  const fileNames = await document.locator('.spec-changed-files-chip-name').allTextContents();
  const expectedFiles = ['VetSchedule.java', 'VetScheduleRepository.java', 'schema.sql', 'data.sql', 'VisitController.java', 'VisitControllerTests.java'];
  if (JSON.stringify(fileNames) !== JSON.stringify(expectedFiles)) throw new Error(`Unexpected generated files: ${fileNames}`);
  await capture(page, '09-generated-diffs');
  await demoClick(page, review, '6. Review the code', 'Review the changes with their context intact.');
  await page.locator('.plan-diff-fragment:visible', { hasText: 'isBefore(schedule.getEndTime())' }).first().waitFor();
  await page.getByRole('button', { name: '5/6 files', exact: true }).waitFor();
  if (await page.locator('.plan-diff-toolbar-meta:visible').count()) throw new Error('Diff toolbar must not show a differences counter.');
  await capture(page, '10-code-review-fade-out');

  // Inspect the regression diff after the final recording beat.
  if (headless) {
    await page.getByTitle('Next file', { exact: true }).click();
    await page.getByRole('button', { name: '6/6 files', exact: true }).waitFor();
    await page.locator('.plan-diff-fragment:visible', { hasText: 'preservesConfirmedAppointmentAfterScheduleChange' }).first().waitFor();
    await page.locator('.plan-diff-fragment:visible', { hasText: 'entityManager.find(Visit.class, confirmedId)' }).first().waitFor();
    await page.getByTitle('Previous file', { exact: true }).click();
    await page.getByRole('button', { name: '5/6 files', exact: true }).click();
    const filePopup = page.locator('.plan-diff-files-popup:visible');
    for (const file of expectedFiles) await filePopup.getByText(file, { exact: true }).waitFor();
    await filePopup.getByText('VetSchedule.java', { exact: true }).click();
    await page.getByRole('button', { name: '1/6 files', exact: true }).waitFor();
    const expectedCode = {
      'VetSchedule.java': '@Table(name = "vet_schedules")',
      'VetScheduleRepository.java': 'List<VetSchedule> findByVetIdAndWeekday(int vetId, DayOfWeek weekday);',
      'schema.sql': 'CONSTRAINT ck_vet_schedule_window CHECK (start_time < end_time)',
      'data.sql': "VALUES (6, 'MONDAY', '09:00', '17:00')",
      'VisitController.java': 'result.rejectValue("time", "outsideWorkingHours"',
    };
    for (const [file, code] of Object.entries(expectedCode)) {
      await clickTaskRow(page, 'Vet-Schedules.md', 'Verification', `Inspect ${file}.`);
      await page.locator('.spec-changed-files-chip', { hasText: file }).click();
      await page.locator('.plan-diff-fragment:visible', { hasText: code }).first().waitFor();
    }
  }
  if (runtimeErrors.length) throw new Error(`Browser errors: ${runtimeErrors.join('\n')}`);
  console.log('Verified: conflict → comment → partial invalidation → Execute → proof → code review.');
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
