import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon, Tooltip } from '@jetbrains/int-ui-kit';
import { AI_NOTE_FILE_HINT } from './aiNoteHints.js';

const EDITOR_SELECTION_TOOLBAR_ITEMS = [
  { id: 'intention', kind: 'icon', iconName: 'codeInsight/intentionBulb', accent: 'warning', ariaLabel: 'Show actions' },
  { id: 'selection-action', kind: 'selectionAction' },
  { id: 'separator-ai', kind: 'separator' },
  { id: 'refactor', kind: 'text', text: 'Refactor', ariaLabel: 'Refactor' },
  { id: 'search', kind: 'icon', iconName: 'general/search_dark', ariaLabel: 'Search' },
  { id: 'code', kind: 'icon', iconName: 'nodes/tag', ariaLabel: 'Code actions' },
  { id: 'reformat', kind: 'icon', iconName: 'actions/reformatCode_dark', ariaLabel: 'Reformat code' },
  { id: 'more', kind: 'icon', iconName: 'general/moreVertical_dark', ariaLabel: 'More actions' },
];

const CHAT_SELECTION_TOOLBAR_ITEMS = [
  { id: 'selection-action', kind: 'selectionAction' },
];

const CODE_SELECTION_ACTIONS = [
  { id: 'comment', iconName: 'general/balloon', label: 'Attach AI Note', title: AI_NOTE_FILE_HINT },
  { id: 'add-context', iconName: 'aiAssistant/toolWindowChat@20x20', label: 'Add Selection', accent: 'assistant' },
];

const CHAT_SELECTION_ACTIONS = [
  { id: 'chat-annotate', iconName: 'general/balloon', label: 'Attach AI Note', title: AI_NOTE_FILE_HINT },
  { id: 'chat-add-to-chat', iconName: 'aiAssistant/toolWindowChat@20x20', label: 'Add Selection', accent: 'assistant' },
];

export function EditorSelectionToolbar({ position, onAction = null }) {
  const rootRef = useRef(null);
  const [openActionMenu, setOpenActionMenu] = useState(false);
  const [defaultActionBySurface, setDefaultActionBySurface] = useState({
    diff: 'comment',
    file: 'comment',
    'ai-chat': 'chat-annotate',
  });

  const surface = position?.surface === 'ai-chat'
    ? 'ai-chat'
    : position?.surface === 'diff'
      ? 'diff'
      : 'file';
  const selectionActions = surface === 'ai-chat' ? CHAT_SELECTION_ACTIONS : CODE_SELECTION_ACTIONS;
  const selectedAction = selectionActions.find((action) => action.id === defaultActionBySurface[surface])
    ?? selectionActions[0];

  useEffect(() => {
    setOpenActionMenu(false);
  }, [surface, position?.top, position?.left]);

  useEffect(() => {
    if (!openActionMenu) return undefined;

    const closeOnOutsidePointer = (event) => {
      if (rootRef.current?.contains(event.target)) return;
      setOpenActionMenu(false);
    };
    document.addEventListener('mousedown', closeOnOutsidePointer, true);
    return () => document.removeEventListener('mousedown', closeOnOutsidePointer, true);
  }, [openActionMenu]);

  if (!position) return null;

  const items = position.surface === 'ai-chat'
    ? CHAT_SELECTION_TOOLBAR_ITEMS
    : EDITOR_SELECTION_TOOLBAR_ITEMS;

  const preventSelectionReset = (event) => {
    event.preventDefault();
  };

  return createPortal(
    <div
      ref={rootRef}
      className={`editor-selection-toolbar editor-selection-toolbar-${position.placement}`}
      style={{ top: position.top, left: position.left }}
      role="toolbar"
      aria-label="Selected text actions"
      onMouseDown={preventSelectionReset}
    >
      {items.map((item) => {
        if (item.kind === 'separator') {
          return <span key={item.id} className="editor-selection-toolbar-separator" aria-hidden="true" />;
        }

        if (item.kind === 'selectionAction') {
          return (
            <span key={item.id} className="editor-selection-toolbar-menu-anchor">
              <button
                type="button"
                className={`editor-selection-toolbar-btn is-text editor-selection-toolbar-selection-main${selectedAction.accent ? ` is-${selectedAction.accent}` : ''}`}
                aria-label={selectedAction.label}
                title={selectedAction.title ?? selectedAction.label}
                onMouseDown={preventSelectionReset}
                onClick={(event) => onAction?.(selectedAction.id, event.currentTarget.getBoundingClientRect(), position)}
              >
                <Icon name={selectedAction.iconName} size={16} />
                <span className="editor-selection-toolbar-text">{selectedAction.label}</span>
              </button>
              <span className="editor-selection-toolbar-separator is-split" aria-hidden="true" />
              <button
                type="button"
                className={`editor-selection-toolbar-btn is-chevron${openActionMenu ? ' is-active' : ''}`}
                aria-label="Choose selected text action"
                aria-haspopup="menu"
                aria-expanded={openActionMenu}
                onMouseDown={preventSelectionReset}
                onClick={() => setOpenActionMenu((open) => !open)}
              >
                <Icon name="general/chevronDown" size={16} />
              </button>
              {openActionMenu && (
                <div className="editor-selection-toolbar-menu" role="menu">
                  {selectionActions.map((action) => (
                    <button
                      key={action.id}
                      type="button"
                      className={`editor-selection-toolbar-menu-item${action.accent ? ` is-${action.accent}` : ''}`}
                      role="menuitemradio"
                      aria-checked={action.id === selectedAction.id}
                      onMouseDown={preventSelectionReset}
                      onClick={() => {
                        setDefaultActionBySurface((current) => ({ ...current, [surface]: action.id }));
                        setOpenActionMenu(false);
                      }}
                    >
                      <Icon name={action.iconName} size={16} />
                      <span className="editor-selection-toolbar-menu-item-label">{action.label}</span>
                      <span className="editor-selection-toolbar-menu-item-check" aria-hidden="true">
                        {action.id === selectedAction.id ? '✓' : ''}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </span>
          );
        }

        const isTextButton = item.kind === 'text' || item.kind === 'iconText';
        const className = [
          'editor-selection-toolbar-btn',
          isTextButton ? 'is-text' : '',
          item.accent ? `is-${item.accent}` : '',
          item.className ?? '',
        ].filter(Boolean).join(' ');

        const button = (
          <button
            key={item.id}
            type="button"
            className={className}
            aria-label={item.ariaLabel}
            onMouseDown={preventSelectionReset}
            onClick={(event) => onAction?.(item.id, event.currentTarget.getBoundingClientRect(), position)}
          >
            {item.kind === 'icon' ? (
              <Icon name={item.iconName} size={16} />
            ) : item.kind === 'iconText' ? (
              <>
                <Icon name={item.iconName} size={16} />
                <span className="editor-selection-toolbar-text">{item.text}</span>
              </>
            ) : (
              <span className="editor-selection-toolbar-text" aria-hidden="true">
                {item.text}
              </span>
            )}
          </button>
        );

        return item.title ? (
          <Tooltip key={item.id} text={item.title} placement="bottom" delay={650} className="ai-note-tooltip">
            {button}
          </Tooltip>
        ) : button;
      })}
    </div>,
    document.body
  );
}
