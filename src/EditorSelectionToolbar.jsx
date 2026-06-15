import { createPortal } from 'react-dom';
import { Icon } from '@jetbrains/int-ui-kit';

const EDITOR_SELECTION_TOOLBAR_ITEMS = [
  { id: 'intention', kind: 'icon', iconName: 'codeInsight/intentionBulb', accent: 'warning', ariaLabel: 'Show actions' },
  { id: 'ask-ai', kind: 'iconText', iconName: 'aiAssistant/aiAssistantColored', text: 'Ask AI', ariaLabel: 'Ask AI' },
  { id: 'refactor', kind: 'text', text: 'Refactor', ariaLabel: 'Refactor' },
  { id: 'search', kind: 'icon', iconName: 'general/search_dark', ariaLabel: 'Search' },
  // Reference uses a dim angle-brackets glyph instead of a text "<>" button.
  { id: 'code', kind: 'icon', iconName: 'nodes/tag', ariaLabel: 'Code actions' },
  { id: 'reformat', kind: 'icon', iconName: 'actions/reformatCode_dark', ariaLabel: 'Reformat code' },
  { id: 'more', kind: 'icon', iconName: 'general/moreVertical_dark', ariaLabel: 'More actions' },
];

export function EditorSelectionToolbar({ position, onAction = null }) {
  if (!position) return null;

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
      {EDITOR_SELECTION_TOOLBAR_ITEMS.map((item) => {
        if (item.kind === 'separator') {
          return <span key={item.id} className="editor-selection-toolbar-separator" aria-hidden="true" />;
        }

        const isTextButton = item.kind === 'text' || item.kind === 'iconText';
        const className = [
          'editor-selection-toolbar-btn',
          isTextButton ? 'is-text' : '',
          item.accent ? `is-${item.accent}` : '',
          item.className ?? '',
        ].filter(Boolean).join(' ');

        return (
          <button
            key={item.id}
            type="button"
            className={className}
            aria-label={item.ariaLabel}
            title={item.ariaLabel}
            onMouseDown={preventSelectionReset}
            onClick={(event) => onAction?.(item.id, event.currentTarget.getBoundingClientRect())}
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
      })}
    </div>,
    document.body
  );
}
