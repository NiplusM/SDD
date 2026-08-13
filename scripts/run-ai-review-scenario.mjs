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
const outputDir = path.join(projectRoot, 'test-results', 'ai-review-scenario');
const baseUrl = process.env.AI_REVIEW_SCENARIO_URL
  || process.env.SCENARIO_URL
  || 'http://127.0.0.1:4173/';
const headless = !process.argv.includes('--headed');
const reuseExistingServer = process.argv.includes('--reuse-existing')
  || Boolean(process.env.AI_REVIEW_SCENARIO_URL)
  || Boolean(process.env.SCENARIO_URL);
const startupTimeoutMs = Number(process.env.SCENARIO_STARTUP_TIMEOUT_MS ?? 30000);
const actionTimeoutMs = Number(process.env.AI_REVIEW_ACTION_TIMEOUT_MS ?? 20000);
const screenshotMode = (
  process.env.SCENARIO_SCREENSHOT_MODE
  || (headless ? 'full' : 'off')
).toLowerCase();

let devServer = null;
let screenshotIndex = 1;

function slugify(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'step';
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitForServer(url, timeoutMs) {
  const startedAt = Date.now();
  let lastError = null;

  while ((Date.now() - startedAt) < timeoutMs) {
    try {
      const response = await fetch(url, { method: 'GET' });
      if (response.ok) return;
      lastError = new Error(`Unexpected status from ${url}: ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await delay(250);
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

  devServer.stdout.on('data', (chunk) => process.stdout.write(`[vite] ${chunk}`));
  devServer.stderr.on('data', (chunk) => process.stderr.write(`[vite] ${chunk}`));
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
    delay(4000).then(() => {
      if (!devServer.killed) devServer.kill('SIGKILL');
    }),
  ]);
}

async function prepareOutputDir() {
  await fs.rm(outputDir, { recursive: true, force: true });
  await fs.mkdir(outputDir, { recursive: true });
}

async function capture(page, name) {
  if (screenshotMode === 'off' || screenshotMode === 'none') return;

  const fileName = `${String(screenshotIndex).padStart(2, '0')}-${slugify(name)}.png`;
  screenshotIndex += 1;
  await page.screenshot({
    path: path.join(outputDir, fileName),
    fullPage: screenshotMode === 'full',
    animations: 'disabled',
    caret: 'hide',
  });
}

async function visible(locator, timeout = actionTimeoutMs) {
  await locator.waitFor({ state: 'visible', timeout });
  return locator;
}

async function assertProcessingComposer(page, iteration, {
  enqueueFollowUp = false,
} = {}) {
  const running = page.getByRole('status', { name: 'Review running', exact: true }).last();
  await visible(running);
  await visible(running.getByText('Running...', { exact: true }));
  assert(
    await page.getByRole('region', { name: 'AI Review scope' }).count() === 0,
    `Iteration ${iteration}: custom review-scope card is still mounted`,
  );

  const followUpInput = page.locator(
    // Attachments intentionally clear the placeholder, while the standard
    // processing composer keeps this accessible label stable.
    'textarea[aria-label="Add a follow-up"]:visible',
  ).last();
  await visible(followUpInput);
  assert(await followUpInput.isEnabled(), `Iteration ${iteration}: the follow-up input is disabled`);

  const composer = page.locator('.aiux543-chat-composer:visible').last();
  const voiceInput = composer.getByRole('button', { name: 'Voice input', exact: true });
  const stop = composer.getByRole('button', { name: 'Stop', exact: true });
  await visible(voiceInput);
  await visible(stop);
  assert(
    await composer.locator('.aiux543-chat-toolbar button').count() === 3,
    `Iteration ${iteration}: processing composer must contain only Add context, Voice input, and Stop`,
  );
  await visible(page.locator('.aiux543-editor-footer:visible').last());
  assert(
    await page.getByRole('region', { name: 'AI Review files' }).count() === 0,
    `Iteration ${iteration}: obsolete file-progress component is still mounted`,
  );
  assert(
    await page.locator('.ij-air-follow-up-queue__item-status').count() === 0,
    `Iteration ${iteration}: obsolete per-file status nodes are still mounted`,
  );
  const queue = page.getByRole('region', { name: 'AI Review' }).last();
  await visible(queue);
  await visible(queue.getByText('AI Review', { exact: true }));
  const scopeRows = queue.locator('[data-review-scope-file-status]');
  const scopeFileCount = await scopeRows.count();
  assert(scopeFileCount > 0, `Iteration ${iteration}: review scope files are missing from AI Review`);
  assert(
    (await queue.locator('[data-review-scope-file-status="processing"]').count()) === 1,
    `Iteration ${iteration}: AI Review must show one actively processing file`,
  );
  const count = queue.locator('.ij-air-follow-up-queue__count');
  await visible(count);
  assert(
    (await count.textContent())?.trim() === String(scopeFileCount),
    `Iteration ${iteration}: AI Review count does not match the review scope`,
  );

  for (const obsoleteLabel of ['Waiting…', 'Queued', 'Reviewed', 'Failed']) {
    assert(
      await page.getByText(obsoleteLabel, { exact: true }).count() === 0,
      `Iteration ${iteration}: obsolete processing label is visible: ${obsoleteLabel}`,
    );
  }

  if (enqueueFollowUp) {
    const followUpText = 'Re-check the queued follow-up after the current review finishes.';
    await followUpInput.fill(followUpText);
    await followUpInput.press('Enter');

    await visible(queue.getByText(followUpText, { exact: true }));
    await visible(queue.locator('[data-review-scope-file-status="done"]').first());
    await capture(page, `iteration-${iteration}-processing-follow-up-queue`);
  }

  return { composer, followUpInput, stop };
}

async function latestPreview(page, expectedStatus) {
  const heading = page.getByRole('heading', { name: /^Review Preview:/ }).last();
  await visible(heading, 15000);
  const card = heading.locator('xpath=ancestor::article[1]');
  await visible(
    card.locator('.aiux550-review-summary-status').filter({ hasText: expectedStatus }),
    10000,
  );
  return { heading, card };
}

async function activeReviewDecision(page) {
  const decision = page.locator('.aiux550-review-decision-composer:visible').last();
  await visible(decision);
  return decision;
}

async function confirmReviewDecision(page, actionLabel) {
  const decision = await activeReviewDecision(page);
  const actions = decision.getByRole('radio');
  const action = decision.getByRole('radio', { name: actionLabel, exact: true });
  await visible(action);
  const actionCount = await actions.count();
  let selectedIndex = -1;
  let targetIndex = -1;
  for (let index = 0; index < actionCount; index += 1) {
    const candidate = actions.nth(index);
    if (await candidate.getAttribute('aria-checked') === 'true') selectedIndex = index;
    if (await candidate.getAttribute('aria-label') === actionLabel) targetIndex = index;
  }
  assert(selectedIndex >= 0, 'The review decision has no keyboard-selected action');
  assert(targetIndex >= 0, `${actionLabel} is missing from the review decision`);
  await actions.nth(selectedIndex).focus();
  for (let index = selectedIndex; index !== targetIndex; index = (index + 1) % actionCount) {
    await page.keyboard.press('ArrowDown');
  }
  assert(
    await action.getAttribute('aria-checked') === 'true',
    `${actionLabel} was not selected with ArrowDown before confirmation`,
  );
  assert(
    await action.evaluate((element) => document.activeElement === element),
    `${actionLabel} did not receive focus during keyboard navigation`,
  );
  await visible(decision.getByRole('button', { name: /^Skip\b/ }));
  const next = decision.getByRole('button', { name: /^Next\b/ });
  await visible(next);
  await page.keyboard.press('Enter');
}

async function activeChatComposer(page) {
  const composer = page.locator('.aiux543-chat-composer:visible').last();
  await visible(composer);
  return composer;
}

async function openFullReviewFileView(fullReview) {
  const reviewPane = fullReview.page().getByRole('region', { name: 'Full Review pane' });
  const codeContext = fullReview.locator('.plan-diff-aside-comment-code-context:visible').first();
  await visible(codeContext);
  await codeContext.click();
  const fileView = reviewPane.locator('.aiux-review-split-file-view');
  await visible(fileView);
  return { fileView, reviewPane };
}

async function openFullReviewFileContaining(fullReview, rowSelector) {
  const reviewPane = fullReview.page().getByRole('region', { name: 'Full Review pane' });
  const codeContexts = fullReview.locator('.plan-diff-aside-comment-code-context:visible');
  const count = await codeContexts.count();
  for (let index = 0; index < count; index += 1) {
    await codeContexts.nth(index).focus();
    await codeContexts.nth(index).press('Enter');
    const fileView = reviewPane.locator('.aiux-review-split-file-view');
    await visible(fileView);
    if (await fileView.locator(rowSelector).count() > 0) return { fileView, reviewPane };
    await reviewPane.locator('.ai-review-editor-split-tabbar .tab').first().click();
    await visible(fullReview);
  }
  throw new Error(`No reviewed file contained ${rowSelector}`);
}

async function resetPrototype(page) {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await visible(page.locator('textarea[aria-label="Task prompt"]:visible').first());
}

async function openCommitToolWindow(page) {
  const commitStripe = page.locator('.main-window-stripe-left [title="Commit"]').first();
  await visible(commitStripe);
  await commitStripe.click();
  return visible(page.locator('.commit-tool-window:visible'));
}

async function selectOnlyCommitFiles(page, selectedFileNames) {
  const selected = new Set(selectedFileNames);
  const rows = page.locator('.commit-file-node');
  const rowCount = await rows.count();
  assert(rowCount > 0, 'The Commit tool window did not render any reviewable files');

  for (let index = 0; index < rowCount; index += 1) {
    const row = rows.nth(index);
    const fileName = (await row.locator('.commit-file-name').textContent())?.trim();
    const checkbox = row.locator('input[type="checkbox"]');
    assert(fileName, `Commit file row ${index + 1} has no file name`);
    await checkbox.waitFor({ state: 'attached' });
    const shouldBeChecked = selected.has(fileName);
    if ((await checkbox.isChecked()) !== shouldBeChecked) {
      // Int UI Kit keeps the native input visually clipped. Playwright's
      // check/uncheck still attempts to scroll that input into the viewport,
      // which fails for lower Commit rows; the native click preserves the real
      // input/change event without depending on geometry.
      await checkbox.evaluate((element) => element.click());
    }
  }

  const checkedNames = [];
  for (let index = 0; index < rowCount; index += 1) {
    const row = rows.nth(index);
    if (await row.locator('input[type="checkbox"]').isChecked()) {
      checkedNames.push((await row.locator('.commit-file-name').textContent())?.trim());
    }
  }
  assert(
    checkedNames.length === selected.size && checkedNames.every((name) => selected.has(name)),
    `Unexpected Commit selection: ${checkedNames.join(', ')}`,
  );
}

async function openCommitReviewDialog(page) {
  const startReview = page.getByRole('button', { name: 'AI Review', exact: true });
  await visible(startReview);
  assert(await startReview.isEnabled(), 'AI Review is disabled for a non-empty Commit selection');
  await startReview.click();

  const dialog = page.getByRole('dialog', { name: 'Configure AI Review' });
  await visible(dialog);
  assert(
    await dialog.getAttribute('data-launch-source') === 'commit',
    'The shared launch dialog did not preserve Commit as its source context',
  );
  return dialog;
}

async function assertLaunchDialogScope(dialog, expectedLaunchSource) {
  await visible(dialog);
  assert(
    await dialog.getAttribute('data-launch-source') === expectedLaunchSource,
    `Expected ${expectedLaunchSource} launch source, got ${await dialog.getAttribute('data-launch-source')}`,
  );
  // The portal becomes visible before its open-effect hydrates attachments.
  await visible(dialog.locator('.ai-chat-attachment-chip').first());
  assert(
    await dialog.locator('.ai-chat-attachment-chip').count() > 0,
    `${expectedLaunchSource} launch assembled an empty review scope`,
  );
  const startReview = dialog.getByRole('button', { name: 'Start Review', exact: true });
  await visible(startReview);
  assert(
    await startReview.isEnabled(),
    `Start Review is disabled for the non-empty ${expectedLaunchSource} scope`,
  );
  return startReview;
}

async function configureCommitReviewScope(dialog) {
  const instruction = 'Focus on lifecycle regressions and verify the prepared commit scope.';
  await visible(dialog.getByText('New Session', { exact: true }).first());
  // The portal renders before its open-effect hydrates the attachment state.
  await visible(dialog.getByText('VisitController.java', { exact: true }));

  const attachmentNames = await dialog.locator('.ai-chat-attachment-name').allTextContents();
  assert(
    ['VisitController.java', 'application.properties', 'VisitControllerTests.java']
      .every((fileName) => attachmentNames.some((name) => name.trim() === fileName)),
    `The launch dialog did not receive the selected Commit scope: ${attachmentNames.join(', ')}`,
  );

  await visible(dialog.getByText('3 files', { exact: true }));

  await dialog.getByLabel('Review instructions').fill(instruction);

  await dialog.getByRole('button', { name: 'Model', exact: true }).click();
  await dialog.getByText('GPT-5.2-Codex', { exact: true }).last().click();
  assert(
    (await dialog.getByRole('button', { name: 'Model', exact: true }).textContent())?.includes('GPT-5.2-Codex'),
    'The selected review model was not retained by the launch dialog',
  );

  await dialog.getByRole('button', { name: 'Effort', exact: true }).click();
  await dialog.getByText('Medium', { exact: true }).last().click();
  assert(
    (await dialog.getByRole('button', { name: 'Effort', exact: true }).textContent())?.includes('Medium'),
    'The selected Effort was not retained by the launch dialog',
  );

  return instruction;
}

async function exercisePreviewFindingReplyAndDecision(page, previewCard) {
  const showMore = previewCard.getByRole('button', { name: 'Show more', exact: true });
  if (await showMore.isVisible().catch(() => false)) await showMore.click();

  const findingText = 'The eager timeSlots init runs on every controller construction';
  const finding = previewCard.locator('.spec-done-comment-agent-reply').filter({ hasText: findingText }).first();
  await visible(finding);

  await finding.getByRole('button', { name: 'Reply', exact: true }).click();
  const reply = 'Can you confirm whether the provider lifecycle is safe in the next iteration?';
  const replyComposer = finding.locator('.spec-done-comment-agent-reply-compose');
  const replyInput = replyComposer.locator('textarea');
  await visible(replyInput);
  await replyInput.fill(reply);
  await replyComposer.getByRole('button', { name: 'Send', exact: true }).click();
  await visible(finding.getByText(reply, { exact: true }));
  await visible(finding.getByText('Pending update', { exact: true }));
  assert(
    await finding.getByText('Looked into this', { exact: false }).count() === 0,
    'The agent replied before Submit Review started a new iteration',
  );

  const acceptedFindingText = 'scheduleId is used before a null/range check';
  const acceptedFinding = previewCard.locator('.spec-done-comment-agent-reply').filter({
    hasText: acceptedFindingText,
  }).first();
  await visible(acceptedFinding);
  const before = await acceptedFinding.boundingBox();
  const acceptFix = acceptedFinding.getByRole('button', {
    name: /^(?:Apply change: )?Add null check$/,
  });
  await visible(acceptFix);
  await acceptFix.click();
  await visible(acceptedFinding.getByText('Accepted', { exact: true }), 8000);
  const after = await acceptedFinding.boundingBox();
  assert(
    before && after && Math.abs(before.y - after.y) <= 2,
    'Applying a quick fix moved the finding card instead of updating it in place',
  );
  process.stdout.write('Exercised Preview reply and Accepted finding state.\n');
  return { findingText, reply };
}

async function assertUpdatedReplyThread(page, previewCard, { findingText, reply }) {
  const showMore = previewCard.getByRole('button', { name: 'Show more', exact: true });
  if (await showMore.isVisible().catch(() => false)) await showMore.click();
  const finding = previewCard.locator('.spec-done-comment-agent-reply').filter({ hasText: findingText }).first();
  await visible(finding);
  await visible(finding.getByText(reply, { exact: true }));
  await visible(finding.getByText('Looked into this', { exact: false }));
  assert(
    await finding.getByText('Pending update', { exact: true }).count() === 0,
    'The answered finding stayed Pending update after the iteration completed',
  );
}

async function assertCompletedReadOnly(page) {
  const completedPreview = await latestPreview(page, 'Completed');
  await activeChatComposer(page);
  assert(
    await page.locator('.aiux550-review-decision-composer:visible').count() === 0,
    'The review decision component is still visible after review completion',
  );
  assert(
    await completedPreview.card.getByRole('button', { name: 'Reply', exact: true }).count() === 0,
    'A completed Preview still allows replies',
  );
  assert(
    await completedPreview.card.getByRole('button', { name: /^Apply change:/ }).count() === 0,
    'A completed Preview still allows fixes to be applied',
  );

  const openFullReview = completedPreview.card.getByRole('button', {
    name: 'Open Full View in editor tab',
    exact: true,
  });
  await visible(openFullReview);
  await openFullReview.click();
  const fullReview = page.locator('.aiux-review-overview:visible').first();
  await visible(fullReview);
  await visible(fullReview.getByText('Completed', { exact: true }));
  assert(
    await fullReview.getByRole('button', { name: /^(Complete|Submit|Cancel) Review$/ }).count() === 0,
    'Full Review still exposes global decisions after completion',
  );
  assert(
    await fullReview.getByRole('button', { name: 'Reply', exact: true }).count() === 0,
    'Full Review still allows replies after completion',
  );
  return completedPreview;
}

async function runCommitLifecycleScenario(page) {
  process.stdout.write('Running AI Review Commit lifecycle scenario…\n');
  await resetPrototype(page);
  assert(
    await page.locator('.aiux543-history-tool-window:visible').count() === 0,
    'Agent Sessions tool window is open by default',
  );
  await openCommitToolWindow(page);
  await selectOnlyCommitFiles(page, [
    'VisitController.java',
    'application.properties',
    'VisitControllerTests.java',
  ]);
  const dialog = await openCommitReviewDialog(page);
  await configureCommitReviewScope(dialog);
  const editorTabCountBeforeReview = await page.locator('.main-window-editor-tabs .tab').count();
  await capture(page, 'commit-review-configured-scope');
  await dialog.getByRole('button', { name: 'Start Review', exact: true }).click();

  await assertProcessingComposer(page, 1, { enqueueFollowUp: true });
  assert(
    await page.locator('.main-window-editor-tabs .tab').count() === editorTabCountBeforeReview + 1,
    'Commit launch did not create the default dedicated review session',
  );
  const firstPreview = await latestPreview(page, 'Open');
  await capture(page, 'commit-review-preview-open');
  const fullView = firstPreview.card.getByRole('button', {
    name: 'Open Full View in editor tab',
    exact: true,
  });
  await visible(fullView);
  await fullView.click();
  const reviewSplit = page.getByTestId('ai-review-editor-split');
  await visible(reviewSplit);
  await visible(reviewSplit.getByRole('region', { name: 'Review chat pane' }));
  const fullReviewPane = reviewSplit.getByRole('region', { name: 'Full Review pane' });
  await visible(fullReviewPane);
  await visible(fullReviewPane.locator('.aiux-review-overview'));
  await visible(fullReviewPane.getByText('Open', { exact: true }).first());
  const expandedCodeContext = fullReviewPane.locator('.plan-diff-aside-comment-code-context:visible').first();
  await visible(expandedCodeContext);
  await capture(page, 'commit-review-full-view-split');
  await expandedCodeContext.click();
  const splitFileView = fullReviewPane.locator('.aiux-review-split-file-view');
  await visible(splitFileView);
  await visible(splitFileView.locator('.plan-diff-row').first());
  const scopeFileCounter = splitFileView.getByText('1 of 3 files', { exact: true });
  await visible(scopeFileCounter);
  await scopeFileCounter.click();
  const scopeFilesPopup = page.locator('.plan-diff-files-popup:visible');
  await visible(scopeFilesPopup);
  for (const fileName of ['VisitController.java', 'application.properties', 'VisitControllerTests.java']) {
    await visible(scopeFilesPopup.getByText(fileName, { exact: false }));
  }
  await scopeFilesPopup.getByText('VisitController.java', { exact: false }).click();
  await scopeFilesPopup.waitFor({ state: 'hidden' });
  await splitFileView.getByRole('button', { name: 'Next file', exact: true }).click();
  await visible(splitFileView.getByText('2 of 3 files', { exact: true }));
  assert(
    await fullReviewPane.locator('.ai-review-editor-split-tabbar .tab').count() === 2,
    'Scope navigation opened another editor tab instead of reusing the current file tab',
  );
  await visible(fullReviewPane.locator('.ai-review-editor-split-tabbar .tab').filter({
    hasText: 'application.properties',
  }));
  await splitFileView.getByRole('button', { name: 'Next file', exact: true }).click();
  await visible(splitFileView.getByText('3 of 3 files', { exact: true }));
  assert(
    await fullReviewPane.locator('.ai-review-editor-split-tabbar .tab').count() === 2,
    'Scope navigation did not keep a single reusable file tab',
  );
  await visible(fullReviewPane.locator('.ai-review-editor-split-tabbar .tab').filter({
    hasText: 'VisitControllerTests.java',
  }));
  await splitFileView.getByText('3 of 3 files', { exact: true }).click();
  const returnToFirstFilePopup = page.locator('.plan-diff-files-popup:visible');
  await visible(returnToFirstFilePopup);
  await returnToFirstFilePopup.getByText('VisitController.java', { exact: false }).click();
  await visible(splitFileView.getByText('1 of 3 files', { exact: true }));
  assert(
    await fullReviewPane.locator('.ai-review-editor-split-tabbar .tab').count() === 2,
    'Clicking review code context did not open a file tab beside AI Review',
  );
  const addAiNote = splitFileView.getByRole('button', { name: 'Add Note', exact: true }).first();
  await visible(addAiNote);
  await addAiNote.click();
  const reviewNoteInput = splitFileView.locator('[data-demo-id="diff-comment-input"]:visible').first();
  await visible(reviewNoteInput);
  const reviewQuestion = 'Can you confirm this review note stays attached to the selected chat?';
  await reviewNoteInput.fill(reviewQuestion);
  await capture(page, 'commit-review-comment-compose');
  const reviewNoteTarget = splitFileView.getByRole('button', {
    name: /^Choose Note attachment target:/,
  }).first();
  await visible(reviewNoteTarget);
  await reviewNoteTarget.click();
  const chatsList = page.getByRole('dialog', { name: 'Chats list', exact: true });
  await visible(chatsList);
  await capture(page, 'commit-review-comment-chat-targets');
  assert(
    await chatsList.locator('.ai-chat-list-row').count() > 0,
    'The Full Review note target picker does not list chats',
  );
  assert(
    await chatsList.locator('.ai-chat-list-document-row').count() === 0,
    'The Full Review note target picker incorrectly lists Agent MD files',
  );
  const selectedChatTarget = chatsList.locator('.ai-chat-list-row').filter({ hasText: /AI Review/u }).first();
  await visible(selectedChatTarget);
  const selectedChatTitle = (await selectedChatTarget.locator('.ai-chat-list-title').textContent())?.trim();
  await selectedChatTarget.click();
  assert(
    selectedChatTitle && (await reviewNoteTarget.textContent())?.includes(selectedChatTitle),
    'The standard comment composer did not retain the selected chat title',
  );
  await splitFileView.locator('[data-demo-id="diff-comment-submit"]:visible').first().click();
  await reviewNoteInput.waitFor({ state: 'hidden' });
  const savedReviewNote = splitFileView.locator('.cmp-popup.spec-done-comment-popup').filter({
    hasText: reviewQuestion,
  }).first();
  await visible(savedReviewNote);
  assert(
    await savedReviewNote.locator('.spec-done-comment-popup-context-header.is-active-session').count() === 1,
    'A note attached to the active chat is rendered as a muted session',
  );
  assert(
    await savedReviewNote.getByText('Pending update', { exact: true }).count() === 0,
    'A user-authored review comment renders an extra Pending update badge',
  );
  await capture(page, 'commit-review-file-tab-split');
  await fullReviewPane.locator('.ai-review-editor-split-tabbar .tab').first().click();
  await visible(fullReviewPane.locator('.aiux-review-overview'));
  await fullReviewPane.locator('.tab-close').first().click();

  const reopenedPreview = await latestPreview(page, 'Open');
  const repliedFinding = await exercisePreviewFindingReplyAndDecision(page, reopenedPreview.card);
  await capture(page, 'commit-review-preview-replied-and-accepted');

  const reviewDecision = await activeReviewDecision(page);
  await reviewDecision.getByRole('radio', { name: 'Submit Review', exact: true }).click();
  await assertProcessingComposer(page, 2);
  await visible(page.getByText(repliedFinding.reply, { exact: true }).last());
  const updatedPreview = await latestPreview(page, 'Updated');
  await assertUpdatedReplyThread(page, updatedPreview.card, repliedFinding);
  await capture(page, 'commit-review-preview-updated');

  const feedbackMessage = page.locator('.ai-chat-user-card').filter({
    hasText: 'Submitted review feedback.',
  }).last();
  const feedbackDiff = feedbackMessage.locator('.ai-chat-sent-attachment-chip').first();
  await visible(feedbackDiff);
  await feedbackDiff.click();
  const reopenedReviewSplit = page.getByTestId('ai-review-editor-split');
  await visible(reopenedReviewSplit);
  const reopenedFullReviewPane = reopenedReviewSplit.getByRole('region', { name: 'Full Review pane' });
  await visible(reopenedFullReviewPane.locator('.aiux-review-split-file-view'));
  assert(
    await reopenedFullReviewPane.locator('.ai-review-editor-split-tabbar .tab').count() >= 2,
    'Opening a review diff attachment replaced the chat instead of opening in split view',
  );
  await reopenedFullReviewPane.locator('.ai-review-editor-split-tabbar .tab').first().click();
  await reopenedFullReviewPane.locator('.tab-close').first().click();
  await latestPreview(page, 'Updated');

  await confirmReviewDecision(page, 'Complete Review');
  await assertCompletedReadOnly(page);
  await capture(page, 'commit-review-completed-read-only');
  process.stdout.write('AI Review Commit lifecycle scenario finished successfully.\n');
}

async function runDirectCurrentChatScenario(page) {
  process.stdout.write('Running direct current-chat /review scenario…\n');
  await resetPrototype(page);

  const taskPrompt = page.locator('textarea[aria-label="Task prompt"]:visible').first();
  const directCommand = '/review Check the complete change context from this chat.';
  const editorTabCountBeforeReview = await page.locator('.main-window-editor-tabs .tab').count();
  await taskPrompt.fill(directCommand);

  const send = page.getByRole('button', { name: 'Send', exact: true }).last();
  await visible(send);
  assert(await send.isEnabled(), 'The default chat Send action is disabled for /review');
  await send.click();
  assert(
    await page.getByRole('dialog', { name: 'Configure AI Review' }).count() === 0,
    'Direct /review incorrectly opened the shared launch dialog',
  );

  await assertProcessingComposer(page, 'direct');
  await capture(page, 'direct-current-chat-review-processing');
  assert(
    await page.locator('.main-window-editor-tabs .tab').count() === editorTabCountBeforeReview,
    'Direct /review created a separate chat instead of staying in the current session',
  );
  const directPreview = await latestPreview(page, 'Open');
  await visible(directPreview.card.getByText('Review Preview:', { exact: false }).first());
  await capture(page, 'direct-current-chat-review-open');

  await confirmReviewDecision(page, 'Complete Review');
  await latestPreview(page, 'Completed');
  await activeChatComposer(page);
  process.stdout.write('Direct current-chat /review scenario finished successfully.\n');
}

async function runNoFindingsScenario(page) {
  process.stdout.write('Running scoped no-findings scenario…\n');
  await resetPrototype(page);
  await openCommitToolWindow(page);
  await selectOnlyCommitFiles(page, ['application.properties']);
  const dialog = await openCommitReviewDialog(page);
  await visible(dialog.getByText('1 file', { exact: true }));
  await visible(dialog.getByText('application.properties', { exact: true }));
  await dialog.getByRole('button', { name: 'Start Review', exact: true }).click();

  await assertProcessingComposer(page, 'no-findings');
  const noFindingsPreview = await latestPreview(page, 'Open');
  await visible(noFindingsPreview.card.getByText('No findings', { exact: true }).last());
  await visible(noFindingsPreview.card.getByText('1 file · 0 findings', { exact: true }));
  assert(
    await noFindingsPreview.card.getByText('1 files', { exact: false }).count() === 0,
    'The no-findings Preview uses the plural label for a single reviewed file',
  );
  await activeReviewDecision(page);
  await capture(page, 'scoped-review-no-findings');
  await confirmReviewDecision(page, 'Submit Review');
  const reviewComposer = await activeChatComposer(page);
  assert(
    await reviewComposer.getByRole('button', { name: 'Submit Review', exact: true }).isDisabled(),
    'Submit Review is available without feedback for a no-findings result',
  );
  await reviewComposer.getByRole('textbox', { name: 'Task prompt', exact: true }).press('Escape');
  await confirmReviewDecision(page, 'Complete Review');
  await latestPreview(page, 'Completed');
  await activeChatComposer(page);
  process.stdout.write('Scoped no-findings scenario finished successfully.\n');
}

async function runStoppedReviewSmoke(page) {
  process.stdout.write('Running stopped review smoke…\n');
  await resetPrototype(page);
  await openCommitToolWindow(page);
  await selectOnlyCommitFiles(page, [
    'VisitController.java',
    'application.properties',
    'VisitControllerTests.java',
  ]);
  const dialog = await openCommitReviewDialog(page);
  await dialog.getByRole('button', { name: 'Start Review', exact: true }).click();

  const { stop } = await assertProcessingComposer(page, 'stopped');
  await stop.click();

  const stoppedPreview = await latestPreview(page, 'Open');
  await visible(stoppedPreview.card.getByText('Review Preview:', { exact: false }).first());
  const showMore = stoppedPreview.card.getByRole('button', { name: 'Show more', exact: true });
  if (await showMore.isVisible().catch(() => false)) await showMore.click();
  const finding = stoppedPreview.card.locator('.spec-done-comment-agent-reply').filter({
    hasText: 'The eager timeSlots init runs on every controller construction',
  }).first();
  await visible(finding);
  await finding.getByRole('button', { name: /^(?:Apply change: )?Extract a provider$/ }).click();
  await visible(finding.getByText('Accepted', { exact: true }), 8000);

  await stoppedPreview.card.getByRole('button', {
    name: 'Open Full View in editor tab',
    exact: true,
  }).click();
  const fullReview = page.locator('.aiux-review-overview:visible').first();
  await visible(fullReview);
  const appliedRowSelector = '[data-diff-row-id="plan-code-3-added-3"]'
    + '[data-review-patch-id="fixture-time-slots-provider"]'
    + '[data-review-patch-status="applied"]';
  const { fileView: appliedFileView, reviewPane } = await openFullReviewFileContaining(fullReview, appliedRowSelector);
  const appliedRow = appliedFileView.locator(appliedRowSelector).first();
  await visible(appliedRow);
  assert(
    (await appliedRow.textContent())?.includes('this.timeSlots = timeSlotProvider.availableSlots();'),
    'The accepted fixture patch did not update the review code row',
  );
  await reviewPane.locator('.ai-review-editor-split-tabbar .tab').first().click();
  await visible(fullReview);
  await fullReview.getByRole('button', { name: 'Submit Review', exact: true }).click();
  const splitReviewQueue = page
    .getByRole('region', { name: 'Review chat pane' })
    .getByRole('region', { name: 'AI Review' });
  await visible(splitReviewQueue, 15000);
  await visible(
    page
      .getByRole('region', { name: 'Review chat pane' })
      .getByText('Submitted review feedback.', { exact: true })
      .last(),
  );
  await visible(splitReviewQueue.getByText('AI Review', { exact: true }));
  await visible(
    page
      .getByRole('region', { name: 'Review chat pane' })
      .locator('.aiux550-review-summary-status')
      .filter({ hasText: 'Updated' })
      .last(),
    15000,
  );
  await fullReview.getByRole('button', { name: 'Cancel Review', exact: true }).click();

  const reviewChatTab = page.locator('.main-window-editor-tabs .tab').filter({
    hasText: /AI Review/u,
  }).last();
  await visible(reviewChatTab);
  await reviewChatTab.click();

  const cancelledPreview = await latestPreview(page, 'Cancelled');
  await activeChatComposer(page);
  await cancelledPreview.card.getByRole('button', {
    name: 'Open Full View in editor tab',
    exact: true,
  }).click();
  const readOnlyFullReview = page.locator('.aiux-review-overview:visible').first();
  await visible(readOnlyFullReview);
  const rolledBackRowSelector = '[data-diff-row-id="plan-code-3-added-3"]'
    + '[data-review-patch-id="fixture-time-slots-provider"]'
    + '[data-review-patch-status="rolled-back"]';
  const { fileView: rolledBackFileView } = await openFullReviewFileContaining(readOnlyFullReview, rolledBackRowSelector);
  const rolledBackRow = rolledBackFileView.locator(rolledBackRowSelector).first();
  await visible(rolledBackRow);
  assert(
    (await rolledBackRow.textContent())?.includes('this.timeSlots = IntStream.rangeClosed(9, 16)'),
    'Cancel did not restore the fixture row text',
  );
  process.stdout.write('Stopped review smoke finished successfully.\n');
}

async function runDiffLaunchSmoke(page) {
  process.stdout.write('Running Diff launch smoke…\n');
  await resetPrototype(page);

  const changedFile = page.locator('.ai-chat-changed-files-row').filter({
    hasText: 'VisitController.java',
  }).first();
  await visible(changedFile);
  await changedFile.click();

  const diffEditor = page.locator('.plan-diff-editor-area:visible');
  await visible(diffEditor);
  const openReview = diffEditor.getByRole('button', { name: 'AI Review', exact: true });
  await visible(openReview);
  await openReview.click();

  const dialog = page.getByRole('dialog', { name: 'Configure AI Review' });
  await assertLaunchDialogScope(dialog, 'diff');
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  process.stdout.write('Diff launch smoke finished successfully.\n');
}

async function runShortcutLaunchSmoke(page) {
  process.stdout.write('Running Control+Control launch smoke…\n');
  await resetPrototype(page);

  await page.keyboard.press('Control');
  await page.waitForTimeout(80);
  await page.keyboard.press('Control');

  const dialog = page.getByRole('dialog', { name: 'Configure AI Review' });
  const startReview = await assertLaunchDialogScope(dialog, 'shortcut');
  await startReview.click();

  await assertProcessingComposer(page, 'shortcut');
  await latestPreview(page, 'Open');
  await confirmReviewDecision(page, 'Cancel Review');
  const reviewChatTab = page.locator('.main-window-editor-tabs .tab').filter({
    hasText: /AI Review/u,
  }).last();
  await visible(reviewChatTab);
  await reviewChatTab.click();
  await latestPreview(page, 'Cancelled');
  await activeChatComposer(page);
  process.stdout.write('Control+Control launch smoke finished successfully.\n');
}

async function runScenario(page) {
  await runCommitLifecycleScenario(page);
  await runDirectCurrentChatScenario(page);
  await runNoFindingsScenario(page);
  await runStoppedReviewSmoke(page);
  await runDiffLaunchSmoke(page);
  await runShortcutLaunchSmoke(page);
  process.stdout.write('All AI Review V1 main-flow scenarios finished successfully.\n');
}

async function main() {
  await prepareOutputDir();

  const hasExistingServer = await waitForServer(baseUrl, 1200)
    .then(() => true)
    .catch(() => false);

  if (!reuseExistingServer && !hasExistingServer) {
    await startServer();
  } else {
    await waitForServer(baseUrl, startupTimeoutMs);
  }

  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();

  page.on('pageerror', (error) => {
    process.stderr.write(`[pageerror] ${error.message}\n`);
  });

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
    if (screenshotMode !== 'off' && screenshotMode !== 'none') {
      process.stdout.write(`Saved scenario screenshots to ${outputDir}\n`);
    }
  } catch (error) {
    await capture(page, 'failed').catch(() => {});
    await cleanup();
    throw error;
  }
}

main().catch((error) => {
  console.error('\nAI Review lifecycle scenario failed.');
  console.error(error);
  process.exit(1);
});
