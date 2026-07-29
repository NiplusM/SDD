import { createPortal } from 'react-dom';
import { Icon } from '@jetbrains/int-ui-kit';

const EDITOR_SELECTION_ACTIONS = [
  {
    id: 'add-context',
    label: 'Add as Context',
    iconName: 'aiAssistant/aiAssistantColored',
  },
  {
    id: 'add-context-comment',
    label: 'Add with Comment',
    iconName: 'general/balloon',
  },
];

const CHAT_SELECTION_ACTIONS = [
  {
    id: 'chat-add-to-chat',
    label: 'Add to Chat',
    iconName: 'general/balloon',
  },
];

export function EditorSelectionToolbar({ position, onAction = null }) {
  if (!position) return null;

  const actions = position.surface === 'ai-chat'
    ? CHAT_SELECTION_ACTIONS
    : EDITOR_SELECTION_ACTIONS;

  const preventSelectionReset = (event) => {
    event.preventDefault();
  };

  return createPortal(
    <div
      className={`editor-selection-toolbar editor-selection-toolbar-${position.placement}`}
      style={{ top: position.top, left: position.left }}
      role="toolbar"
      aria-label="Selected text actions"
      onMouseDown={preventSelectionReset}
    >
      {actions.map((action) => (
        <button
          key={action.id}
          type="button"
          className="editor-selection-toolbar-btn is-text"
          aria-label={action.label}
          onMouseDown={preventSelectionReset}
          onClick={(event) => onAction?.(action.id, event.currentTarget.getBoundingClientRect(), position)}
        >
          <Icon name={action.iconName} size={16} />
          <span className="editor-selection-toolbar-text">{action.label}</span>
        </button>
      ))}
    </div>,
    document.body
  );
}
