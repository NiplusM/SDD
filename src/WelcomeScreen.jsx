import { useState } from 'react';
import { Icon, Search, ToolWindow, Popup, PositionedPopup, PopupCell, SegmentedControl, Checkbox } from '@jetbrains/int-ui-kit';
import './WelcomeScreen.css';

// ─── Data ────────────────────────────────────────────────────────────────────

const RECENT_PROJECTS = [
  { id: '1', name: 'payment-service',              path: '~/projects/payment-service',              initials: 'PS', bg: 'linear-gradient(180deg, #E08855 0%, #E9806F 100%)' },
  { id: '2', name: 'IntelliJ IDEA',                path: 'Hint',                                    initials: 'II', bg: 'linear-gradient(180deg, #A1A359 0%, #87AA59 100%)' },
  { id: '3', name: 'calculator-unit-tests-java',   path: 'Hint',                                    initials: 'CU', bg: '#24A394' },
  { id: '4', name: 'calculator-unit-tests-java',   path: 'Hint',                                    initials: 'CU', bg: '#24A394' },
];

const ACTION_ITEMS = [
  { id: 'agent-tasks', label: 'New Agent Task', icon: null, customIcon: 'agent', chevron: false, primary: true },
  { id: 'new',    label: 'New...',                icon: 'general/add',               chevron: true  },
  { id: 'open',   label: 'Open...',               icon: 'nodes/folder',              chevron: false },
  { id: 'clone',  label: 'Clone...',              icon: 'vcs/vcs',                   chevron: false },
  { id: 'remote', label: 'Remote Development...', icon: null, customIcon: 'ssh', chevron: false },
];

const NEW_MENU_ITEMS = [
  { id: 'project',  label: 'New Project',  icon: 'general/projectStructure' },
  { id: 'sep1',     type: 'separator' },
  { id: 'task',     label: 'New Task',     icon: 'general/add' },
  { id: 'script',   label: 'New Script',   icon: 'general/externalTools' },
  { id: 'sep2',     type: 'separator' },
  { id: 'notebook', label: 'New Notebook', icon: 'general/layout' },
];

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
      <path d="M6.1582 1.76538C5.73758 2.58551 5.50004 3.51521 5.5 4.49976C5.5 7.81346 8.18629 10.4998 11.5 10.4998C12.4843 10.4998 13.4134 10.2619 14.2334 9.84155C13.4393 12.5341 10.9499 14.4998 8 14.4998C4.41015 14.4998 1.5 11.5896 1.5 7.99976C1.50011 5.04996 3.46571 2.55947 6.1582 1.76538Z" stroke="currentColor"/>
    </svg>
  );
}

function KeyboardIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
      <path d="M4 5H3V6H4V5Z" fill="currentColor"/>
      <path d="M5 7H4V8H5V7Z" fill="currentColor"/>
      <path d="M7 5H8V6H7V5Z" fill="currentColor"/>
      <path d="M9 7H8V8H9V7Z" fill="currentColor"/>
      <path d="M5 5H6V6H5V5Z" fill="currentColor"/>
      <path d="M7 7H6V8H7V7Z" fill="currentColor"/>
      <path d="M9 5H10V6H9V5Z" fill="currentColor"/>
      <path d="M12 5H11V6H12V5Z" fill="currentColor"/>
      <path d="M10 7H11V8H10V7Z" fill="currentColor"/>
      <path d="M10 10H5V11H10V10Z" fill="currentColor"/>
      <path fillRule="evenodd" clipRule="evenodd" d="M0 4C0 2.89543 0.895431 2 2 2H13C14.1046 2 15 2.89543 15 4V12C15 13.1046 14.1046 14 13 14H2C0.89543 14 0 13.1046 0 12V4ZM2 3H13C13.5523 3 14 3.44772 14 4V12C14 12.5523 13.5523 13 13 13H2C1.44772 13 1 12.5523 1 12V4C1 3.44772 1.44772 3 2 3Z" fill="currentColor"/>
    </svg>
  );
}

function AgentTasksIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M13.2701 19.13C14.0501 19.13 14.6901 18.5 14.6901 17.71C14.6901 16.92 14.0601 16.29 13.2701 16.29C12.4801 16.29 11.8501 16.92 11.8501 17.71C11.8501 18.5 12.4801 19.13 13.2701 19.13Z" fill="currentColor"/>
      <path d="M10.4202 17.71C6.0202 17.71 2.4502 14.26 2.4502 10C2.4502 5.74004 6.0202 2.29004 10.4202 2.29004" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M17.34 7.87004C17.34 10.86 14.35 13.45 10.43 13.45C6.51002 13.45 3.52002 10.86 3.52002 7.87004C3.52002 4.88004 6.51002 2.29004 10.43 2.29004C14.35 2.29004 17.34 4.88004 17.34 7.87004Z" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  );
}

function ScriptWelcomeIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M18 7.5V9C18 11.0711 16.3211 12.75 14.25 12.75H9.75C8.50736 12.75 7.5 13.7574 7.5 15V19.5C7.5 19.5 7.5 22 12 22C16.5 22 16.5 19.5 16.5 19.5V18H12.75C12.3358 18 12 17.6642 12 17.25C12 16.8358 12.3358 16.5 12.75 16.5H19.5C19.5 16.5 22 16.5 22 12C22 7.5 19.5 7.5 19.5 7.5H18ZM15 19.75C15 20.1642 14.6642 20.5 14.25 20.5C13.8358 20.5 13.5 20.1642 13.5 19.75C13.5 19.3358 13.8358 19 14.25 19C14.6642 19 15 19.3358 15 19.75Z"
        fill="#F2C55C"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M7.5 4.5V6H11.25C11.6642 6 12 6.33579 12 6.75C12 7.16421 11.6642 7.5 11.25 7.5H4.5C4.5 7.5 2 7.5 2 12C2 16.5 4.5 16.5 4.5 16.5H6V15C6 12.9289 7.67893 11.25 9.75 11.25H14.25C15.4926 11.25 16.5 10.2426 16.5 9V4.5C16.5 4.5 16.5 2 12 2C7.5 2 7.5 4.5 7.5 4.5ZM9.75 5C10.1642 5 10.5 4.66421 10.5 4.25C10.5 3.83579 10.1642 3.5 9.75 3.5C9.33579 3.5 9 3.83579 9 4.25C9 4.66421 9.33579 5 9.75 5Z"
        fill="#548AF7"
      />
    </svg>
  );
}

function NotebookWelcomeIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        d="M20.4851 8.62843C18.4047 7.07719 15.1144 5.70162 12.0075 5.70162C8.88879 5.70162 5.60914 7.07275 3.53233 8.62383C3.2514 8.83364 2.86822 8.54513 3.06091 8.25186C3.98072 6.85192 5.34775 5.41409 6.51967 4.63803C8.12997 3.57166 10.0452 3 12.0075 3C13.9698 3 15.8849 3.57166 17.4953 4.63803C18.6683 5.41487 20.0369 6.85478 20.9568 8.25604C21.1492 8.54924 20.7661 8.83791 20.4851 8.62843Z"
        fill="#C77D55"
      />
      <path
        d="M3.53245 15.3716C5.61284 16.9228 8.90318 18.2984 12.0101 18.2984C15.1288 18.2984 18.4084 16.9272 20.4852 15.3762C20.7662 15.1664 21.1494 15.4549 20.9567 15.7481C20.0369 17.1481 18.6698 18.5859 17.4979 19.362C15.8876 20.4283 13.9724 21 12.0101 21C10.0478 21 8.13264 20.4283 6.52231 19.362C5.34923 18.5851 3.98065 17.1452 3.06081 15.744C2.86835 15.4508 3.2515 15.1621 3.53245 15.3716Z"
        fill="#C77D55"
      />
    </svg>
  );
}

function ImportWelcomeIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        d="M16.2801 8.03009C16.5729 7.73722 16.5729 7.2624 16.2801 6.96954L12.5301 3.21954C12.2373 2.92684 11.7624 2.9268 11.4696 3.21954L7.7196 6.96954C7.42675 7.26238 7.42685 7.73718 7.7196 8.03009C8.01249 8.32289 8.48728 8.32294 8.78014 8.03009L11.2499 5.56036V15.7713C11.2499 16.1855 11.5857 16.5213 11.9999 16.5213C12.4141 16.5213 12.7499 16.1855 12.7499 15.7713V5.56036L15.2196 8.03009C15.5125 8.32284 15.9873 8.32284 16.2801 8.03009Z"
        fill="#548AF7"
      />
      <path
        d="M4 15.5C4 15.2239 4.22386 15 4.5 15H6.5C6.77614 15 7 15.2239 7 15.5V18H17V15.5C17 15.2239 17.2239 15 17.5 15H19.5C19.7761 15 20 15.2239 20 15.5V20C20 20.5523 19.5523 21 19 21H5C4.44772 21 4 20.5523 4 20V15.5Z"
        fill="#3574F0"
      />
    </svg>
  );
}

function LearnWelcomeIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M23 9.11111L12 3L1 9.11111L12 15.2222L23 9.11111ZM23 9.11111V15.2222" stroke="#548AF7" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M5 11.9999V18.494C5 18.7683 5.1499 19.0207 5.39062 19.1522L12.0029 22.7596C12.2266 22.8816 12.497 22.8814 12.7207 22.7596L19.333 19.1522C19.5739 19.0208 19.7236 18.7685 19.7236 18.494V12.0001L18.2236 12.8334V18.0487L12.3613 21.246L6.5 18.0487V12.8333L5 11.9999Z"
        fill="#548AF7"
      />
    </svg>
  );
}

function PluginsWelcomeIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        d="M16.5 4C17.3284 4 18 4.67157 18 5.5V7H23.25C23.6642 7 24 7.33579 24 7.75C24 8.16421 23.6642 8.5 23.25 8.5H18V14.5H23.25C23.6642 14.5 24 14.8358 24 15.25C24 15.6642 23.6642 16 23.25 16H18V17.5C18 18.3284 17.3284 19 16.5 19H10.5C7.70419 19 5.35449 17.0879 4.68848 14.5H1.5C0.671573 14.5 0 13.8284 0 13V10C0 9.17157 0.671573 8.5 1.5 8.5H4.68848C5.35449 5.91209 7.70419 4 10.5 4H16.5ZM10.5 5.5C8.01472 5.5 6 7.51472 6 10V13C6 15.4853 8.01472 17.5 10.5 17.5H16.5V5.5H10.5ZM1.5 13H4.5V10H1.5V13Z"
        fill="#548AF7"
      />
    </svg>
  );
}

function WelcomeAgentTaskIcon() {
  return (
    <span className="ws-action-tile-icon-agent" aria-hidden="true">
      <AgentTasksIcon size={24} />
    </span>
  );
}

function SshIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
      <rect x="1" y="2" width="14" height="12" rx="2" fill="#43454A" stroke="#CED0D6" strokeWidth="1"/>
      <path d="M3.5 6.5L6 8.5L3.5 10.5" stroke="#CED0D6" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
      <line x1="7.5" y1="10.5" x2="12" y2="10.5" stroke="#CED0D6" strokeWidth="1" strokeLinecap="round"/>
    </svg>
  );
}

function ChevronDownIcon({ rotated }) {
  return (
    <svg
      width="16" height="16" viewBox="0 0 16 16" fill="none"
      style={{ flexShrink: 0, transform: rotated ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.24s cubic-bezier(0.22, 1, 0.36, 1)' }}
    >
      <path d="M11.5 6.25L8 9.75L4.5 6.25" stroke="var(--text-muted)" strokeLinecap="round"/>
    </svg>
  );
}

// ─── Left panel — project list ────────────────────────────────────────────────

export function WelcomeProjectsPanel({ onNewProject, onProjectSelect, onNewAgentTask, ctx }) {
  const [query, setQuery]           = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const [newMenuRect, setNewMenuRect] = useState(null);

  const filtered = RECENT_PROJECTS.filter(p =>
    p.name.toLowerCase().includes(query.toLowerCase())
  );

  function handleActionClick(item, e) {
    if (item.id === 'new') {
      const rect = e.currentTarget.getBoundingClientRect();
      setNewMenuRect(rect);
      setNewMenuOpen(o => !o);
    } else if (item.id === 'agent-tasks') {
      onNewAgentTask?.();
    }
  }

  function closeNewMenu() {
    setNewMenuOpen(false);
  }

  return (
    <ToolWindow
      title="Project"
      actions={['more', 'minimize']}
      focused={ctx.focusedPanel === 'left'}
      onFocus={() => ctx.setFocusedPanel('left')}
      onActionClick={(action) => {
        if (action === 'minimize') ctx.setShowLeftPanel(false);
      }}
      className="main-window-tool-window main-window-tool-window-left"
    >
      <div className="ws-panel-body">

        {/* Action buttons */}
        <div className="ws-actions-section">
          {ACTION_ITEMS.map(item => (
            <button
              key={item.id}
              className={`ws-disclosure-item${item.primary ? ' primary' : ''}`}
              data-demo-id={item.id === 'agent-tasks' ? 'welcome-new-agent-task' : undefined}
              onClick={(e) => handleActionClick(item, e)}
            >
              {item.customIcon === 'ssh' ? <SshIcon /> : (item.customIcon === 'agent' ? <AgentTasksIcon size={16} /> : <Icon name={item.icon} size={16} />)}
              <span className="ws-disclosure-text">{item.label}</span>
              {item.chevron && <ChevronDownIcon rotated={newMenuOpen} />}
            </button>
          ))}
        </div>

        {/* Search + recent projects */}
        <div className="ws-recent-section">
          <div className="ws-search-bar">
            <Search
              placeholder="Search recent projects"
              value={query}
              onChange={setQuery}
            />
          </div>

          <div className="ws-project-list">
            {filtered.map((p, i) => (
              <div
                key={`${p.id}-${i}`}
                className={`ws-project-cell${selectedId === p.id ? ' selected' : ''}`}
                onClick={() => { setSelectedId(p.id); onProjectSelect(p.id); }}
              >
                <div className="ws-project-badge" style={{ background: p.bg }}>
                  <span>{p.initials}</span>
                </div>
                <div className="ws-project-info">
                  <span className="ws-project-name">{p.name}</span>
                  <span className="ws-project-path">{p.path}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* New... context menu */}
      {newMenuOpen && newMenuRect && (
        <PositionedPopup triggerRect={newMenuRect} onDismiss={closeNewMenu} gap={4}>
          <Popup visible style={{ position: 'static' }}>
            {NEW_MENU_ITEMS.map(item =>
              item.type === 'separator'
                ? <PopupCell key={item.id} type="separator" />
                : (
                  <PopupCell
                    key={item.id}
                    icon={item.icon}
                    onClick={() => {
                      closeNewMenu();
                      if (item.id === 'project') onNewProject();
                    }}
                  >
                    {item.label}
                  </PopupCell>
                )
            )}
          </Popup>
        </PositionedPopup>
      )}
    </ToolWindow>
  );
}

// ─── Quick action tiles ───────────────────────────────────────────────────────

const QUICK_ACTIONS = [
  { id: 'agent-tasks', label: 'New Agent Task', IconComponent: WelcomeAgentTaskIcon },
  { id: 'script', label: 'New Script', IconComponent: ScriptWelcomeIcon },
  { id: 'notebook', label: 'New Notebook', IconComponent: NotebookWelcomeIcon },
  { id: 'import', label: 'Import File', IconComponent: ImportWelcomeIcon },
  { id: 'learn', label: 'Learn', IconComponent: LearnWelcomeIcon },
  { id: 'plugins', label: 'Plugins', IconComponent: PluginsWelcomeIcon },
];

// ─── Editor area — gradient welcome content ───────────────────────────────────

export function WelcomeGradientArea({ onNewAgentTask }) {
  const [mode, setMode] = useState('manual');
  const [startup, setStartup] = useState(true);

  return (
    <div className="ws-gradient-area">
      <div className="ws-center-panel">

        <div className="ws-center-header">
          <span className="ws-center-title">Welcome to IntelliJ IDEA</span>
          <span className="ws-center-subtitle">Start in one click</span>
        </div>

        <div className="ws-action-grid">
          {QUICK_ACTIONS.map(action => (
            <button
              key={action.id}
              type="button"
              className="ws-action-tile"
              data-demo-id={action.id === 'agent-tasks' ? 'welcome-quick-new-agent-task' : undefined}
              onClick={action.id === 'agent-tasks' ? () => onNewAgentTask?.() : undefined}
            >
              <span className="ws-action-tile-icon">
                {action.IconComponent ? <action.IconComponent /> : <Icon name={action.icon} size={24} />}
              </span>
              <span className="ws-action-tile-label">{action.label}</span>
            </button>
          ))}
        </div>

        <SegmentedControl
          options={[{ value: 'manual', label: 'Manual' }, { value: 'ai', label: 'AI' }]}
          value={mode}
          onChange={setMode}
        />

      </div>

      <div className="ws-footer">
        <div className="ws-footer-dropdowns">
          <button className="ws-toolbar-btn">
            <MoonIcon />
            <span>Theme: Dark</span>
            <ChevronDownIcon rotated={false} />
          </button>
          <button className="ws-toolbar-btn">
            <KeyboardIcon />
            <span>Keymap: macOS</span>
            <ChevronDownIcon rotated={false} />
          </button>
        </div>
        <Checkbox checked={startup} onChange={setStartup} label="Always show this page on startup" />
      </div>
    </div>
  );
}
