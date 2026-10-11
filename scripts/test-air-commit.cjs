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
async function checkBrowserLayout() {
  const { chromium } = require('playwright');
  const previewUrl = process.argv[process.argv.indexOf('--browser') + 1] || 'http://127.0.0.1:5189';
  const browser = await chromium.launch({ headless: true });
  const outputDir = path.join(root, 'test-results', 'air-commit');
  fs.mkdirSync(outputDir, { recursive: true });
  try {
    for (const viewport of [{ width: 1656, height: 1032 }, { width: 1386, height: 875 }, { width: 1000, height: 700 }]) {
      const page = await browser.newPage({ viewport });
      await page.goto(`${previewUrl}/?entry=commit&scenario=no-files`);
      await page.locator('.plan-diff-editor-area').waitFor();
      assert.ok(await page.locator('.commit-tool-window').isVisible(), 'Commit opens next to a regular editor diff');
      assert.equal(await page.locator('.aiux543-chat-editor-host').count(), 0, 'Commit entry starts with a diff instead of chat');
      assert.equal(await page.locator('.main-window-editor-tabs .tab-selected').innerText(), 'Diff VisitController.java');
      assert.equal(await page.locator('.main-window-editor-tabs').getByText('Diff VisitController.java', { exact: true }).count(), 1, 'Commit entry has one VisitController diff tab');
      assert.ok(await page.getByRole('button', { name: 'Generate Message', exact: true }).isDisabled(), 'opening a diff does not check files');
      await page.screenshot({ path: path.join(outputDir, `commit-diff-entry-${viewport.width}.png`) });
      const diffHeader = page.locator('.ij2499-commit-diff .plan-diff-toolbar-primary-row');
      assert.ok(await diffHeader.getByRole('button', { name: 'Go to Session', exact: true }).isVisible());
      assert.match(await diffHeader.locator('.plan-diff-viewing-file-count-link').innerText(), /^1\/\d+ files$/);
      const fileTotal = Number((await diffHeader.locator('.plan-diff-viewing-file-count-link').innerText()).match(/\/(\d+)/)[1]);
      assert.ok(fileTotal > 1, 'file count comes from the changed-file scope');
      const scopeField = diffHeader.locator('.ij2499-diff-scope .dropdown');
      const scopeGeometry = await scopeField.evaluate(el => {
        const style = getComputedStyle(el);
        return { height: el.getBoundingClientRect().height, border: style.borderColor, fontSize: getComputedStyle(el.querySelector('.dropdown-value')).fontSize, weight: getComputedStyle(el.querySelector('.dropdown-value')).fontWeight, chevronWidth: el.querySelector('.dropdown-chevron').getBoundingClientRect().width };
      });
      assert.equal(scopeGeometry.height, 30, 'kit field keeps its 28px interior plus border');
      assert.equal(scopeGeometry.chevronWidth, 28, 'kit dropdown chevron area');
      assert.equal(scopeGeometry.weight, '400');
      assert.equal(scopeGeometry.fontSize, '14px');
      await scopeField.click();
      const scopeMenu = diffHeader.locator('.ij2499-diff-scope .dropdown-menu');
      await scopeMenu.waitFor();
      const visibleScopeMenu = await scopeMenu.evaluate(el => {
        const rect = el.getBoundingClientRect();
        const last = el.lastElementChild.getBoundingClientRect();
        const target = document.elementFromPoint(last.left + last.width / 2, last.top + last.height / 2);
        return { fits: rect.left >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight, unclipped: el.contains(target) };
      });
      assert.ok(visibleScopeMenu.fits && visibleScopeMenu.unclipped, 'dark kit scope menu is visible outside the toolbar without clipping');
      await scopeMenu.screenshot({ path: path.join(outputDir, `diff-scope-menu-${viewport.width}.png`) });
      await page.keyboard.press('Escape');
      assert.equal(await scopeMenu.count(), 0);

      assert.ok(await diffHeader.getByRole('button', { name: 'Compare Previous File (⌥←)', exact: true }).isDisabled());
      if (viewport.width >= 1386) {
        const sessionRect = await diffHeader.getByRole('button', { name: 'Go to Session', exact: true }).boundingBox();
        const scopeRect = await diffHeader.locator('.ij2499-diff-scope .dropdown').boundingBox();
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
        await page.locator('.plan-diff-files-popup').getByText('application.properties', { exact: true }).click();
        await page.waitForFunction(() => document.querySelector('.main-window-editor-tabs .tab-selected')?.textContent.includes('application.properties'));
        await diffHeader.getByRole('button', { name: 'Compare Previous File (⌥←)', exact: true }).click();
        await diffHeader.locator('.ij2499-diff-scope .dropdown').click();
        await page.locator('.ij2499-diff-scope .dropdown-menu').getByText('Session Changes', { exact: true }).click();
        assert.equal(await diffHeader.locator('.plan-diff-viewing-file-count-link').innerText(), '1/4 files');
        await diffHeader.locator('.ij2499-diff-scope .dropdown').click();
        await page.locator('.ij2499-diff-scope .dropdown-menu').getByText('Branch Changes', { exact: true }).click();
        assert.equal(await diffHeader.locator('.plan-diff-viewing-file-count-link').innerText(), `1/${fileTotal} files`);
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
      assert.match(await header.locator('.aiux543-chat-project-branch').innerText(), /code-notes-v3-release/);
      assert.equal(await header.locator('.aiux543-chat-project-name, .aiux543-chat-project-icon, .aiux543-chat-header-all-changes-counts').count(), 0);
      assert.ok(await header.getByRole('button', { name: 'Open Branch Changes', exact: true }).isVisible());
      assert.ok(await header.getByRole('button', { name: 'Branch actions', exact: true }).isVisible());
      const hint = page.locator('.ij2499-settings-hint');
      await hint.waitFor();
      assert.equal(await hint.locator('.ij2499-hint-text').innerText(), 'Generate a commit message from selected changes. Customize generation in Air settings.');
      await page.evaluate(() => document.fonts.ready);
      const headerType = await header.evaluate(el => [...el.querySelectorAll('.aiux543-chat-project-branch, .toolbar-button-text')].map(n => {
        const style = getComputedStyle(n); return { size: style.fontSize, weight: style.fontWeight, color: style.color };
      }));
      assert.deepEqual(headerType, [{ size: '14px', weight: '400', color: 'rgb(159, 162, 168)' }, { size: '14px', weight: '400', color: 'rgb(159, 162, 168)' }]);
      await header.screenshot({ path: path.join(outputDir, `chat-header-${viewport.width}.png`) });
      const geometry = await hint.evaluate(el => {
        const rect = node => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
        const body = el;
        return { hint: rect(el), body: rect(body), content: rect(body.querySelector('.ij2499-hint-content')),
          button: rect(el.querySelectorAll('.link')[0]), link: rect(el.querySelectorAll('.link')[1]),
          generate: rect(document.querySelector('.ij2499-generate')), close: rect(el.querySelector('.ij2499-hint-close')) };
      });
      assert.ok(geometry.body.bottom >= geometry.content.bottom + 11, 'full content fits inside the tooltip body');
      for (const key of ['button', 'link', 'close']) {
        assert.ok(geometry[key].y >= geometry.body.y && geometry[key].bottom <= geometry.body.bottom, `${key} is not clipped`);
      }
      assert.ok(geometry.hint.y >= 8 && geometry.hint.bottom <= geometry.generate.y - 7, 'hint fits above Generate Message');
      assert.ok(geometry.hint.bottom <= viewport.height - 8, 'whole hint fits vertically inside the viewport');
      assert.ok(geometry.hint.x >= 8 && geometry.hint.right <= viewport.width - 8, 'hint fits within the viewport');
      const appearance = await hint.evaluate(el => ({ color: getComputedStyle(el).backgroundColor, radius: getComputedStyle(el).borderRadius }));
      assert.equal(appearance.radius, '8px');
      assert.equal(appearance.color, 'rgb(43, 45, 48)', 'reference dark card surface');
      assert.equal(await hint.locator('.got-it-corner, .got-it-button').count(), 0, 'reference uses text actions without a speech-bubble arrow or raised Got It');
      assert.ok(await hint.getByRole('button', { name: 'Got It', exact: true }).isVisible());
      assert.ok(await page.getByRole('button', { name: 'Generate Message', exact: true }).isDisabled());
      await page.screenshot({ path: path.join(outputDir, `hint-${viewport.width}.png`) });
      await hint.getByRole('button', { name: 'Air settings', exact: true }).click();
      const settings = page.getByRole('region', { name: 'Commit Message Generation', exact: true });
      await settings.waitFor();
      assert.ok(await settings.locator('[data-testid="settings-agent"]').isVisible());
      assert.ok(await settings.locator('[data-testid="settings-model"]').isVisible());
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
      assert.equal(await page.locator('.ij2499-settings-hint').count(), 0, 'acknowledged hint stays dismissed after reload');
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
    const restartedHint = returningPage.locator('.ij2499-settings-hint');
    await restartedHint.waitFor();
    assert.equal(await returningPage.evaluate(() => localStorage.getItem('ijai2499:petclinic:air:v1')), savedPreferences, 'new demo clears only onboarding, preserving agent/model/prompt');
    await returningPage.screenshot({ path: path.join(outputDir, 'onboarding-restart.png') });
    await restartedHint.getByRole('button', { name: 'Got It', exact: true }).click();
    const commitStripe = returningPage.locator('.main-window-stripe-left [title="Commit"]').first();
    await commitStripe.click();
    await commitStripe.click();
    await returningPage.locator('.ij2499-gear').waitFor();
    assert.equal(await restartedHint.count(), 0, 'reopening Commit in the same demo does not repeat Got It');
    await returningPage.reload();
    await restartedHint.waitFor();
    assert.equal(await returningPage.evaluate(() => localStorage.getItem('ijai2499:petclinic:air:v1')), savedPreferences);
    await restartedHint.getByRole('button', { name: 'Dismiss tip', exact: true }).click();
    assert.equal(await restartedHint.count(), 0, 'reference close action dismisses onboarding');
    await returningPage.reload();
    await restartedHint.waitFor();
    await returningPage.keyboard.press('Escape');
    assert.equal(await restartedHint.count(), 0, 'Escape dismisses onboarding');
    await returningPage.close();
    console.log('PASS: returning-user onboarding reset, dismissal within a run and preserved preferences; Chromium at 1656×1032, 1386×875, 1000×700; Commit diff header, file navigation/popup, branch/session scope, Go to Session, changed-row focus, split/unified, standard scope dropdown and unclipped menu; dark reference Got It with links/close above Generate Message; prompt spacing; bottom Settings link; global Settings section, selectors, Apply/Cancel, persistence and generation invalidation.');
  } finally { await browser.close(); }
}
(async () => {
  if (process.argv.includes('--browser')) { await checkBrowserLayout(); return; }
  const build = await esbuild.build({
    stdin: { contents: `import React from 'react'; import { createRoot } from 'react-dom/client';
      import { ThemeProvider } from '@jetbrains/int-ui-kit';
      import App, { CommitToolWindow } from './src/App.jsx'; window.React = React;
      window.openedFiles = []; const root = createRoot(document.getElementById('root'));
      window.mountCommit = (key, scopeRequest = null) => root.render(<ThemeProvider defaultTheme="dark"><CommitToolWindow key={key} scopeRequest={scopeRequest}
        ctx={{ focusedPanel: 'left', setFocusedPanel() {}, setShowLeftPanel() {} }} onOpenFile={file => window.openedFiles.push(file)} /></ThemeProvider>);
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
  assert.ok(button('Generate Message').querySelector('svg'), 'kit generation icon exists');
  assert.ok(button('Generate Message').disabled);
  let hint = d.querySelector('.ij2499-settings-hint'); assert.ok(hint, 'hint appears on first Commit opening before files are checked or generation starts');
  assert.match(hint.textContent, /Generate a commit message from selected changes\. Customize generation in Air settings\./);
  assert.notEqual(hint.parentElement.style.left, '', 'hint is positioned after the initial generation ref is attached');
  await click(button('Got It', hint));
  assert.equal(w.localStorage.getItem('ijai2499:petclinic:air:settings-hint:v1'), 'seen');
  w.mountCommit('acknowledged'); await wait(60);
  assert.ok(!d.querySelector('.ij2499-settings-hint'), 'Got It stays dismissed when Commit reopens');
  w.localStorage.removeItem('ijai2499:petclinic:air:settings-hint:v1');
  w.mountCommit('first-settings-entry'); await wait(60);
  hint = d.querySelector('.ij2499-settings-hint'); assert.ok(hint);
  await click(button('Air settings', hint));
  assert.ok(d.querySelector('#settings-prompt'), 'first-opening tip opens real generation settings before generation');
  assert.ok(d.querySelector('[data-testid="settings-agent"]'));
  assert.ok(d.querySelector('[data-testid="settings-model"]'));
  assert.ok(!d.querySelector('.ij2499-settings-hint'));
  await click(button('Cancel', d.querySelector('[aria-modal="true"]')));
  assert.equal(w.localStorage.getItem('ijai2499:petclinic:air:settings-hint:v1'), 'seen');
  assert.ok(button('Generate Message').disabled);
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
  assert.equal(selector.querySelector('[aria-checked="true"]').textContent.trim(), 'JunieDefault');
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
  assert.match(popup.querySelector('[data-testid="popup-model"]').textContent, /GPT-5 mini/);
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
  assert.match(message().value, /Обновить VisitController.java/); assert.match(message().value, /1\./); assert.match(message().value, /code-notes-v3-release/);
  const count = d.querySelectorAll('.commit-file-node').length;
  await click(button('Commit')); assert.equal(d.querySelectorAll('.commit-file-node').length, count - 1);
  assert.ok(button('Generate Message').disabled); assert.equal(message().value, '');
  assert.match(d.querySelector('.commit-success').textContent, /1 selected file committed/);

  w.history.replaceState(null, '', '?entry=commit&scenario=error'); w.mountCommit('error'); await wait(60);
  await edit(message(), 'Keep on failure'); await click(button('Generate Message')); await wait(3050);
  assert.equal(message().value, 'Keep on failure'); assert.ok(button('Retry'));
  await click(button('Retry')); await wait(3050); assert.notEqual(message().value, 'Keep on failure');
  assert.ok(!d.querySelector('.ij2499-status'), 'successful Retry clears the error without adding a success row');
  assert.ok(!d.querySelector('.ij2499-settings-hint'), 'acknowledged hint stays dismissed after remount and generation');
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
