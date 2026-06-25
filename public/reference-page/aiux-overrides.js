(() => {
  const SPEC_LABELS = new Set(['Spec .md', 'New spec.md', 'New spec']);
  const START_SPEC_OPTIONS = ['Specify Spec', 'Edit Spec'];
  const PROJECT_SPEC_FILES = ['Visit-Booking.md', 'Vet-Schedules.md'];
  let activeStartSpecOption = START_SPEC_OPTIONS[0];
  let startSpecPopup = null;
  let startSpecAnchor = null;

  function patchSpecLabels(root = document) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];

    while (walker.nextNode()) {
      nodes.push(walker.currentNode);
    }

    for (const node of nodes) {
      const value = node.nodeValue?.trim();
      if (SPEC_LABELS.has(value)) {
        node.nodeValue = node.nodeValue.replace(value, 'Spec Mode');
      }
    }
  }

  function getStartSpecButton(from = document) {
    return Array.from(from.querySelectorAll('.ux3730-aia-flow-v2-start-chat')).find((button) =>
      button.dataset.aiuxStartSpec === 'true' || button.textContent?.includes('Start .md Spec'),
    );
  }

  function patchStartSpecButtons(root = document) {
    for (const button of root.querySelectorAll?.('.ux3730-aia-flow-v2-start-chat') ?? []) {
      if (button.dataset.aiuxStartSpec !== 'true' && !button.textContent?.includes('Start .md Spec')) {
        continue;
      }

      button.dataset.aiuxStartSpec = 'true';
      button.setAttribute('aria-haspopup', 'menu');
      button.setAttribute('aria-expanded', String(button === startSpecAnchor && Boolean(startSpecPopup)));

      const label = button.querySelector('span:first-child');
      if (label && label.textContent !== activeStartSpecOption) {
        label.textContent = activeStartSpecOption;
      }
    }
  }

  function escapeHtml(value = '') {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  async function loadProjectSpec(fileName) {
    const response = await fetch(`./specifications/${encodeURIComponent(fileName)}`);
    if (!response.ok) {
      throw new Error(`Unable to load ${fileName}: ${response.status}`);
    }

    return response.text();
  }

  function setSelectedProjectSpecRow(fileName) {
    document.querySelectorAll('.aiux-project-spec-row.selected').forEach((selectedRow) => {
      selectedRow.classList.remove('selected');
    });
    document.querySelector(`.aiux-project-spec-row[data-aiux-project-spec="${CSS.escape(fileName)}"]`)?.classList.add('selected');
  }

  function getEditorContentHost() {
    return document.querySelector('.main-window-editor-content');
  }

  function ensureSpecEditorOverlay() {
    const host = getEditorContentHost();
    if (!host) {
      return null;
    }

    let overlay = host.querySelector(':scope > .aiux-project-spec-editor');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'aiux-project-spec-editor';
      host.appendChild(overlay);
    }

    return overlay;
  }

  function parseAgentMarkdown(content = '') {
    const lines = content.split(/\r?\n/);
    const titleLine = lines.find((line) => line.trim().startsWith('# ')) ?? '# Specification';
    const title = titleLine.replace(/^#\s+/, '').trim();
    const sections = [];
    let current = null;

    for (const rawLine of lines) {
      const line = rawLine.trimEnd();
      const heading = line.match(/^##\s+(.+)$/);
      if (heading) {
        current = { title: heading[1].trim(), items: [] };
        sections.push(current);
        continue;
      }

      if (!current || line.trim() === '' || line.trim().startsWith('# ')) {
        continue;
      }

      const check = line.match(/^-\s+\[\s*]\s+(.+)$/);
      if (check) {
        current.items.push({ type: 'check', text: check[1].trim() });
        continue;
      }

      const bullet = line.match(/^-\s+(.+)$/);
      if (bullet) {
        current.items.push({ type: 'bullet', text: bullet[1].trim() });
        continue;
      }

      current.items.push({ type: 'paragraph', text: line.trim() });
    }

    return { title, sections };
  }

  function renderAgentMarkdownItem(item, index) {
    if (item.type === 'check') {
      return `
        <div class="aiux-agent-md-row aiux-agent-md-check-row">
          <span class="aiux-agent-md-check" aria-hidden="true"></span>
          <span class="aiux-agent-md-text">${escapeHtml(item.text)}</span>
          <button type="button" class="aiux-agent-md-row-run" aria-label="Run item ${index + 1}">
            <span>Run</span>
          </button>
        </div>
      `;
    }

    if (item.type === 'bullet') {
      return `
        <div class="aiux-agent-md-row aiux-agent-md-bullet-row">
          <span class="aiux-agent-md-bullet" aria-hidden="true"></span>
          <span class="aiux-agent-md-text">${escapeHtml(item.text)}</span>
        </div>
      `;
    }

    return `
      <p class="aiux-agent-md-paragraph">${escapeHtml(item.text)}</p>
    `;
  }

  function renderAgentMarkdown(fileName, content) {
    const parsed = parseAgentMarkdown(content);
    const isVisitBooking = fileName.toLowerCase() === 'visit-booking.md';
    const prompt = isVisitBooking
      ? 'Create a spec for visit booking in PetClinic based on prd.md'
      : 'Define vet schedules for PetClinic visit booking availability checks';

    return `
      <div class="aiux-agent-md-shell">
        <div class="aiux-agent-md-toolbar">
          <div class="aiux-agent-md-toolbar-left">
            <span class="aiux-agent-md-agent-dot" aria-hidden="true">✦</span>
            <div class="aiux-agent-md-prompt">
              <span class="aiux-agent-md-prompt-label">Prompt</span>
              <span class="aiux-agent-md-prompt-text">${escapeHtml(prompt)}</span>
            </div>
          </div>
          <div class="aiux-agent-md-toolbar-actions">
            <button type="button">Enhance</button>
            <button type="button" class="primary">Run</button>
          </div>
        </div>
        <div class="aiux-agent-md-content" data-agent-md-file="${escapeHtml(fileName)}">
          <div class="aiux-agent-md-head">
            <span class="aiux-agent-md-file-mark" aria-hidden="true">MD</span>
            <h1>${escapeHtml(parsed.title)}</h1>
            <span class="aiux-agent-md-state">Ready</span>
          </div>
          ${parsed.sections.map((section) => `
            <section class="aiux-agent-md-section">
              <header class="aiux-agent-md-section-header">
                <h2>${escapeHtml(section.title)}</h2>
                ${section.items.some((item) => item.type === 'check') ? '<span class="aiux-agent-md-section-meta">0 checked</span>' : ''}
              </header>
              <div class="aiux-agent-md-section-body">
                ${section.items.map((item, index) => renderAgentMarkdownItem(item, index)).join('')}
              </div>
            </section>
          `).join('')}
        </div>
      </div>
    `;
  }

  function renderSpecEditor(fileName, content) {
    const overlay = ensureSpecEditorOverlay();
    if (!overlay) {
      return;
    }

    overlay.dataset.aiuxOpenSpec = fileName;
    overlay.innerHTML = renderAgentMarkdown(fileName, content);
    overlay.classList.add('open');
  }

  function markdownTabIconSvg() {
    return `
      <svg width="16" height="16" viewBox="0 0 16 16" class="icon tab-icon aiux-project-spec-tab-icon" aria-hidden="true" focusable="false">
        <path d="M3 1.5h7.2L13 4.3V14a.5.5 0 0 1-.5.5h-9A.5.5 0 0 1 3 14V1.5Z" fill="#33353B" stroke="#6B6F78"></path>
        <path d="M10 1.5V4a.5.5 0 0 0 .5.5H13" fill="none" stroke="#6B6F78"></path>
        <path d="M4.7 10.8V6.2h1.1l1.1 2.7 1.1-2.7h1.1v4.6h-.9V7.9l-1 2.5h-.7l-1-2.5v2.9h-.9Zm5.5 0V6.2h.9v3.7h1.6v.9h-2.5Z" fill="#CED0D6"></path>
      </svg>
    `;
  }

  function closeSpecEditor(fileName = null) {
    const overlay = document.querySelector('.aiux-project-spec-editor');
    if (overlay && (!fileName || overlay.dataset.aiuxOpenSpec === fileName)) {
      overlay.classList.remove('open');
      delete overlay.dataset.aiuxOpenSpec;
    }

    if (fileName) {
      document.querySelector(`.tab-bar-tab[data-aiux-spec-tab="${CSS.escape(fileName)}"]`)?.closest('.tab-wrapper')?.remove();
    }

    document.querySelectorAll('.aiux-project-spec-row.selected').forEach((selectedRow) => {
      selectedRow.classList.remove('selected');
    });
    document.querySelectorAll('.tab-bar-tab[data-aiux-spec-tab].tab-selected').forEach((tab) => {
      tab.classList.remove('tab-selected', 'tab-selected-active');
      tab.classList.add('tab-default');
    });
  }

  function selectSpecTab(fileName) {
    document.querySelectorAll('.tab-bar-tab').forEach((tab) => {
      tab.classList.remove('tab-selected', 'tab-selected-active');
      tab.classList.add('tab-default');
    });

    const tab = document.querySelector(`.tab-bar-tab[data-aiux-spec-tab="${CSS.escape(fileName)}"]`);
    if (tab) {
      tab.classList.remove('tab-default');
      tab.classList.add('tab-selected', 'tab-selected-active');
    }
  }

  function ensureSpecTab(fileName) {
    const tabBar = document.querySelector('.tab-bar');
    if (!tabBar) {
      return;
    }

    if (tabBar.querySelector(`.tab-bar-tab[data-aiux-spec-tab="${CSS.escape(fileName)}"]`)) {
      return;
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'tab-wrapper aiux-project-spec-tab-wrapper';
    wrapper.innerHTML = `
      <button class="tab tab-default tab-bar-tab aiux-project-spec-tab" draggable="false" data-aiux-spec-tab="${escapeHtml(fileName)}" data-drag-active="false" aria-grabbed="false">
        ${markdownTabIconSvg()}
        <span class="tab-label text-ui-default">${escapeHtml(fileName)}</span>
        <span class="tab-close" role="button" aria-label="Close ${escapeHtml(fileName)}">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" class="icon ">
            <path fill-rule="evenodd" clip-rule="evenodd" d="M11.4939 4.48784C11.3002 4.28007 10.9724 4.27548 10.7729 4.47775L8.00074 7.28849L5.22871 4.47788C5.02922 4.27561 4.70143 4.2802 4.50768 4.48797C4.32506 4.68382 4.32933 4.98882 4.51736 5.17947L7.29908 7.99991L4.51756 10.8201C4.32953 11.0108 4.32526 11.3158 4.50788 11.5116C4.70163 11.7194 5.02942 11.724 5.22892 11.5217L8.00074 8.71133L10.7727 11.5219C10.9722 11.7241 11.3 11.7196 11.4937 11.5118C11.6764 11.3159 11.6721 11.0109 11.4841 10.8203L8.70241 7.99991L11.4843 5.17934C11.6723 4.98869 11.6765 4.68369 11.4939 4.48784Z" fill="#AFB1B8"></path>
          </svg>
        </span>
      </button>
    `;
    tabBar.appendChild(wrapper);
  }

  async function openProjectSpec(fileName) {
    setSelectedProjectSpecRow(fileName);
    ensureSpecTab(fileName);
    selectSpecTab(fileName);

    try {
      const content = await loadProjectSpec(fileName);
      renderSpecEditor(fileName, content);
    } catch (error) {
      renderSpecEditor(fileName, `# ${fileName}\n\nUnable to load specification content.\n\n${error.message}`);
    }
  }

  function markdownIconSvg() {
    return `
      <svg class="aiux550-project-icon aiux-project-spec-icon" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <path d="M3 1.5h7.2L13 4.3V14a.5.5 0 0 1-.5.5h-9A.5.5 0 0 1 3 14V1.5Z" fill="#33353B" stroke="#6B6F78"/>
        <path d="M10 1.5V4a.5.5 0 0 0 .5.5H13" fill="none" stroke="#6B6F78"/>
        <path d="M4.7 10.8V6.2h1.1l1.1 2.7 1.1-2.7h1.1v4.6h-.9V7.9l-1 2.5h-.7l-1-2.5v2.9h-.9Zm5.5 0V6.2h.9v3.7h1.6v.9h-2.5Z" fill="#CED0D6"/>
      </svg>
    `;
  }

  function createProjectSpecsSection() {
    const section = document.createElement('div');
    section.className = 'aiux-project-specs-section';
    section.dataset.aiuxProjectSpecs = 'true';
    section.innerHTML = `
      <div class="aiux-project-specs-list">
        ${PROJECT_SPEC_FILES.map(
          (file) => `
            <button type="button" class="aiux550-project-row aiux-project-spec-row" style="--level: 0" data-aiux-project-spec="${file}">
              <span class="aiux550-project-row-bg" aria-hidden="true"></span>
              <span class="aiux550-project-chevron" aria-hidden="true"></span>
              ${markdownIconSvg()}
              <span class="aiux550-project-label"><span>${file}</span></span>
            </button>
          `,
        ).join('')}
      </div>
      <div class="aiux-project-specs-separator" role="separator" aria-hidden="true"></div>
    `;

    section.addEventListener('click', (event) => {
      const row = event.target.closest?.('.aiux-project-spec-row');
      if (!row) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      openProjectSpec(row.dataset.aiuxProjectSpec);
    });

    return section;
  }

  function patchProjectSpecsSection(root = document) {
    const tree = root.querySelector?.('.aiux550-project-tree') ?? document.querySelector('.aiux550-project-tree');
    if (!tree || tree.querySelector('[data-aiux-project-specs="true"]')) {
      return;
    }

    const aiSessions = tree.querySelector('.aiux550-ai-sessions');
    if (!aiSessions) {
      return;
    }

    aiSessions.insertAdjacentElement('afterend', createProjectSpecsSection());
  }

  function closeStartSpecPopup() {
    startSpecPopup?.remove();
    startSpecPopup = null;
    startSpecAnchor?.classList.remove('aiux-start-spec-open');
    startSpecAnchor?.setAttribute('aria-expanded', 'false');
    startSpecAnchor = null;
  }

  function positionStartSpecPopup(anchor) {
    if (!startSpecPopup || !anchor?.isConnected) {
      closeStartSpecPopup();
      return;
    }

    const rect = anchor.getBoundingClientRect();
    startSpecPopup.style.left = `${Math.round(rect.left)}px`;
    startSpecPopup.style.top = `${Math.round(rect.bottom + 6)}px`;
    startSpecPopup.style.minWidth = `${Math.round(rect.width)}px`;
  }

  function renderStartSpecPopup(anchor) {
    closeStartSpecPopup();

    startSpecAnchor = anchor;
    startSpecAnchor.classList.add('aiux-start-spec-open');
    startSpecAnchor.setAttribute('aria-haspopup', 'menu');
    startSpecAnchor.setAttribute('aria-expanded', 'true');

    startSpecPopup = document.createElement('div');
    startSpecPopup.className = 'aiux-start-spec-popup';
    startSpecPopup.setAttribute('role', 'menu');
    startSpecPopup.setAttribute('aria-label', 'Start Spec options');

    for (const option of START_SPEC_OPTIONS) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'aiux-start-spec-popup-item';
      item.setAttribute('role', 'menuitemradio');
      item.setAttribute('aria-checked', String(option === activeStartSpecOption));
      item.textContent = option;
      item.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        activeStartSpecOption = option;
        patchStartSpecButtons();
        closeStartSpecPopup();
      });
      startSpecPopup.appendChild(item);
    }

    startSpecPopup.addEventListener('pointerdown', (event) => event.stopPropagation());
    startSpecPopup.addEventListener('click', (event) => event.stopPropagation());

    document.body.appendChild(startSpecPopup);
    positionStartSpecPopup(anchor);
  }

  function toggleStartSpecPopup(anchor) {
    if (startSpecPopup && startSpecAnchor === anchor) {
      closeStartSpecPopup();
      return;
    }

    renderStartSpecPopup(anchor);
  }

  function applyPatch() {
    patchSpecLabels();
    patchStartSpecButtons();
    patchProjectSpecsSection();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyPatch, { once: true });
  } else {
    applyPatch();
  }

  new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'characterData') {
        const value = mutation.target.nodeValue?.trim();
        if (SPEC_LABELS.has(value)) {
          mutation.target.nodeValue = mutation.target.nodeValue.replace(value, 'Spec Mode');
        }
      }

      for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.TEXT_NODE) {
          const value = node.nodeValue?.trim();
          if (SPEC_LABELS.has(value)) {
            node.nodeValue = node.nodeValue.replace(value, 'Spec Mode');
          }
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          patchSpecLabels(node);
          patchStartSpecButtons(node);
          patchProjectSpecsSection(node);
        }
      }
    }

    patchStartSpecButtons();
    patchProjectSpecsSection();

    if (startSpecPopup && !getStartSpecButton()) {
      closeStartSpecPopup();
    }
  }).observe(document.documentElement, { childList: true, characterData: true, subtree: true });

  document.addEventListener(
    'click',
    (event) => {
      const startSpecButton = event.target.closest?.('.ux3730-aia-flow-v2-start-chat');
      if (
        startSpecButton?.dataset.aiuxStartSpec === 'true' ||
        startSpecButton?.textContent?.includes('Start .md Spec')
      ) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        patchStartSpecButtons();
        toggleStartSpecPopup(startSpecButton);
        return;
      }

      if (!event.target.closest?.('.aiux-start-spec-popup')) {
        closeStartSpecPopup();
      }
    },
    true,
  );

  document.addEventListener(
    'click',
    (event) => {
      const specTab = event.target.closest?.('.tab-bar-tab[data-aiux-spec-tab]');
      if (specTab) {
        event.preventDefault();
        event.stopPropagation();
        const fileName = specTab.dataset.aiuxSpecTab;
        if (event.target.closest('.tab-close')) {
          closeSpecEditor(fileName);
          document.querySelector('.tab-bar-tab:not([data-aiux-spec-tab])')?.click();
          return;
        }

        openProjectSpec(fileName);
        return;
      }

      if (event.target.closest?.('.tab-bar-tab:not([data-aiux-spec-tab])')) {
        closeSpecEditor();
      }
    },
    true,
  );

  window.addEventListener('resize', () => positionStartSpecPopup(startSpecAnchor));
  window.addEventListener('scroll', () => positionStartSpecPopup(startSpecAnchor), true);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeStartSpecPopup();
    }
  });
})();
