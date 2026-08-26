// Attachment chip primitives shared by the chat composer (App.jsx) and the AI Review popup
// (PlanDiffView.jsx), so a chip looks and reads the same wherever it is rendered.
import { Button, Icon, TooltipHelp } from '@jetbrains/int-ui-kit';
import { AiChatAgentIcon } from './AiChatListParts.jsx';
import {
  getAiChatAttachmentCommentPreviewItems,
  getSelectionContextItems,
  getSelectionContextPreviewItems,
} from './aiChatCommentPreview.js';

export function AiChatAttachmentIcon({ icon = 'vcs/diff' }) {
  if (icon === 'claude' || icon === 'junie' || icon === 'codex') {
    return (
      <span className="ai-chat-attachment-icon">
        <AiChatAgentIcon icon={icon} />
      </span>
    );
  }

  return <Icon name={icon} size={16} className="icon ai-chat-attachment-icon" />;
}

export function truncateMiddleText(text = '', maxLength = 34) {
  const normalized = typeof text === 'string' ? text.trim() : '';
  if (normalized.length <= maxLength) return normalized;
  const sideLength = Math.max(6, Math.floor((maxLength - 1) / 2));
  const endLength = Math.max(6, maxLength - sideLength - 1);
  return `${normalized.slice(0, sideLength)}…${normalized.slice(-endLength)}`;
}

export function getAiChatAttachmentFullLabel(attachment = null) {
  const candidates = [
    attachment?.fullPath,
    attachment?.path,
    attachment?.sourcePath,
    attachment?.sourceLabel,
    attachment?.diffRequest?.source?.path,
    attachment?.diffRequest?.source?.label,
    attachment?.label,
  ];

  return candidates.find((candidate) => (
    typeof candidate === 'string' && candidate.trim().length > 0
  ))?.trim() ?? '';
}

export function getAiChatAttachmentDisplayLabel(attachment = null) {
  const label = typeof attachment?.label === 'string' && attachment.label.trim().length > 0
    ? attachment.label.trim()
    : getAiChatAttachmentFullLabel(attachment);
  return truncateMiddleText(label, label.includes('/') ? 30 : 34);
}

export function isAiChatImageAttachment(attachment = null) {
  const label = `${attachment?.label ?? ''} ${getAiChatAttachmentFullLabel(attachment)}`.toLowerCase();
  const icon = typeof attachment?.icon === 'string' ? attachment.icon.toLowerCase() : '';
  return icon.includes('image') || /\.(png|jpe?g|gif|webp|svg)$/iu.test(label);
}

export function shouldShowAiChatAttachmentPathTooltip(attachment = null) {
  const fullLabel = getAiChatAttachmentFullLabel(attachment);
  // This is the fallback hover content for attachments that do not carry
  // comments or an image preview. Keep it for short labels too: otherwise a
  // regular diff/file chip has no hover element at all.
  return fullLabel.length > 0;
}

export function AiChatAttachmentPathTooltip({ attachment = null }) {
  if (!shouldShowAiChatAttachmentPathTooltip(attachment)) return null;
  return (
    <span className="ai-chat-attachment-path-tooltip" role="tooltip">
      {getAiChatAttachmentFullLabel(attachment)}
    </span>
  );
}



export function getAiChatAttachmentInlineCount(attachment = null) {
  if (!attachment || typeof attachment !== 'object') return 0;
  // A quote is already identified by its selected text. A "comment 1" badge
  // would make every quote look like an aggregated comment thread.
  if (attachment.hideInlineCount) return 0;
  const selectionCount = Array.isArray(attachment.selections) && attachment.selections.length > 0
    ? attachment.selections.length
    : Number.isFinite(attachment.selectionCount) && attachment.selectionCount > 0
      ? attachment.selectionCount
      : (attachment.isSelectionContext ? 1 : 0);
  const commentCount = Number.isFinite(attachment.commentCount) && attachment.commentCount > 0
    ? attachment.commentCount
    : 0;
  return commentCount + selectionCount;
}

export function AttachmentCommentHoverCard({
  items = [],
  contextLabel = '',
  itemLabel = 'AI Note',
  itemLabelPlural = 'AI Notes',
}) {
  const visible = items.slice(0, 3);
  const hidden = Math.max(0, items.length - visible.length);
  if (visible.length === 0) return null;
  const isAnnotationsContext = typeof contextLabel === 'string' && contextLabel.trim() === 'Quotes';
  const resolvedItemLabel = isAnnotationsContext ? 'Quote' : itemLabel;
  const resolvedItemLabelPlural = isAnnotationsContext ? 'Quotes' : itemLabelPlural;
  const normalize = (label) => (typeof label === 'string' ? label.trim().toLowerCase() : '');
  // The chip already names the file, so its own label is dropped from the note's
  // meta; a label is kept only when the note comes from some other source.
  const foreignSourceLabel = (item) => (
    item.sourceLabel && normalize(item.sourceLabel) !== normalize(contextLabel) ? item.sourceLabel : null
  );
  // Every message — the note and the agent's answer alike — is author line + text,
  // in that order, so the card reads as one thread rather than two shapes.
  const renderMessage = (author, text, key) => (
    <div className="ai-chat-attachment-hover-message" key={key}>
      <div className="ai-chat-attachment-hover-meta">{author}</div>
      <div className="ai-chat-attachment-hover-text">{text}</div>
    </div>
  );

  if (isAnnotationsContext) {
    return (
      <TooltipHelp
        className="ai-chat-attachment-hover-tooltip ai-chat-annotations-hover-tooltip"
        header={null}
        body={(
          <div className="ai-chat-annotations-hover-list">
            {visible.map((item, index) => {
              const annotationLabel = typeof item.lineLabel === 'string' && item.lineLabel.trim().length > 0
                ? item.lineLabel.trim().replace('#', '')
                : `Quote ${index + 1}`;

              return (
                <div className="ai-chat-attachment-hover-note" key={`annotation-hover-${index}`}>
                  <div className="ai-chat-attachment-hover-message">
                    <div className="ai-chat-attachment-hover-meta">{annotationLabel}</div>
                    <div className="ai-chat-attachment-hover-text">{item.text}</div>
                  </div>
                </div>
              );
            })}
            {hidden > 0 && (
              <div className="ai-chat-attachment-hover-more">{`+${hidden} more`}</div>
            )}
          </div>
        )}
      />
    );
  }

  return (
    <TooltipHelp
      className="ai-chat-attachment-hover-tooltip"
      header={null}
      body={(
        <>
          {visible.map((item, index) => (
            <div className="ai-chat-attachment-hover-note" key={`hover-note-${index}`}>
              {renderMessage(
                [
                  foreignSourceLabel(item),
                  item.lineLabel,
                  (!item.lineLabel && item.isSelectionContextPreview) ? `Quote ${index + 1}` : null,
                  (!item.lineLabel && !item.isSelectionContextPreview) ? resolvedItemLabel : null,
                ].filter(Boolean).join(' · '),
                item.text,
                `hover-note-${index}-user`,
              )}
              {item.agentReply
                ? renderMessage('Claude Agent', item.agentReply, `hover-note-${index}-agent`)
                : null}
            </div>
          ))}
          {hidden > 0 && (
            <div className="ai-chat-attachment-hover-more">{`+${hidden} more`}</div>
          )}
        </>
      )}
    />
  );
}

export function AiChatImageAttachmentPreview({ attachment = null }) {
  if (!isAiChatImageAttachment(attachment)) return null;

  return (
    <span className="ai-chat-image-attachment-preview" role="tooltip">
      <span className="ai-chat-image-attachment-preview-frame">
        <span className="ai-chat-image-attachment-preview-card">
          <span className="ai-chat-image-preview-thumb">
            <Icon name="fileTypes/image" size={16} />
          </span>
          <span className="ai-chat-image-preview-copy">
            <span className="ai-chat-image-preview-title">{getAiChatAttachmentDisplayLabel(attachment)}</span>
            <span className="ai-chat-image-preview-meta">Image preview</span>
          </span>
          <span className="ai-chat-image-preview-close" aria-hidden="true">
            <Icon name="windows/closeSmall" size={16} />
          </span>
        </span>
        <span className="ai-chat-image-preview-body">Preview unavailable in prototype</span>
      </span>
    </span>
  );
}

// One attachment strip for every composer: the chat tab input and the AI Review popup render
// this component, so chips look and behave identically in both.
export function AiChatAttachmentStrip({
  attachments = [],
  collapsedLimit = 18,
  expanded = false,
  onExpandedChange = null,
  expandedSourceId = null,
  onExpandedSourceIdChange = null,
  onOpen = null,
  onRemove = null,
  onContextMenu = null,
  onSourceOpen = null,
  // Previews come from the same builder the chat composer uses, so notes, selections and SDD
  // entries hover identically everywhere. A chip may also carry ready-made items.
  getCommentPreviewItems = (attachment) => (Array.isArray(attachment?.commentPreviewItems)
    ? attachment.commentPreviewItems
    : getAiChatAttachmentCommentPreviewItems(attachment)),
  className = '',
  chipClassName = '',
  removeButtonClassName = 'ai-chat-attachment-close-button',
  removeLabel = 'Remove attachment from input',
  stopClickPropagation = false,
}) {
  const visibleAttachments = Array.isArray(attachments) ? attachments.filter(Boolean) : [];
  if (visibleAttachments.length === 0) return null;

  const hasOverflow = visibleAttachments.length > collapsedLimit;
  const renderedAttachments = expanded || !hasOverflow
    ? visibleAttachments
    : visibleAttachments.slice(0, collapsedLimit);
  const hiddenCount = Math.max(0, visibleAttachments.length - renderedAttachments.length);

  return (
    <div
      className={`ai-chat-attachments${expanded ? ' is-expanded' : ''}${className ? ` ${className}` : ''}`}
      onClick={stopClickPropagation ? (event) => event.stopPropagation() : undefined}
    >
      {renderedAttachments.map((attachment) => {
        const commentSources = Array.isArray(attachment.commentSources) ? attachment.commentSources : [];
        const hasNestedCommentSources = attachment.isSddDocument && commentSources.some((source) => (
          source?.key !== attachment.sourceTabId
        ));
        const canShowCommentSources = hasNestedCommentSources && Boolean(onSourceOpen);
        const isSourceListOpen = expandedSourceId === attachment.id;
        const commentPreviewItems = getCommentPreviewItems(attachment) ?? [];
        const inlineCount = getAiChatAttachmentInlineCount(attachment);
        const openAttachment = () => onOpen?.(attachment);

        return (
          <span
            key={attachment.id}
            className={`ai-chat-attachment-chip${chipClassName ? ` ${chipClassName}` : ''}${onRemove ? ' has-remove-action' : ''}${isSourceListOpen ? ' is-source-list-open' : ''}`}
            role={onOpen ? 'button' : undefined}
            tabIndex={onOpen ? 0 : undefined}
            onClick={onOpen ? openAttachment : undefined}
            onContextMenu={onContextMenu ? (event) => onContextMenu(event, attachment) : undefined}
            onKeyDown={onOpen
              ? (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openAttachment(); } }
              : undefined}
          >
            <AiChatAttachmentIcon icon={attachment.icon} />
            <span className="ai-chat-attachment-name">{getAiChatAttachmentDisplayLabel(attachment)}</span>
            {inlineCount > 0 && (
              <span className="ai-chat-attachment-comment-count">
                {/* Same balloon-icon count used once this attachment is actually sent
                    (ChatUserCard) — a note shouldn't look different before and after
                    it's delivered. */}
                <Icon name="general/balloon" size={16} />
                <span className="ai-chat-attachment-comment-count-value">{inlineCount}</span>
                {canShowCommentSources && (
                  <button
                    type="button"
                    className="ai-chat-attachment-sources-toggle"
                    aria-label={isSourceListOpen ? 'Hide comment sources' : 'Show comment sources'}
                    aria-expanded={isSourceListOpen}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      onExpandedSourceIdChange?.(isSourceListOpen ? null : attachment.id);
                    }}
                  >
                    <Icon name="general/chevronDown" size={16} className={isSourceListOpen ? 'is-expanded' : ''} />
                  </button>
                )}
              </span>
            )}
            {attachment.updated && (
              <span className="ai-chat-attachment-updated-dot" aria-label="Updated — agent replied" />
            )}
            {canShowCommentSources && isSourceListOpen && (
              <span className="ai-chat-attachment-source-list" role="menu">
                {commentSources.map((source) => {
                  const sourceComments = Array.isArray(source.comments)
                    ? source.comments.filter((comment) => typeof comment === 'string' && comment.trim().length > 0)
                    : [];
                  const visibleSourceComments = sourceComments.slice(0, 3);
                  const hiddenSourceCommentCount = Math.max(0, sourceComments.length - visibleSourceComments.length);

                  return (
                    <button
                      key={source.key}
                      type="button"
                      className="ai-chat-attachment-source-row"
                      role="menuitem"
                      onClick={(event) => onSourceOpen?.(event, attachment, source)}
                    >
                      <AiChatAttachmentIcon icon={source.icon ?? attachment.icon} />
                      <span className="ai-chat-attachment-source-name">{source.label}</span>
                      <span className="ai-chat-attachment-comment-count">
                        <span className="ai-chat-attachment-comment-count-separator" aria-hidden="true">·</span>
                        <span className="ai-chat-attachment-comment-count-value">
                          {Number.isFinite(source.count) ? source.count : 0}
                        </span>
                      </span>
                      {sourceComments.length > 0 && (
                        <span className="ai-chat-attachment-comment-preview ai-chat-attachment-source-row-comment-preview" role="tooltip">
                          <span className="ai-chat-attachment-comment-preview-title">
                            {sourceComments.length === 1 ? 'AI Note' : 'AI Notes · '}
                          </span>
                          {visibleSourceComments.map((comment, index) => (
                            <span key={`${source.key}-source-comment-preview-${index}`} className="ai-chat-attachment-comment-preview-item">
                              {comment}
                            </span>
                          ))}
                          {hiddenSourceCommentCount > 0 && (
                            <span className="ai-chat-attachment-comment-preview-more">
                              {`+${hiddenSourceCommentCount} more`}
                            </span>
                          )}
                        </span>
                      )}
                    </button>
                  );
                })}
              </span>
            )}
            {commentPreviewItems.length > 0 && !isSourceListOpen && (
              <span className="ai-chat-attachment-comment-preview ai-chat-attachment-comment-preview-library" role="tooltip">
                <AttachmentCommentHoverCard items={commentPreviewItems} contextLabel={attachment.label} />
              </span>
            )}
            {commentPreviewItems.length === 0 && isAiChatImageAttachment(attachment) && (
              <AiChatImageAttachmentPreview attachment={attachment} />
            )}
            {commentPreviewItems.length === 0 && !isAiChatImageAttachment(attachment) && (
              <AiChatAttachmentPathTooltip attachment={attachment} />
            )}
            {onRemove && (
              <button
                className={removeButtonClassName}
                type="button"
                aria-label={typeof removeLabel === 'function' ? removeLabel(attachment) : removeLabel}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onRemove(attachment);
                }}
              >
                <Icon name="windows/closeSmall" size={16} className="ai-chat-attachment-close" />
              </button>
            )}
          </span>
        );
      })}
      {hasOverflow && (
        <Button
          type="secondary"
          size="slim"
          className="ai-chat-attachments-show-all"
          aria-expanded={expanded}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onExpandedChange?.(!expanded);
          }}
        >
          {expanded ? 'Show less' : `Show all${hiddenCount > 0 ? ` +${hiddenCount}` : ''}`}
        </Button>
      )}
    </div>
  );
}
