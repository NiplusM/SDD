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
      await bar.locator('.plan-diff-send-comments-button').click();
      await page.locator('.aiux543-chat-editor-host').waitFor();
      assert.match(await page.locator('.ai-review-editor-split-pane.is-chat .tab-selected').innerText(), /Review Visit.*model fields/);
      const sent = page.locator('.ai-chat-user-card').last();
      assert.match(await sent.innerText(), /I left 2 comments/);
      assert.match(await sent.innerText(), /Keep the logging message useful/);
      assert.match(await sent.innerText(), /Keep the controller initialization clear/);
      assert.equal(await sent.locator('.ai-chat-sent-attachment-chip').count(), 1, 'both saved notes travel in the file attachment');
      assert.ok(await page.locator('.commit-tool-window').isVisible(), 'sending comments retains Commit');
      await page.getByRole('button', { name: 'Comments are being processed by the agent.', exact: true }).waitFor();
      assert.ok(await bar.locator('.plan-diff-send-comments-button').isDisabled(), 'duplicate send is disabled while the agent processes comments');
      await checkPlacement(page);
      await page.screenshot({ path: path.join(outputDir, `comment-toolbar-sending-${width}.png`) });
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
    await page.screenshot({ path: path.join(outputDir, 'comment-toolbar-source.png') });
    await bar.locator('.plan-diff-send-comments-button').click();
    await page.locator('.aiux543-chat-editor-host').waitFor();
    assert.match(await page.locator('.ai-chat-user-card').last().innerText(), /Keep the controller annotation/);
    await page.close();
    console.log('PASS: comment-only bottom control; saved-note gating; one/two-note navigation; reference placement at two widths; explicit recipient; real comment attachments; pending duplicate-send prevention; source-file notes.');
  } finally { await browser.close(); }
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
        const labelRange = document.createRange(); labelRange.selectNodeContents(element);
        const sessionRange = document.createRange(); sessionRange.selectNodeContents(session.querySelector('.toolbar-button-text'));
        const dividerBounds = divider.getBoundingClientRect();
        return { before: dividerBounds.left - sessionRange.getBoundingClientRect().right,
          after: labelRange.getBoundingClientRect().left - dividerBounds.right,
          height: element.getBoundingClientRect().height };
      });
      assert.equal(scopeSpacing.after, scopeSpacing.before, 'scope and session text have equal insets around the separator');
      assert.equal(scopeSpacing.height, 26, 'fixed scope label aligns with the toolbar row');
      assert.equal(await scopeLabel.locator('.dropdown, .dropdown-chevron, button').count(), 0, 'Commit diff has one fixed branch scope without a menu or chevron');
      await scopeLabel.click();
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
      if (viewport.width === 1656) {
        await page.locator('.commit-file-node .checkbox-container').first().click();
        await page.locator('[aria-label="Commit Message"]').fill('Keep this draft');
        await page.getByRole('button', { name: 'Generate Message', exact: true }).click();
        await page.getByRole('button', { name: 'Stop generation', exact: true }).waitFor();
        await page.locator('.main-toolbar').getByRole('button', { name: 'Settings', exact: true }).click();
        await page.locator('.settings-tree-nodes').getByText('Commit Message Generation', { exact: true }).click();
        await settings.locator('#settings-prompt').fill('Short message');
        await page.getByRole('button', { name: 'Apply', exact: true }).click();
        await page.getByRole('button', { name: 'Cancel', exact: true }).click();
        assert.equal(await page.getByRole('button', { name: 'Stop generation', exact: true }).count(), 0, 'global settings cancel an outdated request');
        await page.waitForTimeout(3100);
        assert.equal(await page.locator('[aria-label="Commit Message"]').inputValue(), 'Keep this draft', 'late response cannot overwrite the draft');
        await page.getByRole('button', { name: 'Generate Message', exact: true }).click();
        await page.waitForFunction(() => document.querySelector('[aria-label="Commit Message"]')?.getAttribute('aria-busy') === 'false');
        assert.notEqual(await page.locator('[aria-label="Commit Message"]').inputValue(), 'Keep this draft');
        assert.equal(await page.locator('.ij2499-status').count(), 0, 'successful generation leaves the editable result without a status row');
        await page.screenshot({ path: path.join(outputDir, `result-${viewport.width}.png`) });
        const generatedDraft = await page.locator('[aria-label="Commit Message"]').inputValue();
        await page.getByRole('button', { name: 'Generate Message', exact: true }).click();
        const repeatError = page.locator('.ij2499-status-error');
        await repeatError.waitFor();
        assert.match(await repeatError.innerText(), /did not respond before the request timed out/);
        assert.equal(await page.locator('[aria-label="Commit Message"]').inputValue(), generatedDraft, 'second generation fails without replacing the successful draft');
        assert.ok(await repeatError.getByRole('button', { name: 'Continue in Chat', exact: true }).isVisible());
        await page.screenshot({ path: path.join(outputDir, `second-generation-error-${viewport.width}.png`) });
        await repeatError.getByRole('button', { name: 'Retry', exact: true }).click();
        await page.waitForFunction(() => document.querySelector('[aria-label="Commit Message"]')?.getAttribute('aria-busy') === 'false');
        assert.equal(await page.locator('.ij2499-status-error').count(), 0, 'Retry succeeds after the second-generation error');
        await page.getByRole('button', { name: 'Generate Message', exact: true }).click();
        await page.getByRole('button', { name: 'Stop generation', exact: true }).waitFor();
        assert.equal(await page.locator('.ij2499-message-loading').innerText(), 'Generating…');
        await repeatError.waitFor();
        assert.equal(await page.locator('[aria-label="Commit Message"]').inputValue(), generatedDraft, 'repeat generation after Retry still fails and preserves the draft');
      }
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

    const defaultPage = await browser.newPage({ viewport: { width: 1386, height: 875 } });
    await defaultPage.goto(`${previewUrl}/?entry=commit&scenario=default`);
    const defaultGenerate = defaultPage.getByRole('button', { name: 'Generate Message', exact: true });
    const defaultMessage = defaultPage.getByRole('textbox', { name: 'Commit Message', exact: true });
    await defaultGenerate.waitFor();
    const defaultSelectedFiles = await defaultPage.locator('.commit-file-node').filter({ has: defaultPage.locator('input:checked') }).locator('.commit-file-name').allTextContents();
    assert.deepEqual(defaultSelectedFiles, ['VisitController.java', 'application.properties', 'VisitControllerTests.java', 'VisitRequestFilter.java']);
    await defaultGenerate.click();
    await defaultPage.getByRole('button', { name: 'Stop generation', exact: true }).waitFor();
    await defaultGenerate.waitFor();
    const defaultDraft = await defaultMessage.inputValue();
    assert.ok(defaultDraft.length > 0, 'normal entry generates a message for the default checked files');
    for (const name of defaultSelectedFiles) assert.ok(defaultDraft.includes(name), `generated message includes ${name}`);
    assert.ok(!defaultDraft.includes('Owner.java') && !defaultDraft.includes('VetSchedule.java'), 'unchecked files are absent from the generated message');
    await defaultGenerate.click();
    await defaultPage.getByRole('button', { name: 'Stop generation', exact: true }).waitFor();
    assert.equal(await defaultPage.locator('.ij2499-message-loading').innerText(), 'Generating…');
    const defaultError = defaultPage.locator('.ij2499-status-error');
    await defaultError.waitFor();
    const errorBounds = await defaultError.boundingBox();
    const generateBounds = await defaultGenerate.boundingBox();
    assert.equal(Math.round(generateBounds.y - errorBounds.y - errorBounds.height), 8, 'error notification appears above Generate Message where the settings tip used to be');
    assert.ok(await defaultError.evaluate(element => !element.closest('.commit-bottom-panel')), 'error notification is outside the Commit layout and does not consume message space');
    assert.equal(await defaultMessage.inputValue(), defaultDraft);
    await defaultError.getByRole('button', { name: 'Retry', exact: true }).click();
    await defaultPage.getByRole('button', { name: 'Stop generation', exact: true }).waitFor();
    await defaultGenerate.waitFor();
    assert.equal(await defaultError.count(), 0, 'normal-entry Retry succeeds');
    await defaultGenerate.click();
    await defaultPage.getByRole('button', { name: 'Stop generation', exact: true }).waitFor();
    await defaultError.waitFor();
    assert.equal(await defaultMessage.inputValue(), defaultDraft, 'every repeat generation after a success shows the recoverable error');
    await defaultPage.screenshot({ path: path.join(outputDir, 'default-repeat-generation-error.png') });
    await defaultError.getByRole('button', { name: 'Retry', exact: true }).click();
    await defaultPage.getByRole('button', { name: 'Stop generation', exact: true }).waitFor();
    await defaultGenerate.waitFor();
    const fileCountBeforeCommit = await defaultPage.locator('.commit-file-node').count();
    await defaultPage.locator('.commit-buttons').getByRole('button', { name: 'Commit', exact: true }).click();
    assert.equal(await defaultPage.locator('.commit-file-node').count(), fileCountBeforeCommit - 4, 'Commit removes only the selected files');
    assert.equal(await defaultPage.locator('.commit-file-node input:checked').count(), 0);
    assert.equal(await defaultMessage.inputValue(), '');
    assert.ok(await defaultGenerate.isDisabled());
    assert.equal(await defaultPage.locator('.commit-success').count(), 0, 'Commit does not insert a custom green status block');
    await defaultPage.screenshot({ path: path.join(outputDir, 'after-commit-no-success-banner.png') });
    await defaultPage.close();

    for (const width of [1656, 1000]) {
      const page = await browser.newPage({ viewport: { width, height: 875 } });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(`${previewUrl}/?entry=commit&scenario=error`);
      await page.locator('.ij2499-generate').waitFor();
      const files = page.locator('.commit-file-node input[type="checkbox"]');
      for (let index = 1; index < await files.count(); index++) {
        if (await files.nth(index).isChecked()) await page.locator('.commit-file-node .checkbox-container').nth(index).click();
      }
      const selectedFile = await page.locator('.commit-file-node').first().locator('.commit-file-name').innerText();
      const message = page.getByRole('textbox', { name: 'Commit Message', exact: true });
      await message.fill('Preserve this draft');
      await page.getByRole('button', { name: 'Generate Message', exact: true }).click();
      const alert = page.locator('.ij2499-status-error');
      await alert.waitFor();
      assert.match(await alert.innerText(), /Codex did not respond before the request timed out/);
      assert.equal(await message.inputValue(), 'Preserve this draft');
      await page.screenshot({ path: path.join(outputDir, `generation-error-${width}.png`) });
      await alert.getByRole('button', { name: 'Continue in Chat', exact: true }).click();
      const chat = page.locator('.aiux543-chat-editor-host');
      await chat.waitFor();
      assert.equal(await chat.locator('.ai-chat-user-card').count(), 1, 'handoff shows one short sent request');
      assert.match(await chat.locator('.ai-chat-user-card').innerText(), /Generate a commit message from the selected changes\./);
      assert.equal(await chat.locator('.ai-chat-user-card .ai-chat-sent-attachment-chip').count(), 1, 'selected diff is inside the sent message');
      assert.equal(await chat.locator('.aiux543-user-attachments, .aiux543-composer-attachment-chip').count(), 0, 'no duplicated attachment context');
      const initialErrorAnswer = chat.locator('.aiux543-answer').first();
      assert.equal(await chat.locator('.aiux543-answer').count(), 1, 'handoff includes the agent error answer');
      assert.equal(await initialErrorAnswer.locator('h3').innerText(), 'Codex');
      assert.match(await initialErrorAnswer.innerText(), /GPT-5 mini.*timed out/s);
      assert.match(await initialErrorAnswer.innerText(), /draft.*left unchanged/s);
      assert.match(await initialErrorAnswer.innerText(), /ask me to try again/);
      assert.ok(!(await chat.innerText()).includes('Existing draft:'), 'the previous draft is retained as request context instead of pasted into the transcript');
      assert.match(await chat.innerText(), /GPT-5 mini/);
      const composer = chat.locator('.aiux543-chat-input');
      await composer.waitFor();
      await checkChatHeaderAlignment(page);
      assert.equal(await composer.inputValue(), '', 'handoff composer stays empty');
      assert.equal(await page.locator('.commit-file-node input:checked').count(), 1);
      await page.screenshot({ path: path.join(outputDir, `continue-in-chat-${width}.png`) });
      await composer.fill('One-line Conventional Commits in Russian.');
      await composer.press('Enter');
      await page.waitForFunction(label => [...document.querySelectorAll('.aiux543-chat-editor-host .aiux543-answer')].some(element => /chore: обновить/.test(element.textContent) && element.textContent.includes(label))
        && !document.querySelector('.aiux543-chat-editor-host .ai-chat-streaming-caret'), selectedFile);
      assert.ok((await chat.innerText()).includes(selectedFile));
      await composer.fill('Make it shorter.');
      await composer.press('Enter');
      await page.waitForFunction(label => [...document.querySelectorAll('.aiux543-chat-editor-host .aiux543-answer')].filter(element => /chore: обновить/.test(element.textContent) && element.textContent.includes(label)).length === 2
        && !document.querySelector('.aiux543-chat-editor-host .ai-chat-streaming-caret'), selectedFile);
      assert.equal(await message.inputValue(), 'Preserve this draft');
      assert.equal(await page.locator('.commit-file-node input:checked').count(), 1);
      await page.screenshot({ path: path.join(outputDir, `chat-result-${width}.png`) });
      assert.deepEqual(errors, []);
      await alert.getByRole('button', { name: 'Retry', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('[aria-label="Commit Message"]')?.getAttribute('aria-busy') === 'false');
      assert.notEqual(await message.inputValue(), 'Preserve this draft');
      assert.equal(await alert.count(), 0);
      await page.close();
    }
    }
    for (const width of [1656, 1000]) {
      const page = await browser.newPage({ viewport: { width, height: 875 } });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(`${previewUrl}/?entry=commit&scenario=error`);
      const checkedCount = await page.locator('.commit-file-node input:checked').count();
      assert.equal(checkedCount, 4);
      const selectedFiles = await page.locator('.commit-file-node').filter({ has: page.locator('input:checked') }).locator('.commit-file-name').allTextContents();
      assert.deepEqual(selectedFiles, ['VisitController.java', 'application.properties', 'VisitControllerTests.java', 'VisitRequestFilter.java']);
      const message = page.getByRole('textbox', { name: 'Commit Message', exact: true });
      await message.fill('A previous draft with several lines.\nKeep this draft in Commit.');
      await page.getByRole('button', { name: 'Generate Message', exact: true }).click();
      const alert = page.locator('.ij2499-status-error');
      await alert.waitFor();
      await alert.getByRole('button', { name: 'Continue in Chat', exact: true }).click();
      const chat = page.locator('.ij2499-commit-chat');
      const composer = chat.locator('.aiux543-chat-input');
      await composer.waitFor();
      await checkChatHeaderAlignment(page);
      const initialMessage = chat.locator('.ai-chat-user-card').first();
      assert.equal(await chat.locator('.ai-chat-user-card').count(), 1);
      assert.match(await initialMessage.innerText(), /Generate a commit message from the selected changes\./);
      assert.equal(await initialMessage.locator('.ai-chat-sent-attachment-chip').count(), 4);
      assert.deepEqual(await initialMessage.locator('.ai-chat-attachment-name').allTextContents(), selectedFiles.map(name => `Diff ${name}`));
      assert.equal(await initialMessage.getByRole('button', { name: /^Show (all|less)/ }).count(), 0, 'attachments are never collapsed');
      for (const chip of await initialMessage.locator('.ai-chat-sent-attachment-chip').all()) assert.ok(await chip.isVisible());
      assert.equal(await chat.locator('.aiux543-user-attachments, .aiux543-composer-attachment-chip').count(), 0);
      assert.equal(await composer.inputValue(), '');
      const initialErrorAnswer = chat.locator('.aiux543-answer').first();
      assert.equal(await chat.locator('.aiux543-answer').count(), 1, 'the selected agent explains the generation failure');
      assert.equal(await initialErrorAnswer.locator('h3').innerText(), 'Codex');
      assert.match(await initialErrorAnswer.innerText(), /Commit message generation failed/);
      assert.match(await initialErrorAnswer.innerText(), /GPT-5 mini.*timed out/s);
      assert.match(await initialErrorAnswer.innerText(), /draft.*left unchanged/s);
      assert.match(await initialErrorAnswer.innerText(), /selected diffs and generation settings/);
      assert.match(await initialErrorAnswer.innerText(), /ask me to try again/);
      assert.equal(await initialErrorAnswer.locator('p').count(), 3, 'error includes cause, preserved context and next step');
      assert.ok(await initialErrorAnswer.evaluate(element => Boolean(element.previousElementSibling?.matches('.ai-chat-user-card'))), 'error answer follows the sent request');
      assert.equal(await chat.getByRole('button', { name: 'Generating', exact: true }).count(), 0, 'idle handoff has no generation spinner');
      const composerBounds = await chat.locator('.aiux543-chat-composer').boundingBox();
      assert.ok(composerBounds.height <= 240, 'sent attachments do not inflate the empty composer');
      assert.ok(composerBounds.y > 0 && composerBounds.y + composerBounds.height < 875);
      await page.screenshot({ path: path.join(outputDir, `continue-in-chat-selected-files-${width}.png`) });
      if (width === 1656) {
        await initialMessage.locator('.ai-chat-sent-attachment-chip').first().click();
        await page.locator('.ai-review-editor-split .plan-diff-overlay').waitFor();
        await page.locator('.ai-review-editor-split-pane.is-review .tab-close').first().click();
        await page.locator('.main-window-editor-tabs').getByText('Commit message generation', { exact: true }).click();
        await composer.waitFor();
        await checkChatHeaderAlignment(page);
        assert.equal(await composer.inputValue(), '', 'handoff composer stays empty');
        assert.equal(await initialMessage.locator('.ai-chat-sent-attachment-chip').count(), 4, 'opening a diff preserves all four sent attachments');
      }
      await composer.fill('One-line Conventional Commits in Russian.');
      await composer.press('Enter');
      await page.waitForFunction(() => [...document.querySelectorAll('.ij2499-commit-chat .aiux543-answer')].some(element => element.textContent.includes('chore: обновить'))
        && !document.querySelector('.ij2499-commit-chat .ai-chat-streaming-caret'));
      assert.equal(await chat.locator('.ai-chat-user-card').count(), 2, 'follow-up adds one message after the initial request');
      assert.equal(await chat.locator('.aiux543-answer').count(), 2, 'the error answer remains before the successful follow-up response');
      assert.match(await initialErrorAnswer.innerText(), /timed out/);
      assert.equal(await chat.locator('.aiux543-chat-composer .ai-chat-attachment-chip').count(), 0, 'context remains only in the sent message');
      assert.equal(await composer.inputValue(), '');
      assert.deepEqual(await initialMessage.locator('.ai-chat-attachment-name').allTextContents(), selectedFiles.map(name => `Diff ${name}`), 'follow-up retains every selected file');
      await page.screenshot({ path: path.join(outputDir, `chat-result-selected-files-${width}.png`) });
      assert.equal(await message.inputValue(), 'A previous draft with several lines.\nKeep this draft in Commit.');
      assert.equal(await page.locator('.commit-file-node input:checked').count(), checkedCount);
      assert.deepEqual(errors, []);
      await page.close();
    }
    console.log(process.argv.includes('--handoff-only')
      ? 'PASS: four-file chat handoff at two widths; one short sent request; every attachment visible inside it; detailed agent error answer; empty composer; successful streaming follow-up; preserved draft and selection.'
      : 'PASS: current prototype at three widths, default mini model/agent icon, no banner, shared settings and retained preferences, timeout/retry, four default checked files, fully visible sent attachments, empty composer and relevant follow-up response, preserved Commit state.');
  } finally { await browser.close(); }
}
(async () => {
  if (process.argv.includes('--comments-only')) { await checkCommentToolbar(); return; }
  if (process.argv.includes('--browser')) { await checkBrowserLayout(); return; }
  const build = await esbuild.build({
    stdin: { contents: `import React from 'react'; import { createRoot } from 'react-dom/client';
      import { ThemeProvider } from '@jetbrains/int-ui-kit';
      import App, { CommitToolWindow } from './src/App.jsx'; window.React = React;
      window.openedFiles = []; window.chatRequests = []; const root = createRoot(document.getElementById('root'));
      window.mountCommit = (key, scopeRequest = null) => root.render(<ThemeProvider defaultTheme="dark"><CommitToolWindow key={key} scopeRequest={scopeRequest}
        ctx={{ focusedPanel: 'left', setFocusedPanel() {}, setShowLeftPanel() {} }} onOpenFile={file => window.openedFiles.push(file)} onContinueInChat={request => window.chatRequests.push(request)} /></ThemeProvider>);
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
  assert.ok(!message().readOnly); assert.ok(!d.querySelector('.ij2499-message-loading'));
  assert.ok(button('Generate Message')); assert.ok(!button('Stop generation'));
  assert.match(message().value, /VisitController.java/); assert.doesNotMatch(message().value, /application.properties|VetSchedule/);
  assert.ok(!d.querySelector('.ij2499-status'), 'successful generation does not add a status row');
  assert.ok(!d.querySelector('.ij2499-settings-hint'), 'generation does not bring back an acknowledged hint');
  const successfulDraft = message().value;
  await click(button('Generate Message')); await wait(3050);
  assert.match(d.querySelector('.ij2499-status-error').textContent, /timed out/);
  assert.equal(message().value, successfulDraft, 'second generation preserves the first result on failure');
  assert.ok(button('Continue in Chat'));
  await click(button('Retry')); await wait(3050);
  assert.ok(!d.querySelector('.ij2499-status-error'), 'Retry succeeds after the normal-entry second attempt');

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
  await click(popup.querySelector('[data-testid="popup-agent"] .toolbar-button'));
  let selector = d.querySelector('.ij2499-selector-menu'); assert.ok(selector);
  assert.equal(selector.querySelector('[aria-checked="true"]').textContent.trim(), 'CodexDefault');
  await click([...selector.querySelectorAll('.popup-cell-adv-name')].find(el => el.textContent === 'Claude Agent'));
  assert.match(popup.querySelector('[data-testid="popup-model"]').textContent, /Claude Haiku/);
  assert.ok(button('Generate Message').querySelector('svg'));
  await click(popup.querySelector('[data-testid="popup-agent"] .toolbar-button'));
  selector = d.querySelector('.ij2499-selector-menu');
  await click([...selector.querySelectorAll('.popup-cell-adv-name')].find(el => el.textContent === 'Codex'));
  assert.ok(d.querySelector('.ij2499-options'), 'choosing agent keeps Commit Options open');
  assert.match(popup.querySelector('[data-testid="popup-model"]').textContent, /GPT-5/);
  assert.ok(popup.querySelector('[data-testid="popup-agent"] [data-agent="codex"]'), 'agent icon follows selected agent');
  await click(popup.querySelector('[data-testid="popup-model"] .toolbar-button'));
  selector = d.querySelector('.ij2499-selector-menu'); assert.ok(selector);
  assert.ok(selector.querySelector('[aria-checked="true"] .icon'), 'selected model has kit check icon');
  selector.querySelector('[role="menu"]').dispatchEvent(new w.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  await wait(25);
  selector.querySelector('[role="menu"]').dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await wait(25);
  assert.equal(popup.querySelector('[data-testid="popup-model"] .toolbar-button-text').textContent, 'GPT-5');
  assert.ok(!d.querySelector('.ij2499-selector-menu'));
  await click(popup.querySelector('[data-testid="popup-model"] .toolbar-button'));
  selector = d.querySelector('.ij2499-selector-menu');
  selector.querySelector('[role="menu"]').dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await wait(25);
  assert.ok(d.querySelector('.ij2499-options'), 'Escape dismisses selector without closing parent options');

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
  assert.ok(d.querySelector('.ij2499-status-error'), 'repeat generation uses the error path after previous success');
  await click(button('Retry')); await wait(3050);
  assert.match(message().value, /Обновить VisitController.java/); assert.match(message().value, /1\./); assert.match(message().value, /code-notes-v3-release/);
  const count = d.querySelectorAll('.commit-file-node').length;
  await click(button('Commit')); assert.equal(d.querySelectorAll('.commit-file-node').length, count - 1);
  assert.ok(button('Generate Message').disabled); assert.equal(message().value, '');
  assert.ok(!d.querySelector('.commit-success'), 'Commit does not add an inline success banner');

  w.history.replaceState(null, '', '?entry=commit&scenario=error'); w.mountCommit('error'); await wait(60);
  await edit(message(), 'Keep on failure'); await click(button('Generate Message')); await wait(3050);
  assert.equal(message().value, 'Keep on failure'); assert.ok(button('Retry'));
  assert.match(d.querySelector('.ij2499-status-error').textContent, /timed out/);
  await click(button('Continue in Chat'));
  assert.equal(w.chatRequests.length, 1);
  assert.equal(w.chatRequests[0].draft, 'Keep on failure');
  assert.equal(w.chatRequests[0].settings.prompt, 'numbered Russian $GIT_BRANCH_NAME');
  assert.ok(w.chatRequests[0].files.length > 0);
  assert.equal(message().value, 'Keep on failure');
  await click(button('Retry')); await wait(3050); assert.notEqual(message().value, 'Keep on failure');
  assert.ok(!d.querySelector('.ij2499-status'), 'successful Retry clears the error without adding a success row');
  assert.ok(!d.querySelector('.ij2499-settings-hint'), 'banner stays absent after remount and generation');
  await click(button('Commit Options')); assert.equal(d.querySelector('#popup-prompt').value, 'numbered Russian $GIT_BRANCH_NAME');
  w.mountCommit('scope', { id: 'visit-scope', name: 'Visit fix', files: [{ label: 'VisitController.java' }] }); await wait(60);
  assert.equal(d.querySelectorAll('.commit-file-node input:checked').length, 1);
  await edit(message(), 'Commit one scoped file'); await click(button('Commit'));
  assert.equal(d.querySelectorAll('.commit-file-node input:checked').length, 0);
  assert.ok(button('Generate Message').disabled, 'scoped commit must not recheck other files');
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
  console.log('PASS: full original V3 IDE and Commit entry; tree/diff action; checkbox gating; checked-file-only generation; cancellation/edit/selection races; error/retry; reference popup; agent/model; persistent shared Settings Apply/Cancel; branch context; scoped commit.');
})().catch(error => { console.error(error); process.exitCode = 1; });
