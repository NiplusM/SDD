import { Fragment, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon, Tooltip } from '@jetbrains/int-ui-kit';
import { AI_NOTE_FILE_HINT } from './aiNoteHints.js';
import { AiChatAgentIcon } from './AiChatListParts.jsx';

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
  { id: 'ask-in-side-chat', label: 'Ask in Side Chat' },
];

const CHAT_SELECTION_ACTIONS = [
  { id: 'chat-annotate', iconName: 'general/balloon', label: 'Attach AI Note', title: AI_NOTE_FILE_HINT },
  { id: 'chat-add-to-chat', iconName: 'aiAssistant/toolWindowChat@20x20', label: 'Add Selection', accent: 'assistant' },
  { id: 'ask-in-side-chat', label: 'Ask in Side Chat' },
];

export function EditorSelectionToolbar({ position, onAction = null, chatTargets = [], onMenuOpenChange = null, onDismiss = null }) {
  const rootRef = useRef(null);
  const [openActionMenu, setOpenActionMenu] = useState(false);
  const [openChatTargetsForActionId, setOpenChatTargetsForActionId] = useState(null);
  const [frozenPosition, setFrozenPosition] = useState(position);
  const menuPositionLocked = openActionMenu || Boolean(openChatTargetsForActionId);
  const renderPosition = menuPositionLocked ? (frozenPosition ?? position) : position;

  const surface = renderPosition?.surface === 'ai-chat'
    ? 'ai-chat'
    : renderPosition?.surface === 'diff'
      ? 'diff'
      : 'file';
  const selectionActions = surface === 'ai-chat' ? CHAT_SELECTION_ACTIONS : CODE_SELECTION_ACTIONS;
  const primaryAction = selectionActions[0];

  useEffect(() => {
    setOpenActionMenu(false);
    setOpenChatTargetsForActionId(null);
    if (position) {
      setFrozenPosition(position);
    }
  }, [
    surface,
    position?.selectedText,
    position?.sourceTabId,
    position?.chatId,
    position?.messageId,
    position?.blockId,
    position?.rowId,
  ]);

  useEffect(() => {
    if (position && !menuPositionLocked) {
      setFrozenPosition(position);
    }
  }, [position, menuPositionLocked]);

  useEffect(() => {
    onMenuOpenChange?.(openActionMenu);
    return () => onMenuOpenChange?.(false);
  }, [onMenuOpenChange, openActionMenu]);

  useEffect(() => {
    if (!renderPosition) return undefined;

    const closeOnOutsidePointer = (event) => {
      if (rootRef.current?.contains(event.target)) return;
      onMenuOpenChange?.(false);
      setOpenActionMenu(false);
      setOpenChatTargetsForActionId(null);
      onDismiss?.();
    };
    document.addEventListener('mousedown', closeOnOutsidePointer, true);
    return () => document.removeEventListener('mousedown', closeOnOutsidePointer, true);
  }, [onDismiss, onMenuOpenChange, renderPosition]);

  useEffect(() => {
    if (!openActionMenu) {
      setOpenChatTargetsForActionId(null);
    }
  }, [openActionMenu]);

  if (!renderPosition) return null;

  const items = renderPosition.surface === 'ai-chat' || renderPosition.surface === 'diff'
    ? CHAT_SELECTION_TOOLBAR_ITEMS
    : EDITOR_SELECTION_TOOLBAR_ITEMS;

  const preventSelectionReset = (event) => {
    event.preventDefault();
  };

  const handleActionMouseDown = (event, actionId) => {
    event.preventDefault();
    setOpenActionMenu(false);
    setOpenChatTargetsForActionId(null);
    onMenuOpenChange?.(false);
    onDismiss?.();
    onAction?.(actionId, event.currentTarget.getBoundingClientRect(), renderPosition);
  };

  const handleMenuItemMouseDown = (event, actionId) => {
    event.preventDefault();
    setOpenActionMenu(false);
    setOpenChatTargetsForActionId(null);
    onMenuOpenChange?.(false);
    onAction?.(actionId, event.currentTarget.getBoundingClientRect(), renderPosition);
  };

  const handleTargetChatMouseDown = (event, actionId, chatId) => {
    event.preventDefault();
    event.stopPropagation();
    setOpenActionMenu(false);
    setOpenChatTargetsForActionId(null);
    onMenuOpenChange?.(false);
    onAction?.(`${actionId}:${chatId}`, event.currentTarget.getBoundingClientRect(), renderPosition);
  };

  const renderInlineSelectionAction = (action) => (
    <button
      key={action.id}
      type="button"
      className={`editor-selection-toolbar-btn is-text editor-selection-toolbar-chat-action${action.accent ? ` is-${action.accent}` : ''}`}
      aria-label={action.label}
      title={action.title ?? action.label}
      onMouseDown={(event) => handleActionMouseDown(event, action.id)}
    >
      <span className="editor-selection-toolbar-text">{action.label}</span>
    </button>
  );

  return createPortal(
    <div
      ref={rootRef}
      className={`editor-selection-toolbar editor-selection-toolbar-${renderPosition.placement}`}
      style={{ top: renderPosition.top, left: renderPosition.left }}
      role="toolbar"
      aria-label="Selected text actions"
      onMouseDown={preventSelectionReset}
    >
      {items.map((item) => {
        if (item.kind === 'separator') {
          return <span key={item.id} className="editor-selection-toolbar-separator" aria-hidden="true" />;
        }

        if (item.kind === 'selectionAction') {
          if (surface === 'ai-chat') {
            return (
              <span key={item.id} className="editor-selection-toolbar-chat-actions">
                {selectionActions.map((action, actionIndex) => (
                  <Fragment key={action.id}>
                    {actionIndex > 0 ? (
                      <span className="editor-selection-toolbar-separator is-chat-action" aria-hidden="true" />
                    ) : null}
                    {renderInlineSelectionAction(action)}
                  </Fragment>
                ))}
              </span>
            );
          }

          return (
            <span key={item.id} className="editor-selection-toolbar-menu-anchor">
              <button
                type="button"
                className={`editor-selection-toolbar-btn is-text editor-selection-toolbar-selection-main${primaryAction.accent ? ` is-${primaryAction.accent}` : ''}`}
                aria-label={primaryAction.label}
                title={primaryAction.title ?? primaryAction.label}
                onMouseDown={(event) => handleActionMouseDown(event, primaryAction.id)}
              >
                <span className="editor-selection-toolbar-text">{primaryAction.label}</span>
              </button>
              <span className="editor-selection-toolbar-separator is-split" aria-hidden="true" />
              <button
                type="button"
                className={`editor-selection-toolbar-btn is-chevron${openActionMenu ? ' is-active' : ''}`}
                aria-label="Choose selected text action"
                aria-haspopup="menu"
                aria-expanded={openActionMenu}
                onMouseDown={(event) => {
                  event.preventDefault();
                  setFrozenPosition(renderPosition);
                  setOpenActionMenu((open) => {
                    const nextOpen = !open;
                    onMenuOpenChange?.(nextOpen);
                    return nextOpen;
                  });
                }}
              >
                <Icon name="general/chevronDown" size={16} />
              </button>
              {openActionMenu && (
                <div className="editor-selection-toolbar-menu" role="menu">
                  {selectionActions.map((action) => {
                    const hasChatTargets = action.id === 'add-context' && chatTargets.length > 0;

                    if (hasChatTargets) {
                      return (
                        <div
                          key={action.id}
                          className="editor-selection-toolbar-submenu-anchor"
                          onMouseEnter={() => setOpenChatTargetsForActionId(action.id)}
                        >
                          <button
                            type="button"
                            className={`editor-selection-toolbar-menu-item has-submenu${action.accent ? ` is-${action.accent}` : ''}`}
                            role="menuitem"
                            onMouseDown={(event) => handleMenuItemMouseDown(event, action.id)}
                          >
                            <span className="editor-selection-toolbar-menu-item-label">{action.label}</span>
                          </button>
                          <button
                            type="button"
                            className="editor-selection-toolbar-menu-item-chevron"
                            aria-label={`Choose chat for ${action.label}`}
                            aria-haspopup="menu"
                            aria-expanded={openChatTargetsForActionId === action.id}
                            onMouseDown={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              setOpenChatTargetsForActionId((openActionId) => (
                                openActionId === action.id ? null : action.id
                              ));
                            }}
                          >
                            <Icon name="general/chevronRight" size={16} />
                          </button>
                          {openChatTargetsForActionId === action.id && (
                            <div className="editor-selection-toolbar-submenu is-chat-targets" role="menu" aria-label="Attach selection to chat">
                              {chatTargets.map((chat) => (
                                <button
                                  key={chat.id}
                                  type="button"
                                  className="editor-selection-toolbar-chat-target"
                                  role="menuitem"
                                  onMouseDown={(event) => handleTargetChatMouseDown(event, action.id, chat.id)}
                                >
                                  <span className="editor-selection-toolbar-chat-target-icon" aria-hidden="true">
                                    <AiChatAgentIcon icon={chat.icon} title={chat.title} />
                                  </span>
                                  <span className="editor-selection-toolbar-chat-target-title">{chat.title}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    }

                    return (
                      <button
                        key={action.id}
                        type="button"
                        className={`editor-selection-toolbar-menu-item${action.accent ? ` is-${action.accent}` : ''}`}
                        role="menuitem"
                        onMouseEnter={() => setOpenChatTargetsForActionId(null)}
                        onMouseDown={(event) => handleMenuItemMouseDown(event, action.id)}
                      >
                        <span className="editor-selection-toolbar-menu-item-label">{action.label}</span>
                      </button>
                    );
                  })}
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
            onClick={(event) => onAction?.(item.id, event.currentTarget.getBoundingClientRect(), renderPosition)}
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
