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
  await locator.waitFor({ state: 'visible', timeout: 20000 });
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error('Target has no bounding box');
  }

  return {
    x: box.x + (box.width / 2),
    y: box.y + (box.height / 2),
  };
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

async function clickByDemoId(page, demoId, beat, text, options = {}) {
  const locator = page.locator(`[data-demo-id="${demoId}"]`).first();
  await demoClick(page, locator, beat, text, options);
}

async function focusSpecRow(page, demoId, beat, text) {
  const row = page.locator(`[data-demo-id="${demoId}"]`).first();
  const editable = row.locator('[contenteditable]').first();
  const target = await editable.count().catch(() => 0) ? editable : row;
  await demoClick(page, target, beat, text);
}

async function clickTaskRow(page, label, beat, text) {
  const locator = page.locator(`[data-demo-id="agent-task-row-${slugify(label)}"]`).first();
  await demoFocus(page, locator, beat, text);
  await pulseCursor(page, true);
  await locator.evaluate((node) => node.click());
  await pause(180);
  await pulseCursor(page, false);
  await page.locator('.main-window-editor-tabs .tab.tab-selected', { hasText: label }).first().waitFor({ state: 'visible', timeout: 10000 });
  await pause(250);
}

async function clickByText(page, selector, text, beat, description, options = {}) {
  const locator = page.locator(selector, { hasText: text }).first();
  await demoClick(page, locator, beat, description, options);
}

async function runScenario(page) {
  const prompt = 'Create a spec for visit booking in PetClinic based on prd.md';
  const acComment = 'Fixed hourly slots from 09:00 to 16:00. Use <select> with predefined options. Last bookable slot is 16:00. Slot range configurable.';
  const diffComment = 'Time slots never change at runtime — build the list once in the constructor';

  console.log('Running JVM scenario automation…');
  await updateOverlay(page, { beat: 'Beat 1', text: 'Loading the welcome screen…' });
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await installScenarioOverlay(page);
  await updateOverlay(page, { beat: 'Beat 1', text: 'Preparing project setup…' });
  await pause(400);

  await clickByDemoId(page, 'welcome-new-agent-task', 'Beat 1', 'Open “New Task for Agent”.');
  await capture(page, 'beat-1-new-task');

  const editor = page.locator('.main-window-editor-content .editor .pce-textarea').first();
  await demoType(page, editor, 'Beat 1', 'Type the initial visit-booking prompt.', prompt);
  await capture(page, 'beat-1-prompt');

  await clickByDemoId(page, 'agent-task-generate', 'Beat 1', 'Generate the first spec draft.');
  await clickByDemoId(page, 'terminal-permission-allow-once', 'Beat 1', 'Allow the agent execution for this run.');
  await page.locator('[data-demo-id="agent-task-run"]').waitFor({ state: 'visible', timeout: 20000 });
  await pause(1600);
  await capture(page, 'beat-1-generated-spec');

  await clickTaskRow(page, 'visit-booking.md', 'Beat 2', 'Open visit-booking.md from Agent Tasks.');
  await page.locator('[data-demo-id="spec-inspection-counts"]').waitFor({ state: 'visible', timeout: 10000 });
  await capture(page, 'beat-2-visit-booking');

  await clickByDemoId(page, 'spec-inspection-counts', 'Beat 2', 'Open the issues detected in the spec.');
  await pause(700);

  await focusSpecRow(page, 'spec-row-ac-0', 'Beat 2', 'Focus AC #1 and inspect the mismatch.');
  await clickByDemoId(page, 'spec-issue-actions-ac-0', 'Beat 2', 'Open quick actions for AC #1.');
  await clickByDemoId(page, 'issue-popup-apply-fix-ac-0', 'Beat 2', 'Apply the vet availability quick fix.');
  await pause(700);

  await focusSpecRow(page, 'spec-row-ac-1', 'Beat 2', 'Focus AC #2 and add a clarifying comment.');
  await clickByDemoId(page, 'spec-comment-ac-1', 'Beat 2', 'Open inline comments for AC #2.');
  const specCommentInput = page.getByPlaceholder('Write a comment').first();
  await demoType(page, specCommentInput, 'Beat 2', 'Describe the exact time-slot behavior.', acComment);
  await demoClick(page, page.getByRole('button', { name: 'Add a Comment', exact: true }).first(), 'Beat 2', 'Save the AC #2 comment.');
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

  const enhanceButton = page.locator('[data-demo-id="agent-task-enhance"]').first();
  await waitForEnabled(enhanceButton);
  await demoClick(page, enhanceButton, 'Beat 2', 'Regenerate the spec with the fixes and comment context.');
  await page.locator('[data-demo-id="agent-task-run"]').waitFor({ state: 'visible', timeout: 20000 });
  await pause(1800);
  await capture(page, 'beat-2-enhanced-spec');

  await clickByDemoId(page, 'agent-task-run', 'Beat 3', 'Run the execution loop for the refined spec.');
  await pause(9000);
  await capture(page, 'beat-3-run-results');

  await clickByDemoId(page, 'plan-show-diff-plan-3', 'Beat 4', 'Open the VisitController diff for review.');
  await pause(1200);
  await capture(page, 'beat-4-diff-open');

  const diffRow = page.locator('.plan-diff-row', { hasText: 'return this.timeSlots;' }).first();
  await demoClick(page, diffRow, 'Beat 4', 'Focus the cached time-slots change in the diff.');
  await demoClick(page, diffRow.locator('[data-demo-id^=\"diff-comment-toggle-\"]').first(), 'Beat 4', 'Open inline review comments for the diff row.');
  const diffCommentInput = page.getByPlaceholder('Write a comment').first();
  await demoType(page, diffCommentInput, 'Beat 4', 'Leave a compact controller review note.', diffComment);
  await demoClick(page, page.getByRole('button', { name: 'Add a Comment', exact: true }).first(), 'Beat 4', 'Save the controller review comment.');
  await capture(page, 'beat-4-diff-comment');

  await clickTaskRow(page, 'visit-booking.md', 'Beat 4', 'Return from the diff to visit-booking.md.');
  await pause(1000);
  await capture(page, 'beat-4-review-comment-synced');

  await clickTaskRow(page, 'vet-schedules.md', 'Beat 5', 'Switch to the parallel vet-schedules task.');
  await pause(800);
  await capture(page, 'beat-5-vet-schedules');
  await clickByDemoId(page, 'agent-task-generate', 'Beat 5', 'Generate the vet-schedules spec draft.');
  await clickByDemoId(page, 'terminal-permission-allow-once', 'Beat 5', 'Allow the parallel task execution.');
  await page.locator('[data-demo-id="agent-task-run"]').waitFor({ state: 'visible', timeout: 20000 });
  await pause(1500);
  await capture(page, 'beat-5-vet-schedules-generated');

  await clickTaskRow(page, 'visit-booking.md', 'Beat 6', 'Return to visit-booking for wrap-up.');
  await pause(800);
  await clickByDemoId(page, 'agent-task-run', 'Beat 6', 'Re-run acceptance checks after the review update.');
  await pause(9000);

  const addToProjectContext = page.getByText('Add to project context').first();
  if (await addToProjectContext.isVisible().catch(() => false)) {
    await demoClick(page, addToProjectContext, 'Beat 6', 'Extract the decision into project context.');
    await pause(1200);
  }

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
