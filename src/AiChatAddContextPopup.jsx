// The "Add context" popup behind the composer's "+" button. Shared so the AI Review popup's "+"
// opens exactly the same thing instead of a bespoke menu.
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Badge, Icon, Popup, PopupCell, PositionedPopup } from '@jetbrains/int-ui-kit';
import { AI_NOTE_DIFF_HINT } from './aiNoteHints.js';

// One source of truth for the rows so a caller can turn a click into an attachment.
// `path` feeds the chip's hover tooltip (the composer's attachments carry one too).
export const AI_CHAT_RECENT_CONTEXT_FILES = [
  { id: 'recent-acp-json', label: 'acp.json', icon: 'fileTypes/json', hint: '~/.jetbrains/acp.json', path: '~/.jetbrains/acp.json', type: 'advanced' },
  { id: 'recent-integral-mask', label: 'integralMask', icon: 'fileTypes/java', path: '~/projects/payment-service/src/main/java/imaging/integralMask.java' },
  { id: 'recent-image-data', label: 'ImageData.java', icon: 'fileTypes/java', path: '~/projects/payment-service/src/main/java/imaging/ImageData.java' },
  { id: 'recent-package-json', label: 'package.json', icon: 'fileTypes/json', path: '~/projects/payment-service/package.json' },
  { id: 'recent-readme', label: 'README.md', icon: 'fileTypes/modified', path: '~/projects/payment-service/README.md' },
  { id: 'recent-refactor-md', label: 'how to refactor the code.md', icon: 'fileTypes/modified', path: '~/projects/payment-service/docs/how to refactor the code.md' },
  { id: 'recent-implicit-highl', label: 'IMPLICIT_HIGHL_BIT', icon: 'fileTypes/unknown', path: '~/projects/payment-service/src/main/java/render/Flags.java' },
  { id: 'recent-confetti', label: 'confettiEffect.tsx', icon: 'fileTypes/javaScript', path: '~/projects/payment-service/web/src/confettiEffect.tsx' },
];

export function AiChatAddContextPopup({
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
  // When set, picking a row hands the caller an attachment instead of only closing the popup.
  onSelectAttachment = null,
  width = 320,
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
          style={{ width, maxWidth: width }}
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
          <PopupCell
            icon="actions/viewAsImage"
            onClick={() => {
              onSelectAttachment?.({ id: 'context-image', label: 'Image', icon: 'fileTypes/image' });
              handleClose();
            }}
          >
            Image...
          </PopupCell>
          <AiChatAddContextSeparator />

          <AiChatContextToggleCell
            checked={includeIdeContext}
            onToggle={() => setIncludeIdeContext((prev) => !prev)}
            tooltip="Shares your active file, selection, and open tabs."
          >
            Include IDE Context
          </AiChatContextToggleCell>
          {/* Temporarily hidden until the Notes entry point in the + menu is ready.
          <AiChatContextToggleCell
            checked={diffGutterCommentsEnabled}
            onToggle={() => {
              onDiffCommentsOptionSeen?.();
              onDiffGutterCommentsEnabledChange?.((prev) => !prev);
            }}
            tooltip={AI_NOTE_DIFF_HINT}
            badge={diffCommentsOptionIsNew ? 'New' : ''}
          >
            Enable Notes in Diffs
          </AiChatContextToggleCell>
          */}

          <AiChatAddContextSeparator />
          <div className="ai-chat-add-context-section-label">Recent files</div>

          {AI_CHAT_RECENT_CONTEXT_FILES.map((file) => (
            <PopupCell
              key={file.id}
              type={file.type ?? 'line'}
              icon={file.icon}
              hint={file.hint}
              onClick={() => {
                onSelectAttachment?.({
                  id: file.id,
                  label: file.label,
                  icon: file.icon,
                  meta: file.hint ?? file.path ?? '',
                  path: file.path ?? '',
                });
                handleClose();
              }}
            >
              {file.label}
            </PopupCell>
          ))}
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
