import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Icon, Loader, ToolWindow } from '@jetbrains/int-ui-kit';
import { AiChatAgentIcon, AiChatCodexIcon } from './AiChatListParts.jsx';

// Severity status icon from the shared JetBrains icon registry.
function AiNotesSeverityIcon({ severity }) {
  const s = String(severity || '').toLowerCase();
  const iconName = s === 'critical'
    ? 'status/error'
    : s === 'warning'
      ? 'status/warning'
      : 'status/info';
  return <Icon name={iconName} size={16} className="aiux550-ainotes-sev-icon" />;
}

const AIUX_NEW_SESSION_TAB_ID = 'aiux-new-session';
const AIA_COMPOSER_NPM_INIT_PERMISSION_PROMPT =
  'Allow running npm init -y in the current repository to create a default package.json?';

function ChatsHistoryToolWindow({
  ctx,
  activeChatId = null,
  agentRunByChatId = {},
  chatRows = [],
  onOpenNewSession = null,
  onOpenChatInTab = null,
  onOpenSpecChat = null,
  onSettings = null,
  onOpenChangesList = null,
  onOpenCommit = null,
  onOpenReviewDiff = null,
  onOpenFile = null,
}) {
  // Everything collapsed by default except the refactoring chat, which is
  // expanded (its Changes / Context / Sub-threads sections stay collapsed).
  const [expandedSections, setExpandedSections] = useState({});
  const [expandedRows, setExpandedRows] = useState({
    'refactor-time-slots': true,
  });
  // Selection follows the active chat editor tab. When no chat tab is active
  // (e.g. a code file or the default view), nothing is highlighted.
  const selectedId = activeChatId ?? null;
  const flatRows = useMemo(() => buildAiux550HistoryRows(chatRows), [chatRows]);

  // Reveal a newly queued review immediately in history. The queued state is
  // static; processing and its animation begin only when the chat tab is opened.
  useEffect(() => {
    const active = Object.entries(agentRunByChatId)
      .filter(([, run]) => run?.status === 'queued' || run?.status === 'processing')
      .map(([chatId]) => chatId);
    if (active.length === 0) return;
    setExpandedRows((prev) => {
      let changed = false;
      const next = { ...prev };
      active.forEach((chatId) => { if (!next[chatId]) { next[chatId] = true; changed = true; } });
      return changed ? next : prev;
    });
    setExpandedSections((prev) => {
      let changed = false;
      const next = { ...prev };
      active.forEach((chatId) => {
        const key = `${chatId}:ai-notes`;
        if (!next[key]) { next[key] = true; changed = true; }
      });
      return changed ? next : prev;
    });
  }, [agentRunByChatId]);

  const handleSelectChat = (chatId, specId = null) => {
    if (chatId === AIUX_NEW_SESSION_TAB_ID) {
      onOpenNewSession?.();
      return;
    }
    if (specId) {
      // Chat under a spec node: open the spec in a center tab AND the chat
      // on the left AI panel (mirrors the New Session "Recent specs" flow).
      onOpenSpecChat?.(chatId, specId) ?? onOpenChatInTab?.(chatId);
      return;
    }
    // Standalone chats open as their own editor tab in the center.
    onOpenChatInTab?.(chatId);
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
          agentRunByChatId={agentRunByChatId}
          rows={flatRows}
          expandedRows={expandedRows}
          expandedSections={expandedSections}
          selectedActive
          className="aiux543-tool-chat-list"
          onSelectChat={handleSelectChat}
          onOpenChangesList={onOpenChangesList}
          onOpenCommit={onOpenCommit}
          onOpenReviewDiff={onOpenReviewDiff}
          onOpenFile={onOpenFile}
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
    </ToolWindow>
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
  'refactor-time-slots': {
    changes: [
      { label: 'VisitController.java', status: 'modified', diff: { added: 10, deleted: 7 } },
      { label: 'createOrUpdateVisitForm.html', status: 'modified', diff: { added: 8, deleted: 3 } },
      { label: 'schema.sql', status: 'modified', diff: { added: 4, deleted: 1 } },
    ],
    context: ['VisitController.java', 'Visit.java', 'VisitRepository.java'],
    subThreads: [{ label: 'Slot lifecycle review', agent: 'claude' }],
  },
  'visit-model-attributes': {
    changes: [
      { label: 'Visit.java', status: 'modified', diff: { added: 6, deleted: 2 } },
      { label: 'VisitRepository.java', status: 'modified', diff: { added: 5, deleted: 2 } },
      { label: 'VisitControllerTests.java', status: 'added', diff: { added: 22, deleted: 0 } },
    ],
    context: ['Visit.java', 'VisitController.java', 'schema.sql'],
    subThreads: [{ label: 'Model validation follow-up', agent: 'claude' }],
  },
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
  const fallbackChangeItems = diff
    ? [{ label: `${rowId || 'changes'}.diff`, status: 'modified' }]
    : [];
  const changeItems = content.changes ?? fallbackChangeItems;
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

function getHistoryChangeItemSummary(item, index = 0) {
  if (!item || typeof item !== 'object') return { added: 1, deleted: 0 };
  if (item.diff && Number.isFinite(item.diff.added) && Number.isFinite(item.diff.deleted)) {
    return item.diff;
  }
  if (item.status === 'added') return { added: index + 1, deleted: 0 };
  if (item.status === 'deleted') return { added: 0, deleted: index + 1 };
  return { added: index + 2, deleted: index + 1 };
}

function HistoryChangeSummary({ summary }) {
  if (!summary) return null;
  const added = Number.isFinite(summary.added) ? summary.added : 0;
  const deleted = Number.isFinite(summary.deleted) ? summary.deleted : 0;
  return (
    <span className="aiux543-chat-change-summary" aria-label={`Changes: plus ${added}, minus ${deleted}`}>
      <span className="added">+{added}</span>
      <span className="deleted">-{deleted}</span>
    </span>
  );
}

function withAiux550CollapsedChildren(row) {
  if (!row.expandable) return row;
  return { ...row, children: buildAiux550HistoryChildren(row.id, row.diff) };
}

function buildAiux550HistoryRows(dynamicRows = []) {
  const normalizedDynamicRows = Array.isArray(dynamicRows)
    ? dynamicRows.filter((row) => row?.id && row.id !== AIUX_NEW_SESSION_TAB_ID)
    : [];
  const dynamicRowIds = new Set(normalizedDynamicRows.map((row) => row.id));
  const staticRows = [
    ...normalizedDynamicRows.map(withAiux550CollapsedChildren),
    ...[
      {
        id: 'refactor-time-slots',
        title: 'Refactor VisitController.java time slots',
        agent: 'claude',
        time: '5m',
        diff: { added: 10, deleted: 7 },
        children: buildAiux550HistoryChildren('refactor-time-slots', { added: 10, deleted: 7 }),
      },
      {
        id: 'visit-model-attributes',
        title: 'Review Visit.java model fields',
        agent: 'claude',
        time: '12m',
        diff: { added: 6, deleted: 2 },
        children: buildAiux550HistoryChildren('visit-model-attributes', { added: 6, deleted: 2 }),
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
      ...AIUX550_HISTORY_FALLBACK_ROWS,
    ].filter((row) => !dynamicRowIds.has(row.id)).map(withAiux550CollapsedChildren),
  ];

  return staticRows;
}

// Spec-driven entries shown above the flat Agents list. Each spec is a `.md`
// document that owns the chats spawned from it, so it renders as an expandable
// row whose children are those chats. Each chat, in turn, carries the same
// Changes / Context / Sub-threads tree as the Agents-section chats.
// Each spec owns exactly two chats — Build and Specify — matching the previous
// implementation's spec status chats (ensureSpecStatusChat 'Build'/'Specified').
// Temporarily hide the "Specs" section from Chats History (data kept for later).
const SHOW_HISTORY_SPECS = false;

const AIUX550_HISTORY_SPECS = [
  {
    id: 'spec-visit-booking',
    kind: 'spec',
    title: 'Visit-Booking.md',
    time: '2m',
    chats: [
      { id: 'spec-visit-booking-build', title: 'Build', agent: 'claude', time: '2m' },
      { id: 'spec-visit-booking-specify', title: 'Specified', agent: 'claude', time: '18m' },
    ],
  },
  {
    id: 'spec-vet-schedules',
    kind: 'spec',
    title: 'Vet-Schedules.md',
    time: '3h',
    chats: [
      { id: 'spec-vet-schedules-build', title: 'Build', agent: 'claude', time: '3h' },
      { id: 'spec-vet-schedules-specify', title: 'Specified', agent: 'claude', time: '5h' },
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
  agentRunByChatId = {},
  rows,
  specs = AIUX550_HISTORY_SPECS,
  expandedRows,
  expandedSections,
  selectedActive,
  className = '',
  onSelectChat,
  onOpenChangesList,
  onOpenCommit,
  onOpenReviewDiff,
  onOpenFile,
  onToggleRow,
  onToggleSection,
}) {
  // No forced fallback: when activeChatId doesn't match a row, nothing is
  // highlighted (avoids a default blue selection on load).
  const effectiveActiveChatId = activeChatId ?? null;

  // Prepend an expandable "AI Review" folder to a chat's children only for an
  // explicit /review run. A plain "execute comments" run also carries notes, but
  // it shouldn't leave an "AI Review" block lingering in history after it
  // finishes — its result lives in the chat + the diff. While such a run is
  // still processing we show the folder so its progress is visible.
  // Show the "AI Review" folder (with severity counters) whenever the run has
  // notes — i.e. while processing OR while agent replies/findings still await an
  // explicit user action (apply the change / resolve). finishRun prunes notes that
  // don't await action, and resolving/quick-fixing removes them, so the folder
  // disappears once everything is handled.
  const withAiNotes = (node) => {
    const run = agentRunByChatId[node.id];
    // Only an explicit /review run gets an "AI Review" folder in history. A plain
    // "send comment to agent" run keeps its result in the chat + the diff/chip.
    if (run?.kind !== 'review' || !run?.notes?.length) return node;
    const aiNotesSection = {
      id: 'ai-notes',
      label: 'AI Review',
      notes: run.notes,
      status: run.status,
      agentIcon: run.agentIcon || node.agent || 'codex',
    };
    return { ...node, children: [aiNotesSection, ...(node.children ?? [])] };
  };

  return (
    <div className={`aiux543-chat-list aiux543-chat-list-flat ${className}`.trim()}>
      {SHOW_HISTORY_SPECS && specs?.length ? (
        <section>
          <div className="aiux543-chat-group-rows">
            <ReferenceChatSectionHeader expanded label="Specs" onToggle={() => {}} />
            {specs.map((spec) => {
              const isExpanded = expandedRows[spec.id] ?? false;
              return (
                <div className="aiux543-chat-node" key={spec.id}>
                  <Aiux550HistoryRow
                    row={spec}
                    agentRun={agentRunByChatId[spec.id] ?? null}
                    expanded={isExpanded}
                    selected={spec.id === effectiveActiveChatId}
                    selectedActive={selectedActive}
                    onSelect={() => onSelectChat?.(spec.id)}
                    onToggleExpanded={() => onToggleRow?.(spec.id)}
                  />
                  {spec.chats?.length && isExpanded ? (
                    <div className="aiux543-chat-spec-children">
                      {spec.chats.map((rawChat) => {
                        const chat = withAiNotes(rawChat);
                        const chatExpanded = expandedRows[chat.id] ?? false;
                        return (
                          <div className="aiux543-chat-node" key={chat.id}>
                            <Aiux550HistoryRow
                              row={chat}
                              agentRun={agentRunByChatId[chat.id] ?? null}
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
                                onOpenCommit={onOpenCommit}
                                onOpenReviewDiff={onOpenReviewDiff}
                                onOpenFile={onOpenFile}
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
          {rows.map((rawRow) => {
            const row = withAiNotes(rawRow);
            const isExpanded = expandedRows[row.id] ?? false;
            return (
              <div className="aiux543-chat-node" key={row.id}>
                <Aiux550HistoryRow
                  row={row}
                  agentRun={agentRunByChatId[row.id] ?? null}
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
                    onOpenCommit={onOpenCommit}
                    onOpenReviewDiff={onOpenReviewDiff}
                    onOpenFile={onOpenFile}
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
  agentRun = null,
  expanded,
  selected,
  selectedActive,
  onSelect,
  onToggleExpanded,
  nested = false,
}) {
  const hasChildren = Boolean(row.children?.length) || Boolean(row.chats?.length);
  const isSpec = row.kind === 'spec';
  // Live agent-run status drives the node: while the agent works the row shows
  // the progress badge (and hides the static +/-); once done, the change summary
  // returns — a visible running → done transition on the node itself.
  const isRunning = agentRun?.status === 'processing';
  const isRunDone = agentRun?.status === 'done';
  const changeSummary = isRunning
    ? null
    : (row.diff ?? (isRunDone ? { added: 3, deleted: 1 } : null));
  // The live comment counter lives ONLY on the "AI Notes" folder, not the row.
  // The generic ProgressPlanBadge stays only for static planProgress rows.
  const showProgressBadge = Boolean(row.planProgress);
  const showApprovalDot = !isRunning && row.status === 'approval';

  return (
    <div
      className={[
        'aiux543-chat-row',
        nested ? 'aiux543-chat-subrow' : '',
        selected ? `selected ${selectedActive ? 'selected-active' : 'selected-inactive'}` : '',
        hasChildren ? 'expandable' : '',
        changeSummary ? 'has-change-summary' : '',
        showProgressBadge ? 'has-status has-progress-plan' : '',
        isRunning ? 'is-agent-running' : '',
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
        {showApprovalDot ? (
          <ApprovalActivityDot onOpenChat={onSelect} />
        ) : null}
        {showProgressBadge ? (
          <ProgressPlanBadge />
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

const loadingPlanSteps = [
  { id: 'verify', state: 'done', text: 'Verify rendering and usage to ensure nothing overrides center burst.' },
  { id: 'review', state: 'active', text: 'Review codebase to locate where confetti particle initial position and velocity a reset.' },
  { id: 'origin', state: 'pending', text: 'Update renderer/physics if needed to respect new origin with existing gravity/wind.' },
  { id: 'tests', state: 'pending', text: 'Build or run any tests to ensure no errors.' },
  { id: 'summary', state: 'pending', text: 'Summarize changes and submit.' },
];

function ProgressPlanBadge({ className = '', prefix = null } = {}) {
  const badgeRef = useRef(null);
  const hideTimerRef = useRef(null);
  const [popupVisible, setPopupVisible] = useState(false);
  const [popupPosition, setPopupPosition] = useState({
    left: 16,
    pointerLeft: 32,
    placement: 'below',
    top: 16,
    width: 300,
  });
  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current == null) return;
    window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = null;
  }, []);
  const showPopup = useCallback(() => {
    clearHideTimer();
    const badgeRect = badgeRef.current?.getBoundingClientRect();
    if (!badgeRect) return;

    const viewportPadding = 12;
    const popupGap = 8;
    const preferredWidth = 300;
    const width = Math.min(preferredWidth, Math.max(260, window.innerWidth - viewportPadding * 2));
    const left = Math.min(
      Math.max(viewportPadding, badgeRect.left + badgeRect.width / 2 - width / 2),
      window.innerWidth - width - viewportPadding,
    );
    const placement = 'below';
    const top = badgeRect.bottom + popupGap;
    const pointerLeft = Math.min(
      width - 24,
      Math.max(24, badgeRect.left + badgeRect.width / 2 - left),
    );

    setPopupPosition({ left, pointerLeft, placement, top, width });
    setPopupVisible(true);
  }, [clearHideTimer]);
  const hidePopup = useCallback((delay = 0) => {
    clearHideTimer();
    if (delay > 0) {
      hideTimerRef.current = window.setTimeout(() => {
        hideTimerRef.current = null;
        setPopupVisible(false);
      }, delay);
      return;
    }
    setPopupVisible(false);
  }, [clearHideTimer]);

  useEffect(() => () => clearHideTimer(), [clearHideTimer]);

  return (
    <span
      className={['aiux543-progress-plan-wrap', className].filter(Boolean).join(' ')}
      onMouseEnter={showPopup}
      onMouseMove={showPopup}
      onMouseLeave={() => hidePopup(120)}
      onPointerEnter={showPopup}
      onPointerMove={showPopup}
      onPointerLeave={() => hidePopup(120)}
      onFocus={showPopup}
      onBlur={() => hidePopup()}
    >
      <span
        className="aiux543-progress-plan-badge"
        aria-label="Plan progress: 2 of 5"
        onClick={(event) => {
          event.stopPropagation();
          showPopup();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') hidePopup();
        }}
        ref={badgeRef}
        tabIndex={0}
      >
        {prefix ? <span className="aiux543-progress-plan-prefix">{prefix}</span> : null}
        <span>2/5</span>
        <span className="aiux543-spinner aiux543-progress-plan-spinner" aria-hidden="true" />
      </span>
      {popupVisible ? createPortal(
        <span
          className={`aiux543-progress-plan-popup ${popupPosition.placement}`}
          role="tooltip"
          style={{
            '--progress-plan-pointer-left': `${popupPosition.pointerLeft}px`,
            left: `${popupPosition.left}px`,
            top: `${popupPosition.top}px`,
            width: `${popupPosition.width}px`,
          }}
        >
          {loadingPlanSteps.map((step) => (
            <span className={`aiux543-progress-plan-step ${step.state}`} key={step.id}>
              <span className="aiux543-progress-plan-marker" aria-hidden="true">
                {step.state === 'active' ? (
                  <span className="aiux543-spinner aiux543-progress-plan-step-spinner" />
                ) : null}
              </span>
              <span className="aiux543-progress-plan-text">{step.text}</span>
            </span>
          ))}
        </span>,
        document.body,
      ) : null}
    </span>
  );
}

function ApprovalActivityDot({ onOpenChat }) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewRect, setPreviewRect] = useState(null);
  const anchorRef = useRef(null);
  const hideTimerRef = useRef(null);

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current == null) return;
    window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = null;
  }, []);

  const showPreview = useCallback(() => {
    clearHideTimer();
    const rect = anchorRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPreviewRect({
      top: rect.top,
      right: window.innerWidth - rect.right,
      bottom: rect.bottom,
      left: rect.left,
    });
    setPreviewOpen(true);
  }, [clearHideTimer]);

  const scheduleHidePreview = useCallback(() => {
    clearHideTimer();
    hideTimerRef.current = window.setTimeout(() => {
      hideTimerRef.current = null;
      setPreviewOpen(false);
    }, 120);
  }, [clearHideTimer]);

  useEffect(() => () => clearHideTimer(), [clearHideTimer]);

  return (
    <span
      ref={anchorRef}
      className="aiux543-approval-dot-wrap"
      role="button"
      tabIndex={0}
      aria-label="Preview pending approval"
      onClick={(event) => {
        event.stopPropagation();
        showPreview();
      }}
      onFocus={showPreview}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        event.stopPropagation();
        showPreview();
      }}
      onMouseEnter={showPreview}
      onMouseMove={showPreview}
      onMouseLeave={scheduleHidePreview}
      onPointerEnter={showPreview}
      onPointerLeave={scheduleHidePreview}
    >
      <span className="aiux543-chat-activity-dot" aria-label="Awaiting confirmation" />
      <span className="aiux543-approval-dot-label">Approval</span>
      {previewOpen && previewRect ? createPortal(
        <ApprovalActivityPreview
          anchorRect={previewRect}
          onOpenChat={onOpenChat}
          onPointerEnter={showPreview}
          onPointerLeave={scheduleHidePreview}
          onMouseEnter={showPreview}
          onMouseMove={showPreview}
          onMouseLeave={scheduleHidePreview}
        />,
        document.body,
      ) : null}
    </span>
  );
}

function ApprovalActivityPreview({
  anchorRect,
  onOpenChat,
  onMouseEnter,
  onMouseLeave,
  onMouseMove,
  onPointerEnter,
  onPointerLeave,
}) {
  const previewWidth = 268;
  const right = Math.max(12, Math.min(window.innerWidth - previewWidth - 12, anchorRect.right - 34));
  const top = Math.min(window.innerHeight - 188, anchorRect.bottom + 9);
  const safeTop = Math.max(12, top);
  const actions = [
    { icon: 'general/checkmark', label: 'Yes' },
    { icon: 'general/checkmark', label: 'Always allow' },
    { icon: 'general/closeSmall', label: 'No, adjust task' },
  ];

  return (
    <div
      className="aiux543-approval-preview"
      style={{ top: safeTop, right }}
      onClick={(event) => event.stopPropagation()}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onMouseMove={onMouseMove}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      role="dialog"
      aria-label="Pending command approval preview"
    >
      <div className="aiux543-approval-preview-head">
        <span className="aiux543-approval-preview-dot" aria-hidden="true" />
        <span>Needs approval</span>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onOpenChat?.();
          }}
        >
          Open chat
        </button>
      </div>
      <p>{AIA_COMPOSER_NPM_INIT_PERMISSION_PROMPT}</p>
      <div className="aiux543-approval-preview-command">
        <Icon name="toolwindows/terminal" size={14} />
        <span>npm init -y</span>
      </div>
      <div className="aiux543-approval-preview-actions" aria-label="Approval choices">
        {actions.map((action) => (
          <button key={action.label} type="button">
            <Icon name={action.icon} size={14} />
            <span>{action.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Aiux550HistoryRowChildren({ sections, rowId, expandedSections, onToggleSection, onOpenChangesList, onOpenCommit, onOpenReviewDiff, onOpenFile }) {
  return (
    <div className="aiux543-chat-row-children">
      {sections.map((section) => {
        const sectionKey = `${rowId}:${section.id}`;
        const isExpanded = expandedSections[sectionKey] ?? false;
        const isAiNotes = section.id === 'ai-notes';
        const aiNotes = isAiNotes && Array.isArray(section.notes) ? section.notes : [];
        // The AI Review section is a single, non-expandable summary row: it shows
        // the file/comment totals and a "See list" escape hatch. The per-file /
        // per-comment detail lives in the diff gutters and the Commit tool window,
        // so we don't render a file tree here (it doesn't scale to large reviews).
        // While processing, a loader sits in the action column; once done it shows
        // a green "Open" badge and the "Open review" link.
        const isAiNotesDone = isAiNotes && ['done', 'completed', 'dismissed'].includes(section.status);
        const isAiNotesQueued = isAiNotes && section.status === 'queued';
        return (
          <div className="aiux543-chat-row-child-section" key={section.id}>
            <div
              className={[
                'aiux543-chat-tree-row',
                'aiux543-chat-tree-section',
                'aiux543-chat-tree-section-header',
                (section.id === 'changes' || isAiNotes) ? 'aiux543-chat-tree-section-with-action' : '',
              ].filter(Boolean).join(' ')}
              aria-expanded={isAiNotes ? undefined : isExpanded}
            >
              {isAiNotes ? (
                // Non-expandable summary row: review icon + label + "Open" badge.
                <span className="aiux543-chat-tree-section-toggle aiux550-ainotes-summary">
                  <span className="aiux543-chat-tree-chevron-spacer" aria-hidden="true" />
                  <Aiux550HistoryChildSectionIcon sectionId={section.id} agentIcon={section.agentIcon} />
                  <span className="aiux550-ainotes-summary-label">
                    <span>{section.label}</span>
                    {isAiNotesDone ? (
                      <span className="aiux550-review-done-badge aiux550-ainotes-summary-status">
                        <span className="aiux550-review-done-dot" aria-hidden="true" />
                        Open
                      </span>
                    ) : (
                      <span className="aiux550-ainotes-summary-status aiux550-ainotes-progress-text">
                        {isAiNotesQueued ? 'Queued' : 'In progress'}
                      </span>
                    )}
                  </span>
                </span>
              ) : (
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
              )}
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
              {isAiNotes ? (
                isAiNotesDone ? (
                  // Opens the aggregated review-diff overview tab (same as the card).
                  <button
                    className="aiux543-chat-tree-section-link"
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpenReviewDiff?.(rowId);
                    }}
                  >
                    Open review
                  </button>
                ) : isAiNotesQueued ? null : (
                  <Loader className="aiux550-ainotes-loader" size={16} />
                )
              ) : null}
            </div>
            {isExpanded && !isAiNotes && section.items?.length ? (
              <div className="aiux543-chat-tree-children">
                {section.items.map((item, index) => {
                  const isObject = typeof item === 'object' && item !== null;
                  const label = isObject ? item.label : item;
                  const status = isObject ? item.status : undefined;
                  const isSubThread = section.id === 'sub-threads';
                  const changeSummary = section.id === 'changes'
                    ? getHistoryChangeItemSummary(item, index)
                    : null;
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
                        onClick={() => {
                          if (section.id === 'changes') {
                            onOpenFile?.(item);
                          }
                        }}
                      >
                        <span className="aiux543-chat-tree-chevron-spacer" />
                        {isSubThread ? (
                          <ReferenceChatAgentIcon agent={(isObject && item.agent) || 'claude'} mode={isObject ? item.mode : undefined} />
                        ) : (
                          <Aiux550TreeLeafIcon label={label} type={isObject ? item.type : undefined} />
                        )}
                        <span className="aiux543-chat-tree-leaf-label">{label}</span>
                        {changeSummary ? <HistoryChangeSummary summary={changeSummary} /> : null}
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

function Aiux550HistoryChildSectionIcon({ sectionId, agentIcon = 'codex' }) {
  if (sectionId === 'ai-notes') {
    return <AiChatAgentIcon icon={agentIcon} title="AI Review" />;
  }

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

function IconMdTask({ className = '' } = {}) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path fillRule="evenodd" clipRule="evenodd" d="M12.5929 9.9438L12.5929 4.70001L13.7929 4.70002L13.7929 9.94379L15.0763 8.66037L15.9248 9.5089L13.1929 12.2409L10.4609 9.5089L11.3095 8.66037L12.5929 9.9438Z" fill="#9B6BDA"/>
      <path d="M0.5 4.70001H2.94558L4.65385 9.14463L4.76288 9.60155L4.85635 9.14463L6.51269 4.70001H8.98423V11.9692H7.14096V7.59732L7.17212 7.12482L5.34442 11.9692H4.08269L2.31212 7.17155L2.34327 7.59732V11.9692H0.5V4.70001Z" fill="#9B6BDA"/>
    </svg>
  );
}

export { ChatsHistoryToolWindow, AIUX_NEW_SESSION_TAB_ID, AiNotesSeverityIcon };
export { AIUX550_HISTORY_ROW_CONTENT, getHistoryChangeItemSummary };
