// Run with: node scripts/test-air-commit.cjs. Exercises the existing V3 Commit
// component with its real checkbox tree and the published Int UI Kit controls.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');
const { JSDOM, VirtualConsole } = require('jsdom');
const root = path.resolve(__dirname, '..');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
// Browser mode checks geometry that JSDOM cannot compute. Run against the built
// preview with: node scripts/test-air-commit.cjs --browser http://127.0.0.1:5189
async function checkCommentToolbar() {
  const { chromium } = require('playwright');
  const previewUrl = process.argv[process.argv.indexOf('--browser') + 1] || 'http://127.0.0.1:5193';
  const browser = await chromium.launch({ headless: true });
  const outputDir = path.join(root, 'test-results', 'air-commit');
  fs.mkdirSync(outputDir, { recursive: true });
  const checkPlacement = async page => {
    const geometry = await page.locator('.ij2499-comment-toolbar').evaluate(element => {
      const bar = element.getBoundingClientRect();
      const pane = element.parentElement.getBoundingClientRect();
      return { centerOffset: bar.x + bar.width / 2 - pane.x - pane.width / 2,
        bottomInset: pane.bottom - bar.bottom, fits: bar.left >= pane.left && bar.right <= pane.right };
    });
    assert.ok(Math.abs(geometry.centerOffset) < 0.5, 'comment control is centered within the editor pane');
    assert.equal(geometry.bottomInset, 6, 'comment control keeps the reference bottom inset');
    assert.ok(geometry.fits, 'comment control fits within the editor pane');
  };
  const saveNote = async (page, index, text) => {
    const row = page.locator('[data-plan-diff-row-id]').nth(index);
    await row.hover();
    await row.locator('.plan-diff-gutter-icon-slot').click();
    await page.locator('[data-demo-id="diff-comment-input"]').fill(text);
    const chooser = page.getByRole('button', { name: 'Choose Note attachment target: Choose chat session', exact: true });
    if (await chooser.count()) {
      await chooser.click();
      await page.getByText('Review Visit model fields', { exact: true }).last().click();
    }
    await page.locator('[data-demo-id="diff-comment-submit"]').click();
    await page.locator('.ij2499-comment-toolbar').waitFor();
    await page.keyboard.press('Escape');
  };
  try {
    for (const width of [1656, 1000]) {
      const page = await browser.newPage({ viewport: { width, height: 875 } });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(`${previewUrl}/?entry=commit`);
      await page.locator('.plan-diff-overlay').waitFor();
      assert.equal(await page.locator('.ij2499-comment-toolbar').count(), 0, 'no control before a note is saved');
      await page.locator('[data-plan-diff-row-id]').nth(8).hover();
      await page.locator('[data-plan-diff-row-id]').nth(8).locator('.plan-diff-gutter-icon-slot').click();
      await page.locator('[data-demo-id="diff-comment-input"]').fill('An unsaved note');
      assert.equal(await page.locator('.ij2499-comment-toolbar').count(), 0, 'an unsaved draft does not show the control');
      await page.locator('[data-demo-id="diff-comment-cancel"]').click();
      await saveNote(page, 8, 'Keep the logging message useful.');
      const bar = page.locator('.ij2499-comment-toolbar');
      assert.equal(await page.locator('.plan-diff-comment-shortcut-hint').count(), 0, 'saved notes do not show shortcut onboarding');
      assert.equal(await bar.locator('.plan-diff-comment-nav-count').innerText(), '1 of 1 comment');
      assert.ok(await bar.getByRole('button', { name: 'Previous Comment', exact: true }).isDisabled());
      assert.ok(await bar.getByRole('button', { name: 'Next Comment', exact: true }).isDisabled());
      await saveNote(page, 14, 'Keep the controller initialization clear.');
      assert.equal(await bar.locator('.plan-diff-comment-nav-count').innerText(), '2 of 2 comments');
      await bar.getByRole('button', { name: 'Previous Comment', exact: true }).click();
      assert.equal(await bar.locator('.plan-diff-comment-nav-count').innerText(), '1 of 2 comments');
      await bar.getByRole('button', { name: 'Next Comment', exact: true }).click();
      assert.equal(await bar.locator('.plan-diff-comment-nav-count').innerText(), '2 of 2 comments');
      await checkPlacement(page);
      await page.screenshot({ path: path.join(outputDir, `comment-toolbar-${width}.png`) });
      await bar.locator('.plan-diff-comment-nav-count').click();
      const island = page.getByRole('region', { name: 'Comments to send', exact: true });
      await island.waitFor();
      assert.match(await island.innerText(), /Review Visit.*model fields/);
      assert.match(await island.innerText(), /VisitController.java/);
      assert.equal(await island.getByRole('checkbox').count(), 4, 'bulk selection, file, and both saved notes have checkboxes');
      assert.ok((await island.getByRole('checkbox').evaluateAll(inputs => inputs.every(input => input.checked))), 'all notes start selected');
      const geometry = await island.evaluate(element => {
        const panel = element.getBoundingClientRect();
        const bar = element.parentElement.getBoundingClientRect();
        const pane = element.parentElement.parentElement.getBoundingClientRect();
        return { gap: bar.top - panel.bottom, left: panel.left - bar.left, right: panel.right - bar.right,
          fits: panel.left >= pane.left && panel.right <= pane.right, surface: getComputedStyle(element).backgroundColor,
          barSurface: getComputedStyle(element.parentElement).backgroundColor };
      });
      assert.equal(geometry.gap, 8, 'second island is 8px above the original bar');
      assert.equal(geometry.left, 0); assert.equal(geometry.right, 0);
      assert.ok(geometry.fits, 'comment selector fits in the editor pane');
      assert.equal(geometry.surface, geometry.barSurface, 'both islands use the same dark kit surface');
      await page.screenshot({ path: path.join(outputDir, `comment-selection-${width}.png`) });
      assert.equal(await bar.locator('.plan-diff-comment-nav-count .toolbar-button-chevron').count(), 0, 'comment counter has no chevron');
      assert.equal(await island.locator('.tree-node-toggle').count(), 1, 'only the file is a tree parent');
      assert.equal(await island.locator('.ij2499-comment-session-header .tree-node, .ij2499-comment-session-header input').count(), 0, 'session is text context without a third selectable tree row');
      assert.equal(await island.locator('.ij2499-comment-session > .ij2499-comment-file').count(), 1, 'file stays grouped under its owning session');
      assert.equal(await island.locator('.ij2499-comment-file > .tree-node-children > .ij2499-comment-leaf').count(), 2, 'comments are file children');
      const insets = await island.evaluate(element => {
        const x = selector => element.querySelector(selector).getBoundingClientRect().x;
        return { comment: x('.ij2499-comment-leaf .checkbox-wrapper') - x('.ij2499-comment-file .checkbox-wrapper'),
          text: x('.ij2499-comment-leaf > .tree-node .tree-node-label') - x('.ij2499-comment-file > .tree-node .tree-node-label') };
      });
      assert.equal(insets.comment, 16, 'comment has the same guideline child step from its file');
      assert.equal(insets.text, 16, 'comment text follows the same child step; icon-free rows reserve the icon column');
      assert.equal(await island.locator('.ij2499-comment-leaf > .tree-node .tree-node-spacer').count(), 2, 'child rows use the native tree spacer');
      const levels = await island.evaluate(element => ({
        parent: getComputedStyle(element.querySelector('.ij2499-comment-file > .tree-node')).paddingLeft,
        child: getComputedStyle(element.querySelector('.ij2499-comment-leaf > .tree-node')).paddingLeft,
      }));
      assert.deepEqual(levels, { parent: '8px', child: '24px' }, 'both tree levels match the current upstream formula');
      const columns = await island.locator('.tree-node-toggle, .tree-node-spacer, .tree-node-icon').evaluateAll(items => items.map(item => ({ width:item.getBoundingClientRect().width, margin:getComputedStyle(item).marginRight })));
      assert.ok(columns.every(column => column.width === 16 && column.margin === '0px'), 'tree columns are fixed 16px without old margins');
      await island.locator('.ij2499-comment-file > .tree-node .tree-node-toggle').click();
      assert.equal(await island.getByRole('checkbox').count(), 2, 'file collapse hides only its comments');
      await island.locator('.ij2499-comment-file > .tree-node .tree-node-toggle').click();
      assert.equal(await island.getByRole('checkbox').count(), 4);
      const keyboardCheckbox = island.getByRole('checkbox', { name: 'Send comment: Keep the logging message useful.', exact: true });
      await keyboardCheckbox.focus();
      await page.keyboard.press('Space');
      assert.equal(await keyboardCheckbox.isChecked(), false, 'Space toggles the native checkbox');
      await page.keyboard.press('Space');
      assert.equal(await keyboardCheckbox.isChecked(), true);
      await island.getByRole('checkbox', { name: 'Send comment: Keep the logging message useful.', exact: true }).locator('..').click();
      assert.ok(await island.getByRole('checkbox', { name: 'Select comments in VisitController.java', exact: true }).evaluate(input => input.indeterminate));
      assert.ok(await island.getByRole('checkbox', { name: 'Select all comments', exact: true }).evaluate(input => input.indeterminate));
      await island.getByRole('checkbox', { name: 'Select comments in VisitController.java', exact: true }).locator('..').click();
      await island.getByRole('checkbox', { name: 'Select comments in VisitController.java', exact: true }).locator('..').click();
      assert.ok(await bar.locator('.plan-diff-send-comments-button').isDisabled(), 'no selected comments disables Send');
      await island.getByRole('checkbox', { name: 'Select all comments', exact: true }).locator('..').click();
      assert.ok((await island.getByRole('checkbox').evaluateAll(inputs => inputs.every(input => input.checked))), 'bulk checkbox selects every comment');
      if (width === 1656) {
        await island.getByRole('checkbox', { name: 'Send comment: Keep the logging message useful.', exact: true }).locator('..').click();
      }
      await page.keyboard.press('Escape');
      assert.equal(await island.count(), 0, 'Escape closes the selector');
      await bar.locator('.plan-diff-comment-nav-count').click();
      await island.waitFor();
      assert.equal(await island.getByRole('checkbox', { name: 'Send comment: Keep the logging message useful.', exact: true }).isChecked(), width !== 1656, 'selection survives closing and reopening');
      await page.screenshot({ path: path.join(outputDir, `comment-selection-ready-${width}.png`) });
      await bar.locator('.plan-diff-send-comments-button').click();
      await page.locator('.aiux543-chat-editor-host').waitFor();
      assert.match(await page.locator('.ai-review-editor-split-pane.is-chat .tab-selected').innerText(), /Review Visit.*model fields/);
      const sent = page.locator('.ai-chat-user-card').last();
      assert.match(await sent.innerText(), width === 1656 ? /I left 1 comment/ : /I left 2 comments/);
      if (width === 1656) assert.doesNotMatch(await sent.innerText(), /Keep the logging message useful/);
      else assert.match(await sent.innerText(), /Keep the logging message useful/);
      assert.match(await sent.innerText(), /Keep the controller initialization clear/);
      assert.equal(await sent.locator('.ai-chat-sent-attachment-chip').count(), 1, 'checked notes travel in the file attachment');
      assert.ok(await page.locator('.commit-tool-window').isVisible(), 'sending comments retains Commit');
      await page.getByRole('button', { name: 'Comments are being processed by the agent.', exact: true }).waitFor();
      assert.ok(await bar.locator('.plan-diff-send-comments-button').isDisabled(), 'duplicate send is disabled while the agent processes comments');
      await checkPlacement(page);
      await page.screenshot({ path: path.join(outputDir, `comment-toolbar-sending-${width}.png`) });
      if (width === 1656) {
        await bar.locator('.plan-diff-comment-nav-count').click();
        await island.waitFor();
        assert.ok(await island.getByRole('checkbox', { name: 'Send comment: Keep the logging message useful.', exact: true }).count(), 'unchecked comment remains saved in the split diff');
        assert.ok((await island.getByRole('checkbox').evaluateAll(inputs => inputs.every(input => input.disabled))), 'selection is locked during processing');
        await page.keyboard.press('Escape');
        await page.getByRole('button', { name: 'Stop', exact: true }).click();
        await page.waitForFunction(() => {
          const button = document.querySelector('.ij2499-comment-toolbar .plan-diff-send-comments-button');
          return button && !button.disabled;
        }, null, { timeout: 30000 });
        await bar.locator('.plan-diff-comment-nav-count').click();
        await island.getByRole('checkbox', { name: 'Select comments in VisitController.java', exact: true }).locator('..').click();
        await island.getByRole('checkbox', { name: 'Send comment: Keep the logging message useful.', exact: true }).locator('..').click();
        await bar.locator('.plan-diff-send-comments-button').click();
        const following = page.locator('.ai-chat-user-card').last();
        await following.waitFor();
        assert.match(await following.innerText(), /I left 1 comment/);
        assert.match(await following.innerText(), /Keep the logging message useful/);
        assert.doesNotMatch(await following.innerText(), /Keep the controller initialization clear/);
      }
      assert.deepEqual(errors, []);
      await page.close();
    }
    const page = await browser.newPage({ viewport: { width: 1386, height: 875 } });
    await page.goto(`${previewUrl}/?entry=commit`);
    await page.getByRole('button', { name: 'Jump to Source (F4)', exact: true }).click();
    await page.locator('.pce-textarea').evaluate(element => {
      element.focus(); element.setSelectionRange(0, 11);
      element.dispatchEvent(new Event('select', { bubbles: true }));
    });
    await page.getByRole('button', { name: 'Add Note', exact: true }).click();
    await page.locator('[data-demo-id="diff-comment-input"]').fill('Keep the controller annotation.');
    await page.getByRole('button', { name: 'Choose Note attachment target: Choose chat session', exact: true }).click();
    await page.getByText('Review Visit model fields', { exact: true }).last().click();
    await page.locator('[data-demo-id="diff-comment-submit"]').click();
    const bar = page.locator('.ij2499-comment-toolbar');
    await bar.waitFor();
    assert.equal(await bar.locator('.plan-diff-comment-nav-count').innerText(), '1 of 1 comment');
    await checkPlacement(page);
    await bar.locator('.plan-diff-comment-nav-count').click();
    await page.getByRole('region', { name: 'Comments to send', exact: true }).waitFor();
    assert.ok(await page.getByRole('checkbox', { name: 'Send comment: Keep the controller annotation.', exact: true }).isChecked());
    await page.screenshot({ path: path.join(outputDir, 'comment-toolbar-source.png') });
    await bar.locator('.plan-diff-send-comments-button').click();
    await page.locator('.aiux543-chat-editor-host').waitFor();
    assert.match(await page.locator('.ai-chat-user-card').last().innerText(), /Keep the controller annotation/);
    await page.close();
    console.log('PASS: comment islands; session/file/note selection and partial state; no-selection gating; selected-only attachments; unchecked notes remain sendable; navigation and two-width geometry; explicit recipient; pending duplicate-send prevention; source-file selection.');
  } finally { await browser.close(); }
}

async function checkGenerationChats(browser, outputDir, previewUrl) {
  const checkBanner = async (page, banner) => {
    const geometry = await banner.evaluate(element => {
      const panel = document.querySelector('.commit-tool-window').getBoundingClientRect();
      const field = document.querySelector('.commit-message-textarea').getBoundingClientRect();
      const action = document.querySelector('.commit-amend-left').getBoundingClientRect();
      const bounds = element.getBoundingClientRect();
      const probe = document.createElement('span'); probe.style.background = 'var(--layer-1-bg)'; element.append(probe);
      const neutral = getComputedStyle(probe).backgroundColor; probe.remove();
      return { left: bounds.left - panel.left, right: panel.right - bounds.right,
        fieldLeft: bounds.left - field.left, fieldRight: bounds.right - field.right,
        gap: action.top - bounds.bottom, neutral, background: getComputedStyle(element).backgroundColor };
    });
    assert.ok(Math.abs(geometry.left - geometry.right) < 0.5, 'banner has symmetric left/right insets');
    assert.ok(Math.abs(geometry.fieldLeft) < 0.5 && Math.abs(geometry.fieldRight) < 0.5, 'banner aligns with both message field edges');
    assert.equal(geometry.gap, 8, 'banner is 8 px above the generation action');
    assert.equal(geometry.background, geometry.neutral, 'both banner types use the neutral kit surface');
  };
  for (const width of [1656, 1000]) {
    const page = await browser.newPage({ viewport: { width, height: 875 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${previewUrl}/?entry=commit`);
    const generate = page.getByRole('button', { name: 'Generate Message', exact: true });
    const message = page.getByRole('textbox', { name: 'Commit Message', exact: true });
    await generate.waitFor();
    const tabs = page.locator('.main-window-editor-tabs .tab-wrapper').filter({ hasText: 'Generate commit message ·' });
    const selectedFiles = await page.locator('.commit-file-node').filter({ has: page.locator('input:checked') }).locator('.commit-file-name').allTextContents();
    assert.equal(selectedFiles.length, 4);
    await page.getByRole('button', { name: 'Commit Options', exact: true }).click();
    const options = page.locator('.ij2499-options');
    assert.match(await options.locator('[data-testid="popup-agent"]').innerText(), /Codex/);
    assert.match(await options.locator('[data-testid="popup-model"]').innerText(), /GPT-5 mini/);
    assert.equal(await options.locator('[data-testid="popup-agent"] button, [data-testid="popup-model"] button').count(), 0);
    await page.keyboard.press('Escape');
    await message.fill('Keep this draft.');
    const originalBounds = await message.boundingBox();
    await generate.click();
    await page.getByRole('button', { name: 'Stop generation', exact: true }).waitFor();
    assert.equal(await tabs.count(), 1, 'the first request immediately creates its chat');
    assert.equal(await message.getAttribute('aria-busy'), 'true');
    const info = page.locator('.ij2499-generation-banner.banner-info');
    await info.waitFor();
    assert.match(await info.innerText(), /Input needed/);
    assert.equal(await message.inputValue(), 'Keep this draft.', 'awaiting input does not generate prematurely');
    assert.ok(await generate.isDisabled(), 'a paused request must be confirmed before starting another');
    assert.equal((await message.boundingBox()).y, originalBounds.y, 'floating banner does not shift the editor');
    await checkBanner(page, info);
    await page.screenshot({ path: path.join(outputDir, `confirmation-info-banner-${width}.png`) });
    await info.getByRole('button', { name: 'Open chat', exact: true }).click();
    const chat = page.locator('.ij2499-commit-chat');
    const request = chat.getByRole('region', { name: 'Commit generation access request', exact: true });
    await request.waitFor();
    assert.equal(await tabs.count(), 1);
    const initialMessage = chat.locator('.ai-chat-user-card').first();
    assert.deepEqual(await initialMessage.locator('.ai-chat-attachment-name').allTextContents(), selectedFiles.map(name => `Diff ${name}`));
    assert.equal(await initialMessage.getByRole('button', { name: /^Show (all|less)/ }).count(), 0);
    assert.equal(await chat.locator('.aiux543-chat-input').count(), 0, 'the request replaces the normal composer');
    assert.equal(await request.getByRole('radio').count(), 3);
    assert.equal(await request.getByRole('radio').first().getAttribute('aria-checked'), 'true');
    await request.press('ArrowDown');
    assert.equal(await request.getByRole('radio').nth(1).getAttribute('aria-checked'), 'true');
    await request.press('ArrowUp');
    const focusStyle = await request.getByRole('radio').first().evaluate(element => ({ border: getComputedStyle(element).borderTopWidth, outline: getComputedStyle(element).outlineStyle, focusLayer: getComputedStyle(element, '::after').content }));
    assert.equal(focusStyle.border, '1px'); assert.equal(focusStyle.outline, 'none'); assert.equal(focusStyle.focusLayer, 'none', 'selected border is the only focus layer; the kit pseudo-element is suppressed');
    await page.screenshot({ path: path.join(outputDir, `confirmation-request-chat-${width}.png`) });
    await request.getByRole('button', { name: 'Confirm ↵', exact: true }).click();
    await page.getByRole('button', { name: 'Stop generation', exact: true }).waitFor();
    assert.equal(await tabs.count(), 1, 'confirmation resumes the existing request/chat');
    assert.equal(await info.count(), 0);
    assert.equal(await request.count(), 0);
    await page.waitForFunction(() => document.querySelector('[aria-label="Commit Message"]')?.getAttribute('aria-busy') === 'false');
    const successfulDraft = await message.inputValue();
    for (const name of selectedFiles) assert.ok(successfulDraft.includes(name));
    assert.equal(await chat.locator('.ai-chat-user-card').count(), 2, 'confirmation is recorded in the same conversation');
    assert.match(await chat.locator('.ai-chat-user-card').last().innerText(), /Allow for this request/);
    assert.equal(await chat.locator('.aiux543-answer').last().locator('p').innerText(), successfulDraft);
    assert.equal(await chat.locator('.aiux543-chat-input').inputValue(), '');
    assert.ok(await generate.isEnabled());
    await page.screenshot({ path: path.join(outputDir, `confirmation-result-commit-${width}.png`) });
    await generate.click();
    await page.getByRole('button', { name: 'Stop generation', exact: true }).waitFor();
    assert.equal(await tabs.count(), 2);
    const error = page.locator('.ij2499-generation-banner.banner-error');
    await error.waitFor();
    assert.equal(await message.inputValue(), successfulDraft, 'second generation fails and retains the confirmed result');
    await checkBanner(page, error);
    await page.screenshot({ path: path.join(outputDir, `confirmation-repeat-error-${width}.png`) });
    await error.getByRole('button', { name: 'Open chat', exact: true }).click();
    assert.equal(await tabs.count(), 2, 'error opens the second request’s existing chat');
    assert.equal(await request.count(), 0);
    assert.match(await chat.locator('.aiux543-answer').innerText(), /GPT-5 mini.*timed out/s);
    assert.deepEqual(await chat.locator('.ai-chat-user-card .ai-chat-attachment-name').allTextContents(), selectedFiles.map(name => `Diff ${name}`));
    await error.getByRole('button', { name: 'Open chat', exact: true }).click();
    assert.equal(await tabs.count(), 2);
    const composer = chat.locator('.aiux543-chat-input');
    await composer.fill('One-line Conventional Commits in Russian.');
    await composer.press('Enter');
    await page.waitForFunction(() => [...document.querySelectorAll('.ij2499-commit-chat .aiux543-answer')].some(element => element.textContent.includes('chore: обновить'))
      && !document.querySelector('.ij2499-commit-chat .ai-chat-streaming-caret'));
    assert.equal(await message.inputValue(), successfulDraft);
    // Stopping from the chat cancels the same running Commit request.
    const newTabIndex = await page.locator('.main-window-editor-tabs .tab-wrapper').evaluateAll(elements => elements.findIndex(element => element.querySelector('.tab-selected')) + 1);
    await generate.click();
    await page.locator('.main-window-editor-tabs .tab-wrapper').nth(newTabIndex).locator('.tab-label').click();
    await chat.getByRole('button', { name: 'Stop', exact: true }).click();
    await error.waitFor();
    assert.match(await error.innerText(), /generation stopped/);
    await page.waitForTimeout(3100);
    assert.equal(await message.inputValue(), successfulDraft, 'a cancelled timer cannot overwrite the confirmed draft');
    assert.deepEqual(errors, []);
    await page.close();
  }
  // Custom answer, keyboard submission and rejection use the same request control.
  const page = await browser.newPage({ viewport: { width: 1386, height: 875 } });
  await page.goto(`${previewUrl}/?entry=commit`);
  await page.getByRole('button', { name: 'Generate Message', exact: true }).click();
  const info = page.locator('.ij2499-generation-banner.banner-info');
  await info.waitFor();
  await info.getByRole('button', { name: 'Open chat', exact: true }).click();
  const request = page.getByRole('region', { name: 'Commit generation access request', exact: true });
  await request.press('4');
  assert.ok(await request.getByRole('button', { name: 'Confirm ↵', exact: true }).isDisabled());
  const input = request.getByRole('textbox', { name: 'Custom generation instructions', exact: true });
  await input.fill('One-line Conventional Commits in Russian.');
  await input.press('Enter');
  await page.waitForFunction(() => document.querySelector('[aria-label="Commit Message"]')?.value.startsWith('chore: обновить'));
  assert.equal((await page.getByRole('textbox', { name: 'Commit Message', exact: true }).inputValue()).split('\n').length, 1);
  await page.close();
  const rejected = await browser.newPage({ viewport: { width: 1386, height: 875 } });
  await rejected.goto(`${previewUrl}/?entry=commit`);
  await rejected.getByRole('button', { name: 'Generate Message', exact: true }).click();
  const rejectedInfo = rejected.locator('.ij2499-generation-banner.banner-info');
  await rejectedInfo.waitFor();
  await rejectedInfo.getByRole('button', { name: 'Open chat', exact: true }).click();
  const rejectedRequest = rejected.getByRole('region', { name: 'Commit generation access request', exact: true });
  await rejectedRequest.getByRole('radio').nth(2).click();
  await rejectedRequest.getByRole('button', { name: 'Confirm ↵', exact: true }).click();
  await rejected.locator('.ij2499-generation-banner.banner-error').waitFor();
  assert.equal(await rejectedRequest.count(), 0);
  assert.equal(await rejected.getByRole('textbox', { name: 'Commit Message', exact: true }).inputValue(), '');
  await rejected.close();
}

async function checkBrowserLayout() {
  const { chromium } = require('playwright');
  const previewUrl = process.argv[process.argv.indexOf('--browser') + 1] || 'http://127.0.0.1:5189';
  const browser = await chromium.launch({ headless: true });
  const outputDir = path.join(root, 'test-results', 'air-commit');
  fs.mkdirSync(outputDir, { recursive: true });
  const checkChatHeaderAlignment = async page => {
    const centers = await page.evaluate(() => {
      const center = selector => {
        const bounds = document.querySelector(selector).getBoundingClientRect();
        return bounds.x + bounds.width / 2;
      };
      return {
        agent: center('.main-window-editor-tabs .tab-wrapper:first-child .tab-icon'),
        branch: center('.ij2499-chat-branch-header .aiux543-chat-project-context-item > .icon'),
        tabsMore: center('.main-window-editor-tabs .editor-tabs-more-button > .icon'),
        branchMore: center('.ij2499-chat-branch-header .toolbar-icon-button > .icon'),
      };
    });
    assert.ok(Math.abs(centers.branch - centers.agent) <= 0.5, 'branch icon is directly below the first tab agent icon');
    assert.ok(Math.abs(centers.branchMore - centers.tabsMore) <= 0.5, 'Branch actions ellipsis is directly below the editor tabs More ellipsis');
  };
  try {
    if (!process.argv.includes('--handoff-only')) {
    for (const viewport of [{ width: 1656, height: 1032 }, { width: 1386, height: 875 }, { width: 1000, height: 700 }]) {
      const page = await browser.newPage({ viewport });
      await page.goto(`${previewUrl}/?entry=commit&scenario=no-files`);
      await page.locator('.plan-diff-editor-area').waitFor();
      assert.ok(await page.locator('.commit-tool-window').isVisible(), 'Commit opens next to a regular editor diff');
      assert.equal(await page.locator('.aiux543-chat-editor-host').count(), 0, 'Commit entry starts with a diff instead of chat');
      assert.equal(await page.locator('.main-window-editor-tabs .tab-selected').innerText(), 'Diff VisitController.java');
      assert.equal(await page.locator('.main-window-editor-tabs').getByText('Diff VisitController.java', { exact: true }).count(), 1, 'Commit entry has one VisitController diff tab');
      assert.ok(await page.getByRole('button', { name: 'Generate Message', exact: true }).isDisabled(), 'opening a diff does not check files');
      const generationButton = page.getByRole('button', { name: 'Generate Message', exact: true });
      assert.equal(await generationButton.getAttribute('title'), null, 'generation uses the kit tooltip instead of browser title');
      await generationButton.locator('..').hover();
      await page.waitForTimeout(200);
      assert.equal(await page.locator('.tooltip').count(), 0, 'tooltip respects the 500ms delay');
      const generationTooltip = page.locator('.tooltip');
      await generationTooltip.waitFor();
      assert.equal(await generationTooltip.innerText(), 'Select files to generate a commit message');
      const tooltipGeometry = await generationTooltip.evaluate(element => {
        const style = getComputedStyle(element);
        const bounds = element.getBoundingClientRect();
        const trigger = element.parentElement.getBoundingClientRect();
        return { padding: style.padding, radius: style.borderRadius, fontSize: style.fontSize, weight: style.fontWeight,
          background: style.backgroundColor, color: style.color, gap: bounds.top - trigger.bottom,
          visible: bounds.left >= 0 && bounds.right <= innerWidth && bounds.bottom <= innerHeight };
      });
      assert.equal(tooltipGeometry.padding, '8px');
      assert.equal(tooltipGeometry.radius, '4px');
      assert.equal(tooltipGeometry.fontSize, '13px');
      assert.equal(tooltipGeometry.weight, '500');
      assert.equal(tooltipGeometry.background, 'rgb(51, 53, 59)');
      assert.equal(tooltipGeometry.color, 'rgb(209, 211, 217)');
      assert.equal(tooltipGeometry.gap, 4);
      assert.ok(tooltipGeometry.visible, 'kit tooltip is visible inside the viewport');
      await page.screenshot({ path: path.join(outputDir, `generation-tooltip-disabled-${viewport.width}.png`) });
      await page.mouse.move(600, 80);
      assert.equal(await generationTooltip.count(), 0, 'tooltip hides when the pointer leaves');
      await page.locator('.commit-file-node .checkbox-container').first().click();
      await generationButton.hover();
      await generationTooltip.waitFor();
      assert.equal(await generationTooltip.innerText(), 'Generate Commit Message');
      await page.screenshot({ path: path.join(outputDir, `generation-tooltip-${viewport.width}.png`) });
      await page.locator('.commit-file-node .checkbox-container').first().click();
      await page.screenshot({ path: path.join(outputDir, `commit-diff-entry-${viewport.width}.png`) });
      const diffHeader = page.locator('.ij2499-commit-diff .plan-diff-toolbar-primary-row');
      assert.ok(await diffHeader.getByRole('button', { name: 'Go to Session', exact: true }).isVisible());
      assert.match(await diffHeader.locator('.plan-diff-viewing-file-count-link').innerText(), /^1\/\d+ files$/);
      const fileTotal = Number((await diffHeader.locator('.plan-diff-viewing-file-count-link').innerText()).match(/\/(\d+)/)[1]);
      assert.ok(fileTotal > 1, 'file count comes from the changed-file scope');
      const scopeLabel = diffHeader.locator('.ij2499-diff-scope');
      assert.equal(await scopeLabel.innerText(), 'Branch Changes');
      const labelStyle = await scopeLabel.evaluate(element => ({ fontSize: getComputedStyle(element).fontSize, weight: getComputedStyle(element).fontWeight }));
      assert.equal(labelStyle.fontSize, '14px');
      assert.equal(labelStyle.weight, '400');
      const scopeSpacing = await scopeLabel.evaluate(element => {
        const divider = element.previousElementSibling;
        const session = divider.previousElementSibling;
        const labelRange = document.createRange(); labelRange.selectNodeContents(element.querySelector('.toolbar-button-text'));
        const sessionRange = document.createRange(); sessionRange.selectNodeContents(session.querySelector('.toolbar-button-text'));
        const dividerBounds = divider.getBoundingClientRect();
        return { before: dividerBounds.left - sessionRange.getBoundingClientRect().right,
          after: labelRange.getBoundingClientRect().left - dividerBounds.right,
          height: element.getBoundingClientRect().height };
      });
      assert.equal(scopeSpacing.after, scopeSpacing.before, 'scope and session text have equal insets around the separator');
      assert.equal(scopeSpacing.height, 26, 'fixed scope label aligns with the toolbar row');
      assert.ok(await scopeLabel.isDisabled(), 'the only available branch scope is disabled');
      assert.equal(await scopeLabel.evaluate(element => getComputedStyle(element).opacity), '0.5', 'fixed scope uses the kit disabled appearance');
      assert.equal(await scopeLabel.locator('.dropdown, .dropdown-chevron, .toolbar-button-chevron').count(), 0, 'Commit diff has one fixed branch scope without a menu or chevron');
      await scopeLabel.evaluate(element => element.click());
      assert.equal(await diffHeader.locator('.ij2499-diff-scope .dropdown-menu').count(), 0);
      const surfaces = await diffHeader.evaluate(element => ({ toolbar: getComputedStyle(element.closest('.plan-diff-toolbar-shell')).backgroundColor, editor: getComputedStyle(element.closest('.plan-diff-editor-area')).backgroundColor }));
      assert.equal(surfaces.toolbar, surfaces.editor, 'toolbar underlay matches the editor canvas');

      assert.ok(await diffHeader.getByRole('button', { name: 'Compare Previous File (⌥←)', exact: true }).isDisabled());
      if (viewport.width >= 1386) {
        const sessionRect = await diffHeader.getByRole('button', { name: 'Go to Session', exact: true }).boundingBox();
        const scopeRect = await diffHeader.locator('.ij2499-diff-scope').boundingBox();
        const rightRect = await diffHeader.locator('.plan-diff-toolbar-right').boundingBox();
        assert.ok(sessionRect.x + sessionRect.width <= scopeRect.x && scopeRect.x + scopeRect.width <= rightRect.x, 'session and scope fit before the right-hand controls');
      }
      if (viewport.width === 1656) {
        await diffHeader.getByRole('button', { name: 'Next Difference', exact: true }).click();
        assert.ok(await page.locator('.plan-diff-row.is-focus').count() > 0, 'difference navigation focuses changed code');
        await diffHeader.getByRole('button', { name: 'Compare Next File (⌥→)', exact: true }).click();
        await page.waitForFunction(() => document.querySelector('.main-window-editor-tabs .tab-selected')?.textContent.includes('application.properties'));
        assert.equal(await diffHeader.locator('.plan-diff-viewing-file-count-link').innerText(), `2/${fileTotal} files`);
        assert.ok(await page.getByRole('button', { name: 'Generate Message', exact: true }).isDisabled(), 'file navigation preserves unchecked Commit selection');
        await diffHeader.getByRole('button', { name: 'Compare Previous File (⌥←)', exact: true }).click();
        await diffHeader.locator('.plan-diff-viewing-file-count-link').click();
        await page.locator('.plan-diff-files-side-panel').getByText('application.properties', { exact: true }).click();
        assert.equal(await page.locator('.plan-diff-files-side-panel').count(), 1, 'docked files remain visible after navigation');
        await page.getByRole('button', { name: 'Close changed files', exact: true }).click();
        await page.waitForFunction(() => document.querySelector('.main-window-editor-tabs .tab-selected')?.textContent.includes('application.properties'));
        await diffHeader.getByRole('button', { name: 'Compare Previous File (⌥←)', exact: true }).click();
        assert.equal(await diffHeader.locator('.plan-diff-viewing-file-count-link').innerText(), `1/${fileTotal} files`);
        assert.equal(await scopeLabel.innerText(), 'Branch Changes');
        await diffHeader.locator('.segmented-button').first().click();
        assert.ok(await page.locator('.plan-diff-overlay--split').count() > 0, 'split view renders both code panes');
        await diffHeader.locator('.segmented-button').last().click();
        await diffHeader.getByRole('button', { name: 'Go to Session', exact: true }).click();
        await page.locator('.aiux543-chat-editor-host').waitFor();
        assert.equal(await page.locator('.main-window-editor-tabs .tab-selected').innerText(), 'Add request logging to a Java application');
        assert.ok(await page.locator('.commit-tool-window').isVisible(), 'Go to Session preserves Commit');
        await page.locator('.main-window-editor-tabs').getByText('Diff VisitController.java', { exact: true }).click();
      }
      await diffHeader.screenshot({ path: path.join(outputDir, `diff-header-${viewport.width}.png`) });

      await page.locator('.main-window-editor-tabs').getByText('Refactor VisitController.java time slots', { exact: true }).click();
      const header = page.locator('.ij2499-chat-branch-header');
      await header.waitFor();
      await checkChatHeaderAlignment(page);
      assert.match(await header.locator('.aiux543-chat-project-branch').innerText(), /code-notes-v3-release/);
      assert.equal(await header.locator('.aiux543-chat-project-name, .aiux543-chat-project-icon, .aiux543-chat-header-all-changes-counts').count(), 0);
      assert.ok(await header.getByRole('button', { name: 'Open Branch Changes', exact: true }).isVisible());
      assert.ok(await header.getByRole('button', { name: 'Branch actions', exact: true }).isVisible());
      assert.equal(await page.locator('.ij2499-settings-hint').count(), 0);
      await page.getByRole('button', { name: 'Commit Options', exact: true }).click();
      assert.match(await page.locator('[data-testid="popup-agent"]').innerText(), /Codex/);
      assert.match(await page.locator('[data-testid="popup-model"]').innerText(), /GPT-5 mini/);
      assert.equal(await page.locator('.ij2499-generate [data-agent="codex"]').count(), 1);
      await page.getByRole('button', { name: 'Open in Settings…', exact: true }).click();
      const settings = page.getByRole('region', { name: 'Commit Message Generation', exact: true });
      await settings.waitFor();
      assert.equal(await settings.getByText('Insert branch name', { exact: true }).count(), 0);
      assert.equal(await settings.locator('.ij2499-branch-help').count(), 0);
      assert.ok(!(await settings.innerText()).includes('$GIT_BRANCH_NAME'), 'settings omit branch-variable instructions and examples');
      assert.match(await settings.locator('.settings-breadcrumb').innerText(), /Tools[\s\S]*Air[\s\S]*Commit Message Generation/);
      await settings.locator('[data-testid="settings-agent"] .toolbar-button').click();
      await page.locator('.ij2499-selector-menu').getByText('Codex', { exact: true }).click();
      await settings.locator('[data-testid="settings-model"] .toolbar-button').click();
      await page.locator('.ij2499-selector-menu').getByText('GPT-5 mini · medium', { exact: true }).click();
      await settings.locator('#settings-prompt').fill('Short message with $GIT_BRANCH_NAME');
      await page.getByRole('button', { name: 'Apply', exact: true }).click();
      await settings.locator('#settings-prompt').fill('Unapplied changes');
      await page.getByRole('button', { name: 'Cancel', exact: true }).click();
      await header.getByRole('button', { name: 'Branch actions', exact: true }).click();
      const headerMenu = page.locator('.ij2499-chat-header-menu');
      await headerMenu.waitFor();
      assert.ok(headerMenu);
      assert.ok(await headerMenu.getByText('Branch Changes', { exact: true }).isVisible());
      await page.keyboard.press('Escape');
      assert.equal(await headerMenu.count(), 0);
      await page.getByRole('button', { name: 'Commit Options', exact: true }).click();
      const popup = page.locator('.ij2499-options');
      await popup.waitFor();
      await popup.locator('#popup-prompt').scrollIntoViewIfNeeded();
      const spacing = await popup.evaluate(el => {
        const model = el.querySelector('[data-testid="popup-model"]').getBoundingClientRect();
        const label = el.querySelector('.ij2499-prompt-label').getBoundingClientRect();
        const prompt = el.querySelector('#popup-prompt').getBoundingClientRect();
        const link = el.querySelector('.ij2499-open-settings').getBoundingClientRect();
        return { promptGap: label.top - model.bottom, linkGap: link.top - prompt.bottom };
      });
      assert.ok(spacing.promptGap >= 12, 'prompt block is separated from Model');
      assert.ok(spacing.linkGap >= 8, 'Settings link is below the prompt');
      assert.equal(await popup.locator('.ij2499-branch-help').count(), 0, 'compact popup omits the branch-variable helper');
      assert.equal(await popup.locator('#popup-prompt').inputValue(), 'Short message with $GIT_BRANCH_NAME');
      assert.match(await popup.locator('[data-testid="popup-agent"]').innerText(), /Codex/);
      assert.match(await popup.locator('[data-testid="popup-model"]').innerText(), /GPT-5 mini/);
      await popup.screenshot({ path: path.join(outputDir, `options-${viewport.width}.png`) });
      await popup.getByRole('button', { name: 'Open in Settings…', exact: true }).click();
      await settings.waitFor();
      assert.equal(await settings.locator('#settings-prompt').inputValue(), 'Short message with $GIT_BRANCH_NAME');
      await page.screenshot({ path: path.join(outputDir, `settings-${viewport.width}.png`) });
      await page.getByRole('button', { name: 'Cancel', exact: true }).click();
      await page.reload();
      await page.locator('.ij2499-gear').waitFor();
      assert.equal(await page.locator('.ij2499-settings-hint').count(), 0, 'banner stays absent after reload');
      await page.locator('.main-toolbar').getByRole('button', { name: 'Settings', exact: true }).click();
      await page.locator('.settings-tree-nodes').getByText('Commit Message Generation', { exact: true }).click();
      await settings.waitFor();
      assert.equal(await settings.locator('#settings-prompt').inputValue(), 'Short message with $GIT_BRANCH_NAME');
      assert.match(await settings.locator('[data-testid="settings-model"]').innerText(), /GPT-5 mini/);
      await page.getByRole('button', { name: 'Cancel', exact: true }).click();
      await page.locator('.main-window-editor-tabs').getByText('Refactor VisitController.java time slots', { exact: true }).click();
      await header.getByRole('button', { name: 'Open Branch Changes', exact: true }).click();
      assert.ok(await page.locator('.commit-tool-window').isVisible(), 'opening branch changes keeps Commit available');
      assert.ok(await page.locator('.ai-review-editor-split').count() > 0, 'Branch Changes opens the original diff review');
      await page.close();
    }
    const returningPage = await browser.newPage({ viewport: { width: 1386, height: 875 } });
    await returningPage.goto(`${previewUrl}/?entry=commit&scenario=no-files`);
    await returningPage.locator('.ij2499-gear').waitFor();
    const savedPreferences = JSON.stringify({ agent: 'codex', model: 'GPT-5', prompt: 'Keep my preferences' });
    await returningPage.evaluate(value => {
      localStorage.setItem('ijai2499:petclinic:air:settings-hint:v1', 'seen');
      localStorage.setItem('ijai2499:petclinic:air:v1', value);
    }, savedPreferences);
    await returningPage.reload();
    await returningPage.locator('.ij2499-gear').waitFor();
    assert.equal(await returningPage.locator('.ij2499-settings-hint').count(), 0, 'normal reopening preserves the acknowledged first-use state');
    await returningPage.goto(`${previewUrl}/?entry=commit&scenario=no-files&onboarding=restart`);
    await returningPage.locator('.ij2499-gear').waitFor();
    assert.equal(await returningPage.locator('.ij2499-settings-hint').count(), 0);
    const retained = await returningPage.evaluate(() => JSON.parse(localStorage.getItem('ijai2499:petclinic:air:v1')));
    assert.equal(retained.model, 'GPT-5');
    assert.equal(retained.prompt, 'Keep my preferences');
    await returningPage.close();

    }
    await checkGenerationChats(browser, outputDir, previewUrl);
    console.log('PASS: first loading/information request; symmetric banner above Generate; reference choices and confirmation; same-chat resume fills Commit; repeat error preserves draft; keyboard/custom instructions; Stop and comment-compatible UI.');
  } finally { await browser.close(); }
}
(async () => {
  if (process.argv.includes('--comments-only')) { await checkCommentToolbar(); return; }
  if (process.argv.includes('--browser')) { await checkBrowserLayout(); return; }
  const build = await esbuild.build({
    stdin: { contents: `import React from 'react'; import { createRoot } from 'react-dom/client';
      import { ThemeProvider } from '@jetbrains/int-ui-kit';
      import App, { CommitToolWindow } from './src/App.jsx'; window.React = React;
      window.openedFiles = []; window.chatRequests = []; window.generationRequests = []; const root = createRoot(document.getElementById('root'));
      window.mountCommit = (key, scopeRequest = null) => root.render(<ThemeProvider defaultTheme="dark"><CommitToolWindow key={key} scopeRequest={scopeRequest}
        ctx={{ focusedPanel: 'left', setFocusedPanel() {}, setShowLeftPanel() {} }} onOpenFile={file => window.openedFiles.push(file)} onContinueInChat={request => window.chatRequests.push(request)} onGenerationStart={(request, cancel, confirm) => { window.confirmGeneration = confirm; window.generationRequests.push(request); return 'test-chat-' + window.generationRequests.length; }} /></ThemeProvider>);
      window.mountCommit('first'); window.mountFull = () => root.render(<App />);`, loader: 'jsx', resolveDir: root },
    bundle: true, write: false, jsx: 'automatic', format: 'iife', logLevel: 'silent',
    define: { 'import.meta.env.DEV': 'false' }, loader: { '.css': 'empty', '.svg': 'dataurl' },
    alias: { react: path.dirname(require.resolve('react/package.json')), 'react-dom': path.dirname(require.resolve('react-dom/package.json')) },
    plugins: [{ name: 'expose-commit-for-test', setup(build) {
      build.onLoad({ filter: /\/src\/App\.jsx$/ }, args => ({ contents: fs.readFileSync(args.path, 'utf8') + '\nexport { CommitToolWindow };', loader: 'jsx' }));
    } }],
  });
  const errors = [], vc = new VirtualConsole();
  vc.on('jsdomError', error => errors.push(error));
  vc.on('error', (...args) => errors.push(args.map(String).join(' ')));
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/?entry=commit&scenario=no-files', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc });
  const w = dom.window, d = w.document;
  w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  w.eval(build.outputFiles[0].text);
  await wait(80);
  const button = (label, context = d) => [...context.querySelectorAll('button')].find(el => el.textContent.trim() === label || el.getAttribute('aria-label') === label || el.title === label);
  const click = async el => { assert.ok(el, 'control exists'); el.dispatchEvent(new w.MouseEvent('mousedown', { bubbles: true })); el.dispatchEvent(new w.MouseEvent('mouseup', { bubbles: true })); el.click(); await wait(25); };
  const edit = async (el, value) => {
    assert.ok(el, 'editable field exists');
    Object.getOwnPropertyDescriptor(w.HTMLTextAreaElement.prototype, 'value').set.call(el, value);
    el.dispatchEvent(new w.Event('input', { bubbles: true })); await wait(25);
  };
  const message = () => d.querySelector('[aria-label="Commit Message"]');
  const check = () => d.querySelector('.commit-file-node input[type="checkbox"]');
  assert.ok(button('Generate Message').querySelector('[data-agent="codex"]'));
  assert.ok(button('Generate Message').disabled);
  assert.ok(!d.querySelector('.ij2499-settings-hint'));
  await click(button('Commit Options'));
  assert.match(d.querySelector('[data-testid="popup-model"]').textContent, /GPT-5 mini/);
  await click(button('Open in Settings…'));
  assert.ok(d.querySelector('#settings-prompt'));
  await click(button('Cancel', d.querySelector('[aria-modal="true"]')));
  await click(d.querySelector('.commit-file-open'));
  assert.equal(w.openedFiles.length, 1);
  assert.ok(button('Generate Message').disabled, 'opening diff must not check file');
  await click(check()); assert.ok(!button('Generate Message').disabled);
  await edit(message(), 'My draft');
  await click(button('Generate Message')); assert.ok(button('Commit').disabled);
  assert.ok(message().readOnly, 'loading message is protected until stop/completion');
  assert.equal(message().getAttribute('aria-busy'), 'true');
  assert.match(d.querySelector('.commit-message-area [role="status"]').textContent, /Generating/);
  assert.ok(button('Stop generation').querySelector('.icon'), 'original toolbar slot provides Stop');
  assert.ok(!button('Generate Message'));
  await click(button('Stop generation'));
  assert.equal(message().value, 'My draft', 'Stop restores the previous draft immediately');
  assert.ok(!message().readOnly); assert.ok(button('Generate Message'));
  await wait(3050); assert.equal(message().value, 'My draft', 'stopped request cannot overwrite the draft');
  await click(button('Generate Message')); await edit(message(), 'Manual edit');
  await wait(3050); assert.equal(message().value, 'Manual edit');
  await click(button('Generate Message')); await click(check());
  await wait(3050); assert.equal(message().value, 'Manual edit'); assert.ok(button('Generate Message').disabled);
  await click(check()); await click(button('Generate Message')); await wait(3050);
  assert.match(d.querySelector('.ij2499-generation-banner').textContent, /Input needed/);
  assert.ok(button('Generate Message').disabled);
  w.confirmGeneration({ choiceId: 'allow-once', label: 'Allow for this request' }); await wait(3050);
  assert.ok(!message().readOnly); assert.ok(!d.querySelector('.ij2499-message-loading'));
  assert.ok(button('Generate Message')); assert.ok(!button('Stop generation'));
  assert.match(message().value, /VisitController.java/); assert.doesNotMatch(message().value, /application.properties|VetSchedule/);
  assert.ok(!d.querySelector('.ij2499-status'), 'successful generation does not add a status row');
  assert.ok(!d.querySelector('.ij2499-settings-hint'), 'generation does not bring back an acknowledged hint');
  const successfulDraft = message().value;
  await click(button('Generate Message')); await wait(3050);
  assert.match(d.querySelector('.ij2499-generation-banner').textContent, /generation failed/);
  assert.equal(message().value, successfulDraft, 'the second request preserves the successful draft');
  await click(button('Open chat'));
  await click(button('Generate Message')); await wait(3050);
  assert.match(d.querySelector('.ij2499-generation-banner').textContent, /generation failed/);
  assert.equal(message().value, successfulDraft);

  await click(button('Commit Options'));
  const popup = d.querySelector('.ij2499-options'); assert.ok(popup.classList.contains('theme-dark'));
  assert.ok(!popup.querySelector('.ij2499-branch-help'), 'branch-variable help is omitted from the compact popup');
  assert.deepEqual([...popup.querySelectorAll('[role="heading"]')].map(el => el.textContent), ['Git', 'Commit Checks', 'Advanced Commit Checks', 'After Commit', 'Air']);
  assert.equal(popup.querySelectorAll('.ij2499-checks input[type="checkbox"]').length, 10);
  const advancedAfter = popup.querySelector('.ij2499-advanced-after input');
  assert.ok(advancedAfter.checked);
  await click(advancedAfter); assert.ok(!advancedAfter.checked);
  await click(button('Choose configuration for Run Configuration', popup));
  const runDialog = d.querySelector('[aria-label="Choose run configuration"]'); assert.ok(runDialog);
  await click(button('Cancel', runDialog));
  assert.deepEqual([...popup.querySelectorAll('.ij2499-air-fields .ij2499-selector-label')].map(el => el.textContent), ['Agent:', 'Model:']);
  assert.equal(popup.querySelectorAll('[data-testid="popup-agent"] button, [data-testid="popup-model"] button').length, 0);
  assert.match(popup.querySelector('[data-testid="popup-model"]').textContent, /GPT-5 mini/);
  assert.ok(popup.querySelector('[data-testid="popup-agent"] [data-agent="codex"]'));

  await click(button('Choose profile for Analyze code', popup));
  let modal = d.querySelector('[aria-label="Choose inspection profile"]'); assert.ok(modal);
  await click(modal.querySelector('.dropdown'));
  await click([...modal.querySelectorAll('.dropdown-option')].find(el => el.textContent === 'Default'));
  await click(button('OK', modal)); assert.ok(d.querySelector('.ij2499-options'), 'secondary preference keeps popup open');
  await click(button('Choose profile for Analyze code', popup));
  modal = d.querySelector('[aria-label="Choose inspection profile"]'); assert.match(modal.querySelector('.dropdown').textContent, /Default/);
  await click(button('Cancel', modal));
  const prompt = 'One-line Russian Conventional Commits with {branch_name}';
  await edit(popup.querySelector('textarea'), prompt);
  await click(button('Open in Settings…', popup));
  assert.ok(d.querySelector('#settings-prompt'), errors.map(String).join('\n') + d.body.textContent.slice(-1600));
  assert.equal(d.querySelector('#settings-prompt').value, prompt);
  await edit(d.querySelector('#settings-prompt'), 'Unapplied');
  await click(button('Cancel', d.querySelector('[aria-modal="true"]')));
  await click(button('Commit Options')); assert.equal(d.querySelector('#popup-prompt').value, prompt);
  await click(button('Open in Settings…'));
  await edit(d.querySelector('#settings-prompt'), 'numbered Russian $GIT_BRANCH_NAME');
  await click(button('Apply')); await edit(d.querySelector('#settings-prompt'), 'Unapplied after Apply');
  await click(button('Cancel', d.querySelector('[aria-modal="true"]')));
  await click(button('Commit Options')); assert.equal(d.querySelector('#popup-prompt').value, 'numbered Russian $GIT_BRANCH_NAME');
  d.querySelector('.ij2499-options-content').dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await wait(25);
  await click(button('Generate Message')); await wait(3050);
  assert.ok(d.querySelector('.ij2499-generation-banner.banner-error'));
  await edit(message(), 'Commit this change');
  const count = d.querySelectorAll('.commit-file-node').length;
  await click(button('Commit')); assert.equal(d.querySelectorAll('.commit-file-node').length, count - 1);
  assert.ok(button('Generate Message').disabled); assert.equal(message().value, '');
  assert.ok(!d.querySelector('.commit-success'), 'Commit does not add an inline success banner');

  w.history.replaceState(null, '', '?entry=commit&scenario=error'); w.mountCommit('error'); await wait(60);
  await edit(message(), 'Keep on failure'); await click(button('Generate Message')); await wait(3050);
  assert.equal(message().value, 'Keep on failure');
  assert.match(d.querySelector('.ij2499-generation-banner').textContent, /generation failed/);
  await click(button('Open chat'));
  assert.equal(w.chatRequests.at(-1).draft, 'Keep on failure');
  assert.equal(w.chatRequests.at(-1).settings.prompt, 'numbered Russian $GIT_BRANCH_NAME');
  assert.ok(w.chatRequests.at(-1).files.length > 0);
  assert.equal(message().value, 'Keep on failure');
  await click(button('Commit Options')); assert.equal(d.querySelector('#popup-prompt').value, 'numbered Russian $GIT_BRANCH_NAME');
  w.mountCommit('scope', { id: 'visit-scope', name: 'Visit fix', files: [{ label: 'VisitController.java' }] }); await wait(60);
  assert.equal(d.querySelectorAll('.commit-file-node input:checked').length, 1);
  await edit(message(), 'Commit one scoped file'); await click(button('Commit'));
  assert.equal(d.querySelectorAll('.commit-file-node input:checked').length, 0);
  assert.ok(button('Generate Message').disabled, 'scoped commit must not recheck other files');
  w.history.replaceState(null, '', '?entry=commit&scenario=info');
  w.mountCommit('paused-stale'); await wait(60);
  await click(button('Generate Message')); await wait(3050);
  const staleConfirm = w.confirmGeneration;
  await edit(message(), 'Changed while awaiting input');
  assert.equal(staleConfirm({ choiceId: 'allow-once', label: 'Old answer' }), false);
  await click(button('Generate Message')); await wait(3050);
  assert.equal(staleConfirm({ choiceId: 'allow-once', label: 'Old answer' }), false, 'old chat confirmation cannot resume a newer request');
  assert.ok(button('Generate Message').disabled);
  assert.equal(message().value, 'Changed while awaiting input');
  w.history.replaceState(null, '', '?entry=commit');
  w.HTMLElement.prototype.scrollIntoView = function () {};
  w.mountFull(); await wait(150);
  assert.ok(d.querySelector('.commit-tool-window'), 'original V3 entry opens Commit');
  assert.equal(d.querySelectorAll('.commit-file-node input:checked').length, 4, 'normal entry starts with the four request-logging files');
  assert.ok(d.querySelector('.main-window'), 'original IDE shell renders');
  assert.ok(d.querySelector('.plan-diff-editor-area'), 'Commit entry automatically opens the VisitController diff');
  assert.ok(!d.querySelector('.aiux543-chat-editor-host'), 'chat is not the initial active editor');
  const originalTreeFile = d.querySelector('.commit-file-open');
  assert.ok(originalTreeFile); await click(originalTreeFile); await wait(100);
  assert.ok(d.querySelector('.commit-tool-window'), 'opening diff preserves Commit window');
  assert.match(d.body.textContent, /VisitController.java/);
  assert.equal(errors.length, 0, errors.map(String).join('\n'));
  dom.window.close();
  console.log('PASS: full original V3 IDE and Commit entry; tree/diff action; checkbox gating; checked-file-only generation; cancellation/edit/selection races; information/error; reference popup; read-only agent/model; persistent shared Settings Apply/Cancel; branch context; scoped commit.');
})().catch(error => { console.error(error); process.exitCode = 1; });
