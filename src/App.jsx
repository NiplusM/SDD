import { Fragment, cloneElement, isValidElement, forwardRef, useState, useRef, useEffect, useLayoutEffect, useCallback, useId, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { WelcomeProjectsPanel, WelcomeGradientArea } from './WelcomeScreen.jsx';
import {
  PlanDiffEditorArea,
  tokenizeCodeFragment,
  arePlanDiffUiStatesEqual,
  normalizePlanDiffUiState,
  DiffInlineCommentPopup,
  PlanDiffCommentBadge,
} from './PlanDiffView.jsx';
import { AiChatAgentIcon, AiChatClaudeIcon, AiChatCodexIcon, AiChatListLeading } from './AiChatListParts.jsx';
import {
  ThemeProvider,
  MainWindow,
  CommitWindow,
  MainToolbar,
  MainToolbarIconButton,
  Banner,
  SettingsDialog,
  ToolWindow,
  PositionedPopup,
  Popup,
  PopupCell,
  Tooltip,
  Loader,
  Icon,
  IconButton,
  Button,
  Input,
  Checkbox,
  Badge,
  SegmentedControl,
  Tree,
  TreeNode,
  Search,
  getIcon,
  DEFAULT_EDITOR_TABS,
  DEFAULT_EDITOR_TAB_CONTENTS,
  DEFAULT_LEFT_STRIPE_ITEMS,
  DEFAULT_RIGHT_STRIPE_ITEMS,
  DEFAULT_PROJECT_TREE_DATA,
  DEFAULT_SETTINGS_TREE_ITEMS,
  defaultLeftPanelContent,
  defaultRightPanelContent,
  defaultBottomPanelContent,
} from '@jetbrains/int-ui-kit';
import { EditorSelectionToolbar } from './EditorSelectionToolbar.jsx';
import './App.css';

// ─── Data ────────────────────────────────────────────────────────────────────

const PROJECT_NAME = 'commons-math';
const PROJECT_ROOT_PATH_DISPLAY = '~/commons-math';
const BRANCH_NAME = 'main';
const RUN_CONFIGURATION_NAME = 'PetClinicApplication';
const PRIMARY_BREADCRUMBS = [PROJECT_NAME, 'src/main/java', 'AccurateMath'];
const TOOLBAR_INPUT_IS_EDITABLE = false;
const ATTACHED_FILES_SYNC_WITH_EDITOR = false;
const DIFF_TAB_ICON_NAME = 'vcs/diff';
const INITIAL_PLAN_DIFF_SOURCE_TAB_ID = '1';
const INITIAL_PLAN_DIFF_TAB_ID = buildPlanDiffTabId(INITIAL_PLAN_DIFF_SOURCE_TAB_ID);
const AIUX_NEW_SESSION_TAB_ID = 'aiux-new-session';
const CHATS_HISTORY_TOOL_WINDOW_ID = 'agents';
const AGENT_TASK_LOADING_STATE_ENABLED = true;
const AGENT_TASK_GENERATING_STATE_ENABLED = true;
const AGENT_TASK_USES_INTERMEDIATE_STATES =
  AGENT_TASK_LOADING_STATE_ENABLED || AGENT_TASK_GENERATING_STATE_ENABLED;
const AGENT_TASK_LOADING_STEP_DELAY_MS = 1200;
const AGENT_TASK_CONTENT_MORPH_MAX_FRAMES = 24;
const AGENT_TASK_CONTENT_MORPH_INLINE_MAX_FRAMES = 18;
const AGENT_TASK_CONTENT_MORPH_STEP_DELAY_MS = 36;
const SPEC_DONE_SCROLL_SELECTOR = '.spec-done-scroll[data-overlay-scroll-body="true"]';

function getSpecDoneScrollElement() {
  if (typeof document === 'undefined') return null;
  return document.querySelector(SPEC_DONE_SCROLL_SELECTOR);
}

function captureSpecDoneScrollSnapshot() {
  const scrollElement = getSpecDoneScrollElement();
  if (!scrollElement) return null;

  return {
    scrollTop: scrollElement.scrollTop,
    scrollLeft: scrollElement.scrollLeft,
  };
}

function scheduleSpecDoneScrollRestore(snapshot) {
  if (!snapshot) return;

  const restore = () => {
    const scrollElement = getSpecDoneScrollElement();
    if (!scrollElement) return;

    scrollElement.scrollTop = snapshot.scrollTop;
    scrollElement.scrollLeft = snapshot.scrollLeft ?? 0;
  };

  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => requestAnimationFrame(restore));
    return;
  }

  setTimeout(restore, 0);
}

function getSpecLinkKeys(item) {
  if (typeof item === 'string') return [item];
  if (!item || typeof item !== 'object') return [];
  return [item.id, item.label].filter((value, index, keys) => (
    typeof value === 'string' && value.length > 0 && keys.indexOf(value) === index
  ));
}

function addSpecLinkToChatChildren(children = [], specLink = null) {
  if (!specLink?.label && !specLink?.id) return Array.isArray(children) ? children : [];
  const nextChildren = Array.isArray(children) ? [...children] : [];
  const specChildIndex = nextChildren.findIndex((child) => child?.id === 'specs');
  const nextItem = {
    ...(specLink.id ? { id: specLink.id } : {}),
    ...(specLink.label ? { label: specLink.label } : {}),
  };
  const hasSameSpec = (item) => {
    const keys = getSpecLinkKeys(item);
    return (
      (nextItem.id && keys.includes(nextItem.id))
      || (nextItem.label && keys.includes(nextItem.label))
    );
  };

  if (specChildIndex >= 0) {
    const specsChild = nextChildren[specChildIndex];
    const items = Array.isArray(specsChild.items) ? specsChild.items : [];
    if (items.some(hasSameSpec)) return nextChildren;
    nextChildren[specChildIndex] = {
      ...specsChild,
      items: [...items, nextItem],
    };
    return nextChildren;
  }

  return [
    ...nextChildren,
    { id: 'specs', label: 'Specs', items: [nextItem] },
  ];
}

function ReferenceMainToolbarNewChatPicker({
  onNewChat = null,
  onNewSpec = null,
  onNewTerminal = null,
  aiMode = 'chat',
  onAiModeChange = null,
  selectedSpecTemplateId = 'feature',
  onSpecTemplateChange = null,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState({ top: 0, left: 0 });
  const [selectedChatId, setSelectedChatId] = useState('codex-chat');
  const [selectedTerminalId, setSelectedTerminalId] = useState('claude-cli');
  const rootRef = useRef(null);
  const chevronRef = useRef(null);
  const activeTabId = aiMode;
  const setActiveTabId = onAiModeChange ?? (() => {});
  const setSelectedSpecTemplateId = onSpecTemplateChange ?? (() => {});

  const activeConfig = activeTabId === 'spec'
    ? { actionLabel: 'New-Spec.md', icon: <IconMdTask /> }
    : activeTabId === 'terminal'
    ? { actionLabel: 'New Terminal', icon: <AiChatClaudeIcon /> }
    : { actionLabel: 'New Chat', icon: <AiChatCodexIcon /> };

  const updateMenuPosition = useCallback(() => {
    const anchor = chevronRef.current ?? rootRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const width = Math.min(403, window.innerWidth - 16);
    const left = Math.min(Math.max(8, rect.right - width), Math.max(8, window.innerWidth - width - 8));
    setMenuStyle({ top: rect.bottom + 4, left });
  }, []);

  useEffect(() => {
    if (!isOpen) return undefined;
    updateMenuPosition();

    const handlePointerDown = (event) => {
      if (rootRef.current?.contains(event.target)) return;
      setIsOpen(false);
    };

    document.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('resize', updateMenuPosition);
    window.addEventListener('scroll', updateMenuPosition, true);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('resize', updateMenuPosition);
      window.removeEventListener('scroll', updateMenuPosition, true);
    };
  }, [isOpen, updateMenuPosition]);

  const handlePrimaryClick = () => {
    setIsOpen(false);
    if (activeTabId === 'spec') {
      onNewSpec?.({ templateId: selectedSpecTemplateId });
      return;
    }
    if (activeTabId === 'terminal') {
      onNewTerminal?.();
      return;
    }
    onNewChat?.();
  };

  return (
    <div className="aiux543-new-chat-dropdown" ref={rootRef}>
      <button className="aiux543-new-chat-main" type="button" onClick={handlePrimaryClick}>
        {activeConfig.icon}
        <span>{activeConfig.actionLabel}</span>
      </button>
      <button
        ref={chevronRef}
        className={`aiux543-new-chat-chevron ${isOpen ? 'open' : ''}`}
        type="button"
        aria-label="AI Mode"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => {
          if (!isOpen) updateMenuPosition();
          setIsOpen((prev) => !prev);
        }}
      >
        <Icon name="general/chevronDown" size={16} />
      </button>
      {isOpen ? (
        <div className="aiux543-new-chat-menu-wrap" style={menuStyle}>
          <ReferenceNewChatMenu
            activeTabId={activeTabId}
            selectedChatId={selectedChatId}
            selectedTerminalId={selectedTerminalId}
            selectedSpecTemplateId={selectedSpecTemplateId}
            onTabChange={setActiveTabId}
            onChatItemSelect={setSelectedChatId}
            onTerminalItemSelect={setSelectedTerminalId}
            onSpecTemplateSelect={setSelectedSpecTemplateId}
          />
        </div>
      ) : null}
    </div>
  );
}

function ReferenceNewChatMenu({
  activeTabId,
  selectedChatId,
  selectedTerminalId,
  selectedSpecTemplateId,
  onTabChange,
  onChatItemSelect,
  onTerminalItemSelect,
  onSpecTemplateSelect,
}) {
  const chatItems = [
    { id: 'codex-chat', label: 'AI Assistant', icon: <AiChatCodexIcon /> },
    { id: 'claude-chat', label: 'Claude', icon: <AiChatClaudeIcon /> },
  ];
  const terminalItems = [
    { id: 'claude-cli', label: 'Claude Code', icon: <AiChatClaudeIcon /> },
    { id: 'codex-cli', label: 'Codex', icon: <AiChatCodexIcon /> },
    { id: 'junie', label: 'Junie', hint: 'by JetBrains', icon: <AiChatAgentIcon icon="junie" /> },
  ];
  const specTemplateItems = [
    { id: 'bug-fix', label: 'Bug Fix', icon: <BugFixSpecTemplateIcon /> },
    { id: 'feature', label: 'Feature', icon: <FeatureSpecTemplateIcon /> },
  ];

  return (
    <div className="aiux543-new-chat-menu" role="menu">
      <div className="aiux543-new-chat-menu-space" />
      <div className="aiux543-new-chat-tabs" role="tablist" aria-label="AI Mode">
        {[
          { id: 'chat', label: 'Chat', icon: <Icon name="aiAssistant/toolWindowChat" size={20} /> },
          { id: 'terminal', label: 'Terminal', icon: <Icon name="toolwindows/terminal" size={20} /> },
          { id: 'spec', label: 'Spec Mode', icon: <IconMdTask /> },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTabId === tab.id}
            className={`aiux543-new-chat-tab${activeTabId === tab.id ? ' active' : ''}`}
            onClick={() => onTabChange(tab.id)}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>
      <div className="aiux543-new-chat-separator" />
      {activeTabId === 'chat' ? (
        <div className="aiux543-new-chat-entry-list">
          <div className="aiux543-new-chat-menu-label">Chat</div>
          {chatItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`aiux543-new-chat-entry-row${selectedChatId === item.id ? ' selected' : ''}`}
              onClick={() => onChatItemSelect(item.id)}
            >
              <span className="aiux543-new-chat-entry-icon">{item.icon}</span>
              <span className="aiux543-new-chat-entry-title">{item.label}</span>
              {selectedChatId === item.id ? <Icon name="general/checkmark" size={16} className="aiux543-new-chat-check" /> : null}
            </button>
          ))}
        </div>
      ) : null}
      {activeTabId === 'terminal' ? (
        <div className="aiux543-new-chat-terminal-section">
          <div className="aiux543-new-chat-menu-label">Terminal Agents</div>
          <div className="aiux543-new-chat-terminal-agents">
            {terminalItems.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`aiux543-new-chat-entry-row aiux543-new-chat-terminal-agent${selectedTerminalId === item.id ? ' selected' : ''}`}
                onClick={() => onTerminalItemSelect(item.id)}
              >
                <span className="aiux543-new-chat-entry-icon">{item.icon}</span>
                <span className="aiux543-new-chat-entry-title">
                  <span>{item.label}</span>
                  {item.hint ? <span className="aiux543-new-chat-entry-hint">{item.hint}</span> : null}
                </span>
                {selectedTerminalId === item.id ? <Icon name="general/checkmark" size={16} className="aiux543-new-chat-check" /> : null}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {activeTabId === 'spec' ? (
        <div className="aiux543-new-chat-entry-list aiux543-new-chat-spec-list">
          <div className="aiux543-new-chat-menu-label">Templates</div>
          {specTemplateItems.map((template) => (
            <button
              key={template.id}
              type="button"
              className={`aiux543-new-chat-entry-row${selectedSpecTemplateId === template.id ? ' selected' : ''}`}
              onClick={() => onSpecTemplateSelect?.(template.id)}
            >
              <span className="aiux543-new-chat-entry-icon">{template.icon}</span>
              <span className="aiux543-new-chat-entry-title">{template.label}</span>
              {selectedSpecTemplateId === template.id ? <Icon name="general/checkmark" size={16} className="aiux543-new-chat-check" /> : null}
            </button>
          ))}
        </div>
      ) : null}
      <div className="aiux543-new-chat-separator" />
      <button type="button" className="aiux543-new-chat-entry-row aiux543-new-chat-flow-row-settings">
        <span className="aiux543-new-chat-entry-icon"><Icon name="general/settings" size={20} /></span>
        <span className="aiux543-new-chat-entry-title">AI Chat Settings...</span>
      </button>
      <div className="aiux543-new-chat-menu-quota">
        <div className="aiux543-new-chat-quota-row">
          <span><strong>13.4</strong> / 30 monthly credits left</span>
          <span>till 17.04 11:00</span>
          <span className="aiux543-new-chat-quota-help">?</span>
        </div>
        <div className="aiux543-new-chat-quota-row">
          <span><strong>50.00</strong> / 70 top-up credits left</span>
          <span>Shared</span>
          <span className="aiux543-new-chat-quota-help">?</span>
        </div>
      </div>
      <div className="aiux543-new-chat-menu-bottom-space" />
    </div>
  );
}

function ReferenceSpecMarkIcon({ className = '' } = {}) {
  return (
    <svg className={`aiux543-spec-mark-icon ${className}`.trim()} viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
      <path d="M0 5.876H3.057L5.192 11.432L5.329 12.003L5.445 11.432L7.516 5.876H10.605V14.963H8.301V9.498L8.34 8.907L6.056 14.963H4.478L2.265 8.965L2.304 9.498V14.963H0V5.876Z" fill="currentColor" />
      <path fillRule="evenodd" clipRule="evenodd" d="M15.117 12.431L15.117 5.876L16.617 5.876L16.617 12.431L18.221 10.826L19.282 11.887L15.867 15.302L12.452 11.887L13.513 10.826L15.117 12.431Z" fill="currentColor" />
    </svg>
  );
}

function BugFixSpecTemplateIcon({ className = '' } = {}) {
  return (
    <svg className={`icon aiux543-spec-template-line-icon ${className}`.trim()} width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
      <g stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5.8 4.8C5.67 4.52 5.6 4.22 5.6 3.9C5.6 2.57 6.67 1.5 8 1.5C9.33 1.5 10.4 2.57 10.4 3.9C10.4 4.22 10.33 4.52 10.2 4.8" />
        <path d="M4.5 7.45C4.5 5.82 5.82 4.5 7.45 4.5H8.55C10.18 4.5 11.5 5.82 11.5 7.45V9.9C11.5 12.16 9.93 14 8 14C6.07 14 4.5 12.16 4.5 9.9V7.45Z" />
        <path d="M4.6 6.7L2.2 5.4" />
        <path d="M11.4 6.7L13.8 5.4" />
        <path d="M4.5 9H1.8" />
        <path d="M11.5 9H14.2" />
        <path d="M4.8 11.4L2.2 12.9" />
        <path d="M11.2 11.4L13.8 12.9" />
      </g>
    </svg>
  );
}

function FeatureSpecTemplateIcon({ className = '' } = {}) {
  return (
    <svg className={`icon aiux543-spec-template-line-icon ${className}`.trim()} width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
      <g stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.35 9.2C11.38 8.47 12.05 7.27 12.05 5.9C12.05 3.66 10.24 1.85 8 1.85C5.76 1.85 3.95 3.66 3.95 5.9C3.95 7.27 4.62 8.47 5.65 9.2L6.05 11.15H9.95L10.35 9.2Z" />
        <path d="M6.35 12.75H9.65" />
        <path d="M7 14.25H9" />
      </g>
    </svg>
  );
}

function AIUXNewSessionEditor({
  onOpenSpec = null,
  onOpenSpecTask = null,
  onOpenChat = null,
  onOpenExistingChat = null,
  onOpenTerminal = null,
  onOpenSpecChat = null,
  agentTasks = AGENT_TASKS,
  chatRows = AI_SESSION_CHATS,
  sessionMode = 'chat',
  onSessionModeChange = null,
  selectedSpecTemplateId = 'feature',
  onSpecTemplateChange = null,
}) {
  const [prompt, setPrompt] = useState('');
  const [selectedSpecInputCommand, setSelectedSpecInputCommand] = useState('');
  const [isSpecHarnessBannerVisible, setIsSpecHarnessBannerVisible] = useState(true);
  const [expandedSpecIds, setExpandedSpecIds] = useState(() => new Set());
  const [isSpecKindMenuOpen, setIsSpecKindMenuOpen] = useState(false);
  const specKindAnchorRef = useRef(null);
  const continueMode = sessionMode;
  const setContinueMode = onSessionModeChange ?? (() => {});
  const specKind = selectedSpecTemplateId;
  const setSpecKind = onSpecTemplateChange ?? (() => {});
  const SPEC_KINDS = [
    { id: 'feature', label: 'feature', icon: <FeatureSpecTemplateIcon /> },
    { id: 'bug-fix', label: 'bug fix', icon: <BugFixSpecTemplateIcon /> },
  ];
  const selectedSpecKind = SPEC_KINDS.find((kind) => kind.id === specKind) ?? SPEC_KINDS[0];
  const selectedSpecAgent = specKind === 'bug-fix'
    ? { label: 'Codex', icon: <ReferenceCodexIcon /> }
    : { label: 'Claude', icon: <ReferenceClaudeIcon /> };
  const selectedModelLabel = continueMode === 'spec' && specKind === 'bug-fix'
    ? 'GPT-5.5 (medium)'
    : 'Opus 4.5';
  useEffect(() => {
    if (continueMode !== 'spec' && selectedSpecInputCommand) {
      setSelectedSpecInputCommand('');
    }
  }, [continueMode, selectedSpecInputCommand]);
  useEffect(() => {
    if (!isSpecKindMenuOpen) return undefined;
    const handleClickAway = (event) => {
      const anchor = specKindAnchorRef.current;
      if (anchor && anchor.contains(event.target)) return;
      setIsSpecKindMenuOpen(false);
    };
    const handleKey = (event) => {
      if (event.key === 'Escape') setIsSpecKindMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClickAway);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClickAway);
      document.removeEventListener('keydown', handleKey);
    };
  }, [isSpecKindMenuOpen]);
  const [specName, setSpecName] = useState('New-Spec.md');
  const specNameInputRef = useRef(null);
  // React does not manage contentEditable children, so keep textContent in sync
  // with state when the name is normalized on blur.
  useEffect(() => {
    const el = specNameInputRef.current;
    if (el && el.textContent !== specName) el.textContent = specName;
  }, [specName]);
  const commitSpecNameRename = (raw) => {
    const trimmed = (raw ?? '').trim();
    if (!trimmed) {
      if (specNameInputRef.current) specNameInputRef.current.textContent = specName;
      return;
    }
    const withExt = /\.md$/i.test(trimmed) ? trimmed : `${trimmed}.md`;
    if (withExt !== specName) {
      setSpecName(withExt);
    } else if (specNameInputRef.current && specNameInputRef.current.textContent !== specName) {
      specNameInputRef.current.textContent = specName;
    }
  };
  const toggleSpecExpanded = useCallback((id) => {
    setExpandedSpecIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);
  const textareaRef = useRef(null);
  const hasPrompt = prompt.trim().length > 0;
  // Recent chats show standalone conversations. Spec-linked chats stay nested
  // under Recent specs instead of appearing twice in the generic list.
  const recentChats = chatRows
    .filter((chat) => {
      if (!chat?.id || !chat?.title || chat?.kind === 'section' || chat?.kind === 'spec') return false;
      if (typeof chat.id === 'string' && chat.id.startsWith('spec-chat-')) return false;
      const specs = chat.children?.find((child) => child.id === 'specs')?.items ?? [];
      return specs.length === 0;
    })
    .map((chat) => ({
      id: chat.id,
      title: chat.title,
      agent: chat.agent,
      cloud: chat.cloud,
      time: chat.time,
    }));
  // Build recent specs from the real AGENT_TASKS list. Related chats come from the
  // AI Sessions data: a chat is linked to a spec when its `specs` children list
  // includes that spec's label.
  const recentSpecs = agentTasks.map((task) => ({
    id: task.id,
    label: task.label,
    time: task.time,
    chats: chatRows
      .filter((chat) => {
        const specs = chat.children?.find((c) => c.id === 'specs')?.items ?? [];
        return specs.some((item) => {
          const keys = getSpecLinkKeys(item);
          return keys.includes(task.id) || keys.includes(task.label);
        });
      })
      .map((chat) => ({
        id: chat.id,
        title: chat.title,
        agent: chat.agent,
        cloud: chat.cloud,
        time: chat.time,
      })),
  }));
  const continueOptions = [
    { id: 'chat', label: 'Chat', icon: <Icon name="aiAssistant/toolWindowChat" size={16} /> },
    { id: 'terminal', label: 'Terminal', icon: <Icon name="toolwindows/terminal" size={16} /> },
    { id: 'spec', label: 'Spec Mode', icon: <ReferenceSpecMarkIcon className="aiux550-spec-option-icon" /> },
  ];

  const resizeTextarea = useCallback((element = textareaRef.current) => {
    if (!element) return;
    element.style.height = 'auto';
    const viewportHeight = typeof window === 'undefined' ? 720 : window.innerHeight;
    const top = element.getBoundingClientRect().top;
    const maxHeight = Math.max(42, Math.min(420, viewportHeight - top - 156));
    const nextHeight = Math.min(element.scrollHeight, maxHeight);
    element.style.height = `${nextHeight}px`;
    element.style.overflowY = element.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }, []);

  useEffect(() => {
    resizeTextarea();
  }, [prompt, resizeTextarea]);

  useEffect(() => {
    window.addEventListener('resize', resizeTextarea);
    return () => window.removeEventListener('resize', resizeTextarea);
  }, [resizeTextarea]);

  const handlePrimaryAction = () => {
    if (continueMode === 'chat') {
      onOpenChat?.(prompt.trim());
      return;
    }

    if (continueMode === 'terminal') {
      onOpenTerminal?.();
      return;
    }

    // Read the latest spec name from the contentEditable directly — the user
    // may click Send without blurring, so the React state can still hold the
    // stale value committed by the previous onBlur.
    const pendingSpecName = (specNameInputRef.current?.textContent ?? specName ?? '').trim();
    const effectiveSpecName = pendingSpecName
      ? (/\.md$/i.test(pendingSpecName) ? pendingSpecName : `${pendingSpecName}.md`)
      : specName;
    if (effectiveSpecName !== specName) {
      setSpecName(effectiveSpecName);
    }
    onOpenSpec?.({
      templateId: specKind,
      command: selectedSpecInputCommand,
      prompt: prompt.trim(),
      specName: effectiveSpecName,
    });
  };
  const applySpecInputCommand = (command) => {
    setSelectedSpecInputCommand(command);
    setPrompt('');
    requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      textarea.focus();
      textarea.setSelectionRange(0, 0);
      resizeTextarea(textarea);
    });
  };

  return (
    <div
      className="ux3730-aia-flow-surface ux3730-aia-flow-surface-v2 aiux550-start-surface aiux543-whole-flow-page aiux543-new-layout-page"
      aria-label="New chat"
    >
      <div className="aiux550-start-layout" data-node-id="8124:54992">
        <div className="ux3730-aia-flow-continue-in aiux550-continue-in" role="group" aria-label="Continue in">
          <span>Continue in:</span>
          <SegmentedControl
            className="ux3730-aia-flow-continue-segmented aiux550-continue-segmented"
            value={continueMode}
            onChange={setContinueMode}
            options={continueOptions.map((item) => ({
              value: item.id,
              label: (
                <span className="ux3730-aia-flow-continue-option">
                  {item.icon}
                  <span>{item.label}</span>
                </span>
              ),
            }))}
          />
        </div>

        <div className="aiux550-session-block">
          {continueMode === 'spec' ? (
            <div className="aiux550-session-row">
              <span className="aiux550-session-label">New specification</span>
              <div className="aiux550-session-picker-anchor">
                <div className="aiux550-session-picker aiux550-spec-name-picker">
                  <IconMdTask />
                  <span
                    ref={specNameInputRef}
                    className="aiux550-spec-name-label"
                    contentEditable
                    suppressContentEditableWarning
                    spellCheck={false}
                    role="textbox"
                    aria-label="Rename current specification"
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        event.currentTarget.blur();
                      } else if (event.key === 'Escape') {
                        event.preventDefault();
                        event.currentTarget.textContent = specName;
                        event.currentTarget.blur();
                      }
                    }}
                    onBlur={(event) => {
                      commitSpecNameRename(event.currentTarget.textContent ?? '');
                    }}
                  >
                    {specName}
                  </span>
                </div>
              </div>
              <div className="aiux550-session-picker-anchor" ref={specKindAnchorRef}>
                <button
                  type="button"
                  className="aiux550-session-picker"
                  aria-haspopup="menu"
                  aria-expanded={isSpecKindMenuOpen}
                  onClick={() => setIsSpecKindMenuOpen((prev) => !prev)}
                >
                  {selectedSpecKind.icon}
                  <span>{selectedSpecKind.label}</span>
                  <Icon name="general/chevronDown" size={16} />
                </button>
                {isSpecKindMenuOpen ? (
                  <div className="aiux550-session-picker-menu" role="menu">
                    {SPEC_KINDS.map((kind) => (
                      <button
                        key={kind.id}
                        type="button"
                        role="menuitemradio"
                        aria-checked={specKind === kind.id}
                        className={`aiux550-session-picker-menu-item${specKind === kind.id ? ' is-selected' : ''}`}
                        onClick={() => {
                          setSpecKind(kind.id);
                          setIsSpecKindMenuOpen(false);
                        }}
                      >
                        {kind.icon}
                        <span>{kind.label}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              <button type="button" className="aiux550-session-picker aiux550-agent-picker">
                {selectedSpecAgent.icon}
                <span>{selectedSpecAgent.label}</span>
                <Icon name="general/chevronDown" size={16} />
              </button>
            </div>
          ) : (
            <div className="aiux550-session-row">
              <span className="aiux550-session-label">New session in</span>
              <button type="button" className="aiux550-session-picker">
                <Icon name="nodes/folder" size={20} />
                <span>‘{PROJECT_NAME}’</span>
                <Icon name="general/chevronDown" size={16} />
              </button>
              <button type="button" className="aiux550-session-picker aiux550-agent-picker">
                <ReferenceClaudeIcon />
                <span>Claude</span>
                <Icon name="general/chevronDown" size={16} />
              </button>
              <button type="button" className="aiux550-session-picker">
                <span>Local</span>
                <Icon name="general/chevronDown" size={16} />
              </button>
            </div>
          )}
          <div className="ux3730-aia-flow-v2-input">
            <div className="ux3730-aia-flow-v2-local-card">
              <button type="button" className="ux3730-aia-chat-dropdown">
                <span>Local</span>
                <Icon name="general/chevronDown" size={16} />
              </button>
            </div>
            <div
              className={`ux3730-aia-flow-v2-composer${hasPrompt ? ' ux3730-aia-flow-v2-composer-filled' : ''}`}
              onClick={() => textareaRef.current?.focus()}
            >
              <div className="ux3730-aia-flow-v2-input-row">
                {continueMode === 'spec' && selectedSpecInputCommand ? (
                  <span className="aiux550-spec-command-chip aiux550-spec-command-prefix">{selectedSpecInputCommand}</span>
                ) : null}
                {continueMode === 'spec' && !hasPrompt && !selectedSpecInputCommand ? (
                  <div className="aiux550-spec-input-start-hint">
                    <span>
                      Type task, use{' '}
                      <button type="button" className="aiux550-spec-command-chip" onClick={() => applySpecInputCommand('/roast')}>/roast</button>
                      {' '}to shape requirements or{' '}
                      <button type="button" className="aiux550-spec-command-chip" onClick={() => applySpecInputCommand('/spec')}>/spec</button>
                      {' '}to generate a full spec.
                    </span>
                  </div>
                ) : null}
                <textarea
                  ref={textareaRef}
                  value={prompt}
                  onChange={(event) => {
                    setPrompt(event.target.value);
                    resizeTextarea(event.target);
                  }}
                  placeholder="Type task, use @mentions or /commands"
                  rows={1}
                  aria-label="New session prompt"
                />
              </div>
              <div className="ux3730-aia-flow-v2-attachments" aria-hidden="true" />
              <div className="ux3730-aia-flow-v2-toolbar">
                <div className="ux3730-aia-flow-v2-toolbar-left">
                  <button type="button" className="ux3730-aia-chat-icon-button" aria-label="Add">
                    <Icon name="general/add" size={16} />
                  </button>
                  <button type="button" className="ux3730-aia-chat-dropdown">
                    <span>Default</span>
                    <Icon name="general/chevronDown" size={16} />
                  </button>
                </div>
                <div className="ux3730-aia-flow-v2-toolbar-right">
                  {hasPrompt ? (
                    continueMode === 'spec' ? (
                      <button type="button" className="ux3730-aia-flow-v2-start-chat ux3730-aia-flow-v2-start-chat-plain" onClick={handlePrimaryAction}>
                        <span>Start</span>
                      </button>
                    ) : (
                      <button type="button" className="ux3730-aia-flow-v2-start-chat" onClick={handlePrimaryAction}>
                        <span>{continueMode === 'terminal' ? 'Start Terminal' : 'Start Chat'}</span>
                        <span className="ux3730-aia-flow-v2-start-divider" aria-hidden="true" />
                        <Icon name="general/chevronDown" size={16} />
                      </button>
                    )
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          <footer className="ux3730-aia-flow-v2-footer">
            <span className="ux3730-aia-flow-v2-model">
              <span>{selectedModelLabel}</span>
              <Icon name="general/chevronDown" size={16} />
            </span>
            <span>Feedback ↗</span>
          </footer>
        </div>

        {continueMode === 'spec' && isSpecHarnessBannerVisible ? (
          <section className="aiux550-spec-harness-banner" aria-label="Spec harness routing">
            <Icon name="nodes/models" size={16} className="aiux550-spec-harness-banner-icon" />
            <div className="aiux550-spec-harness-banner-copy">
              <span className="aiux550-spec-harness-banner-text">
                Spec harness adapts execution per step: planning, implementation, review, and verification can use different models and agents.
              </span>
            </div>
            <button
              type="button"
              className="aiux550-spec-harness-banner-close"
              aria-label="Dismiss spec harness note"
              onClick={() => setIsSpecHarnessBannerVisible(false)}
            >
              <Icon name="general/close" size={16} />
            </button>
          </section>
        ) : null}

        {continueMode === 'spec' ? (
          <div className="ux3730-aia-flow-recents aiux550-recent-specs" aria-label="Recent specs">
            <div className="ux3730-aia-flow-recents-header">
              <span>Recent specs</span>
              <button type="button" onClick={() => onOpenSpec?.()}>Show all</button>
            </div>
            <div className="ux3730-aia-flow-recent-list">
              {recentSpecs.map((spec) => {
                const hasChats = spec.chats.length > 0;
                const expanded = hasChats && expandedSpecIds.has(spec.id);
                return (
                  <div key={spec.id} className="aiux550-recent-spec-group">
                    <div
                      className={`ux3730-aia-flow-recent-row aiux550-recent-spec-row${hasChats ? ' aiux550-recent-spec-row-expandable' : ''}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => onOpenSpecTask?.(spec.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          onOpenSpecTask?.(spec.id);
                        }
                      }}
                    >
                      <span className="aiux550-recent-spec-chevron" aria-hidden="true">
                        {hasChats ? (
                          <button
                            type="button"
                            className="aiux550-recent-spec-chevron-btn"
                            aria-label={expanded ? `Collapse ${spec.label}` : `Expand ${spec.label}`}
                            aria-expanded={expanded}
                            onClick={(event) => {
                              event.stopPropagation();
                              toggleSpecExpanded(spec.id);
                            }}
                          >
                            <Icon name={expanded ? 'general/chevronDown' : 'general/chevronRight'} size={16} />
                          </button>
                        ) : null}
                      </span>
                      <ReferenceSpecMarkIcon className="aiux550-spec-option-icon" />
                      <span className="ux3730-aia-flow-recent-title">
                        <span>{spec.label}</span>
                      </span>
                      <time>{spec.time}</time>
                    </div>
                    {hasChats && expanded ? (
                      <div className="aiux550-recent-spec-chats">
                        {spec.chats.map((chat) => (
                          <button
                            key={chat.id}
                            type="button"
                            className="ux3730-aia-flow-recent-row aiux550-recent-spec-chat-row"
                            onClick={(event) => {
                              event.stopPropagation();
                              onOpenSpecChat?.(chat.id, spec.id);
                            }}
                          >
                            <ReferenceChatAgentIcon agent={chat.agent} />
                            <span className="ux3730-aia-flow-recent-title">
                              {chat.cloud ? <ReferenceCloudMarker /> : null}
                              <span>{chat.title}</span>
                            </span>
                            <time>{chat.time}</time>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="ux3730-aia-flow-recents" aria-label="Recent chats">
            <div className="ux3730-aia-flow-recents-header">
              <span>Recent chats</span>
              <button type="button" onClick={() => onOpenExistingChat?.()}>Show all</button>
            </div>
            <div className="ux3730-aia-flow-recent-list">
              {recentChats.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="ux3730-aia-flow-recent-row"
                  onClick={() => {
                    onOpenExistingChat?.(item.id, item);
                  }}
                >
                  <ReferenceChatAgentIcon agent={item.agent} />
                  <span className="ux3730-aia-flow-recent-title">
                    {item.cloud ? <ReferenceCloudMarker /> : null}
                    <span>{item.title}</span>
                  </span>
                  <time>{item.time}</time>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function resolveAiChatTreeLeafIcon(label, sectionId) {
  const name = typeof label === 'string' ? label : (label?.label ?? '');
  if (name.endsWith('.html')) return 'fileTypes/html';
  if (name.endsWith('.js') || name.endsWith('.jsx')) return 'fileTypes/javaScript';
  if (name.endsWith('.css')) return 'fileTypes/css';
  if (name.endsWith('.java')) return 'fileTypes/java';
  if (name.endsWith('.md')) return 'fileTypes/markdown';
  if (name.endsWith('.yml') || name.endsWith('.yaml')) return 'fileTypes/yaml';
  if (name.endsWith('.xml')) return 'fileTypes/xml';
  if (sectionId === 'branches') return 'vcs/branch';
  return 'fileTypes/text';
}

function AiChatRowChildren({ chatId, sections, collapsedSections, onToggleSection }) {
  return (
    <div className="aiux543-chat-row-children">
      {sections.map((section) => {
        const sectionKey = `${chatId}:${section.id}`;
        const expanded = !collapsedSections.has(sectionKey);
        return (
          <div key={section.id} className="aiux543-chat-row-child-section">
            <button
              type="button"
              className="aiux543-chat-tree-row aiux543-chat-tree-section"
              aria-expanded={expanded}
              onClick={() => onToggleSection(sectionKey)}
            >
              <Icon className="aiux543-chat-tree-chevron" name={expanded ? 'general/chevronDown' : 'general/chevronRight'} size={16} />
              <Icon className="aiux543-chat-tree-icon" name="nodes/folder" size={16} />
              <span>{section.label}</span>
            </button>
            {expanded ? (
              <div className="aiux543-chat-tree-children">
                {section.items.map((item, idx) => {
                  const label = typeof item === 'string' ? item : item.label;
                  const status = typeof item === 'string' ? null : item.status;
                  const isSubThread = section.id === 'sub-threads';
                  const leafIconName = resolveAiChatTreeLeafIcon(item, section.id);
                  const leafClasses = [
                    'aiux543-chat-tree-row',
                    'aiux543-chat-tree-leaf',
                    isSubThread ? 'aiux543-chat-tree-subthread-leaf' : '',
                    section.id === 'changes' && status ? `aiux543-chat-tree-leaf-${status}` : '',
                  ].filter(Boolean).join(' ');
                  return (
                    <div key={`${section.id}-${idx}-${label}`} className={leafClasses}>
                      <span className="aiux543-chat-tree-chevron-spacer" aria-hidden="true" />
                      {isSubThread
                        ? <AiChatAgentIcon icon={typeof item === 'string' ? 'claude' : (item.agent ?? 'claude')} />
                        : <Icon className={`aiux543-chat-tree-icon${leafIconName === 'fileTypes/markdown' ? ' aiux550-project-md-icon' : ''}`} name={leafIconName} size={16} />
                      }
                      <span>{label}</span>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function ProjectToolWindowWithAiSessions({
  ctx,
  projectTreeData,
  selectedTaskId = null,
  agentTasks = AGENT_TASKS,
  chatRows = AI_SESSION_CHATS,
  showAllSessions = false,
  selectedChatId = null,
  onOpenNewSession = null,
  onOpenSpecTask = null,
  onOpenSpecChat = null,
  onOpenChatInTab = null,
  onShowAllSessions = null,
}) {
  const [isAiSessionsExpanded, setIsAiSessionsExpanded] = useState(true);
  const [isProjectContextExpanded, setIsProjectContextExpanded] = useState(false);
  const [isSkillsExpanded, setIsSkillsExpanded] = useState(false);
  const [areAiSessionActionsVisible, setAreAiSessionActionsVisible] = useState(false);
  const [isShowingAllSessions, setIsShowingAllSessions] = useState(false);
  const [isAiSessionsStuck, setIsAiSessionsStuck] = useState(false);
  const [expandedChatRows, setExpandedChatRows] = useState(() => new Set());
  const [collapsedChatSections, setCollapsedChatSections] = useState(() => new Set());
  const toggleChatRow = useCallback((id) => {
    setExpandedChatRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);
  const toggleChatSection = useCallback((key) => {
    setCollapsedChatSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);
  const shouldShowAllSessions = isShowingAllSessions || showAllSessions;
  const scrollContainerRef = useRef(null);
  const aiSessionsRef = useRef(null);

  const updateStuckState = useCallback(() => {
    const container = scrollContainerRef.current;
    const section = aiSessionsRef.current;
    if (!container || !section) return;
    const sectionBottom = section.offsetTop + section.offsetHeight;
    setIsAiSessionsStuck(container.scrollTop >= sectionBottom);
  }, []);

  useEffect(() => {
    const raf = window.requestAnimationFrame(updateStuckState);
    return () => window.cancelAnimationFrame(raf);
  }, [isAiSessionsExpanded, updateStuckState]);
  const chatsBySpecKey = new Map();
  const specLinkedChatIds = new Set();
  for (const chat of chatRows) {
    const specKeys = (chat.children?.find((child) => child.id === 'specs')?.items ?? [])
      .flatMap(getSpecLinkKeys)
      .filter(Boolean);
    if (specKeys.length === 0) continue;
    specLinkedChatIds.add(chat.id);
    for (const specKey of specKeys) {
      if (!chatsBySpecKey.has(specKey)) chatsBySpecKey.set(specKey, []);
      chatsBySpecKey.get(specKey).push(chat);
    }
  }
  const aiSessionRows = [
    {
      id: AIUX_NEW_SESSION_TAB_ID,
      title: 'New Session',
      time: 'now',
      icon: <AiChatClaudeIcon />,
      type: 'new-session',
    },
    ...chatRows.map((chat) => ({
      ...chat,
      type: chat.type ?? 'chat',
      icon: <AiChatAgentIcon icon={chat.agent ?? chat.icon ?? 'claude'} />,
    })),
  ];
  const visibleAiSessionChatsById = new Map();
  for (const row of aiSessionRows) {
    if (row.type !== 'new-session') {
      visibleAiSessionChatsById.set(row.id, row);
    }
  }
  const selectedVisibleChat = selectedChatId ? visibleAiSessionChatsById.get(selectedChatId) : null;
  const activeAiSessionRowId = selectedVisibleChat
    ? selectedChatId
    : selectedTaskId;
  const specRows = agentTasks.map((task) => ({
    ...task,
    relatedChats: (chatsBySpecKey.get(task.id) ?? chatsBySpecKey.get(task.label) ?? []).map((chat) => ({
      ...chat,
      specId: task.id,
      type: chat.type ?? 'chat',
      icon: <AiChatAgentIcon icon={chat.agent ?? chat.icon ?? 'claude'} />,
      children: (chat.children ?? []).filter((child) => child.id !== 'specs'),
    })),
  }));
  const selectedSpecLinkedChat = selectedChatId
    ? specRows.flatMap((task) => task.relatedChats).find((chat) => chat.id === selectedChatId)
    : null;

  const visibleProjectContextRows = [
    { id: 'ai-context-root', label: 'Project AI context', icon: 'nodes/folder', level: 1, leaf: false, collapsed: !(isProjectContextExpanded || shouldShowAllSessions), onToggle: () => setIsProjectContextExpanded((prev) => !prev) },
    ...(isProjectContextExpanded || shouldShowAllSessions ? [
      { id: 'ai-context-agents', label: 'AGENTS.md', icon: 'fileTypes/markdown', level: 2, leaf: true },
      { id: 'ai-context-skills', label: 'Skills', icon: 'nodes/folder', level: 2, leaf: false, collapsed: !(isSkillsExpanded || shouldShowAllSessions), onToggle: () => setIsSkillsExpanded((prev) => !prev) },
      ...(isSkillsExpanded || shouldShowAllSessions ? [
        { id: 'ai-context-skill-code-review', label: 'code-review', icon: 'codeInsight/intentionBulbGrey', level: 3, leaf: true },
        { id: 'ai-context-skill-test-writer', label: 'test-writer', icon: 'codeInsight/intentionBulbGrey', level: 3, leaf: true },
        { id: 'ai-context-skill-api-migration', label: 'api-migration-planner', icon: 'codeInsight/intentionBulbGrey', level: 3, leaf: true },
        { id: 'ai-context-skill-release-notes', label: 'release-notes-drafter', icon: 'codeInsight/intentionBulbGrey', level: 3, leaf: true },
      ] : []),
    ] : []),
  ];

  const renderProjectContextRow = (row) => (
    <button
      type="button"
      key={row.id}
      className="aiux550-project-row"
      style={{ '--level': row.level ?? 0 }}
      onClick={row.onToggle}
    >
      <span className="aiux550-project-chevron">
        {!row.leaf ? <Icon name={row.collapsed ? 'general/chevronRight' : 'general/chevronDown'} size={16} /> : null}
      </span>
      <Icon className="aiux550-project-icon" name={row.icon} size={16} />
      <span className="aiux550-project-label"><span>{row.label}</span></span>
    </button>
  );

  const renderAiSessionRow = (row) => {
    const isSelected = row.id === activeAiSessionRowId;
    const hasChildren = Array.isArray(row.children) && row.children.length > 0;
    const isExpanded = expandedChatRows.has(row.id) || shouldShowAllSessions;
    const diff = row.diff ?? null;
    const status = row.status ?? null;

    return (
      <div key={row.id} className="aiux550-project-chat-node">
        <button
          type="button"
          role="button"
          className={`aiux550-project-chat-row${isSelected ? ' selected' : ''}${hasChildren ? ' expandable' : ''}`}
          onClick={() => {
            if (row.type === 'new-session') {
              onOpenNewSession?.();
              return;
            }
            onOpenChatInTab?.(row.id);
          }}
        >
          <span className="aiux550-project-chat-chevron">
            {hasChildren ? (
              <button
                type="button"
                aria-label={isExpanded ? `Collapse ${row.title}` : `Expand ${row.title}`}
                onClick={(event) => {
                  event.stopPropagation();
                  toggleChatRow(row.id);
                }}
              >
                <Icon name={isExpanded ? 'general/chevronDown' : 'general/chevronRight'} size={16} />
              </button>
            ) : null}
          </span>
          <span className="aiux550-project-agent">{row.icon ?? <AiChatAgentIcon icon={row.agent ?? 'claude'} />}</span>
          <span className="aiux550-project-chat-title">
            {row.cloud ? <ReferenceCloudMarker /> : null}
            <span>{row.title}</span>
          </span>
          <span className="aiux550-project-diff">
            {diff ? (
              <>
                <span>+{diff.added}</span>
                <span>-{diff.deleted}</span>
              </>
            ) : null}
          </span>
          <span className="aiux550-project-status">
            {status === 'loading' ? <span className="aiux543-spinner" /> : null}
            {status === 'ready' ? <span className="aiux543-ready-dot" /> : null}
          </span>
          <time>{row.time}</time>
        </button>
        {hasChildren && isExpanded ? (
          <AiChatRowChildren
            chatId={row.id}
            sections={row.children}
            collapsedSections={collapsedChatSections}
            onToggleSection={toggleChatSection}
          />
        ) : null}
      </div>
    );
  };

  const renderSpecRow = (task) => {
    const isSelected = task.id === activeAiSessionRowId || task.id === selectedTaskId;
    return (
      <button
        type="button"
        key={task.id}
        className={`aiux550-project-row aiux-project-spec-row${isSelected ? ' selected' : ''}`}
        style={{ '--level': 1 }}
        onClick={() => onOpenSpecTask?.(task.id)}
      >
        <span className="aiux550-project-chevron" />
        <Icon className="aiux-project-spec-icon aiux550-project-md-icon" name="fileTypes/markdown" size={16} />
        <span className="aiux550-project-label"><span>{task.label}</span></span>
      </button>
    );
  };

  return (
    <ToolWindow
      title="Project"
      width="100%"
      height="auto"
      actions={['more', 'minimize']}
      focused={ctx.focusedPanel === 'left'}
      onFocus={() => ctx.setFocusedPanel('left')}
      onActionClick={(action) => {
        if (action === 'minimize') ctx.setShowLeftPanel(false);
      }}
      className="aiux550-project-tool-window project-window main-window-tool-window main-window-tool-window-left"
    >
      <div
        ref={scrollContainerRef}
        className={`aiux550-project-tree${areAiSessionActionsVisible ? ' aiux550-ai-sessions-actions-visible' : ''}${isAiSessionsStuck ? ' aiux550-ai-sessions-stuck' : ''}`}
        onScroll={updateStuckState}
      >
        <section
          ref={aiSessionsRef}
          className="aiux550-ai-sessions"
          onMouseEnter={() => setAreAiSessionActionsVisible(true)}
          onMouseLeave={() => setAreAiSessionActionsVisible(false)}
        >
          <div className="aiux550-ai-sessions-header">
            <button
              type="button"
              className="aiux550-project-row"
              style={{ '--level': 0 }}
              onClick={() => setIsAiSessionsExpanded((prev) => !prev)}
            >
              <span className="aiux550-project-chevron">
                <Icon name={isAiSessionsExpanded ? 'general/chevronDown' : 'general/chevronRight'} size={16} />
              </span>
              <span className="aiux550-project-icon aiux550-project-ai-icon">@</span>
              <span className="aiux550-project-label"><span>AI Sessions</span></span>
            </button>
            <div className="aiux550-ai-sessions-actions">
              <button type="button" className="aiux550-ai-sessions-show-all" onClick={onShowAllSessions}>Show all</button>
              <button type="button" className="aiux550-ai-sessions-add" aria-label="New AI session" onClick={onOpenNewSession}>
                <Icon name="general/add" size={16} />
              </button>
            </div>
          </div>
          {isAiSessionsExpanded ? (
            <>
              {visibleProjectContextRows.map(renderProjectContextRow)}
              <div className="aiux550-ai-session-list">
                {aiSessionRows.map(renderAiSessionRow)}
              </div>
              <div className="aiux-project-specs-section">
                <div className="aiux-project-specs-list">
                  {agentTasks.map(renderSpecRow)}
                </div>
              </div>
            </>
          ) : null}
        </section>
        <div className="aiux550-project-separator" />
        <Tree data={projectTreeData} defaultSelectedId="__none" />
      </div>
    </ToolWindow>
  );
}

const REFERENCE_CHAT_HISTORY_GROUPS = [
  {
    project: PROJECT_NAME,
    projectIcon: 'CM',
    projectTone: 'cobalt',
    rows: [
      {
        id: 'request-logging',
        title: 'Add request logging to a Java application',
        agent: 'claude',
        time: '4m',
        children: [
          { id: 'changes', label: 'Changes', summary: { added: 16, deleted: 4 }, items: [{ label: 'RequestLoggingFilter.java', status: 'added' }, { label: 'application.yml', status: 'modified' }] },
        ],
      },
      {
        id: 'promote-vet-schedules-spec',
        title: 'Clarify Vet-Schedules requirements',
        agent: 'claude',
        time: 'now',
      },
    ],
  },
];

// Promote chats that reference a `.md` spec (via `children.specs.items`) into
// parent "spec" rows keyed by the spec label, so the chat tree shows the spec
// document as the parent and its related chats as nested children. Chats
// without spec linkage and section markers keep their original position.
function restructureRowsBySpec(rows, knownSpecs = []) {
  const chatsBySpec = new Map();
  const linkedChatIds = new Set();
  for (const row of rows) {
    if (!row || row.kind === 'section' || row.kind === 'spec') continue;
    const specsChild = row.children?.find((c) => c.id === 'specs');
    const labels = (specsChild?.items ?? [])
      .flatMap(getSpecLinkKeys)
      .filter(Boolean);
    if (labels.length === 0) continue;
    for (const label of labels) {
      if (!chatsBySpec.has(label)) chatsBySpec.set(label, []);
      chatsBySpec.get(label).push(row);
    }
    linkedChatIds.add(row.id);
  }
  const allLabels = new Set([
    ...chatsBySpec.keys(),
    ...knownSpecs.map((spec) => spec.label),
  ]);
  const specRows = Array.from(allLabels).map((label) => {
    const known = knownSpecs.find((spec) => spec.label === label);
    return {
      id: known?.id ?? `spec-row:${label}`,
      kind: 'spec',
      title: label,
      time: known?.time,
      relatedChats: chatsBySpec.get(label) ?? [],
    };
  });
  const remaining = rows.filter((row) => (
    !row || row.kind === 'section' || (row.kind !== 'spec' && !linkedChatIds.has(row.id))
  ));
  return [...specRows, ...remaining];
}

// Build current project spec rows from the same AGENT_TASKS + AI_SESSION_CHATS
// data the Project tool window uses, so both views stay in sync. Other
// projects fall back to inverting chat→spec links from their own rows.
function buildChatHistoryGroups(agentTasks = AGENT_TASKS, chatRows = AI_SESSION_CHATS) {
  const chatsBySpecKey = new Map();
  const linkedChatIds = new Set();
  for (const chat of chatRows) {
    const specsChild = chat.children?.find((c) => c.id === 'specs');
    const specKeys = (specsChild?.items ?? [])
      .flatMap(getSpecLinkKeys)
      .filter(Boolean);
    if (specKeys.length === 0) continue;
    for (const specKey of specKeys) {
      if (!chatsBySpecKey.has(specKey)) chatsBySpecKey.set(specKey, []);
      chatsBySpecKey.get(specKey).push(chat);
    }
    linkedChatIds.add(chat.id);
  }
  return REFERENCE_CHAT_HISTORY_GROUPS.map((group) => {
    if (group.project === PROJECT_NAME) {
      const specRows = agentTasks.map((task) => ({
        id: task.id,
        kind: 'spec',
        title: task.label,
        time: task.time,
        relatedChats: (chatsBySpecKey.get(task.id) ?? chatsBySpecKey.get(task.label) ?? []).map((chat) => ({
          ...chat,
          specId: task.id,
        })),
      }));
      const rootRows = group.rows.filter((row) => (
        !row || row.kind === 'section' || !linkedChatIds.has(row.id)
      ));
      return { ...group, rows: [...specRows, ...rootRows] };
    }
    return { ...group, rows: restructureRowsBySpec(group.rows) };
  });
}

function buildExpandedSpecRowsFromGroups(groups) {
  const expanded = {};
  for (const group of groups) {
    for (const row of group.rows ?? []) {
      if (row?.kind === 'spec' && Array.isArray(row.relatedChats) && row.relatedChats.length > 0) {
        expanded[row.id] = true;
      }
    }
  }
  return expanded;
}

function ChatsHistoryToolWindow({
  ctx,
  activeChatId = AIUX_NEW_SESSION_TAB_ID,
  activeSpecId = null,
  onActiveChatIdChange = null,
  agentTasks = AGENT_TASKS,
  chatRows = AI_SESSION_CHATS,
  onOpenNewSession = null,
  onOpenSpecTask = null,
  onOpenSpecChat = null,
  onOpenChatInTab = null,
  onSettings = null,
  onOpenChangesList = null,
}) {
  const [groups, setGroups] = useState(() => buildChatHistoryGroups(agentTasks, chatRows));
  const [expandedProjects, setExpandedProjects] = useState(() => (
    Object.fromEntries(buildChatHistoryGroups(agentTasks, chatRows).map((group) => [group.project ?? group.title, true]))
  ));
  const [expandedSections, setExpandedSections] = useState({
    'request-logging:changes': true,
    'request-logging:context': true,
  });
  const [expandedRows, setExpandedRows] = useState(() => (
    ({ ...buildExpandedSpecRowsFromGroups(buildChatHistoryGroups(agentTasks, chatRows)), 'request-logging': true, 'spec-visit-booking': true, 'spec-vb-implement': true })
  ));
  const [openProjectPrompt, setOpenProjectPrompt] = useState(null);
  const [historySelectedId, setHistorySelectedId] = useState(activeChatId || AIUX_NEW_SESSION_TAB_ID);
  const selectedId = historySelectedId || AIUX_NEW_SESSION_TAB_ID;
  const flatRows = useMemo(() => buildAiux550HistoryRows(chatRows), [chatRows]);

  useEffect(() => {
    const nextGroups = buildChatHistoryGroups(agentTasks, chatRows);
    setGroups(nextGroups);
    setExpandedRows((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const group of nextGroups) {
        for (const row of group.rows ?? []) {
          if (row?.kind !== 'spec' || !Array.isArray(row.relatedChats) || row.relatedChats.length === 0) continue;
          if (next[row.id]) continue;
          next[row.id] = true;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [agentTasks, chatRows]);

  const handleSelectChat = (chatId, specId = null) => {
    setHistorySelectedId(chatId);
    onActiveChatIdChange?.(chatId);
    if (chatId === AIUX_NEW_SESSION_TAB_ID) {
      onOpenNewSession?.();
      return;
    }
    if (specId) {
      // Chat under a spec node: open the spec in a center tab AND the chat
      // on the left AI panel (mirrors the New Session "Recent specs" flow).
      onOpenSpecChat?.(chatId, specId);
      return;
    }
    // Standalone chats open as their own editor tab in the center.
    onOpenChatInTab?.(chatId);
  };

  const handleCreateThread = (projectName) => {
    const id = `${projectName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-new-thread-${Date.now()}`;
    const nextRow = {
      id,
      title: 'New chat',
      agent: 'claude',
      kind: 'empty',
      time: 'now',
    };
    setExpandedProjects((prev) => ({ ...prev, [projectName]: true }));
    setGroups((prev) => prev.map((group) => (
      (group.project ?? group.title) === projectName
        ? { ...group, rows: [nextRow, ...group.rows] }
        : group
    )));
    handleSelectChat(id);
  };

  return (
    <ToolWindow
      title="Chats History"
      width="100%"
      height="auto"
      actions={['more', 'minimize']}
      focused={ctx.focusedPanel === 'left'}
      onFocus={() => ctx.setFocusedPanel('left')}
      onFocusCapture={() => ctx.setFocusedPanel('left')}
      onActionClick={(action) => {
        if (action === 'minimize') ctx.setShowLeftPanel(false);
      }}
      className="main-window-tool-window main-window-tool-window-left aiux543-history-tool-window aiux550-history-tool-window"
    >
      <div className="aiux543-tool-history-content">
        <div className="aiux543-history-top-actions" aria-label="Chats History actions">
          <button className="toolbar-button aiux543-history-top-action" type="button" onClick={() => handleSelectChat(AIUX_NEW_SESSION_TAB_ID)}>
            <div className="toolbar-button-content">
              <HistoryNewAgentIcon className="toolbar-button-icon" />
              <span className="toolbar-button-text text-ui-default">New Agent</span>
            </div>
          </button>
          <button type="button" className="aiux543-history-top-action aiux550-new-scope-action" onClick={() => handleSelectChat(AIUX_NEW_SESSION_TAB_ID)}>
            <HistoryNewScopeIcon />
            <span><span>New Scope</span><span> with shared context</span></span>
          </button>
          <button className="toolbar-button aiux543-history-top-action" type="button">
            <div className="toolbar-button-content">
              <HistorySkillsIcon className="toolbar-button-icon" />
              <span className="toolbar-button-text text-ui-default">Skills</span>
            </div>
          </button>
        </div>
        <label className="aiux543-tool-search-field">
          <Aiux550SearchIcon />
          <input placeholder="Search projects or chats" />
        </label>
        <Aiux550HistoryList
          activeChatId={selectedId}
          rows={flatRows}
          expandedRows={expandedRows}
          expandedSections={expandedSections}
          selectedActive
          className="aiux543-tool-chat-list"
          onSelectChat={handleSelectChat}
          onOpenChangesList={onOpenChangesList}
          onToggleRow={(rowId) => setExpandedRows((prev) => ({ ...prev, [rowId]: !(prev[rowId] ?? false) }))}
          onToggleSection={(sectionId) => setExpandedSections((prev) => ({ ...prev, [sectionId]: !(prev[sectionId] ?? false) }))}
        />
        <div className="aiux543-history-bottom-region">
          <div className="aiux543-history-bottom-bar">
            <button type="button" className="aiux543-history-bottom-settings" onClick={onSettings}>
              <Icon name="general/settings" size={16} />
              <span>Settings</span>
            </button>
            <button type="button" className="aiux543-history-bottom-plan" aria-expanded="false">
              <span>JetBrains AI Free</span>
              <span className="aiux543-history-bottom-plan-usage">
                <HistoryCreditsIcon className="aiux543-history-credits-icon" />
                <span>618.04</span>
              </span>
            </button>
          </div>
        </div>
      </div>
      {openProjectPrompt ? (
        <ReferenceOpenProjectOverlay
          projectName={openProjectPrompt}
          onCancel={() => setOpenProjectPrompt(null)}
          onOpenThisWindow={(projectName) => {
            setExpandedProjects(Object.fromEntries(groups.map((group) => [group.project ?? group.title, (group.project ?? group.title) === projectName])));
            setOpenProjectPrompt(null);
          }}
        />
      ) : null}
    </ToolWindow>
  );
}

function ReferenceOpenProjectOverlay({ projectName, onCancel, onOpenThisWindow }) {
  return (
    <div className="aiux543-open-project-overlay" role="presentation">
      <div className="aiux543-open-project-alert" role="dialog" aria-modal="true" aria-label="Open Project">
        <Icon name="general/questionDialog" size={28} className="aiux543-open-project-alert-icon" />
        <div className="aiux543-open-project-alert-copy">
          <div className="aiux543-open-project-alert-title">Open Project</div>
          <p>Where would you like to open the project<br />'{projectName}'?</p>
          <label className="aiux543-open-project-checkbox">
            <input type="checkbox" />
            <span>Don't ask again</span>
          </label>
        </div>
        <div className="aiux543-open-project-alert-buttons">
          <button type="button" className="aiux543-open-project-button secondary" onClick={onCancel}>Cancel</button>
          <button type="button" className="aiux543-open-project-button secondary" onClick={onCancel}>New Window</button>
          <button type="button" className="aiux543-open-project-button primary" onClick={() => onOpenThisWindow(projectName)}>This Window</button>
        </div>
      </div>
    </div>
  );
}

function HistoryNewAgentIcon({ className = '' } = {}) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className={`icon ${className}`.trim()} aria-hidden="true" focusable="false">
      <path fillRule="evenodd" clipRule="evenodd" d="M7 3H3C1.89543 3 1 3.89543 1 5V11C1 12.1046 1.89543 13 3 13H11C12.1046 13 13 12.1046 13 11V9H12V11C12 11.5523 11.5523 12 11 12H3C2.44772 12 2 11.5523 2 11V5C2 4.44772 2.44772 4 3 4H7V3Z" fill="#CED0D6" />
      <path fillRule="evenodd" clipRule="evenodd" d="M12.5 0C12.2239 0 12 0.223858 12 0.5V3H9.5C9.22386 3 9 3.22386 9 3.5C9 3.77614 9.22386 4 9.5 4H12V6.5C12 6.77614 12.2239 7 12.5 7C12.7761 7 13 6.77614 13 6.5V4H15.5C15.7761 4 16 3.77614 16 3.5C16 3.22386 15.7761 3 15.5 3H13V0.5C13 0.223858 12.7761 0 12.5 0Z" fill="#CED0D6" />
    </svg>
  );
}

function HistoryNewScopeIcon({ className = '' } = {}) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className={`icon ${className}`.trim()} aria-hidden="true" focusable="false">
      <path fillRule="evenodd" clipRule="evenodd" d="M12.5 9C12.7761 9 13 9.22386 13 9.5V12H15.5C15.7761 12 16 12.2239 16 12.5C16 12.7761 15.7761 13 15.5 13H13V15.5C13 15.7761 12.7761 16 12.5 16C12.2239 16 12 15.7761 12 15.5V13H9.5C9.22386 13 9 12.7761 9 12.5C9 12.2239 9.22386 12 9.5 12H12V9.5C12 9.22386 12.2239 9 12.5 9Z" fill="#548AF7" />
      <path d="M3 3L6.08579 3L8.08579 5H13C13.5523 5 14 5.44772 14 6V8H15V6C15 4.89543 14.1046 4 13 4H8.5L6.79289 2.29289C6.60536 2.10536 6.351 2 6.08579 2H3C1.89543 2 1 2.89543 1 4V12C1 13.1046 1.89543 14 3 14H8V13H3C2.44772 13 2 12.5523 2 12V4C2 3.44772 2.44772 3 3 3Z" fill="#CED0D6" />
    </svg>
  );
}

function HistorySkillsIcon({ className = '' } = {}) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className={`icon ${className}`.trim()} aria-hidden="true" focusable="false">
      <rect x="1.5" y="1.5" width="5" height="5" rx="0.5" stroke="#CED0D6" />
      <rect x="1.5" y="8.5" width="5" height="5" rx="0.5" stroke="#CED0D6" />
      <rect x="8.5" y="8.5" width="5" height="5" rx="0.5" stroke="#CED0D6" />
      <rect x="8.5" y="1.5" width="5" height="5" rx="0.5" stroke="#CED0D6" />
    </svg>
  );
}

function HistoryCreditsIcon({ className = '' } = {}) {
  return (
    <svg width="16" height="16" viewBox="0 0 13.5 11.6326" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden="true" focusable="false">
      <path fillRule="evenodd" clipRule="evenodd" d="M9.41968 3.52849C9.60801 3.34079 9.91336 3.34042 10.1015 3.52849C10.2897 3.71673 10.2896 4.02292 10.1015 4.21122L8.39795 5.91378C8.35801 5.95372 8.31152 5.98307 8.26329 6.00607C8.37391 6.23066 8.4375 6.48272 8.4375 6.75C8.4375 7.68198 7.68198 8.4375 6.75 8.4375C5.81802 8.4375 5.0625 7.68198 5.0625 6.75C5.0625 5.81802 5.81802 5.0625 6.75 5.0625C7.07966 5.0625 7.38661 5.15803 7.64648 5.32146C7.6659 5.28986 7.6888 5.25938 7.71617 5.232L9.41968 3.52849ZM6.75 6.02679C6.35058 6.02679 6.02679 6.35058 6.02679 6.75C6.02679 7.14942 6.35058 7.47321 6.75 7.47321C7.14942 7.47321 7.47321 7.14942 7.47321 6.75C7.47321 6.35058 7.14942 6.02679 6.75 6.02679Z" fill="currentColor" />
      <path fillRule="evenodd" clipRule="evenodd" d="M6.75 0C10.4779 0 13.5 3.02208 13.5 6.75C13.5 8.49088 12.8401 10.0769 11.7577 11.2739C11.5422 11.5123 11.2292 11.6326 10.9078 11.6326H2.59224C2.27082 11.6326 1.95784 11.5123 1.74226 11.2739C0.659904 10.0769 0 8.49088 0 6.75C0 3.02208 3.02208 0 6.75 0ZM6.75 0.964286C3.55464 0.964286 0.964286 3.55464 0.964286 6.75C0.964286 8.04833 1.39343 9.24524 2.11609 10.21C2.32728 10.492 2.669 10.6363 3.02126 10.6363H10.4787C10.831 10.6363 11.1727 10.492 11.3839 10.21C12.1066 9.24524 12.5357 8.04833 12.5357 6.75C12.5357 3.55464 9.94536 0.964286 6.75 0.964286Z" fill="currentColor" />
    </svg>
  );
}

function Aiux550SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className="icon" aria-hidden="true" focusable="false">
      <circle cx="6.75" cy="6.75" r="4.75" stroke="#CED0D6" />
      <path d="M10.1992 10.2L13.4992 13.4959" stroke="#CED0D6" strokeLinecap="round" />
    </svg>
  );
}

function Aiux550ChevronIcon({ expanded, className = 'icon' }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden="true" focusable="false">
      {expanded ? (
        <path d="M11.5 6.25L8 9.75L4.5 6.25" stroke="#B4B8BF" strokeLinecap="round" />
      ) : (
        <path d="M6 11.5L9.5 8L6 4.5" stroke="#B4B8BF" strokeLinecap="round" />
      )}
    </svg>
  );
}

const AIUX550_HISTORY_FALLBACK_ROWS = [
  { id: 'refresh-fixtures', title: 'Refresh solver test fixtures', agent: 'claude', time: '4h', diff: { added: 12, deleted: 4 }, expandable: true },
  { id: 'maven-warnings', title: 'Clean up Maven dependency warnings', agent: 'codex', time: '6h', cloud: true },
  { id: 'nullability-generated', title: 'Check nullability annotations in generated sources', agent: 'junie', time: '9h', diff: { added: 6, deleted: 1 }, expandable: true },
  { id: 'package-ownership', title: 'Map package ownership before refactor', agent: 'junie', time: '12h' },
  { id: 'brightness-slider', title: 'Implement gradient brightness slider control', agent: 'junie', time: '8d' },
  { id: 'preview-states', title: 'Compare generated preview states', agent: 'junie', time: '8d', expandable: true },
  { id: 'share-summary', title: 'Share current chat summary', agent: 'codex', time: '12d', cloud: true },
  { id: 'rank-related', title: 'Rank related chats near current file', agent: 'claude', time: '16d', cloud: true, expandable: true },
  { id: 'project-overview', title: 'Project overview', agent: 'claude', time: '30w' },
  { id: 'weekly-overview', title: 'Prepare weekly project overview', agent: 'codex', time: '5w', expandable: true },
  { id: 'archive-overview', title: 'Summarize archived project overview', agent: 'claude', time: '30w' },
];

// Full tree content for every expandable Chats History row. `request-logging`
// mirrors the reference layout exactly; the other rows carry on-theme content so
// no Changes / Context / Sub-threads branch renders empty. File icons are derived
// from each label's extension; sub-thread leaves render the sub-agent's icon.
const AIUX550_HISTORY_ROW_CONTENT = {
  'request-logging': {
    changes: [
      { label: 'index.html', status: 'modified' },
      { label: 'app.js', status: 'added' },
      { label: 'styles.css', status: 'deleted' },
    ],
    context: ['AdapterScript.java', 'FunctionUtils.java', 'pom.xml'],
    subThreads: [
      { label: 'Retry & backoff follow-up', agent: 'codex' },
      { label: 'Log format review', agent: 'claude' },
    ],
  },
  'understand-codebase': {
    changes: [
      { label: 'CodebaseMap.md', status: 'added' },
      { label: 'architecture.md', status: 'added' },
    ],
    context: ['AdapterScript.java', 'FunctionUtils.java', 'pom.xml'],
    subThreads: [{ label: 'Module boundaries', agent: 'claude' }],
  },
  'class-three-params-green': {
    changes: [
      { label: 'TripleIntConfig.java', status: 'added' },
      { label: 'TripleIntConfigTest.java', status: 'added' },
    ],
    context: ['TripleIntConfig.java', 'pom.xml'],
    subThreads: [{ label: 'Validation follow-up', agent: 'junie' }],
  },
  'refresh-fixtures': {
    changes: [
      { label: 'SolverFixtures.java', status: 'modified' },
      { label: 'fixtures.json', status: 'modified' },
      { label: 'LegacyFixtures.java', status: 'deleted' },
    ],
    context: ['Solver.java', 'SolverTest.java'],
    subThreads: [{ label: 'Fixture data audit', agent: 'codex' }],
  },
  'nullability-generated': {
    changes: [
      { label: 'Generated.java', status: 'modified' },
      { label: 'package-info.java', status: 'added' },
    ],
    context: ['NullabilityProcessor.java', 'pom.xml'],
    subThreads: [{ label: 'Annotation policy', agent: 'junie' }],
  },
  'preview-states': {
    changes: [
      { label: 'PreviewState.java', status: 'modified' },
      { label: 'preview.json', status: 'added' },
    ],
    context: ['PreviewRenderer.java'],
    subThreads: [{ label: 'Snapshot diffing', agent: 'claude' }],
  },
  'rank-related': {
    changes: [
      { label: 'RelatedRanker.java', status: 'modified' },
      { label: 'RankerTest.java', status: 'added' },
    ],
    context: ['ChatIndex.java', 'EmbeddingStore.java'],
    subThreads: [{ label: 'Scoring heuristics', agent: 'codex' }],
  },
  'weekly-overview': {
    changes: [{ label: 'weekly-report.md', status: 'added' }],
    context: ['metrics.json', 'contributors.md'],
    subThreads: [{ label: 'Metrics sources', agent: 'claude' }],
  },
  // Chats spawned from the Visit-Booking.md / Vet-Schedules.md specs.
  'spec-vb-implement': {
    changes: [
      { label: 'VisitController.java', status: 'modified' },
      { label: 'BookingService.java', status: 'added' },
      { label: 'visits.html', status: 'modified' },
    ],
    context: ['Visit-Booking.md', 'VetRepository.java', 'schema.sql'],
    subThreads: [{ label: 'Slot generation', agent: 'codex' }],
  },
  'spec-vb-availability': {
    changes: [
      { label: 'AvailabilityChecker.java', status: 'added' },
      { label: 'VetRepository.java', status: 'modified' },
    ],
    context: ['Visit-Booking.md', 'Vet.java'],
    subThreads: [{ label: 'Timezone handling', agent: 'claude' }],
  },
  'spec-vb-review': {
    changes: [{ label: 'BookingValidator.java', status: 'modified' }],
    context: ['Visit-Booking.md', 'BookingService.java'],
    subThreads: [{ label: 'Edge cases', agent: 'junie' }],
  },
  'spec-vs-model': {
    changes: [
      { label: 'VetSchedule.java', status: 'added' },
      { label: 'schema.sql', status: 'modified' },
    ],
    context: ['Vet-Schedules.md', 'Vet.java'],
    subThreads: [{ label: 'Weekday enum', agent: 'claude' }],
  },
  'spec-vs-offhours': {
    changes: [
      { label: 'ScheduleValidator.java', status: 'added' },
      { label: 'BookingService.java', status: 'modified' },
    ],
    context: ['Vet-Schedules.md', 'VetSchedule.java'],
    subThreads: [{ label: 'Rejection messages', agent: 'codex' }],
  },
};

function buildAiux550HistoryChildren(rowId, diff) {
  const content = AIUX550_HISTORY_ROW_CONTENT[rowId] ?? {};
  const changeItems = content.changes ?? [];
  const summary = diff ?? changeItems.reduce(
    (acc, item) => {
      if (item.status === 'deleted') acc.deleted += 1;
      else acc.added += 1;
      return acc;
    },
    { added: 0, deleted: 0 },
  );
  return [
    { id: 'changes', label: 'Changes', summary, items: changeItems },
    { id: 'context', label: 'Context', items: content.context ?? [] },
    { id: 'sub-threads', label: 'Sub-threads', items: content.subThreads ?? [] },
  ];
}

function withAiux550CollapsedChildren(row) {
  if (!row.expandable) return row;
  return { ...row, children: buildAiux550HistoryChildren(row.id, row.diff) };
}

function buildAiux550HistoryRows() {
  return [
    {
      id: AIUX_NEW_SESSION_TAB_ID,
      title: 'New Agent',
      agent: 'claude',
      time: 'now',
      type: 'new-session',
    },
    {
      id: 'request-logging',
      title: 'Add request logging to a Java application',
      agent: 'claude',
      time: '2m',
      status: 'approval',
      diff: { added: 14, deleted: 23 },
      children: buildAiux550HistoryChildren('request-logging', { added: 14, deleted: 23 }),
    },
    {
      id: 'understand-codebase',
      title: 'Understanding the existing Java codebase',
      agent: 'claude',
      time: '3m',
      diff: { added: 5, deleted: 0 },
      planProgress: { current: 2, total: 5 },
      children: buildAiux550HistoryChildren('understand-codebase', { added: 5, deleted: 0 }),
    },
    {
      id: 'class-three-params-green',
      title: 'Create a class with 3 int parameters',
      agent: 'junie',
      cloud: true,
      time: '22h',
      children: buildAiux550HistoryChildren('class-three-params-green'),
    },
    {
      id: 'reminders',
      title: 'Implement reminders and notifications',
      agent: 'claude',
      time: '1d',
    },
    {
      id: 'related-items',
      title: 'Add ‘related items’ section',
      agent: 'claude',
      cloud: true,
      time: '16d',
    },
    ...AIUX550_HISTORY_FALLBACK_ROWS.map(withAiux550CollapsedChildren),
  ];
}

// Spec-driven entries shown above the flat Agents list. Each spec is a `.md`
// document that owns the chats spawned from it, so it renders as an expandable
// row whose children are those chats. Each chat, in turn, carries the same
// Changes / Context / Sub-threads tree as the Agents-section chats.
const AIUX550_HISTORY_SPECS = [
  {
    id: 'spec-visit-booking',
    kind: 'spec',
    title: 'Visit-Booking.md',
    time: '2m',
    chats: [
      { id: 'spec-vb-implement', title: 'Implement visit booking flow', agent: 'claude', time: '2m', diff: { added: 42, deleted: 11 } },
      { id: 'spec-vb-availability', title: 'Add vet availability check', agent: 'junie', time: '18m' },
      { id: 'spec-vb-review', title: 'Review booking validation', agent: 'codex', time: '1h', cloud: true },
    ],
  },
  {
    id: 'spec-vet-schedules',
    kind: 'spec',
    title: 'Vet-Schedules.md',
    time: '3h',
    chats: [
      { id: 'spec-vs-model', title: 'Model weekday schedules', agent: 'claude', time: '3h', diff: { added: 16, deleted: 2 } },
      { id: 'spec-vs-offhours', title: 'Reject off-hours bookings', agent: 'junie', time: '5h' },
    ],
  },
].map((spec) => ({
  ...spec,
  chats: spec.chats.map((chat) => ({
    ...chat,
    children: buildAiux550HistoryChildren(chat.id, chat.diff),
  })),
}));

function Aiux550HistoryList({
  activeChatId,
  rows,
  specs = AIUX550_HISTORY_SPECS,
  expandedRows,
  expandedSections,
  selectedActive,
  className = '',
  onSelectChat,
  onOpenChangesList,
  onToggleRow,
  onToggleSection,
}) {
  const effectiveActiveChatId = rows.some((row) => row.id === activeChatId)
    ? activeChatId
    : AIUX_NEW_SESSION_TAB_ID;

  return (
    <div className={`aiux543-chat-list aiux543-chat-list-flat ${className}`.trim()}>
      {specs?.length ? (
        <section>
          <div className="aiux543-chat-group-rows">
            <ReferenceChatSectionHeader expanded label="Specs" onToggle={() => {}} />
            {specs.map((spec) => {
              const isExpanded = expandedRows[spec.id] ?? false;
              return (
                <div className="aiux543-chat-node" key={spec.id}>
                  <Aiux550HistoryRow
                    row={spec}
                    expanded={isExpanded}
                    selected={spec.id === effectiveActiveChatId}
                    selectedActive={selectedActive}
                    onSelect={() => onSelectChat?.(spec.id)}
                    onToggleExpanded={() => onToggleRow?.(spec.id)}
                  />
                  {spec.chats?.length && isExpanded ? (
                    <div className="aiux543-chat-spec-children">
                      {spec.chats.map((chat) => {
                        const chatExpanded = expandedRows[chat.id] ?? false;
                        return (
                          <div className="aiux543-chat-node" key={chat.id}>
                            <Aiux550HistoryRow
                              row={chat}
                              nested
                              expanded={chatExpanded}
                              selected={chat.id === effectiveActiveChatId}
                              selectedActive={selectedActive}
                              onSelect={() => onSelectChat?.(chat.id)}
                              onToggleExpanded={() => onToggleRow?.(chat.id)}
                            />
                            {chat.children?.length && chatExpanded ? (
                              <Aiux550HistoryRowChildren
                                sections={chat.children}
                                rowId={chat.id}
                                expandedSections={expandedSections}
                                onToggleSection={onToggleSection}
                                onOpenChangesList={onOpenChangesList}
                              />
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      ) : null}
      <section>
        <div className="aiux543-chat-group-rows">
          <ReferenceChatSectionHeader
            expanded
            label="Agents"
            onToggle={() => {}}
          />
          {rows.map((row) => {
            const isExpanded = expandedRows[row.id] ?? false;
            return (
              <div className="aiux543-chat-node" key={row.id}>
                <Aiux550HistoryRow
                  row={row}
                  expanded={isExpanded}
                  selected={row.id === effectiveActiveChatId}
                  selectedActive={selectedActive}
                  onSelect={() => onSelectChat?.(row.id)}
                  onToggleExpanded={() => onToggleRow?.(row.id)}
                />
                {row.children?.length && isExpanded ? (
                  <Aiux550HistoryRowChildren
                    sections={row.children}
                    rowId={row.id}
                    expandedSections={expandedSections}
                    onToggleSection={onToggleSection}
                    onOpenChangesList={onOpenChangesList}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function Aiux550HistoryRow({
  row,
  expanded,
  selected,
  selectedActive,
  onSelect,
  onToggleExpanded,
  nested = false,
}) {
  const hasChildren = Boolean(row.children?.length) || Boolean(row.chats?.length);
  const changeSummary = row.diff;
  const isSpec = row.kind === 'spec';

  return (
    <div
      className={[
        'aiux543-chat-row',
        nested ? 'aiux543-chat-subrow' : '',
        selected ? `selected ${selectedActive ? 'selected-active' : 'selected-inactive'}` : '',
        hasChildren ? 'expandable' : '',
        changeSummary ? 'has-change-summary' : '',
        row.planProgress ? 'has-status has-progress-plan' : '',
      ].filter(Boolean).join(' ')}
      onClick={onSelect}
    >
      {hasChildren ? (
        <span
          className="aiux543-chat-row-chevron"
          aria-expanded={expanded}
          onClick={(event) => {
            event.stopPropagation();
            onToggleExpanded?.();
          }}
        >
          <Aiux550ChevronIcon expanded={expanded} />
        </span>
      ) : (
        <span className="aiux543-chat-row-chevron-spacer" aria-hidden="true" />
      )}
      <span className="aiux543-chat-title">
        {isSpec ? (
          <IconMdTask className="aiux543-chat-burst aiux543-chat-md-icon" />
        ) : (
          <ReferenceChatAgentIcon agent={row.agent} mode={row.mode} />
        )}
        {row.cloud ? <ReferenceCloudMarker /> : null}
        <span>{row.title}</span>
      </span>
      <span className="aiux543-chat-row-meta">
        {row.status === 'approval' ? (
          <span className="aiux543-approval-dot-wrap" role="button" tabIndex={0} aria-label="Preview pending approval">
            <span className="aiux543-chat-activity-dot" aria-label="Awaiting confirmation" />
            <span className="aiux543-approval-dot-label">Approval</span>
          </span>
        ) : null}
        {row.planProgress ? (
          <span className="aiux543-progress-plan-wrap">
            <span className="aiux543-progress-plan-badge" aria-label={`Plan progress: ${row.planProgress.current} of ${row.planProgress.total}`} tabIndex={0}>
              <span>{row.planProgress.current}/{row.planProgress.total}</span>
              <span className="aiux543-spinner aiux543-progress-plan-spinner" aria-hidden="true" />
            </span>
          </span>
        ) : null}
        {changeSummary ? (
          <span className="aiux543-chat-change-summary" aria-label={`Changes: plus ${changeSummary.added}, minus ${changeSummary.deleted}`}>
            <span className="added">+{changeSummary.added}</span>
            <span className="deleted">-{changeSummary.deleted}</span>
          </span>
        ) : null}
        <span className="aiux543-chat-time">{row.time}</span>
      </span>
    </div>
  );
}

function Aiux550HistoryRowChildren({ sections, rowId, expandedSections, onToggleSection, onOpenChangesList }) {
  return (
    <div className="aiux543-chat-row-children">
      {sections.map((section) => {
        const sectionKey = `${rowId}:${section.id}`;
        const isExpanded = expandedSections[sectionKey] ?? false;
        return (
          <div className="aiux543-chat-row-child-section" key={section.id}>
            <div
              className={[
                'aiux543-chat-tree-row',
                'aiux543-chat-tree-section',
                'aiux543-chat-tree-section-header',
                section.id === 'changes' ? 'aiux543-chat-tree-section-with-action' : '',
              ].filter(Boolean).join(' ')}
              aria-expanded={isExpanded}
            >
              <button
                className="aiux543-chat-tree-section-toggle"
                type="button"
                aria-expanded={isExpanded}
                onClick={() => onToggleSection?.(sectionKey)}
              >
                <Aiux550ChevronIcon expanded={isExpanded} className="icon aiux543-chat-tree-chevron" />
                <Aiux550HistoryChildSectionIcon sectionId={section.id} />
                <span>{section.label}</span>
              </button>
              {section.id === 'changes' ? (
                <button
                  className="aiux543-chat-tree-section-link"
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpenChangesList?.(rowId);
                  }}
                >
                  See list
                </button>
              ) : null}
            </div>
            {isExpanded && section.items?.length ? (
              <div className="aiux543-chat-tree-children">
                {section.items.map((item) => {
                  const isObject = typeof item === 'object' && item !== null;
                  const label = isObject ? item.label : item;
                  const status = isObject ? item.status : undefined;
                  const isSubThread = section.id === 'sub-threads';
                  return (
                    <div className="aiux543-chat-tree-item" key={label}>
                      <button
                        className={[
                          'aiux543-chat-tree-row',
                          'aiux543-chat-tree-leaf',
                          'aiux543-chat-tree-leaf-openable',
                          isSubThread ? 'aiux543-chat-tree-subthread-leaf' : '',
                          !isSubThread && status ? `aiux543-chat-tree-leaf-${status}` : '',
                        ].filter(Boolean).join(' ')}
                        type="button"
                        style={{ '--tree-level': 1 }}
                      >
                        <span className="aiux543-chat-tree-chevron-spacer" />
                        {isSubThread ? (
                          <ReferenceChatAgentIcon agent={(isObject && item.agent) || 'claude'} mode={isObject ? item.mode : undefined} />
                        ) : (
                          <Aiux550TreeLeafIcon label={label} type={isObject ? item.type : undefined} />
                        )}
                        <span>{label}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function Aiux550HistoryChildSectionIcon({ sectionId }) {
  if (sectionId === 'changes') {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className="icon aiux543-chat-tree-icon" aria-hidden="true" focusable="false">
        <rect x="2" y="5" width="7" height="1" rx="0.5" fill="#CED0D6" />
        <rect x="2" y="8" width="5" height="1" rx="0.5" fill="#CED0D6" />
        <rect x="2" y="2" width="12" height="1" rx="0.5" fill="#CED0D6" />
        <path d="M8.5 14.5L10.5 12.5L8.5 10.5M5.5 12.5H10M12.5 10.5L10.5 8.5L12.5 6.5M15.5 8.5H11" stroke="#548AF7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (sectionId === 'context') {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className="icon aiux543-chat-tree-icon" aria-hidden="true" focusable="false">
        <path d="M8.10584 4.34613L8.25344 4.5H8.46667H13C13.8284 4.5 14.5 5.17157 14.5 6V12.1333C14.5 12.9529 13.932 13.5 13.3667 13.5H2.63333C2.06804 13.5 1.5 12.9529 1.5 12.1333V3.86667C1.5 3.04707 2.06804 2.5 2.63333 2.5H6.1217C6.25792 2.5 6.38824 2.55557 6.48253 2.65387L8.10584 4.34613Z" fill="#43454A" stroke="#CED0D6" />
      </svg>
    );
  }

  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className="icon aiux543-chat-tree-icon" aria-hidden="true" focusable="false">
      <path d="M10 8.5H14C14.8284 8.5 15.5 9.17157 15.5 10V15.0654L13.2773 13.584L13.1514 13.5H10C9.17157 13.5 8.5 12.8284 8.5 12V10C8.5 9.17157 9.17157 8.5 10 8.5Z" stroke="#CED0D6" />
      <path d="M7 12.7499C4.59166 12.1792 3 10.6818 3 8.77419C3 6.93548 4.67742 5.54839 6.91935 5.54839C8.59035 5.54839 9.78683 6.1856 9.97429 7.00011C9.98285 7.00004 9.99142 7 10 7H10.9875C10.8279 5.57487 9.1555 4.6129 6.87097 4.6129C4.04839 4.6129 2 6.35484 2 8.77419C2 11.2203 4.00509 13.136 7 13.7727V12.7499Z" fill="#CED0D6" />
      <path d="M7 11.0559C5.77102 10.6244 5 9.79844 5 8.74194C5 7.32258 6.46774 6.59677 8.27419 7.22581L8.132 7.65239C8.01712 7.74392 7.90912 7.8437 7.80888 7.95084C6.74081 7.67768 6 7.99192 6 8.74194C6 9.25818 6.37024 9.71746 7 10.0296V11.0559Z" fill="#CED0D6" />
      <path d="M13.9943 7C13.8461 4.10003 10.8462 2 6.75806 2C5.67742 2 4.35484 2.22581 3.58065 2.56452C3.19355 2.72581 3 2.91935 3 3.19355C3 3.54839 3.35484 3.77419 3.90323 3.54839C4.67742 3.20968 5.87097 3 6.75806 3C10.2591 3 12.8362 4.666 12.9925 7H13.9943Z" fill="#CED0D6" />
    </svg>
  );
}

function inferAiux550LeafType(label = '') {
  const lower = label.toLowerCase();
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'html';
  if (lower.endsWith('.css') || lower.endsWith('.scss')) return 'css';
  if (lower.endsWith('.java')) return 'java';
  if (lower.endsWith('.js') || lower.endsWith('.jsx') || lower.endsWith('.mjs')
    || lower.endsWith('.ts') || lower.endsWith('.tsx')) return 'js';
  // Markdown, JSON, XML and other plain files share the stacked-lines glyph.
  return 'text';
}

function Aiux550TreeLeafIcon({ type, label }) {
  const resolvedType = type ?? inferAiux550LeafType(label);
  const props = {
    width: 16,
    height: 16,
    viewBox: '0 0 16 16',
    fill: 'none',
    xmlns: 'http://www.w3.org/2000/svg',
    className: 'icon aiux543-chat-tree-icon',
    'aria-hidden': true,
    focusable: false,
  };

  if (resolvedType === 'html') {
    return (
      <svg {...props}>
        <path d="M6.36812 4.9736C6.62969 4.77016 6.67681 4.39319 6.47337 4.13163C6.26992 3.87006 5.89296 3.82294 5.63139 4.02638L0.522461 7.99999L5.63139 11.9736C5.89296 12.177 6.26992 12.1299 6.47337 11.8684C6.67681 11.6068 6.62969 11.2298 6.36812 11.0264L2.47705 7.99999L6.36812 4.9736Z" fill="#57965C" />
        <path d="M9.63139 4.9736C9.36983 4.77016 9.3227 4.39319 9.52615 4.13163C9.72959 3.87006 10.1066 3.82294 10.3681 4.02638L15.4771 7.99999L10.3681 11.9736C10.1066 12.177 9.72959 12.1299 9.52615 11.8684C9.3227 11.6068 9.36983 11.2298 9.63139 11.0264L13.5225 7.99999L9.63139 4.9736Z" fill="#57965C" />
      </svg>
    );
  }

  if (resolvedType === 'js') {
    return (
      <svg {...props}>
        <path d="M14 4C14 2.89543 13.1046 2 12 2H4C2.89543 2 2 2.89543 2 4V12C2 13.1046 2.89543 14 4 14H12C13.1046 14 14 13.1046 14 12V4Z" fill="#F2C55C" />
        <path d="M9.55434 11.8593C9.88209 12.0132 10.2583 12.0901 10.6829 12.0901C11.1047 12.0901 11.4795 12.0117 11.8073 11.855C12.135 11.6982 12.3901 11.4831 12.5725 11.2095C12.7549 10.933 12.8461 10.6238 12.8461 10.2818C12.8461 9.99963 12.7834 9.73315 12.658 9.48235C12.5326 9.23155 12.3545 9.02208 12.1236 8.85393C11.8956 8.68578 11.6348 8.57605 11.3413 8.52475L10.3452 8.3623C10.1429 8.3281 9.97899 8.24118 9.85359 8.10153C9.72819 7.95903 9.66549 7.79088 9.66549 7.59708C9.66549 7.43178 9.70824 7.28643 9.79374 7.16103C9.87924 7.03563 9.99894 6.93873 10.1528 6.87033C10.3067 6.80193 10.4849 6.76773 10.6872 6.76773C10.8896 6.76773 11.0677 6.80335 11.2216 6.8746C11.3755 6.94585 11.4952 7.04703 11.5807 7.17813C11.6662 7.30638 11.7089 7.45173 11.7089 7.61418H12.7221C12.7193 7.28073 12.6309 6.98433 12.4571 6.72498C12.2832 6.46563 12.041 6.26328 11.7303 6.11793C11.4225 5.97258 11.0705 5.8999 10.6744 5.8999C10.2868 5.8999 9.93909 5.97543 9.63129 6.12648C9.32349 6.27468 9.08266 6.4813 8.90881 6.74635C8.73781 7.00855 8.65231 7.30495 8.65231 7.63555C8.65231 7.912 8.70931 8.16708 8.82331 8.40078C8.94016 8.63163 9.10546 8.824 9.31921 8.9779C9.53296 9.1318 9.78519 9.2344 10.0759 9.2857L11.0891 9.4567C11.3114 9.49375 11.4895 9.5935 11.6234 9.75595C11.7574 9.91555 11.8244 10.1065 11.8244 10.3288C11.8244 10.5055 11.7773 10.6623 11.6833 10.7991C11.5921 10.933 11.461 11.037 11.29 11.1111C11.119 11.1852 10.9209 11.2223 10.6958 11.2223C10.4649 11.2223 10.2597 11.1824 10.0802 11.1026C9.90346 11.0199 9.76524 10.9045 9.66549 10.7563C9.56574 10.6081 9.51586 10.44 9.51586 10.2519H8.50269C8.50554 10.611 8.59959 10.9302 8.78484 11.2095C8.97009 11.4859 9.22659 11.7025 9.55434 11.8593Z" fill="#1E1F22" />
        <path d="M5.22179 11H4.21289V12H5.32012C5.64787 12 5.93857 11.9316 6.19222 11.7948C6.44587 11.6551 6.64394 11.4613 6.78644 11.2134C6.92894 10.9654 7.00019 10.6804 7.00019 10.3584L7.00024 6H5.99989L5.99984 10.222C5.99984 10.3759 5.96707 10.5127 5.90152 10.6324C5.83882 10.7492 5.74762 10.8404 5.62792 10.906C5.51107 10.9687 5.37569 11 5.22179 11Z" fill="#1E1F22" />
      </svg>
    );
  }

  if (resolvedType === 'css') {
    return (
      <svg {...props}>
        <path d="M7.99237 15L2.94069 13.6005L1.81494 1H14.1849L13.058 13.5985L7.99237 15Z" fill="#548AF7" />
        <path d="M4.25747 5.1211L4.1167 3.57568H11.8739L11.5943 6.70361L11.5565 7.1186L11.1693 11.4482L7.99978 12.3249L7.99266 12.327L4.82048 11.4482L4.60352 9.02173H6.15807L6.26832 10.2543L7.993 10.719L7.99463 10.7186L9.7218 10.2533L9.90155 8.249L4.53431 8.249L4.39551 6.70361H10.0358L10.1768 5.1211H4.25747Z" fill="white" />
      </svg>
    );
  }

  if (resolvedType === 'java') {
    return (
      <svg {...props}>
        <rect x="2" y="13" width="12" height="1" rx="0.5" fill="#C77D55" />
        <path d="M2.5 3C2.5 2.72386 2.72386 2.5 3 2.5H12C12.2761 2.5 12.5 2.72386 12.5 3V8C12.5 9.933 10.933 11.5 9 11.5H6C4.067 11.5 2.5 9.933 2.5 8V3Z" fill="#45322B" stroke="#C77D55" />
        <path d="M12.5 2.5H14.5C14.7761 2.5 15 2.72386 15 3V4.18121C15 4.78125 14.6424 5.32356 14.0909 5.55993L12.5 6.24173V2.5Z" stroke="#C77D55" />
      </svg>
    );
  }

  // Plain text-like files (xml, config, etc.) — four stacked lines.
  return (
    <svg {...props}>
      <rect x="2" y="12" width="8" height="1" rx="0.5" fill="#CED0D6" />
      <rect x="2" y="6" width="8" height="1" rx="0.5" fill="#CED0D6" />
      <rect x="2" y="9" width="12" height="1" rx="0.5" fill="#CED0D6" />
      <rect x="2" y="3" width="12" height="1" rx="0.5" fill="#CED0D6" />
    </svg>
  );
}

function ReferenceChatList({
  activeChatId,
  activeSpecId = null,
  groups,
  expandedProjects,
  expandedRows,
  expandedSections,
  selectedActive,
  className = '',
  onCreateThread,
  onOpenProject,
  onOpenSpecTask,
  onSelectChat,
  onToggleProject,
  onToggleRow,
  onToggleSection,
}) {
  const activeChatIsStandalone = groups.some((group) => (
    (group.rows ?? []).some((row) => (
      row?.kind !== 'section'
      && row?.kind !== 'spec'
      && row?.id === activeChatId
    ))
  ));

  return (
    <div className={`aiux543-chat-list ${className}`.trim()}>
      {groups.map((group) => {
        const projectName = group.project ?? group.title;
        const isProjectExpanded = expandedProjects[projectName] ?? true;
        let collapsedSectionId = null;

        return (
          <section key={projectName}>
            <ReferenceChatGroupHeader
              group={group}
              expanded={isProjectExpanded}
              onCreateThread={() => onCreateThread?.(projectName)}
              onOpenProject={group.projectAction ? () => onOpenProject?.(projectName) : null}
              onToggle={() => onToggleProject?.(projectName)}
            />
            {isProjectExpanded ? (
              <div className="aiux543-chat-group-rows">
                {group.rows.map((row) => {
                  if (row.kind === 'section') {
                    const sectionKey = `${projectName}:${row.id}`;
                    const expanded = expandedSections[sectionKey] ?? row.defaultExpanded ?? true;
                    collapsedSectionId = expanded ? null : sectionKey;
                    return (
                      <ReferenceChatSectionHeader
                        key={row.id}
                        expanded={expanded}
                        label={row.label}
                        onToggle={() => onToggleSection?.(sectionKey)}
                      />
                    );
                  }
                  if (collapsedSectionId) return null;
                  const isRowExpanded = expandedRows[row.id] ?? false;
                  if (row.kind === 'spec') {
                    const hasChats = Array.isArray(row.relatedChats) && row.relatedChats.length > 0;
                    const isSpecSelected = row.id === activeSpecId
                      && !activeChatIsStandalone
                      && !row.relatedChats?.some((chatRow) => chatRow.id === activeChatId);
                    return (
                      <div className="aiux543-chat-node aiux543-spec-node" key={row.id}>
                        <ReferenceChatRow
                          row={row}
                          expanded={isRowExpanded}
                          selected={isSpecSelected}
                          selectedActive={selectedActive}
                          onSelect={() => onOpenSpecTask?.(row.id)}
                          onToggleExpanded={() => onToggleRow?.(row.id)}
                        />
                        {hasChats && isRowExpanded ? (
                          <div className="aiux543-spec-related-chats">
                            {row.relatedChats.map((chatRow) => (
                              <ReferenceChatRow
                                key={chatRow.id}
                                row={chatRow}
                                expanded={false}
                                selected={chatRow.id === activeChatId}
                                selectedActive={selectedActive}
                                onSelect={() => onSelectChat?.(chatRow.id, row.id)}
                                onToggleExpanded={() => onToggleRow?.(chatRow.id)}
                                nested
                              />
                            ))}
                          </div>
                        ) : null}
                      </div>
                    );
                  }
                  return (
                    <div className="aiux543-chat-node" key={row.id}>
                      <ReferenceChatRow
                        row={row}
                        expanded={isRowExpanded}
                        selected={row.id === activeChatId}
                        selectedActive={selectedActive}
                        onSelect={() => onSelectChat?.(row.id)}
                        onToggleExpanded={() => onToggleRow?.(row.id)}
                      />
                      {row.children?.length && isRowExpanded ? (
                        <ReferenceChatRowChildren sections={row.children} />
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

function ReferenceChatGroupHeader({
  group,
  expanded,
  onCreateThread,
  onOpenProject,
  onToggle,
}) {
  const title = group.project ?? group.title;
  const projectAction = onOpenProject && group.projectAction ? `${group.projectAction}...` : '';
  return (
    <div className="aiux543-chat-group-header">
      <button className="aiux543-chat-group-toggle" type="button" aria-expanded={expanded} onClick={onToggle}>
        <Icon className="aiux543-chevron" name={expanded ? 'general/chevronDown' : 'general/chevronRight'} size={16} />
        {group.projectIcon ? <span className={`aiux543-project-chip ${group.projectTone ?? 'cobalt'}`}>{group.projectIcon}</span> : null}
        <span className={group.project ? 'project' : ''}>{title}</span>
      </button>
      <span className="aiux543-chat-group-separator" />
      {projectAction ? (
        <button className="aiux543-project-link" type="button" title={projectAction} aria-label={`${projectAction}: ${title}`} onClick={onOpenProject}>
          {projectAction}
        </button>
      ) : null}
      <button className="aiux543-new-thread-button" type="button" title={`New thread in ${title}`} aria-label={`New thread in ${title}`} onClick={onCreateThread}>
        <Icon name="general/add" size={16} />
      </button>
    </div>
  );
}

function ReferenceChatSectionHeader({ expanded, label, onToggle }) {
  return (
    <button className="aiux543-chat-history-section-header" type="button" aria-expanded={expanded} onClick={onToggle}>
      <span className="aiux543-chat-history-section-label">
        <Icon name={expanded ? 'general/chevronDown' : 'general/chevronRight'} size={16} />
        <span>{label}</span>
      </span>
      <span className="aiux543-chat-history-section-separator" />
    </button>
  );
}

function ReferenceChatRow({
  row,
  expanded,
  selected,
  selectedActive,
  onSelect,
  onToggleExpanded,
  nested = false,
}) {
  const isSpec = row.kind === 'spec';
  const hasChildren = isSpec
    ? Boolean(row.relatedChats?.length)
    : (!nested && Boolean(row.children?.length));
  const changeSummary = row.children?.find((child) => child.id === 'changes')?.summary;
  const isInteractive = typeof onSelect === 'function';
  const handleKeyDown = (event) => {
    if (!isInteractive) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    onSelect();
  };
  return (
    <div
      className={[
        'aiux543-chat-row',
        isInteractive ? 'aiux543-chat-row-clickable' : '',
        selected ? `selected ${selectedActive ? 'selected-active' : 'selected-inactive'}` : '',
        hasChildren ? 'expandable' : '',
        changeSummary ? 'has-change-summary' : '',
        nested ? 'aiux543-chat-row-nested' : '',
      ].filter(Boolean).join(' ')}
      role={isInteractive ? 'button' : undefined}
      tabIndex={isInteractive ? 0 : undefined}
      onClick={onSelect}
      onKeyDown={handleKeyDown}
    >
      {hasChildren ? (
        <button
          className="aiux543-chat-row-chevron"
          type="button"
          title={expanded ? 'Collapse chat details' : 'Expand chat details'}
          aria-label={expanded ? `Collapse ${row.title}` : `Expand ${row.title}`}
          aria-expanded={expanded}
          onClick={(event) => {
            event.stopPropagation();
            onToggleExpanded?.();
          }}
        >
          <Icon name={expanded ? 'general/chevronDown' : 'general/chevronRight'} size={16} />
        </button>
      ) : null}
      <span className="aiux543-chat-title">
        {row.kind === 'spec' ? <IconMdTask /> : <ReferenceChatAgentIcon agent={row.agent} mode={row.mode} />}
        {row.cloud ? <ReferenceCloudMarker /> : null}
        <span>{row.title}</span>
      </span>
      {changeSummary ? (
        <span className="aiux543-chat-change-summary" aria-label={`Changes: plus ${changeSummary.added}, minus ${changeSummary.deleted}`}>
          <span className="added">+{changeSummary.added}</span>
          <span className="deleted">-{changeSummary.deleted}</span>
        </span>
      ) : null}
      <ReferenceChatStatus status={row.status} />
      <span className="aiux543-chat-time">{row.time}</span>
    </div>
  );
}

function ReferenceChatAgentIcon({ agent, mode }) {
  const className = "aiux543-chat-burst aiux543-agent-icon";
  if (mode === 'green' || agent === 'junie') return <ReferenceJunieIcon className={className} />;
  if (agent === 'codex') return <ReferenceCodexIcon className={className} />;
  return <ReferenceClaudeIcon className={className} />;
}

function ReferenceClaudeIcon({ className = '' } = {}) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden="true" focusable="false" data-agent="claude">
      <path d="M3.74684 10.3074L6.50076 8.76322L6.54684 8.62864L6.50076 8.55426H6.36608L5.90532 8.52593L4.33165 8.48343L2.96709 8.42676L1.64506 8.35593L1.3119 8.2851L1 7.87427L1.0319 7.66886L1.3119 7.48115L1.71241 7.51657L2.59848 7.57678L3.92759 7.66886L4.89165 7.72553L6.32 7.87427H6.54684L6.57873 7.78219L6.50076 7.72553L6.44051 7.66886L5.06532 6.73741L3.57671 5.75285L2.79696 5.18619L2.37519 4.89932L2.16253 4.63015L2.07038 4.04225L2.45316 3.62079L2.96709 3.65621L3.09823 3.69163L3.61924 4.09183L4.73215 4.95244L6.18532 6.02201L6.39797 6.19909L6.48304 6.13888L6.49367 6.09638L6.39797 5.93701L5.6076 4.50974L4.76405 3.05768L4.38835 2.4556L4.28911 2.09436C4.25367 1.94561 4.22886 1.82165 4.22886 1.66937L4.66481 1.07792L4.90582 1L5.48709 1.07792L5.73165 1.29041L6.09316 2.11561L6.67797 3.41538L7.58532 5.18265L7.85114 5.70681L7.99291 6.19201L8.04608 6.34075H8.13823V6.25576L8.21266 5.26056L8.35089 4.0387L8.48557 2.46623L8.53165 2.02353L8.75139 1.49228L9.18734 1.20541L9.5276 1.36833L9.80759 1.76853L9.76861 2.02707L9.60203 3.10726L9.27595 4.80015L9.06329 5.93347H9.18734L9.32911 5.7918L9.90329 5.03036L10.8673 3.82621L11.2927 3.34809L11.7889 2.82039L12.1078 2.56893H12.7104L13.1534 3.22768L12.9549 3.90767L12.3347 4.6939L11.8208 5.35973L11.0835 6.35138L10.6228 7.1447L10.6653 7.20845L10.7752 7.19782L12.441 6.84366L13.3413 6.68075L14.4152 6.49659L14.9008 6.72325L14.9539 6.95345L14.7625 7.42449L13.6142 7.70782L12.2673 7.97698L10.2613 8.45156L10.2365 8.46926L10.2648 8.50468L11.1686 8.58968L11.5549 8.61093H12.5013L14.2628 8.74197L14.7235 9.04655L15 9.41842L14.9539 9.70175L14.2451 10.063L13.2881 9.83633L11.0552 9.30508L10.2896 9.11384H10.1833V9.17759L10.8213 9.80091L11.9909 10.8563L13.4547 12.2163L13.5291 12.5527L13.3413 12.8184L13.1428 12.79L11.8562 11.8232L11.36 11.3876L10.2365 10.4419H10.162V10.5411L10.4208 10.9201L11.7889 12.9742L11.8597 13.6046L11.7605 13.81L11.4061 13.934L11.0162 13.8631L10.2152 12.7405L9.38937 11.4761L8.72304 10.3428L8.64152 10.3888L8.2481 14.621L8.0638 14.8371L7.63848 15L7.28405 14.7308L7.0962 14.2952L7.28405 13.4346L7.51089 12.3119L7.69519 11.4194L7.86177 10.3109L7.96101 9.94258L7.95392 9.91778L7.8724 9.92841L7.03595 11.0759L5.76354 12.7936L4.75696 13.8702L4.51595 13.9658L4.09772 13.7498L4.13671 13.3638L4.37063 13.0202L5.76354 11.2494L6.60354 10.1515L7.14582 9.51758L7.14228 9.4255H7.11038L3.41013 11.8267L2.75089 11.9117L2.46734 11.6461L2.50278 11.2105L2.63747 11.0688L3.75038 10.3038L3.74684 10.3074Z" fill="#D97757" />
    </svg>
  );
}

function ReferenceJunieIcon({ className = '' } = {}) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden="true" focusable="false" data-agent="junie">
      <path d="M10.3688 5.66597H15.0369V6.44399C15.0369 11.8883 12.7028 15.0004 6.48051 15.0004H5.70251V10.3322H6.48051C9.2036 10.3322 10.3707 9.16517 10.3707 6.44208V5.66406L10.3688 5.66597Z" fill="#48E054" />
      <path d="M5.66815 5.66602H1V10.3342H5.66815V5.66602Z" fill="#48E054" />
      <path d="M10.3364 1H5.66821V5.66815H10.3364V1Z" fill="#48E054" />
    </svg>
  );
}

function ReferenceCodexIcon({ className = '' } = {}) {
  return <AiChatCodexIcon className={className} />;
}

function ReferenceCloudMarker() {
  return (
    <svg className="aiux543-cloud-marker" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
      <path fill="currentColor" fillRule="evenodd" clipRule="evenodd" d="M8 4C6.80272 4 5.76826 4.70135 5.28689 5.71782L5.1583 5.98935L4.85818 6.00328C3.26739 6.07711 2 7.39069 2 9C2 10.6569 3.34315 12 5 12H11.5C12.8807 12 14 10.8807 14 9.5C14 8.11976 12.8815 7.00076 11.5014 7C11.5009 7 11.5005 7 11.5 7L11.0314 7.00276L10.9696 6.57098C10.7618 5.11752 9.51098 4 8 4ZM4.51881 5.02868C5.20575 3.81809 6.5069 3 8 3C9.87134 3 11.4419 4.28465 11.879 6.02029C13.6338 6.20925 15 7.69507 15 9.5C15 11.433 13.433 13 11.5 13H5C2.79086 13 1 11.2091 1 9C1 6.9537 2.53638 5.2665 4.51881 5.02868Z" />
    </svg>
  );
}

function ReferenceChatStatus({ status }) {
  if (status === 'loading') return <span className="aiux543-spinner" aria-hidden="true" />;
  if (status === 'ready') return <span className="aiux543-ready-dot" aria-hidden="true" />;
  if (status === 'progress') return <span className="aiux543-progress-dot" aria-hidden="true" />;
  return <span aria-hidden="true" />;
}

function ReferenceChatRowChildren({ sections }) {
  const [expandedSections, setExpandedSections] = useState(() => (
    Object.fromEntries(sections.map((section) => [section.id, true]))
  ));
  const getIconName = (item, sectionId) => {
    const label = typeof item === 'string' ? item : item.label;
    if (label.endsWith('.html')) return 'fileTypes/html';
    if (label.endsWith('.js') || label.endsWith('.jsx')) return 'fileTypes/javaScript';
    if (label.endsWith('.css')) return 'fileTypes/css';
    if (label.endsWith('.java')) return 'fileTypes/java';
    if (label.endsWith('.md')) return 'fileTypes/markdown';
    if (sectionId === 'branches') return 'vcs/branch';
    return 'fileTypes/text';
  };

  return (
    <div className="aiux543-chat-row-children">
      {sections.map((section) => {
        const isExpanded = expandedSections[section.id] ?? true;
        return (
          <div className="aiux543-chat-row-child-section" key={section.id}>
            <button
              className="aiux543-chat-tree-row aiux543-chat-tree-section"
              type="button"
              aria-expanded={isExpanded}
              onClick={() => setExpandedSections((prev) => ({ ...prev, [section.id]: !isExpanded }))}
            >
              <Icon className="aiux543-chat-tree-chevron" name={isExpanded ? 'general/chevronDown' : 'general/chevronRight'} size={16} />
              <Icon className="aiux543-chat-tree-icon" name="nodes/folder" size={16} />
              <span>{section.label}</span>
            </button>
            {isExpanded ? (
              <div className="aiux543-chat-tree-children">
                {section.items.map((item) => {
                  const label = typeof item === 'string' ? item : item.label;
                  const status = typeof item === 'string' ? null : item.status;
                  const rowClassName = [
                    'aiux543-chat-tree-row',
                    'aiux543-chat-tree-leaf',
                    section.id === 'changes' && status ? `aiux543-chat-tree-leaf-${status}` : '',
                    section.id === 'branches' ? 'aiux543-chat-tree-branch-leaf' : '',
                    section.id === 'sub-threads' ? 'aiux543-chat-tree-subthread-leaf' : '',
                  ].filter(Boolean).join(' ');

                  return (
                    <div className={rowClassName} key={label}>
                      <span className="aiux543-chat-tree-chevron-spacer" />
                      {section.id === 'sub-threads' ? (
                        <ReferenceChatAgentIcon agent={typeof item === 'string' ? 'claude' : item.agent} mode={typeof item === 'string' ? undefined : item.mode} />
                      ) : (
                        <Icon className="aiux543-chat-tree-icon" name={getIconName(item, section.id)} size={16} />
                      )}
                      <span>{label}</span>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

const MY_PROJECTS = [
  { id: '1', name: 'commons-math', path: '~/commons-math', initials: 'CM', gradient: ['#548AF7', '#2E4D89'] },
  { id: '2', name: 'auth-module',     path: '~/projects/auth-module',     initials: 'AM', gradient: ['#8b5cf6', '#6d28d9'] },
  { id: '3', name: 'api-gateway',     path: '~/projects/api-gateway',     initials: 'AG', gradient: ['#10b981', '#059669'] },
];

const MY_EDITOR_TABS = [
  { id: '1', label: 'AdapterScript.java',            icon: 'fileTypes/java', closable: true },
  { id: '2', label: 'FunctionUtils.java',            icon: 'fileTypes/java', closable: true },
  { id: '3', label: 'add-hover.svg',                 icon: 'fileTypes/svg', closable: true },
  { id: '4', label: 'AdapterScriptInterface.java',   icon: 'fileTypes/java', closable: true },
  { id: '5', label: 'AccurateMath.java',             icon: 'fileTypes/java', closable: true },
];

const MY_EDITOR_TAB_CONTENTS = {
  '1': {
    language: 'java',
    code: `@Controller
class VisitController {

    private final OwnerRepository ownerRepository;
    private final VisitRepository visitRepository;
    private final VetRepository vetRepository;

    public VisitController(
            OwnerRepository ownerRepository,
            VisitRepository visitRepository,
            VetRepository vetRepository) {
        this.ownerRepository = ownerRepository;
        this.visitRepository = visitRepository;
        this.vetRepository = vetRepository;
    }

    @ModelAttribute("vets")
    public Collection<Vet> populateVets(
            @RequestParam(required = false) @DateTimeFormat(pattern = "yyyy-MM-dd") LocalDate date,
            @RequestParam(required = false) @DateTimeFormat(pattern = "HH:mm") LocalTime time) {
        if (date == null || time == null) {
            return this.vetRepository.findAll();
        }
        return this.vetRepository.findAvailableFor(date, time);
    }

    @ModelAttribute("timeSlots")
    public List<LocalTime> populateTimeSlots() {
        List<LocalTime> slots = new ArrayList<>();
        for (int hour = 9; hour <= 16; hour++) {
            slots.add(LocalTime.of(hour, 0));
        }
        return slots;
    }

    @GetMapping("/owners/{ownerId}/pets/{petId}/visits/new")
    public String initNewVisitForm(@PathVariable int ownerId, @PathVariable int petId, Map<String, Object> model) {
        Owner owner = this.ownerRepository.findById(ownerId);
        Pet pet = owner.getPet(petId);
        Visit visit = new Visit();
        pet.addVisit(visit);
        model.put("visit", visit);
        return "pets/createOrUpdateVisitForm";
    }

    @PostMapping("/owners/{ownerId}/pets/{petId}/visits/new")
    public String processNewVisitForm(@PathVariable int ownerId,
                                      @PathVariable int petId,
                                      @Valid Visit visit,
                                      BindingResult result,
                                      Model model) {
        if (visit.getVet() != null && visit.getDate() != null && visit.getTime() != null
                && this.visitRepository.existsByVetIdAndDateAndTime(
                    visit.getVet().getId(), visit.getDate(), visit.getTime())) {
            result.rejectValue("time", "duplicate",
                "This vet is already booked for the selected date and time.");
        }

        if (result.hasErrors()) {
            model.addAttribute("vets", populateVets(visit.getDate(), visit.getTime()));
            model.addAttribute("timeSlots", populateTimeSlots());
            return "pets/createOrUpdateVisitForm";
        }

        try {
            Owner owner = this.ownerRepository.findById(ownerId);
            Pet pet = owner.getPet(petId);
            pet.addVisit(visit);
            this.visitRepository.save(visit);
        }
        catch (DataIntegrityViolationException ex) {
            result.rejectValue("time", "duplicate",
                "Concurrent booking detected. Please choose another slot.");
            model.addAttribute("vets", populateVets(visit.getDate(), visit.getTime()));
            model.addAttribute("timeSlots", populateTimeSlots());
            return "pets/createOrUpdateVisitForm";
        }
        return "redirect:/owners/{ownerId}";
    }
}`,
  },
  '2': {
    language: 'java',
    code: `@Entity
@Table(name = "visits")
public class Visit extends BaseEntity {

    @Column(name = "visit_date")
    @DateTimeFormat(pattern = "yyyy-MM-dd")
    @NotNull
    private LocalDate date;

    @Column(name = "visit_time")
    @NotNull
    private LocalTime time;

    @Column(name = "description")
    private String description;

    @ManyToOne
    @JoinColumn(name = "vet_id")
    @NotNull
    private Vet vet;

    @ManyToOne
    @JoinColumn(name = "pet_id")
    private Pet pet;

    public LocalDate getDate() { return this.date; }
    public void setDate(LocalDate date) { this.date = date; }

    public LocalTime getTime() { return this.time; }
    public void setTime(LocalTime time) { this.time = time; }

    public String getDescription() { return this.description; }
    public void setDescription(String description) { this.description = description; }

    public Vet getVet() { return this.vet; }
    public void setVet(Vet vet) { this.vet = vet; }

    public Pet getPet() { return this.pet; }
    public void setPet(Pet pet) { this.pet = pet; }
}`,
  },
  '3': {
    language: 'html',
    code: `<html xmlns:th="https://www.thymeleaf.org">
<body>
  <h2>New Visit</h2>
  <form th:object="\${visit}"
        th:action="@{/owners/{ownerId}/pets/{petId}/visits/new(ownerId=\${owner.id},petId=\${pet.id})}"
        method="post">

    <div>
      <label>Date</label>
      <input type="date" th:field="*{date}" />
    </div>

    <div>
      <label>Vet</label>
      <select th:field="*{vet}">
        <option value="">-- select vet --</option>
        <option th:each="vet : \${vets}"
                th:value="\${vet}"
                th:text="\${vet.firstName + ' ' + vet.lastName}"></option>
      </select>
    </div>

    <div>
      <label>Time</label>
      <select th:field="*{time}">
        <option value="">-- select time --</option>
        <option th:each="slot : \${timeSlots}"
                th:value="\${slot}"
                th:text="\${#temporals.format(slot, 'HH:mm')}"></option>
      </select>
    </div>

    <div>
      <label>Description</label>
      <textarea th:field="*{description}" rows="3"></textarea>
    </div>

    <button type="submit">Add Visit</button>
  </form>
</body>
</html>`,
  },
  '4': {
    language: 'sql',
    code: `DROP TABLE IF EXISTS visits;
DROP TABLE IF EXISTS pets;
DROP TABLE IF EXISTS types;
DROP TABLE IF EXISTS vets;
DROP TABLE IF EXISTS owners;

CREATE TABLE vets (
    id          INTEGER IDENTITY PRIMARY KEY,
    first_name  VARCHAR(30),
    last_name   VARCHAR(30)
);

CREATE TABLE visits (
    id          INTEGER IDENTITY PRIMARY KEY,
    pet_id      INTEGER NOT NULL,
    vet_id      INTEGER NOT NULL,
    visit_date  DATE NOT NULL,
    visit_time  TIME NOT NULL,
    description VARCHAR(255),
    CONSTRAINT fk_visits_pet FOREIGN KEY (pet_id) REFERENCES pets(id),
    CONSTRAINT fk_visits_vet FOREIGN KEY (vet_id) REFERENCES vets(id),
    CONSTRAINT uk_vet_date_time UNIQUE (vet_id, visit_date, visit_time)
);`,
  },
  '5': {
    language: 'java',
    code: `@WebMvcTest(VisitController.class)
class VisitControllerTests {

    @MockBean
    private VisitRepository visitRepository;

    @Test
    void processNewVisitFormDoubleBookingRejected() throws Exception {
        when(visitRepository.existsByVetIdAndDateAndTime(
                3, LocalDate.parse("2026-04-15"), LocalTime.of(10, 0)))
            .thenReturn(true);

        mockMvc.perform(post("/owners/1/pets/1/visits/new")
                .param("date", "2026-04-15")
                .param("time", "10:00")
                .param("vet", "3")
                .param("description", "Regular check"))
            .andExpect(status().isOk())
            .andExpect(model().attributeHasFieldErrors("visit", "vet"))
            .andExpect(view().name("pets/createOrUpdateVisitForm"));
    }
}`,
  },
};

const MY_COMMIT_FILES = [
  {
    id: 'changes',
    label: 'Changes',
    count: '2 files',
    isExpanded: true,
    children: [
      {
        id: 'adapter-script',
        label: 'AdapterScript.java',
        path: '~/IdeaProjects/FastMath/src/main/java/com/example',
        icon: 'fileTypes/java',
        status: 'modified',
      },
      {
        id: 'function-utils',
        label: 'FunctionUtils.java',
        path: '~/IdeaProjects/FastMath/src/main/java/com/example',
        icon: 'fileTypes/java',
        status: 'modified',
      },
    ],
  },
  {
    id: 'unversioned',
    label: 'Unversioned Files',
    count: '1 file',
    isExpanded: false,
    children: [
      {
        id: 'adapter-script-interface',
        label: 'AdapterScriptInterface.java',
        path: '~/IdeaProjects/FastMath/src/main/java/com/example',
        icon: 'fileTypes/java',
        status: 'added',
      },
    ],
  },
];

function CommitStatusBadge({ status }) {
  const label = status === 'added' ? 'A' : status === 'deleted' ? 'D' : 'M';
  return <span className={`commit-reference-status ${status ?? 'modified'}`}>{label}</span>;
}

function commitFileIconName(fileName = '') {
  const f = fileName.toLowerCase();
  if (f.endsWith('.html') || f.endsWith('.htm')) return 'fileTypes/html';
  if (f.endsWith('.js') || f.endsWith('.jsx')) return 'fileTypes/javaScript';
  if (f.endsWith('.css') || f.endsWith('.scss')) return 'fileTypes/css';
  if (f.endsWith('.java')) return 'fileTypes/java';
  if (f.endsWith('.md')) return 'fileTypes/markdown';
  if (f.endsWith('.xml')) return 'fileTypes/xml';
  if (f.endsWith('.json')) return 'fileTypes/json';
  return 'fileTypes/text';
}

function normalizeCommitFileStatus(status) {
  return status === 'added' || status === 'deleted' || status === 'modified' ? status : 'modified';
}

// Group each chat's Changes into a CommitWindow file group, mirroring the
// library's `buildChatAssociatedCommitGroups`: the chat's agent icon + title is
// the group header, its changed files (with per-file status) are the children.
function buildAiux550CommitGroups() {
  return buildAiux550HistoryRows()
    .map((row) => {
      const changes = row.children?.find((section) => section.id === 'changes');
      const items = (changes?.items ?? []).filter((item) => typeof item === 'object' && item !== null);
      if (!items.length) return null;
      return {
        id: `chat-changes-${row.id}`,
        icon: <ReferenceChatAgentIcon agent={row.agent} mode={row.mode} />,
        label: row.title,
        count: `${items.length} ${items.length === 1 ? 'file' : 'files'}`,
        isExpanded: true,
        children: items.map((item, index) => ({
          id: `${row.id}-${item.label}-${index}`,
          label: item.label,
          path: `~/IdeaProjects/commons-math/AI chats/${row.title}`,
          icon: commitFileIconName(item.label),
          status: normalizeCommitFileStatus(item.status),
        })),
      };
    })
    .filter(Boolean);
}

// The library renders the Commit tool window with the kit's native CommitWindow
// (see designers/*/AIUX-543 -> <CommitWindow files={chatAssociatedCommitGroups} />),
// not a bespoke layout. Use it here so the look matches the library exactly.
function ReferenceCommitToolWindow({ ctx }) {
  const files = useMemo(() => buildAiux550CommitGroups(), []);
  return (
    <CommitWindow
      title="Commit"
      width="100%"
      height="100%"
      className="commit-window main-window-tool-window main-window-tool-window-left aiux550-chat-commit-tool-window"
      commitMessage="Update chat-associated changes"
      messagePlaceholder="Commit message for selected chat changes"
      files={files}
      focused={ctx.focusedPanel === 'left'}
      onFocus={() => ctx.setFocusedPanel('left')}
      onActionClick={(action) => {
        if (action === 'minimize') ctx.setShowLeftPanel(false);
      }}
    />
  );
}

const PLAN_CODE_DIFF_PRESETS = {
  0: {
    fileLabel: 'schema.sql',
    language: 'sql',
    beforeCode: `CREATE TABLE visits (
    id          INTEGER IDENTITY PRIMARY KEY,
    pet_id      INTEGER NOT NULL,
    visit_date  DATE NOT NULL,
    description VARCHAR(255),
    CONSTRAINT fk_visits_pet FOREIGN KEY (pet_id) REFERENCES pets(id)
);`,
    afterCode: `CREATE TABLE visits (
    id          INTEGER IDENTITY PRIMARY KEY,
    pet_id      INTEGER NOT NULL,
    vet_id      INTEGER NOT NULL,
    visit_date  DATE NOT NULL,
    visit_time  TIME NOT NULL,
    description VARCHAR(255),
    CONSTRAINT fk_visits_pet FOREIGN KEY (pet_id) REFERENCES pets(id),
    CONSTRAINT fk_visits_vet FOREIGN KEY (vet_id) REFERENCES vets(id),
    CONSTRAINT uk_vet_date_time UNIQUE (vet_id, visit_date, visit_time)
);`,
  },
  1: {
    fileLabel: 'Visit.java',
    language: 'java',
    beforeCode: `@Entity
@Table(name = "visits")
public class Visit extends BaseEntity {

    @Column(name = "visit_date")
    @DateTimeFormat(pattern = "yyyy-MM-dd")
    @NotNull
    private LocalDate date;

    @Column(name = "description")
    private String description;
}`,
    afterCode: `@Entity
@Table(name = "visits")
public class Visit extends BaseEntity {

    @Column(name = "visit_date")
    @DateTimeFormat(pattern = "yyyy-MM-dd")
    @NotNull
    private LocalDate date;

    @Column(name = "visit_time")
    @NotNull
    private LocalTime time;

    @ManyToOne
    @JoinColumn(name = "vet_id")
    @NotNull
    private Vet vet;

    @Column(name = "description")
    private String description;
}`,
  },
  2: {
    fileLabel: 'VisitRepository.java',
    language: 'java',
    beforeCode: `public interface VisitRepository extends CrudRepository<Visit, Integer> {
}`,
    afterCode: `public interface VisitRepository extends CrudRepository<Visit, Integer> {

    boolean existsByVetIdAndDateAndTime(Integer vetId, LocalDate date, LocalTime time);
}`,
  },
  3: {
    fileLabel: 'ownerDetails.html',
    language: 'html',
    beforeCode: `<table>
  <thead>
    <tr>
      <th>Date</th>
      <th>Description</th>
    </tr>
  </thead>
</table>`,
    afterCode: `<table>
  <thead>
    <tr>
      <th>Date</th>
      <th>Time</th>
      <th>Vet</th>
      <th>Description</th>
    </tr>
  </thead>
</table>`,
  },
  4: {
    fileLabel: 'VisitController.java',
    language: 'java',
    beforeCode: `@ModelAttribute("timeSlots")
public List<LocalTime> populateTimeSlots() {
    List<LocalTime> slots = new ArrayList<>();
    for (int hour = 9; hour <= 16; hour++) {
        slots.add(LocalTime.of(hour, 0));
    }
    return slots;
}`,
    afterCode: `private final List<LocalTime> timeSlots;

public VisitController(...) {
    this.timeSlots = IntStream.rangeClosed(9, 16)
        .mapToObj(hour -> LocalTime.of(hour, 0))
        .toList();
}

@ModelAttribute("timeSlots")
public List<LocalTime> populateTimeSlots() {
    return this.timeSlots;
}`,
  },
  5: {
    fileLabel: 'createOrUpdateVisitForm.html',
    language: 'html',
    beforeCode: `<form th:object="\${visit}" method="post">
  <input type="date" th:field="*{date}" />
  <textarea th:field="*{description}"></textarea>
</form>`,
    afterCode: `<form th:object="\${visit}" method="post">
  <input type="date" th:field="*{date}" />
  <select th:field="*{vet}"></select>
  <select th:field="*{time}"></select>
  <textarea th:field="*{description}"></textarea>
</form>`,
  },
  6: {
    fileLabel: 'VisitControllerTests.java',
    language: 'java',
    beforeCode: `@WebMvcTest(VisitController.class)
class VisitControllerTests {

    @Test
    void initCreationFormDoesNotExposeVetChoices() throws Exception {
        mockMvc.perform(get("/owners/1/pets/1/visits/new"))
            .andExpect(status().isOk());
    }
}`,
    afterCode: `@WebMvcTest(VisitController.class)
class VisitControllerTests {

    @Test
    void rejectsDoubleBookingForSameVetAndTime() throws Exception {
        when(visitRepository.existsByVetIdAndDateAndTime(3, LocalDate.parse("2026-04-15"), LocalTime.of(10, 0)))
            .thenReturn(true);

        mockMvc.perform(post("/owners/1/pets/1/visits/new")
                .param("date", "2026-04-15")
                .param("time", "10:00")
                .param("vet", "3"))
            .andExpect(model().attributeHasFieldErrors("visit", "time"));
    }
}`,
  },
};

const MY_PROJECT_TREE = [
  {
    id: 'root',
    label: PROJECT_NAME,
    icon: 'nodes/folder',
    secondaryText: PROJECT_ROOT_PATH_DISPLAY,
    isExpanded: true,
    children: [
      { id: 'idea', label: '.idea', icon: 'nodes/folder' },
      {
        id: 'src',
        label: 'src',
        icon: 'nodes/folder',
        isExpanded: true,
        children: [
          {
            id: 'main-java',
            label: 'java',
            icon: 'nodes/sourceRoot',
            isExpanded: true,
            children: [
              {
                id: 'analysis',
                label: 'analysis',
                icon: 'nodes/package',
                isExpanded: true,
                children: [
                  { id: 'bivariate-function', label: 'BivariateFunction', icon: 'nodes/class' },
                  { id: 'function-utils', label: 'FunctionUtils', icon: 'nodes/class' },
                  { id: 'multivariate-function', label: 'MultivariateFunction', icon: 'nodes/interface' },
                  { id: 'trivariate-function', label: 'TrivariateFunction', icon: 'nodes/interface' },
                ],
              },
              {
                id: 'polynomials',
                label: 'polynomials',
                icon: 'nodes/package',
                isExpanded: true,
                children: [
                  { id: 'polynomial-function', label: 'PolynomialFunction', icon: 'nodes/class' },
                  { id: 'polynomial-spline-function', label: 'PolynomialSplineFunction', icon: 'nodes/class' },
                  { id: 'polynomial-lagrange-form', label: 'PolynomialFunctionLagrangeForm', icon: 'nodes/class' },
                ],
              },
              {
                id: 'solver',
                label: 'solver',
                icon: 'nodes/package',
                isExpanded: true,
                children: [
                  { id: 'bisection-solver', label: 'BisectionSolver', icon: 'nodes/class' },
                  { id: 'brent-solver', label: 'BrentSolver', icon: 'nodes/class' },
                  { id: 'univariate-solver', label: 'UnivariateSolver', icon: 'nodes/interface' },
                ],
              },
            ],
          },
        ],
      },
      {
        id: 'test',
        label: 'test',
        icon: 'nodes/folder',
        isExpanded: true,
        children: [
          {
            id: 'test-java',
            label: 'java',
            icon: 'nodes/testRoot',
            isExpanded: true,
            children: [
              { id: 'function-utils-test', label: 'FunctionUtilsTest', icon: 'nodes/class' },
              { id: 'monitored-function', label: 'MonitoredFunction', icon: 'nodes/class' },
              { id: 'sum-sync-function', label: 'SumSyncFunction', icon: 'nodes/class' },
            ],
          },
        ],
      },
      {
        id: 'target',
        label: 'target',
        icon: 'nodes/excludeRoot',
        isExpanded: true,
        children: [
          {
            id: 'target-classes',
            label: 'classes',
            icon: 'nodes/excludeRoot',
            isExpanded: true,
            children: [
              {
                id: 'target-org',
                label: 'org',
                icon: 'nodes/package',
                isExpanded: true,
                children: [
                  {
                    id: 'target-analysis',
                    label: 'analysis',
                    icon: 'nodes/package',
                    isExpanded: true,
                    children: [
                      { id: 'function-utils-class', label: 'FunctionUtils.class', icon: 'fileTypes/javaClass' },
                      { id: 'polynomial-function-class', label: 'PolynomialFunction.class', icon: 'fileTypes/javaClass' },
                    ],
                  },
                ],
              },
            ],
          },
          { id: 'target-generated', label: 'generated-sources', icon: 'nodes/excludeRoot' },
          { id: 'target-annotations', label: 'annotations', icon: 'nodes/folder' },
          { id: 'target-nullability', label: 'NullabilityInfo', icon: 'fileTypes/text' },
          { id: 'maven-status', label: 'maven-status', icon: 'nodes/folder' },
          { id: 'maven-compiler-plugin', label: 'maven-compiler-plugin', icon: 'nodes/folder' },
          { id: 'input-files', label: 'inputFiles.lst', icon: 'fileTypes/text' },
          { id: 'build-info', label: 'BuildInfo', icon: 'fileTypes/text' },
        ],
      },
      { id: 'gitignore',         label: '.gitignore',         icon: 'fileTypes/text' },
      { id: 'external-libraries', label: 'External Libraries', icon: 'nodes/library' },
      { id: 'jdk21', label: 'JDK 21', icon: 'nodes/library' },
      { id: 'commons-lang', label: 'commons-lang3-3.14.0.jar', icon: 'nodes/ppLibFolder' },
      { id: 'junit', label: 'junit-jupiter-api-5.10.2.jar', icon: 'nodes/ppLibFolder' },
      { id: 'hamcrest', label: 'hamcrest-2.2.jar', icon: 'nodes/ppLibFolder' },
    ],
  },
];

const PROJECT_ROOT_PATH = '~/commons-math';
const AGENT_SPECS_PATH = `${PROJECT_ROOT_PATH}/Agent Specifications`;
const PROBLEMS_SECONDARY_GAP = '\u00A0\u00A0\u00A0';
const TERMINAL_RUN_INPUT = { path: AGENT_SPECS_PATH, branch: BRANCH_NAME };
const TERMINAL_RUN_VISIBLE_DELAY_MS = 110;
const TERMINAL_RUN_INITIAL_DELAY_MS = 160;
const TERMINAL_RUN_STEP_DELAY_MS = 240;
const TERMINAL_RUN_END_DELAY_MS = 260;
const RUN_STATUS_REVEAL_STEP_DELAY_MS = 120;
const CHAINED_SECTION_START_DELAY_MS = 220;
const TERMINAL_PERMISSION_PROMPT = 'Allow agent execution?';
const TERMINAL_PERMISSION_OPTIONS = [
  { id: 'allow-once', label: 'Allow once' },
  { id: 'allow-session', label: 'Allow for session' },
  { id: 'reject', label: 'Reject' },
];
const AC_WARNING_TARGET_ORIGINAL_INDEX = 0;
const AC_WARNING_PROMPT = 'AC #1 partially met. Pre-filtering works on POST re-renders (booked vets excluded via findByDateAndTime). But on initial page load, no date/time is selected — @RequestParam values are null — so all vets are shown. AC says "available vets for the selected date/time", implying always-filtered. Full filtering on date selection would require AJAX (out of scope). Suggest rewording AC.';

function buildTerminalBlocks(lines = []) {
  return lines.length > 0
    ? [{ path: TERMINAL_RUN_INPUT.path, lines }]
    : [];
}

function buildTerminalFrames(lines = [], baseLines = []) {
  return lines.map((_, idx) => buildTerminalBlocks([
    ...baseLines,
    ...lines.slice(0, idx + 1),
  ]));
}

function formatTerminalQuestion(question) {
  if (!question) return '';
  return question
    .replace(/\u00A0/g, ' ')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildTerminalPermissionContinuationLines(choiceId) {
  if (choiceId === 'allow-session') {
    return [
      { type: 'output', text: 'Permission granted for this session' },
      { type: 'output', text: 'Starting agent execution...' },
      { type: 'output', text: 'Applying specification...' },
      { type: 'success', text: 'Build finished without issues' },
    ];
  }

  if (choiceId === 'allow-once') {
    return [
      { type: 'output', text: 'Permission granted for this run' },
      { type: 'output', text: 'Starting agent execution...' },
      { type: 'output', text: 'Applying specification...' },
      { type: 'success', text: 'Build finished without issues' },
    ];
  }

  if (choiceId === 'reject') {
    return [
      { type: 'error', text: 'Execution rejected' },
    ];
  }

  return [];
}

function buildTerminalContextLabel({
  mode = 'section',
  taskLabel = TERMINAL_TASK_TAB_BASE_LABEL,
  sectionTitle = null,
  checkTarget = null,
} = {}) {
  const resolvedTaskLabel = taskLabel || TERMINAL_TASK_TAB_BASE_LABEL;

  if (checkTarget?.kind === 'ac' && Number.isInteger(checkTarget.index)) {
    return `${resolvedTaskLabel} > Acceptance Criteria > AC ${checkTarget.index + 1}`;
  }

  if (checkTarget?.kind === 'plan' && Number.isInteger(checkTarget.index)) {
    return `${resolvedTaskLabel} > Plan > Item ${checkTarget.index + 1}`;
  }

  if (mode === 'generate') {
    return `${resolvedTaskLabel} > Full specification`;
  }

  if (typeof sectionTitle === 'string' && sectionTitle.trim().length > 0) {
    return `${resolvedTaskLabel} > ${sectionTitle.trim()}`;
  }

  return resolvedTaskLabel;
}

function formatAgentRunLineForChat(line) {
  if (!line?.text) return '';
  if (line.type === 'command') return `$ ${line.text}`;
  if (line.type === 'success') return `[ok] ${line.text}`;
  if (line.type === 'error') return `[error] ${line.text}`;
  return line.text;
}

function formatAgentRunLinesForChat(lines = []) {
  return lines
    .map(formatAgentRunLineForChat)
    .filter(Boolean)
    .join('\n');
}

function buildTerminalRunSequence({
  mode = 'section',
  sectionTitle,
  taskLabel = TERMINAL_TASK_TAB_BASE_LABEL,
  checkTarget = null,
  permissionChoice = 'prompt',
} = {}) {
  const resolvedTaskLabel = taskLabel || TERMINAL_TASK_TAB_BASE_LABEL;
  const contextLabel = buildTerminalContextLabel({
    mode,
    taskLabel: resolvedTaskLabel,
    sectionTitle,
    checkTarget,
  });

  if (mode === 'generate') {
    const introLines = [
      { type: 'command', text: `agent run "${resolvedTaskLabel}" --specify` },
      { type: 'output', text: `Reading ${resolvedTaskLabel}` },
      { type: 'output', text: `Context: ${contextLabel}` },
      { type: 'output', text: 'Resolving referenced files...' },
      { type: 'output', text: `Loading ${PROJECT_NAME} context...` },
      { type: 'output', text: 'Specifying visit-booking specification...' },
      { type: 'output', text: 'Processed 9 plan steps' },
    ];

    if (permissionChoice === 'prompt') {
      return {
        initialLines: introLines,
        permissionPrompt: {
          question: TERMINAL_PERMISSION_PROMPT,
          options: TERMINAL_PERMISSION_OPTIONS,
        },
      };
    }

    return {
      initialLines: [
        ...introLines,
        ...buildTerminalPermissionContinuationLines(permissionChoice),
      ],
      permissionPrompt: null,
    };
  }

  const resolvedSection = sectionTitle || 'Plan';
  const activityLine = resolvedSection.toLowerCase() === 'acceptance criteria'
    ? 'Building acceptance checks...'
    : 'Building execution plan...';

  return {
    initialLines: [
      { type: 'command', text: `agent run "${resolvedTaskLabel}" --section "${resolvedSection}"` },
      { type: 'output', text: `Reading ${resolvedTaskLabel}` },
      { type: 'output', text: `Context: ${contextLabel}` },
      { type: 'output', text: 'Resolving referenced files...' },
      { type: 'output', text: `Loading ${PROJECT_NAME} context...` },
      { type: 'output', text: activityLine },
      { type: 'output', text: 'Processed 9 plan steps' },
      { type: 'success', text: 'Build finished without issues' },
    ],
    permissionPrompt: null,
  };
}

function buildAcceptanceCriteriaIntroLines(runRequest = {}) {
  const resolvedTaskLabel = runRequest?.taskLabel || TERMINAL_TASK_TAB_BASE_LABEL;
  const contextLabel = buildTerminalContextLabel({
    mode: 'section',
    taskLabel: resolvedTaskLabel,
    sectionTitle: 'Acceptance Criteria',
    checkTarget: runRequest?.checkTarget ?? null,
  });
  return [
    { type: 'command', text: `agent run "${resolvedTaskLabel}" --section "Acceptance Criteria"` },
    { type: 'output', text: `Reading ${resolvedTaskLabel}` },
    { type: 'output', text: `Context: ${contextLabel}` },
    { type: 'output', text: 'Resolving referenced files...' },
    { type: 'output', text: `Loading ${PROJECT_NAME} context...` },
    { type: 'output', text: 'Building acceptance checks...' },
  ];
}

function buildAcceptanceCriteriaContinuationLines(choiceId) {
  if (choiceId === 'allow-session') {
    return [
      { type: 'output', text: 'Permission granted for this session' },
      { type: 'output', text: 'Continuing acceptance checks...' },
      { type: 'output', text: 'Processed 9 plan steps' },
      { type: 'success', text: 'Build finished without issues' },
    ];
  }

  if (choiceId === 'allow-once') {
    return [
      { type: 'output', text: 'Permission granted for this run' },
      { type: 'output', text: 'Continuing acceptance checks...' },
      { type: 'output', text: 'Processed 9 plan steps' },
      { type: 'success', text: 'Build finished without issues' },
    ];
  }

  if (choiceId === 'reject') {
    return [
      { type: 'error', text: 'Acceptance checks stopped after warning' },
    ];
  }

  return [];
}

function TerminalPermissionPrompt({
  question,
  options,
  selectedIdx,
  onMoveSelection,
  onSelect,
  onHover,
}) {
  const promptRef = useRef(null);

  useEffect(() => {
    promptRef.current?.focus();
  }, []);

  const selectedOption = options[selectedIdx] ?? options[0] ?? null;

  return (
    <div
      ref={promptRef}
      className="terminal-permission-prompt text-editor-default"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          onMoveSelection(1);
          return;
        }

        if (event.key === 'ArrowUp') {
          event.preventDefault();
          onMoveSelection(-1);
          return;
        }

        if (event.key === 'Tab') {
          event.preventDefault();
          onMoveSelection(event.shiftKey ? -1 : 1);
          return;
        }

        if (event.key === 'Enter' && selectedOption) {
          event.preventDefault();
          onSelect(selectedOption.id);
          return;
        }

        if (event.key === 'Escape') {
          event.preventDefault();
          onSelect('reject');
        }
      }}
    >
      <div className="terminal-permission-question">{question}</div>
      <div className="terminal-permission-options">
        {options.map((option, idx) => {
          const isSelected = idx === selectedIdx;
          return (
            <button
              key={option.id}
              type="button"
              className={`terminal-permission-option${isSelected ? ' is-selected' : ''}`}
              data-demo-id={`terminal-permission-${option.id}`}
              onMouseEnter={() => onHover(idx)}
              onClick={() => onSelect(option.id)}
            >
              <span className="terminal-permission-caret" aria-hidden="true">
                {isSelected ? '>' : ''}
              </span>
              <span className="terminal-permission-label">{option.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function areAllChecklistStatusesPassed(statuses = null) {
  return Array.isArray(statuses)
    && statuses.length > 0
    && statuses.every((statusItem) => statusItem?.status === 'passed' && !isRunStatusItemOutdated(statusItem));
}

function hasChecklistStatuses(statuses = null) {
  return Array.isArray(statuses) && statuses.length > 0;
}

function hasChecklistWarningOrError(statuses = null) {
  const isWarningOrError = (status) => status === 'warning' || status === 'failed' || status === 'error';

  return Array.isArray(statuses)
    && statuses.some((statusItem) => (
      isWarningOrError(statusItem?.status)
      || (Array.isArray(statusItem?.checks) && statusItem.checks.some((check) => isWarningOrError(check?.status)))
    ));
}

function countRecordedTradeoffs(documentSections = []) {
  if (!Array.isArray(documentSections) || documentSections.length === 0) {
    return 0;
  }

  const countItemsForTitle = (title) => {
    const section = documentSections.find((item) => item?.title?.toLowerCase() === title);
    return Array.isArray(section?.items)
      ? section.items.filter((item) => typeof item?.text === 'string' && item.text.trim().length > 0).length
      : 0;
  };

  return (
    countItemsForTitle('tradeoffs')
    || countItemsForTitle('other')
    || countItemsForTitle('notes')
    || 0
  );
}

function formatSuccessCountLabel(count, singular, plural) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function buildSuccessBannerMessage({
  acceptanceCriteriaCount = 0,
  planItemCount = 0,
  tradeoffCount = 0,
} = {}) {
  const acceptanceCriteriaLabel = formatSuccessCountLabel(
    acceptanceCriteriaCount,
    'acceptance criterion',
    'acceptance criteria',
  );
  const planItemLabel = formatSuccessCountLabel(
    planItemCount,
    'plan item',
    'plan items',
  );
  const noteSentence = tradeoffCount > 0
    ? `${formatSuccessCountLabel(tradeoffCount, 'follow-up note', 'follow-up notes')} recorded.`
    : 'No follow-up notes recorded.';

  return `Specification is ready for handoff: ${acceptanceCriteriaLabel} and ${planItemLabel} validated. ${noteSentence}`;
}

function getProjectContextFile(documentSections = [], addPopupFiles = []) {
  const referencedFiles = (documentSections ?? [])
    .map((section) => section?.meta?.text)
    .filter((value) => typeof value === 'string' && value.trim().length > 0);

  const preferredLabels = [...referencedFiles, 'Configuration.md'];

  for (const label of preferredLabels) {
    const matchingFile = (addPopupFiles ?? []).find((item) => item?.label === label);
    if (matchingFile) {
      return matchingFile;
    }
  }

  return null;
}

function DoneSuccessBanner({
  message,
  onAddToProjectContext = null,
}) {
  const bannerActions = onAddToProjectContext
    ? [{
        label: 'Add to project context',
        onClick: () => onAddToProjectContext?.(),
      }]
    : undefined;

  return (
    <div className="spec-done-warning-slot">
      <Banner
        type="success"
        showCloseButton={false}
        className="spec-done-success-banner"
        actions={bannerActions}
      >
        {message}
      </Banner>
    </div>
  );
}

/// Statuses shown after running Acceptance Criteria. Each item: { status, checks[] }
const AC_RUN_STATUSES = [
  {
    status: 'failed',
    highlight: {
      match: 'filtered to available vets for selected date/time',
      className: 'spec-inline-warning-highlight',
      tooltip: {
        title: 'Still shows all vets before availability filtering.',
        hint: 'Dropdown filters to available vets after date/time is submitted',
      },
    },
    issue: {
      severity: 'warning',
      label: 'AC/Plan mismatch — AC says "available vets" but plan loads all vets',
      secondaryText: 'Line 4',
    },
    proposal: 'Proposal: dropdown filters to available vets after date/time is submitted',
    checks: [
      { status: 'passed', text: 'Pre-filter works on POST re-render', chip: 'VisitController.java' },
      { status: 'failed', text: 'On initial load no date is selected, all vets shown — live filtering on date pick needs AJAX (out of scope)', chip: null },
    ],
  },
  {
    status: 'passed',
    checks: [
      { status: 'passed', text: 'Time slot picker with hourly slots 09:00-16:00', chip: 'createOrUpdateVisitForm.html' },
      { status: 'passed', text: 'populateTimeSlots() generates hourly intervals', chip: 'VisitController.java' },
    ],
  },
  {
    status: 'passed',
    checks: [
      { status: 'passed', text: 'Read VisitController.processNewVisitForm(): calls existsByVetIdAndDateAndTime before save, rejects with field error on vet. Catch block for DataIntegrityViolationException as safety net.', chip: 'VisitController.java' },
      { status: 'passed', text: 'Verified UNIQUE(vet_id, visit_date, visit_time) constraint present in all 3 schema files.', chip: 'schema.sql' },
      { status: 'passed', text: 'Read VisitControllerTests.processNewVisitFormDoubleBookingRejected: mocks existsByVetIdAndDateAndTime returning true, asserts form re-renders with error.', chip: 'VisitControllerTests.java' },
      { status: 'passed', text: 'Ran tests: processNewVisitFormDoubleBookingRejected passes.', chip: 'VisitControllerTests.java' },
    ],
  },
  {
    status: 'passed',
    checks: [
      { status: 'passed', text: '@ManyToOne vet persisted', chip: 'Visit.java' },
      { status: 'passed', text: 'LocalTime time persisted', chip: 'Visit.java' },
    ],
  },
  {
    status: 'passed',
    checks: [
      { status: 'passed', text: 'Vet column in ownerDetails.html', chip: 'ownerDetails.html' },
      { status: 'passed', text: 'Time column in ownerDetails.html', chip: null },
    ],
  },
  {
    status: 'passed',
    checks: [
      { status: 'passed', text: 'H2, MySQL, PostgreSQL schemas updated', chip: 'schema.sql' },
      { status: 'passed', text: 'Seed data includes vet_id and visit_time', chip: 'data.sql' },
    ],
  },
];

const PLAN_RUN_STATUSES = [
  { status: 'passed' },
  { status: 'passed' },
  {
    status: 'failed',
    highlight: {
      match: 'double-booking check',
      className: 'spec-inline-warning-highlight',
      tooltip: {
        title: 'Concurrent requests can still bypass this check.',
        hint: 'Replace with DB UNIQUE plus the existing lookup.',
      },
    },
    issue: {
      severity: 'warning',
      label: 'Possible race condition — check-then-act without DB constraint',
      secondaryText: 'Line 10',
    },
  },
  { status: 'passed' },
  {
    status: 'failed',
    highlight: {
      match: '<select> for vet',
      className: 'spec-inline-error-highlight',
      tooltip: {
        title: 'Vet select is added, but binding is still missing.',
        hint: 'Replace with vet select, VetFormatter, and time slot.',
      },
    },
    issue: {
      severity: 'error',
      label: 'Incomplete plan — missing VetFormatter, form POST will fail',
      secondaryText: 'Line 12',
    },
  },
  { status: 'passed' },
  { status: 'passed' },
];

const ISSUE_QUICK_FIX_CONFIG = {
  ac: {
    0: {
      actionLabel: 'Fix vet availability',
      replacementText: 'Visit form shows a dropdown of vets, excluding those already booked for the selected date and time.',
      resolvedStatus: {
        status: 'passed',
        checks: [
          { status: 'passed', text: 'Pre-filter on POST re-render', chip: 'VisitController.java' },
          { status: 'passed', text: 'All vets shown on initial GET (expected)', chip: null },
        ],
      },
    },
    1: {
      actionLabel: 'Add time slots',
      replacementText: 'Visit form includes a time slot picker with hourly slots from 09:00 to 16:00 (last bookable slot). Slot range is configurable.',
      resolvedStatus: {
        status: 'passed',
        checks: [],
      },
    },
  },
  plan: {
    2: {
      actionLabel: 'Add booking constraint',
      replacementText: 'VisitRepository — add double-booking query + UNIQUE(vet_id, visit_date, visit_time) constraint',
      resolvedStatus: {
        status: 'passed',
      },
    },
    4: {
      actionLabel: 'Add vet formatter',
      replacementText: 'Form template — add <select> for vet with VetFormatter (per PetTypeFormatter pattern) and time slot',
      resolvedStatus: {
        status: 'passed',
      },
    },
  },
};

function getIssueQuickFixConfig(kind, index) {
  return ISSUE_QUICK_FIX_CONFIG[kind]?.[index] ?? null;
}

function getBaseRunStatusesForKind(kind) {
  return kind === 'plan' ? PLAN_RUN_STATUSES : AC_RUN_STATUSES;
}

function mapVisibleIssueIndexToOriginal(kind, visibleIndex, removedIssueIndices = null) {
  if (!Number.isInteger(visibleIndex) || visibleIndex < 0) return visibleIndex;

  const baseStatuses = getBaseRunStatusesForKind(kind);
  const removedMap = removedIssueIndices?.[kind] ?? {};
  let nextVisibleIndex = 0;

  for (let originalIndex = 0; originalIndex < baseStatuses.length; originalIndex += 1) {
    if (removedMap[originalIndex]) continue;
    if (nextVisibleIndex === visibleIndex) return originalIndex;
    nextVisibleIndex += 1;
  }

  return visibleIndex;
}

function mapOriginalIssueIndexToVisible(kind, originalIndex, removedIssueIndices = null) {
  if (!Number.isInteger(originalIndex) || originalIndex < 0) return originalIndex;

  const baseStatuses = getBaseRunStatusesForKind(kind);
  const removedMap = removedIssueIndices?.[kind] ?? {};
  if (removedMap[originalIndex]) return -1;

  let visibleIndex = 0;
  for (let idx = 0; idx < baseStatuses.length; idx += 1) {
    if (removedMap[idx]) continue;
    if (idx === originalIndex) return visibleIndex;
    visibleIndex += 1;
  }

  return originalIndex;
}

function buildResolvedRunStatuses(baseStatuses, kind, appliedIssueFixes, removedIssueIndices = null, { runComplete = false } = {}) {
  const removedMap = removedIssueIndices?.[kind] ?? {};

  return baseStatuses.reduce((nextStatuses, status, originalIndex) => {
    if (removedMap[originalIndex]) return nextStatuses;

    if (!appliedIssueFixes?.[kind]?.[originalIndex]) {
      nextStatuses.push(status);
      return nextStatuses;
    }

    if (runComplete) {
      // Run completed after fix — show resolved (green) status
      const fixConfig = getIssueQuickFixConfig(kind, originalIndex);
      nextStatuses.push(fixConfig?.resolvedStatus ?? resolveRuntimeInspectionItem(status));
    } else {
      // Fix applied but not yet confirmed by a run — show empty (null)
      nextStatuses.push(null);
    }
    return nextStatuses;
  }, []);
}

function cloneRunStatusItem(statusItem) {
  if (!statusItem || typeof statusItem !== 'object') {
    return statusItem;
  }

  return {
    ...statusItem,
    checks: Array.isArray(statusItem.checks)
      ? statusItem.checks.map((check) => ({ ...check }))
      : statusItem.checks,
    issue: statusItem.issue ? { ...statusItem.issue } : statusItem.issue,
    highlight: statusItem.highlight
      ? {
          ...statusItem.highlight,
          tooltip: statusItem.highlight.tooltip ? { ...statusItem.highlight.tooltip } : statusItem.highlight.tooltip,
        }
      : statusItem.highlight,
  };
}

function withRunStatusOutdated(statusItem, isOutdated = true) {
  const nextStatusItem = statusItem && typeof statusItem === 'object'
    ? cloneRunStatusItem(statusItem)
    : { status: 'pending' };

  if (isOutdated) {
    nextStatusItem.isOutdated = true;
  } else {
    delete nextStatusItem.isOutdated;
  }

  return nextStatusItem;
}

function isRunStatusItemOutdated(statusItem) {
  return Boolean(statusItem?.isOutdated);
}

function cloneIssueStateMap(issueState = null) {
  return {
    ac: { ...(issueState?.ac ?? {}) },
    plan: { ...(issueState?.plan ?? {}) },
  };
}

function parseProblemRawIndexFromSecondaryText(secondaryText) {
  if (typeof secondaryText !== 'string') return null;

  const match = secondaryText.trim().match(/^Line\s+(\d+)$/i);
  if (!match) return null;

  const lineNumber = Number(match[1]);
  if (!Number.isInteger(lineNumber) || lineNumber <= 0) return null;

  return lineNumber - 1;
}

function getDocumentCheckRawIndex(documentSections, kind, visibleIndex) {
  if (!Array.isArray(documentSections) || !Number.isInteger(visibleIndex) || visibleIndex < 0) {
    return null;
  }

  const targetSectionTitle = kind === 'plan' ? 'plan' : 'acceptance criteria';
  const { lineMap } = buildSerializedDocumentLines(documentSections);
  let currentVisibleIndex = 0;

  for (let rawIndex = 0; rawIndex < lineMap.length; rawIndex += 1) {
    const entry = lineMap[rawIndex];
    if (entry?.type !== 'item' || entry.itemType !== 'check' || (entry.nestingLevel ?? 0) > 0) continue;

    const section = documentSections[entry.sectionIndex];
    if (section?.title?.toLowerCase() !== targetSectionTitle) continue;

    if (currentVisibleIndex === visibleIndex) {
      return rawIndex;
    }

    currentVisibleIndex += 1;
  }

  return null;
}

function getDocumentCheckItem(documentSections, kind, visibleIndex) {
  if (!Array.isArray(documentSections) || !Number.isInteger(visibleIndex) || visibleIndex < 0) {
    return null;
  }

  const targetSectionTitle = kind === 'plan' ? 'plan' : 'acceptance criteria';
  let currentVisibleIndex = 0;

  for (const section of documentSections) {
    if (section?.title?.toLowerCase() !== targetSectionTitle) {
      continue;
    }

    for (const item of (section.items ?? [])) {
      if (item?.type !== 'check') {
        continue;
      }

      if (currentVisibleIndex === visibleIndex) {
        return item;
      }

      currentVisibleIndex += 1;
    }
  }

  return null;
}

function normalizeDocumentCheckItemForComparison(item) {
  if (!item || item.type !== 'check') {
    return null;
  }

  return {
    text: typeof item.text === 'string' ? item.text.trim() : '',
    checked: Boolean(item.checked),
    children: Array.isArray(item.children)
      ? item.children
          .map((child) => normalizeDocumentCheckItemForComparison(child))
          .filter(Boolean)
      : [],
  };
}

function areComparableValuesEqual(left, right) {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function collectRunRerunOriginalIndices({
  kind,
  currentDocumentSections,
  nextDocumentSections,
  currentStatuses = null,
  nextStatuses = null,
  currentRemovedIssueIndices = null,
  nextRemovedIssueIndices = null,
} = {}) {
  const baseStatuses = getBaseRunStatusesForKind(kind);
  const rerunOriginalIndices = [];

  for (let originalIndex = 0; originalIndex < baseStatuses.length; originalIndex += 1) {
    const currentVisibleIndex = mapOriginalIssueIndexToVisible(kind, originalIndex, currentRemovedIssueIndices);
    const nextVisibleIndex = mapOriginalIssueIndexToVisible(kind, originalIndex, nextRemovedIssueIndices);

    if (!Number.isInteger(nextVisibleIndex) || nextVisibleIndex < 0) {
      continue;
    }

    const currentStatus = Array.isArray(currentStatuses) && currentVisibleIndex >= 0
      ? (currentStatuses[currentVisibleIndex] ?? null)
      : null;
    const nextStatus = Array.isArray(nextStatuses)
      ? (nextStatuses[nextVisibleIndex] ?? null)
      : null;
    const currentItem = currentVisibleIndex >= 0
      ? normalizeDocumentCheckItemForComparison(getDocumentCheckItem(currentDocumentSections, kind, currentVisibleIndex))
      : null;
    const nextItem = normalizeDocumentCheckItemForComparison(
      getDocumentCheckItem(nextDocumentSections, kind, nextVisibleIndex),
    );

    if (
      currentVisibleIndex < 0
      || currentStatus === null
      || nextStatus === null
      || !areComparableValuesEqual(currentItem, nextItem)
      || !areComparableValuesEqual(currentStatus, nextStatus)
    ) {
      rerunOriginalIndices.push(originalIndex);
    }
  }

  return rerunOriginalIndices;
}

function buildRunStatusesRevealSeed({
  kind,
  currentStatuses = null,
  nextStatuses = null,
  currentRemovedIssueIndices = null,
  nextRemovedIssueIndices = null,
  rerunOriginalIndices = [],
  allowPendingOutdated = true,
} = {}) {
  if (!Array.isArray(nextStatuses)) {
    return nextStatuses;
  }

  const rerunOriginalIndexSet = new Set(rerunOriginalIndices);
  const baseStatuses = getBaseRunStatusesForKind(kind);
  const nextResult = new Array(nextStatuses.length).fill(null);

  for (let originalIndex = 0; originalIndex < baseStatuses.length; originalIndex += 1) {
    const currentVisibleIndex = mapOriginalIssueIndexToVisible(kind, originalIndex, currentRemovedIssueIndices);
    const nextVisibleIndex = mapOriginalIssueIndexToVisible(kind, originalIndex, nextRemovedIssueIndices);
    if (!Number.isInteger(nextVisibleIndex) || nextVisibleIndex < 0) {
      continue;
    }

    const currentStatus = Array.isArray(currentStatuses) && currentVisibleIndex >= 0
      ? currentStatuses[currentVisibleIndex]
      : undefined;

    if (rerunOriginalIndexSet.has(originalIndex)) {
      nextResult[nextVisibleIndex] = currentStatus == null && !allowPendingOutdated
        ? null
        : withRunStatusOutdated(currentStatus);
      continue;
    }

    nextResult[nextVisibleIndex] = currentStatus !== undefined
      ? currentStatus
      : (nextStatuses[nextVisibleIndex] ?? null);
  }

  return nextResult;
}

function mergeOriginalIssueIndices(...groups) {
  return Array.from(new Set(
    groups.flatMap((group) => (
      Array.isArray(group)
        ? group.filter((index) => Number.isInteger(index) && index >= 0)
        : []
    ))
  )).sort((left, right) => left - right);
}

function buildRunStatusesSeedWithPendingOriginalIndices({
  kind,
  currentStatuses = null,
  nextStatuses = null,
  currentRemovedIssueIndices = null,
  nextRemovedIssueIndices = null,
  rerunOriginalIndices = [],
  pendingOriginalIndices = [],
  allowPendingOutdated = true,
} = {}) {
  const seededStatuses = buildRunStatusesRevealSeed({
    kind,
    currentStatuses,
    nextStatuses,
    currentRemovedIssueIndices,
    nextRemovedIssueIndices,
    rerunOriginalIndices,
    allowPendingOutdated,
  });

  if (!Array.isArray(seededStatuses) || !Array.isArray(pendingOriginalIndices) || pendingOriginalIndices.length === 0) {
    return seededStatuses;
  }

  const nextResult = [...seededStatuses];
  pendingOriginalIndices.forEach((originalIndex) => {
    const visibleIndex = mapOriginalIssueIndexToVisible(kind, originalIndex, nextRemovedIssueIndices);
    if (Number.isInteger(visibleIndex) && visibleIndex >= 0) {
      nextResult[visibleIndex] = null;
    }
  });

  return nextResult;
}

function remapRunStatusesForRemovedIssueIndices(kind, statuses = null, currentRemovedIssueIndices = null, nextRemovedIssueIndices = null) {
  if (!Array.isArray(statuses)) {
    return statuses;
  }

  const baseStatuses = getBaseRunStatusesForKind(kind);
  const nextResult = [];

  for (let originalIndex = 0; originalIndex < baseStatuses.length; originalIndex += 1) {
    const currentVisibleIndex = mapOriginalIssueIndexToVisible(kind, originalIndex, currentRemovedIssueIndices);
    const nextVisibleIndex = mapOriginalIssueIndexToVisible(kind, originalIndex, nextRemovedIssueIndices);

    if (!Number.isInteger(nextVisibleIndex) || nextVisibleIndex < 0) {
      continue;
    }

    nextResult[nextVisibleIndex] = Number.isInteger(currentVisibleIndex) && currentVisibleIndex >= 0
      ? (statuses[currentVisibleIndex] ?? null)
      : null;
  }

  return nextResult;
}

function buildSelectiveRunRevealOptions({
  kind,
  runRequest = null,
  currentStatuses = null,
  removedIssueIndices = null,
} = {}) {
  const rerunOriginalIndices = kind === 'ac'
    ? (Array.isArray(runRequest?.rerunAcOriginalIndices) ? runRequest.rerunAcOriginalIndices : [])
    : (Array.isArray(runRequest?.rerunPlanOriginalIndices) ? runRequest.rerunPlanOriginalIndices : []);
  const revealIndices = mapOriginalIssueIndicesToVisible(kind, rerunOriginalIndices, removedIssueIndices);
  const requestInitialResult = kind === 'ac'
    ? runRequest?.initialAcRunResult
    : runRequest?.initialPlanRunResult;
  const hasPreservableInitialResult =
    Array.isArray(requestInitialResult)
    || Array.isArray(currentStatuses);
  const initialResult = Array.isArray(requestInitialResult)
    ? requestInitialResult
    : (Array.isArray(currentStatuses) ? currentStatuses : []);
  const hasSelectiveRerun = revealIndices.length > 0 && hasPreservableInitialResult;

  return {
    hasSelectiveRerun,
    initialResult,
    indices: revealIndices,
    rerunOriginalIndices,
  };
}

function mapOriginalIssueIndicesToVisible(kind, originalIndices = [], removedIssueIndices = null) {
  const visibleIndices = Array.isArray(originalIndices)
    ? originalIndices
        .map((originalIndex) => mapOriginalIssueIndexToVisible(kind, originalIndex, removedIssueIndices))
        .filter((visibleIndex) => Number.isInteger(visibleIndex) && visibleIndex >= 0)
    : [];

  return Array.from(new Set(visibleIndices)).sort((left, right) => left - right);
}

function getVisibleIssueOriginalIndices(kind, removedIssueIndices = null) {
  const baseStatuses = getBaseRunStatusesForKind(kind);
  const visibleOriginalIndices = [];

  for (let originalIndex = 0; originalIndex < baseStatuses.length; originalIndex += 1) {
    const visibleIndex = mapOriginalIssueIndexToVisible(kind, originalIndex, removedIssueIndices);
    if (Number.isInteger(visibleIndex) && visibleIndex >= 0) {
      visibleOriginalIndices.push(originalIndex);
    }
  }

  return visibleOriginalIndices;
}

function buildProblemTreeNodeId(issue, fallbackIndex) {
  const rawIndex = Number.isInteger(issue?.rawIndex)
    ? issue.rawIndex
    : parseProblemRawIndexFromSecondaryText(issue?.secondaryText);
  const suffix = issue?.id ?? `idx-${fallbackIndex}`;

  if (!Number.isInteger(rawIndex) || rawIndex < 0) {
    return `problem-node-${suffix}`;
  }

  return `problem-line-${rawIndex}-${suffix}`;
}

function buildProblemOpenTabTreeNodeId(issue, fallbackIndex) {
  const tabId = typeof issue?.navigationTabId === 'string' ? issue.navigationTabId : '';
  const rowId = typeof issue?.navigationRowId === 'string' ? issue.navigationRowId : '';
  const rawIndex = Number.isInteger(issue?.rawIndex)
    ? String(issue.rawIndex)
    : '';
  const suffix = issue?.id ?? `idx-${fallbackIndex}`;

  return [
    'problem-open-tab',
    encodeURIComponent(tabId),
    encodeURIComponent(rowId),
    encodeURIComponent(rawIndex),
    encodeURIComponent(suffix),
  ].join(':');
}

function getProblemOpenTabTargetFromTreeNodeId(nodeId) {
  if (typeof nodeId !== 'string') return null;

  const [prefix, encodedTabId = '', encodedRowId = '', encodedRawIndex = ''] = nodeId.split(':');
  if (prefix !== 'problem-open-tab') return null;

  const tabId = decodeURIComponent(encodedTabId);
  if (!tabId) return null;

  const rowId = decodeURIComponent(encodedRowId);
  const rawIndexText = decodeURIComponent(encodedRawIndex);
  const rawIndex = rawIndexText === '' ? null : Number(rawIndexText);
  return {
    tabId,
    rowId: rowId || null,
    rawIndex: Number.isInteger(rawIndex) && rawIndex >= 0 ? rawIndex : null,
  };
}

function getProblemRawIndexFromTreeNodeId(nodeId) {
  if (typeof nodeId !== 'string') return null;

  const match = nodeId.match(/^problem-line-(\d+)-/);
  if (!match) return null;

  const rawIndex = Number(match[1]);
  return Number.isInteger(rawIndex) && rawIndex >= 0 ? rawIndex : null;
}

function buildProblemsTreeDisplayKey(label = '', secondaryText = '') {
  return [
    typeof label === 'string' ? label.trim() : '',
    typeof secondaryText === 'string' ? secondaryText.trim() : '',
  ].join('|');
}

function collectProblemsTreeNodesByDisplay(treeData = []) {
  const nodesByDisplay = new Map();
  const visitNode = (node) => {
    if (!node || typeof node !== 'object') return;

    const key = buildProblemsTreeDisplayKey(node.label, node.secondaryText);
    if (key !== '|') {
      nodesByDisplay.set(key, node);
    }

    if (Array.isArray(node.children)) {
      node.children.forEach(visitNode);
    }
  };

  treeData.forEach(visitNode);
  return nodesByDisplay;
}

function updateDocumentCheckItem(documentSections, { kind, index, updater }) {
  if (!Array.isArray(documentSections) || !Number.isInteger(index) || index < 0 || typeof updater !== 'function') {
    return documentSections;
  }

  const targetSectionTitle = kind === 'plan' ? 'plan' : 'acceptance criteria';
  let targetFound = false;
  let checkIndex = 0;

  const nextSections = documentSections.map((section) => {
    if (section?.title?.toLowerCase() !== targetSectionTitle) {
      return section;
    }

    let sectionChanged = false;
    const nextItems = [];

    (section.items ?? []).forEach((item) => {
      if (item?.type !== 'check') {
        nextItems.push(item);
        return;
      }

      if (checkIndex === index) {
        const nextItem = updater(item);
        targetFound = true;
        sectionChanged = true;
        if (nextItem) {
          nextItems.push(nextItem);
        }
      } else {
        nextItems.push(item);
      }

      checkIndex += 1;
    });

    return sectionChanged ? { ...section, items: nextItems } : section;
  });

  return targetFound ? nextSections : documentSections;
}

function applyUpdaterToDocumentCheckItem(item, childPath = [], updater) {
  if (!item || typeof updater !== 'function') {
    return item;
  }

  if (!Array.isArray(childPath) || childPath.length === 0) {
    return updater(item);
  }

  if (item.type !== 'check' || !Array.isArray(item.children)) {
    return item;
  }

  const [childIndex, ...restChildPath] = childPath;
  let didChange = false;

  const nextChildren = item.children.reduce((result, childItem, nextChildIndex) => {
    if (nextChildIndex !== childIndex) {
      result.push(childItem);
      return result;
    }

    const nextChildItem = applyUpdaterToDocumentCheckItem(childItem, restChildPath, updater);
    if (nextChildItem !== childItem) {
      didChange = true;
    }
    if (nextChildItem) {
      result.push(nextChildItem);
    }
    return result;
  }, []);

  if (!didChange) {
    return item;
  }

  return {
    ...item,
    children: nextChildren,
  };
}

function updateDocumentItemAtLineMapEntry(documentSections, lineMapEntry, updater) {
  if (
    !Array.isArray(documentSections)
    || !lineMapEntry
    || lineMapEntry.type !== 'item'
    || !Number.isInteger(lineMapEntry.sectionIndex)
    || !Number.isInteger(lineMapEntry.itemIndex)
    || typeof updater !== 'function'
  ) {
    return documentSections;
  }

  return documentSections.map((section, sectionIndex) => {
    if (sectionIndex !== lineMapEntry.sectionIndex) return section;

    let sectionChanged = false;
    const nextItems = (section.items ?? []).reduce((result, item, itemIndex) => {
      if (itemIndex !== lineMapEntry.itemIndex) {
        result.push(item);
        return result;
      }

      const nextItem = applyUpdaterToDocumentCheckItem(
        item,
        Array.isArray(lineMapEntry.childPath) ? lineMapEntry.childPath : [],
        updater,
      );
      if (nextItem !== item) {
        sectionChanged = true;
      }
      if (nextItem) {
        result.push(nextItem);
      }
      return result;
    }, []);

    return sectionChanged ? { ...section, items: nextItems } : section;
  });
}

function applyIssueQuickFixToDocumentSections(documentSections, { kind, index, replacementText }) {
  if (!replacementText) return documentSections;

  return updateDocumentCheckItem(documentSections, {
    kind,
    index,
    updater: (item) => ({ ...item, text: replacementText }),
  });
}

function normalizeSpecSectionTitle(title = '') {
  return String(title).trim().toLowerCase();
}

function orderPlanBeforeAcceptanceSections(documentSections = []) {
  if (!Array.isArray(documentSections)) return [];

  const planIndex = documentSections.findIndex((section) => normalizeSpecSectionTitle(section?.title) === 'plan');
  const acceptanceIndex = documentSections.findIndex((section) => normalizeSpecSectionTitle(section?.title) === 'acceptance criteria');

  if (planIndex < 0 || acceptanceIndex < 0 || planIndex < acceptanceIndex) {
    return documentSections;
  }

  const nextSections = [...documentSections];
  const [planSection] = nextSections.splice(planIndex, 1);
  const nextAcceptanceIndex = nextSections.findIndex((section) => normalizeSpecSectionTitle(section?.title) === 'acceptance criteria');
  nextSections.splice(nextAcceptanceIndex, 0, planSection);
  return nextSections;
}

function orderPlanBeforeAcceptanceCode(code = '') {
  const lines = typeof code === 'string' ? code.split(/\r?\n/) : [];
  const sections = [];
  let preamble = [];
  let currentSection = null;

  lines.forEach((line) => {
    if (/^\s*##\s+/.test(line)) {
      currentSection = { lines: [line], title: getDoneHeadingTitle(line) ?? '' };
      sections.push(currentSection);
      return;
    }

    if (currentSection) {
      currentSection.lines.push(line);
      return;
    }

    preamble.push(line);
  });

  if (sections.length === 0) return code;

  const orderedSections = orderPlanBeforeAcceptanceSections(sections);
  return [...preamble, ...orderedSections.flatMap((section) => section.lines)].join('\n');
}

function buildSerializedDocumentLines(documentSections) {
  const lines = [];
  const lineMap = [];
  const orderedDocumentSections = orderPlanBeforeAcceptanceSections(documentSections);

  orderedDocumentSections.forEach((section) => {
    const sectionIndex = (documentSections ?? []).indexOf(section);
    const sectionStableId = section?.id ?? `section-${sectionIndex}`;
    const pushCheckLine = (item, itemIndex, { nestingLevel = 0, childPath = [] } = {}) => {
      const normalizedChildPath = Array.isArray(childPath) ? childPath : [];
      const itemStableId = item?.id ?? (
        normalizedChildPath.length === 0
          ? `${sectionStableId}:item-${itemIndex}`
          : `${sectionStableId}:item-${itemIndex}:child-${normalizedChildPath.join('-')}`
      );
      const parentItemId = normalizedChildPath.length > 0
        ? (section.items?.[itemIndex]?.id ?? `${sectionStableId}:item-${itemIndex}`)
        : null;

      lines.push(`${'  '.repeat(nestingLevel)}- [${item.checked ? 'x' : ' '}] ${item.text}`);
      lineMap.push({
        type: 'item',
        sectionIndex,
        itemIndex,
        itemType: item.type,
        sectionId: sectionStableId,
        itemId: itemStableId,
        parentItemId,
        childIndex: normalizedChildPath.length > 0 ? normalizedChildPath[normalizedChildPath.length - 1] : null,
        childPath: normalizedChildPath,
        nestingLevel,
        stableKey: `section-item:${itemStableId}`,
      });

      (item.children ?? []).forEach((childItem, childIndex) => {
        if (childItem?.type !== 'check') return;
        pushCheckLine(childItem, itemIndex, {
          nestingLevel: nestingLevel + 1,
          childPath: [...normalizedChildPath, childIndex],
        });
      });
    };

    lines.push(`## ${section.title}`);
    lineMap.push({
      type: 'heading',
      sectionIndex,
      sectionId: sectionStableId,
      stableKey: `section-heading:${sectionStableId}`,
    });

    (section.items ?? []).forEach((item, itemIndex) => {
      const itemStableId = item?.id ?? `${sectionStableId}:item-${itemIndex}`;
      if (item.type === 'paragraph') {
        lines.push(item.text);
        lineMap.push({
          type: 'item',
          sectionIndex,
          itemIndex,
          itemType: item.type,
          sectionId: sectionStableId,
          itemId: itemStableId,
          stableKey: `section-item:${itemStableId}`,
        });
      }
      if (item.type === 'check') {
        pushCheckLine(item, itemIndex);
      }
      if (item.type === 'bullet') {
        lines.push(`- ${item.text}`);
        lineMap.push({
          type: 'item',
          sectionIndex,
          itemIndex,
          itemType: item.type,
          sectionId: sectionStableId,
          itemId: itemStableId,
          stableKey: `section-item:${itemStableId}`,
        });
      }
      if (item.type === 'comment') {
        lines.push(`// ${item.text}`);
        lineMap.push({
          type: 'item',
          sectionIndex,
          itemIndex,
          itemType: item.type,
          sectionId: sectionStableId,
          itemId: itemStableId,
          stableKey: `section-item:${itemStableId}`,
        });
      }
    });

    if (orderedDocumentSections.indexOf(section) < orderedDocumentSections.length - 1) {
      lines.push('');
      lineMap.push({
        type: 'separator',
        sectionIndex,
        sectionId: sectionStableId,
        stableKey: `section-separator:${sectionStableId}`,
      });
    }
  });

  return {
    lines,
    lineMap,
    code: lines.join('\n'),
  };
}

function buildDisplayRowSerializedLineMatches(displayRows = [], serializedLines = [], lineMap = []) {
  const matches = new Array(displayRows.length).fill(null);
  let searchStart = 0;

  displayRows.forEach((row, rowIndex) => {
    if (!Number.isInteger(row?.rawIndex) || row?.isVirtual) {
      return;
    }

    const line = typeof row?.line === 'string' ? row.line : '';
    let matchedIndex = -1;

    if (
      row.rawIndex >= searchStart &&
      row.rawIndex < lineMap.length
    ) {
      matchedIndex = row.rawIndex;
    } else {
      for (let index = searchStart; index < serializedLines.length; index += 1) {
        if (serializedLines[index] === line) {
          matchedIndex = index;
          break;
        }
      }
    }

    if (matchedIndex === -1) {
      return;
    }

    matches[rowIndex] = lineMap[matchedIndex]
      ? {
          ...lineMap[matchedIndex],
          matchedIndex,
          sourceLine: serializedLines[matchedIndex] ?? '',
        }
      : null;
    searchStart = matchedIndex + 1;
  });

  return matches;
}

function removeDocumentLineAtRawIndex(documentSections, rawIndex) {
  if (!Array.isArray(documentSections) || !Number.isInteger(rawIndex) || rawIndex < 0) {
    return documentSections;
  }

  const { lineMap } = buildSerializedDocumentLines(documentSections);
  const target = lineMap[rawIndex];
  if (!target || target.type !== 'item') {
    return documentSections;
  }

  return updateDocumentItemAtLineMapEntry(documentSections, target, () => null);
}

function removeLineFromCode(code, rawIndex) {
  if (typeof code !== 'string' || !Number.isInteger(rawIndex) || rawIndex < 0) {
    return code;
  }

  const lines = code.split(/\r?\n/);
  if (rawIndex >= lines.length) return code;
  lines.splice(rawIndex, 1);
  return lines.join('\n');
}

function getLatestCommentCommand(comments = []) {
  for (let index = comments.length - 1; index >= 0; index -= 1) {
    const comment = comments[index];
    if (typeof comment !== 'string') continue;

    const normalizedComment = comment.replace(/\s+/g, ' ').trim().toLowerCase();
    if (/^delete(?: this)?[.!?]?$/.test(normalizedComment)) {
      return {
        action: 'delete',
        text: comment,
      };
    }

    if (/^fix(?: this)?[.!?]?$/.test(normalizedComment)) {
      return {
        action: 'fix',
        text: comment,
      };
    }
  }

  return null;
}

function getLatestCommentText(comments = []) {
  for (let index = comments.length - 1; index >= 0; index -= 1) {
    const comment = comments[index];
    if (typeof comment !== 'string') continue;

    const normalizedComment = comment.replace(/\s+/g, ' ').trim();
    if (normalizedComment) {
      return normalizedComment;
    }
  }

  return '';
}

function normalizeCommentInstructionText(commentText = '') {
  if (typeof commentText !== 'string') return '';

  return commentText
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(note|comment)\s*:\s*/i, '')
    .replace(/^(please|pls)\s+/i, '');
}

function lowercaseLeadingCharacter(text = '') {
  if (!text) return '';
  return text.charAt(0).toLowerCase() + text.slice(1);
}

function finishSentence(text = '') {
  if (!text) return '';
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

function compactCommentRewriteText(commentText = '') {
  const normalizedCommentText = normalizeCommentInstructionText(commentText);
  if (!normalizedCommentText) return '';

  const firstSentence = normalizedCommentText.split(/(?<=[.!?])\s+/)[0] ?? normalizedCommentText;
  const compactText = firstSentence.replace(/[.!?]\s*$/, '').trim();
  if (compactText.length <= 96) return compactText;

  return `${compactText.slice(0, 93).trimEnd()}...`;
}

function applyCommentTextReplacement(baseText = '', instructionText = '') {
  const replacementMatch =
    instructionText.match(/^replace\s+["“'](.+?)["”']\s+with\s+["“'](.+?)["”']$/i) ??
    instructionText.match(/^rename\s+["“'](.+?)["”']\s+to\s+["“'](.+?)["”']$/i);

  if (!replacementMatch) {
    return '';
  }

  const [, fromText, toText] = replacementMatch;
  if (!fromText || !toText || !baseText.includes(fromText)) {
    return '';
  }

  return baseText.replace(fromText, toText);
}

function buildCommentEnhancedText(currentText = '', commentText = '') {
  const normalizedCurrentText = typeof currentText === 'string' ? currentText.trim() : '';
  const normalizedCommentText = compactCommentRewriteText(commentText);

  if (!normalizedCurrentText || !normalizedCommentText) {
    return normalizedCurrentText || currentText;
  }

  const normalizedBaseText = normalizedCurrentText.replace(/\s*[:;,.]\s*$/, '');
  if (!normalizedBaseText) {
    return normalizedCurrentText || currentText;
  }

  const explicitReplacement = applyCommentTextReplacement(normalizedBaseText, normalizedCommentText);
  if (explicitReplacement) {
    return finishSentence(explicitReplacement.trim());
  }

  if (normalizedBaseText.toLowerCase().includes(normalizedCommentText.toLowerCase())) {
    return finishSentence(normalizedBaseText);
  }

  return finishSentence(`${normalizedBaseText}; ${lowercaseLeadingCharacter(normalizedCommentText)}`);
}

function updateDocumentItemAtRawIndex(documentSections, rawIndex, updater) {
  if (!Array.isArray(documentSections) || !Number.isInteger(rawIndex) || rawIndex < 0 || typeof updater !== 'function') {
    return documentSections;
  }

  const { lineMap } = buildSerializedDocumentLines(documentSections);
  const target = lineMap[rawIndex];
  if (!target || target.type !== 'item') {
    return documentSections;
  }

  return updateDocumentItemAtLineMapEntry(documentSections, target, updater);
}

function getDocumentItemLocationForCommentEntry(documentSections, entry, removedIssueIndices = null) {
  if (!Array.isArray(documentSections)) {
    return null;
  }

  const serializedDocument = buildSerializedDocumentLines(documentSections);
  const { lineMap, lines } = serializedDocument;

  if (typeof entry?.rowStableKey === 'string' && entry.rowStableKey) {
    const stableKeyRawIndex = lineMap.findIndex((lineEntry) => (
      lineEntry?.type === 'item' && lineEntry.stableKey === entry.rowStableKey
    ));

    if (stableKeyRawIndex >= 0) {
      return {
        rawIndex: stableKeyRawIndex,
        lineMapEntry: lineMap[stableKeyRawIndex] ?? null,
        line: lines[stableKeyRawIndex] ?? '',
      };
    }
  }

  const normalizedTarget = normalizeCommentTarget(entry?.checkTarget ?? entry?.issueTarget ?? null);
  if (normalizedTarget) {
    const visibleIndex = mapOriginalIssueIndexToVisible(
      normalizedTarget.kind,
      normalizedTarget.index,
      removedIssueIndices,
    );
    const rawIndex = getDocumentCheckRawIndex(documentSections, normalizedTarget.kind, visibleIndex);
    if (Number.isInteger(rawIndex) && rawIndex >= 0) {
      return {
        rawIndex,
        lineMapEntry: lineMap[rawIndex] ?? null,
        line: lines[rawIndex] ?? '',
      };
    }
  }

  if (Number.isInteger(entry?.rawIndex) && entry.rawIndex >= 0) {
    const rawEntry = lineMap[entry.rawIndex];
    if (rawEntry?.type === 'item') {
      return {
        rawIndex: entry.rawIndex,
        lineMapEntry: rawEntry,
        line: lines[entry.rawIndex] ?? '',
      };
    }
  }

  return null;
}

function updateDocumentItemForCommentEntry(documentSections, entry, removedIssueIndices = null, updater) {
  if (!Array.isArray(documentSections) || typeof updater !== 'function') {
    return documentSections;
  }

  const location = getDocumentItemLocationForCommentEntry(documentSections, entry, removedIssueIndices);
  if (!location?.lineMapEntry || location.lineMapEntry.type !== 'item') {
    return documentSections;
  }

  return updateDocumentItemAtLineMapEntry(documentSections, location.lineMapEntry, updater);
}

function buildCommentTargetEntryMetadata(documentSections, target, removedIssueIndices = null) {
  const normalizedTarget = normalizeCommentTarget(target);
  if (!normalizedTarget) {
    return {};
  }

  const location = getDocumentItemLocationForCommentEntry(
    documentSections,
    {
      checkTarget: normalizedTarget,
      issueTarget: normalizedTarget,
    },
    removedIssueIndices,
  );

  if (!location) {
    return {};
  }

  return {
    rawIndex: location.rawIndex,
    rowStableKey: location.lineMapEntry?.stableKey ?? null,
    line: location.line ?? '',
  };
}

function applyCommentCommandsToSpec({
  code,
  documentSections,
  commentEntries,
  appliedIssueFixes,
  removedIssueIndices,
}) {
  let nextDocument = documentSections;
  let nextCode = typeof code === 'string' ? code : serializeSpecDocument(documentSections);
  const nextAppliedIssueFixes = cloneIssueStateMap(appliedIssueFixes);
  const nextRemovedIssueIndices = cloneIssueStateMap(removedIssueIndices);
  const deleteActions = [];
  const quickFixActions = [];
  const enhanceActions = [];

  (commentEntries ?? []).forEach((entry) => {
    const command = getLatestCommentCommand(entry?.comments ?? []);
    const latestCommentText = getLatestCommentText(entry?.comments ?? []);
    const fixTarget = entry?.issueTarget ?? entry?.checkTarget ?? null;
    const deleteTarget = entry?.checkTarget ?? entry?.issueTarget ?? null;

    if (!command) {
      if (latestCommentText) {
        enhanceActions.push({
          ...entry,
          commentText: latestCommentText,
        });
      }
      return;
    }

    const nextAction = {
      ...entry,
      deleteTarget,
      fixTarget,
      action: command.action,
    };

    if (command.action === 'delete') {
      if (deleteTarget || Number.isInteger(entry?.rawIndex) || entry?.rowStableKey) {
        deleteActions.push(nextAction);
      }
      return;
    }

    if (command.action === 'fix') {
      if (fixTarget && getIssueQuickFixConfig(fixTarget.kind, fixTarget.index)) {
        quickFixActions.push(nextAction);
      }
    }
  });

  deleteActions
    .slice()
    .forEach((entry) => {
      const location = getDocumentItemLocationForCommentEntry(
        nextDocument,
        entry,
        nextRemovedIssueIndices,
      );
      if (!location || !Number.isInteger(location.rawIndex)) {
        return;
      }

      nextCode = removeLineFromCode(nextCode, location.rawIndex);
      nextDocument = removeDocumentLineAtRawIndex(nextDocument, location.rawIndex);

      const isNestedChildRow = Array.isArray(location.lineMapEntry?.childPath) && location.lineMapEntry.childPath.length > 0;

      if (entry.deleteTarget && !isNestedChildRow) {
        nextRemovedIssueIndices[entry.deleteTarget.kind][entry.deleteTarget.index] = true;
        delete nextAppliedIssueFixes[entry.deleteTarget.kind][entry.deleteTarget.index];
      }
    });

  quickFixActions.forEach((entry) => {
    const { kind, index } = entry.fixTarget;
    if (nextRemovedIssueIndices[kind][index]) return;

    const fixConfig = getIssueQuickFixConfig(kind, index);
    if (!fixConfig) return;
    const visibleIndex = mapOriginalIssueIndexToVisible(kind, index, nextRemovedIssueIndices);
    if (!Number.isInteger(visibleIndex) || visibleIndex < 0) return;

    nextCode = applyIssueQuickFixToCode(nextCode, {
      kind,
      index: visibleIndex,
      replacementText: fixConfig.replacementText,
    });
    nextDocument = applyIssueQuickFixToDocumentSections(nextDocument, {
      kind,
      index: visibleIndex,
      replacementText: fixConfig.replacementText,
    });
    nextAppliedIssueFixes[kind][index] = true;
  });

  let hasEnhancedComments = false;

  enhanceActions.forEach((entry) => {
    const previousDocument = nextDocument;
    nextDocument = updateDocumentItemForCommentEntry(nextDocument, entry, nextRemovedIssueIndices, (item) => {
      if (!item || typeof item.text !== 'string') return item;

      const nextText = buildCommentEnhancedText(item.text, entry.commentText);
      if (!nextText || nextText === item.text) return item;

      return {
        ...item,
        text: nextText,
      };
    });

    if (nextDocument !== previousDocument) {
      hasEnhancedComments = true;
    }
  });

  nextCode = serializeSpecDocument(nextDocument);

  const hasActionableComments =
    deleteActions.length > 0
    || quickFixActions.length > 0
    || hasEnhancedComments;

  return {
    hasActionableComments,
    nextDocument,
    nextAppliedIssueFixes,
    nextRemovedIssueIndices,
    sourceCode: nextCode,
  };
}

const DEFAULT_PROBLEMS_ISSUES = [
  { severity: 'warning', label: 'Review nullable branch', secondaryText: 'Line 8' },
  { severity: 'error', label: 'Resolve failing validation', secondaryText: 'Line 14' },
];

const AGENT_TASK_PROBLEMS_ISSUES = [
  { severity: 'warning', label: 'AC/Plan mismatch — AC says "available vets" but plan loads all vets', secondaryText: 'Line 4' },
  { severity: 'warning', label: 'Ambiguous AC — "e.g." makes time slot granularity untestable', secondaryText: 'Line 5' },
  { severity: 'warning', label: 'Possible race condition — check-then-act without DB constraint', secondaryText: 'Line 10' },
  { severity: 'error', label: 'Incomplete plan — missing VetFormatter, form POST will fail', secondaryText: 'Line 12' },
];

const EDITOR_PROBLEMS_BY_LABEL = {
  'VisitController.java': {
    path: `${PROJECT_ROOT_PATH}/src/main/java/org/springframework/samples/petclinic/owner`,
    issues: [
      { severity: 'warning', label: 'populateTimeSlots() rebuilds list on every request', secondaryText: 'Line 121' },
      { severity: 'warning', label: '@ModelAttribute("vets") loads all vets on GET — no pre-filtering', secondaryText: 'Line 95' },
      { severity: 'error', label: 'DataIntegrityViolationException not caught — 500 on concurrent booking', secondaryText: 'Line 142' },
      { severity: 'error', label: 'Missing VetFormatter — form binding will fail at runtime', secondaryText: 'Line 108' },
    ],
  },
};

const MY_LEFT_STRIPE = DEFAULT_LEFT_STRIPE_ITEMS.filter(i =>
  ['project', 'commit', 'structure'].includes(i.id)
);

const MY_RIGHT_STRIPE = DEFAULT_RIGHT_STRIPE_ITEMS.filter((item) => item.id !== 'ai');

const AGENT_TASKS_ICON = (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M13.2701 19.13C14.0501 19.13 14.6901 18.5 14.6901 17.71C14.6901 16.92 14.0601 16.29 13.2701 16.29C12.4801 16.29 11.8501 16.92 11.8501 17.71C11.8501 18.5 12.4801 19.13 13.2701 19.13Z" fill="currentColor"/>
    <path d="M10.4202 17.71C6.0202 17.71 2.4502 14.26 2.4502 10C2.4502 5.74004 6.0202 2.29004 10.4202 2.29004" stroke="currentColor" strokeWidth="1.5"/>
    <path d="M17.34 7.87004C17.34 10.86 14.35 13.45 10.43 13.45C6.51002 13.45 3.52002 10.86 3.52002 7.87004C3.52002 4.88004 6.51002 2.29004 10.43 2.29004C14.35 2.29004 17.34 4.88004 17.34 7.87004Z" stroke="currentColor" strokeWidth="1.5"/>
  </svg>
);

// ─── Completion data ──────────────────────────────────────────────────────────

const COMPLETION_POPUP_MAX_ITEMS = 8;

const AT_COMPLETIONS = [
  { label: 'New Task.md',                  description: 'Agent Specifications' },
  { label: 'Configuration.md',             description: 'Agent Specifications' },
  { label: 'Visit-Booking.md',             description: 'Agent Specifications' },
  { label: 'Vet-Schedules.md',             description: 'Agent Specifications' },
  { label: 'Visit-Booking-Inspections.md', description: 'Agent Specifications' },
  { label: 'Visit-Booking-Beat-3-Execution.md', description: 'Agent Specifications' },
  { label: 'Visit-Booking-Code-Review-Moment.md', description: 'Agent Specifications' },
];

const HASH_COMPLETIONS = [
  { label: 'Configuration.md',             description: 'Agent Specifications' },
  { label: 'VisitController.java',         description: 'owner'          },
  { label: 'Visit.java',                   description: 'owner'          },
  { label: 'VetFormatter.java',            description: 'vet'            },
  { label: 'createOrUpdateVisitForm.html', description: 'templates/pets' },
  { label: 'schema.sql',                   description: 'db/h2'          },
];

const COMPLETION_PREVIEW_MAX_LINES = 5;
const COMPLETION_PREVIEW_MAX_SECTIONS = 6;

const COMPLETION_PREVIEW_LIBRARY = {
  'New Task.md': {
    previewLines: [
      '## Goal',
      'Describe the capability or workflow the agent should deliver.',
      '## Plan',
      '- Outline the implementation steps.',
      '## Acceptance Criteria',
      '- Make the result testable and concrete.',
    ],
    sections: ['Goal', 'Plan', 'Acceptance Criteria', 'Implementation Notes'],
  },
  'Configuration.md': {
    previewLines: [
      '## Context',
      '- VetRepository.findAll() is @Cacheable("vets").',
      '- Formatter<T> is required for entity-backed form selects.',
      '## Constraints',
      '- Keep H2, MySQL, and PostgreSQL schema updates aligned.',
    ],
    sections: ['Context', 'Constraints', 'Dependencies', 'Related Files'],
  },
  'visit-booking-inspections.md': {
    previewLines: [
      '## Acceptance Criteria Findings',
      '- AC/Plan mismatch around available vets filtering.',
      '- Ambiguous time-slot granularity in AC #2.',
      '## Plan Findings',
      '- Missing VetFormatter step for form binding.',
    ],
    sections: ['Acceptance Criteria Findings', 'Plan Findings', 'Quick Fixes'],
  },
  'visit-booking-beat-3-execution.md': {
    previewLines: [
      '## Command',
      'agent run "Visit-Booking.md" --section "Acceptance Criteria"',
      '## Pause',
      'Paused - AC 1 requires spec update.',
      '## Rebuild',
    ],
    sections: ['Command', 'Execution Log', 'Pause', 'Rebuild'],
  },
  'visit-booking-code-review-moment.md': {
    previewLines: [
      '## Review Summary',
      '- Time slots are rebuilt on every request.',
      '- Race condition still needs DB-backed protection.',
      '## Follow-up',
      '- Tighten the implementation notes and rebuild checks.',
    ],
    sections: ['Review Summary', 'Blocking Findings', 'Follow-up'],
  },
  'VisitController.java': {
    sections: ['populateVets()', 'populateTimeSlots()', 'initNewVisitForm()', 'processNewVisitForm()'],
  },
  'Visit.java': {
    sections: ['Fields', 'Relationships', 'Accessors'],
  },
  'VetFormatter.java': {
    previewLines: [
      'public class VetFormatter implements Formatter<Vet> {',
      '    public Vet parse(String text, Locale locale) {',
      '        return this.vetRepository.findById(Integer.parseInt(text));',
      '    }',
      '}',
    ],
    sections: ['parse()', 'print()'],
  },
  'createOrUpdateVisitForm.html': {
    sections: ['vet-select', 'time-slot-select', 'validation-message'],
  },
  'schema.sql': {
    sections: ['visits-table', 'unique-constraint', 'seed-data'],
  },
};

function buildCompletionPreviewLinesFromText(text = '', maxLines = COMPLETION_PREVIEW_MAX_LINES) {
  const lines = String(text)
    .split(/\r?\n/)
    .map((line) => line.replace(/\u00A0/g, ' ').trimEnd())
    .filter((line) => line.trim().length > 0)
    .slice(0, maxLines);

  return lines.length > 0 ? lines : ['No preview available'];
}

function slugifyCompletionAnchor(text = '') {
  return String(text)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'section';
}

function normalizeCompletionPreviewSections(sections = []) {
  return (sections ?? [])
    .map((section, index) => {
      if (typeof section === 'string') {
        return {
          id: `${slugifyCompletionAnchor(section)}-${index}`,
          title: section,
          anchor: slugifyCompletionAnchor(section),
        };
      }

      if (!section || typeof section.title !== 'string' || section.title.trim().length === 0) {
        return null;
      }

      return {
        id: section.id ?? `${slugifyCompletionAnchor(section.title)}-${index}`,
        title: section.title,
        anchor: section.anchor ?? slugifyCompletionAnchor(section.title),
      };
    })
    .filter(Boolean)
    .slice(0, COMPLETION_PREVIEW_MAX_SECTIONS);
}

function buildCompletionPreviewSectionsFromDocument(documentSections = []) {
  return normalizeCompletionPreviewSections(
    (documentSections ?? [])
      .filter((section) => typeof section?.title === 'string' && section.title.trim().length > 0)
      .map((section) => ({
        id: section.id ?? section.title,
        title: section.title.trim(),
      }))
  );
}

function getEditorTabContentByLabel(label = '') {
  if (label === 'VisitController.java') return MY_EDITOR_TAB_CONTENTS['1'] ?? null;
  if (label === 'Visit.java') return MY_EDITOR_TAB_CONTENTS['2'] ?? null;
  if (label === 'createOrUpdateVisitForm.html') return MY_EDITOR_TAB_CONTENTS['3'] ?? null;
  if (label === 'schema.sql') return MY_EDITOR_TAB_CONTENTS['4'] ?? null;
  if (label === 'VisitControllerTests.java') return MY_EDITOR_TAB_CONTENTS['5'] ?? null;
  return null;
}

function normalizeMarkdownDocumentLabelKey(label = '') {
  return String(label).trim().replace(/\s+/g, '-').toLowerCase();
}

function buildDocumentCompletionPreview(item, documentSections = []) {
  return {
    label: item.label,
    description: item.description,
    previewLines: buildCompletionPreviewLinesFromText(serializeSpecDocument(documentSections)),
    sections: buildCompletionPreviewSectionsFromDocument(documentSections),
  };
}

function getCompletionPreviewData(item) {
  if (!item) return null;
  const markdownLabelKey = normalizeMarkdownDocumentLabelKey(item.label);

  if (markdownLabelKey === 'visit-booking.md') {
    return buildDocumentCompletionPreview(item, createSpecDocument());
  }

  if (markdownLabelKey === 'vet-schedules.md') {
    return buildDocumentCompletionPreview(item, createVetSchedulesSpecDocument());
  }

  const editorTabContent = getEditorTabContentByLabel(item.label);
  const preset = COMPLETION_PREVIEW_LIBRARY[item.label] ?? COMPLETION_PREVIEW_LIBRARY[markdownLabelKey] ?? null;

  return {
    label: item.label,
    description: item.description,
    previewLines: preset?.previewLines
      ? buildCompletionPreviewLinesFromText(preset.previewLines.join('\n'))
      : buildCompletionPreviewLinesFromText(editorTabContent?.code ?? item.description),
    sections: normalizeCompletionPreviewSections(preset?.sections ?? []),
  };
}

function buildCompletionSelection(item, section = null) {
  if (!item) return null;

  return {
    ...item,
    insertText: `${item.label}${section?.anchor ? `#${section.anchor}` : ''}`,
    attachment: {
      label: item.label,
      description: item.description,
    },
    section: section ? { ...section } : null,
  };
}

function getCompletionInsertText(item) {
  return item?.insertText ?? item?.label ?? '';
}

function getCompletionAttachment(item) {
  if (item?.attachment?.label) {
    return item.attachment;
  }

  if (typeof item?.label === 'string' && item.label.trim().length > 0) {
    return {
      label: item.label,
      description: item.description,
    };
  }

  return null;
}

const LEFT_TOOL_WINDOW_IDS = new Set(['project', 'commit', 'structure', CHATS_HISTORY_TOOL_WINDOW_ID]);
const BOTTOM_TOOL_WINDOW_IDS = new Set(['terminal', 'git', 'problems']);
const BOTTOM_TOOL_WINDOW_TITLES = {
  terminal: 'Terminal',
  git: 'Git',
  problems: 'Problems',
};
const TERMINAL_TASK_TAB_BASE_LABEL = 'Visit-Booking.md';

function ProblemsFileNodeIcon() {
  return <Icon name="actions/lightning" size={16} />;
}

function ProblemsWarningNodeIcon() {
  return <Icon name="status/warning" size={16} />;
}

function ProblemsErrorNodeIcon() {
  return <Icon name="status/error" size={16} />;
}

function ProblemsCommentNodeIcon() {
  return (
    <span className="problems-comment-node-icon" aria-hidden="true">
      <DoneCommentCountIcon />
    </span>
  );
}

function renderProblemsFileIcon(tab) {
  const isMarkdownIcon = tab?.icon === 'fileTypes/markdown' || (typeof tab?.label === 'string' && tab.label.endsWith('.md'));
  const className = `problems-active-file-icon${isMarkdownIcon ? ' is-markdown' : ''}`;

  if (typeof tab?.icon === 'string') {
    return (
      <span className={className}>
        <Icon name={tab.icon} size={16} />
      </span>
    );
  }

  if (tab?.icon) {
    return <span className={className}>{tab.icon}</span>;
  }

  return (
    <span className={className}>
      <ProblemsFileNodeIcon />
    </span>
  );
}

function EditorTabRunningIcon({ icon, tone = 'green' }) {
  return (
    <span className="editor-tab-running-icon" aria-hidden="true">
      {typeof icon === 'string' ? <Icon name={icon} size={16} /> : icon}
      <span className={`editor-tab-running-dot editor-tab-running-dot-${tone}`} />
    </span>
  );
}

function StatusBarActiveFileLabel({ icon, label, tone = null }) {
  return (
    <span className="status-bar-active-file">
      {tone && typeof icon === 'string'
        ? <EditorTabRunningIcon icon={icon} tone={tone} />
        : (typeof icon === 'string'
            ? <Icon name={icon} size={16} className="tab-icon" />
            : <span className="tab-icon">{icon}</span>)}
      <span className="status-bar-active-file-label">{label}</span>
    </span>
  );
}

function findFirstProjectFileFromRunStatuses(...statusLists) {
  for (const statuses of statusLists) {
    if (!Array.isArray(statuses)) continue;

    for (const statusItem of statuses) {
      const checks = Array.isArray(statusItem?.checks) ? statusItem.checks : [];
      const checkWithFile = checks.find((check) => typeof check?.chip === 'string' && check.chip.trim().length > 0);
      if (checkWithFile) return checkWithFile.chip.trim();
    }
  }

  return null;
}

function getProblemsMetaForTab(tab, agentTaskIssuesOverride = null) {
  if (!tab || tab.id === 'welcome') {
    return {
      label: 'No file selected',
      path: PROJECT_ROOT_PATH,
      issues: [],
    };
  }

  const staticMeta = EDITOR_PROBLEMS_BY_LABEL[tab.label];
  if (staticMeta) {
    return {
      label: tab.label,
      path: staticMeta.path,
      issues: staticMeta.issues,
    };
  }

  if (tab.id?.startsWith('agent-task-') || tab.label.endsWith('.md')) {
    return {
      label: tab.label,
      path: AGENT_SPECS_PATH,
      issues: agentTaskIssuesOverride ?? AGENT_TASK_PROBLEMS_ISSUES,
    };
  }

  return {
    label: tab.label,
    path: PROJECT_ROOT_PATH,
    issues: DEFAULT_PROBLEMS_ISSUES,
  };
}

function buildCommentIssuesFromEntries(commentEntries = [], options = {}) {
  const {
    navigationTabId = null,
    icon = null,
  } = options ?? {};

  return commentEntries.flatMap((entry, entryIndex) => {
    if (Object.keys(normalizeStoredDiffCommentsState(entry?.diffComments)).length > 0) {
      return [];
    }

    const rawIndex = Number.isInteger(entry.rawIndex) ? entry.rawIndex : null;

    return (entry.comments ?? []).map((comment, commentIndex) => ({
      id: `comment-${entry.rowIndex ?? entryIndex}-${commentIndex}`,
      severity: 'comment',
      label: getStoredCommentText(comment),
      icon,
      navigationTabId,
      rawIndex,
      lineNumber: Number.isInteger(rawIndex) ? rawIndex + 1 : null,
      secondaryText: Number.isInteger(rawIndex)
        ? `Line ${rawIndex + 1}`
        : (entry.sectionTitle || 'Comment'),
    }));
  });
}

function getDiffCommentRowSecondaryText(row, sourceLabel = '') {
  const normalizedSourceLabel = typeof sourceLabel === 'string' && sourceLabel.trim().length > 0
    ? sourceLabel.trim()
    : 'Comment';
  const rowNumber = Number.isInteger(row?.newNumber)
    ? row.newNumber
    : (Number.isInteger(row?.oldNumber) ? row.oldNumber : null);

  return Number.isInteger(rowNumber)
    ? `${normalizedSourceLabel}:${rowNumber}`
    : normalizedSourceLabel;
}

function renderProblemsSourceIcon(iconId) {
  if (typeof iconId !== 'string' || iconId.length === 0) {
    return <ProblemsCommentNodeIcon />;
  }

  return <Icon name={iconId} size={16} className="tab-icon" />;
}

function buildCommentIssuesFromDiffTabs(ideTabContents = {}, ideTabs = [], options = {}) {
  if (!ideTabContents || typeof ideTabContents !== 'object') {
    return [];
  }

  const {
    includeDocument = true,
    includeInitial = true,
    includeChatSessions = true,
  } = options;

  return Object.entries(ideTabContents).flatMap(([tabId, tabContent]) => {
    const fileData = tabContent?.diffData ?? tabContent?.plainFileData;
    if (!fileData) return [];

    const rowById = new Map((fileData.rows ?? []).map((row) => [row?.id, row]));
    const isPlainFile = !tabContent?.diffData && Boolean(tabContent?.plainFileData);
    const sourceLabel = isPlainFile
      ? (fileData.sourceTabLabel ?? fileData.title ?? 'File')
      : (fileData.title ?? `Diff ${fileData.sourceTabLabel ?? 'File'}`);
    const tabMeta = Array.isArray(ideTabs)
      ? (ideTabs.find((tab) => tab?.id === tabId) ?? null)
      : null;
    const sourceIcon = isPlainFile
      ? (tabMeta?.icon ?? resolveAgentTaskPlanFileIcon(sourceLabel))
      : DIFF_TAB_ICON_NAME;
    const commentSources = [
      includeDocument
        ? {
            kind: 'document',
            comments: normalizeStoredDiffCommentsState(tabContent?.documentDiffComments),
          }
        : null,
      includeInitial
        ? {
            kind: 'initial',
            comments: normalizeStoredDiffCommentsState(tabContent?.initialDiffComments),
          }
        : null,
      ...(includeChatSessions
        ? Object.values(normalizeDiffSessionCommentsByChatId(tabContent?.diffSessionCommentsByChatId)).map((session) => ({
            kind: `chat-${session.chatId}`,
            comments: normalizeStoredDiffCommentsState(session.comments),
          }))
        : []),
    ].filter(Boolean);

    return commentSources.flatMap((source) => (
      Object.entries(source.comments).flatMap(([rowId, comments]) => {
        const row = rowById.get(rowId) ?? null;

        return (comments ?? []).map((comment, commentIndex) => ({
        id: `diff-comment-${tabId}-${source.kind}-${rowId}-${commentIndex}`,
        sourceKind: 'diff',
        severity: 'comment',
          label: getStoredCommentText(comment),
          icon: renderProblemsSourceIcon(sourceIcon),
          navigationTabId: tabId,
          navigationRowId: rowId,
          secondaryText: getDiffCommentRowSecondaryText(row, sourceLabel),
        }));
      })
    ));
  });
}

function buildCommentIssuesFromEntryDiffComments(commentEntries = [], sourceLabel = 'Diff') {
  const normalizedSourceLabel = typeof sourceLabel === 'string' && sourceLabel.trim().length > 0
    ? sourceLabel.trim()
    : 'Diff';

  return normalizeSpecVersionCommentEntries(commentEntries).flatMap((entry, entryIndex) => {
    const diffComments = normalizeStoredDiffCommentsState(entry?.diffComments);
    const entrySourceLabel = entry?.sourceLabel || (
      entry?.sectionTitle && entry?.line
        ? `${entry.sectionTitle}: ${entry.line}`
        : (entry?.sectionTitle || normalizedSourceLabel)
    );
    const entrySourceIcon = entry?.sourceIcon || DIFF_TAB_ICON_NAME;
    const entryLineNumber = Number.isInteger(entry?.sourceLineNumber)
      ? entry.sourceLineNumber
      : (Number.isInteger(entry?.rawIndex) ? entry.rawIndex + 1 : null);

    return Object.entries(diffComments).flatMap(([rowId, comments]) => (
      comments.map((comment, commentIndex) => ({
        id: `entry-diff-comment-${entry.id ?? entryIndex}-${rowId}-${commentIndex}`,
        sourceKind: 'diff',
        severity: 'comment',
        label: getStoredCommentText(comment),
        icon: renderProblemsSourceIcon(entrySourceIcon),
        secondaryText: entrySourceLabel,
        navigationTabId: entry?.sourceNavigationTabId ?? null,
        navigationRowId: entry?.sourceNavigationRowId ?? rowId,
        lineNumber: entryLineNumber,
      }))
    ));
  });
}

function dedupeCommentIssues(commentIssues = []) {
  const issuesByLabel = new Map();
  const orderedLabels = [];

  commentIssues.forEach((issue) => {
    const normalizedLabel = typeof issue?.label === 'string'
      ? issue.label.trim().toLowerCase()
      : '';
    if (!normalizedLabel) return;

    const existingIssue = issuesByLabel.get(normalizedLabel);
    if (!existingIssue) {
      orderedLabels.push(normalizedLabel);
      issuesByLabel.set(normalizedLabel, issue);
      return;
    }

    if (
      (issue?.navigationTabId && !existingIssue?.navigationTabId)
      || (issue?.sourceKind === 'diff' && existingIssue?.sourceKind !== 'diff')
    ) {
      issuesByLabel.set(normalizedLabel, issue);
    }
  });

  return orderedLabels.map((label) => issuesByLabel.get(label)).filter(Boolean);
}

function getCommentIssueSourceKey(issue = null) {
  const label = typeof issue?.label === 'string' ? issue.label.trim().toLowerCase() : '';
  const navigationTabId = typeof issue?.navigationTabId === 'string' ? issue.navigationTabId : '';
  const navigationRowId = typeof issue?.navigationRowId === 'string' ? issue.navigationRowId : '';
  const secondaryText = typeof issue?.secondaryText === 'string' ? issue.secondaryText.trim().toLowerCase() : '';
  const lineNumber = Number.isInteger(issue?.lineNumber) ? String(issue.lineNumber) : '';
  return [label, navigationTabId, navigationRowId, secondaryText, lineNumber].join('|');
}

function areCommentListsEqual(left = [], right = []) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
    return false;
  }

  return left.every((comment, index) => comment === right[index]);
}

function countLogicalCommentEntries(commentEntries = []) {
  return normalizeSpecVersionCommentEntries(commentEntries).reduce((sum, entry) => {
    const directComments = Array.isArray(entry?.comments) ? entry.comments : [];
    const diffComments = flattenStoredDiffCommentsState(entry?.diffComments);

    if (diffComments.length > 0 && areCommentListsEqual(directComments, diffComments)) {
      return sum + diffComments.length;
    }

    return sum + directComments.length + diffComments.length;
  }, 0);
}

function countDirectCommentEntries(commentEntries = []) {
  return normalizeSpecVersionCommentEntries(commentEntries).reduce((sum, entry) => {
    if (Object.keys(normalizeStoredDiffCommentsState(entry?.diffComments)).length > 0) {
      return sum;
    }

    return sum + (Array.isArray(entry?.comments) ? entry.comments.length : 0);
  }, 0);
}

function buildMergedExternalCommentIssues(commentEntries = [], relatedCommentIssues = []) {
  const normalizedRelatedIssues = Array.isArray(relatedCommentIssues) ? relatedCommentIssues : [];
  const relatedSourceKeys = new Set(
    normalizedRelatedIssues
      .map((issue) => {
        const navigationTabId = typeof issue?.navigationTabId === 'string' ? issue.navigationTabId : '';
        const sourceLabel = getCommentIssueSourceLabel(issue).trim().toLowerCase();
        return navigationTabId && sourceLabel ? `${navigationTabId}|${sourceLabel}` : '';
      })
      .filter(Boolean),
  );
  const entryDiffIssues = buildCommentIssuesFromEntryDiffComments(commentEntries).filter((issue) => {
    const navigationTabId = typeof issue?.navigationTabId === 'string' ? issue.navigationTabId : '';
    const sourceLabel = getCommentIssueSourceLabel(issue).trim().toLowerCase();
    const sourceKey = navigationTabId && sourceLabel ? `${navigationTabId}|${sourceLabel}` : '';
    return !sourceKey || !relatedSourceKeys.has(sourceKey);
  });

  return mergeCommentIssuesBySourceKey(
    entryDiffIssues,
    normalizedRelatedIssues,
  );
}

function getAggregatedCommentIssueCount(commentEntries = [], relatedCommentIssues = []) {
  return countDirectCommentEntries(commentEntries)
    + buildMergedExternalCommentIssues(commentEntries, relatedCommentIssues).length;
}

function getCommentEntryTotalCount(commentEntries = [], relatedCommentIssues = []) {
  return getAggregatedCommentIssueCount(
    normalizeSpecVersionCommentEntries(commentEntries),
    relatedCommentIssues,
  );
}

function buildDocumentRelatedCommentIssuesFromDiffTabs(ideTabContents = {}, ideTabs = []) {
  return buildCommentIssuesFromDiffTabs(ideTabContents, ideTabs, {
    includeDocument: true,
    includeInitial: false,
    includeChatSessions: false,
  });
}

function buildCommentIssuesForFileTab(tabId, tabContent = null, ideTabs = []) {
  if (!tabId || !tabContent || (!tabContent.diffData && !tabContent.plainFileData)) {
    return [];
  }

  const scopedContents = { [tabId]: tabContent };
  const sessionCommentsByChatId = normalizeDiffSessionCommentsByChatId(tabContent.diffSessionCommentsByChatId);
  const hasChatSessionComments = Object.values(sessionCommentsByChatId).some((session) => (
    flattenStoredDiffCommentsState(session?.comments).length > 0
  ));

  return [
    ...buildCommentIssuesFromDiffTabs(scopedContents, ideTabs, {
      includeDocument: true,
      includeInitial: false,
      includeChatSessions: false,
    }),
    ...buildCommentIssuesFromDiffTabs(scopedContents, ideTabs, {
      includeDocument: false,
      includeInitial: !hasChatSessionComments,
      includeChatSessions: hasChatSessionComments,
    }),
  ];
}

function mergeCommentIssuesBySourceKey(...issueGroups) {
  const issuesByKey = new Map();
  issueGroups.flat().forEach((issue) => {
    const normalizedLabel = typeof issue?.label === 'string'
      ? issue.label.trim().toLowerCase()
      : '';
    const navigationTabId = typeof issue?.navigationTabId === 'string' ? issue.navigationTabId : '';
    const navigationRowId = typeof issue?.navigationRowId === 'string' ? issue.navigationRowId : '';
    const key = normalizedLabel && navigationTabId && navigationRowId
      ? [normalizedLabel, navigationTabId, navigationRowId].join('|')
      : getCommentIssueSourceKey(issue);
    if (!key || issuesByKey.has(key)) return;
    issuesByKey.set(key, issue);
  });
  return Array.from(issuesByKey.values());
}

function buildDocumentEntryCommentIssuesForTab(tabId, commentEntryGroups = []) {
  if (!tabId) return [];

  return commentEntryGroups.flatMap((commentEntries) => (
    buildCommentIssuesFromEntryDiffComments(commentEntries)
      .filter((issue) => issue?.navigationTabId === tabId)
  ));
}

function getCommentIssueSourceLabel(issue = null) {
  const secondaryText = typeof issue?.secondaryText === 'string' ? issue.secondaryText.trim() : '';
  if (!secondaryText) return 'Comment';

  return secondaryText.replace(/:\d+$/u, '');
}

function getCommentIssueLineLabel(issue = null) {
  if (Number.isInteger(issue?.lineNumber) && issue.lineNumber > 0) {
    return `Line ${issue.lineNumber}`;
  }

  if (Number.isInteger(issue?.rawIndex) && issue.rawIndex >= 0) {
    return `Line ${issue.rawIndex + 1}`;
  }

  const secondaryText = typeof issue?.secondaryText === 'string' ? issue.secondaryText.trim() : '';
  if (!secondaryText) return '';

  const lineMatch = secondaryText.match(/\bLine\s+(\d+)\b/iu);
  if (lineMatch) return `Line ${lineMatch[1]}`;

  const sourceLineMatch = secondaryText.match(/:(\d+)$/u);
  if (sourceLineMatch) return `Line ${sourceLineMatch[1]}`;

  return '';
}

function getCommentIssueSourceLabelWithoutLine(issue = null) {
  return getCommentIssueSourceLabel(issue)
    .replace(/\s*·\s*Line\s+\d+\s*$/iu, '')
    .replace(/:\d+\s*$/u, '')
    .trim();
}

function getProblemsCommentNodeDisplay(issue = null, fallbackSourceLabel = 'Comment') {
  const hasExternalSource = Boolean(issue?.sourceKind);
  const sourceLabel = hasExternalSource
    ? getCommentIssueSourceLabel(issue)
    : fallbackSourceLabel;
  const lineLabel = getCommentIssueLineLabel(issue);
  const secondaryText = [sourceLabel, lineLabel].filter(Boolean).join(' · ');

  return {
    label: issue?.label ?? 'Comment',
    secondaryText,
  };
}

function getSourceLineLabel(lineNumber = null) {
  return Number.isInteger(lineNumber) && lineNumber > 0 ? `Line ${lineNumber}` : '';
}

function buildCommentSourceSummaries({
  attachment = null,
  commentEntries = [],
  relatedCommentIssues = [],
} = {}) {
  const summariesByKey = new Map();
  const addSource = ({ key, label, icon = null, count = 0, navigationTabId = null, navigationRowId = null, rawIndex = null, lineNumber = null }) => {
    const normalizedKey = key || label;
    const normalizedLabel = typeof label === 'string' && label.trim().length > 0 ? label.trim() : 'Comment';
    const normalizedCount = Number.isFinite(count) ? count : 0;
    if (!normalizedKey || normalizedCount <= 0) return;

    const existing = summariesByKey.get(normalizedKey);
    summariesByKey.set(normalizedKey, {
      key: normalizedKey,
      label: existing?.label ?? normalizedLabel,
      icon: existing?.icon ?? icon,
      count: (existing?.count ?? 0) + normalizedCount,
      navigationTabId: existing?.navigationTabId ?? navigationTabId,
      navigationRowId: existing?.navigationRowId ?? navigationRowId,
      rawIndex: Number.isInteger(existing?.rawIndex) ? existing.rawIndex : rawIndex,
      lineNumber: existing?.lineNumber ?? lineNumber,
      lineLabel: existing?.lineLabel ?? getSourceLineLabel(lineNumber),
    });
  };

  const normalizedCommentEntries = normalizeSpecVersionCommentEntries(commentEntries);
  const documentCommentCount = normalizedCommentEntries.reduce((sum, entry) => (
    Object.keys(normalizeStoredDiffCommentsState(entry?.diffComments)).length > 0
      ? sum
      : sum + (Array.isArray(entry.comments) ? entry.comments.length : 0)
  ), 0);
  const documentCommentLineNumber = normalizedCommentEntries.find((entry) => (
    Object.keys(normalizeStoredDiffCommentsState(entry?.diffComments)).length === 0
    && Array.isArray(entry.comments)
    && entry.comments.length > 0
    && Number.isInteger(entry.rawIndex)
    && entry.rawIndex >= 0
  ))?.rawIndex;
  addSource({
    key: attachment?.sourceTabId ?? attachment?.id ?? attachment?.label ?? 'sdd-document',
    label: attachment?.label ?? TERMINAL_TASK_TAB_BASE_LABEL,
    icon: attachment?.icon ?? 'fileTypes/markdown',
    count: documentCommentCount,
    navigationTabId: attachment?.sourceTabId ?? null,
    rawIndex: Number.isInteger(documentCommentLineNumber) ? documentCommentLineNumber : null,
    lineNumber: Number.isInteger(documentCommentLineNumber) ? documentCommentLineNumber + 1 : null,
  });

  buildMergedExternalCommentIssues(normalizedCommentEntries, relatedCommentIssues).forEach((issue) => {
    const sourceLabel = getCommentIssueSourceLabel(issue);
    addSource({
      key: `entry-diff:${sourceLabel}`,
      label: sourceLabel,
      icon: issue?.icon ?? renderProblemsSourceIcon(DIFF_TAB_ICON_NAME),
      count: 1,
      navigationTabId: issue?.navigationTabId ?? null,
      navigationRowId: issue?.navigationRowId ?? null,
      rawIndex: Number.isInteger(issue?.rawIndex) ? issue.rawIndex : null,
      lineNumber: Number.isInteger(issue?.lineNumber) ? issue.lineNumber : null,
    });
  });

  return Array.from(summariesByKey.values());
}

function getCommentTargetStorageKey(entry) {
  const checkKind = entry?.checkTarget?.kind;
  const checkIndex = entry?.checkTarget?.index;
  if ((checkKind === 'ac' || checkKind === 'plan') && Number.isInteger(checkIndex) && checkIndex >= 0) {
    return `check:${checkKind}:${checkIndex}`;
  }

  const issueKind = entry?.issueTarget?.kind;
  const issueIndex = entry?.issueTarget?.index;
  if ((issueKind === 'ac' || issueKind === 'plan') && Number.isInteger(issueIndex) && issueIndex >= 0) {
    return `issue:${issueKind}:${issueIndex}`;
  }

  return null;
}

function normalizeCommentTarget(target) {
  const kind = target?.kind;
  const index = target?.index;

  if ((kind === 'ac' || kind === 'plan') && Number.isInteger(index) && index >= 0) {
    return { kind, index };
  }

  return null;
}

function formatDemoTargetId(target) {
  const normalizedTarget = normalizeCommentTarget(target);
  if (!normalizedTarget) return null;

  return `${normalizedTarget.kind}-${normalizedTarget.index}`;
}

function toDemoSlug(value = '') {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function doesEntryMatchCommentTarget(entry, target) {
  const normalizedTarget = normalizeCommentTarget(target);
  if (!normalizedTarget) return false;

  const matchesCheckTarget =
    entry?.checkTarget?.kind === normalizedTarget.kind &&
    entry?.checkTarget?.index === normalizedTarget.index;
  const matchesIssueTarget =
    entry?.issueTarget?.kind === normalizedTarget.kind &&
    entry?.issueTarget?.index === normalizedTarget.index;

  return matchesCheckTarget || matchesIssueTarget;
}

function normalizeStoredDiffCommentsState(diffComments = {}) {
  if (!diffComments || typeof diffComments !== 'object') {
    return {};
  }

  return Object.entries(diffComments).reduce((nextState, [rowId, comments]) => {
    const nextComments = Array.isArray(comments)
      ? comments.reduce((entries, comment) => {
          if (typeof comment === 'string') {
            const text = comment.trim();
            return text.length > 0 ? [...entries, text] : entries;
          }

          if (comment && typeof comment === 'object') {
            const text = typeof comment.text === 'string' ? comment.text.trim() : '';
            if (text.length === 0) return entries;
            const lineLabel = typeof comment.lineLabel === 'string' ? comment.lineLabel.trim() : '';
            return [
              ...entries,
              {
                ...comment,
                text,
                ...(lineLabel.length > 0 ? { lineLabel } : {}),
              },
            ];
          }

          return entries;
        }, [])
      : [];

    if (nextComments.length > 0) {
      nextState[rowId] = nextComments;
    }

    return nextState;
  }, {});
}

function getStoredCommentText(comment) {
  if (typeof comment === 'string') return comment;
  return typeof comment?.text === 'string' ? comment.text : '';
}

function getStoredCommentLineLabel(comment) {
  return typeof comment?.lineLabel === 'string' ? comment.lineLabel.trim() : '';
}

function flattenStoredDiffCommentsState(diffComments = {}) {
  const seenComments = new Set();

  return Object.values(normalizeStoredDiffCommentsState(diffComments))
    .flat()
    .map(getStoredCommentText)
    .filter((comment) => {
      const normalizedComment = comment.trim().toLowerCase();
      if (seenComments.has(normalizedComment)) {
        return false;
      }
      seenComments.add(normalizedComment);
      return true;
    });
}

function mergeStoredDiffCommentsStates(...states) {
  return states.reduce((mergedComments, state) => {
    Object.entries(normalizeStoredDiffCommentsState(state)).forEach(([rowId, comments]) => {
      const existingComments = Array.isArray(mergedComments[rowId]) ? mergedComments[rowId] : [];
      const seenComments = new Set(existingComments.map((comment) => getStoredCommentText(comment).trim().toLowerCase()));
      const nextComments = [...existingComments];

      comments.forEach((comment) => {
        const text = getStoredCommentText(comment).trim();
        if (!text) return;
        const dedupeKey = text.toLowerCase();
        if (seenComments.has(dedupeKey)) {
          if (comment && typeof comment === 'object' && comment.pending) {
            const existingIndex = nextComments.findIndex((existingComment) => (
              getStoredCommentText(existingComment).trim().toLowerCase() === dedupeKey
            ));
            if (existingIndex >= 0) {
              const existingComment = nextComments[existingIndex];
              nextComments[existingIndex] = {
                ...((existingComment && typeof existingComment === 'object') ? existingComment : {}),
                ...comment,
                text,
                pending: true,
              };
            }
          }
          return;
        }
        seenComments.add(dedupeKey);
        const lineLabel = getStoredCommentLineLabel(comment);
        nextComments.push(comment && typeof comment === 'object'
          ? {
              ...comment,
              text,
              ...(lineLabel.length > 0 ? { lineLabel } : {}),
            }
          : (lineLabel.length > 0 ? { text, lineLabel } : text));
      });

      if (nextComments.length > 0) {
        mergedComments[rowId] = nextComments;
      }
    });

    return mergedComments;
  }, {});
}

function getAiChatListItem(chatId) {
  return [...AI_CHAT_RECENT_ITEMS, ...AI_CHAT_OLDER_THAN_7_ITEMS]
    .find((item) => item.id === chatId) ?? null;
}

function normalizeDiffSessionCommentsByChatId(sessionCommentsByChatId = {}) {
  if (!sessionCommentsByChatId || typeof sessionCommentsByChatId !== 'object') {
    return {};
  }

  return Object.entries(sessionCommentsByChatId).reduce((nextState, [chatId, entry]) => {
    if (!chatId || !entry || typeof entry !== 'object') {
      return nextState;
    }

    const comments = normalizeStoredDiffCommentsState(entry.comments);
    if (Object.keys(comments).length === 0) {
      return nextState;
    }

    const scenario = AI_CHAT_SCENARIOS[chatId] ?? null;
    const listItem = getAiChatListItem(chatId);
    nextState[chatId] = {
      chatId,
      messageId: typeof entry.messageId === 'string' && entry.messageId.length > 0
        ? entry.messageId
        : (scenario?.messageId ?? `chat-${chatId}`),
      title: typeof entry.title === 'string' && entry.title.length > 0
        ? entry.title
        : (scenario?.title ?? chatId),
      icon: typeof entry.icon === 'string' && entry.icon.length > 0
        ? entry.icon
        : (listItem?.icon ?? 'claude'),
      comments,
    };

    return nextState;
  }, {});
}

function mergeDiffCommentsFromSessions(sessionCommentsByChatId = {}) {
  const normalizedSessions = normalizeDiffSessionCommentsByChatId(sessionCommentsByChatId);
  return Object.values(normalizedSessions).reduce((mergedComments, session) => {
    Object.entries(session.comments ?? {}).forEach(([rowId, comments]) => {
      const existingComments = Array.isArray(mergedComments[rowId]) ? mergedComments[rowId] : [];
      const seenComments = new Set(existingComments.map((comment) => getStoredCommentText(comment).trim().toLowerCase()));
      const nextRowComments = [...existingComments];

      (comments ?? []).forEach((comment) => {
        const normalizedComment = getStoredCommentText(comment).trim();
        if (!normalizedComment) return;
        const dedupeKey = normalizedComment.toLowerCase();
        if (seenComments.has(dedupeKey)) return;
        seenComments.add(dedupeKey);
        const lineLabel = getStoredCommentLineLabel(comment);
        nextRowComments.push(lineLabel.length > 0 ? { text: normalizedComment, lineLabel } : normalizedComment);
      });

      if (nextRowComments.length > 0) {
        mergedComments[rowId] = nextRowComments;
      }
    });

    return mergedComments;
  }, {});
}

function getCommentsForCommentTarget(commentEntries = [], target) {
  const normalizedTarget = normalizeCommentTarget(target);
  if (!normalizedTarget) return [];

  return (commentEntries ?? []).flatMap((entry) => (
    doesEntryMatchCommentTarget(entry, normalizedTarget)
      ? (entry.comments ?? []).filter((comment) => getStoredCommentText(comment).trim().length > 0)
      : []
  ));
}

function replaceCommentEntriesForTarget(commentEntries = [], target, comments = [], metadata = {}) {
  const normalizedTarget = normalizeCommentTarget(target);
  if (!normalizedTarget) {
    return Array.isArray(commentEntries) ? commentEntries : [];
  }

  const nextComments = Array.isArray(comments)
    ? comments.filter((comment) => getStoredCommentText(comment).trim().length > 0)
    : [];
  const existingEntries = Array.isArray(commentEntries) ? commentEntries : [];
  const existingEntry = existingEntries.find((entry) => doesEntryMatchCommentTarget(entry, normalizedTarget)) ?? null;
  const remainingEntries = existingEntries.filter((entry) => !doesEntryMatchCommentTarget(entry, normalizedTarget));
  const normalizedDiffComments =
    'diffComments' in metadata
      ? normalizeStoredDiffCommentsState(metadata.diffComments)
      : normalizeStoredDiffCommentsState(existingEntry?.diffComments);

  if (nextComments.length === 0) {
    return remainingEntries;
  }

  return [
    ...remainingEntries,
    {
      ...existingEntry,
      sectionTitle: metadata.sectionTitle ?? existingEntry?.sectionTitle ?? (normalizedTarget.kind === 'plan' ? 'Plan' : 'Acceptance Criteria'),
      line: metadata.line ?? existingEntry?.line ?? '',
      rawIndex: metadata.rawIndex ?? existingEntry?.rawIndex,
      rowStableKey: metadata.rowStableKey ?? existingEntry?.rowStableKey,
      diffComments: Object.keys(normalizedDiffComments).length > 0 ? normalizedDiffComments : undefined,
      sourceKind: metadata.sourceKind ?? existingEntry?.sourceKind,
      sourceLabel: metadata.sourceLabel ?? existingEntry?.sourceLabel,
      sourceIcon: metadata.sourceIcon ?? existingEntry?.sourceIcon,
      sourceNavigationTabId: metadata.sourceNavigationTabId ?? existingEntry?.sourceNavigationTabId,
      sourceNavigationRowId: metadata.sourceNavigationRowId ?? existingEntry?.sourceNavigationRowId,
      sourceLineNumber: metadata.sourceLineNumber ?? existingEntry?.sourceLineNumber,
      hideInlineInDocument: Boolean(metadata.hideInlineInDocument ?? existingEntry?.hideInlineInDocument),
      checkTarget: normalizedTarget,
      issueTarget: normalizedTarget,
      comments: nextComments,
    },
  ];
}

function upsertHiddenDiffCommentEntry(commentEntries = [], entryId, comments = {}, metadata = {}) {
  const existingEntries = Array.isArray(commentEntries) ? commentEntries : [];
  const normalizedEntryId = typeof entryId === 'string' && entryId.length > 0
    ? entryId
    : 'document-diff-comment';
  const diffComments = normalizeStoredDiffCommentsState(comments);
  const flattenedComments = flattenStoredDiffCommentsState(diffComments);
  const remainingEntries = existingEntries.filter((entry) => entry?.id !== normalizedEntryId);

  if (flattenedComments.length === 0 && Object.keys(diffComments).length === 0) {
    return remainingEntries;
  }

  const normalizedTarget = normalizeCommentTarget(metadata.target);
  return [
    ...remainingEntries,
    {
      id: normalizedEntryId,
      sectionTitle: metadata.sectionTitle ?? '',
      line: metadata.line ?? '',
      rawIndex: metadata.rawIndex,
      rowStableKey: metadata.rowStableKey,
      sourceKind: metadata.sourceKind,
      sourceLabel: metadata.sourceLabel,
      sourceIcon: metadata.sourceIcon,
      sourceNavigationTabId: metadata.sourceNavigationTabId,
      sourceNavigationRowId: metadata.sourceNavigationRowId,
      sourceLineNumber: metadata.sourceLineNumber,
      checkTarget: normalizedTarget ?? undefined,
      issueTarget: normalizedTarget ?? undefined,
      comments: flattenedComments,
      diffComments,
      hideInlineInDocument: true,
    },
  ];
}

function buildPlanDiffInitialComments(commentEntries = [], diffData = null, target = null) {
  const existingEntry = (commentEntries ?? []).find((entry) => doesEntryMatchCommentTarget(entry, target)) ?? null;
  const storedDiffComments = normalizeStoredDiffCommentsState(existingEntry?.diffComments);
  if (Object.keys(storedDiffComments).length > 0) {
    return storedDiffComments;
  }

  const nextComments = getCommentsForCommentTarget(commentEntries, target);
  if (nextComments.length === 0) return {};

  const targetRowId =
    diffData?.focusRowId ??
    diffData?.rows?.find((row) => row.kind === 'added' || row.kind === 'context')?.id ??
    diffData?.rows?.[0]?.id ??
    null;

  if (!targetRowId) return {};

  return {
    [targetRowId]: nextComments,
  };
}

function mergeCommentEntriesWithExistingDiffAnchors(nextEntries = [], previousEntries = []) {
  const normalizedPreviousEntries = Array.isArray(previousEntries) ? previousEntries : [];
  const isHiddenExternalCommentEntry = (entry) => (
    entry?.hideInlineInDocument
    && typeof entry?.id === 'string'
    && (
      entry.id.startsWith('document-comment-')
      || entry.id.startsWith('document-diff-comment-')
    )
  );

  const mergedEntries = (Array.isArray(nextEntries) ? nextEntries : []).map((entry) => {
    const currentDiffComments = normalizeStoredDiffCommentsState(entry?.diffComments);
    if (Object.keys(currentDiffComments).length > 0) {
      return entry;
    }

    const entryTarget = normalizeCommentTarget(entry?.checkTarget) ?? normalizeCommentTarget(entry?.issueTarget);
    const entryStorageKey = getCommentEntryStorageKey(entry);
    const previousEntry = normalizedPreviousEntries.find((candidate) => {
      if (isHiddenExternalCommentEntry(candidate)) {
        return Boolean(entry?.id) && candidate.id === entry.id;
      }

      if (!isHiddenExternalCommentEntry(entry) && entryTarget && doesEntryMatchCommentTarget(candidate, entryTarget)) {
        return true;
      }

      return Boolean(entryStorageKey) && getCommentEntryStorageKey(candidate) === entryStorageKey;
    }) ?? null;
    const previousDiffComments = normalizeStoredDiffCommentsState(previousEntry?.diffComments);

    return Object.keys(previousDiffComments).length > 0
      ? { ...entry, diffComments: previousDiffComments }
      : entry;
  });

  const mergedEntryIds = new Set(mergedEntries.map((entry) => entry?.id).filter(Boolean));
  const preservedHiddenEntries = normalizedPreviousEntries.filter((entry) => (
    isHiddenExternalCommentEntry(entry)
    && !mergedEntryIds.has(entry.id)
    && Object.keys(normalizeStoredDiffCommentsState(entry?.diffComments)).length > 0
  ));

  return [
    ...preservedHiddenEntries,
    ...mergedEntries,
  ];
}

function getCommentEntryStorageKey(entry) {
  if (
    entry?.hideInlineInDocument
    && typeof entry?.id === 'string'
    && (
      entry.id.startsWith('document-comment-')
      || entry.id.startsWith('document-diff-comment-')
    )
  ) {
    return `hidden:${entry.id}`;
  }

  if (typeof entry?.rowStableKey === 'string' && entry.rowStableKey) {
    return `row-key:${entry.rowStableKey}`;
  }

  const targetKey = getCommentTargetStorageKey(entry);
  if (targetKey) {
    return targetKey;
  }

  if (Number.isInteger(entry?.rawIndex)) {
    return `raw:${entry.rawIndex}:${entry?.line ?? ''}`;
  }

  const rowIndex = Number.isInteger(entry?.rowIndex) ? entry.rowIndex : 'unknown';
  const sectionTitle = entry?.sectionTitle ?? '';
  const line = entry?.line ?? '';
  return `row:${rowIndex}:${sectionTitle}:${line}`;
}

function getRowMetaCommentStorageKey(rowMeta) {
  if (typeof rowMeta?.stableKey === 'string' && rowMeta.stableKey) {
    return `row-key:${rowMeta.stableKey}`;
  }

  const targetKey = getCommentTargetStorageKey(rowMeta);
  if (targetKey) {
    return targetKey;
  }

  if (Number.isInteger(rowMeta?.rawIndex)) {
    return `raw:${rowMeta.rawIndex}:${rowMeta?.line ?? ''}`;
  }

  const rowIndex = Number.isInteger(rowMeta?.rowIndex) ? rowMeta.rowIndex : 'unknown';
  const sectionTitle = rowMeta?.currentSectionTitle ?? '';
  const line = rowMeta?.line ?? '';
  return `row:${rowIndex}:${sectionTitle}:${line}`;
}

function getRowMetaCommentStorageCandidates(rowMeta) {
  const candidates = [];
  const canonicalKey = getRowMetaCommentStorageKey(rowMeta);
  if (canonicalKey) {
    candidates.push(canonicalKey);
  }

  const targetKey = getCommentTargetStorageKey(rowMeta);
  if (targetKey && !candidates.includes(targetKey)) {
    candidates.push(targetKey);
  }

  if (Number.isInteger(rowMeta?.rawIndex)) {
    const rawKey = `raw:${rowMeta.rawIndex}:${rowMeta?.line ?? ''}`;
    if (!candidates.includes(rawKey)) {
      candidates.push(rawKey);
    }
  }

  const rowIndex = Number.isInteger(rowMeta?.rowIndex) ? rowMeta.rowIndex : 'unknown';
  const sectionTitle = rowMeta?.currentSectionTitle ?? '';
  const line = rowMeta?.line ?? '';
  const fallbackKey = `row:${rowIndex}:${sectionTitle}:${line}`;
  if (!candidates.includes(fallbackKey)) {
    candidates.push(fallbackKey);
  }

  return candidates;
}

function buildRowCommentsStateFromEntries(rowMetaList = [], commentEntries = []) {
  const canonicalKeysByCandidate = rowMetaList.reduce((lookup, rowMeta) => {
    const canonicalKey = getRowMetaCommentStorageKey(rowMeta);
    getRowMetaCommentStorageCandidates(rowMeta).forEach((candidateKey) => {
      if (!lookup.has(candidateKey)) {
        lookup.set(candidateKey, canonicalKey);
      }
    });
    return lookup;
  }, new Map());
  const nextState = {};

  (commentEntries ?? []).forEach((entry) => {
    if (entry?.hideInlineInDocument) return;

    const comments = Array.isArray(entry?.comments)
      ? entry.comments.reduce((entries, comment) => {
          const text = getStoredCommentText(comment).trim();
          if (text.length === 0) return entries;
          const lineLabel = getStoredCommentLineLabel(comment);
          return [...entries, lineLabel.length > 0 ? { text, lineLabel } : text];
        }, [])
      : [];
    if (comments.length === 0) return;

    const storageKey = getCommentEntryStorageKey(entry);
    const canonicalKey = canonicalKeysByCandidate.get(storageKey);
    if (!canonicalKey) return;

    nextState[canonicalKey] = [
      ...(nextState[canonicalKey] ?? []),
      ...comments,
    ];
  });

  return nextState;
}

function buildRowCommentsSignature(rowComments = {}) {
  const normalizedState = Object.keys(rowComments)
    .sort()
    .reduce((signatureState, rowKey) => {
      signatureState[rowKey] = Array.isArray(rowComments[rowKey]) ? [...rowComments[rowKey]] : [];
      return signatureState;
    }, {});

  return JSON.stringify(normalizedState);
}

function buildSmoothSpecTransitionFrames(sourceText = '', targetText = '') {
  const normalizedSource = typeof sourceText === 'string' ? sourceText : '';
  const normalizedTarget = typeof targetText === 'string' ? targetText : '';

  if (normalizedSource === normalizedTarget) {
    return [];
  }

  const sourceLines = normalizedSource.split('\n');
  const targetLines = normalizedTarget.split('\n');
  let commonPrefixLength = 0;

  while (
    commonPrefixLength < sourceLines.length &&
    commonPrefixLength < targetLines.length &&
    sourceLines[commonPrefixLength] === targetLines[commonPrefixLength]
  ) {
    commonPrefixLength += 1;
  }

  let sourceSuffixIndex = sourceLines.length - 1;
  let targetSuffixIndex = targetLines.length - 1;

  while (
    sourceSuffixIndex >= commonPrefixLength &&
    targetSuffixIndex >= commonPrefixLength &&
    sourceLines[sourceSuffixIndex] === targetLines[targetSuffixIndex]
  ) {
    sourceSuffixIndex -= 1;
    targetSuffixIndex -= 1;
  }

  const leadingLines = sourceLines.slice(0, commonPrefixLength);
  const trailingLines = targetLines.slice(targetSuffixIndex + 1);
  const sourceChangedLines = sourceLines.slice(commonPrefixLength, sourceSuffixIndex + 1);
  const targetChangedLines = targetLines.slice(commonPrefixLength, targetSuffixIndex + 1);
  const maxChangedLineCount = Math.max(sourceChangedLines.length, targetChangedLines.length);

  if (maxChangedLineCount === 0) {
    return [normalizedTarget];
  }

  if (maxChangedLineCount === 1) {
    const inlineFrames = buildSmoothInlineTransitionFrames(
      sourceChangedLines[0] ?? '',
      targetChangedLines[0] ?? '',
    );

    return inlineFrames.map((nextLine, frameIndex) => {
      const frameLines = [...leadingLines];
      const shouldKeepPlaceholderLine =
        nextLine.length > 0 ||
        targetChangedLines.length > 0 ||
        frameIndex < inlineFrames.length - 1;

      if (shouldKeepPlaceholderLine) {
        frameLines.push(nextLine);
      }

      frameLines.push(...trailingLines);
      return frameLines.join('\n');
    });
  }

  const stepSize = Math.max(1, Math.ceil(maxChangedLineCount / AGENT_TASK_CONTENT_MORPH_MAX_FRAMES));
  const frames = [];

  for (
    let replaceCount = stepSize;
    replaceCount < maxChangedLineCount;
    replaceCount += stepSize
  ) {
    const frameLines = [...leadingLines];

    for (let lineIndex = 0; lineIndex < maxChangedLineCount; lineIndex += 1) {
      const nextLine =
        lineIndex < replaceCount
          ? targetChangedLines[lineIndex]
          : sourceChangedLines[lineIndex];

      if (typeof nextLine === 'string') {
        frameLines.push(nextLine);
      }
    }

    frameLines.push(...trailingLines);
    const frameText = frameLines.join('\n');

    if (frameText !== normalizedSource && frameText !== frames[frames.length - 1]) {
      frames.push(frameText);
    }
  }

  if (frames[frames.length - 1] !== normalizedTarget) {
    frames.push(normalizedTarget);
  }

  return frames;
}

function buildSmoothInlineTransitionFrames(sourceText = '', targetText = '') {
  const normalizedSource = typeof sourceText === 'string' ? sourceText : '';
  const normalizedTarget = typeof targetText === 'string' ? targetText : '';

  if (normalizedSource === normalizedTarget) {
    return [];
  }

  let commonPrefixLength = 0;

  while (
    commonPrefixLength < normalizedSource.length &&
    commonPrefixLength < normalizedTarget.length &&
    normalizedSource[commonPrefixLength] === normalizedTarget[commonPrefixLength]
  ) {
    commonPrefixLength += 1;
  }

  let sourceSuffixIndex = normalizedSource.length - 1;
  let targetSuffixIndex = normalizedTarget.length - 1;

  while (
    sourceSuffixIndex >= commonPrefixLength &&
    targetSuffixIndex >= commonPrefixLength &&
    normalizedSource[sourceSuffixIndex] === normalizedTarget[targetSuffixIndex]
  ) {
    sourceSuffixIndex -= 1;
    targetSuffixIndex -= 1;
  }

  const leadingText = normalizedSource.slice(0, commonPrefixLength);
  const trailingText = normalizedTarget.slice(targetSuffixIndex + 1);
  const sourceChangedText = normalizedSource.slice(commonPrefixLength, sourceSuffixIndex + 1);
  const targetChangedText = normalizedTarget.slice(commonPrefixLength, targetSuffixIndex + 1);
  const frames = [];
  const phaseFrameBudget = Math.max(1, Math.floor(AGENT_TASK_CONTENT_MORPH_INLINE_MAX_FRAMES / 2));
  const eraseStep = Math.max(1, Math.ceil(sourceChangedText.length / phaseFrameBudget));
  const appendStep = Math.max(1, Math.ceil(targetChangedText.length / phaseFrameBudget));

  for (
    let remainingCount = sourceChangedText.length - eraseStep;
    remainingCount > 0;
    remainingCount -= eraseStep
  ) {
    const frameText = `${leadingText}${sourceChangedText.slice(0, remainingCount)}${trailingText}`;
    if (frameText !== normalizedSource && frameText !== frames[frames.length - 1]) {
      frames.push(frameText);
    }
  }

  if (sourceChangedText.length > 0) {
    const collapsedFrame = `${leadingText}${trailingText}`;
    if (collapsedFrame !== normalizedSource && collapsedFrame !== frames[frames.length - 1]) {
      frames.push(collapsedFrame);
    }
  }

  for (
    let appendCount = appendStep;
    appendCount < targetChangedText.length;
    appendCount += appendStep
  ) {
    const frameText = `${leadingText}${targetChangedText.slice(0, appendCount)}${trailingText}`;
    if (frameText !== normalizedSource && frameText !== frames[frames.length - 1]) {
      frames.push(frameText);
    }
  }

  if (frames[frames.length - 1] !== normalizedTarget) {
    frames.push(normalizedTarget);
  }

  return frames;
}

function buildProblemsTreeForTab(tab, agentTaskIssuesOverride = null, commentEntries = [], relatedCommentIssues = []) {
  const meta = getProblemsMetaForTab(tab, agentTaskIssuesOverride);
  const fileIcon = renderProblemsFileIcon(tab);
  const mdCommentIssues = tab?.id?.startsWith('agent-task-') || tab?.label?.endsWith('.md')
    ? buildCommentIssuesFromEntries(commentEntries, {
        navigationTabId: tab?.id ?? null,
        icon: fileIcon,
      })
    : [];
  const externalCommentIssues = buildMergedExternalCommentIssues(commentEntries, relatedCommentIssues);
  const commentIssues = [
    ...mdCommentIssues,
    ...externalCommentIssues,
  ];
  const problemsCount = meta.issues.length;
  const commentCount = commentIssues.length;
  const secondarySuffixParts = [];
  if (problemsCount > 0) secondarySuffixParts.push(`${problemsCount} problem${problemsCount === 1 ? '' : 's'}`);
  if (commentCount > 0) secondarySuffixParts.push(`${commentCount} comment${commentCount === 1 ? '' : 's'}`);
  const secondarySuffix = secondarySuffixParts.length > 0
    ? `${PROBLEMS_SECONDARY_GAP}${secondarySuffixParts.join(PROBLEMS_SECONDARY_GAP)}`
    : '';
  const problemNodes = meta.issues.map((issue, index) => {
    const normalizedIssue = {
      ...issue,
      rawIndex: Number.isInteger(issue?.rawIndex)
        ? issue.rawIndex
        : parseProblemRawIndexFromSecondaryText(issue?.secondaryText),
    };

    return {
      id: buildProblemTreeNodeId(normalizedIssue, index),
      label: normalizedIssue.label,
      icon:
        normalizedIssue.severity === 'error'
          ? <ProblemsErrorNodeIcon />
          : <ProblemsWarningNodeIcon />,
      secondaryText: normalizedIssue.secondaryText,
    };
  });
  const commentNodes = commentIssues.map((issue, index) => {
    const normalizedIssue = {
      ...issue,
      rawIndex: Number.isInteger(issue?.rawIndex)
        ? issue.rawIndex
        : parseProblemRawIndexFromSecondaryText(issue?.secondaryText),
    };
    const display = getProblemsCommentNodeDisplay(normalizedIssue, meta.label);

    return {
      id: normalizedIssue.navigationTabId
        ? buildProblemOpenTabTreeNodeId(normalizedIssue, index)
        : buildProblemTreeNodeId(normalizedIssue, index),
      label: display.label,
      icon: normalizedIssue.icon ?? <ProblemsCommentNodeIcon />,
      secondaryText: display.secondaryText,
    };
  });
  const commentsGroupNode = commentNodes.length > 0
    ? {
        id: 'active-problems-comments',
        label: 'Comments',
        icon: <ProblemsCommentNodeIcon />,
        secondaryText: String(commentNodes.length),
        isExpanded: true,
        children: commentNodes,
      }
    : null;
  const treeChildren = [
    ...(commentsGroupNode ? [commentsGroupNode] : []),
    ...problemNodes,
  ];

  return [
    {
      id: 'active-problems-file',
      label: meta.label,
      icon: fileIcon,
      secondaryText: `${meta.path}${secondarySuffix}`,
      isExpanded: treeChildren.length > 0,
      children: treeChildren,
    },
  ];
}

function extractRuntimeInspectionIssues(results = [], kind, documentSections = null) {
  return results.reduce((issues, item, visibleIndex) => {
    if (item?.issue) {
      issues.push({
        ...item.issue,
        id: `${kind}-issue-${visibleIndex}`,
        rawIndex: getDocumentCheckRawIndex(documentSections, kind, visibleIndex),
      });
    }
    return issues;
  }, []);
}

function countIssuesBySeverity(issues = []) {
  return issues.reduce((summary, issue) => {
    if (issue?.severity === 'warning') summary.warningCount += 1;
    if (issue?.severity === 'error') summary.errorCount += 1;
    return summary;
  }, { warningCount: 0, errorCount: 0 });
}

function buildInspectionSummary({
  planRunResult = null,
  acRunResult = null,
  documentSections = null,
} = {}) {
  const runtimeIssues = [
    ...extractRuntimeInspectionIssues(planRunResult ?? [], 'plan', documentSections),
    ...extractRuntimeInspectionIssues(acRunResult ?? [], 'ac', documentSections),
  ];
  const issues = runtimeIssues;
  const { warningCount, errorCount } = countIssuesBySeverity(issues);

  return {
    issues,
    warningCount,
    errorCount,
  };
}

function resolveRuntimeInspectionItem(item) {
  if (!item) return item;

  return {
    ...item,
    status: 'passed',
    highlight: null,
    issue: null,
    checks: Array.isArray(item.checks)
      ? item.checks.map((check) => ({
          ...check,
          status: 'passed',
        }))
      : item.checks,
  };
}

function CompletionNestedChevron() {
  return (
    <span className="cmp-nested-chevron">
      <Icon name="general/chevronRight" size={16} />
    </span>
  );
}

function CompletionPopup({ trigger, query, selectedIdx, onSelect, onClose, style }) {
  const filtered = useMemo(() => {
    const items = trigger === '@' ? AT_COMPLETIONS : HASH_COMPLETIONS;
    return items.filter(item =>
      item.label.toLowerCase().includes(query.toLowerCase())
    ).slice(0, COMPLETION_POPUP_MAX_ITEMS);
  }, [query, trigger]);
  const [expandedIdx, setExpandedIdx] = useState(selectedIdx);
  const rootRef = useRef(null);
  const mainRef = useRef(null);
  const bodyRef = useRef(null);
  const rowRefs = useRef(new Map());
  const [submenuLayout, setSubmenuLayout] = useState({ top: 4, maxHeight: 320 });

  const setRowRef = useCallback((label, node) => {
    if (!label) return;

    if (node) {
      rowRefs.current.set(label, node);
    } else {
      rowRefs.current.delete(label);
    }
  }, []);

  useEffect(() => {
    if (filtered.length === 0) return;
    setExpandedIdx(Math.min(selectedIdx, filtered.length - 1));
  }, [filtered.length, query, selectedIdx, trigger]);

  const expandedItem = filtered[expandedIdx] ?? null;
  const expandedPreview = expandedItem ? getCompletionPreviewData(expandedItem) : null;

  const updateSubmenuLayout = useCallback(() => {
    const rootEl = rootRef.current;
    const mainEl = mainRef.current;
    const bodyEl = bodyRef.current;
    const rowEl = expandedItem ? rowRefs.current.get(expandedItem.label) : null;
    if (!(rootEl instanceof HTMLElement) || !(mainEl instanceof HTMLElement) || !(bodyEl instanceof HTMLElement) || !(rowEl instanceof HTMLElement)) {
      return;
    }

    const rootRect = rootEl.getBoundingClientRect();
    const rowRect = rowEl.getBoundingClientRect();
    const rowTop = rowRect.top - rootRect.top;
    const top = Math.max(4, Math.round(rowTop - 4));
    const maxHeight = Math.max(180, Math.round(window.innerHeight - rowRect.top - 16));

    setSubmenuLayout((prev) => (
      prev.top === top && prev.maxHeight === maxHeight
        ? prev
        : { top, maxHeight }
    ));
  }, [expandedItem]);

  useLayoutEffect(() => {
    updateSubmenuLayout();
  }, [expandedIdx, filtered, updateSubmenuLayout]);

  useEffect(() => {
    const bodyEl = bodyRef.current;
    if (!(bodyEl instanceof HTMLElement)) return undefined;

    bodyEl.addEventListener('scroll', updateSubmenuLayout, { passive: true });
    window.addEventListener('resize', updateSubmenuLayout);

    return () => {
      bodyEl.removeEventListener('scroll', updateSubmenuLayout);
      window.removeEventListener('resize', updateSubmenuLayout);
    };
  }, [updateSubmenuLayout]);

  if (filtered.length === 0) return null;

  return (
    <div ref={rootRef} className="cmp-popup-completion-root" style={style}>
      <div ref={mainRef} className="cmp-popup cmp-popup-completion-main">
        <div ref={bodyRef} className="cmp-popup-completion-body">
          {filtered.map((item, i) => {
            const matchLen = query.length;
            const matchesStart = item.label.toLowerCase().startsWith(query.toLowerCase());
            const isExpanded = i === expandedIdx;
            return (
              <div
                key={item.label}
                ref={(node) => setRowRef(item.label, node)}
                className={`cmp-item${isExpanded ? ' cmp-item-expanded' : ''}`}
                onMouseEnter={() => setExpandedIdx(i)}
              >
                <div
                  className={`cmp-cell${i === selectedIdx ? ' cmp-cell-selected' : ''}`}
                  onMouseDown={e => {
                    e.preventDefault();
                    onSelect(buildCompletionSelection(item));
                  }}
                >
                  <IconMdTask />
                  <div className="cmp-content">
                    <span className="cmp-label">
                      {matchesStart && matchLen > 0
                        ? <><span className="cmp-match">{item.label.slice(0, matchLen)}</span>{item.label.slice(matchLen)}</>
                        : item.label}
                    </span>
                    <span className="cmp-desc">{item.description}</span>
                  </div>
                  <CompletionNestedChevron />
                </div>
              </div>
            );
          })}
        </div>
        <div className="cmp-footer">
          <span className="cmp-footer-text">Press ⌃⇧Space to show only variants suitable by type</span>
          <span className="cmp-footer-tip">Next Tip</span>
        </div>
      </div>
      {expandedItem && expandedPreview && (
        <div
          className="cmp-popup cmp-submenu-window"
          style={{ top: submenuLayout.top, maxHeight: submenuLayout.maxHeight }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <div className="cmp-submenu-window-body">
            <div className="cmp-submenu-head">
              <div className="cmp-submenu-meta">
                <span className="cmp-submenu-title">Preview</span>
                <span className="cmp-submenu-caption">{expandedItem.label}</span>
              </div>
              <button
                type="button"
                className="cmp-submenu-link-btn"
                onMouseDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onSelect(buildCompletionSelection(expandedItem));
                }}
              >
                Reference file
              </button>
            </div>
            <div className="cmp-submenu-preview">
              {expandedPreview.previewLines.map((line, lineIndex) => (
                <span key={`${expandedItem.label}-preview-${lineIndex}`} className="cmp-submenu-line">
                  {line}
                </span>
              ))}
            </div>
            {expandedPreview.sections.length > 0 && (
              <div className="cmp-submenu-sections">
                <span className="cmp-submenu-sections-title">Reference section</span>
                <div className="cmp-submenu-section-list">
                  {expandedPreview.sections.map((section) => {
                    const selection = buildCompletionSelection(expandedItem, section);
                    return (
                      <button
                        key={`${expandedItem.label}-${section.id}`}
                        type="button"
                        className="cmp-submenu-section-btn"
                        onMouseDown={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          onSelect(selection);
                        }}
                      >
                        <span className="cmp-submenu-section-label">{section.title}</span>
                        <span className="cmp-submenu-section-anchor">#{section.anchor}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Add Popup ────────────────────────────────────────────────────────────────

const ADD_RECENT_FILES = [
  { label: 'Configuration.md',                    type: 'md', description: 'Agent Specifications' },
  { label: 'Visit-Booking.md',                    type: 'md', description: 'Agent Specifications' },
  { label: 'Vet-Schedules.md',                    type: 'md', description: 'Agent Specifications' },
  { label: 'Visit-Booking-Inspections.md',        type: 'md', description: 'Agent Specifications' },
  { label: 'Visit-Booking-Beat-3-Execution.md',   type: 'md', description: 'Agent Specifications' },
  { label: 'Visit-Booking-Code-Review-Moment.md', type: 'md', description: 'Agent Specifications' },
];

function getAddPopupFileType(label) {
  const lowerLabel = label.toLowerCase();
  if (lowerLabel.endsWith('.md')) return 'md';
  if (lowerLabel.endsWith('.py')) return 'py';
  if (lowerLabel.endsWith('.ipynb')) return 'ipynb';
  if (lowerLabel.endsWith('.txt')) return 'txt';
  return 'file';
}

function buildAddPopupFiles(agentTasks = []) {
  const taskFiles = agentTasks.map((task) => ({
    label: task.label,
    type: getAddPopupFileType(task.label),
    description: 'Agent Tasks',
  }));

  return [...taskFiles, ...ADD_RECENT_FILES].filter((item, index, items) =>
    items.findIndex((candidate) => candidate.label === item.label) === index
  );
}

function AddFileIcon({ type }) {
  if (type === 'md') return <Icon name="fileTypes/markdown" size={16} />;
  if (type === 'py') return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path fillRule="evenodd" clipRule="evenodd" d="M8 1C11 1 11 2 11 4L11 6.5C11 7.32843 10.3284 8 9.5 8H6.5C5.11929 8 4 9.11929 4 10.5V11C2 11 1 11 1 7.99999C1 4.99999 2 4.99998 4 4.99998L7.5 5C7.77614 5 8 4.77614 8 4.5C8 4.22386 7.77614 4 7.5 4H5C5 2 5 1 8 1ZM6.5 3C6.77614 3 7 2.77614 7 2.5C7 2.22386 6.77614 2 6.5 2C6.22386 2 6 2.22386 6 2.5C6 2.77614 6.22386 3 6.5 3Z" fill="#548AF7" />
      <path fillRule="evenodd" clipRule="evenodd" d="M12 5V6.5C12 7.88071 10.8807 9 9.5 9H6.5C5.67157 9 5 9.67157 5 10.5L5 12C5 14 5 15 8 15C11 15 11 14 11 12L8.5 12C8.22386 12 8 11.7761 8 11.5C8 11.2239 8.22386 11 8.5 11L12 11C14 11 15 11 15 8C15 5 14 5 12 5ZM9.5 14C9.77614 14 10 13.7761 10 13.5C10 13.2239 9.77614 13 9.5 13C9.22386 13 9 13.2239 9 13.5C9 13.7761 9.22386 14 9.5 14Z" fill="#F2C55C" />
    </svg>
  );
  if (type === 'ipynb') return <Icon name="fileTypes/scratch" size={16} />;
  return <Icon name="fileTypes/text" size={16} />;
}

function AddPopup({ onClose, onSelectFile, style, files = ADD_RECENT_FILES }) {
  const [search, setSearch] = useState('');
  const filtered = files.filter(f =>
    f.label.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="add-popup" style={style} onMouseDown={e => e.stopPropagation()}>
      {/* Search */}
      <div className="add-popup-search">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
          <circle cx="6.5" cy="6.5" r="4.5" stroke="#6F737A" strokeWidth="1.2"/>
          <path d="M10 10L13.5 13.5" stroke="#6F737A" strokeWidth="1.2" strokeLinecap="round"/>
        </svg>
        <input
          className="add-popup-search-input"
          placeholder="Search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          autoFocus
        />
      </div>

      <div className="add-popup-divider" />

      {/* Static items */}
      {!search && (
        <div className="popup-cell popup-cell-header">
          <div className="popup-cell-content">
            <div className="popup-cell-header-text text-ui-default-semibold">Recent files</div>
          </div>
        </div>
      )}

      {/* File list */}
      <div className="add-popup-files">
        {filtered.map(f => (
          <div key={f.label} className="add-popup-item" onMouseDown={() => { onSelectFile?.(f); onClose(); }}>
            <AddFileIcon type={f.type} />
            <span className="add-popup-item-label">{f.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Walkthrough Spec ────────────────────────────────────────────────────────

const SPEC_LINES = [
  { text: 'Goal',                                                                                            type: 'heading' },
  { text: 'Add vet assignment and time slot selection to the visit creation flow.',                         type: 'text' },
  { text: 'When booking a visit, users pick a vet and a time slot for the chosen date. The system prevents double-booking (same vet, same date+time).', type: 'text' },
  { text: '',                                                                                                 type: 'empty'   },
  { text: 'Plan',                                                                                            type: 'heading' },
  { text: '\u2610 Schema changes \u2014 add vet_id (FK) and visit_time (TIME) to visits table',              type: 'check'   },
  { text: '\u2610 Visit entity \u2014 add @ManyToOne vet and LocalTime time with @NotNull',                  type: 'check'   },
  { text: '\u2610 VisitRepository \u2014 add existsByVetIdAndDateAndTime for double-booking check',           type: 'check'   },
  { text: '\u2610 VisitController \u2014 inject VetRepository, add @ModelAttribute("vets") with findAll()',   type: 'check'   },
  { text: '\u2610 Form template \u2014 add <select> for vet and <select> for time slot',                      type: 'check'   },
  { text: '\u2610 Owner details \u2014 add Vet and Time columns to visit history table',                      type: 'check'   },
  { text: '\u2610 Tests \u2014 vet list in model, successful booking, double-booking rejected',               type: 'check'   },
  { text: '',                                                                                                 type: 'empty'   },
  { text: 'Acceptance Criteria',                                                                             type: 'heading' },
  { text: '\u2610 Visit form shows a dropdown filtered to available vets for selected date/time.',                type: 'check'   },
  { text: '\u2610 Visit form includes a time slot picker (e.g. hourly slots 09:00\u201316:00).',             type: 'check'   },
  { text: '\u2610 A vet cannot be booked for the same date+time twice (server-side validation + database unique constraint).', type: 'check' },
  { text: '\u2610 Vet and time are persisted with the visit.',                                               type: 'check'   },
  { text: '\u2610 Existing visit display (owner details page) shows the assigned vet and time.',             type: 'check'   },
  { text: '\u2610 All three DB schemas (H2, MySQL, PostgreSQL) and seed data are updated.',                  type: 'check'   },
  { text: '',                                                                                                 type: 'empty'   },
  { text: 'Implementation Notes',                                                                            type: 'heading' },
  { text: '\u2022 Current Visit entity has only date (LocalDate) and description (String). No relationship to Vet.', type: 'note' },
  { text: '\u2022 Visits persisted via cascade (Owner \u2192 Pet \u2192 Visit). No VisitRepository exists.',  type: 'note'    },
  { text: '\u2022 VetRepository.findAll() is @Cacheable("vets"). Returns Collection<Vet>.',                  type: 'note'    },
  { text: '\u2022 Project uses Formatter<T> for form selects (see PetTypeFormatter).',                        type: 'note'    },
  { text: '',                                                                                                 type: 'empty'   },
  { text: 'Decisions',                                                                                       type: 'heading' },
  { text: '',                                                                                                 type: 'empty'   },
  { text: 'Other',                                                                                           type: 'heading' },
  { text: '// Dynamic availability (AJAX) \u2014 not in prompt, out of scope',                               type: 'comment' },
  { text: '// Vet specialties matching \u2014 not in prompt, out of scope',                                   type: 'comment' },
];

const VISIT_BOOKING_GOAL_LINE_ONE = 'Add vet assignment and time slot selection to the visit creation flow.';
const VISIT_BOOKING_GOAL_LINE_TWO = 'When booking a visit, users pick a vet and a time slot for the chosen date. The system prevents double-booking (same vet, same date+time).';
const LEGACY_VISIT_BOOKING_GOAL_TEXT = `${VISIT_BOOKING_GOAL_LINE_ONE} ${VISIT_BOOKING_GOAL_LINE_TWO}`;

function isLegacyVisitBookingGoalText(text = '') {
  return String(text)
    .replace(/\s+/g, ' ')
    .trim() === LEGACY_VISIT_BOOKING_GOAL_TEXT;
}

function normalizeLegacyVisitBookingGoalCode(code = '') {
  if (typeof code !== 'string' || !code) {
    return code;
  }

  const lines = code.split(/\r?\n/);
  let inGoalSection = false;
  let replaced = false;
  const nextLines = [];

  lines.forEach((line) => {
    const headingTitle = getDoneHeadingTitle(line);
    if (headingTitle !== null) {
      inGoalSection = headingTitle.toLowerCase() === 'goal';
      nextLines.push(line);
      return;
    }

    if (inGoalSection && !replaced && isLegacyVisitBookingGoalText(line)) {
      nextLines.push(VISIT_BOOKING_GOAL_LINE_ONE, VISIT_BOOKING_GOAL_LINE_TWO);
      replaced = true;
      return;
    }

    nextLines.push(line);
  });

  return replaced ? nextLines.join('\n') : code;
}

function normalizeLegacyVisitBookingGoalDocumentSections(documentSections = []) {
  if (!Array.isArray(documentSections)) {
    return [];
  }

  let hasChanges = false;

  const nextSections = documentSections.map((section) => {
    if (section?.title?.toLowerCase() !== 'goal') {
      return section;
    }

    let sectionChanged = false;
    const nextItems = [];

    (section.items ?? []).forEach((item) => {
      if (item?.type === 'paragraph' && isLegacyVisitBookingGoalText(item.text)) {
        const baseId = item.id ?? 'goal-text';
        nextItems.push(
          {
            ...item,
            id: `${baseId}-1`,
            text: VISIT_BOOKING_GOAL_LINE_ONE,
          },
          {
            ...item,
            id: `${baseId}-2`,
            text: VISIT_BOOKING_GOAL_LINE_TWO,
          },
        );
        hasChanges = true;
        sectionChanged = true;
        return;
      }

      nextItems.push(item);
    });

    return sectionChanged ? { ...section, items: nextItems } : section;
  });

  return hasChanges ? nextSections : documentSections;
}

function normalizeLegacyDerivedPlanChildrenCode(code = '') {
  if (typeof code !== 'string' || !code) {
    return code;
  }

  const lines = code.split(/\r?\n/);
  let inPlanSection = false;
  let currentLegacyChildren = [];
  let currentScopedChildren = [];
  let currentChildIndex = 0;
  let changed = false;

  const nextLines = lines.map((line) => {
    const headingTitle = getDoneHeadingTitle(line);
    if (headingTitle !== null) {
      inPlanSection = headingTitle.toLowerCase() === 'plan';
      currentLegacyChildren = [];
      currentScopedChildren = [];
      currentChildIndex = 0;
      return line;
    }

    if (!inPlanSection) {
      return line;
    }

    const parentMatch = line.match(/^- \[[ x]\]\s+(.*)$/i);
    if (parentMatch) {
      const parentText = parentMatch[1].trim();
      currentLegacyChildren = buildPlanContentSubitems({ text: parentText, includeScope: false }).map((item) => item.text);
      currentScopedChildren = buildPlanContentSubitems({ text: parentText, includeScope: true }).map((item) => item.text);
      currentChildIndex = 0;
      return line;
    }

    const childMatch = line.match(/^(\s{2,}- \[[ x]\]\s+)(.*)$/i);
    if (childMatch) {
      const currentChildText = childMatch[2].trim();
      const legacyText = currentLegacyChildren[currentChildIndex] ?? null;
      const scopedText = currentScopedChildren[currentChildIndex] ?? null;
      currentChildIndex += 1;

      if (legacyText && scopedText && currentChildText === legacyText && currentChildText !== scopedText) {
        changed = true;
        return `${childMatch[1]}${scopedText}`;
      }

      return line;
    }

    currentLegacyChildren = [];
    currentScopedChildren = [];
    currentChildIndex = 0;
    return line;
  });

  return changed ? nextLines.join('\n') : code;
}

function formatWalkthroughLine(line) {
  if (line.type === 'heading') return `## ${line.text}`;
  if (line.type === 'check') return `- [ ] ${line.text.replace(/^☐\s*/, '')}`;
  if (line.type === 'note') return line.text.replace(/^•\s*/, '- ');
  return line.text;
}

function WalkthroughSpec({ visible }) {
  return (
    <div className="walkthrough-content" data-overlay-scroll-body="true">
      <div className="walkthrough-text">
        {SPEC_LINES.slice(0, visible).map((line, i) => (
          <div key={i} className={`walkthrough-line walkthrough-line-${line.type}`}>
            {line.text ? formatWalkthroughLine(line) : '\u00A0'}
          </div>
        ))}
      </div>
    </div>
  );
}

function createSpecDocument() {
  return [
    {
      id: 'goal',
      title: 'Goal',
      items: [
        {
          id: 'goal-text-1',
          type: 'paragraph',
          text: VISIT_BOOKING_GOAL_LINE_ONE,
        },
        {
          id: 'goal-text-2',
          type: 'paragraph',
          text: VISIT_BOOKING_GOAL_LINE_TWO,
        },
      ],
    },
    {
      id: 'plan',
      title: 'Plan',
      meta: { kind: 'chip', text: 'Configuration.md' },
      items: [
        { id: 'plan-1', type: 'check', checked: false, text: 'Schema changes \u2014 add vet_id (FK) and visit_time (TIME) to visits table' },
        { id: 'plan-2', type: 'check', checked: false, text: 'Visit entity \u2014 add @ManyToOne vet and LocalTime time with @NotNull' },
        { id: 'plan-3', type: 'check', checked: false, text: 'VisitRepository \u2014 add existsByVetIdAndDateAndTime for double-booking check' },
        { id: 'plan-4', type: 'check', checked: false, text: 'VisitController \u2014 inject VetRepository, add @ModelAttribute("vets") with findAll()' },
        { id: 'plan-5', type: 'check', checked: false, text: 'Form template \u2014 add <select> for vet and <select> for time slot' },
        { id: 'plan-6', type: 'check', checked: false, text: 'Owner details \u2014 add Vet and Time columns to visit history table' },
        { id: 'plan-7', type: 'check', checked: false, text: 'Tests \u2014 vet list in model, successful booking, double-booking rejected' },
      ],
    },
    {
      id: 'acceptance',
      title: 'Acceptance Criteria',
      items: [
        { id: 'ac-1', type: 'check', checked: false, text: 'Visit form shows a dropdown filtered to available vets for selected date/time.' },
        { id: 'ac-2', type: 'check', checked: false, text: 'Visit form includes a time slot picker (e.g. hourly slots 09:00\u201316:00).' },
        { id: 'ac-3', type: 'check', checked: false, text: 'A vet cannot be booked for the same date+time twice (server-side validation + database unique constraint).' },
        { id: 'ac-4', type: 'check', checked: false, text: 'Vet and time are persisted with the visit.' },
        { id: 'ac-5', type: 'check', checked: false, text: 'Existing visit display (owner details page) shows the assigned vet and time.' },
        { id: 'ac-6', type: 'check', checked: false, text: 'All three DB schemas (H2, MySQL, PostgreSQL) and seed data are updated.' },
      ],
    },
    {
      id: 'implementation',
      title: 'Implementation Notes',
      items: [
        { id: 'impl-1', type: 'bullet', text: 'Current Visit entity has only date (LocalDate) and description (String). No relationship to Vet.' },
        { id: 'impl-2', type: 'bullet', text: 'Visits persisted via cascade (Owner \u2192 Pet \u2192 Visit). No VisitRepository exists.' },
        { id: 'impl-3', type: 'bullet', text: 'VetRepository.findAll() is @Cacheable("vets"). Returns Collection<Vet>.' },
        { id: 'impl-4', type: 'bullet', text: 'Project uses Formatter<T> for form selects (see PetTypeFormatter).' },
      ],
    },
    {
      id: 'tradeoffs',
      title: 'Decisions',
      items: [],
    },
    {
      id: 'other',
      title: 'Other',
      items: [
        { id: 'other-1', type: 'comment', text: 'Dynamic availability (AJAX) \u2014 not in prompt, out of scope' },
        { id: 'other-2', type: 'comment', text: 'Vet specialties matching \u2014 not in prompt, out of scope' },
      ],
    },
  ].map((section) => withDerivedPlanChildren(section));
}

function createFeatureTemplateSpecDocument() {
  return [
    {
      id: 'feature-summary',
      title: 'Feature Summary',
      items: [
        { id: 'feature-summary-1', type: 'paragraph', text: 'Describe the user-facing capability you want to add.' },
        { id: 'feature-summary-2', type: 'paragraph', text: 'Context: mention the screen, workflow, API, or module this feature belongs to.' },
      ],
    },
    {
      id: 'feature-user-value',
      title: 'User Value',
      items: [
        { id: 'feature-value-1', type: 'bullet', text: 'Who benefits from this feature?' },
        { id: 'feature-value-2', type: 'bullet', text: 'What user problem or business goal does it solve?' },
      ],
    },
    {
      id: 'feature-plan',
      title: 'Implementation Plan',
      items: [
        {
          id: 'feature-plan-1',
          type: 'check',
          checked: false,
          text: 'Identify the affected UI, backend, data, and integration surfaces.',
          children: [
            { id: 'feature-plan-1-child-1', type: 'check', checked: false, text: 'List files/components/services likely to change.' },
            { id: 'feature-plan-1-child-2', type: 'check', checked: false, text: 'Call out migrations, flags, or compatibility constraints.' },
          ],
        },
        {
          id: 'feature-plan-2',
          type: 'check',
          checked: false,
          text: 'Implement the smallest complete vertical slice.',
          children: [
            { id: 'feature-plan-2-child-1', type: 'check', checked: false, text: 'Describe the happy path.' },
            { id: 'feature-plan-2-child-2', type: 'check', checked: false, text: 'Describe empty, loading, permission, and error states.' },
          ],
        },
        {
          id: 'feature-plan-3',
          type: 'check',
          checked: false,
          text: 'Add tests and verification coverage.',
          children: [
            { id: 'feature-plan-3-child-1', type: 'check', checked: false, text: 'Unit/integration tests to add or update.' },
            { id: 'feature-plan-3-child-2', type: 'check', checked: false, text: 'Manual checks or demo flow.' },
          ],
        },
      ],
    },
    {
      id: 'feature-acceptance',
      title: 'Acceptance Criteria',
      items: [
        { id: 'feature-ac-1', type: 'check', checked: false, text: 'User can complete the new workflow from start to finish.' },
        { id: 'feature-ac-2', type: 'check', checked: false, text: 'The feature handles validation, permissions, and failure states.' },
        { id: 'feature-ac-3', type: 'check', checked: false, text: 'Existing behavior remains unchanged outside the described scope.' },
      ],
    },
    {
      id: 'feature-notes',
      title: 'Implementation Notes',
      items: [
        { id: 'feature-notes-1', type: 'bullet', text: 'Add relevant codebase observations here.' },
        { id: 'feature-notes-2', type: 'bullet', text: 'Add API, schema, design, or dependency constraints here.' },
      ],
    },
    {
      id: 'feature-decisions',
      title: 'Decisions',
      items: [
        { id: 'feature-decision-1', type: 'comment', text: 'Record tradeoffs, alternatives rejected, or assumptions that need confirmation.' },
      ],
    },
    {
      id: 'feature-other',
      title: 'Out of Scope',
      items: [
        { id: 'feature-other-1', type: 'comment', text: 'List adjacent requests that should not be implemented in this task.' },
      ],
    },
  ].map((section) => withDerivedPlanChildren(section));
}

function createBugFixTemplateSpecDocument() {
  return [
    {
      id: 'bug-summary',
      title: 'Bug Summary',
      items: [
        { id: 'bug-summary-1', type: 'paragraph', text: 'Describe the broken behavior and where it happens.' },
        { id: 'bug-summary-2', type: 'paragraph', text: 'Impact: who is affected, how often it happens, and how severe it is.' },
      ],
    },
    {
      id: 'bug-reproduction',
      title: 'Reproduction Steps',
      items: [
        { id: 'bug-repro-1', type: 'check', checked: false, text: 'Open or set up the affected state.' },
        { id: 'bug-repro-2', type: 'check', checked: false, text: 'Perform the action that triggers the bug.' },
        { id: 'bug-repro-3', type: 'check', checked: false, text: 'Observe the incorrect result.' },
      ],
    },
    {
      id: 'bug-expected',
      title: 'Expected Behavior',
      items: [
        { id: 'bug-expected-1', type: 'paragraph', text: 'Describe what should happen instead.' },
      ],
    },
    {
      id: 'bug-actual',
      title: 'Actual Behavior',
      items: [
        { id: 'bug-actual-1', type: 'paragraph', text: 'Describe what currently happens, including errors, logs, or screenshots if relevant.' },
      ],
    },
    {
      id: 'bug-plan',
      title: 'Fix Plan',
      items: [
        {
          id: 'bug-plan-1',
          type: 'check',
          checked: false,
          text: 'Locate the failing code path and confirm the root cause.',
          children: [
            { id: 'bug-plan-1-child-1', type: 'check', checked: false, text: 'Identify the affected files, inputs, and state transitions.' },
            { id: 'bug-plan-1-child-2', type: 'check', checked: false, text: 'Explain why the current behavior is wrong.' },
          ],
        },
        {
          id: 'bug-plan-2',
          type: 'check',
          checked: false,
          text: 'Apply a minimal fix that preserves existing behavior.',
          children: [
            { id: 'bug-plan-2-child-1', type: 'check', checked: false, text: 'Describe the code change.' },
            { id: 'bug-plan-2-child-2', type: 'check', checked: false, text: 'Call out compatibility or migration risks.' },
          ],
        },
        {
          id: 'bug-plan-3',
          type: 'check',
          checked: false,
          text: 'Add regression coverage.',
          children: [
            { id: 'bug-plan-3-child-1', type: 'check', checked: false, text: 'Add or update tests that fail before the fix.' },
            { id: 'bug-plan-3-child-2', type: 'check', checked: false, text: 'Add manual verification steps if automated coverage is not enough.' },
          ],
        },
      ],
    },
    {
      id: 'bug-acceptance',
      title: 'Acceptance Criteria',
      items: [
        { id: 'bug-ac-1', type: 'check', checked: false, text: 'The reproduction steps no longer produce the bug.' },
        { id: 'bug-ac-2', type: 'check', checked: false, text: 'The expected behavior is covered by regression tests.' },
        { id: 'bug-ac-3', type: 'check', checked: false, text: 'No related existing workflow regresses.' },
      ],
    },
    {
      id: 'bug-notes',
      title: 'Investigation Notes',
      items: [
        { id: 'bug-notes-1', type: 'bullet', text: 'Add stack traces, logs, recent changes, or suspicious files here.' },
      ],
    },
    {
      id: 'bug-other',
      title: 'Out of Scope',
      items: [
        { id: 'bug-other-1', type: 'comment', text: 'List cleanup or redesign work that should not be bundled into this bug fix.' },
      ],
    },
  ].map((section) => withDerivedPlanChildren(section));
}

function createTaskTemplateSpecDocument(templateId = 'feature') {
  return templateId === 'bug-fix'
    ? createBugFixTemplateSpecDocument()
    : createFeatureTemplateSpecDocument();
}

function serializeSpecDocument(documentSections) {
  return buildSerializedDocumentLines(documentSections).code;
}

function findBaseSectionForParsedCode(baseDocumentSections = [], nextSections = [], title = '') {
  const normalizedTitle = title.trim().toLowerCase();
  const usedBaseSectionIds = new Set(nextSections.map((section) => section.baseSectionId).filter(Boolean));
  const unusedBaseSections = (baseDocumentSections ?? []).filter((section) => !usedBaseSectionIds.has(section?.id));

  return unusedBaseSections.find((section) => section?.title?.trim().toLowerCase() === normalizedTitle)
    ?? unusedBaseSections[0]
    ?? null;
}

function parseSpecCodeToDocumentSections(code, baseDocumentSections = []) {
  const baseSections = Array.isArray(baseDocumentSections) ? baseDocumentSections : [];
  const lines = typeof code === 'string' ? code.split(/\r?\n/) : [];
  const nextSections = [];
  let currentSection = null;
  let currentBaseSection = null;
  let itemIndex = 0;
  let activeParentCheckItem = null;
  let activeParentBaseItem = null;
  let activeParentChildIndex = 0;

  const startSection = (title) => {
    const nextTitle = typeof title === 'string' && title.trim().length > 0
      ? title.trim()
      : `Section ${nextSections.length + 1}`;
    currentBaseSection = findBaseSectionForParsedCode(baseSections, nextSections, nextTitle);
    const sectionId = currentBaseSection?.id ?? `section-${nextSections.length}`;
    currentSection = {
      id: sectionId,
      title: nextTitle,
      items: [],
      ...(currentBaseSection?.meta ? { meta: { ...currentBaseSection.meta } } : {}),
      baseSectionId: currentBaseSection?.id ?? null,
    };
    nextSections.push(currentSection);
    itemIndex = 0;
    activeParentCheckItem = null;
    activeParentBaseItem = null;
    activeParentChildIndex = 0;
  };

  const pushItem = (item) => {
    if (!currentSection || !item) return;

    const baseItem = currentBaseSection?.items?.[itemIndex] ?? null;
    const nextItem = {
      id: baseItem?.id ?? `${currentSection.id}:item-${itemIndex}`,
      ...item,
    };
    currentSection.items.push(nextItem);
    itemIndex += 1;

    if (item.type === 'check') {
      activeParentCheckItem = nextItem;
      activeParentBaseItem = baseItem;
      activeParentChildIndex = 0;
    } else {
      activeParentCheckItem = null;
      activeParentBaseItem = null;
      activeParentChildIndex = 0;
    }
  };

  const pushChildCheckItem = (item) => {
    if (!activeParentCheckItem || !item) return;

    const baseChildItem = activeParentBaseItem?.children?.[activeParentChildIndex] ?? null;
    const nextChildItem = {
      id: baseChildItem?.id ?? `${activeParentCheckItem.id}:child-${activeParentChildIndex + 1}`,
      ...item,
    };

    activeParentCheckItem.children = [
      ...(activeParentCheckItem.children ?? []),
      nextChildItem,
    ];
    activeParentChildIndex += 1;
  };

  lines.forEach((line) => {
    const headingTitle = getDoneHeadingTitle(line);
    if (headingTitle !== null) {
      startSection(headingTitle);
      return;
    }

    if (!currentSection || line.trim().length === 0) {
      activeParentCheckItem = null;
      activeParentBaseItem = null;
      activeParentChildIndex = 0;
      return;
    }

    const refFileMatch = line.match(/^Reference file:\s+(.+)$/);
    if (refFileMatch) {
      currentSection.meta = {
        ...(currentSection.meta ?? {}),
        kind: 'chip',
        text: refFileMatch[1].trim(),
      };
      activeParentCheckItem = null;
      activeParentBaseItem = null;
      activeParentChildIndex = 0;
      return;
    }

    const childCheckMatch = line.match(/^\s{2,}-\s+\[([ x])\]\s+(.*)$/i);
    if (childCheckMatch && activeParentCheckItem?.type === 'check') {
      pushChildCheckItem({
        type: 'check',
        checked: childCheckMatch[1].toLowerCase() === 'x',
        text: childCheckMatch[2].trim(),
      });
      return;
    }

    const checkMatch = line.match(/^-\s+\[([ x])\]\s+(.*)$/i);
    if (checkMatch) {
      pushItem({
        type: 'check',
        checked: checkMatch[1].toLowerCase() === 'x',
        text: checkMatch[2].trim(),
      });
      return;
    }

    const bulletMatch = line.match(/^-\s+(.*)$/);
    if (bulletMatch) {
      pushItem({
        type: 'bullet',
        text: bulletMatch[1].trim(),
      });
      return;
    }

    const commentMatch = line.match(/^\/\/\s?(.*)$/);
    if (commentMatch) {
      pushItem({
        type: 'comment',
        text: commentMatch[1].trim(),
      });
      return;
    }

    pushItem({
      type: 'paragraph',
      text: line.trim(),
    });
  });

  if (nextSections.length === 0) {
    return baseSections;
  }

  return nextSections.map(({ baseSectionId, ...section }) => section);
}

function normalizeDoneEditableText(text = '') {
  return String(text)
    .replace(/\u200B/g, '')
    .replace(/\u00A0/g, ' ')
    .replace(/\s*[\r\n]+\s*/g, ' ')
    .trim();
}

function normalizeSpecCodeForComparison(code = '') {
  return String(code)
    .replace(/\u200B/g, '')
    .replace(/\u00A0/g, ' ')
    .split(/\r?\n/)
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .trimEnd();
}

function normalizeSpecLineForComparison(line = '') {
  return normalizeSpecCodeForComparison(String(line)).trim();
}

function getVisibleDoneOverlayElement() {
  if (typeof document === 'undefined') {
    return null;
  }

  return Array.from(document.querySelectorAll('.spec-done-overlay')).find((node) => (
    node instanceof HTMLElement
    && node.getClientRects().length > 0
    && node.offsetParent !== null
  )) ?? null;
}

function extractSnapshotLineFromDoneRow(rowEl, originalLine = '') {
  // Row was deleted by the user — contribute an empty line to the snapshot
  if (rowEl instanceof HTMLElement && rowEl.dataset.deleted === 'true') return '';
  // Row's prefix (checkbox/bullet) was cleared — treat as empty line
  if (rowEl instanceof HTMLElement && rowEl.dataset.cleared === 'true') return '';

  const sourceLine = typeof originalLine === 'string' ? originalLine : '';
  const headingTitle = getDoneHeadingTitle(sourceLine);

  if (headingTitle !== null) {
    const headingEl = rowEl?.querySelector('.spec-done-heading[contenteditable]');
    const nextHeading = normalizeDoneEditableText(headingEl?.textContent ?? headingTitle);
    return `## ${nextHeading}`;
  }

  if (/^Reference file:\s+/i.test(sourceLine)) {
    const refLabel = Array.from(rowEl?.querySelectorAll('.attached-file-label') ?? [])
      .map((node) => normalizeDoneEditableText(node.textContent ?? ''))
      .find(Boolean)
      ?? normalizeDoneEditableText(sourceLine.replace(/^Reference file:\s+/i, ''));
    return refLabel ? `Reference file: ${refLabel}` : 'Reference file:';
  }

  if (!sourceLine.trim()) {
    return '';
  }

  const editableEl = rowEl?.querySelector('[contenteditable]');
  if (!(editableEl instanceof HTMLElement)) {
    return sourceLine;
  }

  const nextText = normalizeDoneEditableText(editableEl.textContent ?? sourceLine);
  const checkMatch = sourceLine.match(/^(\s*-\s+\[[ x]\]\s+)(.*)$/i);
  if (checkMatch) {
    return `${checkMatch[1]}${nextText}`;
  }

  const bulletMatch = sourceLine.match(/^(\s*-\s+)(.*)$/);
  if (bulletMatch) {
    return `${bulletMatch[1]}${nextText}`;
  }

  const commentMatch = sourceLine.match(/^(\s*\/\/\s?)(.*)$/);
  if (commentMatch) {
    return `${commentMatch[1]}${nextText}`;
  }

  return nextText;
}

function buildDoneOverlaySnapshotCode(sourceCode = '') {
  const overlayEl = getVisibleDoneOverlayElement();
  const normalizedSourceCode = typeof sourceCode === 'string' ? sourceCode : '';

  if (!(overlayEl instanceof HTMLElement)) {
    return normalizedSourceCode;
  }

  const sourceLines = normalizedSourceCode.split(/\r?\n/);
  const nextLines = [...sourceLines];

  overlayEl.querySelectorAll('.spec-done-row[data-raw-index]').forEach((rowNode) => {
    if (!(rowNode instanceof HTMLElement)) return;

    const rawIndex = Number(rowNode.dataset.rawIndex);
    if (!Number.isInteger(rawIndex) || rawIndex < 0 || rawIndex >= nextLines.length) {
      return;
    }

    nextLines[rawIndex] = extractSnapshotLineFromDoneRow(rowNode, sourceLines[rawIndex] ?? '');
  });

  return nextLines.join('\n');
}

function buildSpecVersionLabel(versionNumber = 1) {
  return `Version ${versionNumber}`;
}

function normalizeSpecVersionCommentEntries(commentEntries = []) {
  if (!Array.isArray(commentEntries)) {
    return [];
  }

  return commentEntries.reduce((entries, entry, entryIndex) => {
    const diffComments = normalizeStoredDiffCommentsState(entry?.diffComments);
    const directComments = Array.isArray(entry?.comments)
      ? entry.comments.filter((comment) => getStoredCommentText(comment).trim().length > 0)
      : [];
    const comments = directComments.length > 0
      ? directComments
      : flattenStoredDiffCommentsState(diffComments);

    if (comments.length === 0 && Object.keys(diffComments).length === 0) {
      return entries;
    }

    const normalizedEntry = {
      id: typeof entry?.id === 'string' && entry.id.length > 0
        ? entry.id
        : `spec-version-comment-${entryIndex}`,
      line: typeof entry?.line === 'string' ? entry.line : '',
      sectionTitle: typeof entry?.sectionTitle === 'string' ? entry.sectionTitle : '',
      comments,
    };

    if (typeof entry?.rowStableKey === 'string' && entry.rowStableKey.length > 0) {
      normalizedEntry.rowStableKey = entry.rowStableKey;
    }

    if (Number.isInteger(entry?.rowIndex) && entry.rowIndex >= 0) {
      normalizedEntry.rowIndex = entry.rowIndex;
    }

    if (Number.isInteger(entry?.rawIndex) && entry.rawIndex >= 0) {
      normalizedEntry.rawIndex = entry.rawIndex;
    }

    const normalizedCheckTarget = normalizeCommentTarget(entry?.checkTarget);
    if (normalizedCheckTarget) {
      normalizedEntry.checkTarget = normalizedCheckTarget;
    }

    const normalizedIssueTarget = normalizeCommentTarget(entry?.issueTarget);
    if (normalizedIssueTarget) {
      normalizedEntry.issueTarget = normalizedIssueTarget;
    }

    if (typeof entry?.issueSeverity === 'string' && entry.issueSeverity.length > 0) {
      normalizedEntry.issueSeverity = entry.issueSeverity;
    }

    if (entry?.hideInlineInDocument) {
      normalizedEntry.hideInlineInDocument = true;
    }

    if (typeof entry?.sourceKind === 'string' && entry.sourceKind.length > 0) {
      normalizedEntry.sourceKind = entry.sourceKind;
    }

    if (typeof entry?.sourceLabel === 'string' && entry.sourceLabel.length > 0) {
      normalizedEntry.sourceLabel = entry.sourceLabel;
    }

    if (typeof entry?.sourceIcon === 'string' && entry.sourceIcon.length > 0) {
      normalizedEntry.sourceIcon = entry.sourceIcon;
    }

    if (typeof entry?.sourceNavigationTabId === 'string' && entry.sourceNavigationTabId.length > 0) {
      normalizedEntry.sourceNavigationTabId = entry.sourceNavigationTabId;
    }

    if (typeof entry?.sourceNavigationRowId === 'string' && entry.sourceNavigationRowId.length > 0) {
      normalizedEntry.sourceNavigationRowId = entry.sourceNavigationRowId;
    }

    if (Number.isInteger(entry?.sourceLineNumber) && entry.sourceLineNumber > 0) {
      normalizedEntry.sourceLineNumber = entry.sourceLineNumber;
    }

    if (Object.keys(diffComments).length > 0) {
      normalizedEntry.diffComments = diffComments;
    }

    entries.push(normalizedEntry);
    return entries;
  }, []);
}

function buildSpecVersionCommentEntriesSignature(commentEntries = []) {
  return JSON.stringify(normalizeSpecVersionCommentEntries(commentEntries));
}

function createSpecVersionEntry({
  number = 1,
  code = '',
  createdAt = Date.now(),
  id = null,
  commentEntries = [],
} = {}) {
  const normalizedNumber = Number.isInteger(number) && number > 0 ? number : 1;
  const normalizedCreatedAt = Number.isFinite(createdAt) ? createdAt : Date.now();

  return {
    id: id ?? `spec-version-${normalizedNumber}-${normalizedCreatedAt}`,
    number: normalizedNumber,
    label: buildSpecVersionLabel(normalizedNumber),
    code: typeof code === 'string' ? code : '',
    commentEntries: normalizeSpecVersionCommentEntries(commentEntries),
    createdAt: normalizedCreatedAt,
  };
}

function buildInitialSpecVersionHistory(code = '', commentEntries = []) {
  const initialEntry = createSpecVersionEntry({ number: 1, code, commentEntries });
  return {
    currentVersionId: initialEntry.id,
    versions: [initialEntry],
  };
}

function syncSpecVersionHistoryCurrentCode(history = null, currentCode = '', currentCommentEntries = undefined) {
  const normalizedCurrentCode = typeof currentCode === 'string' ? currentCode : '';

  if (!Array.isArray(history?.versions) || history.versions.length === 0) {
    return buildInitialSpecVersionHistory(
      normalizedCurrentCode,
      currentCommentEntries === undefined ? [] : currentCommentEntries,
    );
  }

  const currentEntry = history.versions[history.versions.length - 1];
  const nextCurrentCommentEntries = currentCommentEntries === undefined
    ? normalizeSpecVersionCommentEntries(currentEntry?.commentEntries ?? [])
    : normalizeSpecVersionCommentEntries(currentCommentEntries);
  const currentCommentSignature = buildSpecVersionCommentEntriesSignature(currentEntry?.commentEntries ?? []);
  const nextCommentSignature = buildSpecVersionCommentEntriesSignature(nextCurrentCommentEntries);
  if (
    normalizeSpecCodeForComparison(currentEntry?.code ?? '')
      === normalizeSpecCodeForComparison(normalizedCurrentCode)
    && currentCommentSignature === nextCommentSignature
  ) {
    return history;
  }

  const nextCurrentEntry = {
    ...currentEntry,
    code: normalizedCurrentCode,
    commentEntries: nextCurrentCommentEntries,
  };

  return {
    ...history,
    currentVersionId: nextCurrentEntry.id,
    versions: [
      ...history.versions.slice(0, -1),
      nextCurrentEntry,
    ],
  };
}

function appendSpecVersionHistoryEntry(history = null, {
  currentCode = '',
  nextCode = '',
  currentCommentEntries = undefined,
  nextCommentEntries = [],
} = {}) {
  const syncedHistory = syncSpecVersionHistoryCurrentCode(history, currentCode, currentCommentEntries);
  const currentEntry = syncedHistory.versions[syncedHistory.versions.length - 1] ?? null;

  if (
    normalizeSpecCodeForComparison(currentEntry?.code ?? '')
      === normalizeSpecCodeForComparison(nextCode)
  ) {
    return syncedHistory;
  }

  const nextEntry = createSpecVersionEntry({
    number: (currentEntry?.number ?? 0) + 1,
    code: nextCode,
    commentEntries: nextCommentEntries,
  });

  return {
    currentVersionId: nextEntry.id,
    versions: [...syncedHistory.versions, nextEntry],
  };
}

function buildSpecVersionCodeWithInlineComments(code = '', commentEntries = []) {
  const normalizedCode = typeof code === 'string' ? code : '';
  const normalizedEntries = normalizeSpecVersionCommentEntries(commentEntries);

  if (normalizedEntries.length === 0) {
    return normalizedCode;
  }

  const lines = normalizedCode.length > 0 ? normalizedCode.split('\n') : [];
  const commentsByLineIndex = new Map();
  const fallbackStartByLineText = new Map();

  normalizedEntries.forEach((entry) => {
    const comments = Array.isArray(entry?.comments)
      ? entry.comments
        .map((comment) => (typeof comment === 'string' ? comment.trim() : ''))
        .filter((comment) => comment.length > 0)
      : [];

    if (comments.length === 0) {
      return;
    }

    let lineIndex = Number.isInteger(entry?.rawIndex) && entry.rawIndex >= 0
      ? entry.rawIndex
      : null;

    if (lineIndex === null && typeof entry?.line === 'string' && entry.line.length > 0) {
      const searchStart = fallbackStartByLineText.get(entry.line) ?? 0;
      const nextOffset = lines.slice(searchStart).findIndex((line) => line === entry.line);
      if (nextOffset >= 0) {
        lineIndex = searchStart + nextOffset;
        fallbackStartByLineText.set(entry.line, lineIndex + 1);
      }
    }

    const normalizedLineIndex = lines.length === 0
      ? -1
      : (lineIndex === null
          ? lines.length - 1
          : Math.min(lineIndex, lines.length - 1));

    const existingCommentLines = commentsByLineIndex.get(normalizedLineIndex) ?? [];
    comments.forEach((comment) => {
      existingCommentLines.push(`//${comment}`);
    });
    commentsByLineIndex.set(normalizedLineIndex, existingCommentLines);
  });

  if (commentsByLineIndex.size === 0) {
    return normalizedCode;
  }

  if (lines.length === 0) {
    return (commentsByLineIndex.get(-1) ?? []).join('\n');
  }

  const nextLines = [];
  lines.forEach((line, lineIndex) => {
    nextLines.push(line);

    const inlineComments = commentsByLineIndex.get(lineIndex) ?? [];
    if (inlineComments.length > 0) {
      nextLines.push(...inlineComments);
    }
  });

  const orphanCommentLines = commentsByLineIndex.get(-1) ?? [];
  if (orphanCommentLines.length > 0) {
    nextLines.unshift(...orphanCommentLines);
  }

  return nextLines.join('\n');
}

function applyIssueQuickFixToCode(code, { kind, index, replacementText }) {
  if (typeof code !== 'string' || !replacementText || !Number.isInteger(index) || index < 0) {
    return code;
  }

  const targetSectionTitle = kind === 'plan' ? 'plan' : 'acceptance criteria';
  const lines = code.split(/\r?\n/);
  let inTargetSection = false;
  let checkIndex = 0;
  let replaced = false;

  const nextLines = lines.map((line) => {
    const headingTitle = getDoneHeadingTitle(line);
    if (headingTitle !== null) {
      inTargetSection = headingTitle.toLowerCase() === targetSectionTitle;
      if (!inTargetSection) {
        checkIndex = 0;
      }
      return line;
    }

    if (!inTargetSection) {
      return line;
    }

    const checkMatch = line.match(/^(- \[[ x]\]\s+)(.*)$/i);
    if (!checkMatch) {
      return line;
    }

    if (checkIndex === index) {
      replaced = true;
      checkIndex += 1;
      return `${checkMatch[1]}${replacementText}`;
    }

    checkIndex += 1;
    return line;
  });

  return replaced ? nextLines.join('\n') : code;
}

function extractGoalTitleFromMarkdown(code) {
  if (!code) return '';

  const lines = code.split('\n');
  const goalIndex = lines.findIndex((line) => line.trim().toLowerCase() === '## goal');
  if (goalIndex === -1) return '';

  for (let i = goalIndex + 1; i < lines.length; i += 1) {
    const nextLine = lines[i].trim();
    if (!nextLine) continue;
    if (nextLine.startsWith('## ')) break;
    return nextLine;
  }

  return '';
}

function renderDoneInlineText(text, keyPrefix = 'inline') {
  const parts = text.split(/(@\w+)/g);
  if (parts.length === 1) return text;
  return parts.map((part, index) =>
    /^@\w+$/.test(part)
      ? <span key={`${keyPrefix}-${index}`} className="spec-ref">{part}</span>
      : part
  );
}

const INLINE_INSPECTION_TOOLTIP_WIDTH = 320;
const INLINE_INSPECTION_SELECTOR = '[data-inline-inspection="true"], .spec-inline-warning-highlight, .spec-inline-error-highlight';

function getClosestInlineInspectionElement(target) {
  return target instanceof Element
    ? target.closest(INLINE_INSPECTION_SELECTOR)
    : null;
}

function getInlineInspectionTooltipData(highlight = null, issue = null) {
  const title = typeof highlight?.tooltip?.title === 'string'
    ? highlight.tooltip.title.trim()
    : (typeof issue?.label === 'string' ? issue.label.trim() : '');

  if (!title) {
    return null;
  }

  const hint = typeof highlight?.tooltip?.hint === 'string'
    ? highlight.tooltip.hint.trim()
    : (typeof issue?.label === 'string' && issue.label.trim().length > 0
        ? issue.label.trim()
        : (issue?.severity === 'error'
            ? 'Inspection error'
            : issue?.severity === 'warning'
              ? 'Inspection warning'
              : 'Inspection issue'));

  return {
    title,
    hint,
  };
}

function InlineInspectionHoverTooltip({ rect, tooltip, onMouseEnter, onMouseLeave, onAccept, onReject }) {
  if (!rect || !tooltip?.title || typeof document === 'undefined' || typeof window === 'undefined') {
    return null;
  }

  const cornerMaskId = useId().replace(/:/g, '-');
  const left = Math.max(8, rect.left);
  const arrowLeft = Math.min(
    Math.max(16, Math.round(rect.left + rect.width / 2 - left)),
    400,
  );

  return createPortal(
    <div
      className="spec-inline-hover-tooltip"
      style={{
        top: rect.top - 8,
        left,
        '--spec-inline-hover-tooltip-arrow-left': `${arrowLeft}px`,
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="spec-inline-hover-tooltip-body" role="tooltip">
        <div className="spec-inline-hover-tooltip-top">
          {tooltip.hint ? (
            <span className="spec-inline-hover-tooltip-suggestion">{tooltip.hint}</span>
          ) : null}
          <button type="button" className="spec-inline-hover-tooltip-more" aria-label="More actions">
            <Icon name="general/moreVertical" size={16} />
          </button>
        </div>
        <div className="spec-inline-hover-tooltip-actions">
          <button type="button" className="spec-inline-hover-tooltip-btn" onClick={onAccept}>Accept</button>
          <button type="button" className="spec-inline-hover-tooltip-btn" onClick={onReject}>Reject</button>
        </div>
      </div>
      <svg
        className="spec-inline-hover-tooltip-corner"
        width="16"
        height="8"
        viewBox="0 0 16 8"
        fill="none"
        aria-hidden="true"
      >
        <path d="M8 8L16.5 -0.5L-0.5 -0.5L8 8Z" fill="#33353b" />
        <mask id={cornerMaskId} fill="white">
          <path d="M15.7929 -0.500001L16.5 -0.500001L8 8L-0.5 -0.499999L0.207108 -0.5L8 7.29289L15.7929 -0.500001Z" />
        </mask>
        <path
          d="M15.7929 -0.500001L16.5 -0.500001L8 8L-0.5 -0.499999L0.207108 -0.5L8 7.29289L15.7929 -0.500001Z"
          fill="#40434a"
        />
        <path
          d="M16.5 -0.500001L17.2071 0.207106L18.9142 -1.5L16.5 -1.5V-0.500001ZM15.7929 -0.500001V-1.5H15.3787L15.0858 -1.20711L15.7929 -0.500001ZM8 8L7.29289 8.70711L8 9.41421L8.70711 8.70711L8 8ZM-0.5 -0.499999L-0.5 -1.5L-2.91421 -1.5L-1.20711 0.207107L-0.5 -0.499999ZM0.207108 -0.5L0.914214 -1.20711L0.621321 -1.5L0.207107 -1.5L0.207108 -0.5ZM8 7.29289L7.29289 8L8 8.70711L8.70711 8L8 7.29289ZM16.5 -0.500001V-1.5L15.7929 -1.5V-0.500001V0.499999L16.5 0.499999V-0.500001ZM8 8L8.70711 8.70711L17.2071 0.207106L16.5 -0.500001L15.7929 -1.20711L7.29289 7.29289L8 8ZM-0.5 -0.499999L-1.20711 0.207107L7.29289 8.70711L8 8L8.70711 7.29289L0.207107 -1.20711L-0.5 -0.499999ZM0.207108 -0.5L0.207107 -1.5L-0.5 -1.5L-0.5 -0.499999L-0.5 0.5H0.207108L0.207108 -0.5ZM0.207108 -0.5L-0.499999 0.207107L7.29289 8L8 7.29289L8.70711 6.58579L0.914214 -1.20711L0.207108 -0.5ZM8 7.29289L8.70711 8L16.5 0.207107L15.7929 -0.500001L15.0858 -1.20711L7.2929 6.58578L8 7.29289Z"
          fill="black"
          mask={`url(#${cornerMaskId})`}
        />
      </svg>
    </div>,
    document.body
  );
}

function InlineInspectionHighlight({ className, tooltip = null, onAccept = null, onReject = null, children }) {
  const anchorRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const [rect, setRect] = useState(null);
  const closeTimerRef = useRef(null);
  const hasTooltip = Boolean(tooltip?.title);

  const updateRect = useCallback(() => {
    const anchor = anchorRef.current;
    if (!(anchor instanceof HTMLElement)) return;

    const nextRect = anchor.getBoundingClientRect();
    setRect({
      top: nextRect.top,
      left: nextRect.left,
      width: nextRect.width,
      height: nextRect.height,
    });
  }, []);

  const scheduleClose = useCallback(() => {
    closeTimerRef.current = setTimeout(() => setIsOpen(false), 120);
  }, []);

  const cancelClose = useCallback(() => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
  }, []);

  useEffect(() => {
    if (!isOpen || !hasTooltip) return undefined;

    updateRect();
    window.addEventListener('resize', updateRect);
    window.addEventListener('scroll', updateRect, true);

    return () => {
      window.removeEventListener('resize', updateRect);
      window.removeEventListener('scroll', updateRect, true);
    };
  }, [hasTooltip, isOpen, updateRect]);

  useEffect(() => () => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
  }, []);

  return (
    <>
      <span
        ref={anchorRef}
        className={`${className}${hasTooltip ? ' spec-inline-hover-trigger' : ''}`}
        data-inline-inspection="true"
        onMouseEnter={hasTooltip ? () => {
          cancelClose();
          updateRect();
          setIsOpen(true);
        } : undefined}
        onMouseLeave={hasTooltip ? scheduleClose : undefined}
      >
        {children}
      </span>
      {hasTooltip && isOpen && rect ? (
        <InlineInspectionHoverTooltip
          rect={rect}
          tooltip={tooltip}
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
          onAccept={() => { setIsOpen(false); onAccept?.(); }}
          onReject={() => { setIsOpen(false); onReject?.(); }}
        />
      ) : null}
    </>
  );
}

function renderDoneMarkdownInline(text, highlight = null, issue = null, onAccept = null, onReject = null) {
  if (!highlight?.match || !highlight?.className) {
    return renderDoneInlineText(text);
  }

  const start = text.indexOf(highlight.match);
  if (start === -1) {
    return renderDoneInlineText(text);
  }

  const end = start + highlight.match.length;
  const segments = [
    start > 0 ? { text: text.slice(0, start) } : null,
    { text: text.slice(start, end), className: highlight.className },
    end < text.length ? { text: text.slice(end) } : null,
  ].filter(Boolean);

  return segments.map((segment, index) => {
    const content = renderDoneInlineText(segment.text, `inline-${index}`);
    if (!segment.className) {
      return <Fragment key={`segment-${index}`}>{content}</Fragment>;
    }

    const tooltip = getInlineInspectionTooltipData(highlight, issue);

    return (
      <InlineInspectionHighlight
        key={`segment-${index}`}
        className={segment.className}
        tooltip={tooltip}
        onAccept={onAccept}
        onReject={onReject}
      >
        {content}
      </InlineInspectionHighlight>
    );
  });
}

function DoneFileChipGroup({ initialFiles = [], addPopupFiles, addButtonLabel = 'Add file', className = '' }) {
  const normalizedInitialFiles = useMemo(
    () => normalizeDoneFileEntries(initialFiles),
    [initialFiles]
  );
  const normalizedInitialFilesSignature = normalizedInitialFiles.map((file) => file.label).join('|');
  const [files, setFiles] = useState(() => normalizedInitialFiles);
  const [showAddPopup, setShowAddPopup] = useState(false);
  const [popupPos, setPopupPos] = useState(null);
  const addBtnRef = useRef(null);

  useEffect(() => {
    setFiles(normalizedInitialFiles);
  }, [normalizedInitialFilesSignature]);

  const removeFile = (labelToRemove) => {
    setFiles((prev) => prev.filter((file) => file.label !== labelToRemove));
  };

  const openAddPopup = () => {
    if (!showAddPopup && addBtnRef.current) {
      const rect = addBtnRef.current.getBoundingClientRect();
      setPopupPos({ top: rect.bottom + 6, left: rect.left });
    }
    setShowAddPopup((prev) => !prev);
  };

  return (
    <>
      <div className={`attached-files-list spec-done-ref-chip-list${className ? ` ${className}` : ''}`}>
        {files.map((file) => (
          <AttachedFileChip
            key={file.label}
            label={file.label}
            className="spec-done-ref-chip"
            onRemove={(event) => {
              event.preventDefault();
              event.stopPropagation();
              removeFile(file.label);
            }}
          />
        ))}
        <button
          type="button"
          className="at-icon-btn spec-done-ref-add-btn"
          ref={addBtnRef}
          onClick={openAddPopup}
          aria-label={addButtonLabel}
        >
          <Icon name="general/settings" size={16} />
        </button>
      </div>
      {showAddPopup && popupPos && createPortal(
        <>
          <div className="add-popup-overlay" onMouseDown={() => setShowAddPopup(false)} />
          <AddPopup
            onClose={() => setShowAddPopup(false)}
            onSelectFile={(item) => {
              setFiles((prev) => prev.some((file) => file.label === item.label) ? prev : [...prev, { label: item.label }]);
            }}
            files={addPopupFiles}
            style={{ position: 'fixed', ...popupPos }}
          />
        </>,
        document.body
      )}
    </>
  );
}

function DoneCommentButton({ commentCount = 0, isOpen = false, onOpen, demoId = null }) {
  const hasComments = commentCount > 0;
  const preservedSelectionSnapshotRef = useRef(null);

  return (
    <span className={`spec-done-comment-slot${hasComments ? ' has-comments' : ''}${isOpen ? ' is-open' : ''}`}>
      <button
        type="button"
        className={`spec-done-comment-btn${isOpen ? ' is-open' : ''}${hasComments ? ' has-comments' : ''}`}
        aria-label={hasComments ? `${commentCount} comment${commentCount === 1 ? '' : 's'}` : 'Add comment'}
        data-demo-id={demoId ?? undefined}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onMouseDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          preservedSelectionSnapshotRef.current = captureActiveEditorSelectionSnapshot();
        }}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          const selectionSnapshot = preservedSelectionSnapshotRef.current ?? captureActiveEditorSelectionSnapshot();
          preservedSelectionSnapshotRef.current = null;
          onOpen?.(event.currentTarget.getBoundingClientRect(), {
            preserveEditorSelection: Boolean(selectionSnapshot),
            selectionSnapshot,
          });
        }}
      >
        {hasComments ? <PlanDiffCommentBadge count={commentCount} /> : <Icon name="general/balloon" size={16} />}
      </button>
    </span>
  );
}

function DoneInlineCommentPreview({ comment }) {
  if (!comment) return null;

  return (
    <span className="spec-done-inline-comment-preview spec-line-comment" title={comment}>
      <span className="spec-comment-prefix">//</span>
      <span className="spec-done-inline-comment-preview-text text-ui-default">{comment}</span>
    </span>
  );
}

function DoneCommentAdornment({ comments = [], isOpen = false, onOpen, demoId = null }) {
  const commentCount = comments.length;
  const latestComment = commentCount > 0 ? comments[commentCount - 1] : '';

  return (
    <span className={`spec-done-comment-adornment${commentCount > 0 ? ' has-comments' : ''}`}>
      <DoneCommentButton
        commentCount={commentCount}
        isOpen={isOpen}
        demoId={demoId}
        onOpen={onOpen}
      />
    </span>
  );
}

function DoneInlineRunButton({ onRun, demoId = null, title = 'Build item' }) {
  return (
    <button
      type="button"
      className="spec-done-gutter-line-number-run spec-done-gutter-item-run-btn"
      aria-label={title}
      title={title}
      data-demo-id={demoId ?? undefined}
      onMouseDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onRun?.();
      }}
    >
      <Icon name="run/run" size={16} />
    </button>
  );
}

function DoneCommentCountIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M3.14258 1.64307L12.8564 1.64307C13.6849 1.64307 14.3564 2.31464 14.3564 3.14307L14.3564 14.9595L9.45508 11.0386C9.38853 10.9853 9.30968 10.9502 9.22656 10.936L9.14258 10.9292L3.14258 10.9292C2.31429 10.9292 1.6428 10.2574 1.64258 9.4292L1.64258 3.14307C1.64258 2.31464 2.31415 1.64307 3.14258 1.64307Z"
        stroke="currentColor"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DoneCommentPopup({
  comments = [],
  commentContextLabel = '',
  commentContextIcon = 'claude',
  commentContextSessionLabel = 'Active',
  value,
  editingIndex = null,
  onChange,
  onCancel,
  onSubmit,
  onStartEdit,
  onDelete,
  preserveEditorSelection = false,
  selectionSnapshot = null,
  footerMetaLabel = '',
}) {
  const isEditing = Number.isInteger(editingIndex);
  const showCompose = true;
  const commentGroups = comments.length > 0
    ? [{
        label: commentContextLabel,
        icon: commentContextIcon,
        sessionLabel: 'Document',
        showHeaderWhenEmpty: true,
        comments: comments.map((text, index) => ({
          ...((text && typeof text === 'object') ? text : {}),
          text: getStoredCommentText(text),
          lineLabel: '',
          editable: true,
          localIndex: index,
        })),
      }]
    : null;

  useLayoutEffect(() => {
    if (!preserveEditorSelection || !selectionSnapshot) return;
    scheduleEditorSelectionSnapshotRestore(selectionSnapshot);
  }, [preserveEditorSelection, selectionSnapshot]);

  return (
    <DiffInlineCommentPopup
      comments={commentGroups ? [] : comments}
      commentGroups={commentGroups}
      commentContextLabel={commentContextLabel}
      commentContextIcon={commentContextIcon}
      commentContextSessionLabel={commentContextSessionLabel}
      footerMetaLabel=""
      value={value}
      editingIndex={editingIndex}
      showCompose={showCompose}
      defaultSubmitAttachMode="new"
      submitAttachModes={['new']}
      submitButtonLabel="Add a Comment"
      showSubmitTargetLabel={false}
      onChange={onChange}
      onCancel={onCancel}
      onSubmit={onSubmit}
      onStartEdit={onStartEdit}
      onDelete={onDelete}
      preserveEditorSelection={preserveEditorSelection}
    />
  );
}

function DoneReferenceFileLine({ label, addPopupFiles, commentAdornment = null }) {
  return (
    <div className="spec-done-line spec-done-line-meta">
      <h2 className="spec-done-meta-label text-ui-h2" contentEditable suppressContentEditableWarning>Reference file</h2>
      <DoneFileChipGroup
        initialFiles={[label]}
        addPopupFiles={addPopupFiles}
        addButtonLabel="Add reference file"
      />
      {commentAdornment}
    </div>
  );
}

function DoneHeadingWithFiles({ title, initialFiles = [], addPopupFiles, commentAdornment = null }) {
  return (
    <div className="spec-done-heading-row">
      <h1 className="spec-done-heading text-ui-h1" contentEditable suppressContentEditableWarning>
        {renderDoneMarkdownInline(title)}
      </h1>
      <DoneFileChipGroup
        initialFiles={initialFiles}
        addPopupFiles={addPopupFiles}
        addButtonLabel={`Add file to ${title}`}
        className="spec-done-heading-files"
      />
      {commentAdornment}
    </div>
  );
}

function getDoneHeadingTitle(line) {
  const headingMatch = line.match(/^\s*##\s+(.*)$/);
  return headingMatch ? headingMatch[1].trim() : null;
}

function shouldShowDoneRunIcon(line) {
  const headingTitle = getDoneHeadingTitle(line)?.toLowerCase();
  return headingTitle === 'plan' || headingTitle === 'acceptance criteria';
}

function CheckStatus({ status, outdated = false, isLoading = false }) {
  const normalizedStatus = typeof status === 'string' && status.trim().length > 0 ? status : 'pending';

  return (
    <span
      className={`spec-check-status spec-check-status-${normalizedStatus}${outdated ? ' is-outdated' : ''}`}
      aria-label={normalizedStatus}
      title={outdated ? `${normalizedStatus} (outdated)` : normalizedStatus}
    >
      {isLoading ? (
        <IconLoaderSpinner />
      ) : (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          {normalizedStatus === 'pending'
            ? <rect x="2.25" y="2.25" width="11.5" height="11.5" rx="2.75" stroke="currentColor" strokeWidth="1.5" />
            : <rect x="1" y="1" width="14" height="14" rx="3" fill="currentColor" />
          }
          {normalizedStatus === 'passed'
            ? <path d="M5.5 8.5L7 10L10.5 6" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            : normalizedStatus === 'pending'
              ? null
              : <rect x="4" y="7.25" width="8" height="1.5" rx="0.75" fill="#fff" />
          }
        </svg>
      )}
    </span>
  );
}

function AcSubcheckIcon({ status }) {
  if (status === 'passed') {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="ac-subcheck-icon ac-subcheck-icon-passed">
        <path d="M3 8.5L6.5 12L13 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="ac-subcheck-icon ac-subcheck-icon-failed">
      <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function AcSubcheckChip({ label, onOpen }) {
  const handleOpen = (event) => {
    event.preventDefault();
    event.stopPropagation();
    onOpen?.(label);
  };

  return (
    <button
      type="button"
      className="ac-subcheck-chip"
      onClick={handleOpen}
      title={`Open ${label}`}
    >
      {label}
    </button>
  );
}

function AcCheckRow({
  checkItem,
  text,
  isIssueActive = false,
  commentAdornment = null,
  onProposalAccept = null,
  onProposalDecision = null,
  onOpenCheckChip = null,
  isRunning = false,
}) {
  const [expanded, setExpanded] = useState(false);
  const [proposalAccepted, setProposalAccepted] = useState(false);
  const [proposalRejected, setProposalRejected] = useState(false);
  const checks = checkItem.checks || [];
  const hasChecks = checks.length > 0;
  const isOutdated = isRunStatusItemOutdated(checkItem);

  const handleProposalAccept = () => {
    setProposalAccepted(true);
    onProposalDecision?.('accept');
    onProposalAccept?.();
  };

  const handleProposalReject = () => {
    setProposalRejected(true);
    onProposalDecision?.('reject');
  };

  const showProposal = Boolean(checkItem.proposal) && !proposalAccepted && !proposalRejected;

  const displayText = proposalAccepted && checkItem.highlight?.match && checkItem.proposal
    ? text.replace(checkItem.highlight.match, checkItem.proposal.replace(/^Proposal:\s*/i, ''))
    : text;
  const displayHighlight = proposalAccepted ? null : checkItem.highlight;
  const displayIssue = proposalAccepted ? null : checkItem.issue;

  const visualStatus = proposalAccepted
    ? 'pending'
    : (checkItem.status === 'passed'
        ? 'passed'
        : (checkItem.issue?.severity === 'warning'
            ? 'warning'
            : (checkItem.issue?.severity === 'error'
                ? 'error'
                : checkItem.status)));

  return (
    <div className={`spec-done-line spec-done-line-check ac-check-row${isOutdated ? ' is-outdated' : ''}`}>
      <div className={`ac-check-main spec-done-primary-line${isIssueActive && !proposalAccepted ? ' spec-done-active-issue-line' : ''}${isOutdated ? ' is-outdated' : ''}`}>
        <CheckStatus status={visualStatus} outdated={isOutdated} isLoading={isRunning && visualStatus === 'pending'} />
        <span contentEditable suppressContentEditableWarning>{renderDoneMarkdownInline(displayText, displayHighlight, displayIssue, handleProposalAccept, handleProposalReject)}</span>
        {hasChecks && (
          <button className="ac-checks-toggle" onClick={() => setExpanded(e => !e)}>
            {checks.length} checks{!proposalAccepted && checks.filter(c => c.status === 'failed').length > 0 ? `/${checks.filter(c => c.status === 'failed').length} problem` : ''}
            <span className={`ac-checks-arrow${expanded ? ' expanded' : ''}`}>
              <Icon name="general/chevronDown" size={12} />
            </span>
          </button>
        )}
        {commentAdornment}
      </div>
      {expanded && (
        <div className="ac-subcheck-list">
          {checks.map((check, i) => (
            <div key={i} className={`ac-subcheck-item${isOutdated ? ' is-outdated' : ''}`}>
              <AcSubcheckIcon status={check.status} />
              <span className="ac-subcheck-text">{check.text}</span>
              {check.chip && <AcSubcheckChip label={check.chip} onOpen={onOpenCheckChip} />}
              {check.note && <span className="ac-subcheck-note">{check.note}</span>}
            </div>
          ))}
          {showProposal && (
            <div className="ac-proposal-row">
              <span className="ac-proposal-icon">
                <Icon name="codeInsight/intentionBulb" size={16} />
              </span>
              <span className="ac-proposal-text">{checkItem.proposal}</span>
              <button type="button" className="ac-proposal-btn" onClick={handleProposalReject}>Reject</button>
              <button type="button" className="ac-proposal-btn" onClick={handleProposalAccept}>Accept</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const PLAN_DIFF_PREVIEW_REPLACEMENTS = {
  0: 'Schema changes — add vet_id (FK), visit_time (TIME), and UNIQUE(vet_id, visit_date, visit_time) constraint',
  1: 'Visit entity — add @ManyToOne vet and LocalTime time with @NotNull',
  2: 'VisitRepository — add double-booking query + UNIQUE(vet_id, visit_date, visit_time) constraint',
  3: 'VisitController — inject VetRepository, add @ModelAttribute("vets") with findAll()',
  4: 'Form template — add <select> for vet with VetFormatter (per PetTypeFormatter pattern) and time slot',
  5: 'Owner details — add Vet and Time columns to visit history table',
  6: 'Tests — vet list in model, successful booking, double-booking rejected',
};

function getPlanDiffReplacementText({ text, issueTarget }) {
  if (issueTarget?.kind !== 'plan') {
    return typeof text === 'string' ? text : '';
  }

  const quickFixConfig = getIssueQuickFixConfig('plan', issueTarget.index);
  if (quickFixConfig?.replacementText) {
    return quickFixConfig.replacementText;
  }

  const previewReplacement = PLAN_DIFF_PREVIEW_REPLACEMENTS[issueTarget.index];
  if (typeof previewReplacement === 'string' && previewReplacement.trim().length > 0) {
    return previewReplacement;
  }

  return typeof text === 'string' ? text : '';
}

function buildPlanDiffInlineFragments(sourceText = '', targetText = '') {
  const normalizedSource = typeof sourceText === 'string' ? sourceText : '';
  const normalizedTarget = typeof targetText === 'string' ? targetText : '';

  if (normalizedSource === normalizedTarget) {
    return {
      removed: [{ text: normalizedSource || ' ', tone: 'removed' }],
      added: [{ text: normalizedTarget || ' ', tone: 'added' }],
    };
  }

  let commonPrefixLength = 0;
  while (
    commonPrefixLength < normalizedSource.length &&
    commonPrefixLength < normalizedTarget.length &&
    normalizedSource[commonPrefixLength] === normalizedTarget[commonPrefixLength]
  ) {
    commonPrefixLength += 1;
  }

  let sourceSuffixIndex = normalizedSource.length - 1;
  let targetSuffixIndex = normalizedTarget.length - 1;

  while (
    sourceSuffixIndex >= commonPrefixLength &&
    targetSuffixIndex >= commonPrefixLength &&
    normalizedSource[sourceSuffixIndex] === normalizedTarget[targetSuffixIndex]
  ) {
    sourceSuffixIndex -= 1;
    targetSuffixIndex -= 1;
  }

  const leadingText = normalizedSource.slice(0, commonPrefixLength);
  const sourceChangedText = normalizedSource.slice(commonPrefixLength, sourceSuffixIndex + 1);
  const targetChangedText = normalizedTarget.slice(commonPrefixLength, targetSuffixIndex + 1);
  const trailingText = normalizedTarget.slice(targetSuffixIndex + 1);

  const buildFragments = (changedText, tone, fallbackText) => {
    const fragments = [];

    if (changedText) {
      if (leadingText) {
        fragments.push({ text: leadingText, tone: 'plain' });
      }
      fragments.push({ text: changedText, tone });
      if (trailingText) {
        fragments.push({ text: trailingText, tone: 'plain' });
      }
    } else {
      fragments.push({ text: fallbackText || ' ', tone });
    }

    return fragments;
  };

  return {
    removed: buildFragments(sourceChangedText, 'removed', normalizedSource),
    added: buildFragments(targetChangedText, 'added', normalizedTarget),
  };
}

function buildPlainDiffFragments(text = '') {
  return [{ text: text || ' ', tone: 'plain' }];
}

function normalizeDoneFileEntries(files = []) {
  const normalizedFiles = Array.isArray(files)
    ? files
      .map((file) => (typeof file === 'string' ? { label: file } : file))
      .filter((file) => typeof file?.label === 'string' && file.label.trim().length > 0)
    : [];

  return normalizedFiles.filter((file, index, items) => (
    items.findIndex((candidate) => candidate.label === file.label) === index
  ));
}

function getDonePlanHeadingFiles(sectionMeta = null, attachedFiles = []) {
  const initialFiles = [];

  if (sectionMeta?.kind === 'chip' && typeof sectionMeta.text === 'string' && sectionMeta.text.trim().length > 0) {
    initialFiles.push(sectionMeta.text);
  }

  (attachedFiles ?? []).forEach((file) => {
    const label = typeof file === 'string' ? file : file?.label;
    if (label === 'Configuration.md') {
      initialFiles.push(label);
    }
  });

  return normalizeDoneFileEntries(initialFiles);
}

function getDoneAcceptanceHeadingFiles(sectionMeta = null, attachedFiles = []) {
  const initialFiles = [];

  if (sectionMeta?.kind === 'chip' && typeof sectionMeta.text === 'string' && sectionMeta.text.trim().length > 0) {
    initialFiles.push(sectionMeta.text);
  }

  (attachedFiles ?? []).forEach((file) => {
    const label = typeof file === 'string' ? file : file?.label;
    initialFiles.push(label);
  });

  return normalizeDoneFileEntries(initialFiles);
}

function buildPlanDiffViewerData({
  documentSections = [],
  planRunResult = null,
  removedIssueIndices = null,
  diffData = null,
  diffTarget = null,
} = {}) {
  const planSection = (documentSections ?? []).find((section) => section?.title?.toLowerCase() === 'plan') ?? null;
  const removedPlanIndices = removedIssueIndices?.plan ?? {};
  const changedFiles = [
    diffData?.sourceTabLabel,
    ...((diffData?.rows ?? []).map((row) => row.file).filter((file) => typeof file === 'string' && file.trim().length > 0)),
  ].filter((file, index, files) => typeof file === 'string' && file.trim().length > 0 && files.indexOf(file) === index);

  if (!planSection) {
    return {
      planItems: [],
      changedFiles,
    };
  }

  const visiblePlanItemCount = (planSection.items ?? []).reduce((count, item, originalIndex) => (
    item?.type === 'check' && !removedPlanIndices[originalIndex] ? count + 1 : count
  ), 0);
  const presetFileLabels = Object.values(PLAN_CODE_DIFF_PRESETS).map((preset) => preset.fileLabel);
  const canUsePresetFileMapping =
    visiblePlanItemCount === presetFileLabels.length
    && changedFiles.some((file) => presetFileLabels.includes(file));

  let visibleIndex = 0;
  const planItems = (planSection.items ?? []).reduce((items, item, originalIndex) => {
    if (item?.type !== 'check' || removedPlanIndices[originalIndex]) {
      return items;
    }

    const isCurrent = diffTarget?.kind === 'plan' && diffTarget.index === originalIndex;
    const currentDiffFiles = isCurrent && diffData?.sourceTabLabel ? [diffData.sourceTabLabel] : [];
    const presetFile = canUsePresetFileMapping ? PLAN_CODE_DIFF_PRESETS[originalIndex]?.fileLabel ?? null : null;
    const statusItem = planRunResult?.[visibleIndex] ?? null;
    const status = statusItem?.status ?? null;

    items.push({
      id: item.id ?? `plan-viewer-item-${originalIndex}`,
      text: item.text ?? '',
      status,
      statusItem,
      isOutdated: isRunStatusItemOutdated(statusItem),
      files: [presetFile, ...currentDiffFiles].filter((file, index, files) => typeof file === 'string' && file.trim().length > 0 && files.indexOf(file) === index),
      isCurrent,
      originalIndex,
      visibleIndex,
    });

    visibleIndex += 1;
    return items;
  }, []);

  return {
    planItems,
    changedFiles,
  };
}

function getPlanCodeDiffPreset(issueTarget) {
  const planIndex = Number.isInteger(issueTarget?.index) ? issueTarget.index : 0;
  const presetIndexMap = {
    0: 0,
    1: 1,
    2: 2,
    3: 4,
    4: 5,
    5: 3,
    6: 6,
  };
  const presetIndex = presetIndexMap[planIndex] ?? planIndex;
  return PLAN_CODE_DIFF_PRESETS[presetIndex] ?? PLAN_CODE_DIFF_PRESETS[0];
}

function buildCodeDiffRows(beforeCode = '', afterCode = '', rowIdPrefix = 'code-diff', contextRadius = 4) {
  const beforeLines = typeof beforeCode === 'string' ? beforeCode.split(/\r?\n/) : [''];
  const afterLines = typeof afterCode === 'string' ? afterCode.split(/\r?\n/) : [''];

  let commonPrefixLength = 0;
  while (
    commonPrefixLength < beforeLines.length &&
    commonPrefixLength < afterLines.length &&
    beforeLines[commonPrefixLength] === afterLines[commonPrefixLength]
  ) {
    commonPrefixLength += 1;
  }

  let beforeSuffixIndex = beforeLines.length - 1;
  let afterSuffixIndex = afterLines.length - 1;
  while (
    beforeSuffixIndex >= commonPrefixLength &&
    afterSuffixIndex >= commonPrefixLength &&
    beforeLines[beforeSuffixIndex] === afterLines[afterSuffixIndex]
  ) {
    beforeSuffixIndex -= 1;
    afterSuffixIndex -= 1;
  }

  const beforeChangedCount = Math.max(0, beforeSuffixIndex - commonPrefixLength + 1);
  const afterChangedCount = Math.max(0, afterSuffixIndex - commonPrefixLength + 1);
  const hasChanges = beforeChangedCount > 0 || afterChangedCount > 0;

  if (!hasChanges) {
    const rows = beforeLines.slice(0, Math.min(beforeLines.length, contextRadius * 2 + 1)).map((line, index) => ({
      id: `${rowIdPrefix}-context-${index}`,
      kind: 'context',
      oldNumber: index + 1,
      newNumber: index + 1,
      text: line,
      fragments: buildPlainDiffFragments(line),
    }));
    return {
      differenceCount: 0,
      rows,
      focusRowId: rows[0]?.id ?? null,
    };
  }

  const rows = [];
  let focusRowId = null;
  const contextStart = Math.max(0, commonPrefixLength - contextRadius);

  for (let lineIndex = contextStart; lineIndex < commonPrefixLength; lineIndex += 1) {
    const line = beforeLines[lineIndex] ?? '';
    rows.push({
      id: `${rowIdPrefix}-context-${lineIndex}`,
      kind: 'context',
      oldNumber: lineIndex + 1,
      newNumber: lineIndex + 1,
      text: line,
      fragments: buildPlainDiffFragments(line),
    });
  }

  const changedLineCount = Math.max(beforeChangedCount, afterChangedCount);
  const removedRows = [];
  const addedRows = [];

  for (let offset = 0; offset < changedLineCount; offset += 1) {
    const beforeLineIndex = commonPrefixLength + offset;
    const afterLineIndex = commonPrefixLength + offset;
    const beforeLineExists = offset < beforeChangedCount;
    const afterLineExists = offset < afterChangedCount;
    const beforeLine = beforeLineExists ? (beforeLines[beforeLineIndex] ?? '') : '';
    const afterLine = afterLineExists ? (afterLines[afterLineIndex] ?? '') : '';
    const inlineFragments = beforeLineExists && afterLineExists
      ? buildPlanDiffInlineFragments(beforeLine, afterLine)
      : null;

    if (beforeLineExists) {
      const rowId = `${rowIdPrefix}-removed-${beforeLineIndex}`;
      removedRows.push({
        id: rowId,
        kind: 'removed',
        oldNumber: beforeLineIndex + 1,
        newNumber: null,
        text: beforeLine,
        fragments: inlineFragments?.removed ?? [{ text: beforeLine || ' ', tone: 'removed' }],
      });
      if (!focusRowId) {
        focusRowId = rowId;
      }
    }

    if (afterLineExists) {
      const rowId = `${rowIdPrefix}-added-${afterLineIndex}`;
      addedRows.push({
        id: rowId,
        kind: 'added',
        oldNumber: null,
        newNumber: afterLineIndex + 1,
        text: afterLine,
        fragments: inlineFragments?.added ?? [{ text: afterLine || ' ', tone: 'added' }],
      });
      if (!focusRowId || beforeLineExists) {
        focusRowId = rowId;
      }
    }
  }

  rows.push(...removedRows, ...addedRows);

  const trailingContextCount = Math.min(
    contextRadius,
    Math.max(0, beforeLines.length - (beforeSuffixIndex + 1)),
    Math.max(0, afterLines.length - (afterSuffixIndex + 1))
  );

  for (let offset = 0; offset < trailingContextCount; offset += 1) {
    const beforeLineIndex = beforeSuffixIndex + 1 + offset;
    const afterLineIndex = afterSuffixIndex + 1 + offset;
    const line = beforeLines[beforeLineIndex] ?? afterLines[afterLineIndex] ?? '';
    rows.push({
      id: `${rowIdPrefix}-context-tail-${beforeLineIndex}-${afterLineIndex}`,
      kind: 'context',
      oldNumber: beforeLineIndex + 1,
      newNumber: afterLineIndex + 1,
      text: line,
      fragments: buildPlainDiffFragments(line),
    });
  }

  return {
    differenceCount: 1,
    rows,
    focusRowId,
  };
}

function getPlanDiffEntries({ text, statusItem, issueTarget }) {
  const quickFixConfig = issueTarget?.kind === 'plan' ? getIssueQuickFixConfig('plan', issueTarget.index) : null;

  if (quickFixConfig?.replacementText && quickFixConfig.replacementText !== text) {
    return [
      {
        kind: 'removed',
        text,
        highlight: statusItem.highlight ?? null,
      },
      {
        kind: 'added',
        text: quickFixConfig.replacementText,
        highlight: null,
      },
    ];
  }

  return [];
}

function findSectionCheckLineIndex(code, kind, index) {
  if (typeof code !== 'string' || !Number.isInteger(index) || index < 0) {
    return -1;
  }

  const targetSectionTitle = kind === 'plan' ? 'plan' : 'acceptance criteria';
  const lines = code.split(/\r?\n/);
  let inTargetSection = false;
  let checkIndex = 0;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const headingTitle = getDoneHeadingTitle(line);

    if (headingTitle !== null) {
      inTargetSection = headingTitle.toLowerCase() === targetSectionTitle;
      if (!inTargetSection) {
        checkIndex = 0;
      }
      continue;
    }

    if (!inTargetSection) continue;
    if (!/^- \[[ x]\]\s+/i.test(line)) continue;

    if (checkIndex === index) {
      return lineIndex;
    }

    checkIndex += 1;
  }

  return -1;
}

function buildPlanDiffData({ sourceCode, text, statusItem, issueTarget, sourceTabLabel }) {
  if (issueTarget?.kind === 'plan') {
    const codeDiffPreset = getPlanCodeDiffPreset(issueTarget);
    const codeDiff = buildCodeDiffRows(
      codeDiffPreset.beforeCode,
      codeDiffPreset.afterCode,
      `plan-code-${issueTarget.index}`
    );

    return {
      sourceTabLabel: codeDiffPreset.fileLabel,
      title: `Diff ${codeDiffPreset.fileLabel}`,
      differenceCount: codeDiff.differenceCount,
      rows: codeDiff.rows,
      focusRowId: codeDiff.focusRowId,
      status: statusItem.status,
      lineText: text,
      language: codeDiffPreset.language,
    };
  }

  const resolvedSourceCode = typeof sourceCode === 'string' ? sourceCode : '';
  const lines = resolvedSourceCode.split(/\r?\n/);
  const replacementText = getPlanDiffReplacementText({ text, issueTarget });
  const targetLineIndex = issueTarget?.kind === 'plan'
    ? findSectionCheckLineIndex(resolvedSourceCode, 'plan', issueTarget.index)
    : lines.findIndex((line) => line.includes(text));
  const nextCode = replacementText && issueTarget?.kind === 'plan'
    ? applyIssueQuickFixToCode(resolvedSourceCode, {
        kind: 'plan',
        index: issueTarget.index,
        replacementText,
      })
    : resolvedSourceCode;
  const nextLines = nextCode.split(/\r?\n/);
  const hasChangedLine =
    targetLineIndex >= 0 &&
    targetLineIndex < lines.length &&
    targetLineIndex < nextLines.length &&
    lines[targetLineIndex] !== nextLines[targetLineIndex];
  const focusLineIndex = targetLineIndex >= 0
    ? targetLineIndex
    : Math.max(lines.findIndex((line) => line.includes(text)), 0);
  const contextStart = Math.max(0, focusLineIndex - 4);
  const contextEnd = Math.min(Math.max(lines.length, nextLines.length) - 1, focusLineIndex + 4);
  const rows = [];

  for (let lineIndex = contextStart; lineIndex <= contextEnd; lineIndex += 1) {
    const oldText = lines[lineIndex] ?? '';
    const newText = nextLines[lineIndex] ?? oldText;

    if (hasChangedLine && lineIndex === targetLineIndex) {
      const inlineDiff = buildPlanDiffInlineFragments(oldText, newText);
      rows.push({
        id: `removed-${lineIndex}`,
        kind: 'removed',
        oldNumber: lineIndex + 1,
        newNumber: null,
        text: oldText,
        fragments: inlineDiff.removed,
      });
      rows.push({
        id: `added-${lineIndex}`,
        kind: 'added',
        oldNumber: null,
        newNumber: lineIndex + 1,
        text: newText,
        fragments: inlineDiff.added,
      });
      continue;
    }

    rows.push({
      id: `context-${lineIndex}`,
      kind: 'context',
      oldNumber: lineIndex + 1,
      newNumber: lineIndex + 1,
      text: oldText,
      fragments: [{ text: oldText || ' ', tone: 'plain' }],
    });
  }

  return {
    sourceTabLabel,
    title: `Diff ${sourceTabLabel}`,
    differenceCount: hasChangedLine ? 1 : 0,
    rows,
    focusRowId: hasChangedLine ? `added-${targetLineIndex}` : (focusLineIndex >= 0 ? `context-${focusLineIndex}` : null),
    status: statusItem.status,
    lineText: text,
    language: 'text',
  };
}

function orderDiffRowsForDisplay(rows = []) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return [];
  }

  const orderedRows = [];
  let index = 0;

  while (index < rows.length) {
    const row = rows[index];

    if (row?.kind !== 'removed' && row?.kind !== 'added') {
      orderedRows.push(row);
      index += 1;
      continue;
    }

    const changedRows = [];
    while (index < rows.length && (rows[index]?.kind === 'removed' || rows[index]?.kind === 'added')) {
      changedRows.push(rows[index]);
      index += 1;
    }

    orderedRows.push(
      ...changedRows.filter((changedRow) => changedRow.kind === 'removed'),
      ...changedRows.filter((changedRow) => changedRow.kind === 'added'),
    );
  }

  return orderedRows;
}

function buildPlanDiffTabContent({ sourceCode, text, statusItem, issueTarget, sourceTabLabel }) {
  const diffData = buildPlanDiffData({ sourceCode, text, statusItem, issueTarget, sourceTabLabel });

  if (diffData.rows.length > 0) {
    return orderDiffRowsForDisplay(diffData.rows).map((row) => {
      const prefix = row.kind === 'added' ? '+' : row.kind === 'removed' ? '-' : ' ';
      return `${prefix} ${row.text}`;
    }).join('\n');
  }

  return [
    `@@ plan step (${statusItem.status})`,
    `  ${text}`,
  ].join('\n');
}

function buildPlanDiffTabId(sourceTabId) {
  return `plan-diff-${sourceTabId}`;
}

function buildPlainFileRows(code = '') {
  const lines = String(code).split(/\r?\n/);
  return lines.map((line, index) => {
    const lineNumber = index + 1;
    return {
      id: `plain-line-${lineNumber}`,
      kind: 'context',
      oldNumber: lineNumber,
      newNumber: lineNumber,
      text: line,
      fragments: [{ text: line || ' ', tone: 'plain' }],
    };
  });
}

function buildPlainFileData(code = '', label = '', language = 'text') {
  const rows = buildPlainFileRows(code);
  return {
    sourceTabLabel: label,
    title: label,
    differenceCount: 0,
    focusRowId: rows[0]?.id ?? null,
    status: 'passed',
    lineText: '',
    language,
    rows,
  };
}

function buildSpecVersionDiffTabId(sourceTabId, fromVersionId, toVersionId) {
  return `spec-version-diff-${sourceTabId}-${fromVersionId}-to-${toVersionId}`;
}

function mergeStoredDiffCommentsByRow(diffComments = {}, rowId = null, comments = []) {
  if (typeof rowId !== 'string' || rowId.length === 0) {
    return diffComments;
  }

  const nextComments = Array.isArray(comments)
    ? comments.filter((comment) => getStoredCommentText(comment).trim().length > 0)
    : [];
  if (nextComments.length === 0) {
    return diffComments;
  }

  const existingComments = Array.isArray(diffComments[rowId]) ? diffComments[rowId] : [];
  const seenComments = new Set(existingComments.map((comment) => getStoredCommentText(comment).trim().toLowerCase()));
  const mergedComments = [...existingComments];

  nextComments.forEach((comment) => {
    const normalizedComment = getStoredCommentText(comment).trim().toLowerCase();
    if (seenComments.has(normalizedComment)) {
      return;
    }

    seenComments.add(normalizedComment);
    mergedComments.push(comment);
  });

  if (mergedComments.length === existingComments.length) {
    return diffComments;
  }

  return {
    ...diffComments,
    [rowId]: mergedComments,
  };
}

function findSpecVersionDiffRowId(rows = [], lineNumber = null, side = 'old', lineText = '') {
  if (!Number.isInteger(lineNumber) || lineNumber <= 0) {
    return null;
  }

  const lineKey = side === 'new' ? 'newNumber' : 'oldNumber';
  const relevantRows = rows.filter((row) => row?.[lineKey] === lineNumber);
  if (relevantRows.length === 0) {
    return null;
  }

  const kindPriority = side === 'new'
    ? ['added', 'context', 'removed']
    : ['removed', 'context', 'added'];

  const exactTextMatch = typeof lineText === 'string' && lineText.length > 0
    ? relevantRows.find((row) => row.text === lineText)
    : null;
  if (exactTextMatch) {
    return exactTextMatch.id;
  }

  for (const kind of kindPriority) {
    const matchingRow = relevantRows.find((row) => row.kind === kind);
    if (matchingRow) {
      return matchingRow.id;
    }
  }

  return relevantRows[0]?.id ?? null;
}

function buildSpecVersionDiffInitialComments({
  diffData = null,
} = {}) {
  if (!Array.isArray(diffData?.rows) || diffData.rows.length === 0) {
    return {};
  }

  return {};
}

function buildSpecVersionDiffData({
  sourceCode = '',
  targetCode = '',
  sourceTabLabel = TERMINAL_TASK_TAB_BASE_LABEL,
  fromVersion = null,
  toVersion = null,
} = {}) {
  const diff = buildCodeDiffRows(
    sourceCode,
    buildSpecVersionCodeWithInlineComments(targetCode, toVersion?.commentEntries ?? []),
    `spec-version-${fromVersion?.id ?? 'from'}-${toVersion?.id ?? 'to'}`,
    6,
  );
  const fromLabel = fromVersion?.label ?? 'Previous Version';
  const toLabel = toVersion?.label ?? 'Current Version';

  return {
    sourceTabLabel,
    title: `Diff ${fromLabel} -> ${toLabel}`,
    differenceCount: diff.differenceCount,
    rows: diff.rows,
    focusRowId: diff.focusRowId,
    status: 'passed',
    lineText: `${fromLabel} -> ${toLabel}`,
    language: 'text',
  };
}

function buildDiffTabContentFromRows(diffData = null) {
  if (!Array.isArray(diffData?.rows) || diffData.rows.length === 0) {
    return diffData?.title ?? '';
  }

  return orderDiffRowsForDisplay(diffData.rows).map((row) => {
    const prefix = row.kind === 'added' ? '+' : row.kind === 'removed' ? '-' : ' ';
    return `${prefix} ${row.text}`;
  }).join('\n');
}

function normalizePlanSubitemPreviewText(text = '') {
  return String(text)
    .replace(/\s+/g, ' ')
    .trim();
}

function splitPlanParentText(text = '') {
  const normalizedText = normalizePlanSubitemPreviewText(text);
  const dashMatch = normalizedText.match(/^(.+?)\s+[—-]\s+(.+)$/);

  if (!dashMatch) {
    return {
      scope: '',
      detail: normalizedText,
    };
  }

  return {
    scope: dashMatch[1].trim(),
    detail: dashMatch[2].trim(),
  };
}

function capitalizePlanSubitemText(text = '') {
  const normalizedText = normalizePlanSubitemPreviewText(text).replace(/[.;:,\s]+$/g, '');
  if (!normalizedText) return '';
  return normalizedText.charAt(0).toUpperCase() + normalizedText.slice(1);
}

function normalizePlanSharedTail(tail = '') {
  const normalizedTail = normalizePlanSubitemPreviewText(tail);
  if (!normalizedTail) return '';
  return normalizedTail
    .replace(/^columns\b/i, 'column')
    .replace(/^fields\b/i, 'field');
}

function splitPlanSegmentByAnd(segment = '') {
  const normalizedSegment = normalizePlanSubitemPreviewText(segment);
  if (!normalizedSegment || !/\sand\s/i.test(normalizedSegment)) {
    return normalizedSegment ? [normalizedSegment] : [];
  }

  const repeatedSubjectMatch = normalizedSegment.match(
    /^(add|inject|seed|validate|show|store|reject|define|keep|persist|update|load|expose|populate|use|create|run)\s+(.+?)\s+for\s+(.+?)\s+and\s+\2\s+for\s+(.+)$/i,
  );
  if (repeatedSubjectMatch) {
    return [
      `${repeatedSubjectMatch[1]} ${repeatedSubjectMatch[2]} for ${normalizePlanSubitemPreviewText(repeatedSubjectMatch[3])}`,
      `${repeatedSubjectMatch[1]} ${repeatedSubjectMatch[2]} for ${normalizePlanSubitemPreviewText(repeatedSubjectMatch[4])}`,
    ];
  }

  const actionMatch = normalizedSegment.match(/^(add|inject|seed|validate|show|store|reject|define|keep|persist|update|load|expose|populate|use|create|run)\s+(.+)$/i);
  if (!actionMatch) {
    return [normalizedSegment];
  }

  const action = actionMatch[1];
  const remainder = actionMatch[2];
  const sharedTailMatch = remainder.match(/^(.+?)\s+and\s+(.+?)\s+((?:column|columns|field|fields|constraint|constraints|query|queries)?\s*(?:to|for|in|on|under|into)\s+.+)$/i);

  if (sharedTailMatch) {
    const leftPart = normalizePlanSubitemPreviewText(sharedTailMatch[1]);
    const rightPart = normalizePlanSubitemPreviewText(sharedTailMatch[2]);
    const sharedTail = normalizePlanSharedTail(sharedTailMatch[3]);

    if (/\b(to|for|in|on|under|into)\b/i.test(leftPart)) {
      return [normalizedSegment];
    }

    return [
      `${action} ${leftPart} ${sharedTail}`,
      `${action} ${rightPart} ${sharedTail}`,
    ];
  }

  return [normalizedSegment];
}

function expandSinglePlanSegment(segment = '') {
  const normalizedSegment = normalizePlanSubitemPreviewText(segment);
  if (!normalizedSegment) {
    return [];
  }

  const withAnnotationMatch = normalizedSegment.match(/^(add|inject|seed|validate|show|store|reject|define|keep|persist|update|load|expose|populate|use|create|run)\s+(.+?)\s+with\s+(@[\w()."-]+.*)$/i);
  if (withAnnotationMatch) {
    return [
      `${withAnnotationMatch[1]} ${withAnnotationMatch[2]}`,
      `Apply ${withAnnotationMatch[3]}`,
    ];
  }

  const withCallMatch = normalizedSegment.match(/^(add|inject|seed|validate|show|store|reject|define|keep|persist|update|load|expose|populate|use|create|run)\s+(.+?)\s+with\s+([\w.]+\(\))$/i);
  if (withCallMatch) {
    return [
      `${withCallMatch[1]} ${withCallMatch[2]}`,
      `Use ${withCallMatch[3]}`,
    ];
  }

  return [normalizedSegment];
}

function dedupePlanSubitemTexts(items = []) {
  const seen = new Set();
  return items.reduce((result, item) => {
    const normalizedItem = capitalizePlanSubitemText(item);
    if (!normalizedItem) {
      return result;
    }

    const dedupeKey = normalizedItem.toLowerCase();
    if (seen.has(dedupeKey)) {
      return result;
    }

    seen.add(dedupeKey);
    result.push(normalizedItem);
    return result;
  }, []);
}

function buildScopedPlanSubitemText(scope = '', itemText = '') {
  const normalizedScope = normalizePlanSubitemPreviewText(scope);
  const normalizedItemText = capitalizePlanSubitemText(itemText);

  if (!normalizedItemText) {
    return '';
  }

  if (!normalizedScope) {
    return normalizedItemText;
  }

  if (normalizedItemText.toLowerCase().startsWith(`${normalizedScope.toLowerCase()}:`)) {
    return normalizedItemText;
  }

  if (/^tests?$/i.test(normalizedScope)) {
    if (/^verify\b/i.test(normalizedItemText)) {
      return `${normalizedScope}: ${lowercaseLeadingCharacter(normalizedItemText)}`;
    }

    return `${normalizedScope}: verify ${lowercaseLeadingCharacter(normalizedItemText)}`;
  }

  return `${normalizedScope}: ${lowercaseLeadingCharacter(normalizedItemText)}`;
}

function buildPlanContentSubitems({ text = '', includeScope = true } = {}) {
  const { scope, detail } = splitPlanParentText(text);
  if (!detail) {
    return [];
  }

  const commaParts = detail
    .split(/\s*,\s*/g)
    .map((part) => normalizePlanSubitemPreviewText(part))
    .filter(Boolean);
  const splitByAnd = (commaParts.length > 0 ? commaParts : [detail]).flatMap((part) => splitPlanSegmentByAnd(part));
  const expandedParts = (splitByAnd.length > 0 ? splitByAnd : [detail]).flatMap((part) => expandSinglePlanSegment(part));
  const finalItems = dedupePlanSubitemTexts(expandedParts).slice(0, 4);

  if (finalItems.length < 2) {
    return [];
  }

  return finalItems.map((itemText, index) => ({
    id: `parent-derived-${index}`,
    text: includeScope ? buildScopedPlanSubitemText(scope, itemText) : itemText,
  }));
}

function buildDerivedPlanCheckChildren(text = '', parentId = 'plan-item', { includeScope = true } = {}) {
  return buildPlanContentSubitems({ text, includeScope }).map((subitem, index) => ({
    id: `${parentId}:child-${index + 1}`,
    type: 'check',
    checked: false,
    text: subitem.text,
  }));
}

function arePlanCheckChildTextsEqual(children = [], candidateChildren = []) {
  if (!Array.isArray(children) || !Array.isArray(candidateChildren) || children.length !== candidateChildren.length) {
    return false;
  }

  return children.every((child, index) => (
    child?.type === 'check'
    && normalizePlanSubitemPreviewText(child?.text ?? '') === normalizePlanSubitemPreviewText(candidateChildren[index]?.text ?? '')
  ));
}

function withDerivedPlanChildren(section) {
  if (!section || section.title?.toLowerCase() !== 'plan') {
    return section;
  }

  return {
    ...section,
    items: (section.items ?? []).map((item) => {
      if (item?.type !== 'check') {
        return item;
      }

      const scopedDerivedChildren = buildDerivedPlanCheckChildren(item.text, item.id ?? 'plan-item');
      const legacyDerivedChildren = buildDerivedPlanCheckChildren(item.text, item.id ?? 'plan-item', { includeScope: false });
      const hasExistingChildren = Array.isArray(item.children) && item.children.length > 0;
      const shouldUpgradeLegacyChildren = hasExistingChildren && arePlanCheckChildTextsEqual(item.children, legacyDerivedChildren);

      return {
        ...item,
        children: shouldUpgradeLegacyChildren
          ? item.children.map((child, childIndex) => ({
              ...child,
              id: child?.id ?? scopedDerivedChildren[childIndex]?.id ?? `${item.id ?? 'plan-item'}:child-${childIndex + 1}`,
              text: scopedDerivedChildren[childIndex]?.text ?? child?.text ?? '',
            }))
          : (hasExistingChildren
              ? item.children
              : scopedDerivedChildren),
      };
    }),
  };
}

function PlanCheckRow({ statusItem = null, text, issueTarget = null, checkTarget = null, isIssueActive = false, commentAdornment = null, onOpenDiffTab = null, nestingLevel = 0, hasPlanComment = false, isRunning = false }) {
  const diffTarget = issueTarget ?? checkTarget;
  const demoTargetId = formatDemoTargetId(diffTarget);
  const isOutdated = isRunStatusItemOutdated(statusItem);
  const canShowDiff = Boolean(statusItem) && statusItem?.status !== 'pending';
  const isNested = nestingLevel > 0;
  const planLineStyle = isNested
    ? { '--spec-plan-nesting-level': nestingLevel }
    : undefined;

  return (
    <div
      className={`spec-done-line spec-done-line-check spec-done-plan-main spec-done-primary-line${isIssueActive ? ' spec-done-active-issue-line' : ''}${isOutdated ? ' is-outdated' : ''}${isNested ? ' spec-done-plan-child-line' : ''}`}
      data-plan-nesting-level={isNested ? nestingLevel : undefined}
      style={planLineStyle}
    >
      {statusItem
        ? <CheckStatus status={hasPlanComment ? 'skipped' : statusItem.status} outdated={!hasPlanComment && isOutdated} isLoading={isRunning && !hasPlanComment && statusItem.status === 'pending'} />
        : (isRunning
            ? <CheckStatus status="pending" isLoading />
            : <Checkbox className="spec-done-checkbox" checked={false} onChange={() => {}} />)
      }
      <span className="spec-done-plan-text" contentEditable suppressContentEditableWarning>{renderDoneMarkdownInline(text, statusItem?.highlight, statusItem?.issue)}</span>
      {commentAdornment}
      {canShowDiff && !isNested && (
        <button
          type="button"
          className="ac-checks-toggle spec-plan-diff-toggle"
          aria-label="Show diff"
          title="Show diff"
          data-demo-id={demoTargetId ? `plan-show-diff-${demoTargetId}` : undefined}
          onClick={() => onOpenDiffTab?.({ text, statusItem, issueTarget: diffTarget })}
        >
          <Icon name={DIFF_TAB_ICON_NAME} size={16} />
        </button>
      )}
    </div>
  );
}

function renderDoneLine(line, key, addPopupFiles, attachedFiles = [], checkStatus = null, sectionMeta = null, planStatus = null, isIssueActive = false, commentAdornment = null, issueTarget = null, onOpenDiffTab = null, checkTarget = null, currentSectionTitle = '', activeRunRequest = null, nestingLevel = 0, onProposalAccept = null, onProposalDecision = null, hasPlanComment = false, onOpenCheckChip = null) {
  const headingTitle = getDoneHeadingTitle(line);
  if (headingTitle) {
    if (headingTitle.toLowerCase() === 'plan') {
      const initialFiles = getDonePlanHeadingFiles(sectionMeta, attachedFiles);
      return (
        <DoneHeadingWithFiles
          key={key}
          title={headingTitle}
          initialFiles={initialFiles}
          addPopupFiles={addPopupFiles}
          commentAdornment={commentAdornment}
        />
      );
    }
    if (headingTitle.toLowerCase() === 'acceptance criteria') {
      const initialFiles = getDoneAcceptanceHeadingFiles(sectionMeta, attachedFiles);
      return (
        <DoneHeadingWithFiles
          key={key}
          title={headingTitle}
          initialFiles={initialFiles}
          addPopupFiles={addPopupFiles}
          commentAdornment={commentAdornment}
        />
      );
    }
    return (
      <div key={key} className="spec-done-heading-row">
        <h1 className="spec-done-heading text-ui-h1" contentEditable suppressContentEditableWarning>
          {renderDoneMarkdownInline(headingTitle)}
        </h1>
        {commentAdornment}
      </div>
    );
  }
  const refFileMatch = line.match(/^Reference file:\s+(.+)$/);
  if (refFileMatch) {
    return <DoneReferenceFileLine key={key} label={refFileMatch[1]} addPopupFiles={addPopupFiles} commentAdornment={commentAdornment} />;
  }
  const checkMatch = line.match(/^(\s*)- \[([ x])\]\s+(.*)$/i);
  if (checkMatch) {
    const checked = checkMatch[2].toLowerCase() === 'x';
    const normalizedRunTarget = normalizeCommentTarget(activeRunRequest?.checkTarget ?? null);
    const normalizedSectionTitle = typeof currentSectionTitle === 'string' ? currentSectionTitle.trim().toLowerCase() : '';
    const isGlobalSpecifyingRun = activeRunRequest?.mode === 'specify' && !normalizedRunTarget;
    const isRunning = Boolean(activeRunRequest) && (
      (isGlobalSpecifyingRun && (checkTarget?.kind === 'ac' || checkTarget?.kind === 'plan'))
      ||
      (normalizedRunTarget
        && checkTarget
        && normalizedRunTarget.kind === checkTarget.kind
        && normalizedRunTarget.index === checkTarget.index)
      || (!normalizedRunTarget
        && ((normalizedSectionTitle === 'acceptance criteria' && checkTarget?.kind === 'ac')
          || (normalizedSectionTitle === 'plan' && checkTarget?.kind === 'plan')))
    );
    if (checkStatus != null) {
      return <AcCheckRow key={key} checkItem={checkStatus} text={checkMatch[3]} isIssueActive={isIssueActive} commentAdornment={commentAdornment} onProposalAccept={onProposalAccept} onProposalDecision={onProposalDecision} onOpenCheckChip={onOpenCheckChip} isRunning={isRunning} />;
    }
    if (checkTarget?.kind === 'ac' && isRunning) {
      return <AcCheckRow key={key} checkItem={{ status: 'pending', checks: [] }} text={checkMatch[3]} isIssueActive={isIssueActive} commentAdornment={commentAdornment} onProposalAccept={onProposalAccept} onProposalDecision={onProposalDecision} onOpenCheckChip={onOpenCheckChip} isRunning />;
    }
    if (checkTarget?.kind === 'plan') {
      return (
        <PlanCheckRow
          key={key}
          statusItem={planStatus}
          text={checkMatch[3]}
          issueTarget={issueTarget}
          checkTarget={checkTarget}
          isIssueActive={isIssueActive}
          commentAdornment={commentAdornment}
          onOpenDiffTab={onOpenDiffTab}
          nestingLevel={nestingLevel}
          hasPlanComment={hasPlanComment}
          isRunning={isRunning}
        />
      );
    }
    return (
      <div key={key} className="spec-done-line spec-done-line-check">
        <Checkbox className="spec-done-checkbox" checked={checked} onChange={() => {}} />
        <span contentEditable suppressContentEditableWarning>{renderDoneMarkdownInline(checkMatch[3])}</span>
        {commentAdornment}
      </div>
    );
  }
  const bulletMatch = line.match(/^-\s+(.*)$/);
  if (bulletMatch) {
    return (
      <div key={key} className="spec-done-line spec-done-line-bullet">
        <span className="spec-done-bullet">•</span>
        <span contentEditable suppressContentEditableWarning>{renderDoneMarkdownInline(bulletMatch[1])}</span>
        {commentAdornment}
      </div>
    );
  }
  const commentMatch = line.match(/^\/\/\s?(.*)$/);
  if (commentMatch) {
    return (
      <div key={key} className="spec-done-line spec-done-line-comment">
        <span className="spec-comment-prefix">//</span>
        <span contentEditable suppressContentEditableWarning>{renderDoneMarkdownInline(commentMatch[1])}</span>
        {commentAdornment}
      </div>
    );
  }
  if (!line.trim()) {
    return (
      <div key={key} className="spec-done-line spec-done-line-empty">
        <div className="spec-done-line-empty-editable" contentEditable suppressContentEditableWarning />
        {commentAdornment && (
          <span className="spec-done-empty-line-comment-icon">{commentAdornment}</span>
        )}
      </div>
    );
  }
  return (
    <div key={key} className="spec-done-line spec-done-line-text">
      <span contentEditable suppressContentEditableWarning>{renderDoneMarkdownInline(line)}</span>
      {commentAdornment}
    </div>
  );
}

function DoneInspectionWidget({
  onOpenProblems,
  onNavigatePreviousIssue,
  onNavigateNextIssue,
  warningCount = 0,
  errorCount = 0,
  commentCount = 0,
  hasExternalComments = false,
  versions = [],
  onVersionSelect = null,
  className = '',
}) {
  const [versionPopupRect, setVersionPopupRect] = useState(null);
  const versionEntries = Array.isArray(versions) && versions.length > 0
    ? versions
    : [{
        id: 'spec-version-fallback',
        number: 1,
        label: buildSpecVersionLabel(1),
        code: '',
      }];
  const currentVersion = versionEntries[versionEntries.length - 1] ?? versionEntries[0];
  const popupVersionEntries = [...versionEntries].reverse();
  const hasWarnings = warningCount > 0;
  const hasErrors = errorCount > 0;
  const hasComments = commentCount > 0;
  const hasIssues = hasWarnings || hasErrors || hasComments;
  const commentLabel = `${commentCount} comment${commentCount === 1 ? '' : 's'}`;
  const problemLabelParts = [
    hasComments ? commentLabel : null,
    hasWarnings ? `${warningCount} warning${warningCount === 1 ? '' : 's'}` : null,
    hasErrors ? `${errorCount} error${errorCount === 1 ? '' : 's'}` : null,
  ].filter(Boolean);

  useEffect(() => {
    if (!versionPopupRect) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setVersionPopupRect(null);
    };

    const closePopup = () => setVersionPopupRect(null);

    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', closePopup);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', closePopup);
    };
  }, [versionPopupRect]);

  const toggleVersionPopup = (event) => {
    if (versionPopupRect) {
      setVersionPopupRect(null);
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect) return;

    setVersionPopupRect(rect);
  };

  return (
    <>
    <div className={`spec-done-inspection-widget${className ? ` ${className}` : ''}`}>
      {hasIssues && (
        <>
          <button
            type="button"
            className="spec-done-inspection-counts-btn"
            aria-label={problemLabelParts.join(' and ')}
            data-demo-id="spec-inspection-counts"
            onClick={() => onOpenProblems?.()}
          >
            {hasComments && (
              <span className={`spec-done-inspection-group spec-done-inspection-comment-group${hasExternalComments ? ' has-external-comments' : ''}`}>
                <span className="spec-done-inspection-comment-icon">
                  <DoneCommentCountIcon />
                </span>
                <span className="spec-done-inspection-text">{commentCount}</span>
                {hasExternalComments && (
                  <span className="spec-done-inspection-comment-dot" aria-hidden="true" />
                )}
              </span>
            )}
            {hasWarnings && (
              <span className="spec-done-inspection-group">
                <Icon name="status/warning" size={16} />
                <span className="spec-done-inspection-text">{warningCount}</span>
              </span>
            )}
            {hasErrors && (
              <span className="spec-done-inspection-group">
                <Icon name="status/error" size={16} />
                <span className="spec-done-inspection-text">{errorCount}</span>
              </span>
            )}
          </button>
          {(hasWarnings || hasErrors) && (
            <div className="spec-done-inspection-nav">
              <Tooltip text="Previous Highlighted Error" shortcut="⇧F2" placement="bottom" delay={0}>
                <button
                  type="button"
                  className="spec-inspection-nav-btn spec-done-inspection-nav-btn"
                  aria-label="Previous highlighted error"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => onNavigatePreviousIssue?.()}
                >
                  <Icon name="general/chevronUp" size={16} />
                </button>
              </Tooltip>
              <Tooltip text="Next Highlighted Error" shortcut="F2" placement="bottom" delay={0}>
                <button
                  type="button"
                  className="spec-inspection-nav-btn spec-done-inspection-nav-btn"
                  aria-label="Next highlighted error"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => onNavigateNextIssue?.()}
                >
                  <Icon name="general/chevronDown" size={16} />
                </button>
              </Tooltip>
            </div>
          )}
        </>
      )}
    </div>
    {versionPopupRect && (
      <PositionedPopup triggerRect={versionPopupRect} onDismiss={() => setVersionPopupRect(null)} gap={4}>
        <div className="cmp-popup spec-done-version-popup">
          {popupVersionEntries.map((version) => {
            const isCurrentVersion = version.id === currentVersion?.id;
            return (
              <div
                key={version.id}
                className={`cmp-cell spec-done-version-popup-item${isCurrentVersion ? ' cmp-cell-selected' : ''}`}
                role="button"
                tabIndex={0}
                onMouseDown={(event) => {
                  event.preventDefault();
                  if (isCurrentVersion) {
                    setVersionPopupRect(null);
                    return;
                  }
                  onVersionSelect?.(version);
                  setVersionPopupRect(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    if (!isCurrentVersion) {
                      onVersionSelect?.(version);
                    }
                    setVersionPopupRect(null);
                  }
                }}
              >
                <span className="spec-done-version-popup-icon">
                  <Icon name="general/history" size={16} />
                </span>
                <div className="cmp-content">
                  <span className="cmp-label">{version.label}</span>
                  <span className="cmp-desc">{isCurrentVersion ? 'Current' : 'Show diff'}</span>
                </div>
              </div>
            );
          })}
          <div className="cmp-footer spec-done-version-popup-footer">
            <span className="cmp-footer-text">New versions appear after enhance.</span>
          </div>
        </div>
      </PositionedPopup>
    )}
    </>
  );
}

function getClientRectBounds(rects) {
  const filtered = Array.from(rects).filter((item) => item.width > 0 || item.height > 0);
  if (filtered.length === 0) return null;

  const bounds = filtered.reduce((acc, item) => ({
    top: Math.min(acc.top, item.top),
    right: Math.max(acc.right, item.right),
    bottom: Math.max(acc.bottom, item.bottom),
    left: Math.min(acc.left, item.left),
  }), {
    top: filtered[0].top,
    right: filtered[0].right,
    bottom: filtered[0].bottom,
    left: filtered[0].left,
  });

  return {
    ...bounds,
    width: bounds.right - bounds.left,
    height: bounds.bottom - bounds.top,
  };
}

function getRangeViewportRect(range) {
  if (!range) return null;

  const rect = range.getBoundingClientRect();
  if (rect && (rect.width > 0 || rect.height > 0)) return rect;

  return getClientRectBounds(range.getClientRects());
}

function getVisibleAgentTaskTopBarBottom(rect) {
  if (!rect || typeof document === 'undefined') return null;

  const topBars = Array.from(document.querySelectorAll('.editor-top-bar')).filter((node) => {
    if (!(node instanceof HTMLElement)) return false;
    if (!node.querySelector('.agent-task-editor-area')) return false;

    const topBarRect = node.getBoundingClientRect();
    return (
      topBarRect.width > 0 &&
      topBarRect.height > 0 &&
      topBarRect.right > rect.left &&
      topBarRect.left < rect.right &&
      topBarRect.bottom <= rect.bottom
    );
  });

  if (topBars.length === 0) return null;

  return topBars.reduce((bottom, node) => {
    const nextBottom = node.getBoundingClientRect().bottom;
    return bottom === null ? nextBottom : Math.max(bottom, nextBottom);
  }, null);
}

function getSelectionToolbarPosition(rect, options = {}) {
  if (!rect) return null;

  const TOOLBAR_SAFE_WIDTH = Number.isFinite(options.safeWidth) ? options.safeWidth : 304;
  const TOOLBAR_SAFE_HEIGHT = Number.isFinite(options.safeHeight) ? options.safeHeight : 44;
  const TOOLBAR_GAP = 10;
  const VIEWPORT_GUTTER = 8;
  const centerX = rect.left + rect.width / 2;
  const left = Math.min(
    Math.max(centerX, VIEWPORT_GUTTER + TOOLBAR_SAFE_WIDTH / 2),
    window.innerWidth - VIEWPORT_GUTTER - TOOLBAR_SAFE_WIDTH / 2
  );
  const topBarBottom = getVisibleAgentTaskTopBarBottom(rect);
  const minTop = Math.max(VIEWPORT_GUTTER, (topBarBottom ?? 0) + VIEWPORT_GUTTER);
  const spaceAbove = rect.top - minTop;
  const spaceBelow = window.innerHeight - VIEWPORT_GUTTER - rect.bottom;
  const canPlaceAbove = spaceAbove >= TOOLBAR_SAFE_HEIGHT + TOOLBAR_GAP;
  const canPlaceBelow = spaceBelow >= TOOLBAR_SAFE_HEIGHT + TOOLBAR_GAP;

  let placeBelow = false;

  if (!canPlaceAbove && canPlaceBelow) {
    placeBelow = true;
  } else if (!canPlaceAbove && !canPlaceBelow) {
    placeBelow = spaceBelow > spaceAbove;
  }

  return {
    left,
    top: placeBelow ? rect.bottom + TOOLBAR_GAP : rect.top - TOOLBAR_GAP,
    placement: placeBelow ? 'bottom' : 'top',
  };
}

function getTextareaSelectionViewportRect(textarea) {
  if (!(textarea instanceof HTMLTextAreaElement)) return null;

  const selectionStart = textarea.selectionStart ?? 0;
  const selectionEnd = textarea.selectionEnd ?? 0;
  if (selectionStart === selectionEnd) return null;

  const mirror = document.createElement('div');
  const selectionNode = document.createElement('span');
  const textareaRect = textarea.getBoundingClientRect();
  const computedStyle = window.getComputedStyle(textarea);

  mirror.setAttribute('aria-hidden', 'true');
  mirror.style.position = 'fixed';
  mirror.style.top = '0';
  mirror.style.left = '-9999px';
  mirror.style.visibility = 'hidden';
  mirror.style.pointerEvents = 'none';
  mirror.style.boxSizing = 'border-box';
  mirror.style.width = `${textarea.offsetWidth}px`;
  mirror.style.minHeight = `${textarea.offsetHeight}px`;
  mirror.style.padding = computedStyle.padding;
  mirror.style.border = computedStyle.border;
  mirror.style.font = computedStyle.font;
  mirror.style.fontFamily = computedStyle.fontFamily;
  mirror.style.fontSize = computedStyle.fontSize;
  mirror.style.fontWeight = computedStyle.fontWeight;
  mirror.style.fontStyle = computedStyle.fontStyle;
  mirror.style.lineHeight = computedStyle.lineHeight;
  mirror.style.letterSpacing = computedStyle.letterSpacing;
  mirror.style.textTransform = computedStyle.textTransform;
  mirror.style.textIndent = computedStyle.textIndent;
  mirror.style.textAlign = computedStyle.textAlign;
  mirror.style.tabSize = computedStyle.tabSize;
  mirror.style.whiteSpace = 'pre-wrap';
  mirror.style.wordBreak = 'break-word';
  mirror.style.overflowWrap = 'break-word';
  mirror.style.overflow = 'hidden';

  mirror.append(document.createTextNode(textarea.value.slice(0, selectionStart)));
  selectionNode.textContent = textarea.value.slice(selectionStart, selectionEnd) || ' ';
  mirror.append(selectionNode);
  mirror.append(document.createTextNode(textarea.value.slice(selectionEnd) || ' '));
  document.body.append(mirror);

  const mirrorRect = mirror.getBoundingClientRect();
  const selectionRect = getClientRectBounds(selectionNode.getClientRects());

  mirror.remove();

  if (!selectionRect) return null;

  return {
    top: textareaRect.top + (selectionRect.top - mirrorRect.top) - textarea.scrollTop,
    right: textareaRect.left + (selectionRect.right - mirrorRect.left) - textarea.scrollLeft,
    bottom: textareaRect.top + (selectionRect.bottom - mirrorRect.top) - textarea.scrollTop,
    left: textareaRect.left + (selectionRect.left - mirrorRect.left) - textarea.scrollLeft,
    width: selectionRect.width,
    height: selectionRect.height,
  };
}

function hasTextareaMultilineSelection(textarea) {
  if (!(textarea instanceof HTMLTextAreaElement)) return false;

  const selectionStart = textarea.selectionStart ?? 0;
  const selectionEnd = textarea.selectionEnd ?? 0;
  if (selectionStart === selectionEnd) return false;

  return true;
}

function hasActiveMultilineEditorSelection() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;

  const activeElement = document.activeElement;
  if (activeElement instanceof HTMLTextAreaElement) {
    return hasTextareaMultilineSelection(activeElement);
  }

  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return false;
  if (selection.toString().trim()) return true;

  const rects = Array.from(selection.getRangeAt(0).getClientRects()).filter((rect) => rect.width > 0 || rect.height > 0);
  if (rects.length <= 1) return false;

  const firstTop = Math.round(rects[0].top);
  return rects.some((rect) => Math.abs(Math.round(rect.top) - firstTop) > 2);
}

function captureActiveEditorSelectionSnapshot() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null;

  const activeElement = document.activeElement;
  if (activeElement instanceof HTMLTextAreaElement) {
    const start = activeElement.selectionStart ?? 0;
    const end = activeElement.selectionEnd ?? 0;
    if (start === end) {
      return null;
    }

    return {
      type: 'textarea',
      element: activeElement,
      start,
      end,
      direction: activeElement.selectionDirection ?? 'none',
    };
  }

  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0 || !hasActiveMultilineEditorSelection()) {
    return null;
  }

  return {
    type: 'range',
    range: selection.getRangeAt(0).cloneRange(),
  };
}

function restoreEditorSelectionSnapshot(snapshot) {
  if (!snapshot || typeof window === 'undefined' || typeof document === 'undefined') return;

  if (snapshot.type === 'textarea' && snapshot.element instanceof HTMLTextAreaElement) {
    snapshot.element.focus({ preventScroll: true });
    snapshot.element.setSelectionRange(snapshot.start, snapshot.end, snapshot.direction);
    return;
  }

  if (snapshot.type === 'range' && snapshot.range) {
    const selection = window.getSelection();
    if (!selection) return;
    selection.removeAllRanges();
    selection.addRange(snapshot.range);
  }
}

function scheduleEditorSelectionSnapshotRestore(snapshot) {
  if (!snapshot || typeof window === 'undefined') return;

  const restore = () => restoreEditorSelectionSnapshot(snapshot);
  restore();
  window.requestAnimationFrame(() => {
    restore();
    window.requestAnimationFrame(restore);
  });
}

function formatEditorCommentLineLabel(lineNumbers = []) {
  const normalizedLineNumbers = Array.from(new Set(
    lineNumbers
      .map((lineNumber) => Number(lineNumber))
      .filter((lineNumber) => Number.isFinite(lineNumber))
      .map((lineNumber) => Math.trunc(lineNumber))
      .filter((lineNumber) => lineNumber > 0)
  )).sort((a, b) => a - b);

  if (normalizedLineNumbers.length === 0) return '';

  const firstLineNumber = normalizedLineNumbers[0];
  const lastLineNumber = normalizedLineNumbers[normalizedLineNumbers.length - 1];

  return firstLineNumber === lastLineNumber
    ? `Comment to line ${firstLineNumber}`
    : `Comment to lines from ${firstLineNumber} to ${lastLineNumber}`;
}

function getTextareaEditorCommentLineLabel(snapshot = null) {
  if (snapshot?.type !== 'textarea' || !(snapshot.element instanceof HTMLTextAreaElement)) {
    return '';
  }

  const value = snapshot.element.value ?? '';
  const start = Math.min(snapshot.start ?? 0, snapshot.end ?? 0);
  const end = Math.max(snapshot.start ?? 0, snapshot.end ?? 0);
  if (start === end) return '';

  const lineNumberAtOffset = (offset) => value.slice(0, Math.max(0, offset)).split('\n').length;
  const startLineNumber = lineNumberAtOffset(start);
  const endLineNumber = lineNumberAtOffset(Math.max(start, end - 1));

  return formatEditorCommentLineLabel([startLineNumber, endLineNumber]);
}

const SPEC_SELECTION_TOOLBAR_ITEMS = [
  { id: 'suggest', label: 'Suggest action', accent: 'warning', iconName: 'codeInsight/intentionBulb' },
  { id: 'comment', label: 'Comment', iconName: 'general/balloon' },
  { id: 'separator-ai', type: 'separator' },
  { id: 'bold', label: 'Bold', text: 'B', textClassName: 'spec-done-selection-toolbar-text-bold' },
  { id: 'italic', label: 'Italic', text: 'I', textClassName: 'spec-done-selection-toolbar-text-italic' },
  { id: 'strike', label: 'Strikethrough', text: 'S', textClassName: 'spec-done-selection-toolbar-text-strike' },
  { id: 'code', label: 'Inline code', text: '<>', textClassName: 'spec-done-selection-toolbar-text-code' },
  { id: 'link', label: 'Insert link', iconName: 'actions/attach' },
  { id: 'separator-format', type: 'separator' },
  { id: 'list', label: 'List', iconName: 'general/menu' },
  { id: 'separator-more', type: 'separator' },
  { id: 'more', label: 'More actions', iconName: 'general/moreVertical' },
];

function getDoneIssueFixActionLabel(issueTarget) {
  if (!issueTarget) {
    return 'Apply fix and rebuild';
  }

  const fixConfig = getIssueQuickFixConfig(issueTarget.kind, issueTarget.index);
  if (typeof fixConfig?.actionLabel === 'string' && fixConfig.actionLabel.trim().length > 0) {
    return fixConfig.actionLabel.trim();
  }

  if (typeof fixConfig?.replacementText === 'string' && fixConfig.replacementText.trim().length > 0) {
    return fixConfig.replacementText.trim();
  }

  const issueKindLabel = issueTarget.kind === 'ac' ? 'AC' : issueTarget.kind === 'plan' ? 'Plan' : 'Issue';
  const itemNumber = Number.isInteger(issueTarget.index) ? issueTarget.index + 1 : null;
  return itemNumber ? `Fix ${issueKindLabel} item ${itemNumber} and rebuild` : 'Apply fix and rebuild';
}

function buildDoneIntentionPopupActions({ severity, canFixIssue = true, issueTarget = null }) {
  const fixActionLabel = getDoneIssueFixActionLabel(issueTarget);

  if (severity === 'failed') {
    return {
      primary: [
        canFixIssue ? { id: 'apply-fix', label: fixActionLabel, icon: 'codeInsight/intentionBulb', action: 'fix' } : null,
        { id: 'open-problems', label: 'Open Problems', icon: 'codeInsight/intentionBulb', action: 'problems' },
        { id: 'regenerate-spec', label: 'Specify spec', icon: 'codeInsight/intentionBulb', action: 'regenerate' },
      ].filter(Boolean),
      secondary: [
        { id: 'rewrite-item', label: 'Rewrite this item' },
        { id: 'explain-failure', label: 'Explain failure in notes' },
        { id: 'move-tradeoff', label: 'Move to Decisions' },
      ],
    };
  }

  return {
    primary: [
      canFixIssue ? { id: 'apply-fix', label: fixActionLabel, icon: 'codeInsight/intentionBulb', action: 'fix' } : null,
      { id: 'open-problems', label: 'Open Problems', icon: 'codeInsight/intentionBulb', action: 'problems' },
      { id: 'regenerate-spec', label: 'Specify spec', icon: 'codeInsight/intentionBulb', action: 'regenerate' },
    ].filter(Boolean),
    secondary: [
      { id: 'clarify-item', label: 'Clarify this requirement' },
      { id: 'attach-reference', label: 'Attach reference file' },
      { id: 'move-notes', label: 'Move to Implementation Notes' },
    ],
  };
}

function DoneIssueIntentionPopup({ severity, canFixIssue = true, issueTarget = null, onOpenProblems, onRegenerateSpec, onFixIssue, onClose }) {
  const actions = buildDoneIntentionPopupActions({ severity, canFixIssue, issueTarget });
  const demoTargetId = formatDemoTargetId(issueTarget);

  const handleAction = (item) => {
    if (item.action === 'fix') {
      onFixIssue?.();
    } else if (item.action === 'problems') {
      onOpenProblems?.();
    } else if (item.action === 'regenerate') {
      onRegenerateSpec?.();
    }

    onClose?.();
  };

  const renderActionRow = (item, { key, primary = false }) => (
    <button
      key={key}
      type="button"
      className={`cmp-cell spec-done-intention-popup-item${primary ? ' spec-done-intention-popup-item-primary' : ''}`}
      data-demo-id={demoTargetId ? `issue-popup-${item.id}-${demoTargetId}` : undefined}
      onMouseDown={(event) => {
        event.preventDefault();
        handleAction(item);
      }}
    >
      <span className="spec-done-intention-popup-leading" aria-hidden="true">
        {item.icon ? <Icon name={item.icon} size={16} /> : null}
      </span>
      <div className="cmp-content">
        <span className="cmp-label">{item.label}</span>
      </div>
    </button>
  );

  return (
    <div className="cmp-popup spec-done-intention-popup" onMouseDown={(event) => event.preventDefault()}>
      {actions.primary.map((item) => renderActionRow(item, { key: item.id, primary: true }))}
      <div className="spec-done-intention-popup-divider" />
      {actions.secondary.map((item) => renderActionRow(item, { key: item.id }))}
      <div className="cmp-footer spec-done-intention-popup-footer">
        <span className="cmp-footer-text">Quick actions for the active issue.</span>
        <span className="cmp-footer-tip">Esc to close</span>
      </div>
    </div>
  );
}

function DoneEnhanceGuidePopup({ arrowPosition = 'top', dismissing = false }) {
  const arrow = (
    <svg width="16" height="8" viewBox="0 0 16 8" fill="none" aria-hidden="true">
      <path d="M0 8 L8 0 L16 8 Z" className="got-it-arrow-fill" />
      <path d="M0 8 L8 0 L16 8" className="got-it-arrow-stroke" />
    </svg>
  );
  return (
    <div className={`enhance-hint enhance-hint-${arrowPosition}${dismissing ? ' enhance-hint-dismissing' : ''}`}>
      {(arrowPosition === 'top' || arrowPosition === 'left') && (
        <div className={`enhance-hint-corner enhance-hint-corner-${arrowPosition}`}>{arrow}</div>
      )}
      <div className="enhance-hint-body">
        Changes made — click <strong>Specify</strong> to update the spec.
      </div>
      {(arrowPosition === 'bottom' || arrowPosition === 'right') && (
        <div className={`enhance-hint-corner enhance-hint-corner-${arrowPosition}`}>{arrow}</div>
      )}
    </div>
  );
}

function SpecSelectionToolbar({ position, onAction }) {
  if (!position) return null;

  const preventSelectionReset = (event) => {
    event.preventDefault();
  };

  return createPortal(
    <div
      className={`spec-done-selection-toolbar spec-done-selection-toolbar-${position.placement}`}
      style={{ top: position.top, left: position.left }}
      role="toolbar"
      aria-label="Selected text actions"
      onMouseDown={preventSelectionReset}
    >
      {SPEC_SELECTION_TOOLBAR_ITEMS.map((item) => {
        if (item.type === 'separator') {
          return <span key={item.id} className="spec-done-selection-toolbar-separator" aria-hidden="true" />;
        }

        return (
          <button
            key={item.id}
            type="button"
            className={`spec-done-selection-toolbar-btn${item.accent ? ` is-${item.accent}` : ''}`}
            aria-label={item.label}
            title={item.label}
            onMouseDown={preventSelectionReset}
            onClick={(event) => onAction?.(item.id, event.currentTarget.getBoundingClientRect())}
          >
            {item.iconName ? (
              <Icon name={item.iconName} size={16} />
            ) : (
              <span className={`spec-done-selection-toolbar-text ${item.textClassName ?? ''}`} aria-hidden="true">
                {item.text}
              </span>
            )}
          </button>
        );
      })}
    </div>,
    document.body
  );
}

function normalizeStoredBreakpointKeys(keys = []) {
  if (!Array.isArray(keys)) {
    return [];
  }

  return Array.from(new Set(keys.filter((key) => typeof key === 'string' && key.length > 0))).sort();
}

function areSortedStringArraysEqual(left = [], right = []) {
  if (left.length !== right.length) return false;

  return left.every((value, index) => value === right[index]);
}

function normalizeDoneOverlayUiState(uiState = null) {
  const normalizedUiState = uiState && typeof uiState === 'object'
    ? { ...uiState }
    : {};

  normalizedUiState.breakpointKeys = normalizeStoredBreakpointKeys(normalizedUiState.breakpointKeys);
  return normalizedUiState;
}

function areDoneOverlayUiStatesEqual(left = null, right = null) {
  const normalizedLeft = normalizeDoneOverlayUiState(left);
  const normalizedRight = normalizeDoneOverlayUiState(right);
  const leftKeys = Object.keys(normalizedLeft).sort();
  const rightKeys = Object.keys(normalizedRight).sort();

  if (!areSortedStringArraysEqual(leftKeys, rightKeys)) {
    return false;
  }

  return leftKeys.every((key) => (
    key === 'breakpointKeys'
      ? areSortedStringArraysEqual(normalizedLeft.breakpointKeys, normalizedRight.breakpointKeys)
      : normalizedLeft[key] === normalizedRight[key]
  ));
}

function DoneMarkdownOverlay({ code, onOpenProblems, onOpenTerminal, onRegenerateSpec, onFixIssue, onOpenDiffTab, onOpenCheckChip, onOpenCommentSource = null, addPopupFiles, attachedFiles = [], onAddToProjectContext, acRunResult, planRunResult, documentSections, acWarningBanner, inspectionSummary, versionHistory = null, onOpenVersionDiff = null, onCommentCountChange, onCommentsChange, commentEntries: persistedCommentEntries = [], relatedCommentIssues = [], removedIssueIndices, highlightedProblemLocation = null, commentResetToken = 0, uiState = null, onUiStateChange = null, onPendingEnhanceStateChange = null, onUserInput = null, activeRunRequest = null, commentContextLabel: providedCommentContextLabel = '', commentContextSessionLabel = 'Active' }) {
  const effectiveDocumentSections = useMemo(
    () => orderPlanBeforeAcceptanceSections(
      normalizeLegacyVisitBookingGoalDocumentSections(documentSections).map((section) => withDerivedPlanChildren(section))
    ),
    [documentSections]
  );
  const effectiveCode = useMemo(
    () => orderPlanBeforeAcceptanceCode(
      normalizeLegacyDerivedPlanChildrenCode(
        normalizeLegacyVisitBookingGoalCode(
          typeof code === 'string' ? code : serializeSpecDocument(effectiveDocumentSections)
        )
      )
    ),
    [code, effectiveDocumentSections]
  );
  const commentContextLabel = useMemo(() => {
    const normalizedProvidedLabel = typeof providedCommentContextLabel === 'string'
      ? providedCommentContextLabel.trim()
      : '';
    return normalizedProvidedLabel || extractGoalTitleFromMarkdown(effectiveCode) || 'New Chat';
  }, [effectiveCode, providedCommentContextLabel]);
  const [extraDecisionItems, setExtraDecisionItems] = useState([]);
  const addExtraDecisionItem = useCallback((text) => {
    setExtraDecisionItems((prev) => prev.includes(text) ? prev : [...prev, text]);
  }, []);
  const tradeoffCount = useMemo(
    () => countRecordedTradeoffs(effectiveDocumentSections),
    [effectiveDocumentSections]
  );
  const acceptanceCriteriaCount = Array.isArray(acRunResult) ? acRunResult.length : 0;
  const planItemCount = Array.isArray(planRunResult) ? planRunResult.length : 0;
  const projectContextFile = useMemo(
    () => getProjectContextFile(effectiveDocumentSections, addPopupFiles),
    [addPopupFiles, effectiveDocumentSections]
  );
  const [projectContextBannerDismissed, setProjectContextBannerDismissed] = useState(false);
  const successBannerMessage = useMemo(
    () => buildSuccessBannerMessage({
      acceptanceCriteriaCount,
      planItemCount,
      tradeoffCount,
    }),
    [acceptanceCriteriaCount, planItemCount, tradeoffCount]
  );
  const showSuccessBanner = useMemo(
    () => !acWarningBanner
      && areAllChecklistStatusesPassed(acRunResult)
      && areAllChecklistStatusesPassed(planRunResult),
    [acRunResult, acWarningBanner, planRunResult]
  );
  const shouldRenderSuccessBanner = showSuccessBanner && !projectContextBannerDismissed;
  const [draftCode, setDraftCode] = useState(() => effectiveCode);
  const draftCodeRef = useRef(draftCode);
  draftCodeRef.current = draftCode;

  useEffect(() => {
    setProjectContextBannerDismissed(false);
  }, [projectContextFile?.label, showSuccessBanner]);

  useEffect(() => {
    setDraftCode(effectiveCode);
  }, [commentResetToken, effectiveCode]);

  const displayRows = useMemo(() => {
    const rawLines = draftCode ? draftCode.split(/\r?\n/) : [];
    const nextRows = rawLines.reduce((rows, line, rawIndex) => {
      if (/^\s*##\s+/.test(line) && rows.length > 0 && rows[rows.length - 1].line.trim() !== '') {
        rows.push({ line: '', rawIndex: null, isVirtual: true });
      }

      rows.push({ line, rawIndex, isVirtual: false });
      return rows;
    }, []);

    nextRows.push(
      { line: '', rawIndex: null, isVirtual: true },
      { line: '', rawIndex: null, isVirtual: true },
    );

    return nextRows;
  }, [draftCode]);
  const serializedDocumentModel = useMemo(
    () => buildSerializedDocumentLines(effectiveDocumentSections),
    [effectiveDocumentSections]
  );
  const serializedDocumentLineMap = serializedDocumentModel.lineMap;
  const serializedDocumentLines = serializedDocumentModel.lines;
  const matchedSerializedLineMetaByRow = useMemo(
    () => buildDisplayRowSerializedLineMatches(displayRows, serializedDocumentLines, serializedDocumentLineMap),
    [displayRows, serializedDocumentLineMap, serializedDocumentLines]
  );
  const storedBreakpointKeys = useMemo(
    () => normalizeStoredBreakpointKeys(uiState?.breakpointKeys),
    [uiState?.breakpointKeys]
  );
  const storedBreakpointKeysSignature = storedBreakpointKeys.join('|');
  const [breakpoints, setBreakpoints] = useState(() => new Set(storedBreakpointKeys));
  const breakpointKeys = useMemo(
    () => Array.from(breakpoints).sort(),
    [breakpoints]
  );
  const lastStoredBreakpointKeysSignatureRef = useRef(storedBreakpointKeysSignature);
  const [refPopupPos, setRefPopupPos] = useState(null);
  const [refCmpQuery, setRefCmpQuery] = useState('');
  const [refCmpSelectedIdx, setRefCmpSelectedIdx] = useState(0);
  const refSpanRef = useRef(null);
  const [doneCmpPos, setDoneCmpPos] = useState(null);
  const [doneCmpSelectedIdx, setDoneCmpSelectedIdx] = useState(0);
  const doneCmpEditableRef = useRef(null);
  const doneCmpRangeRef = useRef(null);
  const doneCmpQueryRef = useRef('');
  const [hasEditedLines, setHasEditedLines] = useState(false);
  const [deletedRowKeys, setDeletedRowKeys] = useState(() => new Set());
  const [clearedRowKeys, setClearedRowKeys] = useState(() => new Set());
  const pendingFocusRowKeyRef = useRef(null);
  const pendingFocusNextRowKeyRef = useRef(null);
  const scrollRef = useRef(null);
  const [selectionToolbarPos, setSelectionToolbarPos] = useState(null);
  const [activeIssueRowKey, setActiveIssueRowKey] = useState(null);
  const [navigatedIssueRowKey, setNavigatedIssueRowKey] = useState(null);
  const [resolvedProposalRowKeys, setResolvedProposalRowKeys] = useState(() => new Set());
  const [focusedCommentRowKey, setFocusedCommentRowKey] = useState(null);
  const [hoveredRowKey, setHoveredRowKey] = useState(null);
  const [hoveredIssueRowKey, setHoveredIssueRowKey] = useState(null);
  const [commentPopup, setCommentPopup] = useState(null);
  const [intentionPopup, setIntentionPopup] = useState(null);
  const normalizedCode = useMemo(
    () => normalizeSpecCodeForComparison(effectiveCode),
    [effectiveCode]
  );
  const runStatusMetaByStableKey = useMemo(() => {
    const nextMeta = new Map();
    let acVisibleIndex = 0;
    let planVisibleIndex = 0;
    let currentAcVisibleIndex = null;
    let currentPlanVisibleIndex = null;

    serializedDocumentLineMap.forEach((lineMeta) => {
      if (lineMeta?.type !== 'item' || lineMeta.itemType !== 'check') {
        return;
      }

      const sectionTitle = effectiveDocumentSections?.[lineMeta.sectionIndex]?.title ?? '';
      const normalizedSectionTitle = sectionTitle.toLowerCase();

      if (normalizedSectionTitle === 'acceptance criteria') {
        if ((lineMeta.nestingLevel ?? 0) === 0) {
          currentAcVisibleIndex = acVisibleIndex;
          acVisibleIndex += 1;
        }

        if (!Number.isInteger(currentAcVisibleIndex) || currentAcVisibleIndex < 0) {
          return;
        }

        const originalIndex = mapVisibleIssueIndexToOriginal('ac', currentAcVisibleIndex, removedIssueIndices);
        nextMeta.set(lineMeta.stableKey, {
          kind: 'ac',
          visibleIndex: currentAcVisibleIndex,
          originalIndex,
          statusItem: acRunResult?.[currentAcVisibleIndex] ?? null,
        });
        return;
      }

      if (normalizedSectionTitle === 'plan') {
        if ((lineMeta.nestingLevel ?? 0) === 0) {
          currentPlanVisibleIndex = planVisibleIndex;
          planVisibleIndex += 1;
        }

        if (!Number.isInteger(currentPlanVisibleIndex) || currentPlanVisibleIndex < 0) {
          return;
        }

        const originalIndex = mapVisibleIssueIndexToOriginal('plan', currentPlanVisibleIndex, removedIssueIndices);
        nextMeta.set(lineMeta.stableKey, {
          kind: 'plan',
          visibleIndex: currentPlanVisibleIndex,
          originalIndex,
          statusItem: planRunResult?.[currentPlanVisibleIndex] ?? null,
        });
      }
    });

    return nextMeta;
  }, [acRunResult, effectiveDocumentSections, planRunResult, removedIssueIndices, serializedDocumentLineMap]);
  const rowMetaList = useMemo(() => {
    const sectionMetaByTitle = new Map(
      (effectiveDocumentSections ?? []).map((section) => [section.title.toLowerCase(), section.meta ?? null])
    );
    const hasNestedPlanChildren = matchedSerializedLineMetaByRow.some((lineMeta) => (
      lineMeta?.itemType === 'check'
      && (lineMeta?.nestingLevel ?? 0) > 0
      && (effectiveDocumentSections?.[lineMeta.sectionIndex]?.title ?? '').toLowerCase() === 'plan'
    ));
    let inAcSection = false;
    let inPlanSection = false;
    let currentSectionTitle = null;
    let acItemCount = 0;
    let planParentCount = 0;

    return displayRows.map((row, rowIndex) => {
      const line = row.line;
      const headingTitle = getDoneHeadingTitle(line);
      const sectionMeta = headingTitle ? sectionMetaByTitle.get(headingTitle.toLowerCase()) ?? null : null;
      const showRunIcon = shouldShowDoneRunIcon(line);
      const serializedLineMeta = matchedSerializedLineMetaByRow[rowIndex] ?? null;

      if (headingTitle !== null) {
        currentSectionTitle = headingTitle;
        inAcSection = headingTitle.toLowerCase() === 'acceptance criteria';
        inPlanSection = headingTitle.toLowerCase() === 'plan';
        if (inAcSection) {
          acItemCount = 0;
        }
        if (inPlanSection) {
          planParentCount = 0;
        }
      }

      const effectiveIsCheckLine = /^\s*-\s+\[([ x])\]\s+/i.test(line);
      const isTopLevelAcItem = Boolean(
        effectiveIsCheckLine
        && inAcSection
        && serializedLineMeta?.itemType === 'check'
        && (serializedLineMeta?.nestingLevel ?? 0) === 0
      );
      const isFirstTopLevelAcItem = isTopLevelAcItem && acItemCount === 0;
      if (isTopLevelAcItem) {
        acItemCount += 1;
      }
      const isTopLevelPlanParent = Boolean(
        effectiveIsCheckLine
        && inPlanSection
        && serializedLineMeta?.itemType === 'check'
        && (serializedLineMeta?.nestingLevel ?? 0) === 0
      );
      const isFirstTopLevelPlanParent = isTopLevelPlanParent && planParentCount === 0;
      if (isTopLevelPlanParent) {
        planParentCount += 1;
      }
      const isFlatTopLevelPlanParent = isTopLevelPlanParent && !hasNestedPlanChildren;
      const isNestedPlanChild = Boolean(
        effectiveIsCheckLine
        && inPlanSection
        && serializedLineMeta?.itemType === 'check'
        && (serializedLineMeta?.nestingLevel ?? 0) > 0
      );
      const isFirstNestedPlanChild = isNestedPlanChild && (
        Array.isArray(serializedLineMeta?.childPath)
          ? serializedLineMeta.childPath[serializedLineMeta.childPath.length - 1] === 0
          : false
      );
      let checkStatus = null;
      let planStatus = null;
      let checkTarget = null;
      let issueSeverity = null;
      let issueTarget = null;
      const statusMeta = serializedLineMeta?.stableKey
        ? (runStatusMetaByStableKey.get(serializedLineMeta.stableKey) ?? null)
        : null;
      const isDraftStatusOutdated = Boolean(
        effectiveIsCheckLine
        && statusMeta?.statusItem
        && normalizeSpecLineForComparison(line) !== normalizeSpecLineForComparison(serializedLineMeta?.sourceLine ?? line)
      );
      const displayStatusItem = statusMeta?.statusItem
        ? ((isDraftStatusOutdated || isRunStatusItemOutdated(statusMeta.statusItem))
            ? withRunStatusOutdated(statusMeta.statusItem)
            : statusMeta.statusItem)
        : null;
      const statusIssueSeverity = displayStatusItem?.issue?.severity ?? displayStatusItem?.status ?? null;

      if (effectiveIsCheckLine && inAcSection && statusMeta?.kind === 'ac') {
        const originalIndex = statusMeta.originalIndex;
        if (Number.isInteger(originalIndex)) {
          checkTarget = { kind: 'ac', index: originalIndex };
        }
        checkStatus = displayStatusItem;
        if (displayStatusItem && (statusIssueSeverity === 'warning' || statusIssueSeverity === 'failed' || statusIssueSeverity === 'error') && Number.isInteger(originalIndex)) {
          issueSeverity = statusIssueSeverity;
          issueTarget = { kind: 'ac', index: originalIndex };
        }
      }

      if (effectiveIsCheckLine && inPlanSection && statusMeta?.kind === 'plan') {
        const originalIndex = statusMeta.originalIndex;
        if (Number.isInteger(originalIndex)) {
          checkTarget = { kind: 'plan', index: originalIndex };
        }
        planStatus = displayStatusItem;
        if (displayStatusItem && (statusIssueSeverity === 'warning' || statusIssueSeverity === 'failed' || statusIssueSeverity === 'error') && Number.isInteger(originalIndex)) {
          issueSeverity = statusIssueSeverity;
          issueTarget = { kind: 'plan', index: originalIndex };
        }
      }

      const stableKey = serializedLineMeta?.stableKey
        ?? (row.isVirtual
          ? `virtual-row:${rowIndex}`
          : `raw-row:${row.rawIndex ?? rowIndex}`);

      return {
        rowIndex,
        stableKey,
        line,
        rawIndex: row.rawIndex,
        headingTitle,
        sectionMeta,
        showRunIcon,
        currentSectionTitle,
        nestingLevel: serializedLineMeta?.nestingLevel ?? 0,
        isTopLevelAcItem,
        isFirstTopLevelAcItem,
        isTopLevelPlanParent,
        isFirstTopLevelPlanParent,
        isFlatTopLevelPlanParent,
        isNestedPlanChild,
        isFirstNestedPlanChild,
        checkStatus,
        planStatus,
        checkTarget,
        issueSeverity,
        issueTarget,
      };
    });
  }, [displayRows, effectiveDocumentSections, matchedSerializedLineMetaByRow, runStatusMetaByStableKey]);
  const rowMetaByKey = useMemo(
    () => new Map(rowMetaList.map((rowMeta) => [rowMeta.stableKey, rowMeta])),
    [rowMetaList]
  );
  const getDoneRowLineNumber = useCallback((rowMeta) => {
    if (!rowMeta) return null;
    if (Number.isInteger(rowMeta.rawIndex)) return rowMeta.rawIndex + 1;
    if (Number.isInteger(rowMeta.rowIndex)) return rowMeta.rowIndex + 1;
    return null;
  }, []);
  const getDoneCommentFooterMetaLabel = useCallback((rowMeta, selectionSnapshot = null) => {
    const fallbackLabel = formatEditorCommentLineLabel([getDoneRowLineNumber(rowMeta)]);

    if (selectionSnapshot?.type === 'textarea') {
      return getTextareaEditorCommentLineLabel(selectionSnapshot) || fallbackLabel;
    }

    if (selectionSnapshot?.type !== 'range' || !selectionSnapshot.range || !scrollRef.current) {
      return fallbackLabel;
    }

    const selectedLineNumbers = [];
    const rowElements = Array.from(scrollRef.current.querySelectorAll('.spec-done-row[data-row-key]'));

    rowElements.forEach((rowElement) => {
      if (!(rowElement instanceof HTMLElement)) return;

      const rowKey = rowElement.dataset.rowKey;
      const selectedRowMeta = rowKey ? rowMetaByKey.get(rowKey) : null;
      if (!selectedRowMeta) return;

      const targetElement = rowElement.querySelector('.spec-done-row-content') ?? rowElement;
      try {
        if (selectionSnapshot.range.intersectsNode(targetElement)) {
          selectedLineNumbers.push(getDoneRowLineNumber(selectedRowMeta));
        }
      } catch {
        // The stored Range can become detached if the editor rerenders between mouse events.
      }
    });

    return formatEditorCommentLineLabel(selectedLineNumbers) || fallbackLabel;
  }, [getDoneRowLineNumber, rowMetaByKey]);
  const hydratedRowComments = useMemo(
    () => buildRowCommentsStateFromEntries(rowMetaList, persistedCommentEntries),
    [persistedCommentEntries, rowMetaList]
  );
  const hydratedRowCommentsSignature = useMemo(
    () => buildRowCommentsSignature(hydratedRowComments),
    [hydratedRowComments]
  );
  const [rowComments, setRowComments] = useState(() => hydratedRowComments);
  const rowCommentsSignature = useMemo(() => buildRowCommentsSignature(rowComments), [rowComments]);
  const lastHydratedCommentsSignatureRef = useRef(null);
  const baselineCommentSignatureRef = useRef(hydratedRowCommentsSignature);
  const baselineCommentSessionKeyRef = useRef(`${normalizedCode}::${commentResetToken}`);
  const highlightedProblemRowIndex = useMemo(() => {
    const rawIndex = highlightedProblemLocation?.rawIndex;
    if (!Number.isInteger(rawIndex)) return null;

    const matchingRow = rowMetaList.find((rowMeta) => rowMeta.rawIndex === rawIndex);
    return matchingRow?.rowIndex ?? null;
  }, [highlightedProblemLocation, rowMetaList]);
  const issueRowKeys = useMemo(() => (
    rowMetaList
      .filter((rowMeta) => (
        !resolvedProposalRowKeys.has(rowMeta.stableKey)
        && (
          rowMeta.issueSeverity === 'warning'
          || rowMeta.issueSeverity === 'failed'
          || rowMeta.issueSeverity === 'error'
        )
      ))
      .map((rowMeta) => rowMeta.stableKey)
  ), [resolvedProposalRowKeys, rowMetaList]);

  useEffect(() => {
    if (lastStoredBreakpointKeysSignatureRef.current === storedBreakpointKeysSignature) {
      return;
    }

    lastStoredBreakpointKeysSignatureRef.current = storedBreakpointKeysSignature;

    setBreakpoints((prev) => {
      const previousKeys = Array.from(prev).sort();
      if (areSortedStringArraysEqual(previousKeys, storedBreakpointKeys)) {
        return prev;
      }

      return new Set(storedBreakpointKeys);
    });
  }, [storedBreakpointKeys, storedBreakpointKeysSignature]);

  const scrollDoneRowIntoView = useCallback((rowIndex, behavior = 'smooth') => {
    if (!Number.isInteger(rowIndex)) return;

    const rowEl = scrollRef.current?.querySelector(`.spec-done-row[data-row-index="${rowIndex}"]`);
    if (!(rowEl instanceof HTMLElement)) return;

    rowEl.scrollIntoView({
      block: 'center',
      behavior,
    });
  }, []);

  const focusDoneRowEditable = useCallback((rowIndex) => {
    if (!Number.isInteger(rowIndex)) return;

    const editable = scrollRef.current?.querySelector(`.spec-done-row[data-row-index="${rowIndex}"] [contenteditable]`);
    if (!(editable instanceof HTMLElement)) return;

    editable.focus({ preventScroll: true });

    const selection = window.getSelection();
    if (!selection) return;

    const range = document.createRange();
    range.selectNodeContents(editable);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }, []);

  const navigateInspectionIssue = useCallback((direction) => {
    if (issueRowKeys.length === 0) return;

    const currentIssueRowKey = navigatedIssueRowKey ?? activeIssueRowKey;
    const currentIssueIndex = issueRowKeys.indexOf(currentIssueRowKey);
    let nextIssueIndex = 0;

    if (direction < 0) {
      nextIssueIndex = currentIssueIndex >= 0
        ? (currentIssueIndex - 1 + issueRowKeys.length) % issueRowKeys.length
        : issueRowKeys.length - 1;
    } else {
      nextIssueIndex = currentIssueIndex >= 0
        ? (currentIssueIndex + 1) % issueRowKeys.length
        : 0;
    }

    const targetRowKey = issueRowKeys[nextIssueIndex];
    const targetRowIndex = rowMetaByKey.get(targetRowKey)?.rowIndex;
    if (!Number.isInteger(targetRowIndex)) return;

    setIntentionPopup(null);
    setSelectionToolbarPos(null);
    setNavigatedIssueRowKey(targetRowKey);
    setActiveIssueRowKey(targetRowKey);
    scrollDoneRowIntoView(targetRowIndex);
    requestAnimationFrame(() => focusDoneRowEditable(targetRowIndex));
  }, [activeIssueRowKey, focusDoneRowEditable, issueRowKeys, navigatedIssueRowKey, rowMetaByKey, scrollDoneRowIntoView]);

  const getSelectionToolbarRowMeta = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return null;

    const anchorNode = selection.anchorNode;
    const anchorElement = anchorNode?.nodeType === Node.TEXT_NODE ? anchorNode.parentElement : anchorNode;
    if (!(anchorElement instanceof Element) || !scrollRef.current?.contains(anchorElement)) {
      return null;
    }

    const rowEl = anchorElement.closest('.spec-done-row');
    if (!(rowEl instanceof HTMLElement)) return null;

    const rowKey = rowEl.dataset.rowKey;
    if (typeof rowKey !== 'string' || !rowKey) return null;

    return rowMetaByKey.get(rowKey) ?? null;
  }, [rowMetaByKey]);

  const handleSelectionToolbarAction = useCallback((actionId, triggerRect) => {
    if (!triggerRect) return;

    const rowMeta = getSelectionToolbarRowMeta();
    if (!rowMeta) return;

    if (actionId === 'comment') {
      const selectionSnapshot = captureActiveEditorSelectionSnapshot();
      setIntentionPopup(null);
      setSelectionToolbarPos(null);
      setCommentPopup((prev) => (
        prev?.rowKey === rowMeta.stableKey
          ? null
          : {
              rowKey: rowMeta.stableKey,
              rowCommentKey: getRowMetaCommentStorageKey(rowMeta),
              rowIndex: rowMeta.rowIndex,
              rect: triggerRect,
              value: '',
              editingIndex: null,
              footerMetaLabel: '',
            }
      ));
      return;
    }

    if (actionId === 'suggest') {
      setCommentPopup(null);
      setSelectionToolbarPos(null);
      setActiveIssueRowKey(rowMeta.stableKey);
      setNavigatedIssueRowKey(rowMeta.stableKey);
      setIntentionPopup((prev) => (
        prev?.rowKey === rowMeta.stableKey
          ? null
          : {
              rowKey: rowMeta.stableKey,
              rowIndex: rowMeta.rowIndex,
              rect: triggerRect,
              severity: rowMeta.issueSeverity ?? 'warning',
              sectionTitle: rowMeta.currentSectionTitle,
              issueTarget: rowMeta.issueTarget,
            }
      ));
    }
  }, [getSelectionToolbarRowMeta]);

  const getShortcutCommentRowMeta = useCallback(() => {
    const selectionRowMeta = getSelectionToolbarRowMeta();
    if (selectionRowMeta) return selectionRowMeta;

    const activeElement = document.activeElement;
    if (activeElement instanceof Element && scrollRef.current?.contains(activeElement)) {
      const rowEl = activeElement.closest('.spec-done-row');
      const rowKey = rowEl instanceof HTMLElement ? rowEl.dataset.rowKey : null;
      if (rowKey && rowMetaByKey.has(rowKey)) {
        return rowMetaByKey.get(rowKey);
      }
    }

    const fallbackRowKey = focusedCommentRowKey ?? navigatedIssueRowKey ?? activeIssueRowKey ?? hoveredRowKey;
    return fallbackRowKey ? (rowMetaByKey.get(fallbackRowKey) ?? null) : null;
  }, [activeIssueRowKey, focusedCommentRowKey, getSelectionToolbarRowMeta, hoveredRowKey, navigatedIssueRowKey, rowMetaByKey]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (!event.altKey || !event.shiftKey || (event.code !== 'KeyK' && event.key.toLowerCase() !== 'k')) return;
      if (event.target instanceof Element && event.target.closest('.spec-done-comment-popup, .cmp-popup')) return;

      const rowMeta = getShortcutCommentRowMeta();
      if (!rowMeta?.stableKey) return;

      const rowEl = Array.from(scrollRef.current?.querySelectorAll('.spec-done-row') ?? [])
        .find((node) => node instanceof HTMLElement && node.dataset.rowKey === rowMeta.stableKey);
      const rect = rowEl instanceof HTMLElement ? rowEl.getBoundingClientRect() : null;
      if (!rect) return;

      const selectionSnapshot = captureActiveEditorSelectionSnapshot();
      event.preventDefault();
      event.stopPropagation();
      setIntentionPopup(null);
      setSelectionToolbarPos(null);
      setCommentPopup((prev) => (
        prev?.rowKey === rowMeta.stableKey
          ? null
          : {
              rowKey: rowMeta.stableKey,
              rowCommentKey: getRowMetaCommentStorageKey(rowMeta),
              rowIndex: rowMeta.rowIndex,
              rect,
              value: '',
              editingIndex: null,
              preserveEditorSelection: Boolean(selectionSnapshot),
              selectionSnapshot,
              footerMetaLabel: '',
            }
      ));
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [getShortcutCommentRowMeta]);

  const closeCommentPopup = useCallback((rowIndex = null) => {
    setCommentPopup(null);
    if (Number.isInteger(rowIndex)) {
      requestAnimationFrame(() => focusDoneRowEditable(rowIndex));
    }
  }, [focusDoneRowEditable]);

  const updateRowComments = useCallback((rowCommentKey, updater) => {
    if (typeof rowCommentKey !== 'string' || !rowCommentKey) return;

    setRowComments((prev) => {
      const currentComments = prev[rowCommentKey] ?? [];
      const nextComments = updater([...currentComments]);

      if (!nextComments || nextComments.length === 0) {
        if (!(rowCommentKey in prev)) return prev;
        const nextState = { ...prev };
        delete nextState[rowCommentKey];
        return nextState;
      }

      return {
        ...prev,
        [rowCommentKey]: nextComments,
      };
    });
  }, []);

  const updateEditedLinesState = useCallback(() => {
    const hasPendingLineEdits = normalizeSpecCodeForComparison(buildDoneOverlaySnapshotCode(draftCodeRef.current)) !== normalizedCode;
    setHasEditedLines((prev) => (prev === hasPendingLineEdits ? prev : hasPendingLineEdits));
    return hasPendingLineEdits;
  }, [normalizedCode]);

  const handleCommentSubmit = useCallback(() => {
    if (!commentPopup) return;

    const nextValue = commentPopup.value.trim();
    if (!nextValue) return;

    const { rowCommentKey, editingIndex, rowIndex } = commentPopup;
    const buildCommentEntry = (text) => text;
    if (Number.isInteger(editingIndex)) {
      updateRowComments(rowCommentKey, (comments) => comments.map((comment, index) => (
        index === editingIndex ? buildCommentEntry(nextValue, comment) : comment
      )));
    } else {
      updateRowComments(rowCommentKey, (comments) => [...comments, buildCommentEntry(nextValue)]);
    }

    closeCommentPopup(rowIndex);
  }, [closeCommentPopup, commentPopup, rowComments, updateRowComments]);

  const handleCommentDelete = useCallback((rowKey, rowCommentKey, commentIndex) => {
    updateRowComments(rowCommentKey, (comments) => comments.filter((_, index) => index !== commentIndex));
    setCommentPopup((prev) => {
      if (!prev || prev.rowKey !== rowKey) return prev;
      if (prev.editingIndex === commentIndex) {
        return { ...prev, value: '', editingIndex: null };
      }
      if (Number.isInteger(prev.editingIndex) && prev.editingIndex > commentIndex) {
        return { ...prev, editingIndex: prev.editingIndex - 1 };
      }
      return prev;
    });
  }, [updateRowComments]);

  const handleCommentEditStart = useCallback((rowKey, rowCommentKey, commentIndex) => {
    setCommentPopup((prev) => {
      if (!prev || prev.rowKey !== rowKey) return prev;
      return {
        ...prev,
        value: getStoredCommentText(rowComments[rowCommentKey]?.[commentIndex] ?? ''),
        editingIndex: commentIndex,
        footerMetaLabel: '',
      };
    });
  }, [rowComments]);

  const handleInlineCommentEditStart = useCallback((rowMeta, rowCommentKey, commentIndex) => {
    if (!rowMeta?.stableKey) return;

    const rowEl = Array.from(scrollRef.current?.querySelectorAll('.spec-done-row') ?? [])
      .find((node) => node instanceof HTMLElement && node.dataset.rowKey === rowMeta.stableKey);
    const rect = rowEl instanceof HTMLElement ? rowEl.getBoundingClientRect() : null;

    setCommentPopup({
      rowKey: rowMeta.stableKey,
      rowCommentKey,
      rowIndex: rowMeta.rowIndex,
      rect,
      value: getStoredCommentText(rowComments[rowCommentKey]?.[commentIndex] ?? ''),
      editingIndex: commentIndex,
      footerMetaLabel: '',
    });
  }, [rowComments]);

  const toggleBreakpoint = (rowKey) => {
    if (typeof rowKey !== 'string' || !rowKey) return;

    setBreakpoints(prev => {
      const next = new Set(prev);
      next.has(rowKey) ? next.delete(rowKey) : next.add(rowKey);
      return next;
    });
  };

  const applyDoneCompletion = (item) => {
    const editable = doneCmpEditableRef.current;
    const savedRange = doneCmpRangeRef.current;
    const query = doneCmpQueryRef.current;
    if (!editable || !savedRange) return;
    editable.focus();
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(savedRange);
    const range = savedRange.cloneRange();
    const deleteLen = query.length + 1; // '@' + query chars
    if (range.startContainer.nodeType === Node.TEXT_NODE && range.startOffset >= deleteLen) {
      range.setStart(range.startContainer, range.startOffset - deleteLen);
    }
    range.deleteContents();
    const span = document.createElement('span');
    span.className = 'spec-ref';
    span.textContent = `@${getCompletionInsertText(item)}`;
    range.insertNode(span);
    const space = document.createTextNode(' ');
    span.after(space);
    const newRange = document.createRange();
    newRange.setStart(space, 1);
    newRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(newRange);
    setDoneCmpPos(null);
    doneCmpEditableRef.current = null;
    doneCmpRangeRef.current = null;
    doneCmpQueryRef.current = '';
  };

  // Detect @ in contenteditable and show AddPopup
  useEffect(() => {
    if (lastHydratedCommentsSignatureRef.current === hydratedRowCommentsSignature) return;

    lastHydratedCommentsSignatureRef.current = hydratedRowCommentsSignature;

    if (hydratedRowCommentsSignature !== rowCommentsSignature) {
      setRowComments(hydratedRowComments);
    }
  }, [hydratedRowComments, hydratedRowCommentsSignature, rowCommentsSignature]);

  useEffect(() => {
    const nextBaselineSessionKey = `${normalizedCode}::${commentResetToken}`;
    if (baselineCommentSessionKeyRef.current === nextBaselineSessionKey) {
      return;
    }

    baselineCommentSessionKeyRef.current = nextBaselineSessionKey;
    baselineCommentSignatureRef.current = hydratedRowCommentsSignature;
  }, [commentResetToken, hydratedRowCommentsSignature, normalizedCode]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handleInput = () => {
      // Notify parent that the user is genuinely typing so any post-enhance
      // badge suppression can be lifted immediately.
      onUserInput?.();

      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) { setDoneCmpPos(null); return; }
      const anchor = sel.anchorNode;
      const node = anchor?.nodeType === Node.TEXT_NODE ? anchor.parentElement : anchor;
      const editable = node?.closest?.('[contenteditable]');
      if (!editable || !el.contains(editable)) { setDoneCmpPos(null); return; }
      const range = sel.getRangeAt(0).cloneRange();
      range.setStart(editable, 0);
      const textBefore = range.toString();
      const match = textBefore.match(/@(\w*)$/);
      if (match) {
        const query = match[1];
        const cursorRect = sel.getRangeAt(0).getBoundingClientRect();
        const POPUP_WIDTH = 300;
        const overflows = cursorRect.left + POPUP_WIDTH > window.innerWidth - 8;
        doneCmpEditableRef.current = editable;
        doneCmpRangeRef.current = sel.getRangeAt(0).cloneRange();
        doneCmpQueryRef.current = query;
        setDoneCmpSelectedIdx(0);
        setDoneCmpPos(overflows
          ? { top: cursorRect.bottom + 4, right: window.innerWidth - cursorRect.right, query }
          : { top: cursorRect.bottom + 4, left: cursorRect.left, query }
        );
      } else {
        setDoneCmpPos(null);
        doneCmpEditableRef.current = null;
        doneCmpRangeRef.current = null;
        doneCmpQueryRef.current = '';
      }

      const nextDraftCode = buildDoneOverlaySnapshotCode(draftCodeRef.current);
      setDraftCode((prev) => (
        normalizeSpecCodeForComparison(prev) === normalizeSpecCodeForComparison(nextDraftCode)
          ? prev
          : nextDraftCode
      ));
      updateEditedLinesState();
    };
    el.addEventListener('input', handleInput);
    return () => el.removeEventListener('input', handleInput);
  }, [onUserInput, updateEditedLinesState]);

  // Keyboard support for refPopupPos CompletionPopup
  useEffect(() => {
    if (!refPopupPos) return;
    const filtered = AT_COMPLETIONS.filter(item => item.label.toLowerCase().includes(refCmpQuery.toLowerCase())).slice(0, COMPLETION_POPUP_MAX_ITEMS);
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); setRefPopupPos(null); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); setRefCmpSelectedIdx(i => Math.min(i + 1, filtered.length - 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setRefCmpSelectedIdx(i => Math.max(i - 1, 0)); }
      else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const item = filtered[refCmpSelectedIdx];
        const selection = buildCompletionSelection(item);
        if (selection) {
          if (refSpanRef.current) refSpanRef.current.textContent = `@${getCompletionInsertText(selection)}`;
          setRefPopupPos(null);
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [refPopupPos, refCmpQuery, refCmpSelectedIdx]);

  // Keyboard support for doneCmpPos CompletionPopup
  useEffect(() => {
    if (!doneCmpPos) return;
    const filtered = AT_COMPLETIONS.filter(item => item.label.toLowerCase().includes((doneCmpPos.query ?? '').toLowerCase())).slice(0, COMPLETION_POPUP_MAX_ITEMS);
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); setDoneCmpPos(null); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); setDoneCmpSelectedIdx(i => Math.min(i + 1, filtered.length - 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setDoneCmpSelectedIdx(i => Math.max(i - 1, 0)); }
      else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const item = filtered[doneCmpSelectedIdx];
        const selection = buildCompletionSelection(item);
        if (selection) { applyDoneCompletion(selection); setDoneCmpPos(null); }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [doneCmpPos, doneCmpSelectedIdx]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handleRefClick = (e) => {
      const ref = e.target.closest('.spec-ref');
      if (!ref) return;
      const r = ref.getBoundingClientRect();
      const POPUP_WIDTH = 300;
      const overflows = r.left + POPUP_WIDTH > window.innerWidth - 8;
      refSpanRef.current = ref;
      setRefCmpQuery('');
      setRefCmpSelectedIdx(0);
      setRefPopupPos(overflows
        ? { top: r.bottom + 6, right: window.innerWidth - r.right }
        : { top: r.bottom + 6, left: r.left }
      );
    };
    el.addEventListener('click', handleRefClick);
    return () => el.removeEventListener('click', handleRefClick);
  }, []);

  // When the spec changes (Enhance, fix, etc.) prune overrides for rows that no
  // longer exist, but KEEP overrides for rows that are still in the document so
  // that deletions/clears survive an Enhance cycle.
  useEffect(() => {
    const validKeys = new Set(rowMetaList.map((m) => m.stableKey));
    setDeletedRowKeys((prev) => {
      const next = new Set([...prev].filter((k) => validKeys.has(k)));
      return next.size === prev.size ? prev : next;
    });
    setClearedRowKeys((prev) => {
      const next = new Set([...prev].filter((k) => validKeys.has(k)));
      return next.size === prev.size ? prev : next;
    });
    setResolvedProposalRowKeys((prev) => {
      const next = new Set([...prev].filter((k) => validKeys.has(k)));
      return next.size === prev.size ? prev : next;
    });
  }, [rowMetaList]);


  // After deletedRowKeys changes, move focus to the next row
  useEffect(() => {
    const key = pendingFocusNextRowKeyRef.current;
    if (!key) return;
    pendingFocusNextRowKeyRef.current = null;
    const frame = requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (!el) return;
      const row = el.querySelector(`.spec-done-row[data-row-key="${CSS.escape(key)}"]`);
      const editable = row?.querySelector('[contenteditable]');
      if (editable instanceof HTMLElement) editable.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [deletedRowKeys]);

  // After clearedRowKeys changes (prefix stripped), restore focus to the now-empty editable
  useEffect(() => {
    const key = pendingFocusRowKeyRef.current;
    if (!key) return;
    pendingFocusRowKeyRef.current = null;
    // Wait one frame for React to finish painting the new empty-line element
    const frame = requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (!el) return;
      const row = el.querySelector(`.spec-done-row[data-row-key="${CSS.escape(key)}"]`);
      const editable = row?.querySelector('[contenteditable]');
      if (editable instanceof HTMLElement) editable.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [clearedRowKeys]);

  // Backspace on empty row → delete row; clear content → strip prefix/checkbox
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const handleKeydown = (e) => {
      if (e.key !== 'Backspace') return;
      const editable = e.target instanceof HTMLElement ? e.target.closest('[contenteditable]') : null;
      if (!editable || !el.contains(editable)) return;
      if ((editable.textContent ?? '').length > 0) return; // still has content
      e.preventDefault();
      const row = editable.closest('.spec-done-row');
      const stableKey = typeof row?.dataset.rowKey === 'string' ? row.dataset.rowKey : null;
      if (stableKey) {
        // Find the next visible row to move focus to after deletion
        let next = row.nextElementSibling;
        while (next && (next.dataset.deleted === 'true' || getComputedStyle(next).display === 'none')) {
          next = next.nextElementSibling;
        }
        pendingFocusNextRowKeyRef.current = typeof next?.dataset.rowKey === 'string' ? next.dataset.rowKey : null;
        setDeletedRowKeys((prev) => { const s = new Set(prev); s.add(stableKey); return s; });
      }
    };

    const handleInput = (e) => {
      const editable = e.target instanceof HTMLElement ? e.target.closest('[contenteditable]') : null;
      if (!editable || !el.contains(editable)) return;
      if ((editable.textContent ?? '').length > 0) return; // not yet empty
      const row = editable.closest('.spec-done-row');
      const stableKey = typeof row?.dataset.rowKey === 'string' ? row.dataset.rowKey : null;
      if (!stableKey) return;
      // Only strip prefix from check/bullet rows (those with a status or checkbox element)
      const hasPrefixEl = Boolean(row.querySelector('.spec-check-status, .spec-done-checkbox, .plan-status-icon'));
      if (hasPrefixEl) {
        // Remember this row so we can restore focus after the re-render replaces the element
        pendingFocusRowKeyRef.current = stableKey;
        setClearedRowKeys((prev) => { const next = new Set(prev); next.add(stableKey); return next; });
      }
    };

    el.addEventListener('keydown', handleKeydown);
    el.addEventListener('input', handleInput);
    return () => {
      el.removeEventListener('keydown', handleKeydown);
      el.removeEventListener('input', handleInput);
    };
  }, [normalizedCode]);

  useEffect(() => {
    if (!intentionPopup) return;
    if (activeIssueRowKey === null || intentionPopup.rowKey !== activeIssueRowKey || !rowMetaByKey.has(intentionPopup.rowKey)) {
      setIntentionPopup(null);
    }
  }, [activeIssueRowKey, intentionPopup, rowMetaByKey]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let frameId = 0;
    const clearHighlights = () => {
      el.querySelectorAll('.spec-done-active-line').forEach((node) => node.classList.remove('spec-done-active-line'));
    };
    const updateSelectionUi = () => {
      clearHighlights();

      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) {
        setActiveIssueRowKey(null);
        setNavigatedIssueRowKey(null);
        setFocusedCommentRowKey(null);
        setSelectionToolbarPos(null);
        return;
      }

      const anchorNode = selection.anchorNode;
      const focusNode = selection.focusNode;
      const anchorElement = anchorNode?.nodeType === Node.TEXT_NODE ? anchorNode.parentElement : anchorNode;
      const focusElement = focusNode?.nodeType === Node.TEXT_NODE ? focusNode.parentElement : focusNode;

      if (!anchorElement || !focusElement || !el.contains(anchorElement) || !el.contains(focusElement)) {
        setActiveIssueRowKey(null);
        setNavigatedIssueRowKey(null);
        setFocusedCommentRowKey(null);
        setSelectionToolbarPos(null);
        return;
      }

      const anchorEditable = anchorElement.closest('[contenteditable]');
      if (!anchorEditable) {
        setActiveIssueRowKey(null);
        setNavigatedIssueRowKey(null);
        setFocusedCommentRowKey(null);
        setSelectionToolbarPos(null);
        return;
      }

      const activeRow = anchorEditable.closest('.spec-done-row');
      activeRow?.classList.add('spec-done-active-line');
      const activeRowSeverity = activeRow?.dataset.issueSeverity;
      const activeRowKey = typeof activeRow?.dataset.rowKey === 'string' ? activeRow.dataset.rowKey : null;
      const activeInlineInspection = getClosestInlineInspectionElement(anchorElement);
      const nextActiveIssueRowKey =
        activeInlineInspection
        && (
          activeRowSeverity === 'warning'
          || activeRowSeverity === 'failed'
          || activeRowSeverity === 'error'
        )
          ? activeRowKey
          : null;
      setActiveIssueRowKey(nextActiveIssueRowKey);
      setNavigatedIssueRowKey(null);
      const nextFocusedCommentRowKey =
        selection.isCollapsed &&
        anchorEditable instanceof HTMLElement &&
        anchorEditable.matches(':focus, :focus-within')
          ? activeRowKey
          : null;
      setFocusedCommentRowKey(nextFocusedCommentRowKey);

      if (selection.isCollapsed || !selection.toString().trim()) {
        setSelectionToolbarPos(null);
        return;
      }

      const range = selection.getRangeAt(0);
      const rect = getRangeViewportRect(range);
      if (!rect || rect.bottom <= 0 || rect.top >= window.innerHeight) {
        setSelectionToolbarPos(null);
        return;
      }

      setSelectionToolbarPos(getSelectionToolbarPosition(rect));
    };
    const scheduleSelectionUiUpdate = () => {
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(updateSelectionUi);
    };

    document.addEventListener('selectionchange', scheduleSelectionUiUpdate);
    el.addEventListener('scroll', scheduleSelectionUiUpdate, { passive: true });
    window.addEventListener('resize', scheduleSelectionUiUpdate);

    return () => {
      window.cancelAnimationFrame(frameId);
      document.removeEventListener('selectionchange', scheduleSelectionUiUpdate);
      el.removeEventListener('scroll', scheduleSelectionUiUpdate);
      window.removeEventListener('resize', scheduleSelectionUiUpdate);
      clearHighlights();
      setActiveIssueRowKey(null);
      setNavigatedIssueRowKey(null);
      setFocusedCommentRowKey(null);
    };
  }, []);

  const hiddenInlineCommentEntries = useMemo(
    () => normalizeSpecVersionCommentEntries(persistedCommentEntries).filter((entry) => entry.hideInlineInDocument),
    [persistedCommentEntries],
  );
  const hiddenInlineCommentCount = useMemo(
    () => hiddenInlineCommentEntries.reduce((sum, entry) => (
      sum + (Array.isArray(entry.comments) ? entry.comments.length : 0)
    ), 0),
    [hiddenInlineCommentEntries],
  );
  const totalCommentCount = hiddenInlineCommentCount + Object.values(rowComments).reduce(
    (sum, comments) => sum + (Array.isArray(comments) ? comments.length : 0),
    0,
  );
  const hasPendingEnhanceChanges = hasEditedLines;
  const commentEntries = useMemo(() => [
    ...hiddenInlineCommentEntries,
    ...rowMetaList.reduce((entries, rowMeta) => {
    const rowCommentKey = getRowMetaCommentStorageKey(rowMeta);
    const comments = rowComments[rowCommentKey] ?? [];
    if (comments.length === 0) return entries;

    entries.push({
      rowStableKey: rowMeta.stableKey,
      rowIndex: rowMeta.rowIndex,
      rawIndex: rowMeta.rawIndex,
      line: rowMeta.line,
      sectionTitle: rowMeta.currentSectionTitle,
      checkTarget: rowMeta.checkTarget,
      issueSeverity: rowMeta.issueSeverity,
      issueTarget: rowMeta.issueTarget,
      comments: [...comments],
    });

    return entries;
  }, []),
  ], [hiddenInlineCommentEntries, rowComments, rowMetaList]);
  const commentEntriesSignature = useMemo(
    () => buildSpecVersionCommentEntriesSignature(commentEntries),
    [commentEntries],
  );
  const inspectionCommentCount = useMemo(() => (
    getAggregatedCommentIssueCount(commentEntries, relatedCommentIssues)
  ), [commentEntries, relatedCommentIssues]);
  const externalSpecCommentIssues = useMemo(
    () => buildCommentIssuesFromEntryDiffComments(commentEntries),
    [commentEntries],
  );
  const hasExternalSpecComments = externalSpecCommentIssues.length > 0;
  const lastEmittedCommentsSignatureRef = useRef(null);
  const commentedPlanOriginalIndices = useMemo(() => {
    const nextIndices = new Set();

    commentEntries.forEach((entry) => {
      const normalizedTarget = normalizeCommentTarget(entry?.checkTarget) ?? normalizeCommentTarget(entry?.issueTarget);
      if (normalizedTarget?.kind === 'plan' && Number.isInteger(normalizedTarget.index)) {
        nextIndices.add(normalizedTarget.index);
      }
    });

    return nextIndices;
  }, [commentEntries]);

  useEffect(() => {
    onCommentCountChange?.(inspectionCommentCount);
  }, [inspectionCommentCount, onCommentCountChange]);

  useEffect(() => {
    if (lastEmittedCommentsSignatureRef.current === commentEntriesSignature) return;
    lastEmittedCommentsSignatureRef.current = commentEntriesSignature;
    onCommentsChange?.(commentEntries);
  }, [commentEntries, commentEntriesSignature, onCommentsChange]);

  useEffect(() => {
    let frameId = requestAnimationFrame(() => {
      updateEditedLinesState();
    });

    return () => {
      if (frameId) cancelAnimationFrame(frameId);
    };
  }, [displayRows.length, updateEditedLinesState]);

  useEffect(() => {
    if (!hasPendingEnhanceChanges) {
      onPendingEnhanceStateChange?.(false);
      return;
    }
    // Debounce `true` to filter out transient firings from the morph animation.
    // Real user edits stay `true` for longer and will pass through.
    const timer = setTimeout(() => {
      onPendingEnhanceStateChange?.(true);
    }, 400);
    return () => clearTimeout(timer);
  }, [hasPendingEnhanceChanges, onPendingEnhanceStateChange]);

  useEffect(() => () => {
    onPendingEnhanceStateChange?.(false);
  }, [onPendingEnhanceStateChange]);

  useEffect(() => {
    onUiStateChange?.({
      breakpointKeys,
    });
  }, [breakpointKeys, onUiStateChange]);

  useEffect(() => {
    setBreakpoints((prev) => {
      const validKeys = new Set(rowMetaList.map((rowMeta) => rowMeta.stableKey));
      const next = new Set(Array.from(prev).filter((rowKey) => validKeys.has(rowKey)));
      if (next.size === prev.size && Array.from(prev).every((rowKey) => next.has(rowKey))) {
        return prev;
      }
      return next;
    });

    if (commentPopup?.rowKey && !rowMetaByKey.has(commentPopup.rowKey)) {
      setCommentPopup(null);
    }

    if (intentionPopup?.rowKey && !rowMetaByKey.has(intentionPopup.rowKey)) {
      setIntentionPopup(null);
    }

    if (activeIssueRowKey && (!rowMetaByKey.has(activeIssueRowKey) || resolvedProposalRowKeys.has(activeIssueRowKey))) {
      setActiveIssueRowKey(null);
    }

    if (navigatedIssueRowKey && (!rowMetaByKey.has(navigatedIssueRowKey) || resolvedProposalRowKeys.has(navigatedIssueRowKey))) {
      setNavigatedIssueRowKey(null);
    }

    if (hoveredIssueRowKey && (!rowMetaByKey.has(hoveredIssueRowKey) || resolvedProposalRowKeys.has(hoveredIssueRowKey))) {
      setHoveredIssueRowKey(null);
    }

    if (focusedCommentRowKey && !rowMetaByKey.has(focusedCommentRowKey)) {
      setFocusedCommentRowKey(null);
    }
  }, [
    activeIssueRowKey,
    commentPopup?.rowKey,
    focusedCommentRowKey,
    hoveredIssueRowKey,
    intentionPopup?.rowKey,
    navigatedIssueRowKey,
    resolvedProposalRowKeys,
    rowMetaByKey,
    rowMetaList,
  ]);

  useEffect(() => {
    setActiveIssueRowKey(null);
    setNavigatedIssueRowKey(null);
    setHoveredIssueRowKey(null);
    setResolvedProposalRowKeys(new Set());
    setFocusedCommentRowKey(null);
    setCommentPopup(null);
    setIntentionPopup(null);
  }, [displayRows.length]);

  const previousCommentResetTokenRef = useRef(commentResetToken);
  useEffect(() => {
    if (previousCommentResetTokenRef.current === commentResetToken) {
      return;
    }

    previousCommentResetTokenRef.current = commentResetToken;

    baselineCommentSessionKeyRef.current = `${normalizedCode}::${commentResetToken}`;
    baselineCommentSignatureRef.current = buildRowCommentsSignature({});
    setRowComments({});
    setDeletedRowKeys(new Set());
    setClearedRowKeys(new Set());
    setResolvedProposalRowKeys(new Set());
    setHasEditedLines(false);
    setCommentPopup(null);
    setSelectionToolbarPos(null);
    setActiveIssueRowKey(null);
    setNavigatedIssueRowKey(null);
    setHoveredIssueRowKey(null);
    setFocusedCommentRowKey(null);
    pendingFocusRowKeyRef.current = null;
    pendingFocusNextRowKeyRef.current = null;
  }, [commentResetToken, normalizedCode]);

  useEffect(() => {
    if (!Number.isInteger(highlightedProblemRowIndex)) return undefined;

    let frameId = 0;

    frameId = requestAnimationFrame(() => {
      scrollDoneRowIntoView(highlightedProblemRowIndex);
    });

    return () => {
      if (frameId) cancelAnimationFrame(frameId);
    };
  }, [highlightedProblemRowIndex, highlightedProblemLocation?.requestKey, scrollDoneRowIntoView]);

  return (
    <>
    <div className={`spec-done-overlay${shouldRenderSuccessBanner ? ' has-top-banner has-success-banner' : ''}`}>
      {shouldRenderSuccessBanner && (
        <DoneSuccessBanner
          message={successBannerMessage}
          onAddToProjectContext={projectContextFile
            ? () => {
                onAddToProjectContext?.(projectContextFile);
                setProjectContextBannerDismissed(true);
              }
            : null}
        />
      )}
      <DoneInspectionWidget
        onOpenProblems={onOpenProblems}
        onNavigatePreviousIssue={() => navigateInspectionIssue(-1)}
        onNavigateNextIssue={() => navigateInspectionIssue(1)}
        warningCount={inspectionSummary?.warningCount ?? 0}
        errorCount={inspectionSummary?.errorCount ?? 0}
        commentCount={inspectionCommentCount}
        hasExternalComments={hasExternalSpecComments}
        versions={versionHistory?.versions ?? []}
        onVersionSelect={onOpenVersionDiff}
      />
      <div className="spec-done-scroll" data-overlay-scroll-body="true" ref={scrollRef}>
        {rowMetaList.map((rowMeta) => {
            const {
              rowIndex,
              stableKey,
              line,
              headingTitle,
              sectionMeta,
              showRunIcon,
              currentSectionTitle,
              checkStatus,
              planStatus,
              checkTarget,
              issueSeverity,
              issueTarget,
            } = rowMeta;
            // Row deleted by user — render invisible ghost so snapshot can record empty line
            if (deletedRowKeys.has(stableKey)) {
              return (
                <div
                  key={stableKey}
                  className="spec-done-row"
                  data-row-key={stableKey}
                  data-raw-index={Number.isInteger(rowMeta.rawIndex) ? rowMeta.rawIndex : undefined}
                  data-deleted="true"
                  style={{ display: 'none' }}
                />
              );
            }

            // Row cleared (prefix/checkbox stripped) — treat as empty line
            const isProposalResolved = resolvedProposalRowKeys.has(stableKey);
            const effectiveLine = clearedRowKeys.has(stableKey) ? '' : rowMeta.line;
            const effectiveCheckStatus = clearedRowKeys.has(stableKey) ? null : checkStatus;
            const effectivePlanStatus = clearedRowKeys.has(stableKey) ? null : planStatus;
            const effectiveIssueSeverity = clearedRowKeys.has(stableKey) || isProposalResolved ? null : issueSeverity;
            const effectiveIssueTarget = clearedRowKeys.has(stableKey) || isProposalResolved ? null : issueTarget;
            const effectiveCheckTarget = clearedRowKeys.has(stableKey) ? null : checkTarget;
            const isRunOutdated = Boolean(effectiveCheckStatus?.isOutdated || effectivePlanStatus?.isOutdated);

            const rowCommentKey = getRowMetaCommentStorageKey(rowMeta);
            const isIssuePopupOpen = intentionPopup?.rowKey === stableKey;
            const isCommentPopupOpen = commentPopup?.rowKey === stableKey;
            const isNavigatedIssueRow = navigatedIssueRowKey === stableKey;
            const isHoveredIssueRow = hoveredIssueRowKey === stableKey;
            const hasIssueBulb = Boolean(effectiveIssueSeverity);
            const showIssueBulb = hasIssueBulb
              && (activeIssueRowKey === stableKey || isHoveredIssueRow || isNavigatedIssueRow || isIssuePopupOpen);
            const hasRunnableGutterAction = showRunIcon || Boolean(effectiveCheckTarget);
            const showIssueLineHighlight = Boolean(effectiveIssueSeverity) && (activeIssueRowKey === stableKey || isHoveredIssueRow || isNavigatedIssueRow || isIssuePopupOpen);
            const commentsForRow = rowComments[rowCommentKey] ?? [];
            const commentCount = commentsForRow.length;
            const rowLineLabel = formatEditorCommentLineLabel([getDoneRowLineNumber(rowMeta)]);
            const hasPlanComment = effectiveCheckTarget?.kind === 'plan'
              && Number.isInteger(effectiveCheckTarget.index)
              && commentedPlanOriginalIndices.has(effectiveCheckTarget.index);
            const isEmptyLine = !effectiveLine.trim();
            const demoTargetId = formatDemoTargetId(effectiveIssueTarget ?? effectiveCheckTarget);
            const showCommentAdornment = commentCount > 0 || isCommentPopupOpen
              || hoveredRowKey === stableKey
              || activeIssueRowKey === stableKey
              || isNavigatedIssueRow;
            const isProblemHighlightedRow = highlightedProblemRowIndex === rowIndex;
            const commentAdornment = showCommentAdornment ? (
              <DoneCommentAdornment
                comments={commentsForRow}
                isOpen={isCommentPopupOpen}
                demoId={demoTargetId ? `spec-comment-${demoTargetId}` : null}
                onOpen={(rect, options = {}) => {
                  setCommentPopup((prev) => (
                    prev?.rowKey === stableKey
                      ? null
                      : {
                          rowKey: stableKey,
                          rowCommentKey,
                          rowIndex,
                          rect,
                          value: '',
                          editingIndex: null,
                          preserveEditorSelection: Boolean(options.preserveEditorSelection),
                          selectionSnapshot: options.selectionSnapshot ?? null,
                          footerMetaLabel: '',
                        }
                  ));
                }}
              />
            ) : null;
            const commentThreadGroups = commentCount > 0
              ? [{
                  label: commentContextLabel,
                  icon: 'fileTypes/markdown',
                  sessionLabel: 'Document',
                  messageId: null,
                  chatId: null,
                  comments: commentsForRow.map((comment, commentIndex) => ({
                    ...((comment && typeof comment === 'object') ? comment : {}),
                    text: getStoredCommentText(comment),
                    lineLabel: '',
                    editable: true,
                    localIndex: commentIndex,
                  })),
                }]
              : null;
            return (
            <Fragment key={stableKey}>
            <div
              className={`spec-done-row${rowMeta.isTopLevelAcItem ? ' spec-done-row-ac-item' : ''}${rowMeta.isFirstTopLevelAcItem ? ' spec-done-row-ac-item-first' : ''}${rowMeta.isTopLevelPlanParent ? ' spec-done-row-plan-parent' : ''}${rowMeta.isFirstTopLevelPlanParent ? ' spec-done-row-plan-parent-first' : ''}${rowMeta.isFlatTopLevelPlanParent ? ' spec-done-row-plan-parent-flat' : ''}${rowMeta.isNestedPlanChild ? ' spec-done-row-plan-child' : ''}${rowMeta.isFirstNestedPlanChild ? ' spec-done-row-plan-child-first' : ''}${showIssueLineHighlight ? ' spec-done-issue-row' : ''}${isProblemHighlightedRow ? ' spec-done-problems-row' : ''}${isRunOutdated ? ' spec-done-run-outdated-row' : ''}`}
              data-row-index={rowIndex}
              data-row-key={stableKey}
              data-demo-id={demoTargetId ? `spec-row-${demoTargetId}` : undefined}
              data-raw-index={Number.isInteger(rowMeta.rawIndex) ? rowMeta.rawIndex : undefined}
              data-issue-severity={effectiveIssueSeverity ?? ''}
              data-run-outdated={isRunOutdated ? 'true' : undefined}
              data-cleared={clearedRowKeys.has(stableKey) ? 'true' : undefined}
              onMouseEnter={() => setHoveredRowKey(stableKey)}
              onMouseMove={(event) => {
                const nextHoveredIssueRowKey =
                  effectiveIssueSeverity && getClosestInlineInspectionElement(event.target)
                    ? stableKey
                    : null;
                setHoveredIssueRowKey((prev) => (
                  prev === nextHoveredIssueRowKey ? prev : nextHoveredIssueRowKey
                ));
              }}
              onMouseLeave={() => {
                setHoveredRowKey(null);
                setHoveredIssueRowKey((prev) => (prev === stableKey ? null : prev));
              }}
              onClick={(e) => {
                if (e.target.closest('.spec-done-comment-adornment') || e.target.closest('.spec-done-gutter-intention-btn') || e.target.closest('.spec-done-gutter-item-run-btn') || e.target.closest('.spec-done-gutter-breakpoint-btn')) {
                  return;
                }

                if (isEmptyLine) {
                  // Focus the caret editable when clicking anywhere in the empty row.
                  const editable = e.currentTarget.querySelector('.spec-done-line-empty-editable');
                  editable?.focus();
                  return;
                }

                const targetEditable = e.target instanceof Element
                  ? e.target.closest('[contenteditable]')
                  : null;
                if (targetEditable instanceof HTMLElement) {
                  targetEditable.focus({ preventScroll: true });
                } else {
                  focusDoneRowEditable(rowIndex);
                }

                if (effectiveIssueSeverity && getClosestInlineInspectionElement(e.target)) {
                  setActiveIssueRowKey(stableKey);
                  setNavigatedIssueRowKey(stableKey);
                } else {
                  setActiveIssueRowKey((prev) => (prev === stableKey ? null : prev));
                  setNavigatedIssueRowKey((prev) => (prev === stableKey ? null : prev));
                }
              }}
            >
              <div className={`editor-gutter-row spec-done-gutter-cell${showRunIcon ? ' spec-done-gutter-cell-section-run' : ''}`}>
                <button
                  type="button"
                  className={`spec-done-gutter-breakpoint-btn${breakpoints.has(stableKey) ? ' is-active' : ''}`}
                  aria-label={breakpoints.has(stableKey) ? 'Remove breakpoint' : 'Add breakpoint'}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    toggleBreakpoint(stableKey);
                  }}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleBreakpoint(stableKey); } }}
                >
                  <span className="editor-breakpoint-dot" />
                </button>
                {hasRunnableGutterAction ? (
                  <DoneInlineRunButton
                    demoId={demoTargetId ? `spec-run-${demoTargetId}` : null}
                    title={showRunIcon ? 'Open Terminal' : (effectiveCheckTarget?.kind === 'ac' ? 'Build acceptance criterion' : 'Build plan item')}
                    onRun={() => onOpenTerminal?.(showRunIcon
                      ? {
                          sectionTitle: headingTitle,
                          commentEntries,
                        }
                      : {
                          sectionTitle: currentSectionTitle,
                          checkTarget: effectiveCheckTarget,
                        })}
                  />
                ) : (
                  <span className="spec-done-gutter-slot" aria-hidden="true" />
                )}
                {showIssueBulb ? (
                  <button
                    type="button"
                    className={`spec-done-gutter-intention-btn${isIssuePopupOpen ? ' is-open' : ''}`}
                    aria-label="Open issue actions"
                    data-demo-id={demoTargetId ? `spec-issue-actions-${demoTargetId}` : undefined}
                    aria-haspopup="menu"
                    aria-expanded={isIssuePopupOpen}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                    }}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      const rect = event.currentTarget.getBoundingClientRect();
                      setActiveIssueRowKey(stableKey);
                      setNavigatedIssueRowKey(stableKey);
                      setIntentionPopup((prev) => (
                        prev?.rowKey === stableKey
                          ? null
                          : {
                              rowKey: stableKey,
                              rowIndex,
                              rect,
                              severity: issueSeverity,
                              sectionTitle: currentSectionTitle,
                              issueTarget,
                            }
                      ));
                    }}
                  >
                    <Icon name="codeInsight/intentionBulb" size={16} />
                  </button>
                ) : commentAdornment ? (
                  <span className="spec-done-gutter-comment-slot">
                    {commentAdornment}
                  </span>
                ) : (
                  <span className="spec-done-gutter-slot" aria-hidden="true" />
                )}
              </div>
              <div
                className="spec-done-row-content"
                data-cleared={clearedRowKeys.has(stableKey) ? 'true' : undefined}
              >
                {renderDoneLine(
                  effectiveLine,
                  `line-${stableKey}`,
                  addPopupFiles,
                  attachedFiles,
                  effectiveCheckStatus,
                  sectionMeta,
                  effectivePlanStatus,
                  showIssueLineHighlight,
                  null,
                  effectiveIssueTarget,
                  onOpenDiffTab,
                  effectiveCheckTarget,
                  currentSectionTitle,
                  activeRunRequest,
                  rowMeta.nestingLevel ?? 0,
                  rowMeta.isFirstTopLevelAcItem ? () => addExtraDecisionItem('AC1 rephrased: scope narrowed to post-submission filtering. Live filtering would require AJAX - deferred') : null,
                  (decision) => {
                    if (decision === 'accept') {
                      setResolvedProposalRowKeys((prev) => {
                        if (prev.has(stableKey)) return prev;
                        const next = new Set(prev);
                        next.add(stableKey);
                        return next;
                      });
                      if (activeIssueRowKey === stableKey) {
                        setActiveIssueRowKey(null);
                      }
                      if (navigatedIssueRowKey === stableKey) {
                        setNavigatedIssueRowKey(null);
                      }
                      if (intentionPopup?.rowKey === stableKey) {
                        setIntentionPopup(null);
                      }
                    }
                    onUserInput?.();
                  },
                  hasPlanComment,
                  onOpenCheckChip,
                )}
              </div>
            </div>
            {commentThreadGroups && (
              <div
                className="spec-done-row spec-done-row-comment"
                data-row-key={`${stableKey}:comments`}
                data-comment-row-for={stableKey}
              >
                <div className="editor-gutter-row spec-done-gutter-cell spec-done-comment-thread-gutter" />
                <div className="spec-done-row-content spec-done-comment-thread-content">
                  <div className="plan-diff-inline-comment spec-done-inline-comment-thread">
                    <DiffInlineCommentPopup
                      comments={[]}
                      commentGroups={commentThreadGroups}
                      value=""
                      editingIndex={null}
                      showCompose={false}
                      commentContextLabel={commentContextLabel}
                      commentContextIcon="fileTypes/markdown"
                      commentContextSessionLabel={commentContextSessionLabel}
                      onStartEdit={(commentIndex) => handleInlineCommentEditStart(rowMeta, rowCommentKey, commentIndex)}
                      onDelete={(commentIndex) => handleCommentDelete(stableKey, rowCommentKey, commentIndex)}
                      onCancel={() => {}}
                      onSubmit={() => {}}
                    />
                  </div>
                </div>
              </div>
            )}
            {headingTitle?.toLowerCase() === 'decisions' && extraDecisionItems.map((item, i) => (
              <div key={`extra-decision-${i}`} className="spec-done-row">
                <div className="editor-gutter-row spec-done-gutter-cell" />
                <div className="spec-done-row-content">
                  <div className="spec-done-line spec-done-line-bullet">
                    <span className="spec-done-bullet">•</span>
                    <span contentEditable suppressContentEditableWarning>{item}</span>
                  </div>
                </div>
              </div>
            ))}
          </Fragment>
        );
        })}
        {externalSpecCommentIssues.length > 0 && (
          <div className="spec-external-comments-section">
            <div className="spec-external-comments-header">
              <ProblemsCommentNodeIcon />
              <span className="spec-external-comments-title">Comments</span>
              <span className="spec-external-comments-count">{externalSpecCommentIssues.length}</span>
            </div>
            <div className="spec-external-comments-list">
              {externalSpecCommentIssues.map((issue, index) => {
                const normalizedIssue = {
                  ...issue,
                  rawIndex: Number.isInteger(issue?.rawIndex)
                    ? issue.rawIndex
                    : (Number.isInteger(issue?.lineNumber) && issue.lineNumber > 0 ? issue.lineNumber - 1 : null),
                };
                const display = getProblemsCommentNodeDisplay(normalizedIssue, commentContextLabel);
                const sourceLabel = getCommentIssueSourceLabelWithoutLine(normalizedIssue);
                const itemKey = normalizedIssue.id ?? `external-comment-${index}`;

                return (
                  <button
                    type="button"
                    key={itemKey}
                    className="spec-external-comments-item"
                    onClick={() => onOpenCommentSource?.(normalizedIssue)}
                  >
                    <span className="spec-external-comments-item-icon">
                      {normalizedIssue.icon ?? <ProblemsCommentNodeIcon />}
                    </span>
                    <span className="spec-external-comments-item-body">
                      <span className="spec-external-comments-item-title">{display.label}</span>
                      {sourceLabel && (
                        <span className="spec-external-comments-item-meta">{sourceLabel}</span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
    {refPopupPos && createPortal(
      <>
        <div className="add-popup-overlay" onMouseDown={() => setRefPopupPos(null)} />
        <CompletionPopup
          trigger="@"
          query={refCmpQuery}
          selectedIdx={refCmpSelectedIdx}
          onSelect={(item) => {
            if (refSpanRef.current) refSpanRef.current.textContent = `@${getCompletionInsertText(item)}`;
            setRefPopupPos(null);
          }}
          onClose={() => setRefPopupPos(null)}
          style={{ position: 'fixed', top: refPopupPos.top, left: refPopupPos.left }}
        />
      </>,
      document.body
    )}
    {doneCmpPos && createPortal(
      <>
        <div className="add-popup-overlay" onMouseDown={() => setDoneCmpPos(null)} />
        <CompletionPopup
          trigger="@"
          query={doneCmpPos.query ?? ''}
          selectedIdx={doneCmpSelectedIdx}
          onSelect={(item) => { applyDoneCompletion(item); setDoneCmpPos(null); }}
          onClose={() => setDoneCmpPos(null)}
          style={{ position: 'fixed', top: doneCmpPos.top, left: doneCmpPos.left, right: doneCmpPos.right }}
        />
      </>,
      document.body
    )}
    {commentPopup && (
      <PositionedPopup triggerRect={commentPopup.rect} onDismiss={() => closeCommentPopup()} gap={8}>
        <DoneCommentPopup
          comments={rowComments[commentPopup.rowCommentKey] ?? []}
          commentContextLabel={commentContextLabel}
          commentContextIcon="fileTypes/markdown"
          commentContextSessionLabel={commentContextSessionLabel}
          value={commentPopup.value}
          editingIndex={commentPopup.editingIndex ?? null}
          preserveEditorSelection={Boolean(commentPopup.preserveEditorSelection)}
          selectionSnapshot={commentPopup.selectionSnapshot ?? null}
          footerMetaLabel={commentPopup.footerMetaLabel ?? ''}
          onChange={(nextValue) => {
            setCommentPopup((prev) => (prev ? { ...prev, value: nextValue } : prev));
          }}
          onStartEdit={(commentIndex) => handleCommentEditStart(commentPopup.rowKey, commentPopup.rowCommentKey, commentIndex)}
          onDelete={(commentIndex) => handleCommentDelete(commentPopup.rowKey, commentPopup.rowCommentKey, commentIndex)}
          onCancel={() => closeCommentPopup(commentPopup.rowIndex)}
          onSubmit={handleCommentSubmit}
        />
      </PositionedPopup>
    )}
    <SpecSelectionToolbar position={selectionToolbarPos} onAction={handleSelectionToolbarAction} />
    {intentionPopup && (
      <PositionedPopup triggerRect={intentionPopup.rect} onDismiss={() => setIntentionPopup(null)} gap={4}>
        <DoneIssueIntentionPopup
          severity={intentionPopup.severity}
          canFixIssue={Boolean(intentionPopup.issueTarget)}
          issueTarget={intentionPopup.issueTarget}
          onOpenProblems={onOpenProblems}
          onRegenerateSpec={onRegenerateSpec}
          onFixIssue={() => {
            if (intentionPopup.issueTarget) {
              onFixIssue?.(intentionPopup.issueTarget);
            }
          }}
          onClose={() => setIntentionPopup(null)}
        />
      </PositionedPopup>
    )}
    </>
  );
}

function AgentTaskOverlayShell({
  toolbar,
  children,
  lineNumber = 1,
  hasBreakpoint = false,
  onToggleBreakpoint,
}) {
  const shellRef = useRef(null);
  const gutterScrollRef = useRef(null);
  const [trackHeight, setTrackHeight] = useState(0);

  useEffect(() => {
    const shellEl = shellRef.current;
    const gutterScrollEl = gutterScrollRef.current;
    if (!shellEl || !gutterScrollEl) return;

    const scrollBodyEl = shellEl.querySelector('[data-overlay-scroll-body="true"]');
    if (!scrollBodyEl) {
      setTrackHeight(gutterScrollEl.clientHeight);
      return;
    }

    const syncScroll = () => {
      gutterScrollEl.scrollTop = scrollBodyEl.scrollTop;
    };

    const measure = () => {
      const nextHeight = Math.max(scrollBodyEl.scrollHeight, gutterScrollEl.clientHeight);
      setTrackHeight(prev => (prev === nextHeight ? prev : nextHeight));
      syncScroll();
    };

    measure();
    scrollBodyEl.addEventListener('scroll', syncScroll, { passive: true });

    let resizeObserver;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(measure);
      resizeObserver.observe(scrollBodyEl);
      Array.from(scrollBodyEl.children).forEach(child => resizeObserver.observe(child));
    }

    window.addEventListener('resize', measure);

    return () => {
      scrollBodyEl.removeEventListener('scroll', syncScroll);
      resizeObserver?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [children]);

  return (
    <div className="agent-task-overlay-shell" ref={shellRef}>
      {toolbar}
      <div className="agent-task-overlay-editor-body">
        <div className="editor-gutter agent-task-overlay-gutter">
          <div className="agent-task-overlay-gutter-scroll" ref={gutterScrollRef}>
            <div
              className="editor-gutter-inner agent-task-overlay-gutter-track"
              style={trackHeight ? { minHeight: `${trackHeight}px` } : undefined}
            >
              <div className="editor-gutter-row">
                <div
                  className={`editor-gutter-line-number${hasBreakpoint ? ' breakpoint' : ''}`}
                  role="button"
                  tabIndex={0}
                  aria-label={hasBreakpoint ? 'Remove breakpoint' : 'Add breakpoint'}
                  onClick={onToggleBreakpoint}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onToggleBreakpoint?.();
                    }
                  }}
                >
                  {hasBreakpoint ? (
                    <span className="editor-breakpoint-dot" />
                  ) : (
                    <span className="editor-line-num">{lineNumber}</span>
                  )}
                </div>
              </div>
              <div className="agent-task-overlay-gutter-filler" />
            </div>
          </div>
        </div>
        <div className="agent-task-overlay-content">
          {children}
        </div>
      </div>
    </div>
  );
}

function FollowUpToolbar({ taskText, onRegenerate, onTaskTextChange }) {
  return (
    <div className="agent-task-toolbar">
      <div className="agent-task-toolbar-gradient" />
      <div className="agent-task-toolbar-content">
        <div className="agent-task-toolbar-left">
          <AgentTaskTopBarIcon style={{ flexShrink: 0 }} />
          <span className="at-task-text">{taskText || 'New Task.md'}</span>
        </div>
        <div className="agent-task-toolbar-right">
          {/* Restart icon button */}
          <button className="at-icon-btn" title="Restart">
            <Icon name="general/refresh" size={14} />
          </button>
          {/* Specify button */}
          <button className="fu-regenerate-btn" onClick={onRegenerate}>Specify</button>
        </div>
      </div>
    </div>
  );
}

// ─── Agent Task Editor Area ───────────────────────────────────────────────────

function AttachedFileChip({ label, onRemove, className = '' }) {
  return (
    <div className={`attached-file-chip${className ? ` ${className}` : ''}`} contentEditable={false}>
      <IconMdTask />
      <span className="attached-file-label">{label}</span>
      {onRemove && (
        <button type="button" className="attached-file-remove" onClick={onRemove}>
          <Icon name="general/closeSmall" size={12} />
        </button>
      )}
    </div>
  );
}

function AgentTaskTopBarIcon({ style }) {
  return (
    <span className="agent-task-top-bar-agent-icon" style={style} aria-hidden="true">
      <AiChatClaudeIcon />
    </span>
  );
}

function AgentTaskEditorArea({ genState, genProgress, onSend, onStop, onRegenerate, onDoneRegenerate, onFixIssue, onOpenDiffTab, onOpenCheckChip, onOpenCommentSource = null, onOpenVersionDiff, attachedFiles, onRemoveAttached, onAddAttached, currentCode, documentSections, onOpenProblems, onOpenTerminal, addPopupFiles, acRunResult, planRunResult, acWarningBanner, inspectionSummary, versionHistory = null, removedIssueIndices, highlightedProblemLocation = null, doneCommentEntries = [], relatedCommentIssues = [], onDoneCommentsChange, commentResetToken = 0, preserveDoneOverlayDuringBusy = false, runState = 'default', activeRunRequest = null, doneOverlayUiState = null, onDoneOverlayUiStateChange = null, onTopBarAction = null, onTopBarStatusChange = null, topBarStatus = 'Specified', busyLabel = null, specSessionKey = null, commentContextLabel = '', commentContextSessionLabel = 'Active' }) {
  const [value, setValue] = useState('');
  const [taskText, setTaskText] = useState('');
  const [hasBreakpoint, setHasBreakpoint] = useState(false);
  const [completion, setCompletion] = useState(null); // { trigger, query, selectedIdx }
  const [showAddPopup, setShowAddPopup] = useState(false);
  const [popupPos, setPopupPos] = useState(null);
  const [cmpPos, setCmpPos] = useState(null);
  const [doneOverlayHost, setDoneOverlayHost] = useState(null);
  const [hasPendingDoneEnhanceChanges, setHasPendingDoneEnhanceChanges] = useState(false);
  const [doneEnhanceLocksBySession, setDoneEnhanceLocksBySession] = useState({});
  const [doneEnhanceHintPosition, setDoneEnhanceHintPosition] = useState(null);
  const [isDoneEnhanceHintDismissing, setIsDoneEnhanceHintDismissing] = useState(false);
  const [doneEnhanceHintArrowPosition, setDoneEnhanceHintArrowPosition] = useState('top');
  const [isDoneToolbarInputFocused, setIsDoneToolbarInputFocused] = useState(false);
  const [isToolbarInputMultiline, setIsToolbarInputMultiline] = useState(false);
  const addBtnRef = useRef(null);
  const doneEnhanceBtnRef = useRef(null);
  const prevAttachedFileCountRef = useRef(Array.isArray(attachedFiles) ? attachedFiles.length : 0);
  const prevNullSlotCountRef = useRef(0);
  const suppressEnhanceBadgeRef = useRef(false);
  const allowDoneEnhanceAttentionRef = useRef(false);
  const suppressEnhanceBadgeTimerRef = useRef(0);
  const skipNextDoneEnhanceBaselineResetCountRef = useRef(0);
  const doneEnhanceHintFrameRef = useRef(0);
  const previousDoneEnhanceHintVisibilityRef = useRef(false);
  const toolbarRef = useRef(null);
  const textareaRef = useRef(null);
  const doneTitleHydratedRef = useRef(false);
  const doneInputFocusFrameRef = useRef(0);
  const toolbarPlaceholder = 'Describe your task for an agent or create an .md file';
  const goalTitle = extractGoalTitleFromMarkdown(currentCode) || toolbarPlaceholder;
  const hasToolbarText = value.trim().length > 0;
  const stripTopBarStatusTitle = (title = '') => String(title)
    .replace(/^(Generated|Build|Specified|Specify):\s*/u, '')
    .replace(/\s+·\s+(Build|Specified|Specify)$/u, '')
    .trim();
  const topBarBaseTitle = stripTopBarStatusTitle(value.replace(/\s+/g, ' ').trim())
    || (goalTitle !== toolbarPlaceholder ? goalTitle : toolbarPlaceholder);
  const topBarDisplayStatus = ['Build', 'Specified'].includes(topBarStatus)
    ? topBarStatus
    : 'Specified';
  const collapsedDoneToolbarText = hasToolbarText ? value.replace(/\s+/g, ' ').trim() : toolbarPlaceholder;
  const isWysiwygReadyState = genState === 'done' || genState === 'idle';
  const isDoneToolbarInputCollapsed = isWysiwygReadyState && (!TOOLBAR_INPUT_IS_EDITABLE || !isDoneToolbarInputFocused);
  const showLoadingState = AGENT_TASK_LOADING_STATE_ENABLED && genState === 'loading';
  const showGeneratingState = AGENT_TASK_GENERATING_STATE_ENABLED && genState === 'generating';
  const shouldRenderDoneOverlay = isWysiwygReadyState || preserveDoneOverlayDuringBusy;
  const doneEnhanceSessionKey = specSessionKey ?? '__default__';
  const isDoneEnhanceLocked = Boolean(doneEnhanceLocksBySession[doneEnhanceSessionKey]);
  const hasPendingQuickFixRerun =
    (Array.isArray(acRunResult) && acRunResult.some((status) => status === null))
    || (Array.isArray(planRunResult) && planRunResult.some((status) => status === null));
  const hasPendingSpecifyChanges = hasPendingDoneEnhanceChanges || hasPendingQuickFixRerun;
  const shouldShowDoneEnhanceHint = isWysiwygReadyState
    && runState !== 'running'
    && hasPendingSpecifyChanges
    && !isDoneEnhanceLocked;
  const isDoneEnhanceEnabled = isWysiwygReadyState;
  const setDoneEnhanceLockedForSession = useCallback((locked) => {
    setDoneEnhanceLocksBySession((prev) => {
      const isCurrentlyLocked = Boolean(prev[doneEnhanceSessionKey]);
      if (isCurrentlyLocked === locked) {
        return prev;
      }
      if (locked) {
        return {
          ...prev,
          [doneEnhanceSessionKey]: true,
        };
      }
      const next = { ...prev };
      delete next[doneEnhanceSessionKey];
      return next;
    });
  }, [doneEnhanceSessionKey]);
  const liftDoneEnhanceSuppression = useCallback(() => {
    if (!suppressEnhanceBadgeRef.current) return;
    if (suppressEnhanceBadgeTimerRef.current) {
      clearTimeout(suppressEnhanceBadgeTimerRef.current);
      suppressEnhanceBadgeTimerRef.current = 0;
    }
    suppressEnhanceBadgeRef.current = false;
  }, []);
  const resetDoneEnhanceAttention = useCallback((suppressMs = 2000) => {
    setHasPendingDoneEnhanceChanges(false);
    setDoneEnhanceHintPosition(null);
    setIsDoneEnhanceHintDismissing(false);
    setDoneEnhanceHintArrowPosition('top');
    previousDoneEnhanceHintVisibilityRef.current = false;
    allowDoneEnhanceAttentionRef.current = false;

    if (suppressEnhanceBadgeTimerRef.current) {
      clearTimeout(suppressEnhanceBadgeTimerRef.current);
      suppressEnhanceBadgeTimerRef.current = 0;
    }

    suppressEnhanceBadgeRef.current = true;
    suppressEnhanceBadgeTimerRef.current = setTimeout(() => {
      suppressEnhanceBadgeRef.current = false;
      suppressEnhanceBadgeTimerRef.current = 0;
    }, suppressMs);
  }, []);

  useEffect(() => {
    if (!isWysiwygReadyState) {
      setIsDoneToolbarInputFocused(false);
      setIsToolbarInputMultiline(false);
      doneTitleHydratedRef.current = false;
    }
  }, [genState, isWysiwygReadyState]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    const MAX_H = 160;

    if (isDoneToolbarInputCollapsed) {
      ta.style.height = '18px';
      ta.style.overflowY = 'hidden';
      setIsToolbarInputMultiline(false);
      return;
    }

    const LINE_H = 18;
    const lines = value ? value.split('\n').length : 1;
    const h = Math.min(lines * LINE_H, MAX_H);
    ta.style.height = h + 'px';
    ta.style.overflowY = lines * LINE_H > MAX_H ? 'auto' : 'hidden';
    setIsToolbarInputMultiline(h > LINE_H);
  }, [value, genState, isDoneToolbarInputCollapsed]);

  useEffect(() => {
    if (!TOOLBAR_INPUT_IS_EDITABLE) return;
    if (!isWysiwygReadyState || isDoneToolbarInputCollapsed) return;
    if (doneInputFocusFrameRef.current) {
      cancelAnimationFrame(doneInputFocusFrameRef.current);
    }
    doneInputFocusFrameRef.current = requestAnimationFrame(() => {
      const ta = textareaRef.current;
      if (!(ta instanceof HTMLTextAreaElement)) return;
      ta.focus({ preventScroll: true });
      const nextCaretPos = ta.value.length;
      ta.setSelectionRange(nextCaretPos, nextCaretPos);
    });
  }, [isDoneToolbarInputCollapsed, isWysiwygReadyState]);

  useEffect(() => () => {
    if (doneInputFocusFrameRef.current) {
      cancelAnimationFrame(doneInputFocusFrameRef.current);
    }
  }, []);

  useEffect(() => () => {
    if (doneEnhanceHintFrameRef.current) {
      cancelAnimationFrame(doneEnhanceHintFrameRef.current);
    }
    if (suppressEnhanceBadgeTimerRef.current) {
      clearTimeout(suppressEnhanceBadgeTimerRef.current);
    }
  }, []);

  useEffect(() => {
    if (!isWysiwygReadyState) return;
    doneTitleHydratedRef.current = false;
  }, [isWysiwygReadyState, currentCode]);

  useEffect(() => {
    prevAttachedFileCountRef.current = Array.isArray(attachedFiles) ? attachedFiles.length : 0;
  }, [genState, specSessionKey]);

  useEffect(() => {
    if (!isWysiwygReadyState || doneTitleHydratedRef.current) return;
    doneTitleHydratedRef.current = true;
    if (!value.trim() && goalTitle !== toolbarPlaceholder) {
      setValue(`${topBarDisplayStatus}: ${stripTopBarStatusTitle(goalTitle)}`);
    }
  }, [isWysiwygReadyState, goalTitle, toolbarPlaceholder, topBarDisplayStatus, value]);

  useEffect(() => {
    if (goalTitle === toolbarPlaceholder) return;
    const nextValue = `${topBarDisplayStatus}: ${stripTopBarStatusTitle(goalTitle)}`;
    setValue((prev) => (prev === nextValue ? prev : nextValue));
  }, [goalTitle, toolbarPlaceholder, topBarDisplayStatus]);

  useEffect(() => {
    if (completion && toolbarRef.current) {
      const r = toolbarRef.current.getBoundingClientRect();
      const left = r.left + 12;
      const width = Math.min(453, window.innerWidth - left - 8);
      setCmpPos({ top: r.bottom, left, width });
    } else {
      setCmpPos(null);
    }
  }, [!!completion]);

  useEffect(() => {
    if (!shouldRenderDoneOverlay || !toolbarRef.current) {
      setDoneOverlayHost(null);
      return undefined;
    }

    let frameId = 0;

    frameId = requestAnimationFrame(() => {
      const editorEl = toolbarRef.current?.closest('.editor');
      const nextHost = editorEl?.querySelector('.editor-body');
      setDoneOverlayHost(nextHost instanceof HTMLElement ? nextHost : null);
    });

    return () => {
      if (frameId) cancelAnimationFrame(frameId);
    };
  }, [shouldRenderDoneOverlay]);

  useEffect(() => {
    if (!shouldRenderDoneOverlay) {
      setHasPendingDoneEnhanceChanges(false);
    }
  }, [shouldRenderDoneOverlay]);

  useEffect(() => {
    if (doneEnhanceHintFrameRef.current) {
      cancelAnimationFrame(doneEnhanceHintFrameRef.current);
      doneEnhanceHintFrameRef.current = 0;
    }
    if (!shouldShowDoneEnhanceHint) {
      previousDoneEnhanceHintVisibilityRef.current = false;
      setDoneEnhanceHintPosition(null);
      setDoneEnhanceHintArrowPosition('top');
      return;
    }

    const updatePosition = () => {
      const triggerEl = doneEnhanceBtnRef.current;
      if (!(triggerEl instanceof HTMLElement)) return;
      const rect = triggerEl.getBoundingClientRect();
      const gap = 8;
      const viewportPadding = 12;
      const preferredWidth = 360;
      const anchorLeftOffset = 64;
      const chatWindowRect = document.querySelector('.ai-chat-window')?.getBoundingClientRect();
      const rightBoundary = chatWindowRect && chatWindowRect.left > rect.right
        ? chatWindowRect.left
        : window.innerWidth;
      const popupLeftLimit = Math.max(viewportPadding, rightBoundary - preferredWidth - viewportPadding);
      const left = Math.round(
        Math.max(
          viewportPadding,
          Math.min(rect.left - anchorLeftOffset, popupLeftLimit)
        )
      );
      const popupHeight = 44;
      const placeAbove = rect.bottom + gap + popupHeight > window.innerHeight
        && rect.top - gap - popupHeight >= viewportPadding;

      const nextPosition = placeAbove
        ? {
            top: Math.max(viewportPadding, Math.round(rect.top - gap - popupHeight)),
            left,
          }
        : {
            top: Math.min(window.innerHeight - viewportPadding, Math.round(rect.bottom + gap)),
            left,
          };

      setDoneEnhanceHintArrowPosition(placeAbove ? 'bottom' : 'top');
      setDoneEnhanceHintPosition((prev) => {
        if (
          prev
          && prev.top === nextPosition.top
          && prev.left === nextPosition.left
          && prev.right === nextPosition.right
        ) {
          return prev;
        }
        return nextPosition;
      }
      );
    };

    doneEnhanceHintFrameRef.current = requestAnimationFrame(() => {
      doneEnhanceHintFrameRef.current = 0;
      const triggerEl = doneEnhanceBtnRef.current;
      if (!(triggerEl instanceof HTMLElement)) return;
      const rect = triggerEl.getBoundingClientRect();

      // If the trigger is outside the viewport, scroll it into view first,
      // then capture its updated rect after the scroll settles.
      if (rect.bottom < 0 || rect.top > window.innerHeight) {
        triggerEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        setTimeout(updatePosition, 400);
      } else {
        updatePosition();
      }
    });

    if (!previousDoneEnhanceHintVisibilityRef.current) {
      previousDoneEnhanceHintVisibilityRef.current = true;
    }

    const schedulePositionUpdate = () => {
      if (doneEnhanceHintFrameRef.current) return;
      doneEnhanceHintFrameRef.current = requestAnimationFrame(() => {
        doneEnhanceHintFrameRef.current = 0;
        updatePosition();
      });
    };
    const resizeObserver = typeof ResizeObserver === 'function'
      ? new ResizeObserver(schedulePositionUpdate)
      : null;

    if (resizeObserver) {
      if (doneEnhanceBtnRef.current instanceof HTMLElement) {
        resizeObserver.observe(doneEnhanceBtnRef.current);
      }
      if (toolbarRef.current instanceof HTMLElement) {
        resizeObserver.observe(toolbarRef.current);
      }
    }

    window.addEventListener('resize', schedulePositionUpdate);
    window.addEventListener('scroll', schedulePositionUpdate, true);

    return () => {
      window.removeEventListener('resize', schedulePositionUpdate);
      window.removeEventListener('scroll', schedulePositionUpdate, true);
      resizeObserver?.disconnect();
    };
  }, [shouldShowDoneEnhanceHint]);

  useEffect(() => {
    if (!doneEnhanceHintPosition) {
      setIsDoneEnhanceHintDismissing(false);
      return;
    }
    const outTimer = setTimeout(() => setIsDoneEnhanceHintDismissing(true), 7000);
    const clearTimer = setTimeout(() => setDoneEnhanceHintPosition(null), 7200);
    return () => {
      clearTimeout(outTimer);
      clearTimeout(clearTimer);
    };
  }, [doneEnhanceHintPosition]);

  useEffect(() => {
    if (skipNextDoneEnhanceBaselineResetCountRef.current > 0) {
      skipNextDoneEnhanceBaselineResetCountRef.current -= 1;
      return;
    }
    // Any freshly applied done-state spec becomes the new baseline. Wait for
    // new user edits before showing the Enhance badge/popup again.
    resetDoneEnhanceAttention(2000);
    // Re-snapshot the current null-slot count so that returning to this tab
    // (same nulls, new reference) doesn't re-trigger the badge.
    const currentNullCount =
      (Array.isArray(acRunResult) ? acRunResult.filter((s) => s === null).length : 0) +
      (Array.isArray(planRunResult) ? planRunResult.filter((s) => s === null).length : 0);
    prevNullSlotCountRef.current = currentNullCount;
  }, [acRunResult, commentResetToken, currentCode, planRunResult, resetDoneEnhanceAttention, specSessionKey]);

  // When a quick fix is applied the affected run-result slot is set to null.
  // Treat that as a pending change so the Enhance badge + popup appear.
  // Track the null-slot count so that tab switches (same nulls, new reference)
  // don't re-trigger the badge — only genuinely new null slots do.
  useEffect(() => {
    const nullCount =
      (Array.isArray(acRunResult) ? acRunResult.filter((s) => s === null).length : 0) +
      (Array.isArray(planRunResult) ? planRunResult.filter((s) => s === null).length : 0);
    if (nullCount > prevNullSlotCountRef.current) {
      setTimeout(() => {
        if (isDoneEnhanceLocked) {
          setDoneEnhanceLockedForSession(false);
        }
        liftDoneEnhanceSuppression();
        allowDoneEnhanceAttentionRef.current = true;
        setHasPendingDoneEnhanceChanges(true);
      }, 0);
    }
    prevNullSlotCountRef.current = nullCount;
  }, [acRunResult, isDoneEnhanceLocked, liftDoneEnhanceSuppression, planRunResult, setDoneEnhanceLockedForSession]);

  useEffect(() => {
    if (genState !== 'done') return;

    const attachedFileCount = Array.isArray(attachedFiles) ? attachedFiles.length : 0;
    if (attachedFileCount > prevAttachedFileCountRef.current) {
      setTimeout(() => {
        if (isDoneEnhanceLocked) {
          setDoneEnhanceLockedForSession(false);
        }
        liftDoneEnhanceSuppression();
        allowDoneEnhanceAttentionRef.current = true;
        setHasPendingDoneEnhanceChanges(true);
      }, 0);
    }
    prevAttachedFileCountRef.current = attachedFileCount;
  }, [attachedFiles, genState, isDoneEnhanceLocked, liftDoneEnhanceSuppression, setDoneEnhanceLockedForSession]);

  const handlePendingEnhanceStateChange = useCallback((pending) => {
    if (!pending && hasPendingQuickFixRerun && !isDoneEnhanceLocked) {
      return;
    }
    if (pending && (isDoneEnhanceLocked || suppressEnhanceBadgeRef.current || !allowDoneEnhanceAttentionRef.current)) return;
    setHasPendingDoneEnhanceChanges(pending);
  }, [hasPendingQuickFixRerun, isDoneEnhanceLocked]);

  // Called when the user actually types in the overlay — lifts suppress immediately
  // so that edits made right after Enhance still trigger the badge.
  const handleOverlayUserInput = useCallback(() => {
    setDoneEnhanceLockedForSession(false);
    allowDoneEnhanceAttentionRef.current = true;
    liftDoneEnhanceSuppression();
    setHasPendingDoneEnhanceChanges(true);
  }, [liftDoneEnhanceSuppression, setDoneEnhanceLockedForSession]);
  const handleDoneOverlayFixIssue = useCallback((payload) => {
    // Quick fix updates `currentCode` and may also bump comment reset state in
    // separate renders. Skip both baseline-reset passes so Enhance stays active.
    skipNextDoneEnhanceBaselineResetCountRef.current = 2;
    setDoneEnhanceLockedForSession(false);
    allowDoneEnhanceAttentionRef.current = true;
    liftDoneEnhanceSuppression();
    setHasPendingDoneEnhanceChanges(true);
    onFixIssue?.(payload);
  }, [liftDoneEnhanceSuppression, onFixIssue, setDoneEnhanceLockedForSession]);

  function handleChange(e) {
    const v = e.target.value;
    setValue(v);
    const lastAt   = v.lastIndexOf('@');
    const lastHash = v.lastIndexOf('#');
    const triggerIdx = Math.max(lastAt, lastHash);
    if (triggerIdx >= 0) {
      const trigger = v[triggerIdx];
      const query   = v.slice(triggerIdx + 1);
      if (!query.includes(' ')) {
        setCompletion({ trigger, query, selectedIdx: 0 });
        return;
      }
    }
    setCompletion(null);
  }

  function getCurrentTaskQuestion() {
    const normalizeText = (nextValue) => (nextValue || '')
      .replace(/\u00A0/g, ' ')
      .trim();

    if (TOOLBAR_INPUT_IS_EDITABLE) {
      return normalizeText(value);
    }

    if (typeof document !== 'undefined') {
      const editorTextarea = Array.from(document.querySelectorAll('.main-window-editor-content .editor .pce-textarea')).find(
        (node) => node instanceof HTMLTextAreaElement && !node.readOnly && node.getClientRects().length > 0
      );

      if (editorTextarea instanceof HTMLTextAreaElement) {
        return normalizeText(editorTextarea.value);
      }
    }

    return normalizeText(currentCode);
  }

  function getCurrentEditorContent() {
    if (TOOLBAR_INPUT_IS_EDITABLE) {
      return value || '';
    }

    if (typeof document !== 'undefined') {
      const editorTextarea = Array.from(document.querySelectorAll('.main-window-editor-content .editor .pce-textarea')).find(
        (node) => node instanceof HTMLTextAreaElement && !node.readOnly && node.getClientRects().length > 0
      );

      if (editorTextarea instanceof HTMLTextAreaElement) {
        return editorTextarea.value || '';
      }
    }

    return currentCode || '';
  }

  function handleGenerate() {
    const question = getCurrentTaskQuestion();
    const sourceCode = getCurrentEditorContent();

    if (TOOLBAR_INPUT_IS_EDITABLE) {
      if (!question) return;
      setTaskText(question);
    } else {
      setTaskText(question);
    }
    onSend?.({ openTerminal: true, question, sourceCode });
  }

  function updateTopBarTitleAction(actionLabel) {
    setValue(`${actionLabel}: ${topBarBaseTitle}`);
    onTopBarStatusChange?.(actionLabel);
  }

  function handleBuildClick() {
    updateTopBarTitleAction('Build');
    onTopBarAction?.('Build', { sendMessage: true });
  }

  function handleSpecifyClick() {
    updateTopBarTitleAction('Specified');
    onTopBarAction?.('Specified', { sendMessage: true });
    onSend?.({
      openTerminal: false,
      question: '',
      sourceCode: getCurrentEditorContent(),
    });
  }

  function handleDoneEnhance() {
    updateTopBarTitleAction('Specified');
    onTopBarAction?.('Specified', { sendMessage: true });
    // Reset the done-state attention immediately so a completed Enhance cycle
    // doesn't reopen the popup/badge until the user makes fresh edits.
    setDoneEnhanceLockedForSession(true);
    resetDoneEnhanceAttention(4000);
    onDoneRegenerate?.({
      commentEntries: doneCommentEntries,
    });
  }

  function handleTopBarTitleOpenChat() {
    onTopBarAction?.(topBarDisplayStatus);
  }

  function handleAddToolbarClick() {
    if (!showAddPopup && addBtnRef.current) {
      const r = addBtnRef.current.getBoundingClientRect();
      setPopupPos({ top: r.bottom + 6, right: window.innerWidth - r.right });
    }
    setShowAddPopup((prev) => !prev);
  }

  function handleKeyDown(e) {
    if (!completion) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleGenerate();
      }
      return;
    }
    const items = completion.trigger === '@' ? AT_COMPLETIONS : HASH_COMPLETIONS;
    const filtered = items.filter(item =>
      item.label.toLowerCase().includes(completion.query.toLowerCase())
    ).slice(0, COMPLETION_POPUP_MAX_ITEMS);

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCompletion(c => ({ ...c, selectedIdx: Math.min(c.selectedIdx + 1, filtered.length - 1) }));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCompletion(c => ({ ...c, selectedIdx: Math.max(c.selectedIdx - 1, 0) }));
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      const item = filtered[completion.selectedIdx];
      const selection = buildCompletionSelection(item);
      if (selection) applyCompletion(selection);
    } else if (e.key === 'Escape') {
      setCompletion(null);
    }
  }

  function applyCompletion(item) {
    const triggerIdx = Math.max(value.lastIndexOf('@'), value.lastIndexOf('#'));
    const before = value.slice(0, triggerIdx + 1);
    const insertText = getCompletionInsertText(item);
    setValue(before + insertText + ' ');
    setCompletion(null);
    const attachment = getCompletionAttachment(item);
    if (attachment) {
      onAddAttached?.(attachment);
    }
  }

  const focusDoneToolbarInput = useCallback(() => {
    if (!TOOLBAR_INPUT_IS_EDITABLE || genState !== 'done') return;
    setIsDoneToolbarInputFocused(true);
    if (doneInputFocusFrameRef.current) {
      cancelAnimationFrame(doneInputFocusFrameRef.current);
    }
    doneInputFocusFrameRef.current = requestAnimationFrame(() => {
      const ta = textareaRef.current;
      if (!(ta instanceof HTMLTextAreaElement)) return;
      ta.focus({ preventScroll: true });
      const nextCaretPos = ta.value.length;
      ta.setSelectionRange(nextCaretPos, nextCaretPos);
    });
  }, [genState]);

  function renderToolbarInput({ collapsibleInDone = false } = {}) {
    const isCollapsed = collapsibleInDone && isDoneToolbarInputCollapsed;

    return (
      <div className={`at-input-shell${isCollapsed ? ' is-collapsed' : ''}`}>
        {isCollapsed && TOOLBAR_INPUT_IS_EDITABLE && (
          <div
            className="at-input-preview"
            role="button"
            tabIndex={0}
            aria-label="Edit agent task"
            onMouseDown={(e) => {
              e.preventDefault();
              focusDoneToolbarInput();
            }}
            onFocus={focusDoneToolbarInput}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                focusDoneToolbarInput();
              }
            }}
          >
            <span className={`at-input-preview-text${hasToolbarText ? '' : ' is-placeholder'}`}>
              {collapsedDoneToolbarText}
            </span>
          </div>
        )}
        {isCollapsed && !TOOLBAR_INPUT_IS_EDITABLE && (
          <div className="at-input-preview">
            <span className={`at-input-preview-text${hasToolbarText ? '' : ' is-placeholder'}`}>
              {collapsedDoneToolbarText}
            </span>
          </div>
        )}
        {/*
        Editable top bar input kept here for quick restore.
        <textarea
          ref={textareaRef}
          className={`at-input${isCollapsed ? ' at-input-collapsed' : ''}`}
          rows={1}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (isWysiwygReadyState) {
              setIsDoneToolbarInputFocused(true);
            }
          }}
          onBlur={() => {
            if (genState === 'done') {
              setIsDoneToolbarInputFocused(false);
            }
          }}
          placeholder={toolbarPlaceholder}
          title="Shift+Enter for new line"
          aria-label="Agent task input"
          spellCheck={false}
        />
        */}
        <textarea
          ref={textareaRef}
          className={`at-input at-input-readonly${isCollapsed ? ' at-input-collapsed' : ''}`}
          rows={1}
          value={collapsedDoneToolbarText === toolbarPlaceholder ? '' : collapsedDoneToolbarText}
          readOnly
          tabIndex={-1}
          placeholder={toolbarPlaceholder}
          aria-label="Agent task input"
          spellCheck={false}
        />
      </div>
    );
  }

  function renderBusyToolbar(title) {
    return (
      <div className="agent-task-toolbar" ref={toolbarRef}>
        <div className="agent-task-toolbar-gradient" />
        <div className="agent-task-toolbar-content">
          <div className="agent-task-toolbar-left">
            <svg className="at-loader" width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect opacity="0.93" x="2.34961" y="3.76416" width="2" height="4" rx="1" transform="rotate(-45 2.34961 3.76416)" fill="#868A91"/>
              <rect opacity="0.78" x="1" y="7" width="4" height="2" rx="1" fill="#868A91"/>
              <rect opacity="0.69" x="5.17871" y="9.40991" width="2" height="4" rx="1" transform="rotate(45 5.17871 9.40991)" fill="#868A91"/>
              <rect opacity="0.62" x="7" y="11" width="2" height="4" rx="1" fill="#868A91"/>
              <rect opacity="0.48" x="9.41003" y="10.8242" width="2" height="4" rx="1" transform="rotate(-45 9.41003 10.8242)" fill="#868A91"/>
              <rect opacity="0.38" x="11" y="7" width="4" height="2" rx="1" fill="#868A91"/>
              <rect opacity="0.3" x="12.2384" y="2.35001" width="2" height="4" rx="1" transform="rotate(45 12.2384 2.35001)" fill="#868A91"/>
              <rect x="7" y="1" width="2" height="4" rx="1" fill="#868A91"/>
            </svg>
            <span className="at-generating-label">{title}</span>
          </div>

          <div className="agent-task-toolbar-right">
            <button type="button" className="at-send-btn" onClick={() => onStop()}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
                <rect x="3.5" y="3.5" width="9" height="9" rx="1.5" stroke="#C4C4C4" strokeWidth="1.6" />
              </svg>
              <span className="at-send-label">Stop</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  function renderFloatingPopups() {
    return (
      <>
        {completion && cmpPos && createPortal(
          <CompletionPopup
            trigger={completion.trigger}
            query={completion.query}
            selectedIdx={completion.selectedIdx}
            onSelect={applyCompletion}
            onClose={() => setCompletion(null)}
            style={{ position: 'fixed', top: cmpPos.top, left: cmpPos.left, width: cmpPos.width }}
          />,
          document.body
        )}
        {showAddPopup && popupPos && createPortal(
          <>
            <div className="add-popup-overlay" onMouseDown={() => setShowAddPopup(false)} />
            <AddPopup
              onClose={() => setShowAddPopup(false)}
              onSelectFile={(item) => onAddAttached?.(item)}
              files={addPopupFiles}
              style={{ position: 'fixed', ...popupPos }}
            />
          </>,
          document.body
        )}
      </>
    );
  }

  if (showLoadingState) {
    return (
      <>
        <div className="agent-task-editor-area" data-gen-state="loading">
          {renderBusyToolbar(busyLabel ?? 'Analizing...')}
          {renderFloatingPopups()}
        </div>
        {shouldRenderDoneOverlay && doneOverlayHost && createPortal(
          <DoneMarkdownOverlay code={currentCode} onOpenProblems={onOpenProblems} onOpenTerminal={onOpenTerminal} onRegenerateSpec={onDoneRegenerate} onFixIssue={handleDoneOverlayFixIssue} onOpenDiffTab={onOpenDiffTab} onOpenCheckChip={onOpenCheckChip} onOpenCommentSource={onOpenCommentSource} addPopupFiles={addPopupFiles} attachedFiles={attachedFiles} onAddToProjectContext={onAddAttached} acRunResult={acRunResult} planRunResult={planRunResult} documentSections={documentSections} acWarningBanner={acWarningBanner} inspectionSummary={inspectionSummary} versionHistory={versionHistory} onOpenVersionDiff={onOpenVersionDiff} onCommentsChange={onDoneCommentsChange} commentEntries={doneCommentEntries} relatedCommentIssues={relatedCommentIssues} removedIssueIndices={removedIssueIndices} highlightedProblemLocation={highlightedProblemLocation} commentResetToken={commentResetToken} uiState={doneOverlayUiState} onUiStateChange={onDoneOverlayUiStateChange} onPendingEnhanceStateChange={handlePendingEnhanceStateChange} onUserInput={handleOverlayUserInput} activeRunRequest={activeRunRequest} commentContextLabel={commentContextLabel} commentContextSessionLabel={commentContextSessionLabel} />,
          doneOverlayHost
        )}
      </>
    );
  }

  if (showGeneratingState) {
    return (
      <>
        <div className="agent-task-editor-area" data-gen-state="generating">
          {renderBusyToolbar(busyLabel ?? 'Specifying...')}
          {renderFloatingPopups()}
        </div>
        {shouldRenderDoneOverlay && doneOverlayHost && createPortal(
          <DoneMarkdownOverlay code={currentCode} onOpenProblems={onOpenProblems} onOpenTerminal={onOpenTerminal} onRegenerateSpec={onDoneRegenerate} onFixIssue={handleDoneOverlayFixIssue} onOpenDiffTab={onOpenDiffTab} onOpenCheckChip={onOpenCheckChip} onOpenCommentSource={onOpenCommentSource} addPopupFiles={addPopupFiles} attachedFiles={attachedFiles} onAddToProjectContext={onAddAttached} acRunResult={acRunResult} planRunResult={planRunResult} documentSections={documentSections} acWarningBanner={acWarningBanner} inspectionSummary={inspectionSummary} versionHistory={versionHistory} onOpenVersionDiff={onOpenVersionDiff} onCommentsChange={onDoneCommentsChange} commentEntries={doneCommentEntries} relatedCommentIssues={relatedCommentIssues} removedIssueIndices={removedIssueIndices} highlightedProblemLocation={highlightedProblemLocation} commentResetToken={commentResetToken} uiState={doneOverlayUiState} onUiStateChange={onDoneOverlayUiStateChange} onPendingEnhanceStateChange={handlePendingEnhanceStateChange} onUserInput={handleOverlayUserInput} activeRunRequest={activeRunRequest} commentContextLabel={commentContextLabel} commentContextSessionLabel={commentContextSessionLabel} />,
          doneOverlayHost
        )}
      </>
    );
  }

  if (isWysiwygReadyState) {
    return (
      <>
        <div className="agent-task-editor-area" data-gen-state={genState}>
          <div className="agent-task-toolbar" ref={toolbarRef}>
            <div className="agent-task-toolbar-gradient" />
            <div className="agent-task-toolbar-content">
              {/* Default state — left */}
              <div className={`agent-task-toolbar-left${isToolbarInputMultiline ? ' is-multiline' : ''}`}>
                {runState === 'running' ? (<>
                  <svg className="at-loader" width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect opacity="0.93" x="2.34961" y="3.76416" width="2" height="4" rx="1" transform="rotate(-45 2.34961 3.76416)" fill="#868A91"/>
                    <rect opacity="0.78" x="1" y="7" width="4" height="2" rx="1" fill="#868A91"/>
                    <rect opacity="0.69" x="5.17871" y="9.40991" width="2" height="4" rx="1" transform="rotate(45 5.17871 9.40991)" fill="#868A91"/>
                    <rect opacity="0.62" x="7" y="11" width="2" height="4" rx="1" fill="#868A91"/>
                    <rect opacity="0.48" x="9.41003" y="10.8242" width="2" height="4" rx="1" transform="rotate(-45 9.41003 10.8242)" fill="#868A91"/>
                    <rect opacity="0.38" x="11" y="7" width="4" height="2" rx="1" fill="#868A91"/>
                    <rect opacity="0.3" x="12.2384" y="2.35001" width="2" height="4" rx="1" transform="rotate(45 12.2384 2.35001)" fill="#868A91"/>
                    <rect x="7" y="1" width="2" height="4" rx="1" fill="#868A91"/>
                  </svg>
                  <span className="at-generating-label">Building...</span>
                </>) : (<>
                  <button
                    type="button"
                    className="agent-task-toolbar-title-trigger"
                    aria-label={`Open ${topBarDisplayStatus} chat`}
                    onClick={handleTopBarTitleOpenChat}
                  >
                    <AgentTaskTopBarIcon style={{ flexShrink: 0 }} />
                    {renderToolbarInput({ collapsibleInDone: true })}
                  </button>
                </>)}
              </div>

              {/* Default state — right */}
              <div className="agent-task-toolbar-right">
                {runState === 'running' ? (
                  <button type="button" className="at-send-btn" onClick={() => onStop()}>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
                      <rect x="3.5" y="3.5" width="9" height="9" rx="1.5" stroke="#C4C4C4" strokeWidth="1.6" />
                    </svg>
                    <span className="at-send-label">Stop</span>
                  </button>
                ) : (<>
                  {attachedFiles && attachedFiles.length > 0 && (
                    <div className="attached-files-list">
                      {attachedFiles.map((file, idx) => (
                        <AttachedFileChip
                          key={file.label + idx}
                          label={file.label}
                          onRemove={() => onRemoveAttached?.(idx)}
                        />
                      ))}
                    </div>
                  )}
                  <button type="button" className="at-send-btn" data-demo-id="agent-task-run" onClick={() => {
                    updateTopBarTitleAction('Build');
                    onTopBarAction?.('Build', { sendMessage: true });
                    // Suppress badge during and after the run — the run itself
                    // will produce authoritative statuses, so pre-run pending
                    // changes are no longer relevant.
                    setHasPendingDoneEnhanceChanges(false);
                    if (suppressEnhanceBadgeTimerRef.current) {
                      clearTimeout(suppressEnhanceBadgeTimerRef.current);
                    }
                    suppressEnhanceBadgeRef.current = true;
                    suppressEnhanceBadgeTimerRef.current = setTimeout(() => {
                      suppressEnhanceBadgeRef.current = false;
                      suppressEnhanceBadgeTimerRef.current = 0;
                    }, 4000);
                  }}>
                    <Icon name="run/run" size={16} />
                    <span className="at-send-label">Build</span>
                  </button>

                  <div className="at-vsep" />

                  <button
                    type="button"
                    className="at-send-btn at-send-btn-enhance"
                    ref={doneEnhanceBtnRef}
                    data-demo-id="agent-task-enhance"
                    onClick={handleDoneEnhance}
                    disabled={!isDoneEnhanceEnabled}
                    aria-disabled={!isDoneEnhanceEnabled}
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
                      <path d="M13.5 1.5V5.5H12.9003M9.5 5.5H12.9003M12.9003 5.5C11.9899 3.71916 10.1373 2.5 8 2.5C4.96243 2.5 2.5 4.96243 2.5 8C2.5 11.0376 4.96243 13.5 8 13.5C10.1373 13.5 11.9899 12.2808 12.9003 10.5" stroke="#CED0D6" strokeLinecap="round"/>
                    </svg>
                    <span className="at-send-label">Specify</span>
                  </button>
                </>)}
              </div>
            </div>
          </div>
          {completion && cmpPos && createPortal(
            <CompletionPopup
              trigger={completion.trigger}
              query={completion.query}
              selectedIdx={completion.selectedIdx}
              onSelect={applyCompletion}
              onClose={() => setCompletion(null)}
              style={{ position: 'fixed', top: cmpPos.top, left: cmpPos.left, width: cmpPos.width }}
            />,
            document.body
          )}
          {showAddPopup && popupPos && createPortal(
            <>
              <div className="add-popup-overlay" onMouseDown={() => setShowAddPopup(false)} />
              <AddPopup
                onClose={() => setShowAddPopup(false)}
                onSelectFile={(item) => onAddAttached?.(item)}
                files={addPopupFiles}
                style={{ position: 'fixed', ...popupPos }}
              />
            </>,
            document.body
          )}
        </div>
        {shouldRenderDoneOverlay && doneOverlayHost && createPortal(
          <DoneMarkdownOverlay code={currentCode} onOpenProblems={onOpenProblems} onOpenTerminal={onOpenTerminal} onRegenerateSpec={onDoneRegenerate} onFixIssue={handleDoneOverlayFixIssue} onOpenDiffTab={onOpenDiffTab} onOpenCheckChip={onOpenCheckChip} onOpenCommentSource={onOpenCommentSource} addPopupFiles={addPopupFiles} attachedFiles={attachedFiles} onAddToProjectContext={onAddAttached} acRunResult={acRunResult} planRunResult={planRunResult} documentSections={documentSections} acWarningBanner={acWarningBanner} inspectionSummary={inspectionSummary} versionHistory={versionHistory} onOpenVersionDiff={onOpenVersionDiff} onCommentsChange={onDoneCommentsChange} commentEntries={doneCommentEntries} relatedCommentIssues={relatedCommentIssues} removedIssueIndices={removedIssueIndices} highlightedProblemLocation={highlightedProblemLocation} commentResetToken={commentResetToken} uiState={doneOverlayUiState} onUiStateChange={onDoneOverlayUiStateChange} onPendingEnhanceStateChange={handlePendingEnhanceStateChange} onUserInput={handleOverlayUserInput} activeRunRequest={activeRunRequest} commentContextLabel={commentContextLabel} commentContextSessionLabel={commentContextSessionLabel} />,
          doneOverlayHost
        )}
      </>
    );
  }

  return (
    <div className="agent-task-editor-area">
      <div className="agent-task-toolbar" ref={toolbarRef}>
        <div className="agent-task-toolbar-gradient" />
        <div className="agent-task-toolbar-content">

          {showGeneratingState ? <>
            {/* Generating state — left */}
            <div className="agent-task-toolbar-left">
              <svg className="at-loader" width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect opacity="0.93" x="2.34961" y="3.76416" width="2" height="4" rx="1" transform="rotate(-45 2.34961 3.76416)" fill="#868A91"/>
                <rect opacity="0.78" x="1" y="7" width="4" height="2" rx="1" fill="#868A91"/>
                <rect opacity="0.69" x="5.17871" y="9.40991" width="2" height="4" rx="1" transform="rotate(45 5.17871 9.40991)" fill="#868A91"/>
                <rect opacity="0.62" x="7" y="11" width="2" height="4" rx="1" fill="#868A91"/>
                <rect opacity="0.48" x="9.41003" y="10.8242" width="2" height="4" rx="1" transform="rotate(-45 9.41003 10.8242)" fill="#868A91"/>
                <rect opacity="0.38" x="11" y="7" width="4" height="2" rx="1" fill="#868A91"/>
                <rect opacity="0.3" x="12.2384" y="2.35001" width="2" height="4" rx="1" transform="rotate(45 12.2384 2.35001)" fill="#868A91"/>
                <rect x="7" y="1" width="2" height="4" rx="1" fill="#868A91"/>
              </svg>
              <span className="at-generating-label">{busyLabel ?? 'Specifying...'}</span>
            </div>

            {/* Generating state — right */}
            <div className="agent-task-toolbar-right">
              <button type="button" className="at-send-btn" onClick={() => onStop()}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0 }}>
                  <rect x="1" y="1" width="10" height="10" rx="2" fill="currentColor" />
                </svg>
                <span className="at-send-label">Stop</span>
              </button>
            </div>
          </> : <>
            {/* Default state — left */}
            <div className={`agent-task-toolbar-left${isToolbarInputMultiline ? ' is-multiline' : ''}`}>
              <AgentTaskTopBarIcon style={{ flexShrink: 0 }} />
              {renderToolbarInput()}
            </div>

            {/* Default state — right */}
            <div className="agent-task-toolbar-right">
              {attachedFiles && attachedFiles.length > 0 && (
                <div className="attached-files-list">
                  {attachedFiles.map((file, idx) => (
                    <AttachedFileChip
                      key={file.label + idx}
                      label={file.label}
                      onRemove={() => onRemoveAttached?.(idx)}
                    />
                  ))}
                </div>
              )}
		              <button type="button" className="at-send-btn" data-demo-id="agent-task-idle-run" onClick={handleBuildClick}>
		                <Icon name="run/run" size={16} />
		                <span className="at-send-label">Build</span>
		              </button>
	              <div className="at-vsep" />
	              <button type="button" className="at-send-btn" data-demo-id="agent-task-generate" onClick={handleSpecifyClick}>
	                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
	                  <path d="M8 13V3M8 3L3.5 7.5M8 3L12.5 7.5" stroke="#C4C4C4" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
	                </svg>
	                <span className="at-send-label">Specify</span>
	              </button>
	            </div>
          </>}

        </div>
      </div>
      {completion && cmpPos && createPortal(
        <CompletionPopup
          trigger={completion.trigger}
          query={completion.query}
          selectedIdx={completion.selectedIdx}
          onSelect={applyCompletion}
          onClose={() => setCompletion(null)}
          style={{ position: 'fixed', top: cmpPos.top, left: cmpPos.left, width: cmpPos.width }}
        />,
        document.body
      )}
      {showAddPopup && popupPos && createPortal(
        <>
          <div className="add-popup-overlay" onMouseDown={() => setShowAddPopup(false)} />
          <AddPopup onClose={() => setShowAddPopup(false)} onSelectFile={(item) => onAddAttached?.(item)} files={addPopupFiles} style={{ position: 'fixed', top: popupPos.top, right: popupPos.right }} />
        </>,
        document.body
      )}
    </div>
  );
}

// ─── Agent Tasks Panel ────────────────────────────────────────────────────────

const AGENT_TASKS = [
  { id: 't1', label: 'Visit-Booking.md',   time: '2m',  status: null },
  { id: 't2', label: 'Vet-Schedules.md',   time: '15m', status: null },
];

// Real chat sessions shared between the AI Sessions panel and the New Session editor.
// `agent` is a string id; the renderer resolves the icon via <AiChatAgentIcon icon={agent} />.
// Each chat may carry `children.specs.items` listing real `.md` files it touched —
// recentSpecs in AIUXNewSessionEditor uses that linkage to find related chats.
//
// Spec-status chats (`spec-chat-${tabId}-build` / `spec-chat-${tabId}-specified`)
// are tied to a specific AGENT_TASKS entry. Only Visit-Booking (t1) has them in
// initial state; Vet-Schedules (t2) intentionally has no related chats yet.
const AI_SESSION_CHATS = [
  {
    id: 'request-logging',
    title: 'Add request logging to a Java application',
    time: '2m',
    agent: 'claude',
    type: 'chat',
    cloud: false,
    diff: { added: 14, deleted: 23 },
    children: [
      { id: 'changes', label: 'Changes', summary: { added: 14, deleted: 23 }, items: [
        { label: 'index.html', status: 'modified' },
        { label: 'app.js', status: 'added' },
        { label: 'styles.css', status: 'deleted' },
      ]},
      { id: 'specs', label: 'Specs', items: ['1.md', '2.md'] },
      { id: 'sub-threads', label: 'Sub-threads', items: [
        { label: 'Sub-thread 1', agent: 'codex', chatId: 'maven-config' },
        { label: 'Validation follow-up', agent: 'gemini', chatId: 'class-three-params' },
        { label: 'Implementation notes', agent: 'claude', chatId: 'habits-app' },
      ]},
    ],
  },
  {
    id: 'understand-codebase',
    title: 'Understanding the existing Java codebase',
    time: '3m',
    agent: 'claude',
    type: 'chat',
    status: 'loading',
    diff: { added: 5, deleted: 0 },
    children: [
      { id: 'changes', label: 'Changes', summary: { added: 5, deleted: 0 }, items: [
        { label: 'CodebaseMap.md', status: 'added' },
        { label: 'FunctionUtils.java', status: 'modified' },
        { label: 'pom.xml', status: 'modified' },
      ]},
      { id: 'specs', label: 'Specs', items: ['architecture.md', 'entry-points.md'] },
    ],
  },
  {
    id: 'class-three-params-green',
    title: 'Create a class with 3 int parameters',
    time: '22h',
    agent: 'claude',
    type: 'chat',
    cloud: true,
    status: 'ready',
    diff: { added: 8, deleted: 2 },
    children: [
      { id: 'changes', label: 'Changes', summary: { added: 8, deleted: 2 }, items: [
        { label: 'TripleIntConfig.java', status: 'modified' },
        { label: 'TripleIntConfigTest.java', status: 'added' },
        { label: 'README.md', status: 'deleted' },
      ]},
      { id: 'specs', label: 'Specs', items: ['constructor.md', 'validation.md'] },
    ],
  },
  {
    id: 'reminders',
    title: 'Implement reminders and notifications',
    time: '1d',
    agent: 'claude',
    type: 'chat',
  },
  {
    id: 'related-items',
    title: 'Add ‘related items’ section',
    time: '16d',
    agent: 'claude',
    type: 'chat',
  },
];

const VET_SCHEDULES_AC_RUN_STATUSES = [
  {
    status: 'passed',
    checks: [
      { status: 'passed', text: 'Working schedules stored by weekday', chip: null },
    ],
  },
  {
    status: 'passed',
    checks: [
      { status: 'passed', text: 'Off-hours booking validation rejects unavailable slots', chip: null },
    ],
  },
  {
    status: 'passed',
    checks: [
      { status: 'passed', text: 'Demo seed data includes schedule rows', chip: null },
    ],
  },
  {
    status: 'passed',
    checks: [
      { status: 'passed', text: 'Visit-booking flow still uses static hourly slots', chip: null },
    ],
  },
];

const VET_SCHEDULES_PLAN_RUN_STATUSES = [
  { status: 'passed' },
  { status: 'passed' },
  { status: 'passed' },
  { status: 'passed' },
  { status: 'passed' },
];

function createVetSchedulesSpecDocument() {
  return [
    {
      id: 'goal',
      title: 'Goal',
      items: [
        {
          id: 'goal-text',
          type: 'paragraph',
          text: 'Define the parallel Vet Schedules track that enables real availability checks for visit booking without blocking the initial visit-booking rollout.',
        },
      ],
    },
    {
      id: 'plan',
      title: 'Plan',
      items: [
        { id: 'plan-1', type: 'check', checked: false, text: 'Add VetSchedule entity under the vet package' },
        { id: 'plan-2', type: 'check', checked: false, text: 'Add repository queries by vet and date' },
        { id: 'plan-3', type: 'check', checked: false, text: 'Validate requested visit_time against schedule windows' },
        { id: 'plan-4', type: 'check', checked: false, text: 'Seed sample schedules in H2 data.sql' },
        { id: 'plan-5', type: 'check', checked: false, text: 'Add tests for off-hours booking rejection' },
      ],
    },
    {
      id: 'acceptance',
      title: 'Acceptance Criteria',
      items: [
        { id: 'ac-1', type: 'check', checked: false, text: 'Vets can have working schedules stored by day of week.' },
        { id: 'ac-2', type: 'check', checked: false, text: 'Booking validation can reject slots outside a vet\'s working hours.' },
        { id: 'ac-3', type: 'check', checked: false, text: 'Demo seed data includes at least one schedule per vet.' },
        { id: 'ac-4', type: 'check', checked: false, text: 'Visit-booking can keep using static hourly slots while this task is in progress.' },
      ],
    },
    {
      id: 'notes',
      title: 'Notes',
      items: [
        { id: 'note-1', type: 'bullet', text: 'Parallel task from Beat 5 of the PetClinic demo scenario.' },
        { id: 'note-2', type: 'bullet', text: 'Does not change the current visit-booking acceptance criteria yet.' },
      ],
    },
  ].map((section) => withDerivedPlanChildren(section));
}

function createVetSchedulesTaskDraft() {
  return [
    'Define the parallel Vet Schedules track that enables real availability checks for visit booking without blocking the initial visit-booking rollout.',
    '',
    '- Model working hours per vet and weekday.',
    '- Reject bookings outside configured schedule windows.',
    '- Keep the current static hourly slots for the first visit-booking rollout.',
  ].join('\n');
}

function createInteractiveTaskState({
  documentSections,
  genState = 'idle',
  acBaseStatuses = null,
  planBaseStatuses = null,
  seedRunResults = false,
  appliedIssueFixes = null,
  removedIssueIndices = null,
  commentEntries = [],
} = {}) {
  const nextAppliedIssueFixes = cloneIssueStateMap(appliedIssueFixes);
  const nextRemovedIssueIndices = cloneIssueStateMap(removedIssueIndices);

  return {
    genState,
    genProgress: genState === 'done' ? 1 : 0,
    documentSections: Array.isArray(documentSections) ? documentSections : [],
    appliedIssueFixes: nextAppliedIssueFixes,
    removedIssueIndices: nextRemovedIssueIndices,
    acRunResult: seedRunResults && Array.isArray(acBaseStatuses)
      ? buildResolvedRunStatuses(acBaseStatuses, 'ac', nextAppliedIssueFixes, nextRemovedIssueIndices)
      : null,
    planRunResult: seedRunResults && Array.isArray(planBaseStatuses)
      ? buildResolvedRunStatuses(planBaseStatuses, 'plan', nextAppliedIssueFixes, nextRemovedIssueIndices)
      : null,
    commentEntries: Array.isArray(commentEntries) ? commentEntries : [],
  };
}

function getAgentTaskScenario({ tabId = '', label = '' } = {}) {
  const normalizedTabId = typeof tabId === 'string' ? tabId : '';
  const normalizedLabel = normalizeMarkdownDocumentLabelKey(label);

  if (normalizedTabId === 'agent-task-t2' || normalizedLabel === 'vet-schedules.md') {
    const documentSections = createVetSchedulesSpecDocument();
    return {
      initialCode: serializeSpecDocument(documentSections),
      defaultDocument: documentSections,
      acBaseStatuses: VET_SCHEDULES_AC_RUN_STATUSES,
      planBaseStatuses: VET_SCHEDULES_PLAN_RUN_STATUSES,
      initialTaskState: createInteractiveTaskState({
        documentSections,
        genState: 'done',
        acBaseStatuses: VET_SCHEDULES_AC_RUN_STATUSES,
        planBaseStatuses: VET_SCHEDULES_PLAN_RUN_STATUSES,
      }),
    };
  }

  const documentSections = createSpecDocument();
  const isVisitBookingPreset = normalizedTabId === 'agent-task-t1' || normalizedLabel === 'visit-booking.md';

  return {
    initialCode: isVisitBookingPreset ? serializeSpecDocument(documentSections) : ' ',
    defaultDocument: documentSections,
    acBaseStatuses: AC_RUN_STATUSES,
    planBaseStatuses: PLAN_RUN_STATUSES,
    initialTaskState: createInteractiveTaskState({
      documentSections,
      genState: isVisitBookingPreset ? 'done' : 'idle',
      acBaseStatuses: AC_RUN_STATUSES,
      planBaseStatuses: PLAN_RUN_STATUSES,
    }),
  };
}

function getPresetAgentTaskDefinition(taskId) {
  if (taskId === 't1') {
    const scenario = getAgentTaskScenario({ tabId: 'agent-task-t1', label: 'visit-booking.md' });

    return {
      tab: { id: 'agent-task-t1', label: 'Visit-Booking.md', icon: 'fileTypes/markdown', closable: true },
      content: {
        language: 'markdown',
        code: scenario.initialCode,
      },
      kind: 'interactive',
      interactiveState: scenario.initialTaskState,
    };
  }

  if (taskId === 't2') {
    const scenario = getAgentTaskScenario({ tabId: 'agent-task-t2', label: 'vet-schedules.md' });

    return {
      tab: { id: 'agent-task-t2', label: 'Vet-Schedules.md', icon: 'fileTypes/markdown', closable: true },
      content: {
        language: 'markdown',
        code: scenario.initialCode,
      },
      kind: 'interactive',
      interactiveState: scenario.initialTaskState,
    };
  }

  return null;
}

function getAgentTaskTabId(taskId) {
  if (typeof taskId !== 'string' || taskId.length === 0) return null;
  if (taskId.startsWith('agent-task-')) return taskId;
  return getPresetAgentTaskDefinition(taskId)?.tab?.id ?? `agent-task-${taskId}`;
}

function buildInitialEditorTabs() {
  const [visitControllerTab, ...remainingEditorTabs] = MY_EDITOR_TABS;

  return [
    {
      id: AIUX_NEW_SESSION_TAB_ID,
      label: 'New Session',
      icon: <AiChatClaudeIcon />,
      closable: true,
    },
    visitControllerTab,
    {
      id: INITIAL_PLAN_DIFF_TAB_ID,
      label: 'Diff VisitController.java',
      icon: DIFF_TAB_ICON_NAME,
      closable: true,
      sourceTabId: INITIAL_PLAN_DIFF_SOURCE_TAB_ID,
    },
    ...remainingEditorTabs,
  ];
}

function buildInitialEditorTabContents() {
  const sourceTabLabel = MY_EDITOR_TABS.find((tab) => tab.id === INITIAL_PLAN_DIFF_SOURCE_TAB_ID)?.label ?? 'VisitController.java';
  const sourceCode = MY_EDITOR_TAB_CONTENTS[INITIAL_PLAN_DIFF_SOURCE_TAB_ID]?.code ?? '';
  const diffLineText = 'VisitController — inject VetRepository, add @ModelAttribute("vets") with findAll()';
  const diffTarget = normalizeCommentTarget({ kind: 'plan', index: 3 });
  const diffData = buildPlanDiffData({
    sourceCode,
    text: diffLineText,
    statusItem: { status: 'passed' },
    issueTarget: diffTarget,
    sourceTabLabel,
  });
  const diffCode = buildPlanDiffTabContent({
    sourceCode,
    text: diffLineText,
    statusItem: { status: 'passed' },
    issueTarget: diffTarget,
    sourceTabLabel,
  });
  const baseContents = {
    [AIUX_NEW_SESSION_TAB_ID]: {
      language: 'text',
      code: '',
    },
    ...MY_EDITOR_TAB_CONTENTS,
    '1': {
      ...MY_EDITOR_TAB_CONTENTS['1'],
      plainFileData: buildPlainFileData(
        MY_EDITOR_TAB_CONTENTS['1']?.code ?? '',
        MY_EDITOR_TABS.find((t) => t.id === '1')?.label ?? 'VisitController.java',
        MY_EDITOR_TAB_CONTENTS['1']?.language ?? 'java',
      ),
      inspectionSummary: { warningCount: 2, errorCount: 1 },
      initialDiffComments: {},
    },
    '2': {
      ...MY_EDITOR_TAB_CONTENTS['2'],
      plainFileData: buildPlainFileData(
        MY_EDITOR_TAB_CONTENTS['2']?.code ?? '',
        MY_EDITOR_TABS.find((t) => t.id === '2')?.label ?? 'Visit.java',
        MY_EDITOR_TAB_CONTENTS['2']?.language ?? 'java',
      ),
      inspectionSummary: { warningCount: 2, errorCount: 1 },
      initialDiffComments: {},
    },
    [INITIAL_PLAN_DIFF_TAB_ID]: {
      language: diffData.language || 'text',
      code: diffCode,
      diffData,
      diffSourceTabId: INITIAL_PLAN_DIFF_SOURCE_TAB_ID,
      diffTarget,
      diffLineText,
      initialDiffComments: {},
      diffCommentsReadOnly: false,
    },
  };

  return ['t1'].reduce((contents, taskId) => {
    const preset = getPresetAgentTaskDefinition(taskId);
    if (!preset?.tab?.id || !preset?.content) return contents;

    return {
      ...contents,
      [preset.tab.id]: preset.content,
    };
  }, baseContents);
}

function buildInitialInteractiveTaskStates() {
  return ['t1'].reduce((states, taskId) => {
    const preset = getPresetAgentTaskDefinition(taskId);
    if (!preset?.tab?.id || !preset?.interactiveState) return states;

    return {
      ...states,
      [preset.tab.id]: preset.interactiveState,
    };
  }, {});
}

function createAgentTaskExecutionTiming() {
  return {
    activeStartedAt: null,
    lastDurationMs: null,
  };
}

function formatAgentTaskExecutionTime(durationMs) {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return '';

  const totalSeconds = Math.max(1, Math.floor(durationMs / 1000));
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }

  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 60) {
    return `${totalMinutes}m`;
  }

  const totalHours = Math.floor(totalMinutes / 60);
  const remainingMinutes = totalMinutes % 60;
  return remainingMinutes > 0 ? `${totalHours}h ${remainingMinutes}m` : `${totalHours}h`;
}

function resolveAgentTaskExecutionTimeLabel(timing, now = Date.now()) {
  if (!timing) return '';

  if (Number.isFinite(timing.activeStartedAt)) {
    return formatAgentTaskExecutionTime(now - timing.activeStartedAt);
  }

  return formatAgentTaskExecutionTime(timing.lastDurationMs);
}

function IconMdTask({ className = '' } = {}) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path fillRule="evenodd" clipRule="evenodd" d="M12.5929 9.9438L12.5929 4.70001L13.7929 4.70002L13.7929 9.94379L15.0763 8.66037L15.9248 9.5089L13.1929 12.2409L10.4609 9.5089L11.3095 8.66037L12.5929 9.9438Z" fill="#9B6BDA"/>
      <path d="M0.5 4.70001H2.94558L4.65385 9.14463L4.76288 9.60155L4.85635 9.14463L6.51269 4.70001H8.98423V11.9692H7.14096V7.59732L7.17212 7.12482L5.34442 11.9692H4.08269L2.31212 7.17155L2.34327 7.59732V11.9692H0.5V4.70001Z" fill="#9B6BDA"/>
    </svg>
  );
}

function buildTerminalTaskTabs(tabs = []) {
  return tabs.map((tab, index) => ({
    ...tab,
    label: tab.label || (index === 0 ? TERMINAL_TASK_TAB_BASE_LABEL : `Task ${index + 1}.md`),
    icon: <IconMdTask />,
  }));
}

function buildTerminalSessionTabId(sourceTabId = 'current-file') {
  return `terminal-session-${sourceTabId}`;
}

function createTerminalSessionState({ sourceTabId = null, sourceTabLabel = TERMINAL_TASK_TAB_BASE_LABEL } = {}) {
  return {
    sourceTabId,
    sourceTabLabel,
    blocks: [],
    isStreaming: false,
    pendingRun: null,
    permissionPrompt: null,
    acWarningBanner: null,
    viewKey: 0,
  };
}

function removeTabStateEntry(stateMap, tabId) {
  if (!tabId || !stateMap || !(tabId in stateMap)) {
    return stateMap;
  }

  const { [tabId]: _removedState, ...rest } = stateMap;
  return rest;
}

function getAgentTaskIdForEditorTab(tab, tasks = []) {
  if (!tab || !Array.isArray(tasks) || tasks.length === 0) return null;

  const normalizedTabId = typeof tab.id === 'string' ? tab.id : '';
  const normalizedTabLabel = typeof tab.label === 'string' ? tab.label : '';
  const sourceTabId = (typeof tab.sourceTabId === 'string' && tab.sourceTabId)
    ? tab.sourceTabId
    : normalizedTabId.startsWith('plan-diff-')
    ? normalizedTabId.slice('plan-diff-'.length)
    : normalizedTabId;

  const matchingTask = tasks.find((task) => {
    if (!task) return false;

    const candidateIds = new Set([
      typeof task.id === 'string' ? task.id : '',
      typeof task.id === 'string' ? `agent-task-${task.id}` : '',
    ]);

    return (
      candidateIds.has(sourceTabId) ||
      (normalizedTabLabel.length > 0 && task.label === normalizedTabLabel)
    );
  });

  return matchingTask?.id ?? null;
}

function IconWarning() {
  return (
    <svg className="agent-task-status-warning" width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle className="agent-task-status-warning-outer" cx="8" cy="8" r="8" fill="#44321D" />
      <circle className="agent-task-status-warning-middle" cx="8" cy="8" r="5" fill="#875817" />
      <circle className="agent-task-status-warning-core" cx="8" cy="8" r="3" fill="#C7A450" />
    </svg>
  );
}

function IconDone() {
  return <Icon name="general/checkmark" size={16} />;
}

function IconLoaderSpinner() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className="icon loader-spinner at-loader" aria-label="Loading" role="status">
      <rect opacity="0.93" x="2.34961" y="3.76416" width="2" height="4" rx="1" transform="rotate(-45 2.34961 3.76416)" fill="#868A91" />
      <rect opacity="0.78" x="1" y="7" width="4" height="2" rx="1" fill="#868A91" />
      <rect opacity="0.69" x="5.17871" y="9.40991" width="2" height="4" rx="1" transform="rotate(45 5.17871 9.40991)" fill="#868A91" />
      <rect opacity="0.62" x="7" y="11" width="2" height="4" rx="1" fill="#868A91" />
      <rect opacity="0.48" x="9.41003" y="10.8242" width="2" height="4" rx="1" transform="rotate(-45 9.41003 10.8242)" fill="#868A91" />
      <rect opacity="0.38" x="11" y="7" width="4" height="2" rx="1" fill="#868A91" />
      <rect opacity="0.3" x="12.2384" y="2.35001" width="2" height="4" rx="1" transform="rotate(45 12.2384 2.35001)" fill="#868A91" />
      <rect x="7" y="1" width="2" height="4" rx="1" fill="#868A91" />
    </svg>
  );
}

function IconChevron({ expanded }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        flexShrink: 0,
        transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)',
        transition: 'transform 0.24s cubic-bezier(0.22, 1, 0.36, 1)',
      }}
    >
      <Icon name="general/chevronDown" size={16} />
    </span>
  );
}

function resolveAgentTaskPlanFileIcon(fileName = '') {
  const normalized = String(fileName).toLowerCase();
  const candidateIconIds = [];

  if (normalized.endsWith('.java')) candidateIconIds.push('fileTypes/java');
  if (normalized.endsWith('.html')) candidateIconIds.push('fileTypes/html');
  if (normalized.endsWith('.md')) candidateIconIds.push('fileTypes/markdown');
  if (normalized.endsWith('.py')) candidateIconIds.push('fileTypes/python');
  if (normalized.endsWith('.js')) candidateIconIds.push('fileTypes/javaScript');

  candidateIconIds.push('fileTypes/text');

  return candidateIconIds.find((iconId) => Boolean(getIcon(iconId))) ?? 'fileTypes/text';
}

function AgentTaskPlanFileChanges({ added = 0, removed = 0 }) {
  return (
    <span className="agent-task-plan-file-changes">
      {added > 0 && <span className="agent-task-plan-file-added">+{added}</span>}
      {removed > 0 && <span className="agent-task-plan-file-removed">-{removed}</span>}
    </span>
  );
}

const AGENT_TASK_TREE_ROOT_NODE_ID = 'agent-task-tree-root';

function buildAgentTaskTreeTaskNodeId(taskId) {
  return `agent-task-tree-task:${taskId}`;
}

function buildAgentTaskPlanTreeModel({
  task = null,
  sourceTabId = null,
  sourceCode = '',
  documentSections = [],
  planRunResult = null,
  removedIssueIndices = null,
} = {}) {
  if (!task?.id || !sourceTabId) {
    return {
      treeData: [],
      navigationByNodeId: {},
    };
  }

  const viewerData = buildPlanDiffViewerData({
    documentSections,
    planRunResult,
    removedIssueIndices,
  });

  if (!Array.isArray(viewerData.planItems) || viewerData.planItems.length === 0) {
    return {
      treeData: [],
      navigationByNodeId: {},
    };
  }

  const navigationByNodeId = {};
  const fileNodes = viewerData.planItems.flatMap((item, itemIndex) => {
    const originalIndex = Number.isInteger(item?.originalIndex) ? item.originalIndex : itemIndex;
    const visibleIndex = Number.isInteger(item?.visibleIndex) ? item.visibleIndex : itemIndex;
    const issueTarget = { kind: 'plan', index: originalIndex };
    const statusItem = item?.statusItem ?? planRunResult?.[visibleIndex] ?? { status: item?.status ?? 'pending' };
    const diffData = buildPlanDiffData({
      sourceCode,
      text: item?.text ?? '',
      statusItem,
      issueTarget,
      sourceTabLabel: task.label,
    });
    const changedRows = (diffData?.rows ?? []).filter((row) => row?.kind === 'added' || row?.kind === 'removed');
    const rowsByFile = changedRows.reduce((groups, row) => {
      const fileName = row?.file ?? diffData?.sourceTabLabel ?? task.label;
      if (!groups.has(fileName)) {
        groups.set(fileName, {
          rows: [],
          added: 0,
          removed: 0,
        });
      }
      const bucket = groups.get(fileName);
      bucket.rows.push(row);
      if (row?.kind === 'added') bucket.added += 1;
      if (row?.kind === 'removed') bucket.removed += 1;
      return groups;
    }, new Map());

    const orderedFileNames = Array.from(new Set([
      ...(Array.isArray(item?.files) ? item.files : []),
      ...Array.from(rowsByFile.keys()),
    ])).filter((fileName) => typeof fileName === 'string' && fileName.trim().length > 0);

    return orderedFileNames.map((fileName, fileIndex) => {
      const fileMeta = rowsByFile.get(fileName) ?? { rows: [], added: 0, removed: 0 };
      const fileRows = Array.isArray(fileMeta?.rows) ? fileMeta.rows : [];
      const fileNodeId = `agent-task-tree-file:${task.id}:${originalIndex}:${fileIndex}`;
      navigationByNodeId[fileNodeId] = {
        type: 'file',
        taskId: task.id,
        sourceTabId,
        sourceLabel: task.label,
        text: item?.text ?? '',
        statusItem,
        issueTarget,
        activeRowId: fileRows[0]?.id ?? diffData?.focusRowId ?? null,
      };

      return {
        id: fileNodeId,
        label: (
          <span className="agent-task-plan-file-label">
            <span className="agent-task-plan-file-name">{fileName}</span>
            <AgentTaskPlanFileChanges added={fileMeta?.added ?? 0} removed={fileMeta?.removed ?? 0} />
          </span>
          ),
        icon: resolveAgentTaskPlanFileIcon(fileName),
      };
    });
  });

  return {
    treeData: fileNodes,
    navigationByNodeId,
  };
}

function AgentTasksPanel({
  ctx,
  tasks,
  selected,
  onAdd,
  onTaskSelect,
  dismissedSuccessTaskIds = [],
  onDismissSuccess = null,
  planTreesByTaskId = {},
  onPlanTreeNodeSelect = null,
  focusedNodeId = null,
}) {
  const [treeSelectionResetKey, setTreeSelectionResetKey] = useState(0);
  const [selectedTreeNodeId, setSelectedTreeNodeId] = useState(
    () => (selected ? buildAgentTaskTreeTaskNodeId(selected) : AGENT_TASK_TREE_ROOT_NODE_ID),
  );
  const lastTreeDrivenTaskIdRef = useRef(selected ?? null);
  const dismissedSuccessTaskIdSet = useMemo(
    () => new Set(Array.isArray(dismissedSuccessTaskIds) ? dismissedSuccessTaskIds : []),
    [dismissedSuccessTaskIds]
  );
  const { treeData, navigationByNodeId, defaultSelectedNodeId } = useMemo(() => {
    const nextNavigationByNodeId = {};
    const taskNodes = tasks.map((task) => {
      const taskNodeId = buildAgentTaskTreeTaskNodeId(task.id);
      const taskTree = planTreesByTaskId?.[task.id] ?? null;
      const hasChanges = Array.isArray(taskTree?.treeData) && taskTree.treeData.length > 0;
      const isTaskSelected = selected === task.id;
      const shouldExpandByDefault = false;

      nextNavigationByNodeId[taskNodeId] = {
        type: 'task',
        taskId: task.id,
      };

      if (taskTree?.navigationByNodeId) {
        Object.assign(nextNavigationByNodeId, taskTree.navigationByNodeId);
      }

      const hasSelectedChild = hasChanges && Array.isArray(taskTree.treeData)
        && taskTree.treeData.some((fileNode) => fileNode.id === selectedTreeNodeId);

      return {
        id: taskNodeId,
        label: (
          <span
            className="agent-task-tree-task-label"
            data-demo-id={`agent-task-row-${toDemoSlug(task.label || task.id)}`}
          >
            <span className="agent-task-tree-task-name">{task.label}</span>
            {task.indicator === 'loading' && (
              <span className="agent-task-tree-task-meta">
                <IconLoaderSpinner />
              </span>
            )}
            {task.indicator === 'warning' && !isTaskSelected && (
              <span className="agent-task-tree-task-meta">
                <IconWarning />
              </span>
            )}
          </span>
        ),
        icon: <IconMdTask />,
        secondaryText: task.time || undefined,
        isExpanded: (hasSelectedChild || (shouldExpandByDefault && hasChanges)) || undefined,
        children: hasChanges ? taskTree.treeData : undefined,
      };
    });

    return {
      treeData: [{
        id: AGENT_TASK_TREE_ROOT_NODE_ID,
        label: PROJECT_NAME,
        icon: 'nodes/folder',
        isExpanded: true,
        children: taskNodes,
      }],
      navigationByNodeId: nextNavigationByNodeId,
      defaultSelectedNodeId:
        selectedTreeNodeId === AGENT_TASK_TREE_ROOT_NODE_ID || nextNavigationByNodeId[selectedTreeNodeId]
          ? selectedTreeNodeId
          : (selected ? buildAgentTaskTreeTaskNodeId(selected) : AGENT_TASK_TREE_ROOT_NODE_ID),
    };
  }, [dismissedSuccessTaskIdSet, planTreesByTaskId, selected, selectedTreeNodeId, tasks]);
  useEffect(() => {
    if (!selected) return;

    const nextTaskNodeId = buildAgentTaskTreeTaskNodeId(selected);

    if (lastTreeDrivenTaskIdRef.current === selected) {
      lastTreeDrivenTaskIdRef.current = null;
      setSelectedTreeNodeId((prev) => (prev === nextTaskNodeId ? prev : nextTaskNodeId));
      return;
    }

    setSelectedTreeNodeId(nextTaskNodeId);
    setTreeSelectionResetKey((prev) => prev + 1);
  }, [selected]);
  useEffect(() => {
    if (!focusedNodeId) return;
    setSelectedTreeNodeId(focusedNodeId);
    setTreeSelectionResetKey((prev) => prev + 1);
  }, [focusedNodeId]);
  const handleTreeNodeSelect = useCallback((nodeId, isSelected) => {
    const navigationEntry = navigationByNodeId[nodeId] ?? null;
    if (!navigationEntry) return;

    setSelectedTreeNodeId((prev) => (prev === nodeId ? prev : nodeId));

    if (!isSelected) {
      setTreeSelectionResetKey((prev) => prev + 1);
    }

    if (navigationEntry.type === 'task') {
      const task = tasks.find((item) => item?.id === navigationEntry.taskId) ?? null;
      if (!task) return;

      lastTreeDrivenTaskIdRef.current = task.id;
      if (task.indicator === 'success') {
        onDismissSuccess?.(task.id);
      }
      onTaskSelect?.(task);
      return;
    }

    lastTreeDrivenTaskIdRef.current = navigationEntry.taskId ?? null;
    onPlanTreeNodeSelect?.(navigationEntry.taskId, nodeId);
  }, [navigationByNodeId, onDismissSuccess, onPlanTreeNodeSelect, onTaskSelect, tasks]);

  return (
    <ToolWindow
      title="Agent Tasks"
      width="100%"
      height="auto"
      actions={['add', 'more', 'minimize']}
      focused={ctx.focusedPanel === 'left'}
      onFocus={() => ctx.setFocusedPanel('left')}
      onActionClick={(action) => {
        if (action === 'minimize') ctx.setShowLeftPanel(false);
        if (action === 'add' && onAdd) onAdd();
      }}
      className="agent-tasks-window main-window-tool-window main-window-tool-window-left"
    >
      <div className="agent-task-tree">
        <Tree
          key={`agent-task-tree-${treeSelectionResetKey}`}
          data={treeData}
          defaultSelectedId={defaultSelectedNodeId}
          onNodeSelect={handleTreeNodeSelect}
        />
      </div>
    </ToolWindow>
  );
}

function snapshotAiChatMessageAttachment(attachment = null) {
  if (!attachment || typeof attachment !== 'object') {
    return attachment;
  }

  const diffComments = normalizeStoredDiffCommentsState(attachment.diffComments);
  const sddCommentEntries = normalizeSpecVersionCommentEntries(attachment.sddCommentEntries);
  const sddCommentCount = sddCommentEntries.reduce((sum, entry) => (
    sum + (Array.isArray(entry.comments) ? entry.comments.length : 0)
  ), 0);

  return {
    ...attachment,
    diffComments: Object.keys(diffComments).length > 0 ? diffComments : attachment.diffComments ?? null,
    sddCommentEntries,
    commentCount: Number.isFinite(attachment.commentCount)
      ? attachment.commentCount
      : Math.max(flattenStoredDiffCommentsState(diffComments).length, sddCommentCount),
  };
}

function getAiChatAttachmentCommentPreviewItems(attachment = null) {
  if (!attachment || typeof attachment !== 'object') {
    return [];
  }

  const seenComments = new Set();
  const addComment = (items, comment) => {
    if (typeof comment !== 'string') return items;
    const trimmedComment = comment.trim();
    if (!trimmedComment) return items;

    const normalizedComment = trimmedComment.toLowerCase();
    if (seenComments.has(normalizedComment)) return items;
    seenComments.add(normalizedComment);
    items.push(trimmedComment);
    return items;
  };

  const items = [];
  flattenStoredDiffCommentsState(attachment.diffComments).forEach((comment) => addComment(items, comment));
  normalizeSpecVersionCommentEntries(attachment.sddCommentEntries).forEach((entry) => {
    (entry.comments ?? []).forEach((comment) => addComment(items, comment));
  });

  return items;
}

function getAiChatAttachmentSourcePreviewItems(attachment = null) {
  if (!attachment?.isSddDocument || !Array.isArray(attachment.commentSources)) {
    return [];
  }

  return attachment.commentSources
    .filter((source) => source && typeof source.label === 'string' && source.label.trim().length > 0)
    .map((source) => ({
      key: source.key ?? source.label,
      label: source.label.trim(),
      icon: source.icon ?? 'general/balloon',
      count: Number.isFinite(source.count) ? source.count : 0,
      navigationTabId: source.navigationTabId ?? null,
      navigationRowId: source.navigationRowId ?? null,
      rawIndex: Number.isInteger(source.rawIndex) ? source.rawIndex : null,
    }));
}

function ChatToolWindow({
  ctx,
  onBackToHistory = null,
  onOpenDiffTab = null,
  onClearDiffComments = null,
  onClearAllDiffAttachments = null,
  onRemoveComposerAttachment = null,
  onOpenPlainFileArchive = null,
  onOpenSddDocument = null,
  onOpenAttachmentSource = null,
  onNewChat = null,
  diffComments = {},
  diffCommentCount = 0,
  sddCommentEntries = [],
  sddCommentCount = 0,
  sddRelatedCommentIssues = [],
  composerDiffAttachments = [],
  scrollTarget = null,
  selectedChatId: controlledSelectedChatId = 'visit-model-attributes',
  onSelectedChatIdChange = null,
  sentChatMessages: controlledSentChatMessages = null,
  sentChatMessagesByChatId: controlledSentChatMessagesByChatId = null,
  onSentChatMessagesChange = null,
  onChatMessageSent = null,
  chatScenarios = AI_CHAT_SCENARIOS,
  recentChatItems = AI_CHAT_RECENT_ITEMS,
  olderChatItems = AI_CHAT_OLDER_THAN_7_ITEMS,
  plainFileGutterCommentsEnabled = true,
  onPlainFileGutterCommentsEnabledChange = null,
  diffGutterCommentsEnabled = true,
  onDiffGutterCommentsEnabledChange = null,
  fileCommentsOptionIsNew = false,
  diffCommentsOptionIsNew = false,
  onFileCommentsOptionSeen = null,
  onDiffCommentsOptionSeen = null,
  showFileCommentsSuggestionBanner = false,
  onEnableFileCommentsFromBanner = null,
  onDismissFileCommentsSuggestionBanner = null,
  onCommentAttachmentResponseStart = null,
  onCommentAttachmentResponseComplete = null,
}) {
  const [selectedChatId, setSelectedChatId] = useState(controlledSelectedChatId);
  const [composerText, setComposerText] = useState('');
  const [localSentChatMessages, setLocalSentChatMessages] = useState([]);
  const [optimisticSentMessagesByChatId, setOptimisticSentMessagesByChatId] = useState({});
  const currentChatId = controlledSelectedChatId ?? selectedChatId;
  const controlledSentChatMessagesForSelected = controlledSentChatMessagesByChatId
    ? (controlledSentChatMessagesByChatId[currentChatId] ?? [])
    : controlledSentChatMessages;
  const optimisticSentMessages = optimisticSentMessagesByChatId[currentChatId] ?? [];
  const sentChatMessages = controlledSentChatMessagesForSelected
    ? [
        ...controlledSentChatMessagesForSelected,
        ...optimisticSentMessages.filter((message) => (
          !controlledSentChatMessagesForSelected.some((controlledMessage) => controlledMessage.id === message.id)
        )),
      ]
    : localSentChatMessages;
  const [dismissedComposerAttachmentIdsByChatId, setDismissedComposerAttachmentIdsByChatId] = useState({});
  const [expandedAttachmentSourceId, setExpandedAttachmentSourceId] = useState(null);
  const [isChatListOpen, setIsChatListOpen] = useState(false);
  const [chatListPopupStyle, setChatListPopupStyle] = useState(null);
  const [addContextPopupRect, setAddContextPopupRect] = useState(null);
  const chatScrollRef = useRef(null);
  const chatTitleChevronRef = useRef(null);
  const chatListPopupRef = useRef(null);
  const composerTextareaRef = useRef(null);
  const commentResponseTimersRef = useRef({});
  const selectedChat = chatScenarios[currentChatId] ?? AI_CHAT_SCENARIOS['visit-model-attributes'];
  const latestSddCommentEntries = useMemo(
    () => normalizeSpecVersionCommentEntries(sddCommentEntries),
    [sddCommentEntries],
  );
  const latestSddRelatedCommentIssues = useMemo(
    () => (Array.isArray(sddRelatedCommentIssues) ? sddRelatedCommentIssues : []),
    [sddRelatedCommentIssues],
  );
  const latestSddCommentCount = useMemo(
    () => (Number.isFinite(sddCommentCount)
      ? sddCommentCount
      : getAggregatedCommentIssueCount(latestSddCommentEntries, latestSddRelatedCommentIssues)),
    [latestSddCommentEntries, latestSddRelatedCommentIssues, sddCommentCount],
  );

  useEffect(() => {
    if (!addContextPopupRect) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setAddContextPopupRect(null);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [addContextPopupRect]);

  useEffect(() => () => {
    Object.values(commentResponseTimersRef.current).forEach((timerId) => {
      window.clearTimeout(timerId);
    });
    commentResponseTimersRef.current = {};
  }, []);

  const normalizeSddAttachment = useCallback((attachment) => {
    if (!attachment?.isSddDocument) {
      return attachment;
    }

    const hasOwnCommentEntries = Object.prototype.hasOwnProperty.call(attachment, 'sddCommentEntries');
    const attachmentCommentEntries = normalizeSpecVersionCommentEntries(attachment.sddCommentEntries);
    const effectiveCommentEntries = hasOwnCommentEntries
      ? attachmentCommentEntries
      : latestSddCommentEntries;
    const effectiveRelatedCommentIssues = latestSddRelatedCommentIssues;
    const entryCommentCount = getCommentEntryTotalCount(effectiveCommentEntries, effectiveRelatedCommentIssues);
    const effectiveCommentCount = Math.max(entryCommentCount, latestSddCommentCount);

    return {
      ...attachment,
      commentCount: effectiveCommentCount,
      isSddCommentAttachment: effectiveCommentCount > 0,
      sddCommentEntries: effectiveCommentEntries,
      commentSources: buildCommentSourceSummaries({
        attachment,
        commentEntries: effectiveCommentEntries,
        relatedCommentIssues: effectiveRelatedCommentIssues,
      }),
    };
  }, [latestSddCommentCount, latestSddCommentEntries, latestSddRelatedCommentIssues]);
  const isEmptyChatState = Boolean(selectedChat.emptyState);
  const composerPlaceholder = isEmptyChatState
    ? 'Type your task, use @ to add files or / for commands'
    : 'Type task, use @mentions or /commands';
  const selectedChatMessageAttachments = Array.isArray(selectedChat.attachments)
    ? selectedChat.attachments.map(normalizeSddAttachment)
    : [];
  const selectedChatMessageId = selectedChat.messageId ?? `chat-${currentChatId}`;
  const dismissedAttachmentIds = dismissedComposerAttachmentIdsByChatId[currentChatId] ?? {};
  const chatComposerAttachments = (selectedChat.emptyState || selectedChat.showAttachmentsInComposer) && Array.isArray(selectedChatMessageAttachments)
    ? selectedChatMessageAttachments
    : [];
  const composerAttachmentIdSignature = useMemo(() => {
    const attachmentIds = [...chatComposerAttachments, ...(Array.isArray(composerDiffAttachments) ? composerDiffAttachments : [])]
      .map((attachment) => attachment?.id)
      .filter((id) => typeof id === 'string' && id.length > 0);
    return Array.from(new Set(attachmentIds)).sort().join('\n');
  }, [chatComposerAttachments, composerDiffAttachments]);
  const visibleComposerAttachments = [...chatComposerAttachments, ...(Array.isArray(composerDiffAttachments) ? composerDiffAttachments : [])]
    .map(normalizeSddAttachment)
    .filter((attachment, index, attachments) => (
      attachment && !attachments.slice(index + 1).some((candidate) => candidate?.id === attachment.id)
    ))
    .filter((attachment) => !(attachment?.id in dismissedAttachmentIds));
  const hasComposerAttachment = visibleComposerAttachments.length > 0;
  const canSendMessage = composerText.trim().length > 0;

  useEffect(() => {
    if (!expandedAttachmentSourceId) return;
    if (visibleComposerAttachments.some((attachment) => attachment?.id === expandedAttachmentSourceId)) return;
    setExpandedAttachmentSourceId(null);
  }, [expandedAttachmentSourceId, visibleComposerAttachments]);

  useEffect(() => {
    const activeAttachmentIds = new Set(composerAttachmentIdSignature.split('\n').filter(Boolean));

    setDismissedComposerAttachmentIdsByChatId((prev) => {
      const dismissedForChat = prev[currentChatId] ?? {};
      const dismissedEntries = Object.entries(dismissedForChat);
      if (dismissedEntries.length === 0) return prev;

      const nextDismissedForChat = dismissedEntries.reduce((next, [attachmentId, value]) => {
        if (activeAttachmentIds.has(attachmentId)) {
          next[attachmentId] = value;
        }
        return next;
      }, {});

      if (Object.keys(nextDismissedForChat).length === dismissedEntries.length) return prev;
      if (Object.keys(nextDismissedForChat).length === 0) {
        const { [currentChatId]: _removed, ...remainingDismissedByChatId } = prev;
        return remainingDismissedByChatId;
      }

      return {
        ...prev,
        [currentChatId]: nextDismissedForChat,
      };
    });
  }, [composerAttachmentIdSignature, currentChatId]);

  useEffect(() => {
    setSelectedChatId(controlledSelectedChatId);
  }, [controlledSelectedChatId]);

  useEffect(() => {
    if (!Array.isArray(controlledSentChatMessagesForSelected) || controlledSentChatMessagesForSelected.length === 0) return;

    setOptimisticSentMessagesByChatId((prev) => {
      const currentOptimisticMessages = prev[currentChatId] ?? [];
      if (currentOptimisticMessages.length === 0) return prev;

      const controlledIds = new Set(controlledSentChatMessagesForSelected.map((message) => message.id));
      const nextOptimisticMessages = currentOptimisticMessages.filter((message) => !controlledIds.has(message.id));
      if (nextOptimisticMessages.length === currentOptimisticMessages.length) return prev;

      return {
        ...prev,
        [currentChatId]: nextOptimisticMessages,
      };
    });
  }, [controlledSentChatMessagesForSelected, currentChatId]);

  useEffect(() => {
    if (!scrollTarget?.restoreComposerAttachment) return;
    const targetChatId = scrollTarget.chatId ?? currentChatId;
    if (!targetChatId) return;

    setDismissedComposerAttachmentIdsByChatId((prev) => {
      if (!(targetChatId in prev)) return prev;
      const { [targetChatId]: _dismissedIds, ...remainingDismissedAttachments } = prev;
      return remainingDismissedAttachments;
    });
  }, [currentChatId, scrollTarget?.chatId, scrollTarget?.nonce, scrollTarget?.restoreComposerAttachment]);

  useEffect(() => {
    const scrollElement = chatScrollRef.current;
    if (!scrollElement || sentChatMessages.length === 0) return;
    scrollElement.scrollTop = scrollElement.scrollHeight;
  }, [sentChatMessages.length]);

  useEffect(() => {
    const targetMessageId = scrollTarget?.messageId;
    if (!targetMessageId) return undefined;

    let timeoutId = 0;
    let frameId = 0;

    const scrollToTarget = (attempt = 0) => {
      const scrollElement = chatScrollRef.current;
      const searchRoot = scrollElement?.closest('.ai-chat-surface') ?? scrollElement;
      const targetElement = searchRoot
        ? Array.from(searchRoot.querySelectorAll('.ai-chat-user-card[data-ai-chat-message-id]')).find(
            (node) => node instanceof HTMLElement && node.dataset.aiChatMessageId === targetMessageId,
          )
        : null;

      if (scrollElement && targetElement instanceof HTMLElement && scrollElement.contains(targetElement)) {
        const targetTop = targetElement.offsetTop - scrollElement.offsetTop;
        scrollElement.scrollTo({
          top: Math.max(0, targetTop - ((scrollElement.clientHeight - targetElement.offsetHeight) / 2)),
          behavior: 'smooth',
        });
        return;
      }

      if (scrollElement && targetElement instanceof HTMLElement) {
        scrollElement.scrollTo({ top: 0, behavior: 'smooth' });
        targetElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        return;
      }

      if (attempt < 10) {
        timeoutId = window.setTimeout(() => scrollToTarget(attempt + 1), 50);
      }
    };

    frameId = window.requestAnimationFrame(() => scrollToTarget());

    return () => {
      if (frameId) window.cancelAnimationFrame(frameId);
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [scrollTarget?.messageId, scrollTarget?.nonce, sentChatMessages.length]);

  useEffect(() => {
    if (!isChatListOpen) return undefined;

    const updatePopupPosition = () => {
      const titleButtonRect = chatTitleChevronRef.current?.getBoundingClientRect();
      const chatWindowRect = chatTitleChevronRef.current?.closest('.ai-chat-window')?.getBoundingClientRect();
      if (!titleButtonRect || !chatWindowRect) return;

      const viewportPadding = 8;
      const popupWidth = Math.min(chatWindowRect.width - 16, window.innerWidth - (viewportPadding * 2));
      setChatListPopupStyle({
        top: Math.max(viewportPadding, titleButtonRect.bottom + 2),
        left: Math.max(viewportPadding, Math.min(chatWindowRect.left + 8, window.innerWidth - popupWidth - viewportPadding)),
        width: popupWidth,
      });
    };

    updatePopupPosition();

    const handlePointerDown = (event) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (chatListPopupRef.current?.contains(target) || chatTitleChevronRef.current?.contains(target)) {
        return;
      }
      setIsChatListOpen(false);
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsChatListOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', updatePopupPosition);
    window.addEventListener('scroll', updatePopupPosition, true);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', updatePopupPosition);
      window.removeEventListener('scroll', updatePopupPosition, true);
    };
  }, [isChatListOpen]);

  const handleSendMessage = useCallback(() => {
    const messageText = (composerTextareaRef.current?.value ?? composerText).trim();
    if (!messageText) return;
    const targetChatId = currentChatId;

    const messageAttachments = hasComposerAttachment
      ? visibleComposerAttachments.map((attachment) => snapshotAiChatMessageAttachment(attachment))
      : [];
    const commentAttachments = messageAttachments.filter((attachment) => (
      Number.isFinite(attachment?.commentCount) && attachment.commentCount > 0
    ));
    const shouldStreamCommentResponse = commentAttachments.length > 0;

    const newMessage = {
      id: `${targetChatId}-${Date.now()}-${sentChatMessages.length}`,
      text: messageText,
      attachments: messageAttachments,
    };
    const assistantMessageId = `${targetChatId}-assistant-${Date.now()}-${sentChatMessages.length}`;
    const assistantMessage = shouldStreamCommentResponse
      ? {
          id: assistantMessageId,
          role: 'assistant',
          text: '',
          streaming: true,
        }
      : null;
    const appendMessage = (prev) => assistantMessage
      ? [...prev, newMessage, assistantMessage]
      : [...prev, newMessage];
    const updateMessages = (updater) => {
      if (onSentChatMessagesChange) {
        onSentChatMessagesChange(updater, targetChatId);
      } else {
        setLocalSentChatMessages(updater);
      }
    };

    updateMessages(appendMessage);
    if (onSentChatMessagesChange) {
      setOptimisticSentMessagesByChatId((prev) => ({
        ...prev,
        [targetChatId]: [
          ...(prev[targetChatId] ?? []).filter((message) => (
            message.id !== newMessage.id && message.id !== assistantMessageId
          )),
          newMessage,
          ...(assistantMessage ? [assistantMessage] : []),
        ],
      }));
    }
    setComposerText('');
    if (hasComposerAttachment) {
      const dismissedIds = {};
      for (const attachment of visibleComposerAttachments) {
        dismissedIds[attachment.id] = true;
      }
      setDismissedComposerAttachmentIdsByChatId((prev) => ({
        ...prev,
        [targetChatId]: { ...(prev[targetChatId] ?? {}), ...dismissedIds },
      }));
      if (!shouldStreamCommentResponse) {
        onClearAllDiffAttachments?.({ chatId: targetChatId, attachments: messageAttachments });
      }
    }

    if (shouldStreamCommentResponse) {
      onCommentAttachmentResponseStart?.({ chatId: targetChatId, attachments: commentAttachments });
      onClearAllDiffAttachments?.({ chatId: targetChatId, attachments: commentAttachments });
      const fullResponse = commentAttachments.length === 1
        ? 'I reviewed the attached comment and will use it as context for this response.'
        : `I reviewed ${commentAttachments.length} attached comment threads and will use them as context for this response.`;
      const timerKey = `${targetChatId}:${assistantMessageId}`;
      let index = 0;
      const streamNextChunk = () => {
        delete commentResponseTimersRef.current[timerKey];
        index = Math.min(fullResponse.length, index + 2);
        const nextText = fullResponse.slice(0, index);
        const isComplete = index >= fullResponse.length;

        updateMessages((prev) => prev.map((message) => (
          message.id === assistantMessageId
            ? { ...message, text: nextText, streaming: !isComplete }
            : message
        )));

        setOptimisticSentMessagesByChatId((prev) => ({
          ...prev,
          [targetChatId]: (prev[targetChatId] ?? []).map((message) => (
            message.id === assistantMessageId
              ? { ...message, text: nextText, streaming: !isComplete }
              : message
          )),
        }));

        if (isComplete) {
          onCommentAttachmentResponseComplete?.({ chatId: targetChatId, attachments: commentAttachments });
          return;
        }

        commentResponseTimersRef.current[timerKey] = window.setTimeout(streamNextChunk, 96);
      };

      commentResponseTimersRef.current[timerKey] = window.setTimeout(streamNextChunk, 240);
    }
    onChatMessageSent?.({ chatId: targetChatId, message: newMessage });
  }, [composerText, currentChatId, hasComposerAttachment, onChatMessageSent, onClearAllDiffAttachments, onCommentAttachmentResponseComplete, onCommentAttachmentResponseStart, onSentChatMessagesChange, sentChatMessages.length, visibleComposerAttachments]);

  const handleContextAttachmentOpen = useCallback((messageId, attachment, { archived = true } = {}) => {
    const restoredRowId = Object.keys(attachment?.diffComments ?? {})[0] ?? null;
    if (attachment?.isSddDocument) {
      onOpenSddDocument?.({
        attachment,
        commentEntries: attachment.sddCommentEntries ?? [],
        isCommentAttachment: Boolean(attachment.isSddCommentAttachment),
        contextMessageId: messageId,
        contextChatId: currentChatId,
        sourceTabId: attachment.sourceTabId,
      });
      return;
    }
    if (attachment?.isPlainFile && attachment?.diffTabId) {
      onOpenPlainFileArchive?.(
        attachment.diffTabId,
        attachment.diffComments ?? {},
        messageId,
        currentChatId,
        restoredRowId,
        { archived },
      );
      return;
    }
    const diffRequest = attachment?.diffRequest ?? AI_CHAT_VISIT_CONTROLLER_DIFF_REQUEST;
    onOpenDiffTab?.({
      ...diffRequest,
      initialDiffCommentsOverride: attachment?.diffComments ?? {},
      commentsReadOnly: archived,
      contextMessageId: messageId,
      contextChatId: currentChatId,
      navigation: {
        activeRowId: restoredRowId,
      },
    });
  }, [currentChatId, onOpenDiffTab, onOpenPlainFileArchive, onOpenSddDocument]);

  const handleAttachmentSourceOpen = useCallback((event, attachment, source, { archived = true } = {}) => {
    event.preventDefault();
    event.stopPropagation();

    if (source?.navigationTabId) {
      onOpenAttachmentSource?.({
        attachment,
        source,
        messageId: selectedChatMessageId,
        chatId: currentChatId,
        archived,
      });
      return;
    }

    if (attachment?.isSddDocument) {
      onOpenSddDocument?.({
        attachment,
        commentEntries: attachment.sddCommentEntries ?? [],
        isCommentAttachment: Boolean(attachment.isSddCommentAttachment),
        contextMessageId: selectedChatMessageId,
        contextChatId: currentChatId,
        sourceTabId: attachment.sourceTabId,
      });
    }
  }, [currentChatId, onOpenAttachmentSource, onOpenSddDocument, selectedChatMessageId]);

  const handleChatSelect = useCallback((chatId) => {
    setSelectedChatId(chatId);
    onSelectedChatIdChange?.(chatId);
    setComposerText('');
    setIsChatListOpen(false);
    requestAnimationFrame(() => {
      const scrollElement = chatScrollRef.current;
      if (scrollElement) {
        scrollElement.scrollTop = 0;
      }
    });
  }, [onSelectedChatIdChange]);

  const handleChatListDocumentOpen = useCallback((group) => {
    if (!group?.sourceTabId) return;
    setIsChatListOpen(false);
    onOpenSddDocument?.({
      sourceTabId: group.sourceTabId,
    });
  }, [onOpenSddDocument]);

  return (
	    <ToolWindow
	      title={isEmptyChatState ? 'AI Chat' : selectedChat.title}
      width={377}
      height="auto"
      focused={ctx.focusedPanel === 'left'}
      onFocus={() => ctx.setFocusedPanel('left')}
      onActionClick={(action) => {
        if (action === 'minimize') ctx.setShowLeftPanel(false);
      }}
      actions={[]}
	      toolbarExtra={(
	        <div className="ai-chat-header-extra">
	          {onBackToHistory ? (
	            <IconButton
	              icon="general/chevronLeft"
	              tooltip="Back to Agents"
	              className="ai-chat-toolbar-button ai-chat-back-button"
	              onClick={onBackToHistory}
	            />
	          ) : null}
	          <button
	            ref={chatTitleChevronRef}
	            className={`ai-chat-title-button${isChatListOpen ? ' is-selected' : ''}`}
	            type="button"
	            aria-label="Open chats list"
	            aria-expanded={isChatListOpen}
	            onClick={() => setIsChatListOpen((prev) => !prev)}
	          >
	            <span className="ai-chat-title-button-text">{selectedChat.title}</span>
	            <Icon name="general/chevronDown" size={16} />
	          </button>
          <div className="ai-chat-header-toolbar">
            <button className="ai-chat-new-chat-button" type="button" title="New Chat" aria-label="New Chat" onClick={() => onNewChat?.()}>
              <Icon name="general/add" size={16} />
              <span>New Chat</span>
            </button>
            <IconButton icon="general/openNewTab" tooltip="Open in New Tab" className="ai-chat-toolbar-button" />
            <IconButton icon="general/moreVertical" tooltip="More Options" className="ai-chat-toolbar-button" />
            <IconButton icon="general/hide" tooltip="Hide" className="ai-chat-toolbar-button" onClick={() => ctx.setShowLeftPanel(false)} />
          </div>
        </div>
      )}
      className="ai-chat-window main-window-tool-window main-window-tool-window-left"
    >
      {isChatListOpen && chatListPopupStyle && typeof document !== 'undefined' && createPortal(
	          <ChatListPopup
	            ref={chatListPopupRef}
	            style={chatListPopupStyle}
	            selectedChatId={currentChatId}
              activeChatId={currentChatId}
	            onSelectChat={handleChatSelect}
	            onOpenDocument={handleChatListDocumentOpen}
	          recentItems={recentChatItems}
	          olderItems={olderChatItems}
            showActiveBadge={false}
	        />,
	        document.body,
	      )}
	      <div className="ai-chat-surface">
	        {!isEmptyChatState && sentChatMessages.length === 0 && (
	          <ChatUserCard
	            messageId={selectedChatMessageId}
            attachments={selectedChatMessageAttachments}
            onAttachmentOpen={
              selectedChatMessageAttachments.length > 0
                ? (attachment) => handleContextAttachmentOpen(selectedChatMessageId, attachment)
                : null
            }
          >
            {selectedChat.userPrompt}
          </ChatUserCard>
        )}

	        <div className={`ai-chat-scroll${isEmptyChatState && sentChatMessages.length === 0 ? ' is-empty-state' : ''}`} ref={chatScrollRef}>
	          {isEmptyChatState && sentChatMessages.length === 0 && (
	            <AiChatEmptyState />
	          )}
	          {!isEmptyChatState && sentChatMessages.length > 0 && (
	            <ChatUserCard
              messageId={selectedChatMessageId}
              attachments={selectedChatMessageAttachments}
              onAttachmentOpen={
                selectedChatMessageAttachments.length > 0
                  ? (attachment) => handleContextAttachmentOpen(selectedChatMessageId, attachment)
                  : null
              }
            >
              {selectedChat.userPrompt}
            </ChatUserCard>
          )}

	          {!isEmptyChatState && (
	            <div className="ai-chat-ai-message">
                <div className="ai-chat-assistant-header">
                  <AiChatClaudeIcon />
                  <span>Claude Agent</span>
                </div>
	              {selectedChat.assistantParagraphs.map((paragraph) => (
	                <p className="ai-chat-assistant-copy" key={paragraph}>{paragraph}</p>
	              ))}
	            </div>
	          )}

	          {!isEmptyChatState && selectedChat.changeCard && (
	            <ChatChangeCard icon="java" name={selectedChat.changeCard.name} added={selectedChat.changeCard.added} removed={selectedChat.changeCard.removed} onClick={onOpenDiffTab && selectedChat.diffRequest ? () => onOpenDiffTab(selectedChat.diffRequest) : null}>
	              <SyntaxCode code={selectedChat.changeCard.code} />
	            </ChatChangeCard>
	          )}

	          {!isEmptyChatState && (
	            <section className="ai-chat-result">
	              <h4>Result</h4>
	              {selectedChat.result.map((paragraph) => (
	                <p key={paragraph}>{paragraph}</p>
	              ))}
	            </section>
	          )}

	          {!isEmptyChatState && (
	            <div className="ai-chat-command-card">
	              <div className="ai-chat-command-left">
	                <span className="ai-chat-terminal-icon" aria-hidden="true">
	                  <Icon name="toolwindows/terminal" size={16} />
	                </span>
	                <span>{selectedChat.command}</span>
	              </div>
	              <div className="ai-chat-command-actions">
	                <IconButton icon="general/moreVertical" tooltip="More Options" className="ai-chat-toolbar-button" />
	                <AiChatToolbarIconButton label="Open in Tool Window">
	                  <AiChatOpenInToolWindowIcon />
	                </AiChatToolbarIconButton>
	                <IconButton icon="general/expandAll" tooltip="Expand All" className="ai-chat-toolbar-button" />
	              </div>
	            </div>
	          )}

          {sentChatMessages.map((message) => (
            message.role === 'assistant'
              ? (
                <ChatAssistantMessage key={message.id} streaming={Boolean(message.streaming)}>
                  {message.text}
                </ChatAssistantMessage>
              )
              : (
	                <ChatUserCard
	                  key={message.id}
	                  messageId={message.id}
	                  attachments={message.attachments}
	                  onAttachmentOpen={(attachment) => handleContextAttachmentOpen(message.id, attachment, { archived: true })}
	                >
                  {message.text}
                </ChatUserCard>
              )
          ))}
        </div>

        {showFileCommentsSuggestionBanner && !plainFileGutterCommentsEnabled && (
          <Banner
            className="ai-chat-file-comments-banner"
            type="info"
            showIcon
            showCloseButton
            onClose={onDismissFileCommentsSuggestionBanner}
            actions={[{
              label: 'Enable File Comments',
              type: 'primary',
              onClick: onEnableFileCommentsFromBanner,
            }]}
          >
            You can now leave comments directly on editor files.
          </Banner>
        )}

        <div className="ai-chat-composer">
	          <textarea
              ref={composerTextareaRef}
	            rows={1}
	            placeholder={composerPlaceholder}
            aria-label="Task prompt"
            value={composerText}
            onChange={(event) => setComposerText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' || event.shiftKey) return;
              event.preventDefault();
              handleSendMessage();
            }}
          />
          {hasComposerAttachment && (
            <div className="ai-chat-attachments">
              {visibleComposerAttachments.map((attachment) => {
                const commentSources = Array.isArray(attachment.commentSources) ? attachment.commentSources : [];
                const hasNestedCommentSources = attachment.isSddDocument && commentSources.some((source) => (
                  source?.key !== attachment.sourceTabId
                ));
                const canShowCommentSources = hasNestedCommentSources;
                const isSourceListOpen = expandedAttachmentSourceId === attachment.id;
                const commentPreviewItems = getAiChatAttachmentCommentPreviewItems(attachment);
                const visibleCommentPreviewItems = commentPreviewItems.slice(0, 3);
                const hiddenCommentPreviewCount = Math.max(0, commentPreviewItems.length - visibleCommentPreviewItems.length);

                return (
	                <span key={attachment.id} className={`ai-chat-attachment-chip${isSourceListOpen ? ' is-source-list-open' : ''}`} role="button" tabIndex={0} onClick={() => handleContextAttachmentOpen(selectedChatMessageId, attachment, { archived: false })} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') e.currentTarget.click(); }}>
                  <AiChatAttachmentIcon icon={attachment.icon} />
                  <span className="ai-chat-attachment-name">{attachment.label}</span>
                  {attachment.commentCount > 0 && (
                    <span className="ai-chat-attachment-comment-count">
                      <Icon name="general/balloon" size={16} />
                      {attachment.commentCount}
                      {canShowCommentSources && (
                        <button
                          type="button"
                          className="ai-chat-attachment-sources-toggle"
                          aria-label={isSourceListOpen ? 'Hide comment sources' : 'Show comment sources'}
                          aria-expanded={isSourceListOpen}
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            setExpandedAttachmentSourceId((currentId) => (
                              currentId === attachment.id ? null : attachment.id
                            ));
                          }}
                        >
                          <Icon name="general/chevronDown" size={16} className={isSourceListOpen ? 'is-expanded' : ''} />
                        </button>
                      )}
                    </span>
                  )}
                  {canShowCommentSources && isSourceListOpen && (
                    <span className="ai-chat-attachment-source-list" role="menu">
                      {commentSources.map((source) => (
                        <button
                          key={source.key}
                          type="button"
                          className="ai-chat-attachment-source-row"
                          role="menuitem"
	                          onClick={(event) => handleAttachmentSourceOpen(event, attachment, source, { archived: false })}
                        >
                          <span className="ai-chat-attachment-source-icon">
                            {typeof source.icon === 'string'
                              ? <Icon name={source.icon} size={16} className="tab-icon" />
                              : (source.icon ?? <Icon name="general/balloon" size={16} />)}
                          </span>
                          <span className="ai-chat-attachment-source-name">{source.label}</span>
                          <span className="ai-chat-attachment-source-count">
                            <Icon name="general/balloon" size={16} />
                            {Number.isFinite(source.count) ? source.count : 0}
                          </span>
                        </button>
                      ))}
                    </span>
                  )}
                  {commentPreviewItems.length > 0 && !isSourceListOpen && (
                    <span className="ai-chat-attachment-comment-preview ai-chat-composer-comment-preview" role="tooltip">
                      <span className="ai-chat-attachment-comment-preview-title">
                        {commentPreviewItems.length === 1 ? 'Comment' : `Comments · ${commentPreviewItems.length}`}
                      </span>
                      {visibleCommentPreviewItems.map((comment, index) => (
                        <span key={`${attachment.id}-composer-comment-preview-${index}`} className="ai-chat-attachment-comment-preview-item">
                          {comment}
                        </span>
                      ))}
                      {hiddenCommentPreviewCount > 0 && (
                        <span className="ai-chat-attachment-comment-preview-more">
                          {`+${hiddenCommentPreviewCount} more`}
                        </span>
                      )}
                    </span>
                  )}
                  <button
                    className="ai-chat-attachment-close-button"
                    type="button"
                    aria-label="Remove attachment from input"
                    onClick={(event) => {
                      event.stopPropagation();
                      setDismissedComposerAttachmentIdsByChatId((prev) => ({
                        ...prev,
                        [currentChatId]: {
                          ...dismissedAttachmentIds,
                          [attachment.id]: true,
                        },
                      }));
                      onRemoveComposerAttachment?.(attachment, { chatId: currentChatId });
                    }}
                  >
                    <Icon name="windows/closeSmall" size={16} className="ai-chat-attachment-close" />
                  </button>
                </span>
                );
              })}
            </div>
          )}
	          <div className="ai-chat-composer-toolbar">
	            <div className="ai-chat-composer-left">
	              <button
                  className={`ai-chat-plus-button${fileCommentsOptionIsNew || diffCommentsOptionIsNew ? ' has-new-context-options' : ''}`}
                  type="button"
                  aria-label="Add context"
                  aria-expanded={Boolean(addContextPopupRect)}
                  onClick={(event) => {
                    const rect = event.currentTarget.getBoundingClientRect();
                    setAddContextPopupRect((prev) => (prev ? null : rect));
                  }}
                >
	                <Icon name="general/add" size={16} />
	              </button>
		              <button className="ai-chat-mode-button" type="button">
		                Default
		                <Icon name="general/chevronDown" size={16} />
	              </button>
            </div>
            <div className="ai-chat-composer-actions">
              <AiChatToolbarIconButton label="Generating" className="ai-chat-progress-button">
                <AiChatProgressIcon />
              </AiChatToolbarIconButton>
              <AiChatToolbarIconButton label="Send" onClick={handleSendMessage} disabled={!canSendMessage}>
                <AiChatSendIcon />
              </AiChatToolbarIconButton>
            </div>
          </div>
        </div>

	        <footer className="ai-chat-footer">
	          <AiChatFooterSelector icon={<AiChatClaudeIcon />} label="Claude Agent" />
	          <AiChatFooterSelector label="Opus 4.5" />
          <button type="button" className="ai-chat-feedback">Feedback <Icon name="ide/externalLink" size={16} /></button>
        </footer>
	      </div>

        {addContextPopupRect && (
          <AiChatAddContextPopup
            triggerRect={addContextPopupRect}
            onDismiss={() => setAddContextPopupRect(null)}
            plainFileGutterCommentsEnabled={plainFileGutterCommentsEnabled}
            onPlainFileGutterCommentsEnabledChange={onPlainFileGutterCommentsEnabledChange}
            diffGutterCommentsEnabled={diffGutterCommentsEnabled}
            onDiffGutterCommentsEnabledChange={onDiffGutterCommentsEnabledChange}
            fileCommentsOptionIsNew={fileCommentsOptionIsNew}
            diffCommentsOptionIsNew={diffCommentsOptionIsNew}
            onFileCommentsOptionSeen={onFileCommentsOptionSeen}
            onDiffCommentsOptionSeen={onDiffCommentsOptionSeen}
          />
        )}
	    </ToolWindow>
  );
}

function AiChatAddContextPopup({
  triggerRect,
  onDismiss,
  plainFileGutterCommentsEnabled = true,
  onPlainFileGutterCommentsEnabledChange = null,
  diffGutterCommentsEnabled = true,
  onDiffGutterCommentsEnabledChange = null,
  fileCommentsOptionIsNew = false,
  diffCommentsOptionIsNew = false,
  onFileCommentsOptionSeen = null,
  onDiffCommentsOptionSeen = null,
}) {
  const [query, setQuery] = useState('');
  const [includeIdeContext, setIncludeIdeContext] = useState(true);

  // This popup is purely visual for now; keep it simple and match the reference.
  // Close on any row click.
  const handleClose = () => onDismiss?.();

  return (
    <div className="theme-dark">
      <PositionedPopup triggerRect={triggerRect} onDismiss={onDismiss} gap={4}>
        <Popup
          visible
          className="ai-chat-add-context-popup"
          style={{ width: 320, maxWidth: 320 }}
        >
          <PopupCell
            type="search"
            placeholder="Search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <AiChatAddContextSeparator />

          <PopupCell icon="nodes/folder" submenu onClick={handleClose}>Files</PopupCell>
          <PopupCell icon="toolwindows/packageManager" submenu onClick={handleClose}>Skills</PopupCell>
          <PopupCell icon="fileTypes/image" onClick={handleClose}>Image...</PopupCell>

          <AiChatAddContextSeparator />

          <AiChatContextToggleCell
            checked={includeIdeContext}
            onToggle={() => setIncludeIdeContext((prev) => !prev)}
            tooltip="Shares your active file, selection, and open tabs."
          >
            Include IDE Context
          </AiChatContextToggleCell>
          <AiChatContextToggleCell
            checked={plainFileGutterCommentsEnabled}
            onToggle={() => {
              onFileCommentsOptionSeen?.();
              onPlainFileGutterCommentsEnabledChange?.((prev) => !prev);
            }}
            tooltip="Turns on gutter comment controls in files. Comments you add are attached to the selected chat as prompt context."
            badge={fileCommentsOptionIsNew ? 'New' : ''}
          >
            Enable File Comments
          </AiChatContextToggleCell>
          <AiChatContextToggleCell
            checked={diffGutterCommentsEnabled}
            onToggle={() => {
              onDiffCommentsOptionSeen?.();
              onDiffGutterCommentsEnabledChange?.((prev) => !prev);
            }}
            tooltip="Turns on gutter comment controls in diff views. Comments you add are attached to the selected chat as prompt context."
            badge={diffCommentsOptionIsNew ? 'New' : ''}
          >
            Enable Diff Comments
          </AiChatContextToggleCell>

          <AiChatAddContextSeparator />
          <div className="ai-chat-add-context-section-label">Recent files</div>

          <PopupCell
            type="advanced"
            icon="fileTypes/json"
            hint="~/.jetbrains/acp.json"
            onClick={handleClose}
          >
            acp.json
          </PopupCell>
          <PopupCell type="line" icon="fileTypes/java" onClick={handleClose}>integralMask</PopupCell>
          <PopupCell type="line" icon="fileTypes/java" onClick={handleClose}>ImageData.java</PopupCell>
          <PopupCell type="line" icon="fileTypes/json" onClick={handleClose}>package.json</PopupCell>
          <PopupCell type="line" icon="fileTypes/modified" onClick={handleClose}>README.md</PopupCell>
          <PopupCell type="line" icon="fileTypes/modified" onClick={handleClose}>how to refactor the code.md</PopupCell>
          <PopupCell type="line" icon="fileTypes/unknown" onClick={handleClose}>IMPLICIT_HIGHL_BIT</PopupCell>
          <PopupCell type="line" icon="fileTypes/javaScript" onClick={handleClose}>confettiEffect.tsx</PopupCell>
        </Popup>
      </PositionedPopup>
    </div>
  );
}

function AiChatAddContextSeparator() {
  return (
    <div className="ai-chat-add-context-separator" aria-hidden="true">
      <div className="ai-chat-add-context-separator-line" />
    </div>
  );
}

function AiChatContextToggleCell({ checked, onToggle, tooltip, badge = false, children }) {
  const [tooltipRect, setTooltipRect] = useState(null);
  const tooltipPosition = getAiChatContextToggleTooltipPosition(tooltipRect);

  const showTooltip = (event) => {
    setTooltipRect(event.currentTarget.getBoundingClientRect());
  };

  const hideTooltip = () => {
    setTooltipRect(null);
  };

  return (
    <>
      <button
        type="button"
        className="ai-chat-context-toggle-cell"
        aria-pressed={checked}
        onMouseEnter={showTooltip}
        onMouseLeave={hideTooltip}
        onFocus={showTooltip}
        onBlur={hideTooltip}
        onClick={onToggle}
      >
        <span className="ai-chat-context-toggle-icon">
          {checked && <Icon name="general/checkmark" size={16} />}
        </span>
        <span className="ai-chat-context-toggle-text text-ui-default">{children}</span>
        {badge && <Badge className="ai-chat-context-toggle-badge" text={badge} color="blue-secondary" />}
      </button>
      {tooltipRect && tooltipPosition && createPortal(
        <span
          className="ai-chat-context-toggle-tooltip"
          role="tooltip"
          style={tooltipPosition}
        >
          {tooltip}
        </span>,
        document.body,
      )}
    </>
  );
}

function getAiChatContextToggleTooltipPosition(rect) {
  if (!rect || typeof window === 'undefined') return null;

  const tooltipWidth = 310;
  const tooltipHeight = 80;
  const viewportPadding = 8;
  const gap = 8;
  const rightLeft = rect.right + gap;
  const leftLeft = rect.left - gap - tooltipWidth;
  const fitsRight = rightLeft + tooltipWidth <= window.innerWidth - viewportPadding;
  const left = fitsRight
    ? rightLeft
    : Math.max(viewportPadding, leftLeft);
  const centeredTop = rect.top + rect.height / 2 - tooltipHeight / 2;
  const top = Math.min(
    Math.max(viewportPadding, centeredTop),
    window.innerHeight - viewportPadding - tooltipHeight,
  );

  return {
    top,
    left,
  };
}

function AiChatAttachmentIcon({ icon = 'vcs/diff' }) {
  return <Icon name={icon} size={16} className="icon ai-chat-attachment-icon" />;
}

function AiChatFooterSelector({ icon = null, label }) {
  return (
    <button type="button" className="ai-chat-agent-select">
      {icon}
      <span>{label}</span>
      <Icon name="general/chevronDown" size={16} />
    </button>
  );
}

const AI_CHAT_VISIT_MODEL_ATTRIBUTES_DIFF_COMMENTS = {
  'plan-code-1-added-10': ['Keep vet as a required relationship on Visit so controller validation and persistence use the same model shape.'],
};

const AI_CHAT_VISIT_CONTROLLER_DIFF_REQUEST = {
  text: 'VisitController — inject VetRepository, add @ModelAttribute("vets") with findAll()',
  statusItem: { status: 'passed' },
  issueTarget: { kind: 'plan', index: 3 },
  source: { tabId: '1', label: 'VisitController.java' },
};

const AI_CHAT_VISIT_DIFF_REQUEST = {
  text: 'Visit.java — add visit time and required vet relationship',
  statusItem: { status: 'passed' },
  issueTarget: { kind: 'plan', index: 1 },
  source: { tabId: '2', label: 'Visit.java' },
};

const AI_CHAT_VISIT_MODEL_ATTRIBUTES_ATTACHMENTS = [
  {
    id: 'diff-visit-model-attributes',
    label: 'Diff Visit.java',
    commentCount: flattenStoredDiffCommentsState(AI_CHAT_VISIT_MODEL_ATTRIBUTES_DIFF_COMMENTS).length,
    diffComments: AI_CHAT_VISIT_MODEL_ATTRIBUTES_DIFF_COMMENTS,
    diffRequest: AI_CHAT_VISIT_DIFF_REQUEST,
  },
];

const AI_CHAT_RECENT_ITEMS = [
  {
    id: 'refactor-time-slots',
    title: 'Refactor VisitController time slots',
    time: '1m',
    selected: true,
    added: '+10',
    removed: '-7',
    status: 'ready',
    icon: 'claude',
  },
  {
    id: 'visit-model-attributes',
    title: 'Review Visit model fields',
    time: '4m',
    added: '+6',
    removed: '-2',
    icon: 'claude',
  },
  {
    id: 'petclinic-tests',
    title: 'Run PetClinic controller tests',
    time: '9m',
    status: 'loading',
    icon: 'claude',
  },
];

const AI_CHAT_OLDER_THAN_7_ITEMS = [];

function createAiSessionChatScenarios(chatRows = AI_SESSION_CHATS) {
  return Object.fromEntries(chatRows.map((chat) => {
    const specs = chat.children?.find((child) => child.id === 'specs')?.items ?? [];
    const specLabel = specs
      .map((item) => (typeof item === 'string' ? item : item?.label))
      .find(Boolean);
    const title = chat.title ?? 'AI Chat';
    const isBuildChat = typeof title === 'string' && title.startsWith('Build:');
    const isSpecifiedChat = typeof title === 'string' && title.startsWith('Specified:');
    if (chat.id === 'request-logging') {
      return [chat.id, {
        title,
        userPrompt: 'Add request logging to the visits flow so request method, path, status, and duration are recorded for visit booking requests.',
        assistantParagraphs: [
          'I added a lightweight servlet filter for the visits flow and kept it independent from controller logic.',
          'The filter records the HTTP method, request path, response status, and elapsed time, so booking issues can be traced without changing the visit form workflow.',
        ],
        changeCard: {
          name: 'RequestLoggingFilter.java',
          added: '+16',
          removed: '-4',
          code: `@Component
public class RequestLoggingFilter extends OncePerRequestFilter {
    @Override
    protected void doFilterInternal(HttpServletRequest request,
            HttpServletResponse response, FilterChain chain) throws IOException, ServletException {
        long startedAt = System.currentTimeMillis();
        chain.doFilter(request, response);
        log.info("{} {} -> {} in {}ms",
            request.getMethod(), request.getRequestURI(), response.getStatus(),
            System.currentTimeMillis() - startedAt);
    }
}`,
        },
        result: [
          'Request logging now covers the visit booking route and keeps the output close to the HTTP request lifecycle.',
          'The change also updates application.yml so the new filter logs at the expected level during local runs.',
        ],
        command: 'Ran ./mvnw test -Dtest=VisitControllerTests',
      }];
    }

    const assistantParagraphs = isBuildChat
      ? [
          specLabel
            ? `I prepared the implementation path for ${specLabel} and grouped the work around controller changes, form validation, and regression coverage.`
            : 'I prepared the implementation path for this specification and grouped the work around the affected code paths.',
          'Next I would apply the code changes, run the targeted tests, and feed the result back into the spec status.',
        ]
      : isSpecifiedChat
        ? [
            specLabel
              ? `I refined ${specLabel} into an implementation-ready specification with scope, constraints, and acceptance checks.`
              : 'I refined the task into an implementation-ready specification with scope, constraints, and acceptance checks.',
            'The thread keeps the decisions and follow-up questions attached to the same spec context.',
          ]
        : [
            'I reviewed the relevant PetClinic flow and narrowed the next step to the files that need attention.',
            'The notes below summarize what changed and what still needs verification before the task is complete.',
          ];
    return [chat.id, {
      title,
      userPrompt: specLabel
        ? `${title}: continue work for ${specLabel}.`
        : `${title}.`,
      assistantParagraphs,
      result: [
        'The chat is ready with the current project context and can continue from this point.',
      ],
      command: 'Prepared project context',
    }];
  }));
}

const AI_CHAT_SCENARIOS = {
  'promote-vet-schedules-spec': {
    title: 'Clarify Vet-Schedules requirements',
    conversationTurns: [
      {
        role: 'user',
        text: 'Vet-Schedules.md still feels too loose. We say vets have working hours, but it is not clear what should happen when an owner tries to book outside those hours.',
      },
      {
        role: 'assistant',
        paragraphs: [
          'The spec should separate schedule storage from booking validation. One acceptance criterion can cover weekly schedule data, and another can cover rejecting visits outside the selected vet window.',
          'I would also call out that the visit-booking flow must keep showing only valid slots once a vet and date are selected.',
        ],
      },
      {
        role: 'user',
        text: 'There is also an on-call case. If the primary vet is unavailable, the clinic wants a fallback vet, but only for urgent appointment types.',
      },
      {
        role: 'assistant',
        paragraphs: [
          'That sounds like a separate rule: on-call fallback is allowed only when the visit is marked urgent, and normal visits should not silently reassign the vet.',
          'The implementation plan should include repository checks for schedules, controller validation, and tests for off-hours, unavailable primary vet, and non-urgent fallback rejection.',
        ],
      },
      {
        role: 'user',
        text: 'Yes, and make sure we do not break the existing Visit-Booking.md assumptions about static demo slots.',
      },
      {
        role: 'assistant',
        paragraphs: [
          'Then the scope should explicitly preserve the current demo slot behavior until the schedule-backed slot filtering is enabled for the selected vet.',
          'At this point the requirements are structured enough to turn into a spec: goal, acceptance criteria, plan, and constraints are all already present in this thread.',
        ],
      },
    ],
    initialComposerText: '/spec Create a Vet Schedules specification from this discussion, using Vet-Schedules.md and Visit-Booking.md as context',
    specSuggestion: {
      title: 'We see you are iterating on a specification',
      body: 'You have clarified scope, acceptance criteria, edge cases, and implementation constraints here. Want to create a specification from this thread?',
      command: '/spec',
      ctaLabel: 'Create specification',
    },
    specAttachments: [
      {
        id: 'sdd-document-attach-vet-schedules-promotion',
        label: 'Vet-Schedules.md',
        icon: 'fileTypes/markdown',
      },
      {
        id: 'sdd-document-attach-visit-booking-example',
        label: 'Visit-Booking.md',
        icon: 'fileTypes/markdown',
      },
    ],
  },
  'refactor-time-slots': {
    title: 'Refactor VisitController time slots',
    userPrompt: 'Refactor VisitController.java so available visit time slots are initialized once and exposed through @ModelAttribute("timeSlots").',
    assistantParagraphs: [
      'I moved the time slot generation into VisitController initialization and kept the MVC model attribute method focused on returning the prepared list.',
      'This removes the repeated ArrayList construction from populateTimeSlots(), keeps the 9:00-16:00 range in one place, and preserves the existing @ModelAttribute("timeSlots") contract for the view.',
    ],
    changeCard: {
      name: 'VisitController.java',
      added: '+10',
      removed: '-7',
      code: `private final List<LocalTime> timeSlots;

public VisitController(...) {
    this.timeSlots = IntStream.rangeClosed(9, 16)
        .mapToObj(hour -> LocalTime.of(hour, 0))
        .toList();
}

@ModelAttribute("timeSlots")
public List<LocalTime> populateTimeSlots() {
    return this.timeSlots;
}`,
    },
    result: [
      'VisitController.java now prepares the hourly visit slots once in the controller constructor and reuses that list when Spring populates the timeSlots model attribute.',
      'No template changes were required.',
    ],
    command: 'Ran ./gradlew test',
    attachmentLabel: 'Diff VisitController.java',
    diffRequest: AI_CHAT_VISIT_CONTROLLER_DIFF_REQUEST,
  },
  'visit-model-attributes': {
    title: 'Review Visit model fields',
    messageId: 'chat-history-visit-model-attributes',
    userPrompt: 'Review Visit.java and make sure the visit date, time, vet, pet, and description fields match the appointment booking flow.',
    assistantParagraphs: [
      'I reviewed the Visit entity against the appointment form and added the missing persisted fields for visit time and assigned vet.',
      'The model now stores date, time, description, vet, and pet together, so the controller can validate bookings against the same data that will be saved.',
      'Keeping vet required on the Visit object also makes the form binding explicit: a submitted appointment needs both a time slot and a selected vet before it can be persisted.',
    ],
    changeCard: {
      name: 'Visit.java',
      added: '+6',
      removed: '-2',
      code: `@Column(name = "visit_time")
@NotNull
private LocalTime time;

@ManyToOne
@JoinColumn(name = "vet_id")
@NotNull
private Vet vet;

public LocalTime getTime() {
    return this.time;
}

public Vet getVet() {
    return this.vet;
}`,
    },
    result: [
      'Visit.java now persists the selected appointment time and vet alongside the existing visit date, pet, and description.',
      'The entity shape matches the booking workflow and supports the repository duplicate-booking check.',
      'The diff is available as Diff Visit.java with the restored comment context attached to this chat.',
    ],
    command: 'Ran ./gradlew test --tests VisitControllerTests',
    attachmentLabel: 'Diff Visit.java',
    attachments: AI_CHAT_VISIT_MODEL_ATTRIBUTES_ATTACHMENTS,
    diffRequest: AI_CHAT_VISIT_DIFF_REQUEST,
  },
  'petclinic-tests': {
    title: 'Run PetClinic controller tests',
    userPrompt: 'Run the PetClinic controller tests and summarize the VisitController coverage.',
    assistantParagraphs: [
      'I started the controller test subset and focused on the VisitController paths touched by the current refactor.',
      'The run is still in progress, but the selected test scope covers visit creation, owner context, and model population.',
    ],
    changeCard: null,
    result: [
      'VisitControllerTests are running for the controller-level regression check.',
      'I will use the result to verify the timeSlots and vets model attributes remain available to the view.',
    ],
    command: 'Running ./gradlew test --tests VisitControllerTests',
    attachmentLabel: null,
  },
};

function ChatListRow({ item, selected = false, active = false, onSelect = null, nested = false, hideMeta = false, showActiveBadge = true }) {
  return (
    <button className={`ai-chat-list-row${nested ? ' is-nested' : ''}${selected ? ' is-selected' : ''}`} type="button" onClick={() => onSelect?.(item.id)}>
      <span className="ai-chat-list-agent-icon">
        <AiChatAgentIcon icon={item.icon} title={item.title} />
      </span>
      <span className="ai-chat-list-main">
        <span className="ai-chat-list-title">{item.title}</span>
        {active && showActiveBadge && (
          <Badge
            className="ai-chat-list-active-badge"
            text="Active Chat"
            color="blue-secondary"
          />
        )}
      </span>
      {!hideMeta && (
        <span className="ai-chat-list-trailing">
          <span className="ai-chat-list-diff">
            {item.added && item.removed && (
              <>
                <span className="ai-chat-list-added">{item.added}</span>
                <span className="ai-chat-list-removed">{item.removed}</span>
              </>
            )}
          </span>
          <span className="ai-chat-list-status">
            {item.status === 'ready' && <span className="ai-chat-list-ready" aria-label="Ready" />}
            {item.status === 'loading' && <IconLoaderSpinner />}
          </span>
          <span className="ai-chat-list-time">{item.time}</span>
        </span>
      )}
    </button>
  );
}

function ChatListDocumentRow({ group, selected = false, onOpen = null, hideMeta = false }) {
  return (
    <button className={`ai-chat-list-document-row${selected ? ' is-selected' : ''}`} type="button" onClick={() => onOpen?.(group)}>
      <span className="ai-chat-list-agent-icon">
        <AiChatAgentIcon icon={group.icon} title={group.label} />
      </span>
      <span className="ai-chat-list-document-title">
        <span className="ai-chat-list-title">{group.label}</span>
      </span>
      {!hideMeta && (
        <span className="ai-chat-list-trailing">
          <span className="ai-chat-list-diff" />
          <span className="ai-chat-list-status">
            {group.status === 'ready' && <span className="ai-chat-list-ready" aria-label="Ready" />}
            {group.status === 'loading' && <IconLoaderSpinner />}
          </span>
          <span className="ai-chat-list-time">{group.time}</span>
        </span>
      )}
    </button>
  );
}

function ChatListDocumentTargetRow({ group, selected = false, onOpen = null }) {
  return (
    <button className={`ai-chat-list-row${selected ? ' is-selected' : ''}`} type="button" onClick={() => onOpen?.(group)}>
      <AiChatListLeading title={group.label} icon={group.icon} />
    </button>
  );
}

function ChatListFooterAction({ label, icon = 'general/add', onClick = null }) {
  return (
    <button className="ai-chat-list-footer-action" type="button" onClick={() => onClick?.()}>
      <span className="ai-chat-list-agent-icon">
        <Icon name={icon} size={16} />
      </span>
      <span className="ai-chat-list-title">{label}</span>
    </button>
  );
}

function buildRecentChatListNodes(items = []) {
  const groupsByKey = new Map();
  const nodes = [];

  items.forEach((item) => {
    const isSpecDocumentChat =
      (item?.specChatStatus === 'Specified' || item?.specChatStatus === 'Build')
      && typeof item?.sourceDocumentLabel === 'string'
      && item.sourceDocumentLabel.trim().length > 0;

    if (!isSpecDocumentChat) {
      nodes.push({ type: 'chat', item });
      return;
    }

    const sourceKey = item.sourceDocumentTabId ?? item.sourceDocumentLabel;
    let group = groupsByKey.get(sourceKey);
    if (!group) {
      group = {
        type: 'document',
        key: sourceKey,
        sourceTabId: item.sourceDocumentTabId ?? null,
        label: item.sourceDocumentLabel,
        icon: item.sourceDocumentIcon ?? 'fileTypes/markdown',
        status: item.status,
        time: item.time,
        items: [],
      };
      groupsByKey.set(sourceKey, group);
      nodes.push(group);
    }

    if (item.status === 'loading') {
      group.status = 'loading';
    } else if (!group.status && item.status) {
      group.status = item.status;
    }
    if (!group.time && item.time) {
      group.time = item.time;
    }
    group.items.push(item);
  });

  return nodes;
}

function ChatListGroupHeader({ children, expanded = true }) {
  return (
    <div className="ai-chat-list-group-header">
      <span className="ai-chat-list-group-label">
        <Icon name={expanded ? 'general/chevronDown' : 'general/chevronRight'} size={16} />
        <span>{children}</span>
      </span>
      <span className="ai-chat-list-group-separator" aria-hidden="true" />
    </div>
  );
}

function AiChatEmptyState() {
  return (
    <div className="ai-chat-empty-state">
      <div className="ai-chat-empty-row">
        <span>Multiline code completion</span>
        <span className="ai-chat-empty-shortcuts">
          <kbd>⌥</kbd>
          <kbd>⇧</kbd>
          <kbd>\</kbd>
        </span>
      </div>
      <div className="ai-chat-empty-row">
        <span>Code generation in the editor</span>
        <span className="ai-chat-empty-shortcuts">
          <kbd>⌘</kbd>
          <kbd>\</kbd>
        </span>
      </div>
      <div className="ai-chat-empty-row">
        <span>AI actions in the editor's context menu</span>
      </div>
      <button type="button" className="ai-chat-empty-link">All features</button>
    </div>
  );
}

const ChatListPopup = forwardRef(function ChatListPopup({
  className = '',
  style = null,
  selectedChatId = 'visit-model-attributes',
  activeChatId = null,
  selectedDocumentSourceTabId = null,
  onSelectChat = null,
  onOpenDocument = null,
  recentItems = AI_CHAT_RECENT_ITEMS,
  olderItems = AI_CHAT_OLDER_THAN_7_ITEMS,
  documentItems = [],
  hideSearch = false,
  flattenDocuments = false,
  showOlderSections = true,
  hideMeta = false,
  showActiveBadge = true,
  footerAction = null,
}, ref) {
  const recentNodes = flattenDocuments
    ? recentItems.map((item) => ({ type: 'chat', item }))
    : buildRecentChatListNodes(recentItems);

  return (
    <div className={`ai-chat-list-popup${className ? ` ${className}` : ''}`} ref={ref} style={style ?? undefined} role="dialog" aria-label="Chats list">
      {!hideSearch && (
        <div className="ai-chat-list-search">
          <Icon name="general/search" size={16} />
          <input type="text" aria-label="Search chats" placeholder="Search" />
        </div>
      )}
      <div className="ai-chat-list-section">
        {documentItems.map((group) => (
          <ChatListDocumentTargetRow
            key={group.key ?? group.sourceTabId ?? group.label}
            group={group}
            selected={group.sourceTabId === selectedDocumentSourceTabId}
            onOpen={onOpenDocument}
          />
        ))}
        {recentNodes.map((node) => (
          node.type === 'document'
            ? (
              <div className="ai-chat-list-document-group" key={node.key}>
                <ChatListDocumentRow group={node} selected={node.sourceTabId === selectedDocumentSourceTabId} onOpen={onOpenDocument} hideMeta={hideMeta} />
                <div className="ai-chat-list-document-children">
                  {node.items.map((item) => (
                    <ChatListRow key={item.id} item={item} selected={item.id === selectedChatId} active={item.id === activeChatId} onSelect={onSelectChat} nested hideMeta={hideMeta} showActiveBadge={showActiveBadge} />
                  ))}
                </div>
              </div>
            )
            : <ChatListRow key={node.item.id} item={node.item} selected={node.item.id === selectedChatId} active={node.item.id === activeChatId} onSelect={onSelectChat} hideMeta={hideMeta} showActiveBadge={showActiveBadge} />
        ))}
      </div>
      {showOlderSections && olderItems.length > 0 && (
        <>
          <ChatListGroupHeader>Older than 7 days</ChatListGroupHeader>
          <div className="ai-chat-list-section">
            {olderItems.map((item) => (
              <ChatListRow key={item.id} item={item} selected={item.id === selectedChatId} active={item.id === activeChatId} onSelect={onSelectChat} hideMeta={hideMeta} showActiveBadge={showActiveBadge} />
            ))}
          </div>
          <ChatListGroupHeader expanded={false}>Older than 30 days</ChatListGroupHeader>
        </>
      )}
      {footerAction && (
        <>
          <div className="ai-chat-list-footer-separator" aria-hidden="true" />
          <ChatListFooterAction
            label={footerAction.label}
            icon={footerAction.icon}
            onClick={footerAction.onClick}
          />
        </>
      )}
    </div>
  );
});

function ChatUserCard({ children, attachments = [], onAttachmentOpen = null, messageId = null }) {
  const [isContextExpanded, setIsContextExpanded] = useState(false);
  const attachmentCount = attachments.length;

  return (
    <article className="ai-chat-user-card" data-ai-chat-message-id={messageId ?? undefined}>
      <p>{children}</p>
      {attachmentCount > 0 && (
        <div className="ai-chat-sent-context">
          <button
            className="ai-chat-sent-context-toggle"
            type="button"
            aria-expanded={isContextExpanded}
            onClick={() => setIsContextExpanded((prev) => !prev)}
          >
            <span>{`Attachments ${attachmentCount}`}</span>
            <Icon name="general/chevronDown" size={16} className={isContextExpanded ? 'is-expanded' : ''} />
          </button>
          {isContextExpanded && (
            <div className="ai-chat-sent-context-attachments">
              {attachments.map((attachment) => {
                const commentPreviewItems = getAiChatAttachmentCommentPreviewItems(attachment);
                const sourcePreviewItems = getAiChatAttachmentSourcePreviewItems(attachment);
                const visibleCommentPreviewItems = commentPreviewItems.slice(0, 3);
                const hiddenCommentPreviewCount = Math.max(0, commentPreviewItems.length - visibleCommentPreviewItems.length);
                const visibleSourcePreviewItems = sourcePreviewItems.slice(0, 4);
                const hiddenSourcePreviewCount = Math.max(0, sourcePreviewItems.length - visibleSourcePreviewItems.length);

                return (
                  <span
                    key={attachment.id}
                    className="ai-chat-attachment-chip ai-chat-sent-attachment-chip"
                    role={onAttachmentOpen ? 'button' : undefined}
                    tabIndex={onAttachmentOpen ? 0 : undefined}
                    onClick={onAttachmentOpen ? () => onAttachmentOpen(attachment) : undefined}
                    onKeyDown={onAttachmentOpen ? (event) => {
                      if (event.key !== 'Enter' && event.key !== ' ') return;
                      event.preventDefault();
                      onAttachmentOpen(attachment);
                    } : undefined}
                  >
                    <AiChatAttachmentIcon icon={attachment.icon} />
                    <span className="ai-chat-attachment-name">{attachment.label}</span>
                    {attachment.commentCount > 0 && (
                      <span className="ai-chat-attachment-comment-count">
                        <Icon name="general/balloon" size={16} />
                        {attachment.commentCount}
                      </span>
                    )}
                    {commentPreviewItems.length > 0 ? (
                      <span className="ai-chat-attachment-comment-preview ai-chat-sent-comment-preview" role="tooltip">
                        <span className="ai-chat-attachment-comment-preview-title">
                          {commentPreviewItems.length === 1 ? 'Comment' : `Comments · ${commentPreviewItems.length}`}
                        </span>
                        {visibleCommentPreviewItems.map((comment, index) => (
                          <span key={`${attachment.id}-comment-preview-${index}`} className="ai-chat-attachment-comment-preview-item">
                            {comment}
                          </span>
                        ))}
                        {hiddenCommentPreviewCount > 0 && (
                          <span className="ai-chat-attachment-comment-preview-more">
                            {`+${hiddenCommentPreviewCount} more`}
                          </span>
                        )}
                      </span>
                    ) : sourcePreviewItems.length > 0 ? (
                      <span className="ai-chat-attachment-comment-preview ai-chat-attachment-source-preview" role="tooltip">
                        {visibleSourcePreviewItems.map((source) => (
                          <span key={`${attachment.id}-source-preview-${source.key}`} className="ai-chat-attachment-source-preview-item">
                            <span className="ai-chat-attachment-source-icon">
                              {typeof source.icon === 'string'
                                ? <Icon name={source.icon} size={16} className="tab-icon" />
                                : (source.icon ?? <Icon name="general/balloon" size={16} />)}
                            </span>
                            <span className="ai-chat-attachment-source-name">{source.label}</span>
                            <span className="ai-chat-attachment-source-count">
                              <Icon name="general/balloon" size={16} />
                              {source.count}
                            </span>
                          </span>
                        ))}
                        {hiddenSourcePreviewCount > 0 && (
                          <span className="ai-chat-attachment-comment-preview-more">
                            {`+${hiddenSourcePreviewCount} more`}
                          </span>
                        )}
                      </span>
                    ) : null}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      )}
      <button className="ai-chat-card-menu" type="button" aria-label="Message actions">
        <span />
        <span />
        <span />
      </button>
    </article>
  );
}

function ChatAssistantMessage({ children, streaming = false }) {
  return (
    <div className={`ai-chat-ai-message${streaming ? ' is-streaming' : ''}`}>
      <div className="ai-chat-assistant-header">
        <AiChatClaudeIcon />
        <span>Claude Agent</span>
      </div>
      <p className="ai-chat-assistant-copy">
        {children}
        {streaming && <span className="ai-chat-streaming-caret" aria-hidden="true" />}
      </p>
    </div>
  );
}

function AiChatTabView({
  chatId,
  scenarios = {},
  sentMessages = [],
  onSendMessage = null,
  fallbackTitle = 'AI Chat',
}) {
  const scenario = scenarios?.[chatId] ?? {
    title: fallbackTitle,
    userPrompt: fallbackTitle,
    assistantParagraphs: [
      'I opened this existing chat in the editor tab with the current project context.',
    ],
    result: [
      'The conversation is ready to continue from this point.',
    ],
    command: 'Prepared project context',
  };
  const messageId = scenario?.messageId ?? `editor-chat-${chatId}`;
  const initialComposerText = typeof scenario?.initialComposerText === 'string' ? scenario.initialComposerText : '';
  const [composerText, setComposerText] = useState(initialComposerText);
  const composerRef = useRef(null);
  const scrollRef = useRef(null);
  const specSuggestionCommand = typeof scenario?.specSuggestion?.command === 'string'
    ? scenario.specSuggestion.command
    : '';
  const activeSpecCommand = specSuggestionCommand
    && (composerText === specSuggestionCommand || composerText.startsWith(`${specSuggestionCommand} `))
    ? specSuggestionCommand
    : null;
  const visibleComposerText = activeSpecCommand
    ? composerText.slice(activeSpecCommand.length).trimStart()
    : composerText;
  const conversationTurns = Array.isArray(scenario?.conversationTurns)
    ? scenario.conversationTurns
    : [];
  const specComposerAttachments = Array.isArray(scenario?.specAttachments)
    ? scenario.specAttachments
    : (scenario?.specAttachment ? [scenario.specAttachment] : []);
  const focusComposerAtEnd = useCallback(() => {
    const focus = () => {
      const textarea = composerRef.current;
      if (!textarea) return;
      textarea.focus({ preventScroll: true });
      const caretPosition = textarea.value.length;
      textarea.setSelectionRange(caretPosition, caretPosition);
    };
    requestAnimationFrame(() => requestAnimationFrame(focus));
  }, []);

  useEffect(() => {
    setComposerText(initialComposerText);
    focusComposerAtEnd();
  }, [chatId, focusComposerAtEnd, initialComposerText]);

  useEffect(() => {
    const scrollElement = scrollRef.current;
    if (!scrollElement) return;
    scrollElement.scrollTop = scrollElement.scrollHeight;
  }, [chatId, sentMessages.length]);

  const handleSend = () => {
    const trimmed = composerText.trim();
    if (!trimmed) return;
    onSendMessage?.(chatId, trimmed);
    setComposerText('');
  };

  return (
    <div className="aiux543-conversation">
      <div ref={scrollRef} className="aiux543-conversation-scroll">
        {conversationTurns.length > 0 ? (
          conversationTurns.map((turn, index) => (
            turn?.role === 'user' ? (
              <div key={`turn-${index}`} className="aiux543-user-message aiux543-thread-user-message" data-ai-chat-message-id={`${messageId}-turn-${index}`}>
                <p>{turn.text}</p>
                <span className="aiux543-kebab" aria-hidden="true">
                  <Icon name="general/moreVertical" size={16} />
                </span>
              </div>
            ) : (
              <article key={`turn-${index}`} className="aiux543-answer aiux543-thread-answer">
                <h3>Claude Agent</h3>
                {(Array.isArray(turn?.paragraphs) ? turn.paragraphs : [turn?.text].filter(Boolean)).map((paragraph, paragraphIndex) => (
                  <p key={`turn-${index}-paragraph-${paragraphIndex}`}>{paragraph}</p>
                ))}
              </article>
            )
          ))
        ) : (
          <>
            {scenario?.userPrompt && (
              <div className="aiux543-user-message" data-ai-chat-message-id={messageId}>
                <p>{scenario.userPrompt}</p>
                <span className="aiux543-kebab" aria-hidden="true">
                  <Icon name="general/moreVertical" size={16} />
                </span>
              </div>
            )}

            {scenario?.assistantParagraphs?.length > 0 && (
              <article className="aiux543-answer">
                <h3>What changed</h3>
                {scenario.assistantParagraphs.map((paragraph, idx) => (
                  <p key={`assistant-${idx}`}>{paragraph}</p>
                ))}
              </article>
            )}
          </>
        )}

        {scenario?.changeCard && (
          <section className="aiux543-code-card">
            <header>
              <Icon className="aiux543-file-icon" name="fileTypes/java" size={16} />
              <strong>{scenario.changeCard.name}</strong>
              <span className="aiux543-diff-inline">{scenario.changeCard.added}</span>
              <span>{scenario.changeCard.removed}</span>
              <em>Edited</em>
            </header>
            <SyntaxCode code={scenario.changeCard.code} />
          </section>
        )}

        {Array.isArray(scenario?.result) && scenario.result.length > 0 && (
          <article className="aiux543-answer">
            <h3>Result</h3>
            {scenario.result.map((paragraph, idx) => (
              <p key={`result-${idx}`}>{paragraph}</p>
            ))}
          </article>
        )}

        {scenario?.command && (
          <section className="aiux543-detail-trail">
            <article className="aiux543-detail-card">
              <h3>How to verify</h3>
              <p>{scenario.command}</p>
            </article>
          </section>
        )}

        {sentMessages.map((message) => (
          message.role === 'assistant' ? (
            <article key={message.id} className="aiux543-answer">
              <h3>Claude Agent</h3>
              <p>
                {message.text}
                {message.streaming ? <span className="ai-chat-streaming-caret" aria-hidden="true" /> : null}
              </p>
            </article>
          ) : (
            <div key={message.id} className="aiux543-user-message" data-ai-chat-message-id={message.id}>
              <p>{message.text}</p>
              <span className="aiux543-kebab" aria-hidden="true">
                <Icon name="general/moreVertical" size={16} />
              </span>
            </div>
          )
        ))}
      </div>

      <div className="aiux543-composer-sticky">
        {scenario?.specSuggestion ? (
          <div className="aiux550-chat-tab-spec-suggestion" role="status">
            <span className="aiux550-chat-tab-spec-suggestion-icon" aria-hidden="true">
              <ReferenceSpecMarkIcon className="aiux550-spec-option-icon" />
            </span>
            <div className="aiux550-chat-tab-spec-suggestion-body">
              <strong>{scenario.specSuggestion.title}</strong>
              <p>{scenario.specSuggestion.body}</p>
            </div>
            <button
              type="button"
              className="aiux550-chat-tab-spec-suggestion-cta"
              onClick={() => {
                const cmd = scenario.specSuggestion.command ?? '';
                setComposerText((current) => (current.startsWith(cmd) ? current : `${cmd} ${current}`.trim()));
                focusComposerAtEnd();
              }}
            >
              {scenario.specSuggestion.ctaLabel ?? 'Create specification'}
            </button>
          </div>
        ) : null}
        <div className="aiux543-chat-local-card">
          <button type="button" className="aiux543-chat-dropdown">
            <span>Local</span>
            <Icon name="general/chevronDown" size={16} />
          </button>
        </div>
        <div className="aiux543-chat-composer" onClick={() => composerRef.current?.focus()}>
          <div className="aiux543-chat-input-row">
            {activeSpecCommand ? (
              <span className="aiux550-spec-command-chip aiux550-spec-command-prefix" aria-hidden="true">{activeSpecCommand}</span>
            ) : null}
            <textarea
              ref={composerRef}
              className="aiux543-chat-input"
              rows={1}
              value={visibleComposerText}
              placeholder={specComposerAttachments.length > 0 ? 'Describe the spec, use @mentions or /commands' : 'Type task, use @mentions or /commands'}
              aria-label="Task prompt"
              onChange={(event) => {
                const nextVisibleText = event.target.value;
                setComposerText(activeSpecCommand
                  ? `${activeSpecCommand}${nextVisibleText ? ` ${nextVisibleText}` : ''}`
                  : nextVisibleText);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  handleSend();
                }
              }}
            />
          </div>
          <div className="aiux543-chat-attachments-spacer">
            {specComposerAttachments.length > 0 ? (
              <div className="aiux550-chat-tab-composer-attachments" onClick={(e) => e.stopPropagation()}>
                {specComposerAttachments.map((attachment) => (
                  <span key={attachment.id ?? attachment.label} className="aiux550-chat-tab-composer-attachment-chip">
                    <Icon name={attachment.icon ?? 'fileTypes/markdown'} size={16} className="aiux550-project-md-icon" />
                    <span className="aiux550-chat-tab-composer-attachment-label">{attachment.label}</span>
                    <button type="button" className="aiux550-chat-tab-composer-attachment-close" aria-label={`Remove ${attachment.label ?? 'attachment'}`}>
                      <Icon name="windows/closeSmall" size={16} />
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
          </div>
          <div className="aiux543-chat-toolbar">
            <div className="aiux543-chat-toolbar-left">
              <button className="aiux543-chat-icon-button" type="button" aria-label="Add context">
                <Icon name="general/add" size={16} />
              </button>
              <button className="aiux543-chat-dropdown" type="button">
                Default
                <Icon name="general/chevronDown" size={16} />
              </button>
            </div>
            <div className="aiux543-chat-toolbar-right">
              <button type="button" className="aiux543-chat-icon-button" aria-label="Generating">
                <AiChatProgressIcon />
              </button>
              <button type="button" className="aiux543-chat-icon-button" aria-label="Send" onClick={handleSend} disabled={!composerText.trim()}>
                <AiChatSendIcon />
              </button>
            </div>
          </div>
        </div>
        <footer className="aiux543-editor-footer">
          <span className="aiux543-editor-footer-left">
            <span>Claude Agent</span>
            <span>Opus 4.5</span>
          </span>
          <span>Feedback <Icon name="ide/externalLink" size={16} /></span>
        </footer>
      </div>
    </div>
  );
}

function AiChatToolbarIconButton({ label, className = '', children, onClick = null, disabled = false }) {
  return (
    <button
      className={`toolbar-icon-button toolbar-icon-button-action ai-chat-toolbar-button ai-chat-composer-icon-button${className ? ` ${className}` : ''}`}
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick ?? undefined}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

function AiChatSelectContextIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="icon">
      <path d="M8.02299 8.45408C7.99895 8.39378 7.99312 8.32777 8.00621 8.2642C8.0193 8.20062 8.05073 8.14228 8.09663 8.09639C8.14253 8.05049 8.20087 8.01905 8.26444 8.00597C8.32801 7.99288 8.39403 7.99871 8.45432 8.02274L14.4543 10.3561C14.5186 10.3812 14.5736 10.4257 14.6115 10.4834C14.6495 10.5411 14.6685 10.6092 14.6661 10.6782C14.6637 10.7472 14.6399 10.8138 14.598 10.8687C14.5562 10.9236 14.4982 10.9642 14.4323 10.9847L12.1363 11.6967C12.0327 11.7288 11.9385 11.7856 11.8618 11.8623C11.7852 11.9389 11.7283 12.0331 11.6963 12.1367L10.985 14.4321C10.9644 14.498 10.9239 14.5559 10.869 14.5978C10.814 14.6397 10.7475 14.6635 10.6785 14.6659C10.6094 14.6683 10.5414 14.6492 10.4837 14.6113C10.426 14.5733 10.3815 14.5184 10.3563 14.4541L8.02299 8.45408Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14 7.33333V3.33333C14 2.97971 13.8595 2.64057 13.6095 2.39052C13.3594 2.14048 13.0203 2 12.6667 2H3.33333C2.97971 2 2.64057 2.14048 2.39052 2.39052C2.14048 2.64057 2 2.97971 2 3.33333V12.6667C2 13.0203 2.14048 13.3594 2.39052 13.6095C2.64057 13.8595 2.97971 14 3.33333 14H7.33333" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function AiChatProgressIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="icon">
      <circle cx="8" cy="8" r="6.25" stroke="#4C4F56" strokeWidth="1.5" />
      <path d="M8 1.75C8.99794 1.75 9.98138 1.98897 10.868 2.44691C11.7547 2.90485 12.5188 3.56846 13.0965 4.38221C13.6741 5.19597 14.0485 6.13623 14.1884 7.12432C14.3282 8.11242 14.2293 9.11964 13.9002 10.0617" stroke="#B4B8BF" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function AiChatOpenInToolWindowIcon() {
  return <Icon name="general/openInToolWindow" size={16} />;
}

function AiChatSendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="icon">
      <path d="M9.5 8H3.5L2.5 14.5L14.5 8L2.5 1.5L3.192 6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}


function SyntaxCode({ code, language = 'java' }) {
  const lines = code.split('\n');
  return (
    <pre>
      {lines.map((line, li) => (
        <Fragment key={li}>
          {li > 0 && '\n'}
          {tokenizeCodeFragment(line || ' ', language).map((token, ti) => (
            <span key={ti} className={`plan-diff-token plan-diff-token-${token.type}`}>{token.text}</span>
          ))}
        </Fragment>
      ))}
    </pre>
  );
}

const AI_ASSISTANT_SETTINGS_SECTIONS = [
  {
    id: 'ai-assistant-general',
    label: 'General',
    icon: 'general/settings',
    description: 'Assistant availability, confirmations, and notifications.',
  },
  {
    id: 'ai-assistant-chat',
    label: 'Chat',
    icon: 'toolwindows/aiAssistant',
    description: 'Conversation behavior and chat session handling.',
  },
  {
    id: 'ai-assistant-context',
    label: 'Context',
    icon: 'general/filter',
    description: 'What project and IDE context can be attached automatically.',
  },
  {
    id: 'ai-assistant-code-review',
    label: 'Code Review',
    icon: 'vcs/diff',
    description: 'Review summaries, suggested fixes, and diff explanations.',
  },
  {
    id: 'ai-assistant-comments',
    label: 'Comments',
    icon: 'general/balloon',
    description: 'Comment entry points in files and diffs.',
  },
];

const SETTINGS_TREE_WITH_AI_ASSISTANT = DEFAULT_SETTINGS_TREE_ITEMS.map((item) => (
  item.id === 'tools'
    ? {
        ...item,
        expanded: true,
        children: [
          {
            id: 'ai-assistant',
            label: 'AI Assistant',
            expanded: true,
            children: AI_ASSISTANT_SETTINGS_SECTIONS.map(({ id, label }) => ({ id, label })),
          },
        ],
      }
    : item
));

function findSettingsTreeItemPath(items, selectedId, path = []) {
  for (const item of items) {
    const nextPath = [...path, item];
    if (item.id === selectedId) return nextPath;
    const childPath = findSettingsTreeItemPath(item.children ?? [], selectedId, nextPath);
    if (childPath) return childPath;
  }

  return null;
}

function AppSettingsTreeNodes({ items, selectedId, onSelect, level = 1 }) {
  return items.map((item) => {
    const hasChildren = Array.isArray(item.children) && item.children.length > 0;

    return (
      <TreeNode
        key={item.id}
        label={item.label}
        level={level}
        hasChildren={item.hasChildren || hasChildren}
        isExpanded={Boolean(item.expanded)}
        isSelected={selectedId === item.id}
        onSelect={() => onSelect(item.id)}
      >
        {hasChildren && (
          <AppSettingsTreeNodes
            items={item.children}
            selectedId={selectedId}
            onSelect={onSelect}
            level={level + 1}
          />
        )}
      </TreeNode>
    );
  });
}

function AppSettingsBreadcrumb({ path }) {
  return (
    <div className="settings-breadcrumb">
      {path.map((item, index) => (
        <Fragment key={item.id}>
          {index > 0 && <Icon name="general/chevronRight" size={16} />}
          <span className="text-ui-default-semibold">{item.label}</span>
        </Fragment>
      ))}
    </div>
  );
}

function AppSettingsDefaultContent({ path }) {
  return (
    <>
      <AppSettingsBreadcrumb path={path} />
      <div className="settings-group app-settings-dialog-placeholder">
        <div className="app-settings-dialog-page-title text-ui-default-semibold">{path[path.length - 1]?.label ?? 'Settings'}</div>
        <div className="app-settings-dialog-page-description text-ui-default">
          Select Tools, AI Assistant, or Comments to configure AI comment workflows.
        </div>
      </div>
    </>
  );
}

function AppSettingsToolsContent({ path, onSelectAiAssistant }) {
  return (
    <>
      <AppSettingsBreadcrumb path={path} />
      <div className="settings-group">
        <div className="app-settings-dialog-page-title text-ui-default-semibold">Tools</div>
        <div className="app-settings-dialog-page-description text-ui-default">
          Configure integrations and assistant-driven workflows available from the IDE.
        </div>
      </div>
      <div className="settings-group app-settings-dialog-card-group">
        <button className="app-settings-dialog-nav-card" type="button" onClick={onSelectAiAssistant}>
          <span className="app-settings-dialog-nav-card-icon">
            <Icon name="aiAssistant/aiAssistantColored" size={16} />
          </span>
          <span className="app-settings-dialog-nav-card-body">
            <span className="app-settings-dialog-nav-card-title text-ui-default-semibold">AI Assistant</span>
            <span className="app-settings-dialog-nav-card-description text-ui-small">
              Chat, comments, and code-review context settings.
            </span>
          </span>
          <Icon name="general/chevronRight" size={16} className="app-settings-dialog-nav-card-chevron" />
        </button>
      </div>
    </>
  );
}

function AppSettingsAiAssistantContent({ path, onSelectSection }) {
  return (
    <>
      <AppSettingsBreadcrumb path={path} />
      <div className="settings-group">
        <div className="app-settings-dialog-page-title text-ui-default-semibold">AI Assistant</div>
        <div className="app-settings-dialog-page-description text-ui-default">
          Manage how assistant features collect context and connect code comments to chat sessions.
        </div>
      </div>
      <div className="settings-group app-settings-dialog-card-group">
        {AI_ASSISTANT_SETTINGS_SECTIONS.map((section) => (
          <button
            key={section.id}
            className="app-settings-dialog-nav-card"
            type="button"
            onClick={() => onSelectSection(section.id)}
          >
            <span className="app-settings-dialog-nav-card-icon">
              <Icon name={section.icon} size={16} />
            </span>
            <span className="app-settings-dialog-nav-card-body">
              <span className="app-settings-dialog-nav-card-title text-ui-default-semibold">{section.label}</span>
              <span className="app-settings-dialog-nav-card-description text-ui-small">
                {section.description}
              </span>
            </span>
            <Icon name="general/chevronRight" size={16} className="app-settings-dialog-nav-card-chevron" />
          </button>
        ))}
      </div>
    </>
  );
}

function AppSettingsOptionGroup({ children }) {
  return (
    <div className="settings-group app-settings-dialog-options-group">
      {children}
    </div>
  );
}

function AppSettingsGeneralContent({ path }) {
  const [showAssistantInToolbar, setShowAssistantInToolbar] = useState(true);
  const [confirmBeforeApplyingChanges, setConfirmBeforeApplyingChanges] = useState(true);
  const [showNotifications, setShowNotifications] = useState(true);

  return (
    <>
      <AppSettingsBreadcrumb path={path} />
      <div className="settings-group">
        <div className="app-settings-dialog-page-title text-ui-default-semibold">General</div>
        <div className="app-settings-dialog-page-description text-ui-default">
          Configure how AI Assistant appears in the IDE and when it asks for confirmation.
        </div>
      </div>
      <AppSettingsOptionGroup>
        <Checkbox
          label="Show AI Assistant in Toolbar"
          hint="Keep quick access to the assistant in the main toolbar."
          checked={showAssistantInToolbar}
          onChange={setShowAssistantInToolbar}
        />
        <Checkbox
          label="Confirm Before Applying Changes"
          hint="Review generated edits before they are applied to files."
          checked={confirmBeforeApplyingChanges}
          onChange={setConfirmBeforeApplyingChanges}
        />
        <Checkbox
          label="Show Assistant Notifications"
          hint="Display completion and follow-up notifications from assistant workflows."
          checked={showNotifications}
          onChange={setShowNotifications}
        />
      </AppSettingsOptionGroup>
    </>
  );
}

function AppSettingsChatContent({ path }) {
  const [streamResponses, setStreamResponses] = useState(true);
  const [restoreLastChat, setRestoreLastChat] = useState(true);
  const [suggestFollowUps, setSuggestFollowUps] = useState(false);

  return (
    <>
      <AppSettingsBreadcrumb path={path} />
      <div className="settings-group">
        <div className="app-settings-dialog-page-title text-ui-default-semibold">Chat</div>
        <div className="app-settings-dialog-page-description text-ui-default">
          Adjust chat session behavior for assistant conversations.
        </div>
      </div>
      <AppSettingsOptionGroup>
        <Checkbox
          label="Stream Responses"
          hint="Show assistant answers as they are generated."
          checked={streamResponses}
          onChange={setStreamResponses}
        />
        <Checkbox
          label="Restore Last Chat Session"
          hint="Open the most recent chat when the AI Assistant tool window is shown."
          checked={restoreLastChat}
          onChange={setRestoreLastChat}
        />
        <Checkbox
          label="Suggest Follow-Up Prompts"
          hint="Show suggested next questions after assistant responses."
          checked={suggestFollowUps}
          onChange={setSuggestFollowUps}
        />
      </AppSettingsOptionGroup>
    </>
  );
}

function AppSettingsContextContent({ path }) {
  const [includeOpenFiles, setIncludeOpenFiles] = useState(true);
  const [includeProblems, setIncludeProblems] = useState(true);
  const [includeRecentChanges, setIncludeRecentChanges] = useState(false);

  return (
    <>
      <AppSettingsBreadcrumb path={path} />
      <div className="settings-group">
        <div className="app-settings-dialog-page-title text-ui-default-semibold">Context</div>
        <div className="app-settings-dialog-page-description text-ui-default">
          Control which IDE signals can be used as context for assistant prompts.
        </div>
      </div>
      <AppSettingsOptionGroup>
        <Checkbox
          label="Include Open Files"
          hint="Let prompts reference currently opened editor tabs when context is selected."
          checked={includeOpenFiles}
          onChange={setIncludeOpenFiles}
        />
        <Checkbox
          label="Include Problems"
          hint="Attach warnings, errors, and inspection results relevant to the active file."
          checked={includeProblems}
          onChange={setIncludeProblems}
        />
        <Checkbox
          label="Include Recent Changes"
          hint="Allow the assistant to use recent local edits when preparing answers."
          checked={includeRecentChanges}
          onChange={setIncludeRecentChanges}
        />
      </AppSettingsOptionGroup>
    </>
  );
}

function AppSettingsCodeReviewContent({ path }) {
  const [summarizeDiffs, setSummarizeDiffs] = useState(true);
  const [suggestFixes, setSuggestFixes] = useState(true);
  const [groupReviewFindings, setGroupReviewFindings] = useState(false);

  return (
    <>
      <AppSettingsBreadcrumb path={path} />
      <div className="settings-group">
        <div className="app-settings-dialog-page-title text-ui-default-semibold">Code Review</div>
        <div className="app-settings-dialog-page-description text-ui-default">
          Configure assistant help for reviewing diffs and applying feedback.
        </div>
      </div>
      <AppSettingsOptionGroup>
        <Checkbox
          label="Summarize Diffs"
          hint="Generate a compact explanation of changed files before review."
          checked={summarizeDiffs}
          onChange={setSummarizeDiffs}
        />
        <Checkbox
          label="Suggest Fixes for Review Comments"
          hint="Offer concrete code edits when a review comment describes a problem."
          checked={suggestFixes}
          onChange={setSuggestFixes}
        />
        <Checkbox
          label="Group Related Findings"
          hint="Combine repeated review findings into a smaller set of actionable items."
          checked={groupReviewFindings}
          onChange={setGroupReviewFindings}
        />
      </AppSettingsOptionGroup>
    </>
  );
}

function AppSettingsCommentsContent({
  path,
  plainFileGutterCommentsEnabled,
  onPlainFileGutterCommentsEnabledChange,
  diffGutterCommentsEnabled,
  onDiffGutterCommentsEnabledChange,
}) {
  return (
    <>
      <AppSettingsBreadcrumb path={path} />
      <div className="settings-group">
        <div className="app-settings-dialog-page-title text-ui-default-semibold">Comments</div>
        <div className="app-settings-dialog-page-description text-ui-default">
          Choose where the AI Assistant can collect code comments as chat context.
        </div>
      </div>
      <div className="settings-group app-settings-dialog-options-group">
        <Checkbox
          label="Enable Comments in Files"
          hint="Show gutter comment controls in editor files and attach those comments to the selected chat."
          checked={plainFileGutterCommentsEnabled}
          onChange={onPlainFileGutterCommentsEnabledChange}
        />
        <Checkbox
          label="Enable Comments in Diffs"
          hint="Show gutter comment controls in diff views and attach those comments to the selected chat."
          checked={diffGutterCommentsEnabled}
          onChange={onDiffGutterCommentsEnabledChange}
        />
      </div>
    </>
  );
}

function AppSettingsDialogContent({
  plainFileGutterCommentsEnabled,
  onPlainFileGutterCommentsEnabledChange,
  diffGutterCommentsEnabled,
  onDiffGutterCommentsEnabledChange,
}) {
  const [selectedId, setSelectedId] = useState('ai-assistant-comments');
  const [searchQuery, setSearchQuery] = useState('');
  const selectedPath = findSettingsTreeItemPath(SETTINGS_TREE_WITH_AI_ASSISTANT, selectedId)
    ?? findSettingsTreeItemPath(SETTINGS_TREE_WITH_AI_ASSISTANT, 'ai-assistant-comments');

  const renderContent = () => {
    if (selectedId === 'tools') {
      return <AppSettingsToolsContent path={selectedPath} onSelectAiAssistant={() => setSelectedId('ai-assistant')} />;
    }

    if (selectedId === 'ai-assistant') {
      return <AppSettingsAiAssistantContent path={selectedPath} onSelectSection={setSelectedId} />;
    }

    if (selectedId === 'ai-assistant-general') {
      return <AppSettingsGeneralContent path={selectedPath} />;
    }

    if (selectedId === 'ai-assistant-chat') {
      return <AppSettingsChatContent path={selectedPath} />;
    }

    if (selectedId === 'ai-assistant-context') {
      return <AppSettingsContextContent path={selectedPath} />;
    }

    if (selectedId === 'ai-assistant-code-review') {
      return <AppSettingsCodeReviewContent path={selectedPath} />;
    }

    if (selectedId === 'ai-assistant-comments') {
      return (
        <AppSettingsCommentsContent
          path={selectedPath}
          plainFileGutterCommentsEnabled={plainFileGutterCommentsEnabled}
          onPlainFileGutterCommentsEnabledChange={onPlainFileGutterCommentsEnabledChange}
          diffGutterCommentsEnabled={diffGutterCommentsEnabled}
          onDiffGutterCommentsEnabledChange={onDiffGutterCommentsEnabledChange}
        />
      );
    }

    return <AppSettingsDefaultContent path={selectedPath} />;
  };

  return (
    <div className="settings-layout app-settings-dialog-content">
      <div className="settings-tree-panel">
        <div className="settings-tree-search">
          <Search value={searchQuery} onChange={setSearchQuery} placeholder="" aria-label="Search settings" />
        </div>
        <div className="settings-tree-nodes">
          <AppSettingsTreeNodes
            items={SETTINGS_TREE_WITH_AI_ASSISTANT}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        </div>
      </div>
      <div className="settings-content-panel">
        {renderContent()}
      </div>
    </div>
  );
}

function ChatChangeCard({ icon, name, added, removed, children, onClick = null }) {
  return (
    <section className="ai-chat-change-card">
      <header className="ai-chat-change-header" role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined} onClick={onClick ?? undefined} onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); } : undefined}>
        <Icon name={icon === 'yaml' ? 'fileTypes/yaml' : 'fileTypes/java'} size={16} className="ai-chat-file-icon" />
        <span className="ai-chat-change-name">{name}</span>
        <span className="ai-chat-diff-add">{added}</span>
        <span className="ai-chat-diff-remove">{removed}</span>
        <span className="ai-chat-edited">Edited</span>
        <IconButton icon="general/expandAll" tooltip="Collapse file diff" className="ai-chat-toolbar-button" />
      </header>
      <div className="ai-chat-code-preview">{children}</div>
    </section>
  );
}

// ─── App ─────────────────────────────────────────────────────────────────────

export default function App({
  initialScreen = 'welcome',
  initialAgentTaskId = null,
  initialEditorTabId = null,
  initialOpenToolWindows = null,
} = {}) {
  const [screen, setScreen] = useState(initialScreen); // 'welcome' | 'ide'
  const [isSettingsDialogOpen, setIsSettingsDialogOpen] = useState(false);
  const [ideTabs, setIdeTabs] = useState(() => buildInitialEditorTabs());
  const [ideTabContents, setIdeTabContents] = useState(() => buildInitialEditorTabContents());
  const [interactiveTaskStates, setInteractiveTaskStates] = useState(() => buildInitialInteractiveTaskStates());
  const [activeEditorTab, setActiveEditorTab] = useState(() => {
    const initialTabs = buildInitialEditorTabs();
    if (initialEditorTabId) {
      const initialTabIndex = initialTabs.findIndex((tab) => tab.id === initialEditorTabId);
      if (initialTabIndex >= 0) return initialTabIndex;
    }
    const visitControllerTabIndex = initialTabs.findIndex((tab) => tab.id === '1');
    return visitControllerTabIndex >= 0 ? visitControllerTabIndex : 0;
  });
  const [agentTasks, setAgentTasks] = useState(AGENT_TASKS);
  const [agentTasksFocusedNodeId, setAgentTasksFocusedNodeId] = useState(null);
  const [dismissedAgentTaskSuccessIds, setDismissedAgentTaskSuccessIds] = useState([]);
  const [agentTaskExecutionTimings, setAgentTaskExecutionTimings] = useState({});
  const [agentTaskTimeTick, setAgentTaskTimeTick] = useState(() => Date.now());
  const [selectedTask, setSelectedTask] = useState('t1');
  const [newSessionMode, setNewSessionMode] = useState('chat');
  const [newSessionSpecKind, setNewSessionSpecKind] = useState('feature');
  const [aiuxProjectShowAllSessions, setAiuxProjectShowAllSessions] = useState(false);
  const [ideOpenWindows, setIdeOpenWindows] = useState(() => {
    const initial = Array.isArray(initialOpenToolWindows) && initialOpenToolWindows.length > 0
      ? initialOpenToolWindows
      : ['commit'];
    // The legacy right-side AI window is hidden; Agents is a first-class left
    // tool window in this layout.
    return initial.filter((id) => id !== 'ai');
  });
  const [plainFileGutterCommentsEnabled, setPlainFileGutterCommentsEnabled] = useState(false);
  const [diffGutterCommentsEnabled, setDiffGutterCommentsEnabled] = useState(true);
  const [fileCommentsOptionIsNew, setFileCommentsOptionIsNew] = useState(true);
  const [diffCommentsOptionIsNew, setDiffCommentsOptionIsNew] = useState(true);
  const [showFileCommentsSuggestionBanner, setShowFileCommentsSuggestionBanner] = useState(false);
  const [chatScrollTarget, setChatScrollTarget] = useState(null);
  const [selectedAiChatId, setSelectedAiChatId] = useState('refactor-time-slots');
  const [chatsHistorySlotShowsAiChat, setChatsHistorySlotShowsAiChat] = useState(false);
  // When the user opens a spec without a chat (e.g. clicking the .md row in the
  // Project / Recents / Chats History tree), we don't want the spec-status
  // useEffect to auto-open the AI chat window. Toggled by openSpecTaskOnly and
  // consumed by the effect on the next tick.
  const suppressNextSpecAutoChatRef = useRef(false);
  const [aiChatComposerDiffTabByChatId, setAiChatComposerDiffTabByChatId] = useState({});
  const [aiChatSentMessagesByChatId, setAiChatSentMessagesByChatId] = useState({});
  const [commentShortcutHintTarget, setCommentShortcutHintTarget] = useState(null);
  const [hasShownCommentShortcutHint, setHasShownCommentShortcutHint] = useState(false);
  const aiChatStreamingTimersRef = useRef({});
  const specActionDocStateTimersRef = useRef({});
  const suppressDoneCommentsChangeRef = useRef(false);
  const suppressDoneCommentsChangeTimerRef = useRef(null);
  const [aiChatDraftSessionsById, setAiChatDraftSessionsById] = useState({});
  const aiChatDraftSessionCounterRef = useRef(0);
  const [pendingDiffCommentRowsByTabId, setPendingDiffCommentRowsByTabId] = useState({});
  const [pendingDiffCommentSnapshotsByTabId, setPendingDiffCommentSnapshotsByTabId] = useState({});
  useEffect(() => {
    if (!commentShortcutHintTarget) return undefined;
    const timeoutId = window.setTimeout(() => {
      setCommentShortcutHintTarget(null);
    }, 7000);
    return () => window.clearTimeout(timeoutId);
  }, [commentShortcutHintTarget]);
  const openAiToolWindow = useCallback(() => {
    setScreen('ide');
    // AI chat reuses the Agents tool-window slot; it doesn't get its own
    // stripe item. We swap the slot content via chatsHistorySlotShowsAiChat
    // and make sure the Agents window is the active left tool window.
    setChatsHistorySlotShowsAiChat(true);
    setIdeOpenWindows((prev) => {
      const filtered = prev.filter((id) => (
        id !== 'project'
        && id !== 'commit'
        && id !== 'structure'
        && id !== CHATS_HISTORY_TOOL_WINDOW_ID
      ));
      return [CHATS_HISTORY_TOOL_WINDOW_ID, ...filtered];
    });
  }, []);
  useEffect(() => {
    if (!ideOpenWindows.includes(CHATS_HISTORY_TOOL_WINDOW_ID)) {
      setChatsHistorySlotShowsAiChat(false);
    }
  }, [ideOpenWindows]);
  // Mirrors the reference `openChatAssociatedCommitList`: the "See list" action in
  // a chat's Changes section swaps the active left tool window to Commit. The kit
  // owns which left tool window is visible, so we activate it via its stripe.
  const openCommitToolWindow = useCallback(() => {
    setScreen('ide');
    if (typeof document === 'undefined') return;
    const stripe = document.querySelector('.main-window .stripe[title="Commit"]');
    if (stripe instanceof HTMLElement && stripe.getAttribute('aria-pressed') !== 'true') {
      stripe.click();
    }
  }, []);
  const [editorTabsHost, setEditorTabsHost] = useState(null);
  const [terminalTabsState, setTerminalTabsState] = useState([]);
  const [activeTerminalTabId, setActiveTerminalTabId] = useState(null);
  const [terminalSessions, setTerminalSessions] = useState({});
  const [terminalBlocks, setTerminalBlocks] = useState([]);
  const [terminalViewKey, setTerminalViewKey] = useState(0);
  const [isTerminalStreaming, setIsTerminalStreaming] = useState(false);
  const [pendingTerminalRun, setPendingTerminalRun] = useState(null);
  const [terminalPermissionPrompt, setTerminalPermissionPrompt] = useState(null);
  const [terminalPermissionScope, setTerminalPermissionScope] = useState(null);
  const [acWarningPermissionScope, setAcWarningPermissionScope] = useState(null);
  const initialVisitBookingTaskState = useMemo(
    () => getPresetAgentTaskDefinition('t1')?.interactiveState ?? createInteractiveTaskState({
      documentSections: createSpecDocument(),
      genState: 'done',
    }),
    [],
  );
  const aiChatScenarios = useMemo(
    () => ({
      ...createAiSessionChatScenarios(AI_SESSION_CHATS),
      ...AI_CHAT_SCENARIOS,
      ...aiChatDraftSessionsById,
    }),
    [aiChatDraftSessionsById],
  );
  const aiChatDraftListItems = useMemo(
    () => Object.values(aiChatDraftSessionsById)
      .sort((left, right) => (right.createdAt ?? 0) - (left.createdAt ?? 0))
      .map((session) => {
        const sddAttachment = Array.isArray(session.attachments)
          ? session.attachments.find((attachment) => attachment?.isSddDocument)
          : null;
        const children = sddAttachment
          ? addSpecLinkToChatChildren(session.children, {
              id: sddAttachment.sourceTabId,
              label: sddAttachment.label,
            })
          : session.children;
        const specChatStatus = typeof session.id === 'string'
          && session.id.startsWith('spec-chat-')
          && typeof session.title === 'string'
          && session.title.startsWith('Specified:')
          ? 'Specified'
          : (typeof session.id === 'string'
              && session.id.startsWith('spec-chat-')
              && typeof session.title === 'string'
              && session.title.startsWith('Build:')
                ? 'Build'
                : null);

        return {
          id: session.id,
          title: session.title,
          time: 'now',
          status: session.attachmentLabel ? 'ready' : undefined,
          icon: typeof session.icon === 'string' && session.icon.length > 0
            ? session.icon
            : (typeof session.title === 'string' && session.title.endsWith('.md') ? 'fileTypes/markdown' : 'claude'),
          specChatStatus,
          sourceDocumentLabel: sddAttachment?.label ?? null,
          sourceDocumentIcon: sddAttachment?.icon ?? 'fileTypes/markdown',
          sourceDocumentTabId: sddAttachment?.sourceTabId ?? null,
          children,
        };
      }),
    [aiChatDraftSessionsById],
  );
  const aiChatRecentItems = useMemo(
    () => [
      ...aiChatDraftListItems,
      ...AI_CHAT_RECENT_ITEMS.filter((item) => !aiChatDraftSessionsById[item.id]),
    ],
    [aiChatDraftListItems, aiChatDraftSessionsById],
  );
  const aiSessionChatRows = useMemo(
    () => [
      ...aiChatDraftListItems,
      ...AI_SESSION_CHATS.filter((item) => !aiChatDraftSessionsById[item.id]),
    ],
    [aiChatDraftListItems, aiChatDraftSessionsById],
  );
  const getAiChatScenarioById = useCallback(
    (chatId) => aiChatScenarios[chatId] ?? AI_CHAT_SCENARIOS['visit-model-attributes'],
    [aiChatScenarios],
  );
  const getAiChatListItemById = useCallback(
    (chatId) => [...aiChatRecentItems, ...AI_CHAT_OLDER_THAN_7_ITEMS].find((item) => item.id === chatId) ?? null,
    [aiChatRecentItems],
  );
  const createEmptyAiChatSession = useCallback(({
    id: providedId = null,
    createdAt: providedCreatedAt = null,
    diffRequest = null,
    attachmentLabel = null,
    attachments = [],
    title = 'New Chat',
    icon = 'claude',
    emptyState = true,
    userPrompt = '',
    assistantParagraphs = [],
    changeCard = null,
    result = [],
    command = '',
    children = [],
    showAttachmentsInComposer = false,
    select = true,
  } = {}) => {
    const createdAt = Number.isFinite(providedCreatedAt) ? providedCreatedAt : Date.now();
    const id = typeof providedId === 'string' && providedId.length > 0
      ? providedId
      : `new-chat-${createdAt}-${aiChatDraftSessionCounterRef.current + 1}`;
    if (!providedId) {
      aiChatDraftSessionCounterRef.current += 1;
    }
    const session = {
      id,
      title,
      createdAt,
      icon,
      emptyState,
      userPrompt,
      assistantParagraphs: Array.isArray(assistantParagraphs) ? assistantParagraphs : [],
      changeCard,
      result: Array.isArray(result) ? result : [],
      command,
      children: Array.isArray(children) ? children : [],
      showAttachmentsInComposer,
      attachmentLabel,
      attachments: Array.isArray(attachments) ? attachments : [],
      diffRequest,
    };

    setAiChatDraftSessionsById((prev) => ({
      ...prev,
      [id]: session,
    }));
    setAiChatSentMessagesByChatId((prev) => ({
      ...prev,
      [id]: prev[id] ?? [],
    }));
    if (select) {
      setSelectedAiChatId(id);
      openAiToolWindow();
    }

    return session;
  }, [openAiToolWindow]);
  const [runStatesByTab, setRunStatesByTab] = useState({});
  const [specDocumentRunRequestsByTab, setSpecDocumentRunRequestsByTab] = useState({});
  const [acRunResult, setAcRunResult] = useState(() => initialVisitBookingTaskState.acRunResult ?? null); // null | string[] — statuses per AC checkbox
  const [planRunResult, setPlanRunResult] = useState(() => initialVisitBookingTaskState.planRunResult ?? null);
  const [acWarningBanner, setAcWarningBanner] = useState(null);
  const lastRunSectionRef = useRef(null);
  const lastTerminalRunRequestRef = useRef(null);
  const queueTerminalRunRef = useRef(null);
  const currentTerminalRunTabIdRef = useRef(null);
  const currentRunSourceTabIdRef = useRef(null);
  const statusRevealTimeoutsRef = useRef({ ac: [], plan: [] });
  const chainedRunTimeoutRef = useRef(null);
  const acWarningFlowRef = useRef(null);
  const [genState, setGenState] = useState(() => initialVisitBookingTaskState.genState ?? 'done'); // 'idle' | 'done' in the current flow; loading/generating are kept behind a flag
  const [genProgress, setGenProgress] = useState(() => initialVisitBookingTaskState.genProgress ?? 1);
  const [generatedDocument, setGeneratedDocument] = useState(() => initialVisitBookingTaskState.documentSections ?? createSpecDocument());
  const [appliedIssueFixes, setAppliedIssueFixes] = useState(() => initialVisitBookingTaskState.appliedIssueFixes ?? { ac: {}, plan: {} });
  const [removedIssueIndices, setRemovedIssueIndices] = useState(() => initialVisitBookingTaskState.removedIssueIndices ?? { ac: {}, plan: {} });
  const [agentTaskCommentEntries, setAgentTaskCommentEntries] = useState(() => initialVisitBookingTaskState.commentEntries ?? []);
  const [doneCommentResetToken, setDoneCommentResetToken] = useState(0);
  const [highlightedProblemLocation, setHighlightedProblemLocation] = useState(null);
  const problemsTreeNodesByDisplayRef = useRef(new Map());
  const [generationTabId, setGenerationTabId] = useState('agent-task-t1');
  const [specTopBarStatusesByTab, setSpecTopBarStatusesByTab] = useState({
    'agent-task-t1': 'Specified',
  });
  const doneEnhanceFlowRef = useRef(null);
  const specStatusChatIdsRef = useRef({});
  const seededPresetTaskRef = useRef(!initialAgentTaskId);
  const genTimerRef = useRef(null);
  const terminalDrivenGenerationRef = useRef(false);
  const terminalRunTimeoutsRef = useRef([]);
  const specDoneScrollSnapshotsRef = useRef({});

  // Editor completion state
  const [editorCompletion, setEditorCompletion] = useState(null); // { trigger, query, selectedIdx, pos }
  const editorCompletionRef = useRef(null);
  const [idleSelectionToolbarPos, setIdleSelectionToolbarPos] = useState(null);
  const [editorSelectionToolbarPos, setEditorSelectionToolbarPos] = useState(null);

  // Attached files for editor toolbar
  const [attachedFilesByTab, setAttachedFilesByTab] = useState({});
  const [doneOverlayUiStates, setDoneOverlayUiStates] = useState({});
  const [specVersionsByTab, setSpecVersionsByTab] = useState({});
  const [planDiffUiStates, setPlanDiffUiStates] = useState({});
  const addPopupFiles = buildAddPopupFiles(agentTasks);

  useEffect(() => () => {
    Object.values(aiChatStreamingTimersRef.current).forEach((timerId) => {
      window.clearTimeout(timerId);
    });
    aiChatStreamingTimersRef.current = {};
    Object.values(specActionDocStateTimersRef.current).forEach((timerId) => {
      window.clearTimeout(timerId);
    });
    specActionDocStateTimersRef.current = {};
    if (suppressDoneCommentsChangeTimerRef.current) {
      window.clearTimeout(suppressDoneCommentsChangeTimerRef.current);
      suppressDoneCommentsChangeTimerRef.current = null;
    }
  }, []);

  const ideWindowKey = ideOpenWindows.join('|');
  const activeEditorTabMeta = ideTabs[activeEditorTab ?? 0] ?? null;
  const activeEditorTabId = activeEditorTabMeta?.id ?? null;
  const activeEditorTabContentEntry = activeEditorTabId ? (ideTabContents[activeEditorTabId] ?? null) : null;
  const activeSourceEditorTabId = activeEditorTabMeta?.sourceTabId
    ?? activeEditorTabContentEntry?.diffSourceTabId
    ?? (activeEditorTabId?.startsWith('plan-diff-')
      ? activeEditorTabId.slice('plan-diff-'.length)
      : activeEditorTabId);
  const visibleEditorStateTabId = activeSourceEditorTabId ?? activeEditorTabId;
  const runState = visibleEditorStateTabId ? (runStatesByTab[visibleEditorStateTabId] ?? 'default') : 'default';
  const activeSpecDocumentRunRequest = visibleEditorStateTabId
    ? (specDocumentRunRequestsByTab[visibleEditorStateTabId] ?? null)
    : null;
  const activeSpecTopBarStatus = visibleEditorStateTabId
    ? (specTopBarStatusesByTab[visibleEditorStateTabId] ?? 'Specified')
    : 'Specified';
  const setSpecTopBarStatusForTab = useCallback((status, tabId = visibleEditorStateTabId) => {
    if (!tabId || !['Build', 'Specified'].includes(status)) return;
    setSpecTopBarStatusesByTab((prev) => (
      prev[tabId] === status
        ? prev
        : {
            ...prev,
            [tabId]: status,
          }
    ));
  }, [visibleEditorStateTabId]);
  const attachedFiles = visibleEditorStateTabId && Array.isArray(attachedFilesByTab[visibleEditorStateTabId])
    ? attachedFilesByTab[visibleEditorStateTabId]
    : [];

  const resolveEditorStateTabId = useCallback((tabId = null) => (
    tabId ?? activeSourceEditorTabId ?? activeEditorTabId ?? generationTabId
  ), [activeEditorTabId, activeSourceEditorTabId, generationTabId]);

  const updateAttachedFilesForTab = useCallback((updater, tabId = null) => {
    const resolvedTabId = resolveEditorStateTabId(tabId);
    if (!resolvedTabId) return;

    setAttachedFilesByTab((prev) => {
      const previousFiles = Array.isArray(prev[resolvedTabId]) ? prev[resolvedTabId] : [];
      const nextFiles = typeof updater === 'function' ? updater(previousFiles) : updater;
      const normalizedNextFiles = Array.isArray(nextFiles) ? nextFiles : [];

      if (normalizedNextFiles === previousFiles) {
        return prev;
      }

      return {
        ...prev,
        [resolvedTabId]: normalizedNextFiles,
      };
    });
  }, [resolveEditorStateTabId]);

  const updateDoneOverlayUiStateForTab = useCallback((uiState, tabId = null) => {
    const resolvedTabId = resolveEditorStateTabId(tabId);
    if (!resolvedTabId) return;

    const normalizedNextUiState = normalizeDoneOverlayUiState(uiState);

    setDoneOverlayUiStates((prev) => {
      const previousUiState = prev[resolvedTabId] ?? null;

      if (areDoneOverlayUiStatesEqual(previousUiState, normalizedNextUiState)) {
        return prev;
      }

      if (Object.keys(normalizedNextUiState).length === 1 && normalizedNextUiState.breakpointKeys.length === 0) {
        if (!(resolvedTabId in prev)) {
          return prev;
        }

        const { [resolvedTabId]: _removedUiState, ...rest } = prev;
        return rest;
      }

      return {
        ...prev,
        [resolvedTabId]: normalizedNextUiState,
      };
    });
  }, [resolveEditorStateTabId]);

  const updateSpecVersionsForTab = useCallback((updater, tabId = null) => {
    const resolvedTabId = resolveEditorStateTabId(tabId);
    if (!resolvedTabId) return;

    setSpecVersionsByTab((prev) => {
      const previousHistory = prev[resolvedTabId] ?? null;
      const nextHistory = typeof updater === 'function'
        ? updater(previousHistory)
        : updater;

      if (nextHistory === previousHistory) {
        return prev;
      }

      if (!nextHistory) {
        if (!(resolvedTabId in prev)) {
          return prev;
        }

        const { [resolvedTabId]: _removedHistory, ...rest } = prev;
        return rest;
      }

      return {
        ...prev,
        [resolvedTabId]: nextHistory,
      };
    });
  }, [resolveEditorStateTabId]);

  const updatePlanDiffUiStateForTab = useCallback((uiState, tabId = null) => {
    const resolvedTabId = tabId ?? activeEditorTabId;
    if (!resolvedTabId) return;

    const normalizedNextUiState = normalizePlanDiffUiState(uiState);

    setPlanDiffUiStates((prev) => {
      const previousUiState = prev[resolvedTabId] ?? null;

      if (arePlanDiffUiStatesEqual(previousUiState, normalizedNextUiState)) {
        return prev;
      }

      if (arePlanDiffUiStatesEqual(normalizedNextUiState, null)) {
        if (!(resolvedTabId in prev)) {
          return prev;
        }

        const { [resolvedTabId]: _removedUiState, ...rest } = prev;
        return rest;
      }

      return {
        ...prev,
        [resolvedTabId]: normalizedNextUiState,
      };
    });
  }, [activeEditorTabId]);

  const restoreSpecDoneScrollForTab = useCallback((tabId) => {
    if (!tabId) return;

    scheduleSpecDoneScrollRestore(specDoneScrollSnapshotsRef.current[tabId] ?? null);
  }, []);

  const resolveRunStateTabId = useCallback((tabId = null) => (
    tabId ?? currentRunSourceTabIdRef.current ?? activeSourceEditorTabId ?? activeEditorTabId ?? generationTabId
  ), [activeEditorTabId, activeSourceEditorTabId, generationTabId]);

  const setRunStateForTab = useCallback((value, tabId = null) => {
    const resolvedTabId = resolveRunStateTabId(tabId);
    if (!resolvedTabId) return;

    setRunStatesByTab((prev) => {
      const previousState = prev[resolvedTabId] ?? 'default';
      const nextState = typeof value === 'function' ? value(previousState) : value;

      if (nextState === previousState) {
        return prev;
      }

      return {
        ...prev,
        [resolvedTabId]: nextState,
      };
    });
  }, [resolveRunStateTabId]);

  const clearSpecDocumentRunRequestForTab = useCallback((tabId) => {
    if (!tabId) return;
    setSpecDocumentRunRequestsByTab((prev) => {
      if (!(tabId in prev)) return prev;
      const { [tabId]: _removedRunRequest, ...rest } = prev;
      return rest;
    });
    if (lastTerminalRunRequestRef.current?.sourceTabId === tabId) {
      lastTerminalRunRequestRef.current = null;
    }
    if (currentRunSourceTabIdRef.current === tabId) {
      currentRunSourceTabIdRef.current = null;
    }
    setRunStateForTab('default', tabId);
  }, [setRunStateForTab]);

  const updateTerminalSession = useCallback((tabId, updater) => {
    if (!tabId) return;

    setTerminalSessions((prev) => {
      const previousState = prev[tabId] ?? createTerminalSessionState();
      const nextState = typeof updater === 'function'
        ? updater(previousState)
        : { ...previousState, ...updater };

      if (nextState === previousState) {
        return prev;
      }

      return {
        ...prev,
        [tabId]: nextState,
      };
    });
  }, []);

  const resolveTerminalSessionMeta = useCallback((runRequest = null) => {
    const explicitSourceTabId =
      typeof runRequest?.sourceTabId === 'string' && runRequest.sourceTabId.length > 0
        ? runRequest.sourceTabId
        : null;
    const fallbackTab = ideTabs[activeEditorTab ?? 0] ?? null;
    const sourceTab = explicitSourceTabId
      ? (ideTabs.find((tab) => tab.id === explicitSourceTabId) ?? null)
      : (generationTabId
          ? (ideTabs.find((tab) => tab.id === generationTabId) ?? fallbackTab)
          : fallbackTab);
    const sourceTabId = explicitSourceTabId ?? sourceTab?.id ?? 'current-file';
    const label = runRequest?.taskLabel ?? sourceTab?.label ?? TERMINAL_TASK_TAB_BASE_LABEL;

    return {
      terminalTabId: buildTerminalSessionTabId(sourceTabId),
      sourceTabId: explicitSourceTabId ?? sourceTab?.id ?? null,
      label,
    };
  }, [activeEditorTab, generationTabId, ideTabs]);

  const ensureTerminalSession = useCallback((meta, options = {}) => {
    const { activate = true } = options;
    const tabId = meta?.terminalTabId;
    if (!tabId) return null;

    const nextTab = {
      id: tabId,
      label: meta?.label ?? TERMINAL_TASK_TAB_BASE_LABEL,
      closable: true,
      sourceTabId: meta?.sourceTabId ?? null,
    };

    setTerminalTabsState((prev) => {
      const existingIndex = prev.findIndex((tab) => tab.id === tabId);

      if (existingIndex >= 0) {
        const currentTab = prev[existingIndex];
        if (
          currentTab.label === nextTab.label &&
          currentTab.sourceTabId === nextTab.sourceTabId &&
          currentTab.closable === nextTab.closable
        ) {
          return prev;
        }

        const nextTabs = [...prev];
        nextTabs[existingIndex] = { ...currentTab, ...nextTab };
        return nextTabs;
      }

      return [...prev, nextTab];
    });

    updateTerminalSession(tabId, (prev) => ({
      ...prev,
      sourceTabId: meta?.sourceTabId ?? prev.sourceTabId ?? null,
      sourceTabLabel: meta?.label ?? prev.sourceTabLabel ?? TERMINAL_TASK_TAB_BASE_LABEL,
    }));

    if (activate) {
      setActiveTerminalTabId(tabId);
    }

    return tabId;
  }, [updateTerminalSession]);

  const setTerminalBlocksForTab = useCallback((blocks, tabId = currentTerminalRunTabIdRef.current ?? activeTerminalTabId) => {
    setTerminalBlocks(blocks);

    if (!tabId) return;

    updateTerminalSession(tabId, (prev) => ({
      ...prev,
      blocks: typeof blocks === 'function' ? blocks(prev.blocks) : blocks,
    }));
  }, [activeTerminalTabId, updateTerminalSession]);

  const setTerminalStreamingForTab = useCallback((value, tabId = currentTerminalRunTabIdRef.current ?? activeTerminalTabId) => {
    setIsTerminalStreaming(value);

    if (!tabId) return;

    updateTerminalSession(tabId, (prev) => ({
      ...prev,
      isStreaming: typeof value === 'function' ? value(prev.isStreaming) : value,
    }));
  }, [activeTerminalTabId, updateTerminalSession]);

  const setPendingTerminalRunForTab = useCallback((value, tabId = currentTerminalRunTabIdRef.current ?? activeTerminalTabId) => {
    setPendingTerminalRun(value);

    if (!tabId) return;

    updateTerminalSession(tabId, (prev) => ({
      ...prev,
      pendingRun: typeof value === 'function' ? value(prev.pendingRun) : value,
    }));
  }, [activeTerminalTabId, updateTerminalSession]);

  const setTerminalPermissionPromptForTab = useCallback((value, tabId = currentTerminalRunTabIdRef.current ?? activeTerminalTabId) => {
    setTerminalPermissionPrompt(value);

    if (!tabId) return;

    updateTerminalSession(tabId, (prev) => ({
      ...prev,
      permissionPrompt: typeof value === 'function' ? value(prev.permissionPrompt) : value,
    }));
  }, [activeTerminalTabId, updateTerminalSession]);

  const setAcWarningBannerForTab = useCallback((value, tabId = currentTerminalRunTabIdRef.current ?? activeTerminalTabId) => {
    setAcWarningBanner(value);

    if (!tabId) return;

    updateTerminalSession(tabId, (prev) => ({
      ...prev,
      acWarningBanner: typeof value === 'function' ? value(prev.acWarningBanner) : value,
    }));
  }, [activeTerminalTabId, updateTerminalSession]);

  const bumpTerminalViewKeyForTab = useCallback((tabId = currentTerminalRunTabIdRef.current ?? activeTerminalTabId) => {
    setTerminalViewKey((prev) => prev + 1);

    if (!tabId) return;

    updateTerminalSession(tabId, (prev) => ({
      ...prev,
      viewKey: (prev.viewKey ?? 0) + 1,
    }));
  }, [activeTerminalTabId, updateTerminalSession]);

  useEffect(() => {
    if (terminalTabsState.length === 0) {
      if (activeTerminalTabId !== null) {
        setActiveTerminalTabId(null);
      }
      return;
    }

    if (!activeTerminalTabId || !terminalTabsState.some((tab) => tab.id === activeTerminalTabId)) {
      setActiveTerminalTabId(terminalTabsState[0].id);
    }
  }, [activeTerminalTabId, terminalTabsState]);

  useEffect(() => {
    if (terminalTabsState.length === 0) return;

    setTerminalTabsState((prev) => {
      let didChange = false;
      const nextTabs = prev.map((tab) => {
        if (!tab.sourceTabId) return tab;

        const matchingEditorTab = ideTabs.find((editorTab) => editorTab.id === tab.sourceTabId);
        if (!matchingEditorTab || matchingEditorTab.label === tab.label) {
          return tab;
        }

        didChange = true;
        return {
          ...tab,
          label: matchingEditorTab.label,
        };
      });

      return didChange ? nextTabs : prev;
    });

    setTerminalSessions((prev) => {
      let didChange = false;
      const nextSessions = { ...prev };

      Object.entries(prev).forEach(([tabId, session]) => {
        const matchingTab = terminalTabsState.find((tab) => tab.id === tabId);
        if (!matchingTab?.sourceTabId) return;

        const matchingEditorTab = ideTabs.find((editorTab) => editorTab.id === matchingTab.sourceTabId);
        if (!matchingEditorTab || matchingEditorTab.label === session.sourceTabLabel) {
          return;
        }

        didChange = true;
        nextSessions[tabId] = {
          ...session,
          sourceTabLabel: matchingEditorTab.label,
        };
      });

      return didChange ? nextSessions : prev;
    });
  }, [ideTabs, terminalTabsState]);

  const clearTerminalRunAnimation = useCallback(() => {
    terminalRunTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
    terminalRunTimeoutsRef.current = [];
    setTerminalStreamingForTab(false);
  }, [setTerminalStreamingForTab]);

  const clearStatusReveal = useCallback((kind) => {
    statusRevealTimeoutsRef.current[kind].forEach((timeoutId) => window.clearTimeout(timeoutId));
    statusRevealTimeoutsRef.current[kind] = [];
  }, []);

  const clearChainedRunTimeout = useCallback(() => {
    if (!chainedRunTimeoutRef.current) return;
    window.clearTimeout(chainedRunTimeoutRef.current);
    chainedRunTimeoutRef.current = null;
  }, []);

  const clearAcWarningFlow = useCallback(() => {
    acWarningFlowRef.current = null;
    setAcWarningBannerForTab(null);
  }, [setAcWarningBannerForTab]);

  const resetRunUiForTab = useCallback((sourceTabId) => {
    if (!sourceTabId) return;
    const terminalTabId = buildTerminalSessionTabId(sourceTabId);
    setRunStateForTab('default', sourceTabId);
    setSpecDocumentRunRequestsByTab((prev) => {
      if (!(sourceTabId in prev)) return prev;
      const { [sourceTabId]: _removedRunRequest, ...rest } = prev;
      return rest;
    });
    setPendingTerminalRunForTab(null, terminalTabId);
    setTerminalPermissionPromptForTab(null, terminalTabId);
    setAcWarningBannerForTab(null, terminalTabId);
    if (currentRunSourceTabIdRef.current === sourceTabId) {
      currentRunSourceTabIdRef.current = null;
    }
  }, [
    setAcWarningBannerForTab,
    setPendingTerminalRunForTab,
    setRunStateForTab,
    setTerminalPermissionPromptForTab,
  ]);

  const resetDoneComments = useCallback(() => {
    setAgentTaskCommentEntries([]);
    setDoneCommentResetToken((prev) => prev + 1);
  }, []);

  const clearAgentTaskRuntime = useCallback(() => {
    if (genTimerRef.current) {
      clearTimeout(genTimerRef.current);
      genTimerRef.current = null;
    }

    doneEnhanceFlowRef.current = null;
    terminalDrivenGenerationRef.current = false;
    clearChainedRunTimeout();
    clearStatusReveal('plan');
    clearStatusReveal('ac');
    clearAcWarningFlow();
    clearTerminalRunAnimation();
    setPendingTerminalRunForTab(null);
    setTerminalPermissionPromptForTab(null);
    currentTerminalRunTabIdRef.current = null;
    setGenerationTabId(null);
    setGenProgress(0);
    setGenState('idle');
    setRunStateForTab('default');
    currentRunSourceTabIdRef.current = null;
    setAcRunResult(null);
    setPlanRunResult(null);
    resetDoneComments();
  }, [
    clearAcWarningFlow,
    clearChainedRunTimeout,
    clearStatusReveal,
    clearTerminalRunAnimation,
    resetDoneComments,
    setPendingTerminalRunForTab,
    setRunStateForTab,
    setTerminalPermissionPromptForTab,
  ]);

  const applyInteractiveTaskState = useCallback((tabId, taskState) => {
    if (!tabId) return;

    const nextTaskState = taskState ?? getAgentTaskScenario({ tabId }).initialTaskState;
    const nextGenState = nextTaskState?.genState ?? 'idle';

    setGeneratedDocument(nextTaskState?.documentSections ?? []);
    setAppliedIssueFixes(nextTaskState?.appliedIssueFixes ?? cloneIssueStateMap());
    setRemovedIssueIndices(nextTaskState?.removedIssueIndices ?? cloneIssueStateMap());
    setAcRunResult(nextTaskState?.acRunResult ?? null);
    setPlanRunResult(nextTaskState?.planRunResult ?? null);
    setGenerationTabId(nextGenState === 'idle' ? null : tabId);
    setGenProgress(nextTaskState?.genProgress ?? (nextGenState === 'done' ? 1 : 0));
    setGenState(nextGenState);
    setAgentTaskCommentEntries(nextTaskState?.commentEntries ?? []);
    setDoneCommentResetToken((prev) => prev + 1);
  }, []);

  const getCurrentAgentTaskScenario = useCallback((tabId = null) => {
    const fallbackTab = ideTabs[activeEditorTab ?? 0] ?? null;
    const resolvedTab = tabId
      ? (ideTabs.find((tab) => tab.id === tabId) ?? fallbackTab)
      : (generationTabId
          ? (ideTabs.find((tab) => tab.id === generationTabId) ?? fallbackTab)
          : fallbackTab);

    return getAgentTaskScenario({
      tabId: resolvedTab?.id ?? '',
      label: resolvedTab?.label ?? '',
    });
  }, [activeEditorTab, generationTabId, ideTabs]);

  const getTaskRuntimeState = useCallback((tabId) => {
    if (!tabId) return null;

    const matchingTab = ideTabs.find((tab) => tab.id === tabId) ?? null;
    const scenario = getAgentTaskScenario({
      tabId,
      label: matchingTab?.label ?? '',
    });
    const isLiveTaskTab = tabId === activeSourceEditorTabId || tabId === generationTabId;
    const taskState = isLiveTaskTab
      ? {
          genState,
          genProgress,
          documentSections: generatedDocument,
          appliedIssueFixes,
          removedIssueIndices,
          acRunResult,
          planRunResult,
          commentEntries: agentTaskCommentEntries,
        }
      : (interactiveTaskStates[tabId] ?? scenario.initialTaskState);
    const persistedCode = ideTabContents[tabId]?.code;
    const baseCode =
      typeof persistedCode === 'string' && persistedCode.length > 0
        ? persistedCode
        : serializeSpecDocument(taskState?.documentSections ?? scenario.defaultDocument ?? []);

    return {
      tab: matchingTab,
      scenario,
      taskState,
      baseCode,
    };
  }, [
    activeSourceEditorTabId,
    acRunResult,
    agentTaskCommentEntries,
    appliedIssueFixes,
    genProgress,
    genState,
    generatedDocument,
    generationTabId,
    ideTabContents,
    ideTabs,
    interactiveTaskStates,
    planRunResult,
    removedIssueIndices,
  ]);

  const clearTaskCommentsForTab = useCallback((tabId) => {
    if (!tabId) return;

    suppressDoneCommentsChangeRef.current = true;
    if (suppressDoneCommentsChangeTimerRef.current) {
      window.clearTimeout(suppressDoneCommentsChangeTimerRef.current);
    }
    suppressDoneCommentsChangeTimerRef.current = window.setTimeout(() => {
      suppressDoneCommentsChangeRef.current = false;
      suppressDoneCommentsChangeTimerRef.current = null;
    }, 300);

    if (tabId === activeSourceEditorTabId || tabId === generationTabId) {
      setAgentTaskCommentEntries((prev) => (Array.isArray(prev) && prev.length > 0 ? [] : prev));
    }
    setInteractiveTaskStates((prev) => {
      const currentTaskState = prev[tabId];
      if (!currentTaskState || !Array.isArray(currentTaskState.commentEntries) || currentTaskState.commentEntries.length === 0) {
        return prev;
      }

      return {
        ...prev,
        [tabId]: {
          ...currentTaskState,
          commentEntries: [],
        },
      };
    });
    setIdeTabContents((prev) => {
      let didChange = false;
      const next = {};

      Object.entries(prev).forEach(([contentTabId, content]) => {
        const documentDiffComments = normalizeStoredDiffCommentsState(content?.documentDiffComments);
        const hasDocumentDiffComments = flattenStoredDiffCommentsState(documentDiffComments).length > 0;
        const documentCommentSourceTabId = content?.documentCommentSourceTabId ?? null;
        const isLegacyAgentTaskComment =
          !documentCommentSourceTabId
          && tabId === 'agent-task-t1'
          && hasDocumentDiffComments;

        if (
          hasDocumentDiffComments
          && (documentCommentSourceTabId === tabId || isLegacyAgentTaskComment)
        ) {
          next[contentTabId] = {
            ...content,
            documentDiffComments: {},
            documentCommentSourceTabId: null,
          };
          didChange = true;
          return;
        }

        next[contentTabId] = content;
      });

      return didChange ? next : prev;
    });
    setDoneCommentResetToken((prev) => prev + 1);
  }, [activeSourceEditorTabId, generationTabId]);

  const clearTaskCommentTargetForTab = useCallback((tabId, target) => {
    const normalizedTarget = normalizeCommentTarget(target);
    if (!tabId || !normalizedTarget) return;

    if (tabId === activeSourceEditorTabId || tabId === generationTabId) {
      setAgentTaskCommentEntries((prev) => {
        if (!Array.isArray(prev) || prev.length === 0) return prev;
        const nextEntries = prev.filter((entry) => !doesEntryMatchCommentTarget(entry, normalizedTarget));
        return nextEntries.length === prev.length ? prev : nextEntries;
      });
    }
    setInteractiveTaskStates((prev) => {
      const currentTaskState = prev[tabId];
      if (!currentTaskState || !Array.isArray(currentTaskState.commentEntries) || currentTaskState.commentEntries.length === 0) {
        return prev;
      }

      const nextEntries = currentTaskState.commentEntries.filter((entry) => !doesEntryMatchCommentTarget(entry, normalizedTarget));
      if (nextEntries.length === currentTaskState.commentEntries.length) {
        return prev;
      }

      return {
        ...prev,
        [tabId]: {
          ...currentTaskState,
          commentEntries: nextEntries,
        },
      };
    });
  }, [activeSourceEditorTabId, generationTabId]);

  const getCommentEntriesForTaskTab = useCallback((tabId) => {
    if (!tabId) return [];

    if (doneEnhanceFlowRef.current?.commentsAlreadyCleared && doneEnhanceFlowRef.current?.sourceTabId === tabId) {
      return [];
    }

    if (tabId === activeSourceEditorTabId || tabId === generationTabId) {
      return Array.isArray(agentTaskCommentEntries) ? agentTaskCommentEntries : [];
    }

    const storedTaskState = interactiveTaskStates[tabId];
    if (Array.isArray(storedTaskState?.commentEntries)) {
      return storedTaskState.commentEntries;
    }

    const matchingTab = ideTabs.find((tab) => tab.id === tabId) ?? null;
    const fallbackScenario = getAgentTaskScenario({
      tabId,
      label: matchingTab?.label ?? '',
    });

    return Array.isArray(fallbackScenario.initialTaskState?.commentEntries)
      ? fallbackScenario.initialTaskState.commentEntries
      : [];
  }, [
    activeSourceEditorTabId,
    agentTaskCommentEntries,
    generationTabId,
    ideTabs,
    interactiveTaskStates,
  ]);

  const getCommentDrivenViewStateForTaskTab = useCallback((tabId, options = {}) => {
    const runtimeState = getTaskRuntimeState(tabId);
    if (!runtimeState) return null;

    const { applyPendingComments = false } = options ?? {};
    const { scenario, taskState, baseCode } = runtimeState;
    const isTaskRunActive = (runStatesByTab[tabId] ?? 'default') === 'running';
    const baseDocumentSections = taskState?.documentSections ?? scenario.defaultDocument ?? [];
    let resolvedCode = baseCode;
    let resolvedDocumentSections = baseDocumentSections;
    let resolvedAppliedIssueFixes = cloneIssueStateMap(taskState?.appliedIssueFixes);
    let resolvedRemovedIssueIndices = cloneIssueStateMap(taskState?.removedIssueIndices);
    let commentResolution = null;

    if (applyPendingComments) {
      commentResolution = applyCommentCommandsToSpec({
        code: baseCode,
        documentSections: baseDocumentSections,
        commentEntries: taskState?.commentEntries ?? [],
        appliedIssueFixes: taskState?.appliedIssueFixes,
        removedIssueIndices: taskState?.removedIssueIndices,
      });
      resolvedCode = commentResolution.sourceCode;
      resolvedDocumentSections = commentResolution.nextDocument;
      resolvedAppliedIssueFixes = commentResolution.nextAppliedIssueFixes;
      resolvedRemovedIssueIndices = commentResolution.nextRemovedIssueIndices;
    }

    // Stored run results are authoritative after quick fixes / enhance reruns.
    // Rebuilding them from scenario defaults would resurrect resolved issues.
    const resolvedAcRunResult = taskState?.acRunResult ?? null;
    const resolvedPlanRunResult = taskState?.planRunResult ?? null;

    return {
      commentResolution,
      code: resolvedCode,
      documentSections: resolvedDocumentSections,
      appliedIssueFixes: resolvedAppliedIssueFixes,
      removedIssueIndices: resolvedRemovedIssueIndices,
      acRunResult: isTaskRunActive && Array.isArray(taskState?.acRunResult)
        ? taskState.acRunResult
        : resolvedAcRunResult,
      planRunResult: isTaskRunActive && Array.isArray(taskState?.planRunResult)
        ? taskState.planRunResult
        : resolvedPlanRunResult,
    };
  }, [getTaskRuntimeState, runStatesByTab]);

  const syncDiffCommentsToTaskTarget = useCallback(({
    sourceTabId,
    target,
    comments,
    sectionTitle = null,
    line = '',
    hideInlineInDocument = false,
    sourceKind = null,
    sourceLabel = null,
    sourceIcon = null,
    sourceNavigationTabId = null,
    sourceNavigationRowId = null,
    sourceLineNumber = null,
  }) => {
    const normalizedTarget = normalizeCommentTarget(target);
    if (!sourceTabId || !normalizedTarget) return;

    const runtimeState = getTaskRuntimeState(sourceTabId);
    const taskLabel = runtimeState?.tab?.label ?? '';
    const nextDiffComments = Array.isArray(comments)
      ? undefined
      : normalizeStoredDiffCommentsState(comments);
    const nextComments = Array.isArray(comments)
      ? comments.filter((comment) => getStoredCommentText(comment).trim().length > 0)
      : flattenStoredDiffCommentsState(nextDiffComments);
    const targetMetadata = buildCommentTargetEntryMetadata(
      runtimeState?.taskState?.documentSections ?? runtimeState?.scenario?.defaultDocument ?? [],
      normalizedTarget,
      runtimeState?.taskState?.removedIssueIndices ?? cloneIssueStateMap(),
    );
    const metadata = {
      sectionTitle: sectionTitle ?? (normalizedTarget.kind === 'plan' ? 'Plan' : 'Acceptance Criteria'),
      line: targetMetadata.line || line,
      rawIndex: targetMetadata.rawIndex,
      rowStableKey: targetMetadata.rowStableKey,
      diffComments: nextDiffComments,
      sourceKind,
      sourceLabel,
      sourceIcon,
      sourceNavigationTabId,
      sourceNavigationRowId,
      sourceLineNumber,
      hideInlineInDocument,
    };

    setInteractiveTaskStates((prev) => {
      const currentTaskState = prev[sourceTabId] ?? getAgentTaskScenario({
        tabId: sourceTabId,
        label: taskLabel,
      }).initialTaskState;
      const nextCommentEntries = replaceCommentEntriesForTarget(
        currentTaskState?.commentEntries ?? [],
        normalizedTarget,
        nextComments,
        metadata,
      );

      if (JSON.stringify(currentTaskState?.commentEntries ?? []) === JSON.stringify(nextCommentEntries)) {
        return prev;
      }

      return {
        ...prev,
        [sourceTabId]: {
          ...currentTaskState,
          commentEntries: nextCommentEntries,
        },
      };
    });

    if (sourceTabId === activeSourceEditorTabId || sourceTabId === generationTabId) {
      setAgentTaskCommentEntries((prev) => replaceCommentEntriesForTarget(
        prev,
        normalizedTarget,
        nextComments,
        metadata,
      ));
    }
  }, [activeSourceEditorTabId, generationTabId, getTaskRuntimeState]);

  const handleAgentTaskSelect = useCallback((task, options = {}) => {
    const { revealAgentTasks = true } = options ?? {};
    const resolvedTask = typeof task === 'string'
      ? (agentTasks.find((item) => item?.id === task) ?? null)
      : task;
    const taskId = typeof task === 'string' ? task : resolvedTask?.id;
    if (!taskId) return;

    const preset = getPresetAgentTaskDefinition(taskId);
    const resolvedTabId = preset?.tab?.id ?? getAgentTaskTabId(taskId) ?? taskId;
    const taskLabel = resolvedTask?.label ?? preset?.tab?.label ?? 'New Task.md';
    const scenario = getAgentTaskScenario({
      tabId: resolvedTabId,
      label: taskLabel,
    });
    const nextTab = preset?.tab ?? {
      id: resolvedTabId,
      label: taskLabel,
      icon: 'fileTypes/markdown',
      closable: true,
    };
    const nextContent = preset?.content ?? {
      language: 'text',
      code: scenario.initialCode,
    };
    const nextTaskState = interactiveTaskStates[resolvedTabId] ?? preset?.interactiveState ?? scenario.initialTaskState;

    setSelectedTask(taskId);
    setScreen('ide');
    if (revealAgentTasks) {
      setIdeOpenWindows((prev) => (
        prev.includes(CHATS_HISTORY_TOOL_WINDOW_ID) ? prev : [...prev, CHATS_HISTORY_TOOL_WINDOW_ID]
      ));
    }

    const existingTabIndex = ideTabs.findIndex((tabItem) => tabItem.id === resolvedTabId);
    const nextTabs = existingTabIndex >= 0 ? ideTabs : [nextTab, ...ideTabs];
    const nextActiveTabIndex = existingTabIndex >= 0 ? existingTabIndex : 0;

    if (existingTabIndex < 0) {
      setIdeTabs(nextTabs);
    }

    setIdeTabContents((prev) => {
      if (prev[resolvedTabId]) return prev;

      return {
        ...prev,
        [resolvedTabId]: {
          ...(prev[resolvedTabId] ?? {}),
          ...nextContent,
        },
      };
    });
    setActiveEditorTab(nextActiveTabIndex);

    if (preset?.kind && preset.kind !== 'interactive') {
      return;
    }

    setInteractiveTaskStates((prev) => (
      prev[resolvedTabId]
        ? prev
        : { ...prev, [resolvedTabId]: nextTaskState }
    ));

    applyInteractiveTaskState(resolvedTabId, nextTaskState);
    setRunStateForTab('default', resolvedTabId);
    setPendingTerminalRunForTab(null, buildTerminalSessionTabId(resolvedTabId));
    setTerminalPermissionPromptForTab(null, buildTerminalSessionTabId(resolvedTabId));
    setAcWarningBannerForTab(null, buildTerminalSessionTabId(resolvedTabId));
  }, [
    agentTasks,
    applyInteractiveTaskState,
    ideTabs,
    interactiveTaskStates,
    setAcWarningBannerForTab,
    setPendingTerminalRunForTab,
    setRunStateForTab,
    setTerminalPermissionPromptForTab,
  ]);

  const handleEditorTabChange = useCallback((nextIndex) => {
    setActiveEditorTab(nextIndex);

    const nextTab = ideTabs[nextIndex];
    if (!nextTab) return;

    restoreSpecDoneScrollForTab(nextTab.id);

    const matchingTask = agentTasks.find((task) => task.label === nextTab.label || task.id === nextTab.id);
    if (matchingTask && matchingTask.id !== selectedTask) {
      setSelectedTask(matchingTask.id);
    }

    if (!nextTab.id?.startsWith('agent-task-')) {
      return;
    }

    const nextTaskState = interactiveTaskStates[nextTab.id] ?? getAgentTaskScenario({
      tabId: nextTab.id,
      label: nextTab.label,
    }).initialTaskState;

    setInteractiveTaskStates((prev) => (
      prev[nextTab.id]
        ? prev
        : { ...prev, [nextTab.id]: nextTaskState }
    ));

    applyInteractiveTaskState(nextTab.id, nextTaskState);
  }, [agentTasks, applyInteractiveTaskState, ideTabs, interactiveTaskStates, restoreSpecDoneScrollForTab, selectedTask]);

  const requestProblemHighlight = useCallback((rawIndex, tabIdOverride = null) => {
    if (!Number.isInteger(rawIndex) || rawIndex < 0) return;

    setHighlightedProblemLocation((prev) => ({
      rawIndex,
      tabId: tabIdOverride ?? activeEditorTabId,
      requestKey: (prev?.requestKey ?? 0) + 1,
    }));
  }, [activeEditorTabId]);

  useEffect(() => {
    if (!activeEditorTabId?.startsWith('agent-task-')) return;

    setInteractiveTaskStates((prev) => {
      const nextTaskState = {
        genState,
        genProgress,
        documentSections: generatedDocument,
        appliedIssueFixes,
        removedIssueIndices,
        acRunResult,
        planRunResult,
        commentEntries: agentTaskCommentEntries,
      };
      const previousTaskState = prev[activeEditorTabId];

      if (
        previousTaskState &&
        previousTaskState.genState === nextTaskState.genState &&
        previousTaskState.genProgress === nextTaskState.genProgress &&
        previousTaskState.documentSections === nextTaskState.documentSections &&
        previousTaskState.appliedIssueFixes === nextTaskState.appliedIssueFixes &&
        previousTaskState.removedIssueIndices === nextTaskState.removedIssueIndices &&
        previousTaskState.acRunResult === nextTaskState.acRunResult &&
        previousTaskState.planRunResult === nextTaskState.planRunResult &&
        previousTaskState.commentEntries === nextTaskState.commentEntries
      ) {
        return prev;
      }

      return {
        ...prev,
        [activeEditorTabId]: nextTaskState,
      };
    });
  }, [
    acRunResult,
    activeEditorTabId,
    agentTaskCommentEntries,
    appliedIssueFixes,
    genProgress,
    genState,
    generatedDocument,
    planRunResult,
    removedIssueIndices,
  ]);

  const openProblemsTreeNode = useCallback((nodeId) => {
    const openTabTarget = getProblemOpenTabTargetFromTreeNodeId(nodeId);
    if (openTabTarget) {
      const tabIndex = ideTabs.findIndex((tab) => tab?.id === openTabTarget.tabId);
      if (tabIndex >= 0) {
        setScreen('ide');
        setActiveEditorTab(tabIndex);
      }

      if (openTabTarget.rowId) {
        updatePlanDiffUiStateForTab({
          activeRowId: openTabTarget.rowId,
          commentRowId: null,
          commentValue: '',
          commentEditingIndex: null,
          caretState: {
            rowId: openTabTarget.rowId,
            left: 12,
          },
        }, openTabTarget.tabId);
      }

      if (Number.isInteger(openTabTarget.rawIndex)) {
        requestProblemHighlight(openTabTarget.rawIndex, openTabTarget.tabId);
      }
      return;
    }

    const rawIndex = getProblemRawIndexFromTreeNodeId(nodeId);
    if (!Number.isInteger(rawIndex)) return;

    requestProblemHighlight(rawIndex);
  }, [ideTabs, requestProblemHighlight, updatePlanDiffUiStateForTab]);

  const handleProblemsNodeSelect = useCallback((nodeId, selected) => {
    if (!selected) return;
    openProblemsTreeNode(nodeId);
  }, [openProblemsTreeNode]);

  const buildDoneCommentResolution = useCallback((commentEntriesOverride = null) => {
    const currentTabId = generationTabId ?? ideTabs[activeEditorTab ?? 0]?.id;
    const currentCode = currentTabId ? (ideTabContents[currentTabId]?.code ?? '') : '';

    return applyCommentCommandsToSpec({
      code: currentCode,
      documentSections: generatedDocument,
      commentEntries: commentEntriesOverride ?? agentTaskCommentEntries,
      appliedIssueFixes,
      removedIssueIndices,
    });
  }, [activeEditorTab, agentTaskCommentEntries, appliedIssueFixes, generatedDocument, generationTabId, ideTabContents, ideTabs, removedIssueIndices]);

  const applyDoneCommentResolution = useCallback((commentResolution) => {
    if (!commentResolution?.hasActionableComments) return false;

    const currentTabId = generationTabId ?? ideTabs[activeEditorTab ?? 0]?.id;
    const currentScenario = getCurrentAgentTaskScenario(currentTabId);
    const nextAcStatuses = acRunResult
      ? buildResolvedRunStatuses(
          currentScenario.acBaseStatuses,
          'ac',
          commentResolution.nextAppliedIssueFixes,
          commentResolution.nextRemovedIssueIndices,
        )
      : null;
    const nextPlanStatuses = planRunResult
      ? buildResolvedRunStatuses(
          currentScenario.planBaseStatuses,
          'plan',
          commentResolution.nextAppliedIssueFixes,
          commentResolution.nextRemovedIssueIndices,
        )
      : null;

    if (currentTabId) {
      setIdeTabContents((prev) => {
        const currentEntry = prev[currentTabId] ?? { language: 'markdown', code: '' };
        return {
          ...prev,
          [currentTabId]: {
            ...currentEntry,
            language: 'markdown',
            code: commentResolution.sourceCode,
          },
        };
      });
    }

    setGeneratedDocument(commentResolution.nextDocument);
    setAppliedIssueFixes(commentResolution.nextAppliedIssueFixes);
    setRemovedIssueIndices(commentResolution.nextRemovedIssueIndices);
    setAcRunResult(nextAcStatuses);
    setPlanRunResult(nextPlanStatuses);

    return true;
  }, [acRunResult, activeEditorTab, generationTabId, getCurrentAgentTaskScenario, ideTabs, planRunResult]);

  const buildPendingDoneSpecState = useCallback((options = {}) => {
    const {
      tabId: tabIdOverride = null,
      commentEntries: commentEntriesOverride = null,
      applyPendingComments = true,
    } = options ?? {};
    const sourceTabId = tabIdOverride ?? generationTabId ?? activeEditorTabId;
    if (!sourceTabId) return null;

    const runtimeState = getTaskRuntimeState(sourceTabId);
    const currentViewState = getCommentDrivenViewStateForTaskTab(sourceTabId);
    const currentCode =
      typeof ideTabContents[sourceTabId]?.code === 'string'
        ? ideTabContents[sourceTabId].code
        : (runtimeState?.baseCode ?? '');
    const displayCode = currentViewState?.code ?? currentCode;
    const baseDocumentSections =
      currentViewState?.documentSections
      ?? runtimeState?.taskState?.documentSections
      ?? runtimeState?.scenario?.defaultDocument
      ?? generatedDocument;
    const snapshotCode = buildDoneOverlaySnapshotCode(displayCode);
    const snapshotDocument = parseSpecCodeToDocumentSections(snapshotCode, baseDocumentSections);
    const normalizedCommentEntries = Array.isArray(commentEntriesOverride)
      ? commentEntriesOverride
      : (Array.isArray(agentTaskCommentEntries) ? agentTaskCommentEntries : []);
    const currentAppliedIssueFixes = cloneIssueStateMap(
      currentViewState?.appliedIssueFixes
      ?? runtimeState?.taskState?.appliedIssueFixes
      ?? appliedIssueFixes,
    );
    const currentRemovedIssueIndices = cloneIssueStateMap(
      currentViewState?.removedIssueIndices
      ?? runtimeState?.taskState?.removedIssueIndices
      ?? removedIssueIndices,
    );
    let targetCode = snapshotCode;
    let nextDocument = snapshotDocument;
    let nextPendingAppliedIssueFixes = cloneIssueStateMap(currentAppliedIssueFixes);
    let nextRemovedIssueIndices = cloneIssueStateMap(currentRemovedIssueIndices);
    let commentResolution = null;

    if (applyPendingComments && normalizedCommentEntries.length > 0) {
      commentResolution = applyCommentCommandsToSpec({
        code: snapshotCode,
        documentSections: snapshotDocument,
        commentEntries: normalizedCommentEntries,
        appliedIssueFixes: nextPendingAppliedIssueFixes,
        removedIssueIndices: nextRemovedIssueIndices,
      });
      targetCode = commentResolution.sourceCode;
      nextDocument = commentResolution.nextDocument;
      nextPendingAppliedIssueFixes = commentResolution.nextAppliedIssueFixes;
      nextRemovedIssueIndices = commentResolution.nextRemovedIssueIndices;
    }

    const currentAcRunResult =
      currentViewState?.acRunResult
      ?? runtimeState?.taskState?.acRunResult
      ?? acRunResult;
    const currentPlanRunResult =
      currentViewState?.planRunResult
      ?? runtimeState?.taskState?.planRunResult
      ?? planRunResult;
    // Status carry-over after Enhance follows the current draft edits only.
    // Comment-driven rewrites do not introduce new outdated items by themselves.
    const nextAcRunResult = Array.isArray(currentAcRunResult)
      ? remapRunStatusesForRemovedIssueIndices(
          'ac',
          currentAcRunResult,
          currentRemovedIssueIndices,
          nextRemovedIssueIndices,
        )
      : (currentAcRunResult ?? null);
    const nextPlanRunResult = Array.isArray(currentPlanRunResult)
      ? remapRunStatusesForRemovedIssueIndices(
          'plan',
          currentPlanRunResult,
          currentRemovedIssueIndices,
          nextRemovedIssueIndices,
        )
      : (currentPlanRunResult ?? null);
    const rerunAcOriginalIndices = collectRunRerunOriginalIndices({
      kind: 'ac',
      currentDocumentSections: baseDocumentSections,
      nextDocumentSections: snapshotDocument,
      currentStatuses: currentAcRunResult,
      nextStatuses: nextAcRunResult,
      currentRemovedIssueIndices,
      nextRemovedIssueIndices,
    });
    const rerunPlanOriginalIndices = collectRunRerunOriginalIndices({
      kind: 'plan',
      currentDocumentSections: baseDocumentSections,
      nextDocumentSections: snapshotDocument,
      currentStatuses: currentPlanRunResult,
      nextStatuses: nextPlanRunResult,
      currentRemovedIssueIndices,
      nextRemovedIssueIndices,
    });
    const hasPendingReruns = rerunAcOriginalIndices.length > 0 || rerunPlanOriginalIndices.length > 0;

    return {
      sourceTabId,
      currentCode,
      snapshotCode,
      targetCode,
      pendingCommentEntriesSnapshot: normalizeSpecVersionCommentEntries(normalizedCommentEntries),
      nextDocument,
      nextAppliedIssueFixes: cloneIssueStateMap(nextPendingAppliedIssueFixes),
      nextRemovedIssueIndices,
      nextAcRunResult,
      nextPlanRunResult,
      currentAcRunResult,
      currentPlanRunResult,
      currentRemovedIssueIndices,
      rerunAcOriginalIndices,
      rerunPlanOriginalIndices,
      hasPendingReruns,
      commentResolution,
      hasPendingComments: applyPendingComments && normalizedCommentEntries.length > 0,
      hasSpecChanges:
        normalizeSpecCodeForComparison(targetCode) !== normalizeSpecCodeForComparison(currentCode),
    };
  }, [
    acRunResult,
    activeEditorTabId,
    agentTaskCommentEntries,
    appliedIssueFixes,
    generatedDocument,
    generationTabId,
    getCommentDrivenViewStateForTaskTab,
    getTaskRuntimeState,
    ideTabContents,
    planRunResult,
    removedIssueIndices,
  ]);

  const openPlanDiffTab = useCallback(({ text, statusItem, issueTarget, source = null, navigation = null, initialDiffCommentsOverride = null, commentsReadOnly = false, contextMessageId = null, contextChatId = null }) => {
    const sourceTab = source?.tabId
      ? (ideTabs.find((tab) => tab.id === source.tabId) ?? null)
      : (ideTabs[activeEditorTab ?? 0] ?? null);
    const sourceTabId = source?.tabId ?? sourceTab?.id ?? null;
    const sourceTabLabel = source?.label ?? sourceTab?.label ?? null;
    if (!sourceTabId || !sourceTabLabel) return;

    if (sourceTabId === activeSourceEditorTabId || sourceTabId === activeEditorTabId) {
      const scrollSnapshot = captureSpecDoneScrollSnapshot();
      if (scrollSnapshot) {
        specDoneScrollSnapshotsRef.current[sourceTabId] = scrollSnapshot;
      }
    }

    const diffTarget = normalizeCommentTarget(issueTarget);
    const sourceViewState = getCommentDrivenViewStateForTaskTab(sourceTabId);
    const sourceCode = typeof source?.code === 'string'
      ? source.code
      : (sourceViewState?.code ?? ideTabContents[sourceTabId]?.code ?? '');
    const diffTabId = buildPlanDiffTabId(sourceTabId);
    const diffData = buildPlanDiffData({
      sourceCode,
      text,
      statusItem,
      issueTarget,
      sourceTabLabel,
    });
    const diffCode = buildPlanDiffTabContent({
      sourceCode,
      text,
      statusItem,
      issueTarget,
      sourceTabLabel,
    });
    const diffTabLabel = diffData.title || `Diff ${diffData.sourceTabLabel || sourceTabLabel}`;
    const currentTaskCommentEntries = getCommentEntriesForTaskTab(sourceTabId);
    const initialDiffComments = initialDiffCommentsOverride && Object.keys(initialDiffCommentsOverride).length > 0
      ? normalizeStoredDiffCommentsState(initialDiffCommentsOverride)
      : buildPlanDiffInitialComments(
          currentTaskCommentEntries,
          diffData,
          diffTarget,
        );

    const sourceTabIndex = ideTabs.findIndex((tab) => tab.id === sourceTabId);
    const existingDiffTabIndex = ideTabs.findIndex((tab) => tab.id === diffTabId);
    const insertIndex = sourceTabIndex >= 0
      ? sourceTabIndex + 1
      : Math.min(Math.max(activeEditorTab ?? 0, 0) + 1, ideTabs.length);
    const nextActiveTabIndex = existingDiffTabIndex >= 0 ? existingDiffTabIndex : insertIndex;
    const diffTab = {
      id: diffTabId,
      label: diffTabLabel,
      icon: DIFF_TAB_ICON_NAME,
      closable: true,
      sourceTabId,
    };

    setIdeTabs(existingDiffTabIndex >= 0
      ? ideTabs.map((tab, index) => (index === existingDiffTabIndex ? diffTab : tab))
      : [
          ...ideTabs.slice(0, insertIndex),
          diffTab,
          ...ideTabs.slice(insertIndex),
        ]);
    setIdeTabContents((prev) => {
      const existingDiffTabContent = prev[diffTabId] ?? {};
      const previousSessionComments = normalizeDiffSessionCommentsByChatId(existingDiffTabContent.diffSessionCommentsByChatId);
      const sessionChatId = contextChatId ?? selectedAiChatId;
      const scenario = getAiChatScenarioById(sessionChatId);
      const listItem = getAiChatListItemById(sessionChatId);
      const shouldSeedSessionComments = Boolean(contextChatId);
      const nextSessionComments = shouldSeedSessionComments && Object.keys(initialDiffComments).length > 0
        ? {
            ...previousSessionComments,
            [sessionChatId]: {
              chatId: sessionChatId,
              messageId: contextMessageId ?? scenario?.messageId ?? `chat-${sessionChatId}`,
              title: scenario?.title ?? sessionChatId,
              icon: listItem?.icon ?? 'claude',
              comments: initialDiffComments,
            },
          }
        : previousSessionComments;

      return {
        ...prev,
        [diffTabId]: {
          ...existingDiffTabContent,
          language: diffData.language || 'text',
          code: diffCode,
          diffData,
          diffSourceTabId: sourceTabId,
          diffTarget,
          diffLineText: text,
          initialDiffComments: commentsReadOnly ? {} : initialDiffComments,
          diffCommentsReadOnly: Boolean(commentsReadOnly),
          diffContextMessageId: contextMessageId,
          diffContextChatId: contextChatId,
          diffSessionCommentsByChatId: nextSessionComments,
        },
      };
    });
    if (navigation?.activeRowId) {
      updatePlanDiffUiStateForTab(
        {
          activeRowId: navigation.activeRowId,
          commentRowId: null,
          commentValue: '',
          commentEditingIndex: null,
          caretState: {
            rowId: navigation.activeRowId,
            left: 12,
          },
        },
        diffTabId,
      );
    }
    const resolvedTaskId = source?.taskId
      ?? getAgentTaskIdForEditorTab({ id: sourceTabId, label: sourceTabLabel }, agentTasks);
    if (resolvedTaskId) {
      setSelectedTask(resolvedTaskId);
      if (issueTarget?.kind === 'plan' && Number.isInteger(issueTarget.index)) {
        setAgentTasksFocusedNodeId(`agent-task-tree-file:${resolvedTaskId}:${issueTarget.index}:0`);
      }
      setIdeOpenWindows((prev) => (
        prev.includes(CHATS_HISTORY_TOOL_WINDOW_ID) ? prev : [...prev, CHATS_HISTORY_TOOL_WINDOW_ID]
      ));
    }
    setScreen('ide');
    setActiveEditorTab(nextActiveTabIndex);
  }, [
    activeEditorTab,
    activeEditorTabId,
    activeSourceEditorTabId,
    agentTasks,
	    getCommentDrivenViewStateForTaskTab,
	    getCommentEntriesForTaskTab,
	    getAiChatListItemById,
	    getAiChatScenarioById,
	    ideTabContents,
    ideTabs,
    selectedAiChatId,
    updatePlanDiffUiStateForTab,
  ]);

  const openEditorTabByLabel = useCallback((label) => {
    if (typeof label !== 'string' || label.trim().length === 0) return;

    const normalizedLabel = label.trim();
    const existingTabIndex = ideTabs.findIndex((tab) => tab.label === normalizedLabel);
    if (existingTabIndex >= 0) {
      setScreen('ide');
      setActiveEditorTab(existingTabIndex);
      return;
    }

    const presetTab = MY_EDITOR_TABS.find((tab) => tab.label === normalizedLabel);
    const tabContent = getEditorTabContentByLabel(normalizedLabel);
    if (!presetTab || !tabContent) return;

    setIdeTabs((prev) => [...prev, presetTab]);
    setIdeTabContents((prev) => ({
      ...prev,
      [presetTab.id]: tabContent,
    }));
    setScreen('ide');
    setActiveEditorTab(ideTabs.length);
  }, [ideTabs]);

  const openSpecVersionDiffTab = useCallback(({
    sourceTabId,
    fromVersion,
    toVersion,
  }) => {
    if (!sourceTabId || !fromVersion?.id || !toVersion?.id || fromVersion.id === toVersion.id) {
      return;
    }

    const sourceTab = ideTabs.find((tab) => tab.id === sourceTabId) ?? null;
    const sourceTabIndex = Math.max(ideTabs.findIndex((tab) => tab.id === sourceTabId), 0);
    const diffTabId = buildSpecVersionDiffTabId(sourceTabId, fromVersion.id, toVersion.id);
  const diffData = buildSpecVersionDiffData({
      sourceCode: fromVersion.code,
      targetCode: toVersion.code,
      sourceTabLabel: sourceTab?.label ?? TERMINAL_TASK_TAB_BASE_LABEL,
      fromVersion,
      toVersion,
    });
    const diffCode = buildDiffTabContentFromRows(diffData);
    const initialDiffComments = buildSpecVersionDiffInitialComments({
      diffData,
      fromVersion,
      toVersion,
    });
    const existingDiffTabIndex = ideTabs.findIndex((tab) => tab.id === diffTabId);
    const nextActiveTabIndex = existingDiffTabIndex >= 0 ? existingDiffTabIndex : sourceTabIndex + 1;
    const diffTab = {
      id: diffTabId,
      label: diffData.title,
      icon: DIFF_TAB_ICON_NAME,
      closable: true,
      sourceTabId,
    };

    setIdeTabs(existingDiffTabIndex >= 0
      ? ideTabs.map((tab, index) => (index === existingDiffTabIndex ? diffTab : tab))
      : [
          ...ideTabs.slice(0, sourceTabIndex + 1),
          diffTab,
          ...ideTabs.slice(sourceTabIndex + 1),
        ]);
    setIdeTabContents((prev) => ({
      ...prev,
      [diffTabId]: {
        language: diffData.language || 'text',
        code: diffCode,
        diffData,
        diffSourceTabId: sourceTabId,
        diffTarget: null,
        diffLineText: diffData.lineText,
        initialDiffComments,
      },
    }));
    setActiveEditorTab(nextActiveTabIndex);
  }, [ideTabs]);

  const revealRunStatuses = useCallback((kind, statuses, options = {}) => {
    const {
      initialResult = [],
      startIndex = 0,
      initialDelay = 0,
      indices = null,
      pausePredicate = null,
      onPause,
      onComplete,
    } = options;
    const setResult = kind === 'ac' ? setAcRunResult : setPlanRunResult;
    clearStatusReveal(kind);

    if (!statuses?.length) {
      setResult(null);
      onComplete?.([]);
      return;
    }

    const seedResult = Array.isArray(initialResult) ? [...initialResult] : [];
    let latestResult = seedResult;
    setResult(seedResult);

    const revealIndices = Array.isArray(indices)
      ? indices.filter((index) => Number.isInteger(index) && index >= 0 && index < statuses.length)
      : null;

    if (revealIndices && revealIndices.length === 0) {
      onComplete?.(latestResult);
      return;
    }

    if (revealIndices) {
      const scheduleIndexedStep = (listIndex, delay) => {
        const statusIndex = revealIndices[listIndex];
        const timeoutId = window.setTimeout(() => {
          latestResult = ((prev) => {
            const next = Array.isArray(prev) ? [...prev] : [...latestResult];
            next[statusIndex] = statuses[statusIndex];
            return next;
          })(latestResult);
          setResult(latestResult);
          statusRevealTimeoutsRef.current[kind] = statusRevealTimeoutsRef.current[kind].filter((id) => id !== timeoutId);

          if (pausePredicate?.(statuses[statusIndex], statusIndex, latestResult)) {
            onPause?.(latestResult, statusIndex);
            return;
          }

          if (listIndex >= revealIndices.length - 1) {
            onComplete?.(latestResult);
            return;
          }

          scheduleIndexedStep(listIndex + 1, RUN_STATUS_REVEAL_STEP_DELAY_MS);
        }, delay);

        statusRevealTimeoutsRef.current[kind].push(timeoutId);
      };

      scheduleIndexedStep(0, initialDelay);
      return;
    }

    if (startIndex >= statuses.length) {
      onComplete?.(latestResult);
      return;
    }

    const scheduleStep = (idx, delay) => {
      const timeoutId = window.setTimeout(() => {
        latestResult = ((prev) => {
          const next = Array.isArray(prev) ? [...prev] : [...latestResult];
          next[idx] = statuses[idx];
          return next;
        })(latestResult);
        setResult(latestResult);
        statusRevealTimeoutsRef.current[kind] = statusRevealTimeoutsRef.current[kind].filter((id) => id !== timeoutId);

        if (pausePredicate?.(statuses[idx], idx, latestResult)) {
          onPause?.(latestResult, idx);
          return;
        }

        if (idx >= statuses.length - 1) {
          onComplete?.(latestResult);
          return;
        }

        scheduleStep(idx + 1, RUN_STATUS_REVEAL_STEP_DELAY_MS);
      }, delay);

      statusRevealTimeoutsRef.current[kind].push(timeoutId);
    };

    scheduleStep(startIndex, initialDelay);
  }, [clearStatusReveal]);

  const startDoneEnhanceStatusReveal = useCallback((nextPlanStatuses = null, nextAcStatuses = null, options = {}) => {
    const {
      currentPlanStatuses = null,
      currentAcStatuses = null,
      currentRemovedIssueIndices = null,
      nextRemovedIssueIndices = null,
      rerunPlanOriginalIndices = [],
      rerunAcOriginalIndices = [],
      allowPendingOutdated = true,
    } = options ?? {};
    clearChainedRunTimeout();
    clearStatusReveal('plan');
    clearStatusReveal('ac');

    const applySelectiveStatuses = ({
      kind,
      nextStatuses,
      currentStatuses,
      rerunOriginalIndices,
      onComplete = null,
    }) => {
      const setResult = kind === 'ac' ? setAcRunResult : setPlanRunResult;
      if (!Array.isArray(nextStatuses)) {
        setResult(nextStatuses);
        onComplete?.(nextStatuses);
        return;
      }

      const initialResult = buildRunStatusesRevealSeed({
        kind,
        currentStatuses,
        nextStatuses,
        currentRemovedIssueIndices,
        nextRemovedIssueIndices,
        rerunOriginalIndices,
        allowPendingOutdated,
      });

      setResult(initialResult);
      onComplete?.(initialResult);
    };

    const revealAcceptanceCriteria = () => {
      applySelectiveStatuses({
        kind: 'ac',
        nextStatuses: nextAcStatuses,
        currentStatuses: currentAcStatuses,
        rerunOriginalIndices: rerunAcOriginalIndices,
      });
    };

    if (Array.isArray(nextPlanStatuses) && nextPlanStatuses.length > 0) {
      applySelectiveStatuses({
        kind: 'plan',
        nextStatuses: nextPlanStatuses,
        currentStatuses: currentPlanStatuses,
        rerunOriginalIndices: rerunPlanOriginalIndices,
        onComplete: () => {
          if (Array.isArray(nextAcStatuses) && nextAcStatuses.length > 0) {
            clearChainedRunTimeout();
            chainedRunTimeoutRef.current = window.setTimeout(() => {
              chainedRunTimeoutRef.current = null;
              revealAcceptanceCriteria();
            }, CHAINED_SECTION_START_DELAY_MS);
            return;
          }

          setAcRunResult(nextAcStatuses);
        },
      });
      return;
    }

    applySelectiveStatuses({
      kind: 'plan',
      nextStatuses: nextPlanStatuses,
      currentStatuses: currentPlanStatuses,
      rerunOriginalIndices: rerunPlanOriginalIndices,
    });
    revealAcceptanceCriteria();
  }, [clearChainedRunTimeout, clearStatusReveal]);

  const finishTerminalRun = useCallback((options = {}) => {
    const { advanceGeneration = false, cancelGeneration = false } = options;
    const currentScenario = getCurrentAgentTaskScenario();
    const lastRunRequest = lastTerminalRunRequestRef.current;
    const runCompleteOpts = { runComplete: true };
    const nextAcRunStatuses = buildResolvedRunStatuses(
      currentScenario.acBaseStatuses,
      'ac',
      appliedIssueFixes,
      removedIssueIndices,
      runCompleteOpts,
    );
    const nextPlanRunStatuses = buildResolvedRunStatuses(
      currentScenario.planBaseStatuses,
      'plan',
      appliedIssueFixes,
      removedIssueIndices,
      runCompleteOpts,
    );
    setTerminalStreamingForTab(false);
    setRunStateForTab('default', currentRunSourceTabIdRef.current);
    currentRunSourceTabIdRef.current = null;
    terminalDrivenGenerationRef.current = false;
    if (advanceGeneration && AGENT_TASK_GENERATING_STATE_ENABLED) {
      setGenState('generating');
      return;
    }
    const section = (lastRunSectionRef.current || '').toLowerCase();
    if (section === 'acceptance criteria') {
      const acRevealOptions = buildSelectiveRunRevealOptions({
        kind: 'ac',
        runRequest: lastRunRequest,
        currentStatuses: acRunResult,
        removedIssueIndices,
      });
      // Clear applied AC fixes — run result is now authoritative
      setAppliedIssueFixes((prev) => ({ ...prev, ac: {} }));
      revealRunStatuses('ac', nextAcRunStatuses, {
        initialResult: acRevealOptions.initialResult,
        ...(acRevealOptions.hasSelectiveRerun
          ? { indices: acRevealOptions.indices }
          : {}),
      });
    } else if (section === 'plan') {
      const planRevealOptions = buildSelectiveRunRevealOptions({
        kind: 'plan',
        runRequest: lastRunRequest,
        currentStatuses: planRunResult,
        removedIssueIndices,
      });
      // Clear applied plan fixes — run result is now authoritative
      setAppliedIssueFixes((prev) => ({ ...prev, plan: {} }));
      revealRunStatuses('plan', nextPlanRunStatuses, {
        initialResult: planRevealOptions.initialResult,
        ...(planRevealOptions.hasSelectiveRerun
          ? { indices: planRevealOptions.indices }
          : {}),
      });
      if (!cancelGeneration && lastRunRequest?.mode === 'section') {
        clearChainedRunTimeout();
        const revealSteps = planRevealOptions.hasSelectiveRerun
          ? planRevealOptions.indices.length
          : nextPlanRunStatuses.length;
        const revealDuration = RUN_STATUS_REVEAL_STEP_DELAY_MS * Math.max(revealSteps - 1, 0);
        chainedRunTimeoutRef.current = window.setTimeout(() => {
          chainedRunTimeoutRef.current = null;
          queueTerminalRunRef.current?.({
            ...lastRunRequest,
            sectionTitle: 'Acceptance Criteria',
          }, {
            preserveAcRunResult: true,
            preservePlanRunResult: true,
          });
        }, revealDuration + CHAINED_SECTION_START_DELAY_MS);
        return;
      }
    }
    if (cancelGeneration) {
      clearChainedRunTimeout();
      clearAcWarningFlow();
      setGenerationTabId(null);
      setGenState('idle');
    }
  }, [
    appliedIssueFixes,
    clearAcWarningFlow,
    clearChainedRunTimeout,
    getCurrentAgentTaskScenario,
    removedIssueIndices,
    revealRunStatuses,
    acRunResult,
    planRunResult,
    setAppliedIssueFixes,
    setRunStateForTab,
    setTerminalStreamingForTab,
  ]);

  const resetTerminalOutput = useCallback(() => {
    clearTerminalRunAnimation();
    setTerminalBlocksForTab([]);
    setTerminalPermissionPromptForTab(null);
    bumpTerminalViewKeyForTab();
  }, [
    bumpTerminalViewKeyForTab,
    clearTerminalRunAnimation,
    setTerminalBlocksForTab,
    setTerminalPermissionPromptForTab,
  ]);

  const handleEditorTabClose = useCallback((indexToClose) => {
    if (!Number.isInteger(indexToClose) || indexToClose < 0 || indexToClose >= ideTabs.length) {
      return;
    }

    const closingTab = ideTabs[indexToClose];
    const resolvedActiveTab = Number.isInteger(activeEditorTab) ? activeEditorTab : 0;
    const wasClosingActiveTab = resolvedActiveTab === indexToClose;
    const nextTabs = ideTabs.filter((_, index) => index !== indexToClose);
    const nextActiveTabIndex = (() => {
      if (nextTabs.length === 0) {
        return null;
      }
      if (resolvedActiveTab === indexToClose) {
        return Math.min(indexToClose, nextTabs.length - 1);
      }
      if (resolvedActiveTab > indexToClose) {
        return resolvedActiveTab - 1;
      }
      return Math.min(resolvedActiveTab, nextTabs.length - 1);
    })();
    const nextActiveTab = nextActiveTabIndex === null ? null : (nextTabs[nextActiveTabIndex] ?? null);
    const nextInteractiveTaskState = nextActiveTab?.id?.startsWith('agent-task-')
      ? (interactiveTaskStates[nextActiveTab.id] ?? getAgentTaskScenario({
          tabId: nextActiveTab.id,
          label: nextActiveTab.label,
        }).initialTaskState)
      : null;

    setIdeTabs(nextTabs);
    setActiveEditorTab(nextActiveTabIndex);
    setIdeTabContents((prev) => {
      if (!closingTab?.id || !(closingTab.id in prev)) {
        return prev;
      }

      const { [closingTab.id]: _removedContent, ...rest } = prev;
      return rest;
    });
    setInteractiveTaskStates((prev) => {
      if (!closingTab?.id || !(closingTab.id in prev)) {
        return prev;
      }

      const { [closingTab.id]: _removedTaskState, ...rest } = prev;
      return rest;
    });
    setAttachedFilesByTab((prev) => removeTabStateEntry(prev, closingTab?.id));
    setDoneOverlayUiStates((prev) => removeTabStateEntry(prev, closingTab?.id));
    setSpecVersionsByTab((prev) => removeTabStateEntry(prev, closingTab?.id));
    setPlanDiffUiStates((prev) => removeTabStateEntry(prev, closingTab?.id));
    setRunStatesByTab((prev) => removeTabStateEntry(prev, closingTab?.id));

    if (highlightedProblemLocation?.tabId === closingTab.id) {
      setHighlightedProblemLocation(null);
    }

    if (wasClosingActiveTab && nextInteractiveTaskState && nextActiveTab) {
      const matchingTask = agentTasks.find((task) => task.label === nextActiveTab.label || task.id === nextActiveTab.id);

      if (closingTab.id === generationTabId || closingTab.id?.startsWith('agent-task-')) {
        clearAgentTaskRuntime();
      }

      if (matchingTask && matchingTask.id !== selectedTask) {
        setSelectedTask(matchingTask.id);
      }

      applyInteractiveTaskState(nextActiveTab.id, nextInteractiveTaskState);
      return;
    }

    if (closingTab.id === generationTabId || (wasClosingActiveTab && closingTab.id?.startsWith('agent-task-'))) {
      clearAgentTaskRuntime();
    }
  }, [
    activeEditorTab,
    agentTasks,
    applyInteractiveTaskState,
    clearAgentTaskRuntime,
    generationTabId,
    highlightedProblemLocation,
    ideTabs,
    interactiveTaskStates,
    selectedTask,
    setRunStateForTab,
  ]);

  const runTerminalLineAnimation = useCallback((lines, options = {}) => {
    const { baseLines = [], onComplete } = options;
    const frames = buildTerminalFrames(lines, baseLines);
    if (frames.length === 0) {
      onComplete?.();
      return;
    }

    setTerminalStreamingForTab(true);

    frames.forEach((frame, idx) => {
      const timeoutId = window.setTimeout(() => {
        setTerminalBlocksForTab(frame);
      }, TERMINAL_RUN_INITIAL_DELAY_MS + TERMINAL_RUN_STEP_DELAY_MS * idx);
      terminalRunTimeoutsRef.current.push(timeoutId);
    });

    const finalTimeoutId = window.setTimeout(() => {
      setTerminalStreamingForTab(false);
      onComplete?.();
    }, TERMINAL_RUN_INITIAL_DELAY_MS + TERMINAL_RUN_STEP_DELAY_MS * frames.length + TERMINAL_RUN_END_DELAY_MS);
    terminalRunTimeoutsRef.current.push(finalTimeoutId);
  }, [setTerminalBlocksForTab, setTerminalStreamingForTab]);

  const continueAcceptanceCriteriaRun = useCallback((choiceId) => {
    const flow = acWarningFlowRef.current;
    const currentScenario = getCurrentAgentTaskScenario();
    const nextAcRunStatuses = buildResolvedRunStatuses(
      currentScenario.acBaseStatuses,
      'ac',
      appliedIssueFixes,
      removedIssueIndices,
    );
    const selectedOption = TERMINAL_PERMISSION_OPTIONS.find((option) => option.id === choiceId) ?? null;
    if (!flow || !selectedOption) return;

    const committedLines = [
      ...flow.baseLines,
      { type: 'output', text: AC_WARNING_PROMPT },
      { type: 'output', text: `> ${selectedOption.label}` },
    ];
    const continuationLines = buildAcceptanceCriteriaContinuationLines(choiceId);

    clearTerminalRunAnimation();
    clearAcWarningFlow();
    setTerminalBlocksForTab(buildTerminalBlocks(committedLines));

    if (choiceId === 'allow-session') {
      setAcWarningPermissionScope('session');
    } else if (choiceId === 'reject') {
      setAcWarningPermissionScope(null);
    }

    if (choiceId !== 'reject') {
      const remainingRevealIndices = Array.isArray(flow.revealIndices)
        ? flow.revealIndices.filter((visibleIndex) => visibleIndex > (flow.nextStatusIndex - 1))
        : null;
      revealRunStatuses('ac', nextAcRunStatuses, Array.isArray(remainingRevealIndices)
        ? {
            initialResult: flow.revealedStatuses,
            indices: remainingRevealIndices,
            initialDelay: RUN_STATUS_REVEAL_STEP_DELAY_MS,
          }
        : {
            initialResult: flow.revealedStatuses,
            startIndex: flow.nextStatusIndex,
            initialDelay: RUN_STATUS_REVEAL_STEP_DELAY_MS,
          });
    }

    if (continuationLines.length === 0) {
      setRunStateForTab('default', currentRunSourceTabIdRef.current);
      currentRunSourceTabIdRef.current = null;
      return;
    }

    runTerminalLineAnimation(continuationLines, {
      baseLines: committedLines,
      onComplete: () => {
        setRunStateForTab('default', currentRunSourceTabIdRef.current);
        currentRunSourceTabIdRef.current = null;
      },
    });
  }, [
    appliedIssueFixes,
    clearAcWarningFlow,
    clearTerminalRunAnimation,
    getCurrentAgentTaskScenario,
    removedIssueIndices,
    revealRunStatuses,
    runTerminalLineAnimation,
    setRunStateForTab,
    setTerminalBlocksForTab,
  ]);

  const startAcceptanceCriteriaRunAnimation = useCallback((runRequest) => {
    resetTerminalOutput();
    clearAcWarningFlow();

    const introLines = buildAcceptanceCriteriaIntroLines(runRequest);
    const currentScenario = getCurrentAgentTaskScenario();
    const nextAcRunStatuses = buildResolvedRunStatuses(
      currentScenario.acBaseStatuses,
      'ac',
      appliedIssueFixes,
      removedIssueIndices,
      { runComplete: true },
    );
    const acRevealOptions = buildSelectiveRunRevealOptions({
      kind: 'ac',
      runRequest,
      currentStatuses: acRunResult,
      removedIssueIndices,
    });
    const warningStatusIndex = mapOriginalIssueIndexToVisible(
      'ac',
      AC_WARNING_TARGET_ORIGINAL_INDEX,
      removedIssueIndices,
    );
    const hasPausableWarning =
      Number.isInteger(warningStatusIndex)
      && warningStatusIndex >= 0
      && nextAcRunStatuses[warningStatusIndex]?.status === 'warning';
    const shouldPauseOnWarning = acWarningPermissionScope !== 'session'
      && (
        acRevealOptions.hasSelectiveRerun
          ? hasPausableWarning && acRevealOptions.indices.includes(warningStatusIndex)
          : hasPausableWarning
      );

    runTerminalLineAnimation(introLines, {
      onComplete: () => {
        if (!shouldPauseOnWarning) {
          // Clear applied AC fixes — run result is now authoritative
          setAppliedIssueFixes((prev) => ({ ...prev, ac: {} }));
          revealRunStatuses('ac', nextAcRunStatuses, {
            initialResult: acRevealOptions.initialResult,
            ...(acRevealOptions.hasSelectiveRerun
              ? { indices: acRevealOptions.indices }
              : {}),
          });
          runTerminalLineAnimation(buildAcceptanceCriteriaContinuationLines('allow-session'), {
            baseLines: introLines,
            onComplete: () => {
              setRunStateForTab('default', currentRunSourceTabIdRef.current);
              currentRunSourceTabIdRef.current = null;
            },
          });
          return;
        }

        // Clear applied AC fixes — run result is now authoritative
        setAppliedIssueFixes((prev) => ({ ...prev, ac: {} }));
        revealRunStatuses('ac', nextAcRunStatuses, {
          initialResult: acRevealOptions.initialResult,
          ...(acRevealOptions.hasSelectiveRerun
            ? {
                indices: acRevealOptions.indices,
              }
            : {}),
          pausePredicate: (_, idx) => hasPausableWarning && idx === warningStatusIndex,
          onPause: (revealedStatuses, idx) => {
            acWarningFlowRef.current = {
              baseLines: introLines,
              revealedStatuses,
              nextStatusIndex: idx + 1,
              revealIndices: acRevealOptions.hasSelectiveRerun ? acRevealOptions.indices : null,
            };
            setAcWarningBannerForTab({
              question: AC_WARNING_PROMPT,
            });
          },
        });
      },
    });
  }, [
    appliedIssueFixes,
    acWarningPermissionScope,
    acRunResult,
    clearAcWarningFlow,
    getCurrentAgentTaskScenario,
    resetTerminalOutput,
    removedIssueIndices,
    revealRunStatuses,
    runTerminalLineAnimation,
    setRunStateForTab,
    setAcWarningBannerForTab,
  ]);

  const startTerminalRunAnimation = useCallback((runRequest) => {
    const resolvedSectionTitle = (runRequest?.sectionTitle || '').toLowerCase();
    if (runRequest?.mode === 'section' && resolvedSectionTitle === 'acceptance criteria') {
      startAcceptanceCriteriaRunAnimation(runRequest);
      return;
    }

    resetTerminalOutput();

    const effectiveRunRequest =
      runRequest?.mode === 'generate' && terminalPermissionScope === 'session'
        ? { ...runRequest, permissionChoice: 'allow-session' }
        : runRequest;
    const runSequence = buildTerminalRunSequence(effectiveRunRequest);
    const { initialLines, permissionPrompt } = runSequence;

    if (initialLines.length === 0) {
      finishTerminalRun();
      return;
    }

    runTerminalLineAnimation(initialLines, {
      onComplete: () => {
        if (permissionPrompt) {
          setTerminalBlocksForTab(buildTerminalBlocks(initialLines));
          setTerminalPermissionPromptForTab({
            ...permissionPrompt,
            baseLines: initialLines,
            selectedIdx: 0,
          });
          return;
        }

        finishTerminalRun({
          advanceGeneration: effectiveRunRequest?.mode === 'generate',
        });
      },
    });
  }, [
    finishTerminalRun,
    resetTerminalOutput,
    runTerminalLineAnimation,
    setTerminalBlocksForTab,
    setTerminalPermissionPromptForTab,
    startAcceptanceCriteriaRunAnimation,
    terminalPermissionScope,
  ]);

  const setActiveIdeBottomToolWindow = (id) => {
    setIdeOpenWindows((prev) => {
      const nonBottomWindows = prev.filter((windowId) => !BOTTOM_TOOL_WINDOW_IDS.has(windowId));
      return id ? [...nonBottomWindows, id] : nonBottomWindows;
    });
  };

  const findIdeBottomToolWindowButton = (id) => {
    const title = BOTTOM_TOOL_WINDOW_TITLES[id];
    if (!title || typeof document === 'undefined') return null;
    const button = document.querySelector(`.main-window .stripe[title="${title}"]`);
    return button instanceof HTMLElement ? button : null;
  };

  const isIdeBottomToolWindowVisible = (id) => {
    if (typeof document === 'undefined') return false;

    if (id === 'terminal') {
      const terminalPanel = document.querySelector('.main-window .terminal-window');
      return terminalPanel instanceof HTMLElement && terminalPanel.getClientRects().length > 0;
    }

    return false;
  };

  const openIdeBottomToolWindow = (id) => {
    const stripe = findIdeBottomToolWindowButton(id);
    const alreadyOpen =
      ideOpenWindows.includes(id) ||
      stripe?.getAttribute('aria-pressed') === 'true' ||
      isIdeBottomToolWindowVisible(id);

    if (alreadyOpen) {
      setActiveIdeBottomToolWindow(id);
      return;
    }

    setActiveIdeBottomToolWindow(id);
    if (stripe) {
      stripe.click();
    }
  };

  const toggleIdeBottomToolWindow = (id) => {
    const stripe = findIdeBottomToolWindowButton(id);
    if (stripe) {
      const isSelected = stripe.getAttribute('aria-pressed') === 'true';
      setActiveIdeBottomToolWindow(isSelected ? null : id);
      stripe.click();
      return;
    }
    setIdeOpenWindows((prev) => {
      const nonBottomWindows = prev.filter((windowId) => !BOTTOM_TOOL_WINDOW_IDS.has(windowId));
      return prev.includes(id) ? nonBottomWindows : [...nonBottomWindows, id];
    });
  };

  const queueTerminalRun = (runRequest, options = {}) => {
    const {
      preserveAcRunResult = false,
      preservePlanRunResult = false,
      preserveWarningBanner = false,
    } = options;
    const resolvedRunRequest =
      runRequest?.mode === 'section' && !runRequest?.sectionTitle
        ? { ...runRequest, sectionTitle: 'Plan' }
        : runRequest;
    const previousTerminalTabId = currentTerminalRunTabIdRef.current;
    const sessionMeta = resolveTerminalSessionMeta(resolvedRunRequest);
    const nextTerminalTabId = ensureTerminalSession(sessionMeta);
    const nextRunRequest = {
      ...resolvedRunRequest,
      sourceTabId: sessionMeta.sourceTabId ?? resolvedRunRequest?.sourceTabId ?? null,
      taskLabel: sessionMeta.label,
    };
    const isTerminalAlreadyOpen = ideOpenWindows.includes('terminal');
    clearChainedRunTimeout();
    lastRunSectionRef.current = nextRunRequest?.sectionTitle || null;
    lastTerminalRunRequestRef.current = nextRunRequest;
    if (!preserveWarningBanner) {
      clearAcWarningFlow();
    }
    currentRunSourceTabIdRef.current = sessionMeta.sourceTabId ?? activeSourceEditorTabId ?? activeEditorTabId;
    setRunStateForTab('running', currentRunSourceTabIdRef.current);
    clearTerminalRunAnimation();
    setPendingTerminalRunForTab(null, previousTerminalTabId);
    setTerminalPermissionPromptForTab(null, previousTerminalTabId);
    currentTerminalRunTabIdRef.current = nextTerminalTabId;
    setTerminalBlocksForTab([], nextTerminalTabId);
    setTerminalPermissionPromptForTab(null, nextTerminalTabId);
    if (!preserveAcRunResult) {
      clearStatusReveal('ac');
      setAcRunResult(null);
    }
    if (!preservePlanRunResult) {
      clearStatusReveal('plan');
      setPlanRunResult(null);
    }
    if (!isTerminalAlreadyOpen) {
      bumpTerminalViewKeyForTab(nextTerminalTabId);
    }
    setPendingTerminalRunForTab(nextRunRequest, nextTerminalTabId);
    openIdeBottomToolWindow('terminal');
  };
  queueTerminalRunRef.current = queueTerminalRun;

  const moveTerminalPermissionSelection = useCallback((delta) => {
    setTerminalPermissionPromptForTab((prev) => {
      if (!prev || prev.options.length === 0) return prev;
      const nextIdx = (prev.selectedIdx + delta + prev.options.length) % prev.options.length;
      return { ...prev, selectedIdx: nextIdx };
    });
  }, [setTerminalPermissionPromptForTab]);

  const hoverTerminalPermissionSelection = useCallback((idx) => {
    setTerminalPermissionPromptForTab((prev) => {
      if (!prev || idx < 0 || idx >= prev.options.length) return prev;
      return { ...prev, selectedIdx: idx };
    });
  }, [setTerminalPermissionPromptForTab]);

  const handleTerminalPermissionSelect = useCallback((choiceId) => {
    if (!terminalPermissionPrompt) return;

    const selectedOption =
      terminalPermissionPrompt.options.find((option) => option.id === choiceId) ??
      terminalPermissionPrompt.options[terminalPermissionPrompt.selectedIdx] ??
      null;

    if (!selectedOption) return;

    const committedLines = [
      ...terminalPermissionPrompt.baseLines,
      { type: 'output', text: terminalPermissionPrompt.question },
      { type: 'output', text: `> ${selectedOption.label}` },
    ];
    const continuationLines = buildTerminalPermissionContinuationLines(selectedOption.id);

    clearTerminalRunAnimation();
    setTerminalPermissionPromptForTab(null);
    setTerminalBlocksForTab(buildTerminalBlocks(committedLines));

    if (selectedOption.id === 'allow-session') {
      setTerminalPermissionScope('session');
    } else if (selectedOption.id === 'reject') {
      setTerminalPermissionScope(null);
    }

    if (continuationLines.length === 0) {
      finishTerminalRun({
        advanceGeneration: selectedOption.id !== 'reject',
        cancelGeneration: selectedOption.id === 'reject',
      });
      return;
    }

    runTerminalLineAnimation(continuationLines, {
      baseLines: committedLines,
      onComplete: () => finishTerminalRun({
        advanceGeneration: selectedOption.id !== 'reject',
        cancelGeneration: selectedOption.id === 'reject',
      }),
    });
  }, [
    clearTerminalRunAnimation,
    finishTerminalRun,
    runTerminalLineAnimation,
    setTerminalBlocksForTab,
    setTerminalPermissionPromptForTab,
    terminalPermissionPrompt,
  ]);

  const closeIdeBottomToolWindows = () => {
    clearTerminalRunAnimation();
    setPendingTerminalRunForTab(null);
    setTerminalPermissionPromptForTab(null);
    clearAcWarningFlow();
    setActiveIdeBottomToolWindow(null);
    BOTTOM_TOOL_WINDOW_IDS.forEach((id) => {
      const stripe = findIdeBottomToolWindowButton(id);
      if (stripe?.getAttribute('aria-pressed') === 'true') {
        stripe.click();
      }
    });
  };

  const handleDoneRegenerate = (payload = {}) => {
    ensureSpecStatusChat('Specified', { select: true });
    const commentEntries = payload?.commentEntries?.length
      ? payload.commentEntries
      : agentTaskCommentEntries;
    const currentTabId = generationTabId ?? ideTabs[activeEditorTab ?? 0]?.id;

    if (!currentTabId) return;
    setSpecTopBarStatusForTab('Specified', currentTabId);
    const specifyRunRequest = {
      mode: 'specify',
      sourceTabId: currentTabId,
      sectionTitle: 'Plan',
      taskLabel: ideTabs.find((tab) => tab.id === currentTabId)?.label ?? currentAgentTaskLabel,
    };
    setRunStateForTab('running', currentTabId);
    currentRunSourceTabIdRef.current = currentTabId;
    lastTerminalRunRequestRef.current = specifyRunRequest;
    setSpecDocumentRunRequestsByTab((prev) => ({
      ...prev,
      [currentTabId]: specifyRunRequest,
    }));

    const pendingDoneSpecState = buildPendingDoneSpecState({
      tabId: currentTabId,
      commentEntries,
    });
    if (!pendingDoneSpecState) {
      clearSpecDocumentRunRequestForTab(currentTabId);
      setRunStateForTab('default', currentTabId);
      return;
    }

    const {
      currentCode,
      targetCode,
      nextDocument,
      nextAppliedIssueFixes,
      nextRemovedIssueIndices,
      nextAcRunResult,
      nextPlanRunResult,
      currentAcRunResult,
      currentPlanRunResult,
      currentRemovedIssueIndices,
      rerunAcOriginalIndices,
      rerunPlanOriginalIndices,
      pendingCommentEntriesSnapshot,
      hasPendingReruns,
      hasPendingComments,
      hasSpecChanges,
    } = pendingDoneSpecState;
    setPlanRunResult(null);
    setAcRunResult(null);

    if (!hasSpecChanges && !hasPendingComments && !hasPendingReruns) {
      setGenerationTabId(currentTabId);
      setGenProgress(0);
      terminalDrivenGenerationRef.current = false;
      doneEnhanceFlowRef.current = {
        mode: 'preview-only',
        sourceTabId: currentTabId,
        runRequest: specifyRunRequest,
        nextAcRunResult,
        nextPlanRunResult,
        currentAcRunResult,
        currentPlanRunResult,
        currentRemovedIssueIndices,
        nextRemovedIssueIndices,
        rerunAcOriginalIndices,
        rerunPlanOriginalIndices,
      };
      setGenState(AGENT_TASK_LOADING_STATE_ENABLED ? 'loading' : 'generating');
      return;
    }

    clearChainedRunTimeout();
    clearStatusReveal('plan');
    clearStatusReveal('ac');
    resetRunUiForTab(currentTabId);
    setRunStateForTab('running', currentTabId);
    currentRunSourceTabIdRef.current = currentTabId;
    lastTerminalRunRequestRef.current = specifyRunRequest;
    setSpecDocumentRunRequestsByTab((prev) => ({
      ...prev,
      [currentTabId]: specifyRunRequest,
    }));

    doneEnhanceFlowRef.current = {
      sourceTabId: currentTabId,
      runRequest: specifyRunRequest,
      initialCode: currentCode,
      targetCode,
      nextDocument,
      nextAppliedIssueFixes,
      nextRemovedIssueIndices,
      nextAcRunResult,
      nextPlanRunResult,
      currentAcRunResult,
      currentPlanRunResult,
      currentRemovedIssueIndices,
      rerunAcOriginalIndices,
      rerunPlanOriginalIndices,
      commentsAlreadyCleared: hasPendingComments,
      versionCommit: (hasSpecChanges || hasPendingReruns)
        ? {
            sourceTabId: currentTabId,
            // Use the version history's latest code as the "before" snapshot so
            // that quick-fix changes (which already updated ideTabContents)
            // still produce a new version entry.
            currentCode: (() => {
              const history = specVersionsByTab[currentTabId];
              const lastVersion = Array.isArray(history?.versions) && history.versions.length > 0
                ? history.versions[history.versions.length - 1]
                : null;
              return lastVersion?.code ?? currentCode;
            })(),
            currentCommentEntries: pendingCommentEntriesSnapshot,
            nextCode: targetCode,
          }
        : null,
    };

    setGenerationTabId(currentTabId);
    setGenProgress(0);
    terminalDrivenGenerationRef.current = false;
    if (hasPendingComments) {
      clearTaskCommentsForTab(currentTabId);
    }
    setGenState(AGENT_TASK_LOADING_STATE_ENABLED ? 'loading' : 'generating');
  };

  const handleDoneIssueFix = useCallback(({ kind, index }) => {
    if (!Number.isInteger(index) || index < 0) return;
    const fixConfig = getIssueQuickFixConfig(kind, index);
    if (!fixConfig) return;

    const currentTabId = generationTabId ?? ideTabs[activeEditorTab ?? 0]?.id;
    const terminalTabId = currentTabId ? buildTerminalSessionTabId(currentTabId) : null;
    const visibleIndex = mapOriginalIssueIndexToVisible(kind, index, removedIssueIndices);
    if (!Number.isInteger(visibleIndex) || visibleIndex < 0) return;

    // A quick fix invalidates any in-flight run/reveal state for this spec.
    clearChainedRunTimeout();
    clearStatusReveal('plan');
    clearStatusReveal('ac');
    clearTerminalRunAnimation();
    clearAcWarningFlow();
    lastRunSectionRef.current = null;
    lastTerminalRunRequestRef.current = null;
    if (currentRunSourceTabIdRef.current) {
      setRunStateForTab('default', currentRunSourceTabIdRef.current);
    }
    if (currentTabId && currentRunSourceTabIdRef.current !== currentTabId) {
      setRunStateForTab('default', currentTabId);
    }
    currentRunSourceTabIdRef.current = null;
    if (terminalTabId) {
      setPendingTerminalRunForTab(null, terminalTabId);
      setTerminalPermissionPromptForTab(null, terminalTabId);
    }

    if (currentTabId) {
      setIdeTabContents((prev) => {
        const currentEntry = prev[currentTabId] ?? { language: 'markdown', code: '' };
        return {
          ...prev,
          [currentTabId]: {
            ...currentEntry,
            language: 'markdown',
            code: applyIssueQuickFixToCode(currentEntry.code ?? '', {
              kind,
              index: visibleIndex,
              replacementText: fixConfig.replacementText,
            }),
          },
        };
      });
    }

    setGeneratedDocument((prev) => applyIssueQuickFixToDocumentSections(prev, {
      kind,
      index: visibleIndex,
      replacementText: fixConfig.replacementText,
    }));

    setAppliedIssueFixes((prev) => ({
      ...prev,
      [kind]: {
        ...(prev[kind] ?? {}),
        [index]: true,
      },
    }));

    // Immediately show empty checkbox — run will confirm the fix with green status
    const setResult = kind === 'ac' ? setAcRunResult : setPlanRunResult;
    setResult((prev) => {
      if (!Array.isArray(prev)) return prev;
      const next = [...prev];
      next[visibleIndex] = null;
      return next;
    });

    if (currentTabId) {
      clearTaskCommentTargetForTab(currentTabId, { kind, index });
    }

  }, [
    activeEditorTab,
    clearAcWarningFlow,
    clearTaskCommentTargetForTab,
    clearChainedRunTimeout,
    clearStatusReveal,
    clearTerminalRunAnimation,
    generationTabId,
    ideTabs,
    removedIssueIndices,
    setAcRunResult,
    setPendingTerminalRunForTab,
    setPlanRunResult,
    setRunStateForTab,
    setTerminalPermissionPromptForTab,
  ]);

  useEffect(() => () => {
    terminalRunTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
    terminalRunTimeoutsRef.current = [];
    statusRevealTimeoutsRef.current.ac.forEach((timeoutId) => window.clearTimeout(timeoutId));
    statusRevealTimeoutsRef.current.plan.forEach((timeoutId) => window.clearTimeout(timeoutId));
    statusRevealTimeoutsRef.current = { ac: [], plan: [] };
    if (chainedRunTimeoutRef.current) {
      window.clearTimeout(chainedRunTimeoutRef.current);
      chainedRunTimeoutRef.current = null;
    }
    acWarningFlowRef.current = null;
  }, []);

  useEffect(() => {
    if (!pendingTerminalRun || !ideOpenWindows.includes('terminal') || typeof document === 'undefined') return undefined;

    let timeoutId = 0;
    let pollId = 0;
    let cancelled = false;
    let attempts = 0;

    const startWhenVisible = () => {
      if (cancelled) return;

      const terminalOutputEl = document.querySelector('.main-window .terminal-window .terminal-output-area');
      const isTerminalVisible =
        terminalOutputEl instanceof HTMLElement &&
        terminalOutputEl.getClientRects().length > 0 &&
        terminalOutputEl.offsetHeight > 0;

      if (isTerminalVisible) {
        timeoutId = window.setTimeout(() => {
          if (cancelled) return;
          startTerminalRunAnimation(pendingTerminalRun);
          setPendingTerminalRunForTab(null);
        }, TERMINAL_RUN_VISIBLE_DELAY_MS);
        return;
      }

      attempts += 1;
      if (attempts >= 60) {
        startTerminalRunAnimation(pendingTerminalRun);
        setPendingTerminalRunForTab(null);
        return;
      }

      pollId = window.setTimeout(startWhenVisible, 16);
    };

    pollId = window.setTimeout(startWhenVisible, 16);

    return () => {
      cancelled = true;
      if (pollId) window.clearTimeout(pollId);
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [ideOpenWindows, pendingTerminalRun, setPendingTerminalRunForTab, startTerminalRunAnimation]);

  useEffect(() => {
    if (screen !== 'ide') return;
    if (activeEditorTab !== null || ideTabs.length === 0) return;
    setActiveEditorTab(0);
  }, [screen, activeEditorTab, ideTabs.length]);

  useEffect(() => {
    if (screen !== 'ide' || seededPresetTaskRef.current || !initialAgentTaskId) return;
    seededPresetTaskRef.current = true;
    handleAgentTaskSelect(initialAgentTaskId);
  }, [screen, handleAgentTaskSelect, initialAgentTaskId]);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;

    let frameId = 0;
    let nestedFrameId = 0;

    setEditorTabsHost(null);

    const resolveEditorTabsHost = () => {
      const nextHost = document.querySelector('.main-window .main-window-editor-tabs');
      setEditorTabsHost(nextHost instanceof HTMLElement ? nextHost : null);
    };

    frameId = requestAnimationFrame(() => {
      nestedFrameId = requestAnimationFrame(resolveEditorTabsHost);
    });

    return () => {
      if (frameId) cancelAnimationFrame(frameId);
      if (nestedFrameId) cancelAnimationFrame(nestedFrameId);
    };
  }, [screen, ideWindowKey]);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;

    let frameId = null;

    const syncEditorCaretVisibility = () => {
      frameId = null;
      document.querySelectorAll('.editor .pce-textarea').forEach((node) => {
        if (!(node instanceof HTMLTextAreaElement)) return;

        const editorEl = node.closest('.editor');
        if (!editorEl) return;

        const hasVisibleCaret =
          document.activeElement === node &&
          node.selectionStart === node.selectionEnd;
        const hasMultilineSelection =
          document.activeElement === node &&
          hasTextareaMultilineSelection(node);

        editorEl.classList.toggle('editor-caret-visible', hasVisibleCaret);
        editorEl.classList.toggle('editor-has-multiline-selection', hasMultilineSelection);
      });
    };

    const scheduleSync = () => {
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
      }
      frameId = requestAnimationFrame(syncEditorCaretVisibility);
    };

    document.addEventListener('focusin', scheduleSync);
    document.addEventListener('focusout', scheduleSync);
    document.addEventListener('selectionchange', scheduleSync);
    window.addEventListener('mouseup', scheduleSync);
    window.addEventListener('keyup', scheduleSync);

    scheduleSync();

    return () => {
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
      }

      document.removeEventListener('focusin', scheduleSync);
      document.removeEventListener('focusout', scheduleSync);
      document.removeEventListener('selectionchange', scheduleSync);
      window.removeEventListener('mouseup', scheduleSync);
      window.removeEventListener('keyup', scheduleSync);

      document.querySelectorAll('.editor.editor-caret-visible').forEach((editorEl) => {
        editorEl.classList.remove('editor-caret-visible');
      });
      document.querySelectorAll('.editor.editor-has-multiline-selection').forEach((editorEl) => {
        editorEl.classList.remove('editor-has-multiline-selection');
      });
    };
  }, []);

  // Editor @ completion listener
  useEffect(() => {
    if (screen !== 'ide') return;

    const handleEditorInput = (e) => {
      const textarea = e.target;
      if (!(textarea instanceof HTMLTextAreaElement)) return;
      if (!textarea.classList.contains('pce-textarea')) return;
      if (!textarea.closest('.main-window-editor-content .editor-code')) return;

      const value = textarea.value;

      // Disabled for now: attached file chips are controlled explicitly via popup/remove actions.
      // Restore this block if chips should again follow @/# mentions typed in the editor.
      if (ATTACHED_FILES_SYNC_WITH_EDITOR) {
        updateAttachedFilesForTab(files => files.filter(file => {
          for (const prefix of ['@', '#']) {
            const idx = value.indexOf(prefix + file.label);
            if (idx !== -1) {
              const after = value[idx + 1 + file.label.length];
              if (after === undefined || after === ' ' || after === '\n' || after === '\r') {
                return true;
              }
            }
          }
          return false;
        }));
      }

      const cursorPos = textarea.selectionStart;
      const textBeforeCursor = value.slice(0, cursorPos);

      const lastAt = textBeforeCursor.lastIndexOf('@');
      const lastHash = textBeforeCursor.lastIndexOf('#');
      const triggerIdx = Math.max(lastAt, lastHash);

      if (triggerIdx >= 0) {
        const trigger = textBeforeCursor[triggerIdx];
        const query = textBeforeCursor.slice(triggerIdx + 1);
        if (!query.includes(' ') && !query.includes('\n')) {
          const rect = textarea.getBoundingClientRect();
          setEditorCompletion({
            trigger,
            query,
            selectedIdx: 0,
            pos: { top: rect.top + 24, left: rect.left + 40 }
          });
          return;
        }
      }
      setEditorCompletion(null);
    };

    const handleEditorKeyDown = (e) => {
      const textarea = e.target;
      if (!(textarea instanceof HTMLTextAreaElement)) return;
      if (!textarea.classList.contains('pce-textarea')) return;
      if (!textarea.closest('.main-window-editor-content .editor-code')) return;
      if (!editorCompletionRef.current) return;

      const completion = editorCompletionRef.current;
      const items = completion.trigger === '@' ? AT_COMPLETIONS : HASH_COMPLETIONS;
      const filtered = items.filter(item =>
        item.label.toLowerCase().includes(completion.query.toLowerCase())
      ).slice(0, COMPLETION_POPUP_MAX_ITEMS);

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setEditorCompletion(c => c ? { ...c, selectedIdx: Math.min(c.selectedIdx + 1, filtered.length - 1) } : null);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setEditorCompletion(c => c ? { ...c, selectedIdx: Math.max(c.selectedIdx - 1, 0) } : null);
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        if (filtered.length > 0) {
          e.preventDefault();
          const item = filtered[completion.selectedIdx];
          const selection = buildCompletionSelection(item);
          if (selection) {
            const value = textarea.value;
            const cursorPos = textarea.selectionStart;
            const textBeforeCursor = value.slice(0, cursorPos);
            const triggerIdx = Math.max(textBeforeCursor.lastIndexOf('@'), textBeforeCursor.lastIndexOf('#'));
            const before = value.slice(0, triggerIdx + 1);
            const after = value.slice(cursorPos);
            const insertText = getCompletionInsertText(selection);
            const newValue = before + insertText + ' ' + after;
            textarea.value = newValue;
            const newPos = triggerIdx + 1 + insertText.length + 1;
            textarea.setSelectionRange(newPos, newPos);
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
            const attachment = getCompletionAttachment(selection);
            if (attachment) {
              updateAttachedFilesForTab(files => {
                if (files.some(f => f.label === attachment.label)) return files;
                return [...files, attachment];
              });
            }
            setEditorCompletion(null);
          }
        }
      } else if (e.key === 'Escape') {
        setEditorCompletion(null);
      }
    };

    document.addEventListener('input', handleEditorInput, true);
    document.addEventListener('keydown', handleEditorKeyDown, true);

    return () => {
      document.removeEventListener('input', handleEditorInput, true);
      document.removeEventListener('keydown', handleEditorKeyDown, true);
    };
  }, [screen, updateAttachedFilesForTab]);

  // Keep ref in sync with state
  useEffect(() => {
    editorCompletionRef.current = editorCompletion;
  }, [editorCompletion]);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;

    let frameId = null;

    const syncIdleSelectionToolbar = () => {
      frameId = null;

      if (screen !== 'ide') {
        setIdleSelectionToolbarPos(null);
        return;
      }

      const activeTab = ideTabs[activeEditorTab ?? 0];
      const isIdleAgentTaskTab = activeTab?.id?.startsWith('agent-task-') && genState === 'idle';
      if (!isIdleAgentTaskTab) {
        setIdleSelectionToolbarPos(null);
        return;
      }

      const textarea = Array.from(document.querySelectorAll('.main-window-editor-content .editor .pce-textarea')).find(
        (node) => node instanceof HTMLTextAreaElement && !node.readOnly && node.getClientRects().length > 0
      );

      if (!(textarea instanceof HTMLTextAreaElement)) {
        setIdleSelectionToolbarPos(null);
        return;
      }

      const rect = getTextareaSelectionViewportRect(textarea);
      if (!rect || rect.bottom <= 0 || rect.top >= window.innerHeight || rect.right <= 0 || rect.left >= window.innerWidth) {
        setIdleSelectionToolbarPos(null);
        return;
      }

      setIdleSelectionToolbarPos(getSelectionToolbarPosition(rect));
    };

    const scheduleSync = () => {
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
      }
      frameId = requestAnimationFrame(syncIdleSelectionToolbar);
    };

    document.addEventListener('selectionchange', scheduleSync);
    document.addEventListener('select', scheduleSync, true);
    document.addEventListener('input', scheduleSync, true);
    document.addEventListener('focusin', scheduleSync);
    document.addEventListener('focusout', scheduleSync);
    document.addEventListener('scroll', scheduleSync, true);
    window.addEventListener('mouseup', scheduleSync);
    window.addEventListener('keyup', scheduleSync);
    window.addEventListener('resize', scheduleSync);

    scheduleSync();

    return () => {
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
      }

      document.removeEventListener('selectionchange', scheduleSync);
      document.removeEventListener('select', scheduleSync, true);
      document.removeEventListener('input', scheduleSync, true);
      document.removeEventListener('focusin', scheduleSync);
      document.removeEventListener('focusout', scheduleSync);
      document.removeEventListener('scroll', scheduleSync, true);
      window.removeEventListener('mouseup', scheduleSync);
      window.removeEventListener('keyup', scheduleSync);
      window.removeEventListener('resize', scheduleSync);
      setIdleSelectionToolbarPos(null);
    };
  }, [screen, ideTabs, activeEditorTab, genState]);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;

    let frameId = null;

    const syncEditorSelectionToolbar = () => {
      frameId = null;

      if (screen !== 'ide') {
        setEditorSelectionToolbarPos(null);
        return;
      }

      const activeTab = ideTabs[activeEditorTab ?? 0];
      const tabId = activeTab?.id ?? '';

      if (!tabId || String(tabId).startsWith('agent-task-') || String(tabId).startsWith('plan-diff-')) {
        setEditorSelectionToolbarPos(null);
        return;
      }

      const activeEditorEl = Array.from(document.querySelectorAll('.main-window-editor-content .editor')).find(
        (node) => node instanceof HTMLElement && node.getClientRects().length > 0
      );

      if (!(activeEditorEl instanceof HTMLElement)) {
        setEditorSelectionToolbarPos(null);
        return;
      }

      const textarea = activeEditorEl.querySelector('.pce-textarea');
      const textareaSelectionExists =
        textarea instanceof HTMLTextAreaElement
        && (textarea.selectionStart ?? 0) !== (textarea.selectionEnd ?? 0);

      let rect = textarea instanceof HTMLTextAreaElement ? getTextareaSelectionViewportRect(textarea) : null;

      // If the editor is textarea-driven but the mirror failed (e.g. textarea has
      // zero layout width), fall back to a coarse position anchored to the editor.
      if (!rect && textareaSelectionExists) {
        const editorRect = activeEditorEl.getBoundingClientRect();
        rect = {
          top: editorRect.top + 8,
          bottom: editorRect.top + 8,
          left: editorRect.left + editorRect.width / 2,
          right: editorRect.left + editorRect.width / 2,
          width: 1,
          height: 1,
        };
      }

      if (!rect && typeof window !== 'undefined') {
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0 && !selection.isCollapsed && selection.toString().trim()) {
          const anchorNode = selection.anchorNode;
          const anchorElement = anchorNode?.nodeType === Node.TEXT_NODE ? anchorNode.parentElement : anchorNode;
          const anchorInEditor =
            anchorElement instanceof Element
            && activeEditorEl.contains(anchorElement)
            && !anchorElement.closest('.agent-task-editor-area')
            ;

          if (anchorInEditor) {
            rect = getRangeViewportRect(selection.getRangeAt(0));
          }
        }
      }

      if (!rect || rect.bottom <= 0 || rect.top >= window.innerHeight || rect.right <= 0 || rect.left >= window.innerWidth) {
        setEditorSelectionToolbarPos(null);
        return;
      }

      const basePos = getSelectionToolbarPosition(rect, { safeWidth: 430, safeHeight: 44 });
      setEditorSelectionToolbarPos(basePos);
    };

    const scheduleSync = () => {
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
      }
      frameId = requestAnimationFrame(syncEditorSelectionToolbar);
    };

    document.addEventListener('selectionchange', scheduleSync);
    document.addEventListener('select', scheduleSync, true);
    document.addEventListener('input', scheduleSync, true);
    document.addEventListener('focusin', scheduleSync);
    document.addEventListener('focusout', scheduleSync);
    document.addEventListener('scroll', scheduleSync, true);
    window.addEventListener('mouseup', scheduleSync);
    window.addEventListener('keyup', scheduleSync);
    window.addEventListener('resize', scheduleSync);

    scheduleSync();

    return () => {
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
      }

      document.removeEventListener('selectionchange', scheduleSync);
      document.removeEventListener('select', scheduleSync, true);
      document.removeEventListener('input', scheduleSync, true);
      document.removeEventListener('focusin', scheduleSync);
      document.removeEventListener('focusout', scheduleSync);
      document.removeEventListener('scroll', scheduleSync, true);
      window.removeEventListener('mouseup', scheduleSync);
      window.removeEventListener('keyup', scheduleSync);
      window.removeEventListener('resize', scheduleSync);
      setEditorSelectionToolbarPos(null);
    };
  }, [screen, ideTabs, activeEditorTab]);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;

    const handleProblemsNodeClick = (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const treeNode = target.closest('.tree-node');
      if (!(treeNode instanceof HTMLElement)) return;

      const label = treeNode.querySelector('.tree-node-label');
      const secondary = treeNode.querySelector('.tree-node-secondary');
      const displayKey = buildProblemsTreeDisplayKey(
        label instanceof HTMLElement ? label.textContent : '',
        secondary instanceof HTMLElement ? secondary.textContent : '',
      );
      const node = problemsTreeNodesByDisplayRef.current.get(displayKey);
      if (node?.id) {
        openProblemsTreeNode(node.id);
        return;
      }

      if (!(secondary instanceof HTMLElement)) return;
      const rawIndex = parseProblemRawIndexFromSecondaryText(secondary.textContent ?? '');
      if (!Number.isInteger(rawIndex)) return;
      requestProblemHighlight(rawIndex);
    };

    document.addEventListener('click', handleProblemsNodeClick, true);

    return () => {
      document.removeEventListener('click', handleProblemsNodeClick, true);
    };
  }, [openProblemsTreeNode, requestProblemHighlight]);

  useEffect(() => {
    if (screen !== 'ide') return;

    const nextTabIndex = activeEditorTab ?? 0;
    const activeTab = ideTabs[nextTabIndex];
    if (activeTab?.id === 'welcome') return;
    const shouldFocusAgentTaskToolbar = TOOLBAR_INPUT_IS_EDITABLE && activeTab?.id?.startsWith('agent-task-') && genState === 'idle';

    let rafId1 = 0;
    let rafId2 = 0;
    let timeoutId = 0;
    let attempts = 0;

    const focusAgentTaskToolbarInput = () => {
      const textarea = Array.from(document.querySelectorAll('.editor-top-bar .agent-task-editor-area .at-input')).find(
        (node) =>
          node instanceof HTMLTextAreaElement &&
          !node.readOnly &&
          !node.classList.contains('at-input-collapsed') &&
          node.getClientRects().length > 0
      );

      if (!(textarea instanceof HTMLTextAreaElement)) return false;

      if (document.activeElement !== textarea) {
        textarea.focus({ preventScroll: true });
      }

      if (document.activeElement !== textarea) {
        return false;
      }

      const caretPosition = Math.min(textarea.value.length, textarea.selectionEnd ?? textarea.value.length);
      textarea.setSelectionRange(caretPosition, caretPosition, 'none');
      return true;
    };

    const focusVisibleEditor = () => {
      const textarea = Array.from(document.querySelectorAll('.main-window-editor-content .editor .pce-textarea')).find(
        (node) =>
          node instanceof HTMLTextAreaElement &&
          !node.readOnly &&
          node.getClientRects().length > 0
      );

      if (!(textarea instanceof HTMLTextAreaElement)) return false;

      if (document.activeElement !== textarea) {
        textarea.focus({ preventScroll: true });
      }

      if (document.activeElement !== textarea) {
        return false;
      }

      const caretPosition = Math.min(textarea.value.length, textarea.selectionEnd ?? 0);
      textarea.setSelectionRange(caretPosition, caretPosition, 'none');
      textarea.closest('.editor')?.classList.add('editor-caret-visible');
      return true;
    };

    const runFocusAttempt = () => {
      const didFocus = shouldFocusAgentTaskToolbar
        ? focusAgentTaskToolbarInput()
        : focusVisibleEditor();

      if (didFocus || attempts >= 20) return;

      attempts += 1;
      timeoutId = window.setTimeout(() => {
        rafId2 = requestAnimationFrame(runFocusAttempt);
      }, 50);
    };

    rafId1 = requestAnimationFrame(() => {
      rafId2 = requestAnimationFrame(runFocusAttempt);
    });

    return () => {
      cancelAnimationFrame(rafId1);
      cancelAnimationFrame(rafId2);
      window.clearTimeout(timeoutId);
    };
  }, [screen, activeEditorTab, ideTabs, genState]);

  const openNewAgentTask = useCallback((options = {}) => {
    const { revealAgentTasks = true, templateId = null, label: providedLabel = null } = options ?? {};
    seededPresetTaskRef.current = true;

    const id = `agent-task-${Date.now()}`;
    const normalizedLabel = (() => {
      const trimmed = typeof providedLabel === 'string' ? providedLabel.trim() : '';
      if (!trimmed) return 'New Task.md';
      return /\.md$/i.test(trimmed) ? trimmed : `${trimmed}.md`;
    })();
    const newTask = { id, label: normalizedLabel, time: 'now', status: null };
    const scenario = getAgentTaskScenario({
      tabId: id,
      label: newTask.label,
    });
    const templateDocumentSections = templateId ? createTaskTemplateSpecDocument(templateId) : null;
    const initialTaskState = templateDocumentSections
      ? createInteractiveTaskState({
          documentSections: templateDocumentSections,
          genState: 'idle',
        })
      : scenario.initialTaskState;
    const nextTab = {
      id,
      label: newTask.label,
      icon: 'fileTypes/markdown',
      closable: true,
    };
    const nextContent = {
      language: 'markdown',
      code: templateDocumentSections
        ? serializeSpecDocument(templateDocumentSections)
        : scenario.initialCode,
    };

    setAgentTasks((tasks) => [newTask, ...tasks]);
    setSelectedTask(id);
    setScreen('ide');
    if (revealAgentTasks) {
      setIdeOpenWindows((prev) => (
        prev.includes(CHATS_HISTORY_TOOL_WINDOW_ID) ? prev : [...prev, CHATS_HISTORY_TOOL_WINDOW_ID]
      ));
    }
    setIdeTabs((prev) => (
      prev.some((tab) => tab.id === id) ? prev : [nextTab, ...prev]
    ));
    setIdeTabContents((prev) => (
      prev[id]
        ? prev
        : {
            ...prev,
            [id]: nextContent,
          }
    ));
    setInteractiveTaskStates((prev) => (
      prev[id]
        ? prev
        : {
            ...prev,
            [id]: initialTaskState,
          }
    ));
    applyInteractiveTaskState(id, initialTaskState);
    setActiveEditorTab(0);
    return newTask;
  }, [applyInteractiveTaskState]);

  const openNewSessionTab = useCallback(() => {
    setScreen('ide');
    setIdeOpenWindows((prev) => (
      prev.includes('project') ? prev : ['project', ...prev]
    ));
    const existingIndex = ideTabs.findIndex((tab) => tab.id === AIUX_NEW_SESSION_TAB_ID);
    if (existingIndex >= 0) {
      setActiveEditorTab(existingIndex);
    } else {
      setIdeTabs((prev) => [{
        id: AIUX_NEW_SESSION_TAB_ID,
        label: 'New Session',
        icon: <AiChatClaudeIcon />,
        closable: true,
      }, ...prev]);
      setActiveEditorTab(0);
    }
    setIdeTabContents((prev) => (
      prev[AIUX_NEW_SESSION_TAB_ID]
        ? prev
        : {
            ...prev,
            [AIUX_NEW_SESSION_TAB_ID]: {
              language: 'text',
              code: '',
            },
          }
    ));
  }, [ideTabs]);

  // Open a chat in the center editor area as its own tab (not in the left
  // panel). Used by Project tool window, Chats History and New Session recents.
  const openChatInEditorTab = useCallback((chatId, chatMetaOverride = null) => {
    if (!chatId) return;
    const tabId = `ai-chat-${chatId}`;
    setScreen('ide');
    setSelectedAiChatId(chatId);
    setChatsHistorySlotShowsAiChat(false);

    setIdeTabs((prevTabs) => {
      const existingIndex = prevTabs.findIndex((tab) => tab.id === tabId);
      const chatMeta = chatMetaOverride
        ?? aiSessionChatRows.find((row) => row?.id === chatId)
        ?? aiChatRecentItems.find((row) => row?.id === chatId)
        ?? null;
      const title = chatMeta?.title ?? aiChatScenarios[chatId]?.title ?? 'AI Chat';
      const iconName = (() => {
        const raw = typeof chatMeta?.icon === 'string' ? chatMeta.icon : null;
        if (raw === 'codex') return 'aiAssistant/codex@20x20';
        if (raw === 'junie') return 'aiAssistant/junie@20x20';
        if (raw === 'fileTypes/markdown') return 'fileTypes/markdown';
        return 'aiAssistant/toolWindowChat';
      })();
      if (existingIndex >= 0) {
        setActiveEditorTab(existingIndex);
        return prevTabs.map((tab, index) => (
          index === existingIndex
            ? { ...tab, label: title, icon: iconName }
            : tab
        ));
      }
      const nextTab = {
        id: tabId,
        label: title,
        icon: iconName,
        closable: true,
      };
      setActiveEditorTab(0);
      return [nextTab, ...prevTabs];
    });

    setIdeTabContents((prev) => (
      prev[tabId] ? prev : { ...prev, [tabId]: { language: 'text', code: '' } }
    ));
  }, [aiChatRecentItems, aiChatScenarios, aiSessionChatRows]);

  const openNewSessionChat = useCallback((prompt = '') => {
    const session = createEmptyAiChatSession({
      title: prompt || 'New Chat',
      userPrompt: prompt,
      emptyState: !prompt,
      assistantParagraphs: prompt ? ['I created a new chat from the New Session tab.'] : [],
      select: false,
    });
    openChatInEditorTab(session.id, session);
  }, [createEmptyAiChatSession, openChatInEditorTab]);

  const openNewSessionTerminal = useCallback(() => {
    setScreen('ide');
    openIdeBottomToolWindow('terminal');
  }, [openIdeBottomToolWindow]);

  // Open an existing spec-related chat: spec → center editor tab, chat → left AI panel.
  // Used by the Recents > spec mode rows in AIUXNewSessionEditor.
  const openSpecChatFromRecents = useCallback((chatId, specId = null) => {
    if (specId) {
      // Block the spec-status useEffect from auto-selecting (and opening) a
      // freshly created "Specified" chat — it would override the chat the user
      // just clicked.
      suppressNextSpecAutoChatRef.current = true;
      handleAgentTaskSelect(specId, { revealAgentTasks: false });
    }
    if (chatId) {
      setSelectedAiChatId(chatId);
    }
    openAiToolWindow();
  }, [handleAgentTaskSelect, openAiToolWindow]);

  const openSpecTaskOnly = useCallback((taskId) => {
    if (!taskId) return;
    suppressNextSpecAutoChatRef.current = true;
    handleAgentTaskSelect(taskId, { revealAgentTasks: false });
    setSelectedAiChatId(null);
    // If the slot was showing the AI chat panel, close it entirely so only the
    // spec editor remains. Leave it open when the slot was showing the Chats
    // History list — the user is likely navigating from there.
    if (chatsHistorySlotShowsAiChat) {
      setIdeOpenWindows((prev) => prev.filter((id) => id !== CHATS_HISTORY_TOOL_WINDOW_ID));
    }
    setChatsHistorySlotShowsAiChat(false);
  }, [chatsHistorySlotShowsAiChat, handleAgentTaskSelect]);

  const showAllAiSessionsFromProject = useCallback(() => {
    setAiuxProjectShowAllSessions(true);
    setIdeOpenWindows((prev) => {
      const nonLeftWindows = prev.filter((windowId) => !LEFT_TOOL_WINDOW_IDS.has(windowId));
      return [CHATS_HISTORY_TOOL_WINDOW_ID, ...nonLeftWindows];
    });
  }, []);

  const handleSpecModeStart = useCallback((prompt = '', taskIdOverride = null) => {
    if (prompt && typeof prompt === 'object') {
      const createdTask = openNewAgentTask({
        revealAgentTasks: false,
        templateId: prompt.templateId ?? null,
        label: prompt.specName ?? null,
      });
      const command = typeof prompt.command === 'string' ? prompt.command.trim() : '';
      const userPrompt = typeof prompt.prompt === 'string' ? prompt.prompt.trim() : '';
      const commandPrompt = [command, userPrompt].filter(Boolean).join(' ');
      if (command === '/roast' && createdTask?.label) {
        const chatId = `roast-${createdTask.id}`;
        const specAttachment = {
          id: `sdd-document-${createdTask.id}-roast`,
          sourceTabId: createdTask.id,
          label: createdTask.label,
          icon: 'fileTypes/markdown',
          commentCount: 0,
          diffComments: null,
          diffRequest: null,
          diffTabId: null,
          isPlainFile: false,
          isSddDocument: true,
          isSddCommentAttachment: false,
          sddCommentEntries: [],
        };
        createEmptyAiChatSession({
          id: chatId,
          title: `Roast: ${createdTask.label.replace(/\.md$/i, '')}`,
          icon: 'codex',
          emptyState: false,
          userPrompt: commandPrompt,
          assistantParagraphs: [
            `I loaded ${createdTask.label} as the source specification for this roast chat.`,
            'I will challenge the task framing and help shape the spec before implementation.',
          ],
          command: commandPrompt,
          attachmentLabel: createdTask.label,
          attachments: [specAttachment],
          showAttachmentsInComposer: true,
          children: [
            { id: 'specs', label: 'Specs', items: [{ id: createdTask.id, label: createdTask.label }] },
          ],
          select: false,
        });
        // openNewAgentTask already added the tab and made it active. Calling
        // handleAgentTaskSelect here reads stale ideTabs/agentTasks (the new
        // task isn't committed yet), then overwrites the just-created tab via
        // setIdeTabs with a default "New Task.md" label.
        setSelectedAiChatId(chatId);
        openAiToolWindow();
      }
      return;
    }

    if (taskIdOverride) {
      handleAgentTaskSelect(taskIdOverride, { revealAgentTasks: false });
      setSelectedAiChatId(null);
      setChatsHistorySlotShowsAiChat(false);
      return;
    }

    openNewAgentTask({ revealAgentTasks: false });
  }, [createEmptyAiChatSession, handleAgentTaskSelect, openAiToolWindow, openNewAgentTask]);

  const activeTabIdForGen = generationTabId ?? ideTabs[activeEditorTab]?.id;

  function startAgentTaskGeneration(options = {}) {
    const {
      openTerminal = false,
      question = '',
      sourceCode = null,
      nextDocument: providedDocument = null,
      nextAppliedIssueFixes = null,
      nextRemovedIssueIndices = null,
    } = options;
    const nextGenerationTabId = ideTabs[activeEditorTab]?.id;
    if (!nextGenerationTabId) return;
    doneEnhanceFlowRef.current = null;
    const nextTaskLabel = ideTabs[activeEditorTab]?.label ?? TERMINAL_TASK_TAB_BASE_LABEL;
    const nextScenario = getCurrentAgentTaskScenario(nextGenerationTabId);
    const nextDocument = Array.isArray(providedDocument) ? providedDocument : nextScenario.defaultDocument;
    setAppliedIssueFixes(nextAppliedIssueFixes ?? { ac: {}, plan: {} });
    setRemovedIssueIndices(nextRemovedIssueIndices ?? { ac: {}, plan: {} });
    setGenerationTabId(nextGenerationTabId);
    setGeneratedDocument(nextDocument);

    if (typeof sourceCode === 'string') {
      setIdeTabContents((prev) => ({
        ...prev,
        [nextGenerationTabId]: {
          ...(prev[nextGenerationTabId] ?? {}),
          language: 'markdown',
          code: sourceCode,
        },
      }));
    }

    terminalDrivenGenerationRef.current = openTerminal;

    if (openTerminal) {
      queueTerminalRun({
        mode: 'generate',
        sourceTabId: nextGenerationTabId,
        taskLabel: nextTaskLabel,
        question,
      });
    }

    if (!AGENT_TASK_USES_INTERMEDIATE_STATES) {
      const serializedDocument = serializeSpecDocument(nextDocument);
      setIdeTabContents(prev => ({ ...prev, [nextGenerationTabId]: { language: 'markdown', code: serializedDocument } }));
      setGenProgress(1);
      setGenState('done');
      return;
    }

    // Keep the idle editor content visible while the loading state is active.
    setGenState(AGENT_TASK_LOADING_STATE_ENABLED ? 'loading' : 'generating');
  }

  useEffect(() => {
    if (genTimerRef.current) {
      clearTimeout(genTimerRef.current);
      genTimerRef.current = null;
    }

    if (!AGENT_TASK_USES_INTERMEDIATE_STATES) {
      if (genState === 'idle' && activeTabIdForGen) {
        setIdeTabContents(prev => ({ ...prev, [activeTabIdForGen]: { language: 'markdown', code: '' } }));
        setGenProgress(0);
        setGenerationTabId(null);
      }
      return undefined;
    }

    if (genState === 'loading') {
      setGenProgress(0);
      if (!AGENT_TASK_GENERATING_STATE_ENABLED) {
        return undefined;
      }
      if (terminalDrivenGenerationRef.current || pendingTerminalRun || isTerminalStreaming || terminalPermissionPrompt) {
        return undefined;
      }
      genTimerRef.current = setTimeout(() => {
        setGenState('generating');
      }, AGENT_TASK_LOADING_STEP_DELAY_MS);

      return () => {
        if (genTimerRef.current) {
          clearTimeout(genTimerRef.current);
          genTimerRef.current = null;
        }
      };
    }

    if (genState === 'generating' && activeTabIdForGen) {
      if (!AGENT_TASK_GENERATING_STATE_ENABLED) {
        return undefined;
      }

      const doneEnhanceFlow = doneEnhanceFlowRef.current;
      if (doneEnhanceFlow) {
        const {
          mode = 'apply',
          sourceTabId = activeTabIdForGen,
          initialCode,
          targetCode,
          nextDocument,
          nextAppliedIssueFixes,
          nextRemovedIssueIndices,
          nextAcRunResult,
          nextPlanRunResult,
          currentAcRunResult,
          currentPlanRunResult,
          currentRemovedIssueIndices,
          rerunAcOriginalIndices,
          rerunPlanOriginalIndices,
          commentsAlreadyCleared = false,
          usesDirectSwap = false,
          versionCommit = null,
          runRequest = null,
        } = doneEnhanceFlow;
        setGenProgress(0);
        resetRunUiForTab(sourceTabId);
        if (runRequest) {
          setRunStateForTab('running', sourceTabId);
          currentRunSourceTabIdRef.current = sourceTabId;
          lastTerminalRunRequestRef.current = runRequest;
          setSpecDocumentRunRequestsByTab((prev) => ({
            ...prev,
            [sourceTabId]: runRequest,
          }));
        }

        if (mode === 'preview-only') {
          let cancelled = false;

          genTimerRef.current = setTimeout(() => {
            if (cancelled) return;
            doneEnhanceFlowRef.current = null;
            startDoneEnhanceStatusReveal(nextPlanRunResult, nextAcRunResult, {
              currentPlanStatuses: currentPlanRunResult,
              currentAcStatuses: currentAcRunResult,
              currentRemovedIssueIndices,
              nextRemovedIssueIndices,
              rerunPlanOriginalIndices,
              rerunAcOriginalIndices,
              allowPendingOutdated: false,
            });
            setGenProgress(1);
            clearSpecDocumentRunRequestForTab(sourceTabId);
            setGenState('done');
          }, Math.max(AGENT_TASK_LOADING_STEP_DELAY_MS, 180));

          return () => {
            cancelled = true;
            if (genTimerRef.current) {
              clearTimeout(genTimerRef.current);
              genTimerRef.current = null;
            }
          };
        }

        let commentsCleared = commentsAlreadyCleared;

        const clearDoneCommentsOnce = () => {
          if (commentsCleared) return;
          commentsCleared = true;
          resetDoneComments();
        };

        if (usesDirectSwap) {
          clearDoneCommentsOnce();
          setIdeTabContents((prev) => ({
            ...prev,
            [activeTabIdForGen]: {
              ...(prev[activeTabIdForGen] ?? {}),
              language: 'markdown',
              code: targetCode,
            },
          }));
          if (versionCommit?.sourceTabId) {
            updateSpecVersionsForTab((prevHistory) => appendSpecVersionHistoryEntry(prevHistory, {
              currentCode: versionCommit.currentCode,
              currentCommentEntries: versionCommit.currentCommentEntries,
              nextCode: versionCommit.nextCode,
            }), versionCommit.sourceTabId);
          }
          doneEnhanceFlowRef.current = null;
          setGeneratedDocument(nextDocument);
          setAppliedIssueFixes(nextAppliedIssueFixes);
          setRemovedIssueIndices(nextRemovedIssueIndices);
          startDoneEnhanceStatusReveal(nextPlanRunResult, nextAcRunResult, {
            currentPlanStatuses: currentPlanRunResult,
            currentAcStatuses: currentAcRunResult,
            currentRemovedIssueIndices,
            nextRemovedIssueIndices,
            rerunPlanOriginalIndices,
            rerunAcOriginalIndices,
            allowPendingOutdated: false,
          });
          // Store rerun indices so Run knows what to check after Enhance
          if (sourceTabId && (Array.isArray(rerunAcOriginalIndices) || Array.isArray(rerunPlanOriginalIndices))) {
            setInteractiveTaskStates((prev) => ({
              ...prev,
              [sourceTabId]: {
                ...(prev[sourceTabId] ?? {}),
                pendingRerunAcOriginalIndices: Array.isArray(rerunAcOriginalIndices) && rerunAcOriginalIndices.length > 0 ? rerunAcOriginalIndices : undefined,
                pendingRerunPlanOriginalIndices: Array.isArray(rerunPlanOriginalIndices) && rerunPlanOriginalIndices.length > 0 ? rerunPlanOriginalIndices : undefined,
              },
            }));
          }
          setGenProgress(1);
          clearSpecDocumentRunRequestForTab(sourceTabId);
          setGenState('done');
          return undefined;
        }

        const frames = buildSmoothSpecTransitionFrames(initialCode, targetCode);

        if (frames.length === 0) {
          if (versionCommit?.sourceTabId) {
            updateSpecVersionsForTab((prevHistory) => appendSpecVersionHistoryEntry(prevHistory, {
              currentCode: versionCommit.currentCode,
              currentCommentEntries: versionCommit.currentCommentEntries,
              nextCode: versionCommit.nextCode,
            }), versionCommit.sourceTabId);
          }
          doneEnhanceFlowRef.current = null;
          // Store rerun indices so Run knows what to check after Enhance
          if (sourceTabId && (Array.isArray(rerunAcOriginalIndices) || Array.isArray(rerunPlanOriginalIndices))) {
            setInteractiveTaskStates((prev) => ({
              ...prev,
              [sourceTabId]: {
                ...(prev[sourceTabId] ?? {}),
                pendingRerunAcOriginalIndices: Array.isArray(rerunAcOriginalIndices) && rerunAcOriginalIndices.length > 0 ? rerunAcOriginalIndices : undefined,
                pendingRerunPlanOriginalIndices: Array.isArray(rerunPlanOriginalIndices) && rerunPlanOriginalIndices.length > 0 ? rerunPlanOriginalIndices : undefined,
              },
            }));
          }
          clearDoneCommentsOnce();
          setGeneratedDocument(nextDocument);
          setAppliedIssueFixes(nextAppliedIssueFixes);
          setRemovedIssueIndices(nextRemovedIssueIndices);
          startDoneEnhanceStatusReveal(nextPlanRunResult, nextAcRunResult, {
            currentPlanStatuses: currentPlanRunResult,
            currentAcStatuses: currentAcRunResult,
            currentRemovedIssueIndices,
            nextRemovedIssueIndices,
            rerunPlanOriginalIndices,
            rerunAcOriginalIndices,
            allowPendingOutdated: false,
          });
          setGenProgress(1);
          clearSpecDocumentRunRequestForTab(sourceTabId);
          setGenState('done');
          return undefined;
        }

        let frameIndex = 0;
        let cancelled = false;

        function streamEnhancedContentFrame() {
          if (cancelled) return;

          if (frameIndex < frames.length) {
            clearDoneCommentsOnce();
            const nextFrame = frames[frameIndex];
            frameIndex += 1;

            setIdeTabContents((prev) => ({
              ...prev,
              [activeTabIdForGen]: {
                ...(prev[activeTabIdForGen] ?? {}),
                language: 'markdown',
                code: nextFrame,
              },
            }));
            setGenProgress(frameIndex / frames.length);

            genTimerRef.current = setTimeout(
              streamEnhancedContentFrame,
              AGENT_TASK_CONTENT_MORPH_STEP_DELAY_MS,
            );
            return;
          }

          doneEnhanceFlowRef.current = null;
          clearDoneCommentsOnce();
          if (versionCommit?.sourceTabId) {
            updateSpecVersionsForTab((prevHistory) => appendSpecVersionHistoryEntry(prevHistory, {
              currentCode: versionCommit.currentCode,
              currentCommentEntries: versionCommit.currentCommentEntries,
              nextCode: versionCommit.nextCode,
            }), versionCommit.sourceTabId);
          }
          setGeneratedDocument(nextDocument);
          setAppliedIssueFixes(nextAppliedIssueFixes);
          setRemovedIssueIndices(nextRemovedIssueIndices);
          startDoneEnhanceStatusReveal(nextPlanRunResult, nextAcRunResult, {
            currentPlanStatuses: currentPlanRunResult,
            currentAcStatuses: currentAcRunResult,
            currentRemovedIssueIndices,
            nextRemovedIssueIndices,
            rerunPlanOriginalIndices,
            rerunAcOriginalIndices,
            allowPendingOutdated: false,
          });
          // Store rerun indices so Run knows what to check after Enhance
          if (sourceTabId && (Array.isArray(rerunAcOriginalIndices) || Array.isArray(rerunPlanOriginalIndices))) {
            setInteractiveTaskStates((prev) => ({
              ...prev,
              [sourceTabId]: {
                ...(prev[sourceTabId] ?? {}),
                pendingRerunAcOriginalIndices: Array.isArray(rerunAcOriginalIndices) && rerunAcOriginalIndices.length > 0 ? rerunAcOriginalIndices : undefined,
                pendingRerunPlanOriginalIndices: Array.isArray(rerunPlanOriginalIndices) && rerunPlanOriginalIndices.length > 0 ? rerunPlanOriginalIndices : undefined,
              },
            }));
          }
          setGenProgress(1);
          clearSpecDocumentRunRequestForTab(sourceTabId);
          setGenState('done');
        }

        streamEnhancedContentFrame();

        return () => {
          cancelled = true;
          if (genTimerRef.current) {
            clearTimeout(genTimerRef.current);
            genTimerRef.current = null;
          }
        };
      }

      const fullText = serializeSpecDocument(generatedDocument);
      setGenProgress(0);

      let index = 0;
      let cancelled = false;

      function streamChunk() {
        if (cancelled) return;

        if (index < fullText.length) {
          // Larger chunks + tighter cadence for faster visible streaming.
          const chunkSize = Math.floor(Math.random() * 9) + 8;
          index = Math.min(fullText.length, index + chunkSize);
          const chunk = fullText.slice(0, index);

          setIdeTabContents(prev => ({ ...prev, [activeTabIdForGen]: { language: 'markdown', code: chunk } }));
          setGenProgress(index / fullText.length);

          genTimerRef.current = setTimeout(streamChunk, 6 + Math.random() * 10);
          return;
        }

        clearSpecDocumentRunRequestForTab(activeTabIdForGen);
        setGenState('done');
      }

      streamChunk();

      return () => {
        cancelled = true;
        if (genTimerRef.current) {
          clearTimeout(genTimerRef.current);
          genTimerRef.current = null;
        }
      };
    }

    if (genState === 'idle' && generationTabId && activeTabIdForGen) {
      const cancelledDoneEnhanceFlow = doneEnhanceFlowRef.current;
      const restoredCode = cancelledDoneEnhanceFlow?.initialCode ?? '';
      doneEnhanceFlowRef.current = null;
      setIdeTabContents(prev => ({
        ...prev,
        [activeTabIdForGen]: {
          ...(prev[activeTabIdForGen] ?? {}),
          language: 'markdown',
          code: restoredCode,
        },
      }));
      setGenProgress(0);
      setGenerationTabId(null);
    }
  }, [
    activeTabIdForGen,
    genState,
    generatedDocument,
    generationTabId,
    isTerminalStreaming,
    pendingTerminalRun,
    resetDoneComments,
    resetRunUiForTab,
    setRunStateForTab,
    startDoneEnhanceStatusReveal,
    terminalPermissionPrompt,
    updateSpecVersionsForTab,
  ]);

  useEffect(() => {
    if (genState !== 'done' || !activeTabIdForGen) return;
    const serializedDocument = serializeSpecDocument(generatedDocument);
    setIdeTabContents(prev => ({ ...prev, [activeTabIdForGen]: { language: 'markdown', code: serializedDocument } }));
  }, [generatedDocument, genState, activeTabIdForGen]);

  useEffect(() => {
    if (screen !== 'ide' || genState !== 'done') return;

    let rafId = 0;

    rafId = requestAnimationFrame(() => {
      if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body) {
        document.activeElement.blur();
      }

      document.querySelectorAll('.main-window-editor-content .editor').forEach((node) => {
        if (node instanceof HTMLElement) {
          node.classList.remove('editor-caret-visible');
        }
      });
    });

    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [screen, genState]);

  const currentProblemsTab = screen === 'welcome'
    ? null
    : (ideTabs[activeEditorTab ?? 0] ?? null);
  const handleActiveDoneOverlayUiStateChange = useCallback((uiState) => {
    updateDoneOverlayUiStateForTab(uiState, visibleEditorStateTabId);
  }, [updateDoneOverlayUiStateForTab, visibleEditorStateTabId]);
  const handleDoneCommentsChange = useCallback((nextEntries) => {
    const targetTabId = visibleEditorStateTabId;
    if (!targetTabId) return;

    const normalizedNextEntries = Array.isArray(nextEntries) ? nextEntries : [];
    if (doneEnhanceFlowRef.current?.commentsAlreadyCleared) {
      if (
        doneEnhanceFlowRef.current.sourceTabId === targetTabId
        && normalizedNextEntries.length > 0
      ) {
        doneEnhanceFlowRef.current = {
          ...doneEnhanceFlowRef.current,
          commentsAlreadyCleared: false,
        };
      } else {
        return;
      }
    }

    if (suppressDoneCommentsChangeRef.current) {
      if (normalizedNextEntries.length === 0) {
        suppressDoneCommentsChangeRef.current = false;
        if (suppressDoneCommentsChangeTimerRef.current) {
          window.clearTimeout(suppressDoneCommentsChangeTimerRef.current);
          suppressDoneCommentsChangeTimerRef.current = null;
        }
      }
      return;
    }

    setInteractiveTaskStates((prev) => {
      const currentTaskState = prev[targetTabId] ?? getAgentTaskScenario({
        tabId: targetTabId,
        label: ideTabs.find((tab) => tab.id === targetTabId)?.label ?? '',
      }).initialTaskState;
      const mergedNextEntries = mergeCommentEntriesWithExistingDiffAnchors(
        normalizedNextEntries,
        currentTaskState?.commentEntries ?? [],
      );
      const nextSignature = buildSpecVersionCommentEntriesSignature(mergedNextEntries);

      if (buildSpecVersionCommentEntriesSignature(currentTaskState?.commentEntries ?? []) === nextSignature) {
        return prev;
      }

      return {
        ...prev,
        [targetTabId]: {
          ...currentTaskState,
          commentEntries: mergedNextEntries,
        },
      };
    });

    if (targetTabId === activeSourceEditorTabId || targetTabId === generationTabId) {
      setAgentTaskCommentEntries((prev) => {
        const mergedNextEntries = mergeCommentEntriesWithExistingDiffAnchors(normalizedNextEntries, prev);
        const nextSignature = buildSpecVersionCommentEntriesSignature(mergedNextEntries);

        return buildSpecVersionCommentEntriesSignature(prev) === nextSignature
          ? prev
          : mergedNextEntries;
      });
    }
  }, [activeSourceEditorTabId, generationTabId, ideTabs, visibleEditorStateTabId]);
  const activeAgentTaskViewState = useMemo(
    () => (
      activeEditorTabId?.startsWith('agent-task-') && (genState === 'done' || genState === 'idle' || Boolean(doneEnhanceFlowRef.current))
        ? getCommentDrivenViewStateForTaskTab(activeEditorTabId)
        : null
    ),
    [activeEditorTabId, genState, getCommentDrivenViewStateForTaskTab],
  );
  const activeAgentTaskDocumentSections = activeAgentTaskViewState?.documentSections ?? generatedDocument;
  const activeAgentTaskAcRunResult = activeAgentTaskViewState?.acRunResult ?? acRunResult;
  const activeAgentTaskPlanRunResult = activeAgentTaskViewState?.planRunResult ?? planRunResult;
  const activeAgentTaskRemovedIssueIndices = activeAgentTaskViewState?.removedIssueIndices ?? removedIssueIndices;
  const agentTaskPanelRuntimeStates = useMemo(
    () => agentTasks.map((task) => {
      const taskTabId = getAgentTaskTabId(task?.id);
      if (!taskTabId) {
        return {
          ...task,
          taskTabId: null,
          indicator: null,
        };
      }

      const runtimeState = getTaskRuntimeState(taskTabId);
      const viewState = getCommentDrivenViewStateForTaskTab(taskTabId);
      const taskState = runtimeState?.taskState ?? null;
      const documentSections =
        viewState?.documentSections
        ?? taskState?.documentSections
        ?? runtimeState?.scenario?.defaultDocument
        ?? [];
      const planStatuses = viewState?.planRunResult ?? taskState?.planRunResult ?? null;
      const acStatuses = viewState?.acRunResult ?? taskState?.acRunResult ?? null;
      const inspectionSummary = buildInspectionSummary({
        planRunResult: planStatuses,
        acRunResult: acStatuses,
        documentSections,
      });
      const hasWarningIndicator =
        hasChecklistWarningOrError(planStatuses)
        || hasChecklistWarningOrError(acStatuses)
        || inspectionSummary.warningCount > 0
        || inspectionSummary.errorCount > 0;
      const isLoading =
        runStatesByTab[taskTabId] === 'running'
        || taskState?.genState === 'loading'
        || (AGENT_TASK_GENERATING_STATE_ENABLED && taskState?.genState === 'generating');
      const hasSuccessfulRun =
        !hasWarningIndicator
        && (hasChecklistStatuses(planStatuses) || hasChecklistStatuses(acStatuses))
        && (!hasChecklistStatuses(planStatuses) || areAllChecklistStatusesPassed(planStatuses))
        && (!hasChecklistStatuses(acStatuses) || areAllChecklistStatusesPassed(acStatuses));
      const isSuccess =
        !hasWarningIndicator
        && (taskState?.genState === 'done' || hasSuccessfulRun);

      return {
        ...task,
        taskTabId,
        indicator: isLoading
          ? 'loading'
          : hasWarningIndicator
            ? 'warning'
            : isSuccess
              ? 'success'
              : null,
      };
    }),
    [agentTasks, getCommentDrivenViewStateForTaskTab, getTaskRuntimeState, runStatesByTab],
  );
  const hasActiveAgentTaskExecution = useMemo(
    () => agentTaskPanelRuntimeStates.some((task) => task?.indicator === 'loading'),
    [agentTaskPanelRuntimeStates],
  );
  const agentTaskPanelTasks = useMemo(
    () => agentTaskPanelRuntimeStates.map((task) => ({
      ...task,
      time:
        resolveAgentTaskExecutionTimeLabel(
          task?.taskTabId ? agentTaskExecutionTimings[task.taskTabId] : null,
          agentTaskTimeTick,
        )
        || task.time
        || '',
    })),
    [agentTaskExecutionTimings, agentTaskPanelRuntimeStates, agentTaskTimeTick],
  );
  const navigatedAgentTaskId = useMemo(
    () => getAgentTaskIdForEditorTab(currentProblemsTab, agentTasks),
    [agentTasks, currentProblemsTab],
  );
  const activeAgentTaskPanelSelectionId = navigatedAgentTaskId ?? selectedTask ?? agentTaskPanelTasks[0]?.id ?? null;
  const agentTaskPlanTreesByTaskId = useMemo(() => (
    agentTaskPanelTasks.reduce((nextTrees, task) => {
      if (!task?.id) return nextTrees;

      const sourceTabId = task?.taskTabId ?? getAgentTaskTabId(task.id);
      if (!sourceTabId) return nextTrees;

      const viewState = getCommentDrivenViewStateForTaskTab(sourceTabId);
      const runtimeState = getTaskRuntimeState(sourceTabId);
      const resolvedPlanRunResult =
        viewState?.planRunResult
        ?? runtimeState?.taskState?.planRunResult
        ?? null;
      const shouldShowPlanTree =
        runtimeState?.taskState?.genState === 'done'
        && Array.isArray(resolvedPlanRunResult)
        && resolvedPlanRunResult.length > 0;

      if (!shouldShowPlanTree) {
        return nextTrees;
      }

      nextTrees[task.id] = buildAgentTaskPlanTreeModel({
        task,
        sourceTabId,
        sourceCode: viewState?.code ?? runtimeState?.baseCode ?? '',
        documentSections:
          viewState?.documentSections
          ?? runtimeState?.taskState?.documentSections
          ?? runtimeState?.scenario?.defaultDocument
          ?? [],
        planRunResult: resolvedPlanRunResult,
        removedIssueIndices:
          viewState?.removedIssueIndices
          ?? runtimeState?.taskState?.removedIssueIndices
          ?? null,
      });

      return nextTrees;
    }, {})
  ), [
    agentTaskPanelTasks,
    getCommentDrivenViewStateForTaskTab,
    getTaskRuntimeState,
  ]);
  const handleAgentTaskPlanTreeNodeSelect = useCallback((taskId, nodeId) => {
    const navigationEntry = agentTaskPlanTreesByTaskId?.[taskId]?.navigationByNodeId?.[nodeId] ?? null;
    if (!navigationEntry) return;

    openPlanDiffTab({
      text: navigationEntry.text,
      statusItem: navigationEntry.statusItem,
      issueTarget: navigationEntry.issueTarget,
      source: {
        taskId: navigationEntry.taskId,
        tabId: navigationEntry.sourceTabId,
        label: navigationEntry.sourceLabel,
      },
      navigation: {
        activeRowId: navigationEntry.activeRowId,
      },
    });
  }, [agentTaskPlanTreesByTaskId, openPlanDiffTab]);
  useEffect(() => {
    const now = Date.now();

    setAgentTaskExecutionTimings((prev) => {
      let didChange = false;
      const next = { ...prev };

      agentTaskPanelRuntimeStates.forEach((task) => {
        const taskTabId = task?.taskTabId;
        if (!taskTabId) return;

        const currentTiming = next[taskTabId] ?? createAgentTaskExecutionTiming();
        const isActive = task.indicator === 'loading';

        if (isActive && !Number.isFinite(currentTiming.activeStartedAt)) {
          next[taskTabId] = {
            ...currentTiming,
            activeStartedAt: now,
          };
          didChange = true;
          return;
        }

        if (!isActive && Number.isFinite(currentTiming.activeStartedAt)) {
          next[taskTabId] = {
            ...currentTiming,
            activeStartedAt: null,
            lastDurationMs: Math.max(1000, now - currentTiming.activeStartedAt),
          };
          didChange = true;
        }
      });

      return didChange ? next : prev;
    });
  }, [agentTaskPanelRuntimeStates]);
  useEffect(() => {
    if (!hasActiveAgentTaskExecution) return undefined;

    setAgentTaskTimeTick(Date.now());
    const intervalId = window.setInterval(() => {
      setAgentTaskTimeTick(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [hasActiveAgentTaskExecution]);
  useEffect(() => {
    setDismissedAgentTaskSuccessIds((prev) => {
      const activeDoneTaskIds = new Set(
        agentTaskPanelTasks
          .filter((task) => task?.indicator === 'success')
          .map((task) => task.id)
      );
      const next = prev.filter((taskId) => activeDoneTaskIds.has(taskId));
      return next.length === prev.length ? prev : next;
    });
  }, [agentTaskPanelTasks]);
  const agentTaskInspectionSummary = buildInspectionSummary({
    planRunResult: activeAgentTaskPlanRunResult,
    acRunResult: activeAgentTaskAcRunResult,
    documentSections: activeAgentTaskDocumentSections,
  });
  const currentAgentTaskLabel = ideTabs[activeEditorTab ?? 0]?.label ?? TERMINAL_TASK_TAB_BASE_LABEL;
  const activeDoneSourceTabId = generationTabId ?? activeEditorTabId;
  const activeDoneDisplayCode = activeAgentTaskViewState?.code
    ?? (activeDoneSourceTabId ? (ideTabContents[activeDoneSourceTabId]?.code ?? '') : '');
  const hasLocalTerminalTabs = terminalTabsState.length > 0;
  const activeLocalTerminalTabIndex = hasLocalTerminalTabs
    ? Math.max(terminalTabsState.findIndex((tab) => tab.id === activeTerminalTabId), 0)
    : 0;
  const resolvedLocalTerminalTabId = hasLocalTerminalTabs
    ? (terminalTabsState[activeLocalTerminalTabIndex]?.id ?? null)
    : null;
  const activeTerminalSession = resolvedLocalTerminalTabId
    ? (terminalSessions[resolvedLocalTerminalTabId] ?? null)
    : null;
  const visibleTerminalBlocks = hasLocalTerminalTabs ? (activeTerminalSession?.blocks ?? []) : terminalBlocks;
  const visibleTerminalViewKey = hasLocalTerminalTabs ? (activeTerminalSession?.viewKey ?? 0) : terminalViewKey;
  const visibleTerminalIsStreaming = hasLocalTerminalTabs ? Boolean(activeTerminalSession?.isStreaming) : isTerminalStreaming;
  const visiblePendingTerminalRun = hasLocalTerminalTabs ? (activeTerminalSession?.pendingRun ?? null) : pendingTerminalRun;
  const visibleTerminalPermissionPrompt = hasLocalTerminalTabs ? (activeTerminalSession?.permissionPrompt ?? null) : terminalPermissionPrompt;
  const visibleAcWarningBanner = hasLocalTerminalTabs ? (activeTerminalSession?.acWarningBanner ?? null) : acWarningBanner;
  const handleTerminalTabChange = useCallback((nextIndex) => {
    const nextTab = terminalTabsState[nextIndex];
    if (!nextTab) return;
    setActiveTerminalTabId(nextTab.id);
  }, [terminalTabsState]);
  const handleTerminalTabClose = useCallback((indexToClose) => {
    if (!Number.isInteger(indexToClose) || indexToClose < 0 || indexToClose >= terminalTabsState.length) {
      return;
    }

    const closingTab = terminalTabsState[indexToClose];
    if (!closingTab) return;

    const nextTabs = terminalTabsState.filter((_, index) => index !== indexToClose);
    const nextActiveTabId = activeTerminalTabId === closingTab.id
      ? (nextTabs[Math.max(0, Math.min(indexToClose, nextTabs.length - 1))]?.id ?? null)
      : activeTerminalTabId;

    if (currentTerminalRunTabIdRef.current === closingTab.id) {
      const closingSourceTabId = terminalSessions[closingTab.id]?.sourceTabId ?? null;
      clearTerminalRunAnimation();
      setPendingTerminalRunForTab(null, closingTab.id);
      setTerminalPermissionPromptForTab(null, closingTab.id);
      setAcWarningBannerForTab(null, closingTab.id);
      currentTerminalRunTabIdRef.current = null;
      setRunStateForTab('default', closingSourceTabId);
      if (currentRunSourceTabIdRef.current === closingSourceTabId) {
        currentRunSourceTabIdRef.current = null;
      }
    }

    setTerminalTabsState(nextTabs);
    setActiveTerminalTabId(nextActiveTabId);
    setTerminalSessions((prev) => {
      if (!(closingTab.id in prev)) return prev;
      const { [closingTab.id]: _removedSession, ...rest } = prev;
      return rest;
    });
  }, [
    activeTerminalTabId,
    clearTerminalRunAnimation,
    setAcWarningBannerForTab,
    setPendingTerminalRunForTab,
    setRunStateForTab,
    setTerminalPermissionPromptForTab,
    terminalSessions,
    terminalTabsState,
  ]);
  const handleTerminalTabAdd = useCallback(() => {
    const meta = resolveTerminalSessionMeta();
    ensureTerminalSession(meta);
  }, [ensureTerminalSession, resolveTerminalSessionMeta]);
  const editorTabsMorePortal = editorTabsHost ? createPortal(
    <div className="editor-tabs-more-slot">
      <IconButton
        icon="general/moreVertical"
        aria-label="More"
        className="editor-tabs-more-button"
      />
    </div>,
        editorTabsHost
  ) : null;
  const terminalOutputHost = typeof document !== 'undefined'
    ? document.querySelector('.main-window .terminal-window .terminal-output-area')
    : null;
  const terminalPermissionPortal =
    visibleTerminalPermissionPrompt && terminalOutputHost instanceof HTMLElement
      ? createPortal(
          <TerminalPermissionPrompt
            question={visibleTerminalPermissionPrompt.question}
            options={visibleTerminalPermissionPrompt.options}
            selectedIdx={visibleTerminalPermissionPrompt.selectedIdx}
            onMoveSelection={moveTerminalPermissionSelection}
            onSelect={handleTerminalPermissionSelect}
            onHover={hoverTerminalPermissionSelection}
          />,
          terminalOutputHost
        )
      : null;

  useEffect(() => {
    const isDoneAgentTaskTab =
      currentProblemsTab?.id?.startsWith('agent-task-') &&
      (genState === 'done' || genState === 'idle');

    if (isDoneAgentTaskTab) return;

    setHighlightedProblemLocation(null);
  }, [currentProblemsTab?.id, genState]);

  const commitDoneSpecUpdate = useCallback((options = {}) => {
    const pendingDoneSpecState = buildPendingDoneSpecState(options);
    const sourceTabId = pendingDoneSpecState?.sourceTabId ?? generationTabId ?? activeEditorTabId;
    if (!sourceTabId || !pendingDoneSpecState) {
      return {
        didCommit: false,
        sourceTabId,
      };
    }

    const {
      currentCode,
      targetCode: nextCode,
      nextDocument,
      nextAppliedIssueFixes,
      nextRemovedIssueIndices,
      nextAcRunResult,
      nextPlanRunResult,
      currentAcRunResult,
      currentPlanRunResult,
      currentRemovedIssueIndices,
      rerunAcOriginalIndices,
      rerunPlanOriginalIndices,
      pendingCommentEntriesSnapshot,
      hasPendingReruns,
      hasSpecChanges,
      hasPendingComments,
    } = pendingDoneSpecState;
    const normalizedRunSectionTitle = typeof options?.runSectionTitle === 'string'
      ? options.runSectionTitle.trim().toLowerCase()
      : '';
    const normalizedRunTarget = normalizeCommentTarget(options?.runTarget);
    const allVisibleAcOriginalIndices = getVisibleIssueOriginalIndices('ac', nextRemovedIssueIndices);
    const allVisiblePlanOriginalIndices = getVisibleIssueOriginalIndices('plan', nextRemovedIssueIndices);
    let requestAcRerunOriginalIndices = [];
    let requestPlanRerunOriginalIndices = [];
    let seededAcRerunOriginalIndices = rerunAcOriginalIndices;
    let seededPlanRerunOriginalIndices = rerunPlanOriginalIndices;

    if (normalizedRunTarget?.kind === 'ac') {
      requestAcRerunOriginalIndices = [normalizedRunTarget.index];
      seededAcRerunOriginalIndices = mergeOriginalIssueIndices(rerunAcOriginalIndices, requestAcRerunOriginalIndices);
    } else if (normalizedRunTarget?.kind === 'plan') {
      requestPlanRerunOriginalIndices = [normalizedRunTarget.index];
      requestAcRerunOriginalIndices = allVisibleAcOriginalIndices;
      seededPlanRerunOriginalIndices = mergeOriginalIssueIndices(rerunPlanOriginalIndices, allVisiblePlanOriginalIndices);
      seededAcRerunOriginalIndices = mergeOriginalIssueIndices(rerunAcOriginalIndices, allVisibleAcOriginalIndices);
    } else if (normalizedRunSectionTitle === 'acceptance criteria') {
      requestAcRerunOriginalIndices = allVisibleAcOriginalIndices;
      seededAcRerunOriginalIndices = mergeOriginalIssueIndices(rerunAcOriginalIndices, allVisibleAcOriginalIndices);
    } else if (normalizedRunSectionTitle === 'plan') {
      requestAcRerunOriginalIndices = allVisibleAcOriginalIndices;
      requestPlanRerunOriginalIndices = allVisiblePlanOriginalIndices;
      seededAcRerunOriginalIndices = mergeOriginalIssueIndices(rerunAcOriginalIndices, allVisibleAcOriginalIndices);
      seededPlanRerunOriginalIndices = mergeOriginalIssueIndices(rerunPlanOriginalIndices, allVisiblePlanOriginalIndices);
    }
    const committedAcRunResult = buildRunStatusesRevealSeed({
      kind: 'ac',
      currentStatuses: currentAcRunResult,
      nextStatuses: nextAcRunResult,
      currentRemovedIssueIndices,
      nextRemovedIssueIndices,
      rerunOriginalIndices: seededAcRerunOriginalIndices,
    });
    const committedPlanRunResult = normalizedRunTarget?.kind === 'plan'
      ? buildRunStatusesSeedWithPendingOriginalIndices({
          kind: 'plan',
          currentStatuses: currentPlanRunResult,
          nextStatuses: nextPlanRunResult,
          currentRemovedIssueIndices,
          nextRemovedIssueIndices,
          rerunOriginalIndices: seededPlanRerunOriginalIndices,
          pendingOriginalIndices: [normalizedRunTarget.index],
        })
      : buildRunStatusesRevealSeed({
          kind: 'plan',
          currentStatuses: currentPlanRunResult,
          nextStatuses: nextPlanRunResult,
          currentRemovedIssueIndices,
          nextRemovedIssueIndices,
          rerunOriginalIndices: seededPlanRerunOriginalIndices,
        });
    const shouldApplyContentChanges = hasSpecChanges || hasPendingComments;
    const shouldApplyStatusSeed =
      normalizedRunSectionTitle.length > 0
      || !areComparableValuesEqual(currentAcRunResult, committedAcRunResult)
      || !areComparableValuesEqual(currentPlanRunResult, committedPlanRunResult);
    const terminalTabId = buildTerminalSessionTabId(sourceTabId);

    if (shouldApplyContentChanges) {
      setIdeTabContents((prev) => ({
        ...prev,
        [sourceTabId]: {
          ...(prev[sourceTabId] ?? {}),
          language: 'markdown',
          code: nextCode,
        },
      }));
      setGeneratedDocument(nextDocument);
      setAppliedIssueFixes(cloneIssueStateMap(nextAppliedIssueFixes));
      setRemovedIssueIndices(cloneIssueStateMap(nextRemovedIssueIndices));
      if (options?.applyPendingComments !== false) {
        resetDoneComments();
      }
      if (hasSpecChanges) {
        updateSpecVersionsForTab((prevHistory) => appendSpecVersionHistoryEntry(prevHistory, {
          currentCode,
          nextCode,
          currentCommentEntries: pendingCommentEntriesSnapshot,
        }), sourceTabId);
      }
    }

    if (shouldApplyStatusSeed) {
      setAcRunResult(committedAcRunResult);
      setPlanRunResult(committedPlanRunResult);
      setAcWarningBannerForTab(null, terminalTabId);
      setPendingTerminalRunForTab(null, terminalTabId);
      setTerminalPermissionPromptForTab(null, terminalTabId);
      setRunStateForTab('default', sourceTabId);
      currentRunSourceTabIdRef.current = null;
    }

    return {
      didCommit: shouldApplyContentChanges || shouldApplyStatusSeed,
      sourceTabId,
      nextAcRunResult,
      nextPlanRunResult,
      committedAcRunResult,
      committedPlanRunResult,
      currentAcRunResult,
      currentPlanRunResult,
      currentRemovedIssueIndices,
      nextRemovedIssueIndices,
      rerunAcOriginalIndices: requestAcRerunOriginalIndices,
      rerunPlanOriginalIndices: requestPlanRerunOriginalIndices,
      hasPendingReruns,
    };
  }, [
    activeEditorTabId,
    buildPendingDoneSpecState,
    generationTabId,
    resetDoneComments,
    setAcWarningBannerForTab,
    setPendingTerminalRunForTab,
    setRunStateForTab,
    setTerminalPermissionPromptForTab,
    updateSpecVersionsForTab,
  ]);

  const handleDoneOpenTerminal = (input) => {
    ensureSpecStatusChat('Build', { select: true });
    const runTarget = normalizeCommentTarget(typeof input === 'object' ? input?.runTarget ?? input?.checkTarget : null);
    const sectionTitle = typeof input === 'string'
      ? input
      : (input?.sectionTitle
          ?? (runTarget?.kind === 'ac'
            ? 'Acceptance Criteria'
            : runTarget?.kind === 'plan'
              ? 'Plan'
              : null));
    const resolvedRunSectionTitle = typeof sectionTitle === 'string' && sectionTitle.trim().length > 0
      ? sectionTitle
      : 'Plan';
    const commitResult = commitDoneSpecUpdate({
      applyPendingComments: false,
      runSectionTitle: resolvedRunSectionTitle,
      runTarget,
    });
    const sourceTabId = commitResult?.sourceTabId ?? generationTabId ?? activeEditorTabId;
    const terminalTabId = sourceTabId ? buildTerminalSessionTabId(sourceTabId) : null;
    const taskState = sourceTabId ? interactiveTaskStates[sourceTabId] : null;
    const initialAcRunResult =
      commitResult?.committedAcRunResult
      ?? activeAgentTaskAcRunResult
      ?? null;
    const initialPlanRunResult =
      commitResult?.committedPlanRunResult
      ?? activeAgentTaskPlanRunResult
      ?? null;
    if (terminalTabId) {
      setAcWarningBannerForTab(null, terminalTabId);
    }

    if (sourceTabId && (taskState?.pendingRerunAcOriginalIndices || taskState?.pendingRerunPlanOriginalIndices)) {
      setInteractiveTaskStates((prev) => ({
        ...prev,
        [sourceTabId]: {
          ...(prev[sourceTabId] ?? {}),
          pendingRerunAcOriginalIndices: undefined,
          pendingRerunPlanOriginalIndices: undefined,
        },
      }));
    }

    queueTerminalRun({
      mode: 'section',
      sourceTabId,
      sectionTitle,
      checkTarget: runTarget,
      taskLabel: currentAgentTaskLabel,
      initialAcRunResult,
      initialPlanRunResult,
      rerunAcOriginalIndices: commitResult?.rerunAcOriginalIndices ?? [],
      rerunPlanOriginalIndices: commitResult?.rerunPlanOriginalIndices ?? [],
    }, {
      preserveAcRunResult: true,
      preservePlanRunResult: true,
    });
  };

  function renderBottomPanelContent(id, ctx) {
    const patchedCtx = id === 'terminal' ? {
      ...ctx,
      setShowBottomPanel: (show) => {
        if (!show) setRunStateForTab('default');
        ctx.setShowBottomPanel(show);
      },
    } : ctx;
    const panel = defaultBottomPanelContent(id, patchedCtx);
    if (!isValidElement(panel)) return panel;
    if (id === 'terminal') {
      const terminalTabs = hasLocalTerminalTabs
        ? buildTerminalTaskTabs(terminalTabsState)
        : buildTerminalTaskTabs(ctx.terminalTabs);
      const terminalInput = visibleTerminalIsStreaming || visiblePendingTerminalRun || visibleTerminalPermissionPrompt
        ? null
        : TERMINAL_RUN_INPUT;
      return cloneElement(panel, {
        key: hasLocalTerminalTabs
          ? `terminal-view-${resolvedLocalTerminalTabId ?? 'default'}-${visibleTerminalViewKey}`
          : `terminal-view-${terminalViewKey}`,
        tabs: terminalTabs,
        activeTab: hasLocalTerminalTabs ? activeLocalTerminalTabIndex : ctx.activeTerminalTab,
        onTabChange: hasLocalTerminalTabs ? handleTerminalTabChange : ctx.setActiveTerminalTab,
        onTabAdd: hasLocalTerminalTabs ? handleTerminalTabAdd : ctx.handleTerminalTabAdd,
        onTabClose: hasLocalTerminalTabs ? handleTerminalTabClose : ctx.handleTerminalTabClose,
        blocks: visibleTerminalBlocks,
        input: terminalInput,
        className: [
          visibleTerminalIsStreaming ? 'terminal-window-streaming' : '',
          visibleTerminalPermissionPrompt ? 'terminal-window-awaiting-permission' : '',
        ].filter(Boolean).join(' ') || undefined,
      });
    }
    if (id === 'problems') {
      const currentProblemsTabContent = currentProblemsTab?.id
        ? ideTabContents[currentProblemsTab.id]
        : null;
      const isCurrentProblemsDiff = Boolean(currentProblemsTabContent?.diffData);
      const isCurrentProblemsPlainFile = !isCurrentProblemsDiff && Boolean(currentProblemsTabContent?.plainFileData);

      if (isCurrentProblemsDiff) {
        problemsTreeNodesByDisplayRef.current = new Map();
        return cloneElement(panel, {
          className: [
            panel.props?.className ?? '',
            'problems-window',
          ].filter(Boolean).join(' '),
          empty: true,
          emptyText: 'No problems in diff',
          treeData: [],
          onNodeSelect: handleProblemsNodeSelect,
        });
      }

      const isCurrentProblemsMd =
        currentProblemsTab?.id?.startsWith('agent-task-') || currentProblemsTab?.label?.endsWith('.md');
      const currentProblemsCommentEntries = isCurrentProblemsMd
        ? getCommentEntriesForTaskTab(currentProblemsTab?.id)
        : [];
      const currentProblemsDocumentEntryCommentIssues = isCurrentProblemsPlainFile
        ? buildDocumentEntryCommentIssuesForTab(
            currentProblemsTab?.id,
            ideTabs
              .filter((tab) => tab?.id?.startsWith('agent-task-') || tab?.label?.endsWith('.md'))
              .map((tab) => getCommentEntriesForTaskTab(tab.id)),
          )
        : [];
      const relatedDiffCommentIssues = isCurrentProblemsMd
        ? buildDocumentRelatedCommentIssuesFromDiffTabs(ideTabContents, ideTabs)
        : (isCurrentProblemsPlainFile
            ? mergeCommentIssuesBySourceKey(
                buildCommentIssuesForFileTab(currentProblemsTab?.id, currentProblemsTabContent, ideTabs),
                currentProblemsDocumentEntryCommentIssues,
              )
            : []);
      const problemsTreeData = buildProblemsTreeForTab(
        currentProblemsTab,
        isCurrentProblemsMd ? agentTaskInspectionSummary.issues : null,
        currentProblemsCommentEntries,
        relatedDiffCommentIssues
      );
      problemsTreeNodesByDisplayRef.current = collectProblemsTreeNodesByDisplay(problemsTreeData);

      return cloneElement(panel, {
        className: [
          panel.props?.className ?? '',
          'problems-window',
        ].filter(Boolean).join(' '),
        treeData: problemsTreeData,
        onNodeSelect: handleProblemsNodeSelect,
      });
    }
    return panel;
  }

  // These useMemo hooks must be declared before any early return to satisfy
  // the Rules of Hooks (hook call order must be identical across renders).
  const activePlanDiffSourceTabIdForMemo = (() => {
    if (screen === 'welcome') return null;
    const tabId = (activeEditorTabMeta?.id ?? null);
    const tabContent = activeEditorTabContentEntry;
    const isDiff = Boolean(tabContent?.diffData);
    return isDiff ? (tabContent?.diffSourceTabId ?? (activeSourceEditorTabId)) : null;
  })();
  const activePlanDiffSourceViewState = useMemo(
    () => (
      activePlanDiffSourceTabIdForMemo
        ? getCommentDrivenViewStateForTaskTab(activePlanDiffSourceTabIdForMemo)
        : null
    ),
    [activePlanDiffSourceTabIdForMemo, getCommentDrivenViewStateForTaskTab],
  );
  const activePlanDiffDataForMemo = (() => {
    if (screen === 'welcome') return null;
    const tabContent = activeEditorTabContentEntry;
    const isDiff = Boolean(tabContent?.diffData);
    return isDiff ? (tabContent?.diffData ?? null) : null;
  })();
  const activePlanDiffTargetForMemo = (() => {
    if (screen === 'welcome') return null;
    const tabContent = activeEditorTabContentEntry;
    const isDiff = Boolean(tabContent?.diffData);
    return isDiff ? normalizeCommentTarget(tabContent?.diffTarget) : null;
  })();
  const activePlanDiffViewerData = useMemo(
    () => buildPlanDiffViewerData({
      documentSections: activePlanDiffSourceViewState?.documentSections ?? [],
      planRunResult: activePlanDiffSourceViewState?.planRunResult ?? null,
      removedIssueIndices: activePlanDiffSourceViewState?.removedIssueIndices ?? null,
      diffData: activePlanDiffDataForMemo,
      diffTarget: activePlanDiffTargetForMemo,
    }),
    [activePlanDiffDataForMemo, activePlanDiffSourceViewState, activePlanDiffTargetForMemo],
  );
  const activeTabId = activeEditorTabMeta?.id ?? null;
  const activeTabContent = activeEditorTabContentEntry;
  const isAiuxNewSessionTab = activeTabId === AIUX_NEW_SESSION_TAB_ID;
  const isAgentTaskTab = activeTabId?.startsWith('agent-task-');
  const isAiChatTab = activeTabId?.startsWith('ai-chat-');
  const activeAiChatTabChatId = isAiChatTab ? activeTabId.slice('ai-chat-'.length) : null;
  const chatHistoryActiveSpecId = isAiChatTab ? null : selectedTask;
  const isDiffTab = Boolean(activeTabContent?.diffData);
  const isPlainFileOverlayTab = !isDiffTab && Boolean(activeTabContent?.plainFileData);
  const activeAgentTaskCode = activeAgentTaskViewState?.code ?? activeTabContent?.code ?? '';
  const activeAgentTaskCommentEntries = visibleEditorStateTabId
    ? getCommentEntriesForTaskTab(visibleEditorStateTabId)
    : [];
  const normalizedSpecChatCommentEntries = useMemo(
    () => normalizeSpecVersionCommentEntries(activeAgentTaskCommentEntries),
    [activeAgentTaskCommentEntries],
  );
  const activeRelatedDiffCommentIssues = useMemo(
    () => buildDocumentRelatedCommentIssuesFromDiffTabs(ideTabContents, ideTabs),
    [ideTabContents, ideTabs],
  );
  const specChatCommentCount = useMemo(
    () => getAggregatedCommentIssueCount(normalizedSpecChatCommentEntries, activeRelatedDiffCommentIssues),
    [activeRelatedDiffCommentIssues, normalizedSpecChatCommentEntries],
  );
  const resolveSpecStatusSourceTabId = useCallback((tabId = null) => (
    tabId ?? visibleEditorStateTabId ?? activeEditorTabId ?? 'agent-task-t1'
  ), [activeEditorTabId, visibleEditorStateTabId]);
  const getSpecStatusChatKey = useCallback((status, tabId = null) => (
    `${resolveSpecStatusSourceTabId(tabId)}:${status}`
  ), [resolveSpecStatusSourceTabId]);
  const getSpecStatusChatId = useCallback((status, tabId = null) => {
    const sourceTabId = resolveSpecStatusSourceTabId(tabId);
    return `spec-chat-${sourceTabId}-${String(status).toLowerCase()}`;
  }, [resolveSpecStatusSourceTabId]);
  const buildSpecStatusAttachment = useCallback((status, tabId = null) => {
    const sourceTabId = resolveSpecStatusSourceTabId(tabId);
    const tabMeta = ideTabs.find((tab) => tab.id === sourceTabId) ?? null;
    const commentEntries = normalizeSpecVersionCommentEntries(getCommentEntriesForTaskTab(sourceTabId));
    const relatedCommentIssues = sourceTabId === visibleEditorStateTabId
      ? activeRelatedDiffCommentIssues
      : [];
    const commentCount = getAggregatedCommentIssueCount(commentEntries, relatedCommentIssues);

    return {
      id: `sdd-document-${sourceTabId}-${String(status).toLowerCase()}`,
      sourceTabId,
      label: tabMeta?.label ?? currentAgentTaskLabel ?? TERMINAL_TASK_TAB_BASE_LABEL,
      icon: tabMeta?.icon ?? 'fileTypes/markdown',
      commentCount,
      diffComments: null,
      diffRequest: null,
      diffTabId: null,
      isPlainFile: false,
      isSddDocument: true,
      isSddCommentAttachment: commentCount > 0,
      sddCommentEntries: commentEntries,
    };
  }, [activeRelatedDiffCommentIssues, currentAgentTaskLabel, getCommentEntriesForTaskTab, ideTabs, resolveSpecStatusSourceTabId, visibleEditorStateTabId]);
  const getSpecStatusChatTitle = useCallback((status, tabId = null) => {
    const sourceTabId = resolveSpecStatusSourceTabId(tabId);
    const tabMeta = ideTabs.find((tab) => tab.id === sourceTabId) ?? null;
    const tabCode = sourceTabId === visibleEditorStateTabId
      ? activeAgentTaskCode
      : (getCommentDrivenViewStateForTaskTab(sourceTabId)?.code ?? ideTabContents[sourceTabId]?.code ?? '');
    const baseTitle = extractGoalTitleFromMarkdown(tabCode) || tabMeta?.label || currentAgentTaskLabel || TERMINAL_TASK_TAB_BASE_LABEL;
    return `${status}: ${baseTitle.replace(/^(Generated|Build|Specified|Specify):\s*/u, '').trim()}`;
  }, [activeAgentTaskCode, currentAgentTaskLabel, getCommentDrivenViewStateForTaskTab, ideTabContents, ideTabs, resolveSpecStatusSourceTabId, visibleEditorStateTabId]);
  const buildSpecStatusChatContent = useCallback((status, attachment) => {
    const label = attachment?.label ?? currentAgentTaskLabel ?? TERMINAL_TASK_TAB_BASE_LABEL;

    if (status === 'Build') {
      return {
        emptyState: false,
        userPrompt: `Build ${label} and run the checks defined by this specification.`,
        assistantParagraphs: [
          `I loaded ${label} as the source specification for this Build chat.`,
          'The build context is scoped to the attached MD document, including any unresolved document comments that are currently attached to it.',
          'I will use the specification plan and acceptance criteria as the execution target before reporting the result back here.',
        ],
        result: [
          `${label} is attached as the active SDD document for this chat.`,
          'Build actions from this chat will use that document context.',
        ],
        command: `agent run "${label}" --section "Plan"`,
      };
    }

    if (status === 'Specified') {
      return {
        emptyState: false,
        userPrompt: `Specify ${label} using the current MD document as context.`,
        assistantParagraphs: [
          `I loaded ${label} as the source specification for this Specified chat.`,
          'The chat is tied to the attached MD document, so specification updates and related comments are evaluated against that document context.',
          'I will use the current document structure to refine the plan, acceptance criteria, and implementation notes.',
        ],
        result: [
          `${label} is attached as the active SDD document for this chat.`,
          'Specify actions from this chat will keep using that document context.',
        ],
        command: `agent run "${label}" --specify`,
      };
    }

    return {
      emptyState: false,
      userPrompt: `Open ${label}`,
      assistantParagraphs: [`I loaded ${label} as the source document for this chat.`],
      result: [`${label} is attached as context.`],
      command: `agent open "${label}" --context`,
    };
  }, [currentAgentTaskLabel]);
  const ensureSpecStatusChat = useCallback((status, { select = false, sourceTabId = null } = {}) => {
    if (!status) return null;

    const key = getSpecStatusChatKey(status, sourceTabId);
    const stableChatId = getSpecStatusChatId(status, sourceTabId);
    const existingChatId = specStatusChatIdsRef.current[key] ?? stableChatId;
    specStatusChatIdsRef.current[key] = stableChatId;
    const attachment = buildSpecStatusAttachment(status, sourceTabId);
    const title = getSpecStatusChatTitle(status, sourceTabId)
    const chatContent = buildSpecStatusChatContent(status, attachment);
    const specChildren = addSpecLinkToChatChildren([], {
      id: attachment.sourceTabId,
      label: attachment.label,
    });

    if (aiChatDraftSessionsById[existingChatId]) {
      setAiChatDraftSessionsById((prev) => {
        const existingSession = prev[existingChatId];
        if (
          existingSession?.title === title
          && existingSession?.attachmentLabel === attachment.label
          && existingSession?.emptyState === chatContent.emptyState
          && existingSession?.userPrompt === chatContent.userPrompt
          && JSON.stringify(existingSession?.assistantParagraphs ?? []) === JSON.stringify(chatContent.assistantParagraphs)
          && JSON.stringify(existingSession?.result ?? []) === JSON.stringify(chatContent.result)
          && existingSession?.command === chatContent.command
          && existingSession?.showAttachmentsInComposer === true
          && JSON.stringify(existingSession?.attachments ?? []) === JSON.stringify([attachment])
          && JSON.stringify(existingSession?.children ?? []) === JSON.stringify(specChildren)
        ) {
          return prev;
        }

        return {
          ...prev,
          [existingChatId]: {
            ...existingSession,
            title,
            attachmentLabel: attachment.label,
            ...chatContent,
            showAttachmentsInComposer: true,
            attachments: [attachment],
            children: specChildren,
          },
        };
      });
      if (select) {
        setSelectedAiChatId(existingChatId);
      }
      return existingChatId;
    }

    const statusCreatedAt = {
      Build: 2,
      Specified: 3,
    }[status] ?? 0;
    const session = createEmptyAiChatSession({
      id: stableChatId,
      createdAt: statusCreatedAt,
      title,
      attachmentLabel: attachment.label,
      attachments: [attachment],
      children: specChildren,
      ...chatContent,
      showAttachmentsInComposer: true,
      icon: 'claude',
      select,
    });
    return session.id;
  }, [
    aiChatDraftSessionsById,
    buildSpecStatusChatContent,
    buildSpecStatusAttachment,
    createEmptyAiChatSession,
    getSpecStatusChatId,
    getSpecStatusChatKey,
    getSpecStatusChatTitle,
  ]);
  useEffect(() => {
    if (!isAgentTaskTab || genState !== 'done') return;

    const suppress = suppressNextSpecAutoChatRef.current;
    suppressNextSpecAutoChatRef.current = false;

    const specifiedKey = getSpecStatusChatKey('Specified');
    const shouldSelectSpecifiedChat = !suppress && (!specStatusChatIdsRef.current[specifiedKey]
      || (typeof selectedAiChatId === 'string' && selectedAiChatId.endsWith('-generated')));
    ensureSpecStatusChat('Specified', { select: shouldSelectSpecifiedChat });
    ensureSpecStatusChat('Build', { select: false });
    Object.keys(specStatusChatIdsRef.current).forEach((key) => {
      if (!key.endsWith(':Generated')) return;
      delete specStatusChatIdsRef.current[key];
    });
  }, [ensureSpecStatusChat, genState, getSpecStatusChatKey, isAgentTaskTab, selectedAiChatId]);
  useEffect(() => {
    if (!isAgentTaskTab || genState !== 'done') return;

    setAiChatDraftSessionsById((prev) => {
      let didChange = false;
      const next = { ...prev };

      Object.keys(next).forEach((chatId) => {
        if (!chatId.endsWith('-generated')) return;
        delete next[chatId];
        didChange = true;
      });

      ['Specified', 'Build'].forEach((status) => {
        const chatId = specStatusChatIdsRef.current[getSpecStatusChatKey(status)];
        const existingSession = chatId ? next[chatId] : null;
        if (!existingSession) return;

        const attachment = buildSpecStatusAttachment(status);
        const title = getSpecStatusChatTitle(status);
        const chatContent = buildSpecStatusChatContent(status, attachment);
        const specChildren = addSpecLinkToChatChildren([], {
          id: attachment.sourceTabId,
          label: attachment.label,
        });
        if (
          existingSession.title === title
          && existingSession.attachmentLabel === attachment.label
          && existingSession.emptyState === chatContent.emptyState
          && existingSession.userPrompt === chatContent.userPrompt
          && JSON.stringify(existingSession.assistantParagraphs ?? []) === JSON.stringify(chatContent.assistantParagraphs)
          && JSON.stringify(existingSession.result ?? []) === JSON.stringify(chatContent.result)
          && existingSession.command === chatContent.command
          && existingSession.showAttachmentsInComposer === true
          && JSON.stringify(existingSession.attachments ?? []) === JSON.stringify([attachment])
          && JSON.stringify(existingSession.children ?? []) === JSON.stringify(specChildren)
        ) {
          return;
        }

        next[chatId] = {
          ...existingSession,
          title,
          attachmentLabel: attachment.label,
          ...chatContent,
          showAttachmentsInComposer: true,
          attachments: [attachment],
          children: specChildren,
        };
        didChange = true;
      });

      return didChange ? next : prev;
    });
  }, [
    buildSpecStatusChatContent,
    buildSpecStatusAttachment,
    genState,
    getSpecStatusChatKey,
    getSpecStatusChatTitle,
    isAgentTaskTab,
    normalizedSpecChatCommentEntries,
    specChatCommentCount,
  ]);
  const activeSpecCommentContextLabel = useMemo(() => {
    const tabMeta = visibleEditorStateTabId
      ? ideTabs.find((tab) => tab.id === visibleEditorStateTabId)
      : null;
    return tabMeta?.label ?? currentAgentTaskLabel ?? TERMINAL_TASK_TAB_BASE_LABEL;
  }, [currentAgentTaskLabel, ideTabs, visibleEditorStateTabId]);

  const buildSpecStatusChatUserMessage = useCallback((status, tabId = null) => {
    const sourceTabId = resolveSpecStatusSourceTabId(tabId);
    const label = ideTabs.find((tab) => tab.id === sourceTabId)?.label ?? currentAgentTaskLabel ?? TERMINAL_TASK_TAB_BASE_LABEL;
    if (status === 'Build') return `Build ${label}`;
    if (status === 'Specified') return `Specify ${label}`;
    return `Open ${label}`;
  }, [currentAgentTaskLabel, ideTabs, resolveSpecStatusSourceTabId]);
  const buildSpecStatusChatAssistantResponse = useCallback((status) => {
    const label = currentAgentTaskLabel || TERMINAL_TASK_TAB_BASE_LABEL;

    if (status === 'Build') {
      const { initialLines } = buildTerminalRunSequence({
        mode: 'section',
        sectionTitle: 'Plan',
        taskLabel: label,
      });
      return formatAgentRunLinesForChat(initialLines);
    }

    if (status === 'Specified') {
      const { initialLines } = buildTerminalRunSequence({
        mode: 'generate',
        taskLabel: label,
        permissionChoice: 'allow-session',
      });
      return formatAgentRunLinesForChat(initialLines);
    }

    return formatAgentRunLinesForChat([
      { type: 'command', text: `agent open "${label}" --context` },
      { type: 'output', text: `Reading ${label}` },
      { type: 'output', text: `Context: ${label} > Generated specification` },
      { type: 'output', text: 'Loaded specification context into chat' },
    ]);
  }, [currentAgentTaskLabel]);
  const clearAiChatStreamingTimersForChat = useCallback((chatId) => {
    Object.entries(aiChatStreamingTimersRef.current).forEach(([key, timerId]) => {
      if (!key.startsWith(`${chatId}:`)) return;
      window.clearTimeout(timerId);
      delete aiChatStreamingTimersRef.current[key];
    });
  }, []);
  const startSpecStatusChatStreamingTurn = useCallback((status, chatId, options = {}) => {
    if (!chatId) return;

    const sourceTabId = resolveSpecStatusSourceTabId(options?.sourceTabId);
    clearAiChatStreamingTimersForChat(chatId);
    const createdAt = Date.now();
    const attachment = snapshotAiChatMessageAttachment(buildSpecStatusAttachment(status, sourceTabId));
    const userMessage = {
      id: `${chatId}-action-${createdAt}`,
      role: 'user',
      text: buildSpecStatusChatUserMessage(status, sourceTabId),
      attachments: attachment ? [attachment] : [],
    };
    const assistantMessageId = `${chatId}-assistant-${createdAt}`;
    const assistantMessage = {
      id: assistantMessageId,
      role: 'assistant',
      text: '',
      streaming: true,
    };
    const fullResponse = buildSpecStatusChatAssistantResponse(status);
    const timerKey = `${chatId}:${assistantMessageId}`;

    setAiChatSentMessagesByChatId((prev) => ({
      ...prev,
      [chatId]: [
        ...(prev[chatId] ?? []),
        userMessage,
      assistantMessage,
      ],
    }));

    clearTaskCommentsForTab(sourceTabId);

    let index = 0;
    const streamNextChunk = () => {
      index = Math.min(fullResponse.length, index + 4);
      const nextText = fullResponse.slice(0, index);
      const isComplete = index >= fullResponse.length;

      setAiChatSentMessagesByChatId((prev) => ({
        ...prev,
        [chatId]: (prev[chatId] ?? []).map((message) => (
          message.id === assistantMessageId
            ? { ...message, text: nextText, streaming: !isComplete }
            : message
        )),
      }));

      if (isComplete) {
        delete aiChatStreamingTimersRef.current[timerKey];
        return;
      }

      aiChatStreamingTimersRef.current[timerKey] = window.setTimeout(streamNextChunk, 28);
    };

    aiChatStreamingTimersRef.current[timerKey] = window.setTimeout(streamNextChunk, 80);
  }, [
    buildSpecStatusAttachment,
    buildSpecStatusChatAssistantResponse,
    buildSpecStatusChatUserMessage,
    clearAiChatStreamingTimersForChat,
    clearTaskCommentsForTab,
    resolveSpecStatusSourceTabId,
  ]);
  const startSpecBuildDocumentState = useCallback((tabId) => {
    if (!tabId) return;

    const timerKey = `build:${tabId}`;
    if (specActionDocStateTimersRef.current[timerKey]) {
      window.clearTimeout(specActionDocStateTimersRef.current[timerKey]);
      delete specActionDocStateTimersRef.current[timerKey];
    }

    clearChainedRunTimeout();
    clearStatusReveal('plan');
    clearStatusReveal('ac');
    clearAcWarningFlow();
    const scenario = getCurrentAgentTaskScenario(tabId);
    const nextPlanRunStatuses = buildResolvedRunStatuses(
      scenario.planBaseStatuses,
      'plan',
      appliedIssueFixes,
      removedIssueIndices,
      { runComplete: true },
    );
    const nextAcRunStatuses = buildResolvedRunStatuses(
      scenario.acBaseStatuses,
      'ac',
      appliedIssueFixes,
      removedIssueIndices,
      { runComplete: true },
    );

    setRunStateForTab('running', tabId);
    currentRunSourceTabIdRef.current = tabId;
    const planRunRequest = {
      mode: 'section',
      sourceTabId: tabId,
      sectionTitle: 'Plan',
      taskLabel: ideTabs.find((tab) => tab.id === tabId)?.label ?? currentAgentTaskLabel,
    };
    const acRunRequest = {
      ...planRunRequest,
      sectionTitle: 'Acceptance Criteria',
    };
    lastTerminalRunRequestRef.current = planRunRequest;
    setSpecDocumentRunRequestsByTab((prev) => ({
      ...prev,
      [tabId]: planRunRequest,
    }));
    setPlanRunResult(null);
    setAcRunResult(null);

    const finishBuildState = () => {
      setAppliedIssueFixes({ ac: {}, plan: {} });
      clearSpecDocumentRunRequestForTab(tabId);
      delete specActionDocStateTimersRef.current[timerKey];
    };

    revealRunStatuses('plan', nextPlanRunStatuses, {
      onComplete: () => {
        specActionDocStateTimersRef.current[timerKey] = window.setTimeout(() => {
          lastTerminalRunRequestRef.current = acRunRequest;
          setSpecDocumentRunRequestsByTab((prev) => ({
            ...prev,
            [tabId]: acRunRequest,
          }));
          revealRunStatuses('ac', nextAcRunStatuses, {
            onComplete: finishBuildState,
          });
        }, CHAINED_SECTION_START_DELAY_MS);
      },
    });
  }, [
    appliedIssueFixes,
    clearAcWarningFlow,
    clearChainedRunTimeout,
    clearSpecDocumentRunRequestForTab,
    clearStatusReveal,
    currentAgentTaskLabel,
    getCurrentAgentTaskScenario,
    ideTabs,
    removedIssueIndices,
    revealRunStatuses,
    setAppliedIssueFixes,
    setRunStateForTab,
  ]);
  const startSpecSpecifyDocumentState = useCallback((tabId) => {
    if (!tabId) return;

    const request = {
      mode: 'specify',
      sourceTabId: tabId,
      sectionTitle: 'Specify',
      taskLabel: ideTabs.find((tab) => tab.id === tabId)?.label ?? currentAgentTaskLabel,
    };

    setRunStateForTab('running', tabId);
    currentRunSourceTabIdRef.current = tabId;
    lastTerminalRunRequestRef.current = request;
    setSpecDocumentRunRequestsByTab((prev) => ({
      ...prev,
      [tabId]: request,
    }));
  }, [currentAgentTaskLabel, ideTabs, setRunStateForTab]);
  const handleAgentTaskTopBarAction = useCallback((status, options = {}) => {
    if (!['Build', 'Specified'].includes(status)) return;
    const sourceTabId = resolveSpecStatusSourceTabId(options?.sourceTabId ?? null);
    openAiToolWindow();
    setSpecTopBarStatusForTab(status, sourceTabId);
    const chatId = ensureSpecStatusChat(status, { select: true, sourceTabId });
    if (chatId) {
      if (options?.sendMessage) {
        startSpecStatusChatStreamingTurn(status, chatId, { sourceTabId });
        if (status === 'Build') {
          startSpecBuildDocumentState(sourceTabId);
        } else if (status === 'Specified') {
          startSpecSpecifyDocumentState(sourceTabId);
        }
      }
    }
  }, [
    ensureSpecStatusChat,
    openAiToolWindow,
    resolveSpecStatusSourceTabId,
    setSpecTopBarStatusForTab,
    startSpecBuildDocumentState,
    startSpecSpecifyDocumentState,
    startSpecStatusChatStreamingTurn,
  ]);
  const handleAiChatMessageSent = useCallback(({ chatId, message = null } = {}) => {
    if (!chatId) return;

    const statusChatMatch = String(chatId).match(/^spec-chat-(.+)-(build|specified)$/u);
    if (!statusChatMatch) return;
    const hasCommentAttachments = Array.isArray(message?.attachments) && message.attachments.some((attachment) => (
      Number.isFinite(attachment?.commentCount) && attachment.commentCount > 0
    ));
    if (hasCommentAttachments) return;

    clearTaskCommentsForTab(statusChatMatch[1]);
  }, [clearTaskCommentsForTab]);
  const currentPersistedSpecCode = visibleEditorStateTabId
    ? ((doneEnhanceFlowRef.current && visibleEditorStateTabId === generationTabId)
        ? (doneEnhanceFlowRef.current.initialCode ?? '')
        : (ideTabContents[visibleEditorStateTabId]?.code ?? ''))
    : '';
  const activeVersionHistory = visibleEditorStateTabId
    ? syncSpecVersionHistoryCurrentCode(
        specVersionsByTab[visibleEditorStateTabId] ?? null,
        currentPersistedSpecCode,
      )
    : null;
  const activeEditorAcWarningBanner = isAgentTaskTab && activeSourceEditorTabId
    ? (terminalSessions[buildTerminalSessionTabId(activeSourceEditorTabId)]?.acWarningBanner ?? null)
    : null;
  const activeDoneOverlayUiState = visibleEditorStateTabId
    ? (doneOverlayUiStates[visibleEditorStateTabId] ?? null)
    : null;
  const activePlanDiffData = isDiffTab
    ? (activeTabContent?.diffData ?? null)
    : (isPlainFileOverlayTab ? (activeTabContent?.plainFileData ?? null) : null);
  const activePlanDiffTarget = isDiffTab
    ? normalizeCommentTarget(activeTabContent?.diffTarget)
    : null;
  const activePlanDiffSourceTabId = isDiffTab
    ? (activeTabContent?.diffSourceTabId ?? activeSourceEditorTabId)
    : null;
  const activePlanDiffCommentsReadOnly = (isDiffTab || isPlainFileOverlayTab) && Boolean(activeTabContent?.diffCommentsReadOnly);
  const activePlanDiffContextMessageId = isDiffTab ? (activeTabContent?.diffContextMessageId ?? null) : null;
  const activePlanDiffContextChatId = isDiffTab ? (activeTabContent?.diffContextChatId ?? null) : null;
  const activePlanDiffSessionCommentsByChatId = (isDiffTab || isPlainFileOverlayTab)
    ? normalizeDiffSessionCommentsByChatId(activeTabContent?.diffSessionCommentsByChatId)
    : {};
  const activePlanDiffComments =
    (isDiffTab || isPlainFileOverlayTab) && activePlanDiffData
      ? (
          Object.keys(activePlanDiffSessionCommentsByChatId).length > 0
            ? normalizeStoredDiffCommentsState(activePlanDiffSessionCommentsByChatId[selectedAiChatId]?.comments)
            : normalizeStoredDiffCommentsState(activeTabContent?.initialDiffComments)
        )
      : {};
  const activePendingDiffCommentSnapshot = (isDiffTab || isPlainFileOverlayTab) && activePlanDiffData
    ? normalizeStoredDiffCommentsState(pendingDiffCommentSnapshotsByTabId[activeTabId])
    : {};
  const activePlanDiffCommentsWithPending = mergeStoredDiffCommentsStates(
    activePendingDiffCommentSnapshot,
    activePlanDiffComments,
  );
  const activePlanDiffDocumentComments = (isDiffTab || isPlainFileOverlayTab) && activePlanDiffData
    ? normalizeStoredDiffCommentsState(activeTabContent?.documentDiffComments)
    : {};
  const activePlainFileCommentIssues = useMemo(
    () => {
      if (!isPlainFileOverlayTab) return [];

      const documentEntryIssues = buildDocumentEntryCommentIssuesForTab(
        activeTabId,
        ideTabs
          .filter((tab) => tab?.id?.startsWith('agent-task-') || tab?.label?.endsWith('.md'))
          .map((tab) => getCommentEntriesForTaskTab(tab.id)),
      );

      return mergeCommentIssuesBySourceKey(
        buildCommentIssuesForFileTab(activeTabId, activeTabContent, ideTabs),
        documentEntryIssues,
      );
    },
    [activeTabContent, activeTabId, getCommentEntriesForTaskTab, ideTabs, isPlainFileOverlayTab],
  );
  const activePlainFileProblemSummary = useMemo(
    () => {
      if (!isPlainFileOverlayTab) return { warningCount: 0, errorCount: 0 };

      return countIssuesBySeverity(getProblemsMetaForTab(activeEditorTabMeta).issues);
    },
    [activeEditorTabMeta, isPlainFileOverlayTab],
  );
  const activePlanDiffSessionComments = Object.values(activePlanDiffSessionCommentsByChatId);
  const activePlanDiffUiState = activeTabId ? (planDiffUiStates[activeTabId] ?? null) : null;
  const activePlanDiffLineText = (isDiffTab || isPlainFileOverlayTab) ? (activeTabContent?.diffLineText ?? '') : '';
  const planDiffContextChatId = activePlanDiffCommentsReadOnly
    ? (activePlanDiffContextChatId ?? selectedAiChatId)
    : selectedAiChatId;
  const planDiffContextChatTitle = getAiChatScenarioById(planDiffContextChatId)?.title ?? AI_CHAT_SCENARIOS['visit-model-attributes'].title;
  const planDiffContextChatListItem = getAiChatListItemById(planDiffContextChatId);
  const planDiffContextChatIcon = planDiffContextChatListItem?.icon ?? 'claude';
  const planDiffContextSessionLabel = activePlanDiffCommentsReadOnly
    ? 'Archive'
    : planDiffContextChatId === selectedAiChatId
      ? 'Active'
      : 'Inactive';
  const openMarkdownDocumentTabs = ideTabs.filter((tab) => (
    tab?.id?.startsWith('agent-task-') || tab?.label?.endsWith('.md')
  ));
  const activeMarkdownDocumentTab =
    (activeEditorTabMeta?.id?.startsWith('agent-task-') || activeEditorTabMeta?.label?.endsWith('.md'))
      ? activeEditorTabMeta
      : null;
  const activePlanDiffDocumentTabMeta =
    activeMarkdownDocumentTab
    ?? openMarkdownDocumentTabs[0]
    ?? null;
  const activePlanDiffDocumentSourceTabId = activePlanDiffDocumentTabMeta?.id ?? null;
  const activePlanDiffDocumentContextLabel =
    activePlanDiffDocumentTabMeta?.label
    ?? currentAgentTaskLabel
    ?? TERMINAL_TASK_TAB_BASE_LABEL;
  const activePlanDiffDefaultSubmitAttachMode = activePlanDiffDocumentSourceTabId ? 'document' : 'current';
  const activePlanDiffDefaultSubmitTargetLabel = activePlanDiffDocumentSourceTabId
    ? activePlanDiffDocumentContextLabel
    : planDiffContextChatTitle;
  const activePlanDiffDefaultSubmitTargetIcon = activePlanDiffDocumentSourceTabId
    ? (activePlanDiffDocumentTabMeta?.icon ?? 'fileTypes/markdown')
    : planDiffContextChatIcon;
  const activePlanDiffDefaultSubmitTargetKey = activePlanDiffDocumentSourceTabId ?? selectedAiChatId;
  const selectedChatDocumentAttachments = Array.isArray(getAiChatScenarioById(selectedAiChatId)?.attachments)
    ? getAiChatScenarioById(selectedAiChatId).attachments
    : [];
  const isSelectedChatRelatedToActivePlanDiffDocument = Boolean(
    activePlanDiffDocumentSourceTabId
    && selectedChatDocumentAttachments.some((attachment) => (
      attachment?.isSddDocument
      && (
        attachment.sourceTabId === activePlanDiffDocumentSourceTabId
        || attachment.id === `sdd-document-${activePlanDiffDocumentSourceTabId}-current`
        || attachment.id === `sdd-document-${activePlanDiffDocumentSourceTabId}-build`
        || attachment.id === `sdd-document-${activePlanDiffDocumentSourceTabId}-specified`
      )
    ))
  );
  const activePlanDiffDocumentContextSessionLabel = activePlanDiffCommentsReadOnly
    ? 'Archive'
    : (isSelectedChatRelatedToActivePlanDiffDocument ? 'Active' : 'Related Chats');
  const renderCommentSubmitTargetPicker = useCallback(({
    triggerRect,
  width = null,
  selectedTarget = null,
  onSelectTarget = null,
  onDismiss = null,
} = {}) => {
    const recentItems = aiChatRecentItems.slice(0, 5);
    const documentItems = ideTabs
      .filter((tab) => tab?.id?.startsWith('agent-task-') || tab?.label?.endsWith('.md'))
      .map((tab) => ({
        type: 'document',
        key: tab.id,
        sourceTabId: tab.id,
        label: tab.label ?? 'Agent MD',
        icon: tab.icon ?? 'fileTypes/markdown',
      }));
    const selectedChatId = selectedTarget?.targetChatId
      ?? (selectedTarget?.attachMode === 'current' ? selectedAiChatId : null);
    const selectedDocumentSourceTabId = selectedTarget?.attachMode === 'document'
      ? (selectedTarget?.targetDocumentTabId ?? activePlanDiffDocumentSourceTabId)
      : null;

    const handleSelectChat = (chatId) => {
      const item = getAiChatListItemById(chatId);
      const scenario = getAiChatScenarioById(chatId);
      const label = item?.title ?? scenario?.title ?? 'Chat Session';
      onSelectTarget?.({
        attachMode: 'current',
        targetChatId: chatId,
        targetDocumentTabId: null,
        label,
        icon: item?.icon ?? scenario?.icon ?? 'claude',
        buttonLabel: `Add to ${label}`,
      });
    };

    const handleOpenDocument = (group) => {
      const label = group?.label ?? 'Agent MD';
      onSelectTarget?.({
        attachMode: 'document',
        targetChatId: null,
        targetDocumentTabId: group?.sourceTabId ?? activePlanDiffDocumentSourceTabId,
        label,
        icon: group?.icon ?? 'fileTypes/markdown',
        buttonLabel: `Add to ${label}`,
      });
    };

    const handleCreateNewChat = () => {
      const session = createEmptyAiChatSession({
        title: 'New Chat',
        icon: 'claude',
        emptyState: true,
        select: true,
      });
      const label = session?.title ?? 'New Chat';
      onSelectTarget?.({
        attachMode: 'current',
        targetChatId: session.id,
        targetDocumentTabId: null,
        label,
        icon: session.icon ?? 'claude',
        buttonLabel: `Add to ${label}`,
      });
    };

    return (
      <div className="theme-dark">
        <PositionedPopup triggerRect={triggerRect} onDismiss={onDismiss} gap={4}>
          <ChatListPopup
            className="diff-comment-submit-target-popup"
            style={{ position: 'static', width: Number.isFinite(width) ? width : 420, maxWidth: 'calc(100vw - 16px)' }}
            selectedChatId={selectedChatId}
            activeChatId={selectedAiChatId}
            selectedDocumentSourceTabId={selectedDocumentSourceTabId}
            onSelectChat={handleSelectChat}
            onOpenDocument={handleOpenDocument}
            recentItems={recentItems}
            documentItems={documentItems}
            olderItems={[]}
            hideSearch
            flattenDocuments
            showOlderSections={false}
            hideMeta
            footerAction={{
              label: 'Create New Chat',
              icon: 'general/add',
              onClick: handleCreateNewChat,
            }}
          />
        </PositionedPopup>
      </div>
    );
  }, [
    activePlanDiffDocumentSourceTabId,
    aiChatRecentItems,
    createEmptyAiChatSession,
    getAiChatListItemById,
    getAiChatScenarioById,
    ideTabs,
    selectedAiChatId,
  ]);
  const selectedAiChatScenario = getAiChatScenarioById(selectedAiChatId);
  const upsertSddAttachmentForChat = useCallback((chatId, attachment) => {
    if (!chatId || !attachment?.isSddDocument) return;

    setAiChatDraftSessionsById((prev) => {
      const existingSession = prev[chatId] ?? getAiChatScenarioById(chatId);
      if (!existingSession) return prev;

      const previousAttachments = Array.isArray(existingSession.attachments)
        ? existingSession.attachments
        : [];
      let didReplace = false;
      const nextAttachments = previousAttachments.map((item) => {
        const isSameDocumentAttachment =
          item?.isSddDocument
          && (
            item.sourceTabId === attachment.sourceTabId
            || item.id === attachment.id
          );

        if (!isSameDocumentAttachment) return item;
        didReplace = true;
        return {
          ...item,
          ...attachment,
        };
      });

      if (!didReplace) {
        nextAttachments.push(attachment);
      }

      if (JSON.stringify(previousAttachments) === JSON.stringify(nextAttachments)) {
        return prev;
      }

      return {
        ...prev,
        [chatId]: {
          ...existingSession,
          id: chatId,
          createdAt: existingSession.createdAt ?? Date.now(),
          attachmentLabel: attachment.label,
          attachments: nextAttachments,
          showAttachmentsInComposer: true,
        },
      };
    });
  }, [getAiChatScenarioById]);
  const aiChatComposerDiffAttachments = useMemo(() => {
    const diffEntries = Object.entries(ideTabContents)
      .filter(([, tabContent]) => Boolean(tabContent?.diffData) || Boolean(tabContent?.plainFileData));
    const pinnedDiffTabId = aiChatComposerDiffTabByChatId[selectedAiChatId] ?? null;
    const scenarioDiffTabId = selectedAiChatScenario?.diffRequest?.source?.tabId
      ? buildPlanDiffTabId(selectedAiChatScenario.diffRequest.source.tabId)
      : null;

    const orderedDiffEntries = [
      ...diffEntries.filter(([tabId]) => tabId === pinnedDiffTabId),
      ...diffEntries.filter(([tabId]) => tabId !== pinnedDiffTabId && tabId === scenarioDiffTabId),
      ...diffEntries.filter(([tabId]) => tabId !== pinnedDiffTabId && tabId !== scenarioDiffTabId).reverse(),
    ];

    const attachments = [];
    for (const [diffTabId, tabContent] of orderedDiffEntries) {
      const sessionCommentsByChatId = normalizeDiffSessionCommentsByChatId(tabContent.diffSessionCommentsByChatId);
      const selectedSessionComments = normalizeStoredDiffCommentsState(sessionCommentsByChatId[selectedAiChatId]?.comments);
      const selectedSessionCommentCount = flattenStoredDiffCommentsState(selectedSessionComments).length;

      if (selectedSessionCommentCount === 0) {
        continue;
      }

      const isPlainFile = !tabContent.diffData && Boolean(tabContent.plainFileData);
      const fileData = tabContent.diffData ?? tabContent.plainFileData;
      const sourceTabId = isPlainFile
        ? diffTabId
        : (tabContent.diffSourceTabId ?? selectedAiChatScenario?.diffRequest?.source?.tabId ?? INITIAL_PLAN_DIFF_SOURCE_TAB_ID);
      const sourceLabel =
        fileData?.sourceTabLabel
        ?? selectedAiChatScenario?.diffRequest?.source?.label
        ?? 'VisitController.java';
      const diffRequest = {
        text: tabContent.diffLineText || fileData?.lineText || fileData?.title || '',
        statusItem: selectedAiChatScenario?.diffRequest?.statusItem ?? { status: 'passed' },
        issueTarget: isPlainFile
          ? null
          : (normalizeCommentTarget(tabContent.diffTarget)
              ?? normalizeCommentTarget(selectedAiChatScenario?.diffRequest?.issueTarget)
              ?? { kind: 'plan', index: 3 }),
        source: {
          tabId: sourceTabId,
          label: sourceLabel,
        },
      };
      const tabMeta = isPlainFile ? ideTabs.find((t) => t.id === diffTabId) : null;

      attachments.push({
        id: `diff-${selectedAiChatId}-${diffTabId}`,
        label: isPlainFile ? sourceLabel : (fileData?.title || `Diff ${sourceLabel}`),
        icon: isPlainFile ? (tabMeta?.icon ?? 'fileTypes/text') : 'vcs/diff',
        commentCount: selectedSessionCommentCount,
        diffComments: selectedSessionComments,
        diffRequest,
        diffTabId,
        isPlainFile,
      });
    }

    return attachments;
  }, [aiChatComposerDiffTabByChatId, ideTabContents, selectedAiChatId, selectedAiChatScenario?.diffRequest]);
  const aiChatComposerDiffAttachment = aiChatComposerDiffAttachments.find((attachment) => (
    attachment?.diffRequest || attachment?.diffTabId || attachment?.diffComments
  )) ?? null;
  const aiChatComposerDiffSourceTabId =
    aiChatComposerDiffAttachment?.diffRequest?.source?.tabId
    ?? selectedAiChatScenario?.diffRequest?.source?.tabId
    ?? INITIAL_PLAN_DIFF_SOURCE_TAB_ID;
  const aiChatComposerDiffTabId = aiChatComposerDiffAttachment?.diffTabId
    ?? buildPlanDiffTabId(aiChatComposerDiffSourceTabId);
  const aiChatDiffTabContent = ideTabContents[aiChatComposerDiffTabId] ?? {};
  const aiChatDiffSessionCommentsByChatId = normalizeDiffSessionCommentsByChatId(aiChatDiffTabContent.diffSessionCommentsByChatId);
  const aiChatComposerDiffComments = aiChatComposerDiffAttachment?.diffComments ?? (
    Object.keys(aiChatDiffSessionCommentsByChatId).length > 0
      ? normalizeStoredDiffCommentsState(aiChatDiffSessionCommentsByChatId[selectedAiChatId]?.comments)
      : normalizeStoredDiffCommentsState(aiChatDiffTabContent.initialDiffComments)
  );
  const aiChatComposerDiffCommentCount = flattenStoredDiffCommentsState(aiChatComposerDiffComments).length;
  const selectedAiChatSentMessages = aiChatSentMessagesByChatId[selectedAiChatId] ?? [];
  const handleSelectedAiChatSentMessagesChange = useCallback((updater, chatIdOverride = null) => {
    const targetChatId = chatIdOverride ?? selectedAiChatId;
    setAiChatSentMessagesByChatId((prev) => {
      const currentMessages = prev[targetChatId] ?? [];
      const nextMessages = typeof updater === 'function' ? updater(currentMessages) : updater;
      return {
        ...prev,
        [targetChatId]: Array.isArray(nextMessages) ? nextMessages : currentMessages,
      };
    });
  }, [selectedAiChatId]);
  const handleDoneVersionSelect = (version) => {
    if (!visibleEditorStateTabId || !version || !activeVersionHistory?.versions?.length) {
      return;
    }

    const currentVersion = activeVersionHistory.versions[activeVersionHistory.versions.length - 1] ?? null;
    if (!currentVersion || version.id === currentVersion.id) {
      return;
    }

    openSpecVersionDiffTab({
      sourceTabId: visibleEditorStateTabId,
      fromVersion: version,
      toVersion: currentVersion,
    });
  };
  const handleActivePlanDiffCommentsChange = useCallback((comments, metadata = {}) => {
    if (activePlanDiffCommentsReadOnly) {
      return;
    }

    const nextComments = normalizeStoredDiffCommentsState(comments);
    const maybeShowCommentShortcutHint = () => {
      if (hasShownCommentShortcutHint || metadata?.isEditing || typeof metadata?.rowId !== 'string' || metadata.rowId.length === 0) {
        return;
      }
      setHasShownCommentShortcutHint(true);
      setCommentShortcutHintTarget({
        tabId: activeTabId,
        rowId: metadata.rowId,
        nonce: Date.now(),
      });
    };
    const shouldCreateNewChat =
      metadata?.attachMode === 'new'
      && !metadata?.isEditing
      && Object.keys(nextComments).length > 0;
    const activePlanDiffSourceLabel = activePlanDiffData?.sourceTabLabel ?? 'VisitController.java';
    const activePlanDiffRequest = {
      text: activePlanDiffLineText || activePlanDiffData?.lineText || activePlanDiffData?.title || '',
      statusItem: { status: 'passed' },
      issueTarget: activePlanDiffTarget ?? { kind: 'plan', index: 3 },
      source: {
        tabId: activePlanDiffSourceTabId ?? INITIAL_PLAN_DIFF_SOURCE_TAB_ID,
        label: activePlanDiffSourceLabel,
      },
    };

    if (metadata?.attachMode === 'document') {
      const sourceDocumentTabId = typeof metadata?.targetDocumentTabId === 'string' && metadata.targetDocumentTabId.trim().length > 0
        ? metadata.targetDocumentTabId
        : activePlanDiffDocumentSourceTabId;
      const currentDocumentEntries = normalizeSpecVersionCommentEntries(
        sourceDocumentTabId ? getCommentEntriesForTaskTab(sourceDocumentTabId) : [],
      );
      let nextDocumentEntries = currentDocumentEntries;
      const sourceRowId = typeof metadata?.rowId === 'string' ? metadata.rowId : null;
      const sourceRow = sourceRowId
        ? (activePlanDiffData?.rows ?? []).find((row) => row?.id === sourceRowId)
        : null;
      const sourceLineNumber = Number.isInteger(sourceRow?.newNumber)
        ? sourceRow.newNumber
        : (Number.isInteger(sourceRow?.oldNumber) ? sourceRow.oldNumber : null);

      if (sourceDocumentTabId && activePlanDiffTarget) {
        const runtimeState = getTaskRuntimeState(sourceDocumentTabId);
        const targetMetadata = buildCommentTargetEntryMetadata(
          runtimeState?.taskState?.documentSections ?? runtimeState?.scenario?.defaultDocument ?? [],
          activePlanDiffTarget,
          runtimeState?.taskState?.removedIssueIndices ?? cloneIssueStateMap(),
        );
        nextDocumentEntries = upsertHiddenDiffCommentEntry(
          currentDocumentEntries,
          `document-diff-comment-${activeTabId ?? sourceDocumentTabId}-${activePlanDiffTarget.kind}-${activePlanDiffTarget.index}`,
          nextComments,
          {
            sectionTitle: activePlanDiffTarget.kind === 'plan' ? 'Plan' : 'Acceptance Criteria',
            line: targetMetadata.line || activePlanDiffLineText,
            rawIndex: targetMetadata.rawIndex,
            rowStableKey: targetMetadata.rowStableKey,
            sourceKind: 'diff',
            sourceLabel: activePlanDiffData?.title || `Diff ${activePlanDiffSourceLabel}`,
            sourceIcon: DIFF_TAB_ICON_NAME,
            sourceNavigationTabId: activeTabId,
            sourceNavigationRowId: sourceRowId,
            sourceLineNumber,
            target: activePlanDiffTarget,
          },
        );
      } else if (sourceDocumentTabId) {
        const fallbackEntryId = `document-comment-${activeTabId ?? sourceDocumentTabId}-${metadata?.rowId ?? 'file'}`;
        nextDocumentEntries = upsertHiddenDiffCommentEntry(
          currentDocumentEntries,
          fallbackEntryId,
          nextComments,
          {
            sectionTitle: 'Current Document',
            line: activePlanDiffLineText || activePlanDiffData?.title || activePlanDiffSourceLabel,
            sourceKind: 'file',
            sourceLabel: activePlanDiffSourceLabel,
            sourceIcon: resolveAgentTaskPlanFileIcon(activePlanDiffSourceLabel),
            sourceNavigationTabId: activeTabId,
            sourceNavigationRowId: sourceRowId,
            sourceLineNumber,
          },
        );
      }

      if (activeTabId) {
        setIdeTabContents((prev) => {
          const existing = prev[activeTabId];
          if (!existing) return prev;

          return {
            ...prev,
            [activeTabId]: {
              ...existing,
              documentDiffComments: nextComments,
              documentCommentSourceTabId: sourceDocumentTabId,
              diffCommentsReadOnly: false,
            },
          };
        });
      }

      if (sourceDocumentTabId) {
        setInteractiveTaskStates((prev) => {
          const runtimeState = getTaskRuntimeState(sourceDocumentTabId);
          const currentTaskState =
            prev[sourceDocumentTabId]
            ?? runtimeState?.taskState
            ?? runtimeState?.scenario?.initialTaskState
            ?? {};
          if (buildSpecVersionCommentEntriesSignature(currentTaskState?.commentEntries ?? []) === buildSpecVersionCommentEntriesSignature(nextDocumentEntries)) {
            return prev;
          }

          return {
            ...prev,
            [sourceDocumentTabId]: {
              ...currentTaskState,
              commentEntries: nextDocumentEntries,
            },
          };
        });

        if (sourceDocumentTabId === activeSourceEditorTabId || sourceDocumentTabId === generationTabId || sourceDocumentTabId === 'agent-task-t1') {
          setAgentTaskCommentEntries((prev) => (
            buildSpecVersionCommentEntriesSignature(prev ?? []) === buildSpecVersionCommentEntriesSignature(nextDocumentEntries)
              ? prev
              : nextDocumentEntries
          ));
        }

        const tabMeta = ideTabs.find((tab) => tab.id === sourceDocumentTabId) ?? null;
        const commentCount = getAggregatedCommentIssueCount(nextDocumentEntries);

        upsertSddAttachmentForChat(selectedAiChatId, {
          id: `sdd-document-${sourceDocumentTabId}-current`,
          sourceTabId: sourceDocumentTabId,
          label: tabMeta?.label ?? currentAgentTaskLabel ?? TERMINAL_TASK_TAB_BASE_LABEL,
          icon: tabMeta?.icon ?? 'fileTypes/markdown',
          commentCount,
          diffComments: null,
          diffRequest: null,
          diffTabId: null,
          isPlainFile: false,
          isSddDocument: true,
          isSddCommentAttachment: commentCount > 0,
          sddCommentEntries: nextDocumentEntries,
        });
      }
      maybeShowCommentShortcutHint();
      return;
    }

    const newChatSession = shouldCreateNewChat
      ? createEmptyAiChatSession({
          diffRequest: activePlanDiffRequest,
          attachmentLabel: activePlanDiffData?.title || `Diff ${activePlanDiffSourceLabel}`,
        })
      : null;
    const explicitTargetChatId = typeof metadata?.targetChatId === 'string' && metadata.targetChatId.trim().length > 0
      ? metadata.targetChatId
      : null;
    const targetChatId = newChatSession?.id ?? explicitTargetChatId ?? selectedAiChatId;
    const isExplicitDifferentChatTarget = Boolean(explicitTargetChatId && explicitTargetChatId !== selectedAiChatId);
    const metadataRowIds = Array.isArray(metadata?.rowIds) && metadata.rowIds.length > 0
      ? metadata.rowIds.filter((rowId) => typeof rowId === 'string' && rowId.length > 0)
      : (typeof metadata?.rowId === 'string' ? [metadata.rowId] : []);
    const buildSubmittedCommentState = (baseComments = {}) => {
      if (metadataRowIds.length === 0 || typeof metadata?.comment !== 'string' || metadata.comment.trim().length === 0) {
        return normalizeStoredDiffCommentsState(baseComments);
      }

      const normalizedSubmittedText = metadata.comment.trim();
      const submittedCommentFromNextState = metadataRowIds
        .flatMap((rowId) => normalizeStoredDiffCommentsState(nextComments)[rowId] ?? [])
        .find((comment) => getStoredCommentText(comment).trim() === normalizedSubmittedText);
      const submittedLineLabel = getStoredCommentLineLabel(submittedCommentFromNextState);
      const submittedRowIds = Array.isArray(submittedCommentFromNextState?.rowIds) && submittedCommentFromNextState.rowIds.length > 0
        ? submittedCommentFromNextState.rowIds.filter((rowId) => typeof rowId === 'string' && rowId.length > 0)
        : metadataRowIds;
      const commentEntry = {
        text: normalizedSubmittedText,
        ...(submittedLineLabel.length > 0 ? { lineLabel: submittedLineLabel } : {}),
        ...(submittedRowIds.length > 0 ? { rowIds: submittedRowIds } : {}),
        ...(typeof metadata?.targetChatId === 'string' && metadata.targetChatId.trim().length > 0
          ? { chatId: metadata.targetChatId.trim() }
          : {}),
      };
      return normalizeStoredDiffCommentsState(metadataRowIds.reduce((nextComments, rowId) => ({
        ...nextComments,
        [rowId]: [commentEntry],
      }), { ...normalizeStoredDiffCommentsState(baseComments) }));
    };
    const targetSessionComments = (() => {
      if (shouldCreateNewChat) {
        return buildSubmittedCommentState({});
      }

      if (
        isExplicitDifferentChatTarget
        && typeof metadata?.comment === 'string'
        && metadata.comment.trim().length > 0
        && !metadata?.isEditing
      ) {
        const previousTargetComments = normalizeStoredDiffCommentsState(
          activePlanDiffSessionCommentsByChatId[explicitTargetChatId]?.comments,
        );

        return buildSubmittedCommentState(previousTargetComments);
      }

      return nextComments;
    })();
    const targetChatHasSentMessages = (aiChatSentMessagesByChatId[targetChatId] ?? []).some((message) => (
      message && message.role !== 'assistant'
    ));
    const nextTargetCommentCount = flattenStoredDiffCommentsState(targetSessionComments).length;
    if (
      !plainFileGutterCommentsEnabled
      && !isPlainFileOverlayTab
      && !metadata?.isEditing
      && targetChatHasSentMessages
      && nextTargetCommentCount > 0
    ) {
      setShowFileCommentsSuggestionBanner(true);
    }
    maybeShowCommentShortcutHint();
    const hasNextComments = Object.keys(targetSessionComments).length > 0;
    if (activeTabId) {
      setAiChatComposerDiffTabByChatId((prev) => {
        if (hasNextComments) {
          return prev[targetChatId] === activeTabId
            ? prev
            : { ...prev, [targetChatId]: activeTabId };
        }
        if (prev[targetChatId] !== activeTabId) {
          return prev;
        }
        const { [targetChatId]: _removedDiffTabId, ...rest } = prev;
        return rest;
      });
    }
    const scenarioForSync = newChatSession ?? getAiChatScenarioById(targetChatId);
    const listItemForSync = newChatSession ? { icon: newChatSession.icon } : getAiChatListItemById(targetChatId);
    const { [targetChatId]: _previousSelectedSessionForSync, ...remainingSessionCommentsForSync } = activePlanDiffSessionCommentsByChatId;
    const nextSessionCommentsForSync = hasNextComments
      ? {
          ...activePlanDiffSessionCommentsByChatId,
          [targetChatId]: {
            chatId: targetChatId,
            messageId: scenarioForSync?.messageId ?? `chat-${targetChatId}`,
            title: scenarioForSync?.title ?? targetChatId,
            icon: listItemForSync?.icon ?? 'claude',
            comments: targetSessionComments,
          },
        }
      : remainingSessionCommentsForSync;
    const mergedDiffCommentsForTask = mergeDiffCommentsFromSessions(nextSessionCommentsForSync);

    if (activeTabId) {
      setIdeTabContents((prev) => {
        const existing = prev[activeTabId];
        if (!existing) return prev;
        if (
          JSON.stringify(normalizeStoredDiffCommentsState(existing.initialDiffComments))
          === JSON.stringify(targetSessionComments)
          && JSON.stringify(normalizeStoredDiffCommentsState(existing.diffSessionCommentsByChatId?.[targetChatId]?.comments))
          === JSON.stringify(targetSessionComments)
        ) {
          return prev;
        }
        const previousSessionComments = normalizeDiffSessionCommentsByChatId(existing.diffSessionCommentsByChatId);
        const { [targetChatId]: _previousSelectedSession, ...remainingSessionComments } = previousSessionComments;
        const scenario = newChatSession ?? getAiChatScenarioById(targetChatId);
        const listItem = newChatSession ? { icon: newChatSession.icon } : getAiChatListItemById(targetChatId);
        const nextSessionComments = hasNextComments
          ? {
              ...previousSessionComments,
              [targetChatId]: {
                chatId: targetChatId,
                messageId: scenario?.messageId ?? `chat-${targetChatId}`,
                title: scenario?.title ?? targetChatId,
                icon: listItem?.icon ?? 'claude',
                comments: targetSessionComments,
              },
            }
          : remainingSessionComments;
        const nextMergedDiffComments = mergeDiffCommentsFromSessions(nextSessionComments);
        return {
          ...prev,
          [activeTabId]: {
            ...existing,
            initialDiffComments: nextMergedDiffComments,
            diffSessionCommentsByChatId: nextSessionComments,
            diffCommentsReadOnly: false,
          },
        };
      });
    }

    if (!activePlanDiffTarget || !activePlanDiffSourceTabId) return;

    syncDiffCommentsToTaskTarget({
      sourceTabId: activePlanDiffSourceTabId,
      target: activePlanDiffTarget,
      comments: mergedDiffCommentsForTask,
      sectionTitle: activePlanDiffTarget.kind === 'plan' ? 'Plan' : 'Acceptance Criteria',
      line: activePlanDiffLineText,
      sourceKind: isPlainFileOverlayTab ? 'file' : 'diff',
      sourceLabel: isPlainFileOverlayTab
        ? activePlanDiffSourceLabel
        : (activePlanDiffData?.title || `Diff ${activePlanDiffSourceLabel}`),
      sourceIcon: isPlainFileOverlayTab
        ? resolveAgentTaskPlanFileIcon(activePlanDiffSourceLabel)
        : DIFF_TAB_ICON_NAME,
      sourceNavigationTabId: activeTabId,
      sourceNavigationRowId: typeof metadata?.rowId === 'string' ? metadata.rowId : null,
    });
  }, [
    activeTabId,
	    activePlanDiffSessionCommentsByChatId,
	    activePlanDiffLineText,
	    activePlanDiffData,
      activePlanDiffComments,
      activePlanDiffDocumentSourceTabId,
	    activePlanDiffSourceTabId,
      activePlanDiffTarget,
      activePlanDiffCommentsReadOnly,
      hasShownCommentShortcutHint,
      activeSourceEditorTabId,
	    activeRelatedDiffCommentIssues,
      aiChatSentMessagesByChatId,
      isPlainFileOverlayTab,
      plainFileGutterCommentsEnabled,
	    createEmptyAiChatSession,
      currentAgentTaskLabel,
      generationTabId,
      getCommentEntriesForTaskTab,
	    getAiChatListItemById,
	    getAiChatScenarioById,
      getTaskRuntimeState,
      ideTabs,
      resolveAgentTaskPlanFileIcon,
	    selectedAiChatId,
	    syncDiffCommentsToTaskTarget,
      upsertSddAttachmentForChat,
      visibleEditorStateTabId,
		  ]);
  const handlePlanDiffReturnToChat = useCallback((context = {}) => {
    if (context?.source === 'diff-comment-document-context') {
      const sourceTabId = context?.sourceTabId ?? activePlanDiffDocumentSourceTabId;
      const existingTabIndex = ideTabs.findIndex((tab) => tab.id === sourceTabId);
      if (existingTabIndex >= 0) {
        setScreen('ide');
        setActiveEditorTab(existingTabIndex);
        return;
      }

      const sourceTab = ideTabs.find((tab) => tab.id === sourceTabId) ?? null;
      openEditorTabByLabel(sourceTab?.label ?? activePlanDiffDocumentContextLabel);
      return;
    }

    const shouldSwitchChat = context?.source === 'diff-comment-context';
	    const contextMessageId = context?.messageId ?? activePlanDiffContextMessageId;
	    const contextChatId = context?.chatId
	      ?? activePlanDiffContextChatId
	      ?? Object.entries(aiChatScenarios).find(([chatId, scenario]) => (
	        scenario.messageId === contextMessageId || `chat-${chatId}` === contextMessageId
	      ))?.[0]
	      ?? Object.keys(aiChatScenarios).find((chatId) => (
	        typeof contextMessageId === 'string' && contextMessageId.startsWith(`${chatId}-`)
	      ))
	      ?? null;

    setScreen('ide');
    if (shouldSwitchChat && contextChatId) {
      setSelectedAiChatId(contextChatId);
    }
    if (contextMessageId) {
      setChatScrollTarget({
        messageId: contextMessageId,
        chatId: contextChatId,
        restoreComposerAttachment: Boolean(shouldSwitchChat && contextChatId),
        nonce: Date.now(),
      });
    }
    openAiToolWindow();
	  }, [activePlanDiffContextChatId, activePlanDiffContextMessageId, activePlanDiffDocumentContextLabel, activePlanDiffDocumentSourceTabId, aiChatScenarios, ideTabs, openAiToolWindow, openEditorTabByLabel]);
  const handleChatDiffCommentsClear = useCallback(() => {
    const diffTabId = aiChatComposerDiffTabId;
    const diffTabContent = ideTabContents[diffTabId];
    const diffSessionCommentsByChatId = normalizeDiffSessionCommentsByChatId(diffTabContent?.diffSessionCommentsByChatId);
    const { [selectedAiChatId]: _removedSessionForSync, ...remainingSessionCommentsForSync } = diffSessionCommentsByChatId;
    const remainingDiffCommentsForTask = mergeDiffCommentsFromSessions(remainingSessionCommentsForSync);
    const diffSourceTabId = diffTabContent?.diffSourceTabId ?? aiChatComposerDiffSourceTabId;
    const diffTarget = normalizeCommentTarget(diffTabContent?.diffTarget)
      ?? normalizeCommentTarget(selectedAiChatScenario?.diffRequest?.issueTarget)
      ?? normalizeCommentTarget({ kind: 'plan', index: 3 });

    setIdeTabContents((prev) => {
      const existing = prev[diffTabId];
      if (!existing) return prev;
      const previousSessionComments = normalizeDiffSessionCommentsByChatId(existing.diffSessionCommentsByChatId);
      const { [selectedAiChatId]: _removedSession, ...remainingSessionComments } = previousSessionComments;
      return {
        ...prev,
        [diffTabId]: {
          ...existing,
          initialDiffComments: {},
          diffSessionCommentsByChatId: remainingSessionComments,
        },
      };
    });
    setAiChatComposerDiffTabByChatId((prev) => {
      if (prev[selectedAiChatId] !== diffTabId) {
        return prev;
      }
      const { [selectedAiChatId]: _removedDiffTabId, ...rest } = prev;
      return rest;
    });

    updatePlanDiffUiStateForTab({
      activeRowId: planDiffUiStates[diffTabId]?.activeRowId ?? null,
      commentRowId: null,
      commentValue: '',
      commentEditingIndex: null,
      caretState: planDiffUiStates[diffTabId]?.caretState ?? {
        rowId: planDiffUiStates[diffTabId]?.activeRowId ?? null,
        left: 12,
      },
    }, diffTabId);

    syncDiffCommentsToTaskTarget({
      sourceTabId: diffSourceTabId,
      target: diffTarget,
      comments: remainingDiffCommentsForTask,
      sectionTitle: diffTarget.kind === 'plan' ? 'Plan' : 'Acceptance Criteria',
      line: diffTabContent?.diffLineText ?? '',
    });
  }, [aiChatComposerDiffSourceTabId, aiChatComposerDiffTabId, ideTabContents, planDiffUiStates, selectedAiChatId, selectedAiChatScenario?.diffRequest?.issueTarget, syncDiffCommentsToTaskTarget, updatePlanDiffUiStateForTab]);
  const getSourceTabIdFromSddAttachment = useCallback((attachment = null) => {
    if (typeof attachment?.sourceTabId === 'string' && attachment.sourceTabId.trim().length > 0) {
      return attachment.sourceTabId;
    }
    const rawId = typeof attachment?.id === 'string' ? attachment.id : '';
    const match = rawId.match(/^sdd-document-(.+)-(?:build|specified|current)$/u);
    if (match?.[1]) return match[1];

    const attachmentLabel = typeof attachment?.label === 'string' ? attachment.label.trim() : '';
    if (attachmentLabel.length > 0) {
      const tabMatch = ideTabs.find((tab) => (
        (tab?.id?.startsWith('agent-task-') || tab?.label?.endsWith('.md'))
        && tab?.label === attachmentLabel
      ));
      if (tabMatch?.id) return tabMatch.id;
    }

    return visibleEditorStateTabId ?? activeEditorTabId ?? generationTabId;
  }, [activeEditorTabId, generationTabId, ideTabs, visibleEditorStateTabId]);

  const handleRemoveComposerAttachment = useCallback((attachment = null, context = {}) => {
    if (!attachment || typeof attachment !== 'object') return;

    const targetChatId = typeof context?.chatId === 'string' && context.chatId.trim().length > 0
      ? context.chatId
      : selectedAiChatId;

    if (attachment.isSddDocument) {
      const sourceDocumentTabId = getSourceTabIdFromSddAttachment(attachment);
      const removedEntries = normalizeSpecVersionCommentEntries(attachment.sddCommentEntries);
      if (!sourceDocumentTabId || removedEntries.length === 0) return;

      const removedEntryIds = new Set(removedEntries.map((entry) => entry.id).filter(Boolean));
      const sourceRowsByTabId = removedEntries.reduce((rowsByTabId, entry) => {
        const navigationTabId = typeof entry.sourceNavigationTabId === 'string' && entry.sourceNavigationTabId.length > 0
          ? entry.sourceNavigationTabId
          : null;
        const rowIds = Object.keys(normalizeStoredDiffCommentsState(entry.diffComments));
        if (!navigationTabId || rowIds.length === 0) return rowsByTabId;

        const tabRows = rowsByTabId[navigationTabId] ?? new Set();
        rowIds.forEach((rowId) => tabRows.add(rowId));
        rowsByTabId[navigationTabId] = tabRows;
        return rowsByTabId;
      }, {});
      const removeCommentEntries = (commentEntries = []) => (
        normalizeSpecVersionCommentEntries(commentEntries).filter((entry) => !removedEntryIds.has(entry.id))
      );

      setInteractiveTaskStates((prev) => {
        const runtimeState = getTaskRuntimeState(sourceDocumentTabId);
        const currentTaskState =
          prev[sourceDocumentTabId]
          ?? runtimeState?.taskState
          ?? runtimeState?.scenario?.initialTaskState
          ?? {};
        const nextCommentEntries = removeCommentEntries(currentTaskState?.commentEntries ?? []);

        if (buildSpecVersionCommentEntriesSignature(currentTaskState?.commentEntries ?? []) === buildSpecVersionCommentEntriesSignature(nextCommentEntries)) {
          return prev;
        }

        return {
          ...prev,
          [sourceDocumentTabId]: {
            ...currentTaskState,
            commentEntries: nextCommentEntries,
          },
        };
      });

      if (sourceDocumentTabId === activeSourceEditorTabId || sourceDocumentTabId === generationTabId || sourceDocumentTabId === 'agent-task-t1') {
        setAgentTaskCommentEntries((prev) => removeCommentEntries(prev));
      }

      if (Object.keys(sourceRowsByTabId).length > 0) {
        setIdeTabContents((prev) => {
          let didChange = false;
          const next = { ...prev };

          Object.entries(sourceRowsByTabId).forEach(([tabId, rowIds]) => {
            const existing = next[tabId];
            if (!existing) return;

            const previousDocumentComments = normalizeStoredDiffCommentsState(existing.documentDiffComments);
            const remainingDocumentComments = Object.entries(previousDocumentComments).reduce((remaining, [rowId, comments]) => {
              if (!rowIds.has(rowId)) {
                remaining[rowId] = comments;
              }
              return remaining;
            }, {});

            if (JSON.stringify(previousDocumentComments) === JSON.stringify(remainingDocumentComments)) return;

            next[tabId] = {
              ...existing,
              documentDiffComments: remainingDocumentComments,
              documentCommentSourceTabId: Object.keys(remainingDocumentComments).length > 0
                ? existing.documentCommentSourceTabId
                : null,
            };
            didChange = true;
          });

          return didChange ? next : prev;
        });
      }

      setAiChatDraftSessionsById((prev) => {
        const existingSession = prev[targetChatId] ?? getAiChatScenarioById(targetChatId);
        if (!existingSession || !Array.isArray(existingSession.attachments)) return prev;

        let didChange = false;
        const nextAttachments = existingSession.attachments
          .map((item) => {
            const isSameDocumentAttachment =
              item?.isSddDocument
              && (
                item.sourceTabId === sourceDocumentTabId
                || item.id === attachment.id
              );
            if (!isSameDocumentAttachment) return item;

            const nextCommentEntries = removeCommentEntries(item.sddCommentEntries ?? []);
            didChange = true;
            return {
              ...item,
              commentCount: getAggregatedCommentIssueCount(nextCommentEntries),
              isSddCommentAttachment: nextCommentEntries.length > 0,
              sddCommentEntries: nextCommentEntries,
            };
          })
          .filter((item) => !(item?.isSddDocument && item.sourceTabId === sourceDocumentTabId && item.isSddCommentAttachment === false));

        if (!didChange) return prev;

        return {
          ...prev,
          [targetChatId]: {
            ...existingSession,
            id: targetChatId,
            createdAt: existingSession.createdAt ?? Date.now(),
            attachments: nextAttachments,
            showAttachmentsInComposer: nextAttachments.length > 0 ? existingSession.showAttachmentsInComposer : false,
          },
        };
      });

      setDoneCommentResetToken((prev) => prev + 1);
      return;
    }

    const diffTabId = typeof attachment.diffTabId === 'string' && attachment.diffTabId.length > 0
      ? attachment.diffTabId
      : null;
    if (!diffTabId) return;

    const diffTabContent = ideTabContents[diffTabId];
    const diffSessionCommentsByChatId = normalizeDiffSessionCommentsByChatId(diffTabContent?.diffSessionCommentsByChatId);
    const { [targetChatId]: _removedSessionForSync, ...remainingSessionCommentsForSync } = diffSessionCommentsByChatId;
    const remainingDiffCommentsForTask = mergeDiffCommentsFromSessions(remainingSessionCommentsForSync);
    const diffSourceTabId = diffTabContent?.diffSourceTabId
      ?? attachment.diffRequest?.source?.tabId
      ?? aiChatComposerDiffSourceTabId;
    const diffTarget = normalizeCommentTarget(diffTabContent?.diffTarget)
      ?? normalizeCommentTarget(attachment.diffRequest?.issueTarget)
      ?? normalizeCommentTarget(selectedAiChatScenario?.diffRequest?.issueTarget);

    setIdeTabContents((prev) => {
      const existing = prev[diffTabId];
      if (!existing) return prev;
      const previousSessionComments = normalizeDiffSessionCommentsByChatId(existing.diffSessionCommentsByChatId);
      const { [targetChatId]: _removedSession, ...remainingSessionComments } = previousSessionComments;
      const nextMergedDiffComments = mergeDiffCommentsFromSessions(remainingSessionComments);

      return {
        ...prev,
        [diffTabId]: {
          ...existing,
          initialDiffComments: nextMergedDiffComments,
          diffSessionCommentsByChatId: remainingSessionComments,
          diffCommentsReadOnly: false,
        },
      };
    });

    setAiChatComposerDiffTabByChatId((prev) => {
      if (prev[targetChatId] !== diffTabId) {
        return prev;
      }
      const { [targetChatId]: _removedDiffTabId, ...rest } = prev;
      return rest;
    });

    updatePlanDiffUiStateForTab({
      activeRowId: planDiffUiStates[diffTabId]?.activeRowId ?? null,
      commentRowId: null,
      commentValue: '',
      commentEditingIndex: null,
      caretState: planDiffUiStates[diffTabId]?.caretState ?? {
        rowId: planDiffUiStates[diffTabId]?.activeRowId ?? null,
        left: 12,
      },
    }, diffTabId);

    if (!diffSourceTabId || !diffTarget) return;

    syncDiffCommentsToTaskTarget({
      sourceTabId: diffSourceTabId,
      target: diffTarget,
      comments: remainingDiffCommentsForTask,
      sectionTitle: diffTarget.kind === 'plan' ? 'Plan' : 'Acceptance Criteria',
      line: diffTabContent?.diffLineText ?? attachment.diffRequest?.text ?? '',
      sourceKind: attachment.isPlainFile ? 'file' : 'diff',
      sourceLabel: attachment.isPlainFile
        ? attachment.label
        : (diffTabContent?.diffData?.title ?? attachment.label),
      sourceIcon: attachment.isPlainFile
        ? attachment.icon
        : DIFF_TAB_ICON_NAME,
      sourceNavigationTabId: diffTabId,
    });
  }, [
    activeSourceEditorTabId,
    aiChatComposerDiffSourceTabId,
    generationTabId,
    getAiChatScenarioById,
    getSourceTabIdFromSddAttachment,
    getTaskRuntimeState,
    ideTabContents,
    planDiffUiStates,
    selectedAiChatId,
    selectedAiChatScenario?.diffRequest?.issueTarget,
    syncDiffCommentsToTaskTarget,
    updatePlanDiffUiStateForTab,
  ]);

  const handleClearAllComposerDiffAttachments = useCallback((context = {}) => {
    const targetChatId = typeof context?.chatId === 'string' && context.chatId.trim().length > 0
      ? context.chatId
      : selectedAiChatId;
    const attachmentsToClear = Array.isArray(context?.attachments) && context.attachments.length > 0
      ? context.attachments
      : aiChatComposerDiffAttachments;
    const diffAttachmentsToClear = attachmentsToClear.filter((attachment) => (
      attachment?.diffTabId
      && Number.isFinite(attachment?.commentCount)
      && attachment.commentCount > 0
    ));
    const sddAttachmentsToClear = attachmentsToClear.filter((attachment) => (
      attachment?.isSddDocument
      && Number.isFinite(attachment?.commentCount)
      && attachment.commentCount > 0
    ));
    if (diffAttachmentsToClear.length === 0 && sddAttachmentsToClear.length === 0) return;

    setIdeTabContents((prev) => {
      const next = { ...prev };
      for (const attachment of diffAttachmentsToClear) {
        const tabId = attachment.diffTabId;
        const existing = next[tabId];
        if (!existing) continue;
        const previousSessions = normalizeDiffSessionCommentsByChatId(existing.diffSessionCommentsByChatId);
        const { [targetChatId]: _removed, ...remaining } = previousSessions;
        next[tabId] = {
          ...existing,
          initialDiffComments: {},
          diffSessionCommentsByChatId: remaining,
        };
      }
      return next;
    });
    setAiChatComposerDiffTabByChatId((prev) => {
      const { [targetChatId]: _removed, ...rest } = prev;
      return rest;
    });
    sddAttachmentsToClear.forEach((attachment) => {
      handleRemoveComposerAttachment(attachment, { chatId: targetChatId });
    });
  }, [
    aiChatComposerDiffAttachments,
    handleRemoveComposerAttachment,
    selectedAiChatId,
  ]);

  const getPendingCommentRowsByTabIdFromAttachments = useCallback((attachments = []) => (
    (Array.isArray(attachments) ? attachments : []).reduce((entries, attachment) => {
      const addRows = (tabId, rowIds = []) => {
        if (!tabId || rowIds.length === 0) return entries;
        entries[tabId] = Array.from(new Set([
          ...(entries[tabId] ?? []),
          ...rowIds,
        ]));
        return entries;
      };

      if (attachment?.diffTabId) {
        addRows(attachment.diffTabId, Object.keys(normalizeStoredDiffCommentsState(attachment.diffComments)));
      }

      normalizeSpecVersionCommentEntries(attachment?.sddCommentEntries).forEach((entry) => {
        const sourceTabId = typeof entry?.sourceNavigationTabId === 'string' && entry.sourceNavigationTabId.length > 0
          ? entry.sourceNavigationTabId
          : null;
        const rowIds = Object.keys(normalizeStoredDiffCommentsState(entry?.diffComments));
        const sourceRowId = typeof entry?.sourceNavigationRowId === 'string' && entry.sourceNavigationRowId.length > 0
          ? entry.sourceNavigationRowId
          : null;
        addRows(sourceTabId, rowIds.length > 0 ? rowIds : (sourceRowId ? [sourceRowId] : []));
      });

      return entries;
    }, {})
  ), []);

  const getPendingCommentSnapshotsByTabIdFromAttachments = useCallback((attachments = []) => (
    (Array.isArray(attachments) ? attachments : []).reduce((entries, attachment) => {
      const addComments = (tabId, comments = {}) => {
        if (!tabId) return entries;
        const normalizedComments = normalizeStoredDiffCommentsState(comments);
        if (Object.keys(normalizedComments).length === 0) return entries;
        const pendingComments = Object.entries(normalizedComments).reduce((nextComments, [rowId, rowComments]) => ({
          ...nextComments,
          [rowId]: rowComments.map((comment) => ({
            ...((comment && typeof comment === 'object') ? comment : {}),
            text: getStoredCommentText(comment),
            pending: true,
          })),
        }), {});
        entries[tabId] = mergeStoredDiffCommentsStates(entries[tabId], pendingComments);
        return entries;
      };

      if (attachment?.diffTabId) {
        addComments(attachment.diffTabId, attachment.diffComments);
      }

      normalizeSpecVersionCommentEntries(attachment?.sddCommentEntries).forEach((entry) => {
        const sourceTabId = typeof entry?.sourceNavigationTabId === 'string' && entry.sourceNavigationTabId.length > 0
          ? entry.sourceNavigationTabId
          : null;
        addComments(sourceTabId, entry?.diffComments);
      });

      return entries;
    }, {})
  ), []);

  const handleCommentAttachmentResponseStart = useCallback(({ attachments = [] } = {}) => {
    const nextPendingRowsByTabId = getPendingCommentRowsByTabIdFromAttachments(attachments);
    const nextPendingSnapshotsByTabId = getPendingCommentSnapshotsByTabIdFromAttachments(attachments);

    if (Object.keys(nextPendingRowsByTabId).length === 0 && Object.keys(nextPendingSnapshotsByTabId).length === 0) return;

    if (Object.keys(nextPendingRowsByTabId).length > 0) {
      setPendingDiffCommentRowsByTabId((prev) => ({
        ...prev,
        ...nextPendingRowsByTabId,
      }));
    }
    if (Object.keys(nextPendingSnapshotsByTabId).length > 0) {
      setPendingDiffCommentSnapshotsByTabId((prev) => {
        const next = { ...prev };
        Object.entries(nextPendingSnapshotsByTabId).forEach(([tabId, comments]) => {
          next[tabId] = mergeStoredDiffCommentsStates(next[tabId], comments);
        });
        return next;
      });
    }
  }, [getPendingCommentRowsByTabIdFromAttachments, getPendingCommentSnapshotsByTabIdFromAttachments]);

  const handleCommentAttachmentResponseComplete = useCallback(({ attachments = [] } = {}) => {
    const completedRowsByTabId = getPendingCommentRowsByTabIdFromAttachments(attachments);
    const completedSnapshotsByTabId = getPendingCommentSnapshotsByTabIdFromAttachments(attachments);

    if (Object.keys(completedRowsByTabId).length === 0 && Object.keys(completedSnapshotsByTabId).length === 0) return;

    if (Object.keys(completedRowsByTabId).length > 0) {
      setPendingDiffCommentRowsByTabId((prev) => {
        const next = { ...prev };
        Object.entries(completedRowsByTabId).forEach(([diffTabId, completedRowIds]) => {
          const completedRowIdSet = new Set(completedRowIds);
          const remainingRowIds = (next[diffTabId] ?? []).filter((rowId) => !completedRowIdSet.has(rowId));
          if (remainingRowIds.length > 0) {
            next[diffTabId] = remainingRowIds;
            return;
          }
          delete next[diffTabId];
        });
        return next;
      });
    }
    if (Object.keys(completedSnapshotsByTabId).length > 0) {
      setPendingDiffCommentSnapshotsByTabId((prev) => {
        const next = { ...prev };
        Object.keys(completedSnapshotsByTabId).forEach((tabId) => {
          delete next[tabId];
        });
        return next;
      });
    }
  }, [getPendingCommentRowsByTabIdFromAttachments, getPendingCommentSnapshotsByTabIdFromAttachments]);

  const handleOpenSddDocument = useCallback((context = {}) => {
    const sourceTabId = context?.sourceTabId
      ?? getSourceTabIdFromSddAttachment(context?.attachment)
      ?? visibleEditorStateTabId
      ?? activeEditorTabId
      ?? generationTabId;
    const sourceTab = ideTabs.find((tab) => tab.id === sourceTabId) ?? null;
    const attachmentLabel = typeof context?.attachment?.label === 'string'
      ? context.attachment.label.trim()
      : '';

    if (sourceTabId) {
      const existingTabIndex = ideTabs.findIndex((tab) => tab.id === sourceTabId);
      if (existingTabIndex >= 0) {
        setScreen('ide');
        setActiveEditorTab(existingTabIndex);
        return;
      }
      if (sourceTabId.startsWith('agent-task-')) {
        handleAgentTaskSelect(sourceTabId.slice('agent-task-'.length));
        return;
      }
    }
    openEditorTabByLabel(sourceTab?.label || attachmentLabel || TERMINAL_TASK_TAB_BASE_LABEL);
  }, [
    activeEditorTabId,
    generationTabId,
    getSourceTabIdFromSddAttachment,
    handleAgentTaskSelect,
    ideTabs,
    openEditorTabByLabel,
    visibleEditorStateTabId,
  ]);

  const handleOpenAttachmentSource = useCallback(({ attachment = null, source = null, messageId = null, chatId = null, archived = true } = {}) => {
    const targetTabId = source?.navigationTabId ?? null;
    if (!targetTabId) return;
    const targetRawIndex = Number.isInteger(source?.rawIndex)
      ? source.rawIndex
      : (Number.isInteger(source?.lineNumber) && source.lineNumber > 0 ? source.lineNumber - 1 : null);

    if (
      targetTabId === attachment?.diffTabId
      && !attachment?.isPlainFile
      && attachment?.diffRequest
    ) {
      openPlanDiffTab({
        ...attachment.diffRequest,
        initialDiffCommentsOverride: attachment.diffComments ?? {},
        commentsReadOnly: archived,
        contextMessageId: messageId,
        contextChatId: chatId,
        navigation: {
          activeRowId: source?.navigationRowId ?? Object.keys(attachment.diffComments ?? {})[0] ?? null,
        },
      });
      return;
    }

    const targetTabIndex = ideTabs.findIndex((tab) => tab?.id === targetTabId);
    if (targetTabIndex >= 0) {
      setScreen('ide');
      setActiveEditorTab(targetTabIndex);
    } else if (typeof source?.label === 'string' && source.label.trim().length > 0) {
      openEditorTabByLabel(source.label);
    }

    if (source?.navigationRowId) {
      updatePlanDiffUiStateForTab({
        activeRowId: source.navigationRowId,
        commentRowId: null,
        commentValue: '',
        commentEditingIndex: null,
        caretState: {
          rowId: source.navigationRowId,
          left: 12,
        },
      }, targetTabId);
    }

    if (targetTabId === attachment?.sourceTabId) {
      handleOpenSddDocument({
        commentEntries: attachment?.sddCommentEntries ?? [],
        isCommentAttachment: Boolean(attachment?.isSddCommentAttachment),
        sourceTabId: attachment?.sourceTabId,
      });
    }

    if (Number.isInteger(targetRawIndex)) {
      requestProblemHighlight(targetRawIndex, targetTabId);
    }
  }, [handleOpenSddDocument, ideTabs, openEditorTabByLabel, openPlanDiffTab, requestProblemHighlight, updatePlanDiffUiStateForTab]);

  const handleOpenSpecCommentSource = useCallback((issue = null) => {
    const targetTabId = typeof issue?.navigationTabId === 'string' ? issue.navigationTabId : null;
    if (!targetTabId) return;

    const targetTabIndex = ideTabs.findIndex((tab) => tab?.id === targetTabId);
    if (targetTabIndex >= 0) {
      setScreen('ide');
      setActiveEditorTab(targetTabIndex);
    } else {
      const sourceLabel = getCommentIssueSourceLabel(issue);
      if (sourceLabel) {
        openEditorTabByLabel(sourceLabel);
      }
    }

    if (issue?.navigationRowId) {
      updatePlanDiffUiStateForTab({
        activeRowId: issue.navigationRowId,
        commentRowId: null,
        commentValue: '',
        commentEditingIndex: null,
        caretState: {
          rowId: issue.navigationRowId,
          left: 12,
        },
      }, targetTabId);
    }

    const targetRawIndex = Number.isInteger(issue?.rawIndex)
      ? issue.rawIndex
      : (Number.isInteger(issue?.lineNumber) && issue.lineNumber > 0 ? issue.lineNumber - 1 : null);
    if (Number.isInteger(targetRawIndex)) {
      requestProblemHighlight(targetRawIndex, targetTabId);
    }
  }, [ideTabs, openEditorTabByLabel, requestProblemHighlight, updatePlanDiffUiStateForTab]);

  const handleOpenPlainFileArchive = useCallback((tabId, diffComments, contextMessageId, contextChatId, activeRowId = null, { archived = true } = {}) => {
    const tabIndex = ideTabs.findIndex((tab) => tab.id === tabId);
    if (tabIndex < 0) return;
    const scenario = getAiChatScenarioById(contextChatId);
    const listItem = getAiChatListItemById(contextChatId);
    const normalizedComments = normalizeStoredDiffCommentsState(diffComments);
    setIdeTabContents((prev) => {
      const existing = prev[tabId];
      if (!existing) return prev;
      const previousSessions = normalizeDiffSessionCommentsByChatId(existing.diffSessionCommentsByChatId);
      const nextSessions = Object.keys(normalizedComments).length > 0
        ? {
            ...previousSessions,
            [contextChatId]: {
              chatId: contextChatId,
              messageId: contextMessageId ?? scenario?.messageId ?? `chat-${contextChatId}`,
              title: scenario?.title ?? contextChatId,
              icon: listItem?.icon ?? 'claude',
              comments: normalizedComments,
            },
          }
        : previousSessions;
      return {
        ...prev,
        [tabId]: {
          ...existing,
          initialDiffComments: archived ? {} : normalizedComments,
          diffSessionCommentsByChatId: nextSessions,
          diffCommentsReadOnly: Boolean(archived),
          diffContextMessageId: archived ? contextMessageId : null,
          diffContextChatId: archived ? contextChatId : null,
        },
      };
    });
    setScreen('ide');
    setActiveEditorTab(tabIndex);
    if (activeRowId) {
      updatePlanDiffUiStateForTab({
        activeRowId,
        commentRowId: null,
        commentValue: '',
        commentEditingIndex: null,
        caretState: {
          rowId: activeRowId,
          left: 12,
        },
      }, tabId);
    }
  }, [getAiChatListItemById, getAiChatScenarioById, ideTabs, updatePlanDiffUiStateForTab]);

  const handleActivePlanDiffUiStateChange = useCallback((uiState) => {
    updatePlanDiffUiStateForTab(uiState, activeTabId);
  }, [activeTabId, updatePlanDiffUiStateForTab]);
  const navigateActivePlanDiffAgentTask = useCallback((direction) => {
    if (!activePlanDiffSourceTabId) return;

    const sourceTab = ideTabs.find((tab) => tab.id === activePlanDiffSourceTabId) ?? null;
    const taskId = getAgentTaskIdForEditorTab(sourceTab, agentTasks)
      ?? (activePlanDiffSourceTabId.startsWith('agent-task-') ? activePlanDiffSourceTabId.slice('agent-task-'.length) : null);
    const taskTree = taskId ? agentTaskPlanTreesByTaskId?.[taskId] : null;
    const navigationEntries = Object.entries(taskTree?.navigationByNodeId ?? {})
      .filter(([, entry]) => entry?.type === 'file')
      .map(([nodeId, entry]) => ({ nodeId, entry }));

    if (navigationEntries.length === 0) return;

    const activeTarget = normalizeCommentTarget(activePlanDiffTarget);
    const activeRowId = activePlanDiffUiState?.activeRowId ?? activePlanDiffData?.focusRowId ?? null;
    const currentIndex = navigationEntries.findIndex(({ entry }) => {
      const entryTarget = normalizeCommentTarget(entry?.issueTarget);
      if (!entryTarget || !activeTarget || entryTarget.kind !== activeTarget.kind || entryTarget.index !== activeTarget.index) {
        return false;
      }

      return !activeRowId || entry.activeRowId === activeRowId;
    });
    const fallbackIndex = navigationEntries.findIndex(({ entry }) => {
      const entryTarget = normalizeCommentTarget(entry?.issueTarget);
      return Boolean(entryTarget && activeTarget && entryTarget.kind === activeTarget.kind && entryTarget.index === activeTarget.index);
    });
    const resolvedCurrentIndex = currentIndex >= 0 ? currentIndex : fallbackIndex;
    const baseIndex = resolvedCurrentIndex >= 0 ? resolvedCurrentIndex : (direction > 0 ? -1 : navigationEntries.length);
    const nextIndex = Math.min(Math.max(baseIndex + direction, 0), navigationEntries.length - 1);
    const nextNavigation = navigationEntries[nextIndex];
    if (!nextNavigation || nextIndex === resolvedCurrentIndex) return;

    setAgentTasksFocusedNodeId(nextNavigation.nodeId);
    handleAgentTaskPlanTreeNodeSelect(taskId, nextNavigation.nodeId);
  }, [
    activePlanDiffData?.focusRowId,
    activePlanDiffSourceTabId,
    activePlanDiffTarget,
    activePlanDiffUiState?.activeRowId,
    agentTaskPlanTreesByTaskId,
    agentTasks,
    handleAgentTaskPlanTreeNodeSelect,
    ideTabs,
  ]);
  const handleCommitPanelClick = useCallback((event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('input, .checkbox, .checkbox-box')) return;

    const commitWindow = target.closest('.commit-window');
    if (!commitWindow) return;

    const fileNameNode = target.closest('.commit-file-name');
    const treeNode = target.closest('.tree-node');
    const clickedLabel = fileNameNode instanceof HTMLElement
      ? fileNameNode.textContent?.trim()
      : treeNode instanceof HTMLElement
        ? (
            treeNode.textContent?.includes('FunctionUtils.java')
              ? 'FunctionUtils.java'
              : treeNode.textContent?.includes('AdapterScript.java')
                ? 'AdapterScript.java'
                : ''
          )
        : '';
    const diffRequest = clickedLabel === 'AdapterScript.java'
      ? AI_CHAT_VISIT_CONTROLLER_DIFF_REQUEST
      : clickedLabel === 'FunctionUtils.java'
        ? AI_CHAT_VISIT_DIFF_REQUEST
        : null;

    if (!diffRequest) return;
    if (!(treeNode instanceof HTMLElement)) return;

    event.preventDefault();
    openPlanDiffTab(diffRequest);
  }, [openPlanDiffTab]);
  useEffect(() => {
    if (screen !== 'ide') return undefined;

    const handleDocumentCommitClick = (event) => {
      handleCommitPanelClick(event);
    };

    document.addEventListener('pointerdown', handleDocumentCommitClick, true);
    document.addEventListener('click', handleDocumentCommitClick, true);
    return () => {
      document.removeEventListener('pointerdown', handleDocumentCommitClick, true);
      document.removeEventListener('click', handleDocumentCommitClick, true);
    };
  }, [handleCommitPanelClick, screen]);
  const handleActivePlanMarkerClick = useCallback(() => {
    if (!activePlanDiffSourceTabId) return;

    const sourceTabIndex = ideTabs.findIndex((tab) => tab.id === activePlanDiffSourceTabId);
    const sourceTab = sourceTabIndex >= 0
      ? ideTabs[sourceTabIndex]
      : { id: activePlanDiffSourceTabId, label: '' };
    const taskId = getAgentTaskIdForEditorTab(sourceTab, agentTasks)
      ?? (activePlanDiffSourceTabId.startsWith('agent-task-') ? activePlanDiffSourceTabId.slice('agent-task-'.length) : null);

    setScreen('ide');

    if (sourceTabIndex >= 0) {
      setActiveEditorTab(sourceTabIndex);
      restoreSpecDoneScrollForTab(activePlanDiffSourceTabId);
    }

    if (taskId) {
      setSelectedTask(taskId);
      setIdeOpenWindows((prev) => (
        prev.includes(CHATS_HISTORY_TOOL_WINDOW_ID) ? prev : [...prev, CHATS_HISTORY_TOOL_WINDOW_ID]
      ));

      setAgentTasksFocusedNodeId(buildAgentTaskTreeTaskNodeId(taskId));
    }
  }, [activePlanDiffSourceTabId, activePlanDiffTarget, agentTasks, ideTabs, restoreSpecDoneScrollForTab]);
  const getEditorTabRunningTone = useCallback((tab) => {
    if (!tab?.id?.startsWith('agent-task-')) return null;

    const taskState = getTaskRuntimeState(tab.id)?.taskState ?? null;
    const taskRunState = runStatesByTab[tab.id] ?? 'default';

    if (taskRunState === 'running' || taskState?.genState === 'loading' || taskState?.genState === 'generating') {
      return 'green';
    }

    return null;
  }, [getTaskRuntimeState, runStatesByTab]);
  const renderedIdeTabs = useMemo(() => (
    ideTabs.map((tab) => {
      const shouldUseDiffIcon =
        Boolean(ideTabContents[tab.id]?.diffData) ||
        tab.id?.startsWith('plan-diff-') ||
        tab.id?.startsWith('spec-version-diff-');
      const runningTone = getEditorTabRunningTone(tab);

      if (runningTone) {
        const baseIcon = shouldUseDiffIcon ? DIFF_TAB_ICON_NAME : tab.icon;
        return {
          ...tab,
          icon: <EditorTabRunningIcon icon={baseIcon} tone={runningTone} />,
        };
      }

      if (shouldUseDiffIcon && tab.icon !== DIFF_TAB_ICON_NAME) {
        return { ...tab, icon: DIFF_TAB_ICON_NAME };
      }

      return tab;
    })
  ), [getEditorTabRunningTone, ideTabContents, ideTabs]);
  const activeStatusBarTab = activeEditorTabMeta ?? ideTabs[activeEditorTab ?? 0] ?? null;
  const activeRenderedStatusBarTab = activeStatusBarTab
    ? (renderedIdeTabs.find((tab) => tab.id === activeStatusBarTab.id) ?? activeStatusBarTab)
    : null;
  const activeStatusBarSourceTab = activeSourceEditorTabId
    ? (ideTabs.find((tab) => tab.id === activeSourceEditorTabId) ?? null)
    : null;
  const activeStatusBarTaskTab = (() => {
    if (activeStatusBarSourceTab?.id?.startsWith('agent-task-') || activeStatusBarSourceTab?.label?.endsWith('.md')) {
      return activeStatusBarSourceTab;
    }
    if (activeStatusBarTab?.id?.startsWith('agent-task-') || activeStatusBarTab?.label?.endsWith('.md')) {
      return activeStatusBarTab;
    }
    const taskId = getAgentTaskIdForEditorTab(activeStatusBarTab, agentTasks) ?? selectedTask;
    const taskTabId = taskId ? getAgentTaskTabId(taskId) : null;
    return taskTabId ? (ideTabs.find((tab) => tab.id === taskTabId) ?? null) : null;
  })();
  const activeRenderedStatusBarTaskTab = activeStatusBarTaskTab
    ? (renderedIdeTabs.find((tab) => tab.id === activeStatusBarTaskTab.id) ?? activeStatusBarTaskTab)
    : null;
  const activeStatusBarProjectFileName = (() => {
    if (isDiffTab && typeof activePlanDiffData?.sourceTabLabel === 'string' && activePlanDiffData.sourceTabLabel.trim().length > 0) {
      return activePlanDiffData.sourceTabLabel.trim();
    }
    if (activeStatusBarTab?.id?.startsWith('agent-task-') || activeStatusBarTab?.label?.endsWith('.md')) {
      return null;
    }
    if (activeStatusBarTab && !activeStatusBarTab.id?.startsWith('agent-task-') && !activeStatusBarTab.label?.endsWith('.md')) {
      return activeStatusBarTab.label ?? null;
    }
    return findFirstProjectFileFromRunStatuses(activeAgentTaskAcRunResult, activeAgentTaskPlanRunResult);
  })();
  const ideStatusBarBreadcrumbs = [
    ...(activeStatusBarTaskTab
      ? [{
          icon: false,
          label: (
            <StatusBarActiveFileLabel
              icon={activeRenderedStatusBarTaskTab?.icon ?? 'fileTypes/markdown'}
              label={activeStatusBarTaskTab.label ?? TERMINAL_TASK_TAB_BASE_LABEL}
            />
          ),
        }]
      : []),
    ...(activeStatusBarProjectFileName
      ? [{
          icon: false,
          label: (
            <StatusBarActiveFileLabel
              icon={resolveAgentTaskPlanFileIcon(activeStatusBarProjectFileName)}
              label={activeStatusBarProjectFileName}
            />
          ),
        }]
      : (!activeStatusBarTaskTab && activeStatusBarTab
          ? [{
              icon: false,
              label: (
                <StatusBarActiveFileLabel
                  icon={activeRenderedStatusBarTab?.icon ?? 'fileTypes/text'}
                  label={activeStatusBarTab.label ?? PRIMARY_BREADCRUMBS[2]}
                />
              ),
            }]
      : [])),
  ];
  const projectTreeData = [{
    ...MY_PROJECT_TREE[0],
    children: MY_PROJECT_TREE[0].children,
  }];
  const settingsDialogPortal = isSettingsDialogOpen && typeof document !== 'undefined'
    ? createPortal(
        <div className="theme-dark main-window-overlay main-window-overlay-modal app-settings-dialog-layer" onMouseDown={() => setIsSettingsDialogOpen(false)}>
          <div className="main-window-overlay-dialog" onMouseDown={(event) => event.stopPropagation()}>
            <SettingsDialog
              title="Settings"
              width={900}
              height={600}
              treeItems={DEFAULT_SETTINGS_TREE_ITEMS}
              buttons={[
                { children: 'Cancel', onClick: () => setIsSettingsDialogOpen(false) },
                { children: 'OK', type: 'primary', onClick: () => setIsSettingsDialogOpen(false) },
              ]}
              onClose={() => setIsSettingsDialogOpen(false)}
            >
              <AppSettingsDialogContent
                plainFileGutterCommentsEnabled={plainFileGutterCommentsEnabled}
                onPlainFileGutterCommentsEnabledChange={setPlainFileGutterCommentsEnabled}
                diffGutterCommentsEnabled={diffGutterCommentsEnabled}
                onDiffGutterCommentsEnabledChange={setDiffGutterCommentsEnabled}
              />
            </SettingsDialog>
          </div>
        </div>,
        document.body,
      )
    : null;

  if (screen === 'welcome') {
    return (
      <ThemeProvider defaultTheme="dark">
        <MainWindow
          key="welcome"
          width={1100}
          height={800}
          projectName={PROJECT_NAME}
          projectIcon="CM"
          projectColor="blue"
          branchName={BRANCH_NAME}
          toolbar={(
            <MainToolbar
              projectName={PROJECT_NAME}
              projectIcon="CM"
              projectColor="blue"
              branchName={BRANCH_NAME}
              runConfig={RUN_CONFIGURATION_NAME}
              rightActions={(
              <>
                  <ReferenceMainToolbarNewChatPicker
                    onNewChat={createEmptyAiChatSession}
                    onNewSpec={handleSpecModeStart}
                    aiMode={newSessionMode}
                    onAiModeChange={setNewSessionMode}
                    selectedSpecTemplateId={newSessionSpecKind}
                    onSpecTemplateChange={setNewSessionSpecKind}
                  />
                  <MainToolbarIconButton icon="general/search@20x20" tooltip="Search Everywhere" />
                  <MainToolbarIconButton icon="general/settings@20x20" tooltip="Settings" onClick={() => setIsSettingsDialogOpen(true)} />
                </>
              )}
            />
          )}

          editorTabs={[{ id: 'welcome', label: 'Welcome Screen', icon: (() => { const C = getIcon('ij-platform-logo'); return C ? <C width={16} height={16} /> : null; })(), closable: true }]}
          editorTopBar={<WelcomeGradientArea onNewAgentTask={openNewAgentTask} />}

          leftStripeItems={[
            ...MY_LEFT_STRIPE,
            { id: CHATS_HISTORY_TOOL_WINDOW_ID, icon: 'aiAssistant/toolWindowChat@20x20', tooltip: 'Agents', section: 'top' },
            { id: '_sep',        separator: true,                                                   section: 'top'    },
            { id: 'terminal',    icon: 'toolwindows/terminal@20x20', tooltip: 'Terminal', panel: 'bottom', section: 'bottom' },
            { id: 'git',         icon: 'toolwindows/vcs@20x20',      tooltip: 'Git',      panel: 'bottom', section: 'bottom' },
            { id: 'problems',    icon: 'toolwindows/problems@20x20', tooltip: 'Problems', panel: 'bottom', section: 'bottom' },
          ]}
          rightStripeItems={MY_RIGHT_STRIPE}
          defaultOpenToolWindows={['project']}
          initialLeftPanelWidth={303}

          leftPanelContent={(id, ctx) => {
            if (id === 'project') return (
              <WelcomeProjectsPanel
                onNewProject={() => setScreen('ide')}
                onProjectSelect={() => setScreen('ide')}
                onNewAgentTask={openNewAgentTask}
                ctx={ctx}
              />
            );
            if (id === CHATS_HISTORY_TOOL_WINDOW_ID) return (
              <ChatsHistoryToolWindow
                ctx={ctx}
                activeChatId={selectedAiChatId ?? AIUX_NEW_SESSION_TAB_ID}
                agentTasks={agentTasks}
                chatRows={aiSessionChatRows}
                onOpenNewSession={openNewSessionTab}
                onOpenSpecTask={openSpecTaskOnly}
                onOpenSpecChat={openSpecChatFromRecents}
                onOpenChatInTab={openChatInEditorTab}
                onSettings={() => setIsSettingsDialogOpen(true)}
              />
            );
            return defaultLeftPanelContent(id, ctx);
          }}
	          rightPanelContent={(id, ctx) => defaultRightPanelContent(id, ctx)}
          bottomPanelContent={(id, ctx) => renderBottomPanelContent(id, ctx)}

          statusBarProps={{
            breadcrumbs: [
              { label: PRIMARY_BREADCRUMBS[0], module: true },
              { label: PRIMARY_BREADCRUMBS[1] },
              { label: PRIMARY_BREADCRUMBS[2], icon: true, iconName: 'fileTypes/java' },
            ],
            widgets: [
              { type: 'text', text: '42:1' },
              { type: 'text', text: 'UTF-8' },
              { type: 'text', text: 'LF' },
            ],
          }}
        />
        {settingsDialogPortal}
        {editorTabsMorePortal}
        {terminalPermissionPortal}
      </ThemeProvider>
    );
  }
  const handlePlanDiffRowDelete = (rowId, comment) => {
    if (!activeTabId || !isDiffTab) return;

    const deletedRow = activePlanDiffData?.rows?.find((row) => row.id === rowId);
    const deletedLineText = deletedRow?.text ?? '';

    setIdeTabContents((prev) => {
      const tabContent = prev[activeTabId];
      if (!tabContent?.diffData?.rows) return prev;
      const nextRows = tabContent.diffData.rows.filter((row) => row.id !== rowId);
      return {
        ...prev,
        [activeTabId]: {
          ...tabContent,
          diffData: {
            ...tabContent.diffData,
            rows: nextRows,
          },
        },
      };
    });

    if (activePlanDiffTarget && activePlanDiffSourceTabId) {
      syncDiffCommentsToTaskTarget({
        sourceTabId: activePlanDiffSourceTabId,
        target: activePlanDiffTarget,
        comments: { [rowId]: [comment || 'delete'] },
        sectionTitle: activePlanDiffTarget.kind === 'plan' ? 'Plan' : 'Acceptance Criteria',
        line: deletedLineText,
        sourceKind: isPlainFileOverlayTab ? 'file' : 'diff',
        sourceLabel: isPlainFileOverlayTab
          ? (activePlanDiffData?.sourceTabLabel ?? 'File')
          : (activePlanDiffData?.title || `Diff ${activePlanDiffData?.sourceTabLabel ?? 'File'}`),
        sourceIcon: isPlainFileOverlayTab
          ? resolveAgentTaskPlanFileIcon(activePlanDiffData?.sourceTabLabel ?? 'File')
          : DIFF_TAB_ICON_NAME,
        sourceNavigationTabId: activeTabId,
        sourceNavigationRowId: rowId,
      });
    }
  };
  const handlePlanDiffRowFix = (rowId, comment) => {
    if (!activePlanDiffTarget) return;

    const fixedRow = activePlanDiffData?.rows?.find((row) => row.id === rowId);
    const fixedLineText = fixedRow?.text ?? '';

    if (activePlanDiffSourceTabId) {
      syncDiffCommentsToTaskTarget({
        sourceTabId: activePlanDiffSourceTabId,
        target: activePlanDiffTarget,
        comments: { [rowId]: [comment || 'fix'] },
        sectionTitle: activePlanDiffTarget.kind === 'plan' ? 'Plan' : 'Acceptance Criteria',
        line: fixedLineText,
        sourceKind: isPlainFileOverlayTab ? 'file' : 'diff',
        sourceLabel: isPlainFileOverlayTab
          ? (activePlanDiffData?.sourceTabLabel ?? 'File')
          : (activePlanDiffData?.title || `Diff ${activePlanDiffData?.sourceTabLabel ?? 'File'}`),
        sourceIcon: isPlainFileOverlayTab
          ? resolveAgentTaskPlanFileIcon(activePlanDiffData?.sourceTabLabel ?? 'File')
          : DIFF_TAB_ICON_NAME,
        sourceNavigationTabId: activeTabId,
        sourceNavigationRowId: rowId,
      });
    }

    handleDoneIssueFix({
      kind: activePlanDiffTarget.kind,
      index: activePlanDiffTarget.index,
    });
  };
  return (
    <ThemeProvider defaultTheme="dark">
      <MainWindow
        key={`ide-${ideOpenWindows.join('-')}`}
        height={865}
        projectName={PROJECT_NAME}
        projectIcon="CM"
        projectColor="blue"
        branchName={BRANCH_NAME}
        toolbar={(
          <MainToolbar
            projectName={PROJECT_NAME}
            projectIcon="CM"
            projectColor="blue"
            branchName={BRANCH_NAME}
            runConfig={RUN_CONFIGURATION_NAME}
            onSettings={() => setIsSettingsDialogOpen(true)}
            rightActions={(
              <>
                <ReferenceMainToolbarNewChatPicker
                  onNewChat={createEmptyAiChatSession}
                  onNewSpec={handleSpecModeStart}
                  onNewTerminal={openNewSessionTerminal}
                  aiMode={newSessionMode}
                  onAiModeChange={setNewSessionMode}
                  selectedSpecTemplateId={newSessionSpecKind}
                  onSpecTemplateChange={setNewSessionSpecKind}
                />
                <MainToolbarIconButton icon="general/search@20x20" tooltip="Search Everywhere" />
                <MainToolbarIconButton icon="general/settings@20x20" tooltip="Settings" onClick={() => setIsSettingsDialogOpen(true)} />
              </>
            )}
          />
        )}

        editorTabs={renderedIdeTabs}
        editorTabContents={ideTabContents}
        activeEditorTab={activeEditorTab}
        onEditorTabChange={handleEditorTabChange}
        onEditorTabClose={handleEditorTabClose}
        onEditorCodeChange={(code) => {
          const tabId = ideTabs[activeEditorTab]?.id;
          if (!tabId?.startsWith('agent-task-')) return;
          setIdeTabContents((prev) => ({
            ...prev,
            [tabId]: {
              ...(prev[tabId] ?? {}),
              language: 'markdown',
              code,
            },
          }));
        }}
        editorTopBar={
          isAiuxNewSessionTab
            ? (
	              <AIUXNewSessionEditor
	                onOpenSpec={handleSpecModeStart}
	                onOpenSpecTask={openSpecTaskOnly}
	                onOpenChat={openNewSessionChat}
                onOpenExistingChat={openChatInEditorTab}
                onOpenTerminal={openNewSessionTerminal}
                onOpenSpecChat={openSpecChatFromRecents}
                agentTasks={agentTasks}
                chatRows={aiSessionChatRows}
                sessionMode={newSessionMode}
                onSessionModeChange={setNewSessionMode}
                selectedSpecTemplateId={newSessionSpecKind}
                onSpecTemplateChange={setNewSessionSpecKind}
              />
            )
            : isAiChatTab
            ? (
                <div className="aiux543-chat-editor-host">
                  <AiChatTabView
                    chatId={activeAiChatTabChatId}
                    scenarios={aiChatScenarios}
                    sentMessages={aiChatSentMessagesByChatId[activeAiChatTabChatId] ?? []}
                    fallbackTitle={activeEditorTabMeta?.label ?? 'AI Chat'}
                    onSendMessage={(targetChatId, text) => {
                      handleAiChatMessageSent?.(targetChatId, text);
                    }}
                  />
                </div>
              )
            : isAgentTaskTab
            ? <AgentTaskEditorArea genState={genState} genProgress={genProgress} onSend={startAgentTaskGeneration} onStop={() => setGenState('idle')} onRegenerate={startAgentTaskGeneration} onDoneRegenerate={handleDoneRegenerate} onFixIssue={handleDoneIssueFix} onOpenDiffTab={openPlanDiffTab} onOpenCheckChip={openEditorTabByLabel} onOpenCommentSource={handleOpenSpecCommentSource} onOpenVersionDiff={handleDoneVersionSelect} attachedFiles={attachedFiles} onRemoveAttached={(idx) => updateAttachedFilesForTab((files) => files.filter((_, i) => i !== idx))} onAddAttached={(item) => updateAttachedFilesForTab((files) => files.some((file) => file.label === item.label) ? files : [...files, { label: item.label, description: item.description }])} currentCode={activeAgentTaskCode} documentSections={activeAgentTaskDocumentSections} onOpenProblems={() => toggleIdeBottomToolWindow('problems')} onOpenTerminal={handleDoneOpenTerminal} addPopupFiles={addPopupFiles} acRunResult={activeAgentTaskAcRunResult} planRunResult={activeAgentTaskPlanRunResult} acWarningBanner={activeEditorAcWarningBanner} inspectionSummary={agentTaskInspectionSummary} versionHistory={activeVersionHistory} removedIssueIndices={activeAgentTaskRemovedIssueIndices} highlightedProblemLocation={highlightedProblemLocation?.tabId === activeEditorTabId ? highlightedProblemLocation : null} doneCommentEntries={activeAgentTaskCommentEntries} relatedCommentIssues={activeRelatedDiffCommentIssues} onDoneCommentsChange={handleDoneCommentsChange} commentResetToken={doneCommentResetToken} preserveDoneOverlayDuringBusy={Boolean(doneEnhanceFlowRef.current) && (genState === 'loading' || genState === 'generating')} runState={runState} activeRunRequest={runState === 'running' ? (visiblePendingTerminalRun ?? activeSpecDocumentRunRequest ?? lastTerminalRunRequestRef.current ?? null) : null} doneOverlayUiState={activeDoneOverlayUiState} onDoneOverlayUiStateChange={handleActiveDoneOverlayUiStateChange} onTopBarAction={handleAgentTaskTopBarAction} onTopBarStatusChange={setSpecTopBarStatusForTab} topBarStatus={activeSpecTopBarStatus} busyLabel={doneEnhanceFlowRef.current ? 'Specifying...' : (terminalDrivenGenerationRef.current ? 'Building...' : null)} specSessionKey={activeEditorTabId} commentContextLabel={activeSpecCommentContextLabel} commentContextSessionLabel="Related Chats" />
            : ((isDiffTab || isPlainFileOverlayTab) && activePlanDiffData
                ? (
                  <PlanDiffEditorArea
                    diffData={activePlanDiffData}
                    viewerData={activePlanDiffViewerData}
                    initialDiffComments={activePlanDiffCommentsWithPending}
                    documentDiffComments={activePlanDiffDocumentComments}
                    documentContextLabel={activePlanDiffDocumentContextLabel}
                    documentContextIcon="fileTypes/markdown"
                    documentContextSessionLabel={activePlanDiffDocumentContextSessionLabel}
                    documentContextSourceTabId={activePlanDiffDocumentSourceTabId}
                    defaultSubmitAttachMode={activePlanDiffDefaultSubmitAttachMode}
                    defaultSubmitTargetLabel={activePlanDiffDefaultSubmitTargetLabel}
                    defaultSubmitTargetIcon={activePlanDiffDefaultSubmitTargetIcon}
                    defaultSubmitTargetKey={activePlanDiffDefaultSubmitTargetKey}
                    commentsReadOnly={activePlanDiffCommentsReadOnly}
                    commentContextLabel={planDiffContextChatTitle}
                    commentContextIcon={planDiffContextChatIcon}
                    commentContextSessionLabel={planDiffContextSessionLabel}
	                    commentSessions={activePlanDiffSessionComments}
	                    commentSessionActiveChatId={selectedAiChatId}
	                    commentShortcutHintRowId={commentShortcutHintTarget?.tabId === activeTabId ? commentShortcutHintTarget.rowId : null}
	                    renderSubmitTargetPicker={renderCommentSubmitTargetPicker}
                    onDiffCommentsChange={handleActivePlanDiffCommentsChange}
                    onRowDelete={handlePlanDiffRowDelete}
                    onRowFix={handlePlanDiffRowFix}
                    onPlanMarkerClick={handleActivePlanMarkerClick}
                    onReturnToChat={handlePlanDiffReturnToChat}
                    onNavigatePrevious={() => navigateActivePlanDiffAgentTask(-1)}
                    onNavigateNext={() => navigateActivePlanDiffAgentTask(1)}
                    uiState={activePlanDiffUiState}
                    onUiStateChange={handleActivePlanDiffUiStateChange}
                    singleLineNumbers={isPlainFileOverlayTab}
                    showGutterComments={isPlainFileOverlayTab ? plainFileGutterCommentsEnabled : diffGutterCommentsEnabled}
                    plainFileGutterCommentsEnabled={plainFileGutterCommentsEnabled}
                    onPlainFileGutterCommentsEnabledChange={setPlainFileGutterCommentsEnabled}
                    diffGutterCommentsEnabled={diffGutterCommentsEnabled}
                    onDiffGutterCommentsEnabledChange={setDiffGutterCommentsEnabled}
                    pendingCommentRowIds={pendingDiffCommentRowsByTabId[activeTabId] ?? []}
                    inspectionWidget={isPlainFileOverlayTab ? (
                      <DoneInspectionWidget
                        className="plan-diff-inspection-widget"
                        onOpenProblems={() => toggleIdeBottomToolWindow('problems')}
                        warningCount={activePlainFileProblemSummary.warningCount}
                        errorCount={activePlainFileProblemSummary.errorCount}
                        commentCount={activePlainFileCommentIssues.length}
                      />
                    ) : null}
                  />
                )
                : undefined)
        }

        projectTreeData={projectTreeData}

        leftStripeItems={[
          ...MY_LEFT_STRIPE,
          { id: CHATS_HISTORY_TOOL_WINDOW_ID, icon: 'aiAssistant/toolWindowChat@20x20', tooltip: 'Agents', section: 'top' },
          { id: '_sep',        separator: true,                                                    section: 'top' },
          { id: 'terminal',    icon: 'toolwindows/terminal@20x20',  tooltip: 'Terminal',   panel: 'bottom', section: 'bottom' },
          { id: 'git',         icon: 'toolwindows/vcs@20x20',       tooltip: 'Git',        panel: 'bottom', section: 'bottom' },
          { id: 'problems',    icon: 'toolwindows/problems@20x20',  tooltip: 'Problems',   panel: 'bottom', section: 'bottom' },
        ]}
        rightStripeItems={MY_RIGHT_STRIPE}
        defaultOpenToolWindows={ideOpenWindows}
        initialLeftPanelWidth={303}

        leftPanelContent={(id, ctx) => {
          if (id === 'project') return (
            <ProjectToolWindowWithAiSessions
              ctx={ctx}
              projectTreeData={projectTreeData}
              selectedTaskId={isAiuxNewSessionTab ? AIUX_NEW_SESSION_TAB_ID : selectedTask}
              agentTasks={agentTasks}
              chatRows={aiSessionChatRows}
              showAllSessions={aiuxProjectShowAllSessions}
              selectedChatId={selectedAiChatId}
              onOpenNewSession={openNewSessionTab}
              onOpenSpecTask={openSpecTaskOnly}
              onOpenSpecChat={openSpecChatFromRecents}
              onOpenChatInTab={openChatInEditorTab}
              onShowAllSessions={showAllAiSessionsFromProject}
            />
          );
          if (id === CHATS_HISTORY_TOOL_WINDOW_ID) {
            if (chatsHistorySlotShowsAiChat) {
              return <ChatToolWindow ctx={ctx} onBackToHistory={() => { setChatsHistorySlotShowsAiChat(false); setSelectedAiChatId(null); }} onOpenDiffTab={openPlanDiffTab} onClearDiffComments={handleChatDiffCommentsClear} onClearAllDiffAttachments={handleClearAllComposerDiffAttachments} onRemoveComposerAttachment={handleRemoveComposerAttachment} onOpenPlainFileArchive={handleOpenPlainFileArchive} onOpenSddDocument={handleOpenSddDocument} onOpenAttachmentSource={handleOpenAttachmentSource} onNewChat={createEmptyAiChatSession} diffComments={aiChatComposerDiffComments} diffCommentCount={aiChatComposerDiffCommentCount} sddCommentEntries={normalizedSpecChatCommentEntries} sddCommentCount={specChatCommentCount} sddRelatedCommentIssues={activeRelatedDiffCommentIssues} composerDiffAttachments={aiChatComposerDiffAttachments} scrollTarget={chatScrollTarget} selectedChatId={selectedAiChatId} onSelectedChatIdChange={setSelectedAiChatId} sentChatMessages={selectedAiChatSentMessages} sentChatMessagesByChatId={aiChatSentMessagesByChatId} onSentChatMessagesChange={handleSelectedAiChatSentMessagesChange} onChatMessageSent={handleAiChatMessageSent} chatScenarios={aiChatScenarios} recentChatItems={aiChatRecentItems} olderChatItems={AI_CHAT_OLDER_THAN_7_ITEMS} plainFileGutterCommentsEnabled={plainFileGutterCommentsEnabled} onPlainFileGutterCommentsEnabledChange={setPlainFileGutterCommentsEnabled} diffGutterCommentsEnabled={diffGutterCommentsEnabled} onDiffGutterCommentsEnabledChange={setDiffGutterCommentsEnabled} fileCommentsOptionIsNew={fileCommentsOptionIsNew} diffCommentsOptionIsNew={diffCommentsOptionIsNew} onFileCommentsOptionSeen={() => setFileCommentsOptionIsNew(false)} onDiffCommentsOptionSeen={() => setDiffCommentsOptionIsNew(false)} showFileCommentsSuggestionBanner={showFileCommentsSuggestionBanner} onEnableFileCommentsFromBanner={() => { setPlainFileGutterCommentsEnabled(true); setShowFileCommentsSuggestionBanner(false); setFileCommentsOptionIsNew(false); }} onDismissFileCommentsSuggestionBanner={() => setShowFileCommentsSuggestionBanner(false)} onCommentAttachmentResponseStart={handleCommentAttachmentResponseStart} onCommentAttachmentResponseComplete={handleCommentAttachmentResponseComplete} />;
            }
            return (
              <ChatsHistoryToolWindow
                ctx={ctx}
                activeChatId={selectedAiChatId ?? (isAiuxNewSessionTab ? AIUX_NEW_SESSION_TAB_ID : null)}
                activeSpecId={selectedTask}
                agentTasks={agentTasks}
                chatRows={aiSessionChatRows}
                onOpenNewSession={openNewSessionTab}
                onOpenSpecTask={openSpecTaskOnly}
                onOpenSpecChat={openSpecChatFromRecents}
                onOpenChatInTab={openChatInEditorTab}
                onSettings={() => setIsSettingsDialogOpen(true)}
                onOpenChangesList={openCommitToolWindow}
              />
            );
          }
          if (id === 'commit') return (
            <ReferenceCommitToolWindow ctx={ctx} />
          );
          return defaultLeftPanelContent(id, ctx);
        }}
	        rightPanelContent={(id, ctx) => defaultRightPanelContent(id, ctx)}
        bottomPanelContent={(id, ctx) => renderBottomPanelContent(id, ctx)}

        statusBarProps={{
          breadcrumbs: ideStatusBarBreadcrumbs,
          widgets: [
            { type: 'text', text: '42:1' },
            { type: 'text', text: 'UTF-8' },
            { type: 'text', text: 'LF' },
          ],
        }}

        overlays={null}
      />
      {settingsDialogPortal}
      {editorTabsMorePortal}
      {terminalPermissionPortal}
      <SpecSelectionToolbar position={idleSelectionToolbarPos} />
      <EditorSelectionToolbar position={editorSelectionToolbarPos} />
      {editorCompletion && editorCompletion.pos && createPortal(
        <CompletionPopup
          trigger={editorCompletion.trigger}
          query={editorCompletion.query}
          selectedIdx={editorCompletion.selectedIdx}
          onSelect={(item) => {
            const textarea = document.querySelector('.main-window-editor-content .editor .pce-textarea');
            if (textarea instanceof HTMLTextAreaElement) {
              const value = textarea.value;
              const cursorPos = textarea.selectionStart;
              const textBeforeCursor = value.slice(0, cursorPos);
              const triggerIdx = Math.max(textBeforeCursor.lastIndexOf('@'), textBeforeCursor.lastIndexOf('#'));
              const before = value.slice(0, triggerIdx + 1);
              const after = value.slice(cursorPos);
              const insertText = getCompletionInsertText(item);
              const newValue = before + insertText + ' ' + after;
              textarea.value = newValue;
              const newPos = triggerIdx + 1 + insertText.length + 1;
              textarea.setSelectionRange(newPos, newPos);
              textarea.dispatchEvent(new Event('input', { bubbles: true }));
              textarea.focus();
            }
            const attachment = getCompletionAttachment(item);
            if (attachment) {
              updateAttachedFilesForTab(files => {
                if (files.some(f => f.label === attachment.label)) return files;
                return [...files, attachment];
              });
            }
            setEditorCompletion(null);
          }}
          onClose={() => setEditorCompletion(null)}
          style={{ position: 'fixed', top: editorCompletion.pos.top, left: editorCompletion.pos.left, width: 453 }}
        />,
        document.body
      )}
    </ThemeProvider>
  );
}
