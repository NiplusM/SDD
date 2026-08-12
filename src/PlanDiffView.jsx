import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon, IconButton, Button, Checkbox, Dialog, Input, PositionedPopup, Popup, PopupCell, Badge, Loader, SegmentedControl, ToolbarButton, ToolbarSeparator, TooltipHelp, TreeNode } from '@jetbrains/int-ui-kit';
import { AiChatAgentIcon } from './AiChatListParts.jsx';
import { AiChatAddContextPopup } from './AiChatAddContextPopup.jsx';
import { AiChatAttachmentStrip } from './aiChatAttachmentParts.jsx';
import { AI_NOTE_DIFF_HINT, AI_NOTE_FILE_HINT } from './aiNoteHints.js';
import { countCommentThreadMessages, textLooksLikeQuestion } from './commentCounts.js';
import openAiIconUrl from './assets/openAI.svg';

const PLAN_DIFF_DEFAULT_CARET_LEFT = 12;
export const REVIEW_FINDING_STATUS_IDS = ['open', 'accepted', 'dismissed', 'deleted', 'pending-update'];
const REVIEW_FINDING_STATUS_LABELS = {
  open: 'Open',
  accepted: 'Accepted',
  dismissed: 'Dismissed',
  deleted: 'Deleted',
  'pending-update': 'Pending update',
};

// Canonical V1 finding status. `resolved` / `resolvedKind` are retained as a
// compatibility layer for the older Code Notes renderer, while every AI Review
// surface reads the same five-state model through this helper.
export function getReviewFindingStatus(comment = null) {
  const explicit = typeof comment?.reviewStatus === 'string'
    ? comment.reviewStatus.trim().toLowerCase().replace(/[\s_]+/g, '-')
    : '';
  if (comment?.pending) return 'pending-update';
  if (REVIEW_FINDING_STATUS_IDS.includes(explicit)) return explicit;
  if (comment?.resolvedKind === 'applied') return 'accepted';
  if (comment?.resolvedKind === 'deleted') return 'deleted';
  if (comment?.resolvedKind === 'dismissed' || comment?.resolved) return 'dismissed';
  return 'open';
}

export function getReviewFindingStatusLabel(comment = null) {
  return REVIEW_FINDING_STATUS_LABELS[getReviewFindingStatus(comment)] ?? REVIEW_FINDING_STATUS_LABELS.open;
}

function isReviewFindingDecided(comment = null) {
  return ['accepted', 'dismissed', 'deleted'].includes(getReviewFindingStatus(comment));
}

const JAVA_SCRIPT_KEYWORDS = [
  'abstract', 'boolean', 'break', 'case', 'catch', 'class', 'const', 'continue',
  'default', 'do', 'else', 'export', 'extends', 'final', 'finally', 'for',
  'function', 'if', 'implements', 'import', 'instanceof', 'interface', 'let',
  'new', 'package', 'private', 'protected', 'public', 'return', 'static',
  'super', 'switch', 'this', 'throw', 'throws', 'try', 'typeof', 'var', 'void',
  'while',
];

const YAML_CONSTANTS = ['true', 'false', 'null'];
const CODE_CONSTANTS = ['true', 'false', 'null', 'undefined'];

function hasActiveMultilineSelection() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;

  const activeElement = document.activeElement;
  if (activeElement instanceof HTMLTextAreaElement) {
    const start = activeElement.selectionStart ?? 0;
    const end = activeElement.selectionEnd ?? 0;
    return start !== end;
  }

  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return false;
  if (selection.toString().trim()) return true;

  const range = selection.getRangeAt(0);
  const rects = Array.from(range.getClientRects()).filter((rect) => rect.width > 0 || rect.height > 0);
  if (rects.length <= 1) return false;

  const firstTop = Math.round(rects[0].top);
  return rects.some((rect) => Math.abs(Math.round(rect.top) - firstTop) > 2);
}

function captureActiveSelectionSnapshot() {
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
  if (!selection || selection.isCollapsed || selection.rangeCount === 0 || !hasActiveMultilineSelection()) {
    return null;
  }

  return {
    type: 'range',
    range: selection.getRangeAt(0).cloneRange(),
  };
}

function restoreSelectionSnapshot(snapshot) {
  if (!snapshot || typeof window === 'undefined' || typeof document === 'undefined') return;

  if (snapshot.type === 'textarea' && snapshot.element instanceof HTMLTextAreaElement) {
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

function scheduleSelectionSnapshotRestore(snapshot) {
  if (!snapshot || typeof window === 'undefined') return;

  const restore = () => restoreSelectionSnapshot(snapshot);
  restore();
  window.requestAnimationFrame(() => {
    restore();
    window.requestAnimationFrame(restore);
  });
}

function formatCommentLineLabel(lineNumbers = []) {
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
    ? `Line ${firstLineNumber}`
    : `Lines ${firstLineNumber}-${lastLineNumber}`;
}

function getTextareaSelectionCommentLineLabel(snapshot = null) {
  const lineRange = getTextareaSelectionLineRange(snapshot);
  return lineRange ? formatCommentLineLabel([lineRange.startLineNumber, lineRange.endLineNumber]) : '';
}

function getTextareaSelectionLineRange(snapshot = null) {
  if (snapshot?.type !== 'textarea' || !(snapshot.element instanceof HTMLTextAreaElement)) {
    return null;
  }
  const value = snapshot.element.value ?? '';
  const start = Math.min(snapshot.start ?? 0, snapshot.end ?? 0);
  const end = Math.max(snapshot.start ?? 0, snapshot.end ?? 0);
  if (start === end) return null;

  const lineNumberAtOffset = (offset) => value.slice(0, Math.max(0, offset)).split('\n').length;
  const startLineNumber = lineNumberAtOffset(start);
  const selectedText = value.slice(start, end);
  const effectiveEnd = selectedText.includes('\n') && /^[ \t]*$/u.test(selectedText.slice(selectedText.lastIndexOf('\n') + 1))
    ? start + selectedText.lastIndexOf('\n')
    : end;
  const endLineNumber = selectedText.includes('\n')
    ? lineNumberAtOffset(Math.max(start, effectiveEnd - 1))
    : startLineNumber;

  return { startLineNumber, endLineNumber };
}

function buildKeywordRegex(words) {
  return new RegExp(`\\b(?:${words.join('|')})\\b`, 'y');
}

function getTokenPatterns(language = 'text') {
  const normalizedLanguage = String(language).toLowerCase();

  if (normalizedLanguage === 'xml' || normalizedLanguage === 'html') {
    return [
      { type: 'comment', regex: /<!--.*?-->/y },
      { type: 'string', regex: /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/y },
      { type: 'tag', regex: /<\/?[A-Za-z_:-][A-Za-z0-9_:\-.]*/y },
      { type: 'attribute', regex: /\b[A-Za-z_:-][A-Za-z0-9_:\-.]*(?==)/y },
      { type: 'number', regex: /\b\d+(?:\.\d+)?\b/y },
    ];
  }

  if (normalizedLanguage === 'yaml' || normalizedLanguage === 'yml') {
    return [
      { type: 'comment', regex: /#.*/y },
      { type: 'string', regex: /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/y },
      { type: 'constant', regex: buildKeywordRegex(YAML_CONSTANTS) },
      { type: 'number', regex: /\b\d+(?:\.\d+)?\b/y },
      { type: 'property', regex: /\b[A-Za-z_][A-Za-z0-9_-]*(?=:\s*)/y },
      { type: 'constant', regex: /\$\{[^}]+\}/y },
    ];
  }

  if (normalizedLanguage === 'java' || normalizedLanguage === 'javascript' || normalizedLanguage === 'js' || normalizedLanguage === 'jsx' || normalizedLanguage === 'ts' || normalizedLanguage === 'tsx') {
    return [
      { type: 'comment', regex: /\/\/.*/y },
      { type: 'string', regex: /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`/y },
      { type: 'annotation', regex: /@[A-Za-z_][A-Za-z0-9_]*/y },
      { type: 'constant', regex: buildKeywordRegex(CODE_CONSTANTS) },
      { type: 'keyword', regex: buildKeywordRegex(JAVA_SCRIPT_KEYWORDS) },
      { type: 'number', regex: /\b\d+(?:\.\d+)?\b/y },
      { type: 'type', regex: /\b[A-Z][A-Za-z0-9_]*\b/y },
      { type: 'method', regex: /\b[A-Za-z_][A-Za-z0-9_]*(?=\s*\()/y },
      { type: 'property', regex: /\b[A-Za-z_][A-Za-z0-9_]*(?=\s*:)/y },
    ];
  }

  return [
    { type: 'number', regex: /\b\d+(?:\.\d+)?\b/y },
  ];
}

export function tokenizeCodeFragment(text = '', language = 'text') {
  if (!text) {
    return [{ text: ' ', type: 'plain' }];
  }

  const patterns = getTokenPatterns(language);
  const tokens = [];
  let plainBuffer = '';
  let index = 0;

  const flushPlainBuffer = () => {
    if (!plainBuffer) return;
    tokens.push({ text: plainBuffer, type: 'plain' });
    plainBuffer = '';
  };

  while (index < text.length) {
    let matched = false;

    for (const pattern of patterns) {
      pattern.regex.lastIndex = index;
      const match = pattern.regex.exec(text);
      if (!match || match.index !== index || !match[0]) {
        continue;
      }

      flushPlainBuffer();
      tokens.push({ text: match[0], type: pattern.type });
      index += match[0].length;
      matched = true;
      break;
    }

    if (!matched) {
      plainBuffer += text[index];
      index += 1;
    }
  }

  flushPlainBuffer();
  return tokens.length > 0 ? tokens : [{ text, type: 'plain' }];
}

export function DiffTabIcon() {
  return <Icon name="vcs/diff" size={16} />;
}

export function PlanDiffCommentBadge({ count, previewComments = [], onAdd = null }) {
  const previewTriggerRef = useRef(null);
  const [previewRect, setPreviewRect] = useState(null);
  const visiblePreviewComments = Array.isArray(previewComments)
    ? previewComments.filter((comment) => typeof comment === 'string' && comment.trim().length > 0).slice(0, 3)
    : [];
  const hiddenPreviewCount = Array.isArray(previewComments)
    ? Math.max(0, previewComments.filter((comment) => typeof comment === 'string' && comment.trim().length > 0).length - visiblePreviewComments.length)
    : 0;
  const hasPreview = visiblePreviewComments.length > 0;

  const updatePreviewRect = useCallback(() => {
    if (!hasPreview) return;
    const rect = previewTriggerRef.current?.getBoundingClientRect();
    setPreviewRect(rect ?? null);
  }, [hasPreview]);

  const hidePreview = useCallback(() => {
    setPreviewRect(null);
  }, []);

  useEffect(() => {
    if (!previewRect) return undefined;

    window.addEventListener('resize', updatePreviewRect);
    window.addEventListener('scroll', hidePreview, true);

    return () => {
      window.removeEventListener('resize', updatePreviewRect);
      window.removeEventListener('scroll', hidePreview, true);
    };
  }, [hidePreview, previewRect, updatePreviewRect]);

  const previewStyle = (() => {
    if (!previewRect || typeof window === 'undefined') return null;

    const viewportPadding = 8;
    const estimatedWidth = Math.min(300, window.innerWidth - (viewportPadding * 2));
    const estimatedHeight = 112;
    const gap = 8;
    const rightSideLeft = previewRect.right + gap;
    const leftSideLeft = previewRect.left - gap - estimatedWidth;
    const left = rightSideLeft + estimatedWidth <= window.innerWidth - viewportPadding
      ? rightSideLeft
      : Math.max(viewportPadding, leftSideLeft);
    const belowTop = previewRect.bottom + gap;
    const aboveTop = previewRect.top - gap - estimatedHeight;
    const top = belowTop + estimatedHeight <= window.innerHeight - viewportPadding
      ? belowTop
      : Math.max(viewportPadding, aboveTop);

    return { left, top, width: estimatedWidth };
  })();

  return (
    <span
      ref={previewTriggerRef}
      className={`plan-diff-comment-badge${onAdd ? ' can-add' : ''}`}
      onMouseEnter={hasPreview ? updatePreviewRect : undefined}
      onMouseLeave={hasPreview ? hidePreview : undefined}
      onFocus={hasPreview ? updatePreviewRect : undefined}
      onBlur={hasPreview ? hidePreview : undefined}
    >
      <span className="plan-diff-comment-badge-main">
        <Icon name="general/balloon" size={16} />
        <span className="plan-diff-comment-count">{count}</span>
      </span>
      <span
        className="plan-diff-comment-badge-add"
        role={onAdd ? 'button' : undefined}
        tabIndex={onAdd ? 0 : undefined}
        aria-label={onAdd ? 'Add AI Note' : undefined}
        onClick={onAdd ? (event) => {
          event.preventDefault();
          event.stopPropagation();
          hidePreview();
          onAdd(event);
        } : undefined}
        onKeyDown={onAdd ? (event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          event.stopPropagation();
          hidePreview();
          onAdd(event);
        } : undefined}
      >
        <Icon name="general/add" size={16} />
      </span>
      {hasPreview && previewRect && previewStyle && typeof document !== 'undefined' && createPortal(
        <span
          className="ai-chat-attachment-comment-preview plan-diff-hidden-comment-preview is-visible"
          role="tooltip"
          style={previewStyle}
        >
          <span className="ai-chat-attachment-comment-preview-title">
            {previewComments.length === 1 ? 'AI Note' : `AI Notes · ${previewComments.length}`}
          </span>
          {visiblePreviewComments.map((comment, index) => (
            <span key={`hidden-comment-preview-${index}`} className="ai-chat-attachment-comment-preview-item">
              {comment}
            </span>
          ))}
          {hiddenPreviewCount > 0 && (
            <span className="ai-chat-attachment-comment-preview-more">
              {`+${hiddenPreviewCount} more`}
            </span>
          )}
        </span>,
        document.body,
      )}
    </span>
  );
}

function PlanDiffGutterAiNoteTooltip({ text, disabled = false, children }) {
  const triggerRef = useRef(null);
  const [triggerRect, setTriggerRect] = useState(null);
  const showTimerRef = useRef(null);

  const updateTriggerRect = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    setTriggerRect(rect ?? null);
  }, []);

  const showTooltip = useCallback(() => {
    if (disabled) return;
    if (showTimerRef.current) {
      window.clearTimeout(showTimerRef.current);
    }
    showTimerRef.current = window.setTimeout(() => {
      showTimerRef.current = null;
      updateTriggerRect();
    }, 650);
  }, [disabled, updateTriggerRect]);

  const hideTooltip = useCallback(() => {
    if (showTimerRef.current) {
      window.clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
    setTriggerRect(null);
  }, []);

  useEffect(() => () => {
    if (showTimerRef.current) {
      window.clearTimeout(showTimerRef.current);
    }
  }, []);

  useEffect(() => {
    if (!triggerRect) return undefined;

    const hideOnInteraction = () => hideTooltip();

    window.addEventListener('resize', updateTriggerRect);
    window.addEventListener('scroll', hideOnInteraction, true);
    document.addEventListener('pointerdown', hideOnInteraction, true);
    document.addEventListener('keydown', hideOnInteraction, true);

    return () => {
      window.removeEventListener('resize', updateTriggerRect);
      window.removeEventListener('scroll', hideOnInteraction, true);
      document.removeEventListener('pointerdown', hideOnInteraction, true);
      document.removeEventListener('keydown', hideOnInteraction, true);
    };
  }, [hideTooltip, triggerRect, updateTriggerRect]);

  const tooltipStyle = (() => {
    if (!triggerRect || typeof window === 'undefined') return null;

    const gap = 4;
    const viewportPadding = 8;
    const estimatedTooltipHeight = 30;
    const left = Math.min(
      window.innerWidth - viewportPadding,
      Math.max(viewportPadding, triggerRect.right + gap),
    );
    const top = Math.min(
      window.innerHeight - viewportPadding - estimatedTooltipHeight,
      Math.max(viewportPadding, triggerRect.top + (triggerRect.height / 2) - (estimatedTooltipHeight / 2)),
    );

    return { top, left };
  })();

  return (
    <span
      ref={triggerRef}
      className="plan-diff-gutter-ai-note-tooltip-trigger"
      onMouseEnter={showTooltip}
      onMouseLeave={hideTooltip}
      onMouseDown={hideTooltip}
      onClick={hideTooltip}
      onKeyDown={hideTooltip}
      onFocus={showTooltip}
      onBlur={hideTooltip}
    >
      {children}
      {!disabled && triggerRect && tooltipStyle && typeof document !== 'undefined' && createPortal(
        <div className="theme-dark">
          <div
            className="tooltip text-ui-default tooltip-right ai-note-tooltip plan-diff-ai-note-tooltip"
            role="tooltip"
            style={tooltipStyle}
          >
            <span className="tooltip-text">{text}</span>
          </div>
        </div>,
        document.body,
      )}
    </span>
  );
}

const PLAN_DIFF_GUTTER_CONTEXT_MENU_ITEMS = [
  { label: 'Add Bookmark', shortcut: 'F3' },
  { label: 'Add Mnemonic Bookmark...', shortcut: '⌥F3' },
  { type: 'separator' },
  { label: 'Soft-Wrap' },
  { label: 'Configure Soft Wraps...' },
  { type: 'separator' },
  { label: 'Appearance', submenu: true },
  { label: 'Configure Gutter Icons...' },
];

function getPlanDiffGutterContextMenuPosition(point = null, commentToggleCount = 1) {
  if (!point || typeof window === 'undefined') return null;

  const width = 286;
  const itemHeight = 31;
  const separatorHeight = 1;
  const verticalPadding = 14;
  const baseHeight = PLAN_DIFF_GUTTER_CONTEXT_MENU_ITEMS.reduce((sum, item) => (
    sum + (item.type === 'separator' ? separatorHeight : itemHeight)
  ), verticalPadding);
  const height = baseHeight + separatorHeight + (itemHeight * Math.max(0, commentToggleCount)) + 14;
  const viewportPadding = 8;

  return {
    left: Math.max(
      viewportPadding,
      Math.min(point.x, window.innerWidth - width - viewportPadding),
    ),
    top: Math.max(
      viewportPadding,
      Math.min(point.y, window.innerHeight - height - viewportPadding),
    ),
    width,
  };
}

function PlanDiffGutterContextMenu({
  point = null,
  onClose = null,
  plainFileGutterCommentsEnabled = true,
  onPlainFileGutterCommentsEnabledChange = null,
  diffGutterCommentsEnabled = true,
  onDiffGutterCommentsEnabledChange = null,
  commentSettingsKind = 'diff',
}) {
  const menuRef = useRef(null);
  const commentToggleItems = [
    {
      kind: 'diff',
      label: 'Enable Diff AI Notes',
      checked: diffGutterCommentsEnabled,
      onToggle: onDiffGutterCommentsEnabledChange,
    },
  ].filter((item) => item.kind === commentSettingsKind);
  const menuPosition = getPlanDiffGutterContextMenuPosition(point, commentToggleItems.length);

  useEffect(() => {
    const handlePointerDown = (event) => {
      const target = event.target;
      if (target instanceof Node && menuRef.current?.contains(target)) {
        return;
      }
      onClose?.();
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose?.();
      }
    };
    const handleViewportChange = () => onClose?.();

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('contextmenu', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, true);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('contextmenu', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
    };
  }, [onClose]);

  if (!menuPosition || typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div className="theme-dark">
      <div
        ref={menuRef}
        className="plan-diff-gutter-context-menu"
        style={menuPosition}
        role="menu"
        aria-label="Gutter context menu"
      >
        {PLAN_DIFF_GUTTER_CONTEXT_MENU_ITEMS.map((item, index) => (
          item.type === 'separator'
            ? <div key={`separator-${index}`} className="plan-diff-gutter-context-menu-separator" role="separator" />
            : (
              <button
                key={item.label}
                type="button"
                className="plan-diff-gutter-context-menu-item"
                role="menuitem"
                onClick={() => onClose?.()}
              >
                <span className="plan-diff-gutter-context-menu-check" aria-hidden="true" />
                <span className="plan-diff-gutter-context-menu-label">{item.label}</span>
                {item.shortcut && <span className="plan-diff-gutter-context-menu-shortcut">{item.shortcut}</span>}
                {item.submenu && <Icon name="general/chevronRight" size={16} className="plan-diff-gutter-context-menu-chevron" />}
              </button>
            )
        ))}
        {commentToggleItems.length > 0 && (
          <>
            <div className="plan-diff-gutter-context-menu-separator" role="separator" />
            {commentToggleItems.map((item) => (
              <button
                key={item.label}
                type="button"
                className="plan-diff-gutter-context-menu-item plan-diff-gutter-context-menu-item-toggle"
                role="menuitemcheckbox"
                aria-checked={item.checked}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  item.onToggle?.((prev) => !prev);
                }}
              >
                <span className="plan-diff-gutter-context-menu-check" aria-hidden="true">
                  {item.checked && <Icon name="general/checkmark" size={16} />}
                </span>
                <span className="plan-diff-gutter-context-menu-label">{item.label}</span>
              </button>
            ))}
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

function PlanDiffToolbarIcon({ type }) {
  if (type === 'down') {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M8.5 2.5C8.5 2.22386 8.27615 2 8 2C7.72386 2 7.5 2.22386 7.5 2.5V12.197L3.87165 8.16552C3.68692 7.96026 3.37078 7.94362 3.16552 8.12835C2.96027 8.31308 2.94363 8.62923 3.12836 8.83448L7.62836 13.8345C7.72318 13.9398 7.85826 14 8 14C8.14175 14 8.27683 13.9398 8.37165 13.8345L12.8717 8.83448C13.0564 8.62923 13.0397 8.31308 12.8345 8.12835C12.6292 7.94362 12.3131 7.96026 12.1284 8.16552L8.5 12.197V2.5Z" fill="currentColor" />
      </svg>
    );
  }

  if (type === 'up') {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M7.5 13.5C7.5 13.7761 7.72386 14 8 14C8.27614 14 8.5 13.7761 8.5 13.5V3.80298L12.1284 7.83448C12.3131 8.03974 12.6292 8.05638 12.8345 7.87165C13.0397 7.68692 13.0564 7.37077 12.8716 7.16552L8.37165 2.16552C8.27683 2.06016 8.14174 2 8 2C7.85826 2 7.72317 2.06016 7.62835 2.16552L3.12836 7.16552C2.94363 7.37077 2.96027 7.68692 3.16552 7.87165C3.37078 8.05638 3.68692 8.03974 3.87165 7.83448L7.5 3.80298V13.5Z" fill="currentColor" />
      </svg>
    );
  }

  if (type === 'edit') {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M13.4403 2.56066C12.6927 1.81314 11.4808 1.81311 10.7332 2.5606L3.33829 9.95484C3.15725 10.1359 3.02085 10.3566 2.93989 10.5994L2.02567 13.3421C1.96578 13.5218 2.01254 13.7198 2.14646 13.8538C2.28038 13.9877 2.47846 14.0344 2.65813 13.9746L5.40087 13.0603C5.64368 12.9794 5.86432 12.843 6.04531 12.662L13.4402 5.26783C14.1878 4.52029 14.1878 3.30823 13.4403 2.56066ZM11.4403 3.26774C11.7973 2.91074 12.3761 2.91076 12.7331 3.26777C13.0902 3.6248 13.0902 4.20367 12.7331 4.56069L11.9994 5.29437L10.7065 4.00148L11.4403 3.26774ZM9.99934 4.70855L11.2922 6.00145L5.33823 11.9549C5.26701 12.0261 5.18019 12.0798 5.08464 12.1116L3.29058 12.7096L3.88858 10.9157C3.92044 10.8201 3.97412 10.7332 4.04536 10.662L9.99934 4.70855Z" fill="currentColor" />
      </svg>
    );
  }

  if (type === 'left') {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M13.5 8.5C13.7761 8.5 14 8.27614 14 8C14 7.72386 13.7761 7.5 13.5 7.5L3.80298 7.5L7.83448 3.87165C8.03974 3.68692 8.05638 3.37078 7.87165 3.16552C7.68692 2.96027 7.37077 2.94363 7.16552 3.12836L2.16552 7.62835C2.06016 7.72317 2 7.85826 2 8C2 8.14174 2.06016 8.27683 2.16552 8.37165L7.16552 12.8716C7.37077 13.0564 7.68692 13.0397 7.87165 12.8345C8.05638 12.6292 8.03974 12.3131 7.83448 12.1283L3.80298 8.5L13.5 8.5Z" fill="currentColor" />
      </svg>
    );
  }

  if (type === 'right') {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M2.5 7.50001C2.22386 7.50001 2 7.72386 2 8.00001C2 8.27615 2.22386 8.50001 2.5 8.50001L12.197 8.5L8.16552 12.1284C7.96026 12.3131 7.94362 12.6292 8.12835 12.8345C8.31308 13.0397 8.62923 13.0564 8.83448 12.8717L13.8345 8.37165C13.9398 8.27683 14 8.14175 14 8C14 7.85826 13.9398 7.72318 13.8345 7.62836L8.83448 3.12836C8.62923 2.94363 8.31308 2.96027 8.12835 3.16552C7.94362 3.37078 7.96026 3.68692 8.16552 3.87165L12.197 7.5L2.5 7.50001Z" fill="currentColor" />
      </svg>
    );
  }

  if (type === 'list') {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M3.83333 1H11.1667C12.1792 1 13 1.7835 13 2.75L13 13.25C13 14.2165 12.1792 15 11.1667 15H3.83333C2.82081 15 2 14.2165 2 13.25V2.75C2 1.7835 2.82081 1 3.83333 1ZM3.83333 1.875C3.32707 1.875 2.91667 2.26675 2.91667 2.75V13.25C2.91667 13.7332 3.32707 14.125 3.83333 14.125H11.1667C11.6729 14.125 12.0833 13.7332 12.0833 13.25L12.0833 2.75C12.0833 2.26675 11.6729 1.875 11.1667 1.875L3.83333 1.875ZM10.25 4.9375C10.25 5.15228 10.0879 5.33091 9.87405 5.36795L9.79167 5.375H5.20833C4.9552 5.375 4.75 5.17912 4.75 4.9375C4.75 4.72272 4.91214 4.54409 5.12595 4.50705L5.20833 4.5H9.79167C10.0448 4.5 10.25 4.69588 10.25 4.9375ZM10.25 8C10.25 8.21478 10.0879 8.39341 9.87405 8.43045L9.79167 8.4375H5.20833C4.9552 8.4375 4.75 8.24162 4.75 8C4.75 7.78522 4.91214 7.60659 5.12595 7.56955L5.20833 7.5625H9.79167C10.0448 7.5625 10.25 7.75838 10.25 8ZM10.25 11.0625C10.25 11.2773 10.0879 11.4559 9.87405 11.493L9.79167 11.5H5.20833C4.9552 11.5 4.75 11.3041 4.75 11.0625C4.75 10.8477 4.91214 10.6691 5.12595 10.632L5.20833 10.625H9.79167C10.0448 10.625 10.25 10.8209 10.25 11.0625Z" fill="currentColor" />
      </svg>
    );
  }

  if (type === 'collapse') {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M4.5 2.5L8 6L11.5 2.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M4.5 13.5L8 10L11.5 13.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (type === 'swap') {
    return <Icon name="vcs/diff" size={16} />;
  }

  if (type === 'settings') {
    return (
      <span className="plan-diff-toolbar-settings-icon" aria-hidden="true">
        <Icon name="general/settings" size={16} />
        <Icon name="general/dropdownGutter" size={20} />
      </span>
    );
  }

  if (type === 'more') {
    return <Icon name="general/moreVertical" size={16} />;
  }

  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 2C6.34386 2 5 3.34386 5 5C5 5.27614 5.22386 5.5 5.5 5.5C5.77614 5.5 6 5.27614 6 5C6 3.89614 6.89614 3 8 3C9.10386 3 10 3.89614 10 5C10 5.67621 9.86049 6.07982 9.68538 6.36C9.5025 6.6526 9.25707 6.85403 8.93765 7.10957L8.91812 7.12519C8.61602 7.36676 8.24644 7.66229 7.96663 8.11C7.67299 8.57982 7.5 9.17621 7.5 10V10.5C7.5 10.7761 7.72386 11 8 11C8.27614 11 8.5 10.7761 8.5 10.5V10C8.5 9.32379 8.63951 8.92018 8.81462 8.64C8.9975 8.3474 9.24293 8.14597 9.56235 7.89043L9.58188 7.87481C9.88398 7.63324 10.2536 7.33771 10.5334 6.89C10.827 6.42018 11 5.82379 11 5C11 3.34386 9.65614 2 8 2ZM8 14C8.41421 14 8.75 13.6642 8.75 13.25C8.75 12.8358 8.41421 12.5 8 12.5C7.58579 12.5 7.25 12.8358 7.25 13.25C7.25 13.6642 7.58579 14 8 14Z" fill="currentColor" />
    </svg>
  );
}

function PlanDiffToolbarIconButton({ label, icon, onClick = null }) {
  return (
    <ToolbarButton
      icon={<PlanDiffToolbarIcon type={icon} />}
      className="plan-diff-toolbar-icon-btn"
      onClick={onClick}
      title={label}
    />
  );
}

function buildPlanDiffScopeOptions(fileCount = 3, currentFileLabel = 'VisitController.java') {
  return [
    {
      id: 'new',
      label: 'New changes',
      triggerText: 'New changes · 1 new',
      meta: '1 new',
      fileCount: 1,
    },
    {
      id: 'all',
      label: 'All generated changes',
      triggerText: `All generated · ${fileCount} files`,
      meta: `${fileCount} files`,
      fileCount,
    },
    {
      id: 'current-file',
      label: 'Current file',
      triggerText: `Current file · ${currentFileLabel}`,
      meta: currentFileLabel,
      fileCount: 1,
    },
  ];
}

function PlanDiffViewingScopeControl({
  fileCount = 3,
  currentFileLabel = 'VisitController.java',
  selectedScopeId = 'new',
  files = null,
  currentFileIndex = 0,
  onSelectFile = null,
  onNavigatePrevious = null,
  onNavigateNext = null,
}) {
  const filesRef = useRef(null);
  const [filesRect, setFilesRect] = useState(null);
  const scopeOptions = buildPlanDiffScopeOptions(fileCount, currentFileLabel);
  const selectedScope = scopeOptions.find((item) => item.id === selectedScopeId) ?? scopeOptions[0];
  const providedFiles = Array.isArray(files) ? files.filter(Boolean) : [];
  const selectedFileCount = Math.max(1, providedFiles.length || selectedScope.fileCount);
  const resolvedCurrentFileIndex = Math.max(0, Math.min(selectedFileCount - 1, currentFileIndex));
  const fileOptions = providedFiles.length > 0
    ? providedFiles.map((item, index) => ({
        id: item.id ?? item.tabId ?? `file-${index}`,
        label: item.label ?? item.name ?? `File ${index + 1}`,
        meta: `${index + 1} of ${selectedFileCount}`,
        selected: index === resolvedCurrentFileIndex,
        icon: item.icon ?? 'fileTypes/java',
        tabId: item.tabId ?? item.id ?? null,
      }))
    : [
        { id: 'current', label: currentFileLabel, selected: true, icon: 'fileTypes/java' },
        { id: 'release', label: 'ReleaseController.java', selected: false, icon: 'fileTypes/java' },
        { id: 'service', label: 'FeatureService.java', selected: false, icon: 'fileTypes/java' },
      ].slice(0, selectedFileCount).map((item, index) => ({
        ...item,
        meta: `${index + 1} of ${selectedFileCount}`,
      }));
  const closeFiles = () => setFilesRect(null);

  return (
    <div className="plan-diff-viewing-scope" aria-label="Viewing review scope">
      <ToolbarButton
        icon={<Icon name="general/chevronRight" size={16} className="plan-diff-viewing-file-icon is-prev" />}
        className="plan-diff-viewing-file-arrow"
        title="Previous file"
        disabled={resolvedCurrentFileIndex <= 0}
        onClick={onNavigatePrevious}
      />
      <span ref={filesRef} className="plan-diff-viewing-files-trigger">
        <button
          type="button"
          className="aiux-review-diffnav-count plan-diff-viewing-file-count-link"
          title="Files in viewed scope"
          onClick={() => {
            setFilesRect((prev) => (prev ? null : filesRef.current?.getBoundingClientRect() ?? null));
          }}
        >
          {`${resolvedCurrentFileIndex + 1} of ${selectedFileCount} files`}
        </button>
      </span>
      <ToolbarButton
        icon={<Icon name="general/chevronRight" size={16} className="plan-diff-viewing-file-icon" />}
        className="plan-diff-viewing-file-arrow"
        title="Next file"
        disabled={resolvedCurrentFileIndex >= selectedFileCount - 1}
        onClick={onNavigateNext}
      />
      {filesRect && typeof document !== 'undefined' && createPortal(
        <div className="theme-dark">
          <PositionedPopup triggerRect={filesRect} onDismiss={closeFiles} gap={4}>
            <Popup visible className="plan-diff-popover plan-diff-files-popup text-ui-default" onClose={closeFiles}>
              <PopupCell type="separator" text={`Files in ${selectedScope.label}`} />
              {fileOptions.map((item) => (
                <PopupCell
                  key={item.id}
                  icon={item.icon}
                  selected={item.selected}
                  shortcut={item.meta}
                  onClick={() => {
                    closeFiles();
                    if (item.tabId) onSelectFile?.(item.tabId);
                  }}
                >
                  {item.label}
                </PopupCell>
              ))}
            </Popup>
          </PositionedPopup>
        </div>,
        document.body,
      )}
    </div>
  );
}

// The diff top bar's "Quick Actions" entry point. Also reused outside the diff (the
// Commit tool window), hence the class hooks for host-specific sizing.
const AI_REVIEW_AGENT_OPTIONS = [
  {
    id: 'codex',
    label: 'Codex',
    meta: 'Recommended',
    icon: 'codex',
  },
  {
    id: 'junie',
    label: 'Junie 1',
    meta: 'JetBrains agent',
    icon: 'junie',
  },
  {
    id: 'claude',
    label: 'Claude Agent',
    meta: 'External agent',
    icon: 'claude',
  },
];

function getAiReviewAgentLabel(icon = 'codex') {
  return AI_REVIEW_AGENT_OPTIONS.find((agent) => agent.icon === icon || agent.id === icon)?.label
    ?? 'Claude Agent';
}

const AI_REVIEW_EXISTING_SESSIONS = [
  { id: 'current-session', label: 'Current Session', time: 'Current' },
];

// Header/footer pickers of the Figma popup (501:57949). They carry no behaviour of their own
// beyond the value they hand to onStartReview.
// Chips shown before the strip collapses behind a "Show all +N" toggle.
const AI_REVIEW_ATTACHMENT_COLLAPSED_LIMIT = 6;

const AI_REVIEW_LOCATION_OPTIONS = [
  { id: 'local', label: 'Local' },
  { id: 'cloud', label: 'Cloud' },
];
const AI_REVIEW_MODEL_OPTIONS = [
  { id: 'sol', label: '5.6 Sol · Suggested' },
  { id: 'sonnet', label: 'Claude Sonnet 4.1' },
  { id: 'codex', label: 'GPT-5.2-Codex' },
];
const AI_REVIEW_EFFORT_OPTIONS = [
  { id: 'high', label: 'High' },
  { id: 'medium', label: 'Medium' },
  { id: 'low', label: 'Low' },
];
const AI_REVIEW_EDIT_MODE_OPTIONS = [
  { id: 'accepts-edits', label: 'Accepts Edits' },
  { id: 'ask-before-edits', label: 'Ask Before Edits' },
  { id: 'read-only', label: 'Read Only' },
];

function PlanDiffMicIcon() {
  return (
    <svg className="icon" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M8 2.5a1.75 1.75 0 0 0-1.75 1.75v3.5a1.75 1.75 0 0 0 3.5 0v-3.5A1.75 1.75 0 0 0 8 2.5Zm-2.75 1.75a2.75 2.75 0 0 1 5.5 0v3.5a2.75 2.75 0 0 1-5.5 0v-3.5ZM4 7.25a.5.5 0 0 1 .5.5v.25a3.5 3.5 0 1 0 7 0v-.25a.5.5 0 0 1 1 0V8a4.5 4.5 0 0 1-4 4.473V14h1.75a.5.5 0 0 1 0 1h-4.5a.5.5 0 0 1 0-1H7.5v-1.527A4.5 4.5 0 0 1 3.5 8v-.25a.5.5 0 0 1 .5-.5Z"
        fill="currentColor"
      />
    </svg>
  );
}

function PlanDiffOpenAiIcon() {
  return (
    <img src={openAiIconUrl} alt="" aria-hidden="true" className="icon plan-diff-openai-icon" />
  );
}

function PlanDiffReviewAgentIcon({ icon }) {
  return icon === 'codex' ? <PlanDiffOpenAiIcon /> : <AiChatAgentIcon icon={icon} />;
}

function PlanDiffRefactorIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="icon plan-diff-refactor-icon">
      <path d="M2.5 13.5V2.5H6.15C7.86 2.5 9 3.48 9 5C9 6.5 7.86 7.5 6.15 7.5H2.5M5.8 7.5L8.25 10.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9.6 13.35L10.05 11.55L13.15 8.45C13.5 8.1 14.06 8.1 14.4 8.45L14.55 8.6C14.9 8.94 14.9 9.5 14.55 9.85L11.45 12.95L9.6 13.35Z" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}



// The popup itself, controlled from outside: the toolbar button below mounts one, and App
// mounts a global one that the Control+Control shortcut opens over whatever is on screen.
export function AiReviewComposerDialog({
  open = false,
  onClose = null,
  initialAgentId = 'codex',
  initialInstructions = '',
  initialSession = null,
  initialShowQuickActions = true,
  currentScopeLabel = 'New changes',
  currentFileLabel = 'VisitController.java',
  initialScopeId = 'current',
  contextLabel = 'Changes',
  contextMeta = '1 file · 2 changes',
  contextIcon = 'general/listFiles',
  sourceAttachments = [],
  onStartReview = null,
  // Clicking a chip opens the attachment, the same way the chat composer's chips do.
  onOpenAttachment = null,
  launchSource = 'diff',
  popupClassName = '',
}) {
  const resolveInitialAgentId = () => (
    AI_REVIEW_AGENT_OPTIONS.some((item) => item.id === initialAgentId)
      ? initialAgentId
      : AI_REVIEW_AGENT_OPTIONS[0].id
  );
  const [selectedAgentId, setSelectedAgentId] = useState(resolveInitialAgentId);
  const [selectedSessionId, setSelectedSessionId] = useState(initialSession?.id ?? null);
  const [attachments, setAttachments] = useState([]);
  const [addContextRect, setAddContextRect] = useState(null);
  const [instructions, setInstructions] = useState(initialInstructions);
  const [scopeId, setScopeId] = useState(initialScopeId);
  const [modelId, setModelId] = useState(AI_REVIEW_MODEL_OPTIONS[0].id);
  const [effortId, setEffortId] = useState(AI_REVIEW_EFFORT_OPTIONS[0].id);
  const [attachmentsExpanded, setAttachmentsExpanded] = useState(false);
  const [showQuickActions, setShowQuickActions] = useState(initialShowQuickActions);
  const isCommitLaunch = launchSource === 'commit';
  // Sub-menus live inside the popup (same DOM subtree), so opening one never
  // dismisses the popup itself. Only one is open at a time.
  const [openMenu, setOpenMenu] = useState(null);
  const closePopup = () => {
    setOpenMenu(null);
    onClose?.();
  };
  // Every launch starts from the same clean state the trigger used to set up.
  useEffect(() => {
    if (!open) return;
    setOpenMenu(null);
    setSelectedAgentId(resolveInitialAgentId());
    setSelectedSessionId(initialSession?.id ?? null);
    setInstructions(initialInstructions);
    setScopeId(initialScopeId);
    setAttachments(sourceAttachments);
    setAttachmentsExpanded(false);
    setShowQuickActions(initialShowQuickActions);
    setAddContextRect(null);
  }, [initialAgentId, initialInstructions, initialScopeId, initialSession?.id, initialShowQuickActions, open]);
  const toggleMenu = (menu) => setOpenMenu((prev) => (prev === menu ? null : menu));
  const selectedAgent = AI_REVIEW_AGENT_OPTIONS.find((item) => item.id === selectedAgentId)
    ?? AI_REVIEW_AGENT_OPTIONS[0];
  const sessionOptions = initialSession
    ? [initialSession, ...AI_REVIEW_EXISTING_SESSIONS.filter((item) => item.id !== initialSession.id)]
    : AI_REVIEW_EXISTING_SESSIONS;
  const selectedSession = sessionOptions.find((item) => item.id === selectedSessionId) ?? null;
  const canStartReview = attachments.length > 0 && Boolean(selectedAgent?.id) && Boolean(modelId);
  const selectAgent = (agent) => {
    setSelectedAgentId(agent.id);
    setOpenMenu(null);
  };
  const scopeOptions = [
    { id: 'current', label: currentScopeLabel, meta: `${attachments.length} selected file${attachments.length === 1 ? '' : 's'}` },
    { id: 'all', label: 'All available changes', meta: `${sourceAttachments.length} file${sourceAttachments.length === 1 ? '' : 's'}` },
    { id: 'file', label: 'Current file', meta: currentFileLabel },
  ];
  const selectedScope = scopeOptions.find((item) => item.id === scopeId) ?? scopeOptions[0];

  const addAttachment = (attachment) => {
    if (!attachment?.id) return;
    setAttachments((prev) => (prev.some((item) => item.id === attachment.id) ? prev : [...prev, attachment]));
  };
  const removeAttachment = (attachmentId) => {
    setAttachments((prev) => prev.filter((item) => item.id !== attachmentId));
  };
  const startReview = () => {
    if (!canStartReview) return;
    onStartReview?.({
      agentId: selectedAgent.id,
      agentIcon: selectedAgent.icon,
      sessionId: selectedSessionId,
      instructions: instructions.trim(),
      launchSource,
      attachments,
      // Values of the popup's own pickers; consumers that don't know about them just ignore these.
      scopeId,
      modelId,
      effortId,
    });
    closePopup();
  };
  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      closePopup();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open]);
  // Dropdowns are composed from the library Popup/PopupCell primitives and kept
  // inside this popup so they do not dismiss the parent review popup.
  const renderMenu = (menu, children) => (
    openMenu === menu
      ? (
        <div className={`plan-diff-ai-review-submenu plan-diff-ai-review-submenu-${menu}`}>
          <Popup visible className="plan-diff-popover plan-diff-ai-review-submenu-popup text-ui-default" onClose={() => setOpenMenu(null)}>
            {children}
          </Popup>
        </div>
      )
      : null
  );
  const renderAgentMenu = () => renderMenu('agent', (
    <div className="plan-diff-ai-review-agent-menu">
      <PopupCell type="separator" text="Select agent" />
      <button
        type="button"
        className="plan-diff-ai-review-recommended"
        onClick={() => selectAgent(AI_REVIEW_AGENT_OPTIONS[0])}
      >
        <PlanDiffReviewAgentIcon icon="codex" />
        <span className="plan-diff-ai-review-recommended-copy">
          <span className="plan-diff-ai-review-recommended-title">Recommended Agent</span>
          <span className="plan-diff-ai-review-recommended-model">Codex · Recommended for code review</span>
          <span className="plan-diff-ai-review-recommended-description">Picks the best performance-to-cost agent and model.</span>
          <span className="plan-diff-ai-review-recommended-link">How the agent is selected ↗</span>
        </span>
        {selectedAgent.id === 'codex' && <Icon name="general/checkmark" size={16} />}
      </button>
      <PopupCell type="separator" />
      {AI_REVIEW_AGENT_OPTIONS.slice(1).map((item) => (
        <PopupCell
          key={item.id}
          type="multiline"
          icon="aiAssistant/toolWindowChat@20x20"
          hint={item.meta}
          selected={item.id === selectedAgent.id}
          onClick={() => selectAgent(item)}
        >
          {item.label}
        </PopupCell>
      ))}
      <PopupCell type="separator" />
      <PopupCell icon="general/add" onClick={() => setOpenMenu(null)}>Add more agents…</PopupCell>
    </div>
  ));

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
        <div
          className="theme-dark plan-diff-ai-review-dialog-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closePopup();
          }}
        >
          {/* Figma 501:57949 "Popup / Find in Files" composer popup: header pickers,
              a focused input island and the model/effort/mode row underneath. */}
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Configure AI Review"
            data-launch-source={launchSource}
            className={`plan-diff-ai-review-dialog text-ui-default${isCommitLaunch ? ' is-commit-launch' : ' is-diff-launch'}${popupClassName ? ` ${popupClassName}` : ''}`}
          >
            <div className="plan-diff-ai-review-dialog-header">
              <div className="plan-diff-ai-review-dialog-title">
                <Icon name="general/balloon" size={16} />
                <span>AI Review</span>
              </div>
              <div className="plan-diff-ai-review-dialog-pickers">
                <span className="plan-diff-ai-review-dropdown">
                  <button
                    type="button"
                    className={`plan-diff-ai-review-dialog-picker${openMenu === 'agent' ? ' is-open' : ''}`}
                    aria-haspopup="menu"
                    aria-expanded={openMenu === 'agent'}
                    onClick={() => toggleMenu('agent')}
                  >
                    <PlanDiffReviewAgentIcon icon={selectedAgent.icon} />
                    <span>{selectedAgent.label}</span>
                    <Icon name="general/chevronDown" size={16} />
                  </button>
                  {renderAgentMenu()}
                </span>
                <span className="plan-diff-ai-review-dropdown">
                  <button
                    type="button"
                    className={`plan-diff-ai-review-dialog-picker${openMenu === 'session' ? ' is-open' : ''}`}
                    aria-haspopup="menu"
                    aria-expanded={openMenu === 'session'}
                    onClick={() => toggleMenu('session')}
                  >
                    <span>{selectedSession ? selectedSession.label : 'New Session'}</span>
                    <Icon name="general/chevronDown" size={16} />
                  </button>
                  {renderMenu('session', (
                    <>
                      <PopupCell
                        selected={!selectedSessionId}
                        onClick={() => { setSelectedSessionId(null); setOpenMenu(null); }}
                      >
                        New Session
                      </PopupCell>
                      <PopupCell type="separator" text="Existing sessions" />
                      {sessionOptions.map((item) => (
                        <PopupCell
                          key={item.id}
                          shortcut={item.time}
                          selected={item.id === selectedSessionId}
                          onClick={() => { setSelectedSessionId(item.id); setOpenMenu(null); }}
                        >
                          {item.label}
                        </PopupCell>
                      ))}
                    </>
                  ))}
                </span>
                <span className="plan-diff-ai-review-dropdown">
                  <button
                    type="button"
                    className={`plan-diff-ai-review-dialog-picker${openMenu === 'scope' ? ' is-open' : ''}`}
                    aria-haspopup="menu"
                    aria-expanded={openMenu === 'scope'}
                    onClick={() => toggleMenu('scope')}
                  >
                    <Icon name="general/listFiles" size={16} />
                    <span>{selectedScope.label}</span>
                    <Icon name="general/chevronDown" size={16} />
                  </button>
                  {renderMenu('scope', scopeOptions.map((option) => (
                    <PopupCell
                      key={option.id}
                      shortcut={option.meta}
                      selected={option.id === scopeId}
                      onClick={() => {
                        setScopeId(option.id);
                        if (option.id === 'file') {
                          const currentFile = sourceAttachments.find((attachment) => (
                            attachment?.sourceLabel === currentFileLabel || attachment?.label === currentFileLabel
                          )) ?? sourceAttachments[0];
                          setAttachments(currentFile ? [currentFile] : []);
                        } else {
                          setAttachments(sourceAttachments);
                        }
                        setOpenMenu(null);
                      }}
                    >
                      {option.label}
                    </PopupCell>
                  )))}
                </span>
              </div>
            </div>

            <div className="plan-diff-ai-review-dialog-scope-note">
              <span>Review scope</span>
              <strong>{attachments.length > 0
                ? `${attachments.length} file${attachments.length === 1 ? '' : 's'}`
                : 'No changes to review'}</strong>
              <span>{attachments.length > 0
                ? 'The selected model will provide an independent assessment before commit.'
                : 'Add a changed file or return to a context with prepared changes.'}</span>
            </div>

            <div className="plan-diff-ai-review-dialog-main">
              <span className="plan-diff-ai-review-dialog-context-side" aria-hidden="true">
                <Icon name="general/listFiles" size={16} />
              </span>
              <div className="plan-diff-ai-review-dialog-composer-header">
                <AiChatAttachmentStrip
                  attachments={attachments}
                  collapsedLimit={AI_REVIEW_ATTACHMENT_COLLAPSED_LIMIT}
                  expanded={attachmentsExpanded}
                  onExpandedChange={setAttachmentsExpanded}
                  onOpen={onOpenAttachment ?? undefined}
                  onRemove={(attachment) => removeAttachment(attachment.id)}
                  className="plan-diff-ai-review-dialog-attachments"
                />
              </div>

              <textarea
                autoFocus
                rows={1}
                value={instructions}
                placeholder="Optional review focus, constraints, or additional criteria"
                aria-label="Review instructions"
                onChange={(event) => setInstructions(event.target.value)}
              />

              <div className="plan-diff-ai-review-dialog-main-actions">
                <button
                  className="plan-diff-ai-review-dialog-plus"
                  type="button"
                  aria-label="Add context"
                  aria-haspopup="dialog"
                  aria-expanded={Boolean(addContextRect)}
                  onClick={(event) => {
                    setOpenMenu(null);
                    if (addContextRect) {
                      setAddContextRect(null);
                      return;
                    }
                    setAddContextRect(event.currentTarget.getBoundingClientRect());
                  }}
                >
                  <Icon name="general/add" size={16} />
                </button>
                <span className="plan-diff-ai-review-dialog-main-actions-right">
                  <button
                    type="button"
                    className="plan-diff-ai-review-dialog-mic"
                    aria-label="Dictate"
                    title="Dictate"
                  >
                    <PlanDiffMicIcon />
                  </button>
                  <button
                    type="button"
                    className={`plan-diff-ai-review-dialog-send plan-diff-ai-review-dialog-start${canStartReview ? ' is-active' : ''}`}
                    aria-label="Start Review"
                    title={canStartReview ? 'Start Review' : 'No changes to review'}
                    disabled={!canStartReview}
                    onClick={startReview}
                  >
                    <span>Start Review</span>
                  </button>
                </span>
              </div>
            </div>

            <div className="plan-diff-ai-review-dialog-footer">
              {[
                { menu: 'model', options: AI_REVIEW_MODEL_OPTIONS, value: modelId, onSelect: setModelId, label: 'Model' },
                { menu: 'effort', options: AI_REVIEW_EFFORT_OPTIONS, value: effortId, onSelect: setEffortId, label: 'Effort' },
              ].map(({ menu, options, value, onSelect, label }) => (
                <span className="plan-diff-ai-review-dropdown" key={menu}>
                  <button
                    type="button"
                    className={`plan-diff-ai-review-dialog-picker${openMenu === menu ? ' is-open' : ''}`}
                    aria-label={label}
                    aria-haspopup="menu"
                    aria-expanded={openMenu === menu}
                    onClick={() => toggleMenu(menu)}
                  >
                    <span>{(options.find((option) => option.id === value) ?? options[0]).label}</span>
                    <Icon name="general/chevronDown" size={16} />
                  </button>
                  {renderMenu(menu, options.map((option) => (
                    <PopupCell
                      key={option.id}
                      selected={option.id === value}
                      onClick={() => { onSelect(option.id); setOpenMenu(null); }}
                    >
                      {option.label}
                    </PopupCell>
                  )))}
                </span>
              ))}
            </div>
          </div>
          {addContextRect && (
            <AiChatAddContextPopup
              triggerRect={addContextRect}
              onDismiss={() => setAddContextRect(null)}
              onSelectAttachment={addAttachment}
            />
          )}
        </div>,
    document.body,
  );
}

export function PlanDiffNewReviewButton({
  triggerClassName = '',
  initialInstructions = '',
  disabled = false,
  disabledReason = 'No changes to review',
  ...dialogProps
}) {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div className="plan-diff-new-review">
      <span className="plan-diff-new-review-trigger" title={disabled ? disabledReason : undefined}>
        <button
          className={`plan-diff-ai-review-button plan-diff-ai-review-single-trigger${dialogOpen ? ' is-open' : ''}${triggerClassName ? ` ${triggerClassName}` : ''}`}
          type="button"
          title={disabled ? disabledReason : 'AI Review'}
          aria-label={disabled ? `AI Review — ${disabledReason}` : 'AI Review'}
          aria-haspopup="dialog"
          aria-expanded={dialogOpen}
          disabled={disabled}
          onClick={() => {
            if (!disabled) setDialogOpen((prev) => !prev);
          }}
        >
          <span className="plan-diff-ai-review-button-content">
            <span className="plan-diff-ai-review-button-icon">
              <Icon name="general/balloon" size={16} />
            </span>
            <span className="plan-diff-ai-review-button-label">AI Review</span>
          </span>
        </button>
      </span>
      <AiReviewComposerDialog
        {...dialogProps}
        initialInstructions={initialInstructions}
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
      />
    </div>
  );
}

function PlanDiffContentLabel({ children }) {
  return (
    <div className="plan-diff-content-label text-ui-default">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M4 7V5C4 2.79086 5.79086 1 8 1C10.2091 1 12 2.79086 12 5V7H12.5C13.3284 7 14 7.67157 14 8.5V13.5C14 14.3284 13.3284 15 12.5 15H3.5C2.67157 15 2 14.3284 2 13.5V8.5C2 7.67157 2.67157 7 3.5 7H4ZM5 7H11V5C11 3.34315 9.65685 2 8 2C6.34315 2 5 3.34315 5 5V7ZM3.5 8C3.22386 8 3 8.22386 3 8.5V13.5C3 13.7761 3.22386 14 3.5 14H12.5C12.7761 14 13 13.7761 13 13.5V8.5C13 8.22386 12.7761 8 12.5 8H3.5Z" fill="currentColor" />
      </svg>
      <span>{children}</span>
    </div>
  );
}

function PlanDiffCommentActionsMenu({ actions = [] }) {
  const [triggerRect, setTriggerRect] = useState(null);
  const availableActions = Array.isArray(actions) ? actions.filter(Boolean) : [];
  if (availableActions.length === 0) return null;

  const runAction = (action) => {
    setTriggerRect(null);
    action?.onSelect?.();
  };

  return (
    <>
      <IconButton
        icon="general/moreVertical"
        tooltip="More actions"
        className="spec-done-comment-popup-more-btn"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setTriggerRect(event.currentTarget.getBoundingClientRect());
        }}
      />
      {triggerRect && createPortal(
        <div className="theme-dark">
          <PositionedPopup triggerRect={triggerRect} onDismiss={() => setTriggerRect(null)} gap={4}>
            <Popup visible className="diff-comment-actions-popup" onClose={() => setTriggerRect(null)}>
              {availableActions.map((action, index) => (
                <PopupCell
                  key={`${action.label}-${index}`}
                  icon={action.icon}
                  onClick={() => runAction(action)}
                >
                  {action.label}
                </PopupCell>
              ))}
            </Popup>
          </PositionedPopup>
        </div>,
        document.body,
      )}
    </>
  );
}

function PlanDiffCommentCodeSnippet({ rows = [], language = 'text', targetRowIds = [], onOpen = null }) {
  const targetRowIdSet = new Set(targetRowIds);

  return (
    <div
      className={`plan-diff-aside-comment-code-context${onOpen ? ' is-openable' : ''}`}
      aria-label="Code context"
      role={onOpen ? 'button' : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onClick={onOpen ? (event) => {
        event.stopPropagation();
        onOpen();
      } : undefined}
      onKeyDown={onOpen ? (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        event.stopPropagation();
        onOpen();
      } : undefined}
    >
      {rows.map((snippetRow) => (
        <div
          key={snippetRow.id}
          className={`plan-diff-row plan-diff-row-${snippetRow.kind}${targetRowIdSet.has(snippetRow.id) ? ' is-comment-target-highlight' : ''}`}
        >
          <div className="plan-diff-row-gutter" aria-hidden="true">
            <span className="plan-diff-line-number">{snippetRow.oldNumber ?? ''}</span>
            <span className="plan-diff-line-number">{snippetRow.newNumber ?? ''}</span>
          </div>
          <div className="plan-diff-row-code">
            <span className="plan-diff-row-rail" aria-hidden="true" />
            <span className="plan-diff-row-code-text">
              {(snippetRow.fragments ?? [{ text: snippetRow.text || ' ', tone: 'plain' }]).map((fragment, fragmentIndex) => (
                <span
                  key={`${snippetRow.id}-snippet-fragment-${fragmentIndex}`}
                  className={`plan-diff-fragment${fragment.tone && fragment.tone !== 'plain' ? ` is-${fragment.tone}` : ''}`}
                >
                  {tokenizeCodeFragment(fragment.text || ' ', language).map((token, tokenIndex) => (
                    <span
                      key={`${snippetRow.id}-snippet-token-${fragmentIndex}-${tokenIndex}`}
                      className={`plan-diff-token plan-diff-token-${token.type}`}
                    >
                      {token.text}
                    </span>
                  ))}
                </span>
              ))}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function DiffInlineCommentPopup({
  comments,
  commentGroups = null,
  value,
  editingIndex,
  showCompose = true,
  commentsReadOnly = false,
  defaultSubmitAttachMode = 'current',
  submitAttachModes = ['current', 'new', 'document'],
  submitButtonLabel = '',
  defaultSubmitTargetLabel = '',
  defaultSubmitTargetIcon = '',
  defaultSubmitTargetKey = '',
  activeChatTargetKey = '',
  showSubmitTargetLabel = true,
  showSubmitActionMenu = true,
  showSendToAgentAction = true,
  submitActionOptions = null,
  secondarySubmitAction = null,
  inputPlaceholder = 'Write an AI Note',
  renderSubmitTargetPicker = null,
  commentContextLabel = '',
  commentContextIcon = 'claude',
  commentContextSessionLabel = '',
  footerMetaLabel = '',
  onChange,
  onCancel,
  onSubmit,
  onStartEdit,
  onDelete,
  onHide,
  onHideAll,
  onReplyToAgent,
  onReturnToChat,
  onQuickFix = null,
  onResolveComment = null,
  onDismissComment = null,
  preserveEditorSelection = false,
  preservedEditorSelectionSnapshot = null,
  severityFilter = 'all',
  forceShowHiddenComments = false,
  showCommentSeverity = false,
  resolveKeepsComment = false,
  allowAgentReplies = true,
}) {
  const ref = useRef(null);
  // Visibility model (mirrors PlanDiffOverlay): resolved comments are collapsed
  // (hidden flag) unless reopened individually or revealed via the "Resolved"
  // filter; open comments follow the severity filter and manual hide flag.
  const isCommentVisibleForRender = (comment) => {
    if (forceShowHiddenComments && getCommentEntryText(comment).trim().length > 0) {
      return true;
    }
    const filterValues = normalizePlanDiffSeverityFilter(severityFilter);
    const isResolved = isReviewFindingDecided(comment);
    if (isResolved) {
      if (filterValues.includes('resolved')) return true;
      return !isCommentEntryHidden(comment);
    }
    if (isCommentEntryHidden(comment)) return false;
    if (filterValues.length === 1 && filterValues.includes('resolved')) return false;
    const sev = (comment && typeof comment === 'object' && typeof comment.severity === 'string')
      ? comment.severity.toLowerCase()
      : '';
    return filterValues.includes(sev || PLAN_DIFF_UNCLASSIFIED_FILTER);
  };
  const textareaRef = useRef(null);
  const submitTargetRef = useRef(null);
  const [submitOptionsRect, setSubmitOptionsRect] = useState(null);
  const [submitOptionsWidth, setSubmitOptionsWidth] = useState(null);
  const [submitActionMenuRect, setSubmitActionMenuRect] = useState(null);
  const [selectedSubmitAction, setSelectedSubmitAction] = useState('default');
  const [submitAttachTarget, setSubmitAttachTarget] = useState(null);
  const [hasCreatedNewChatTarget, setHasCreatedNewChatTarget] = useState(false);
  const [agentReplyDrafts, setAgentReplyDrafts] = useState({});
  const agentReplyTextareaRefs = useRef({});
  // Keys of threads whose reply composer is open (revealed via the "Reply"
  // action) — the composer is hidden until then. ("Solved" is persisted on the
  // comment itself, not tracked here.)
  const [openAgentReplyComposers, setOpenAgentReplyComposers] = useState({});
  // Threads currently being actioned (Quick fix / Resolve): show a loader, then
  // the comment is removed as processed.
  const [processingAgentReplies, setProcessingAgentReplies] = useState({});
  const normalizedSubmitAttachModes = useMemo(() => {
    const nextModes = Array.isArray(submitAttachModes)
      ? submitAttachModes.filter((mode) => mode === 'current' || mode === 'new' || mode === 'document')
      : [];

    return nextModes.length > 0 ? Array.from(new Set(nextModes)) : ['current', 'new', 'document'];
  }, [submitAttachModes]);
  const normalizedDefaultSubmitAttachMode = normalizedSubmitAttachModes.includes(defaultSubmitAttachMode)
    ? defaultSubmitAttachMode
    : normalizedSubmitAttachModes[0];
  const [submitAttachMode, setSubmitAttachMode] = useState(normalizedDefaultSubmitAttachMode);
  const normalizedDefaultSubmitTargetKey = typeof defaultSubmitTargetKey === 'string'
    ? defaultSubmitTargetKey.trim()
    : '';
  const normalizedActiveChatTargetKey = typeof activeChatTargetKey === 'string'
    ? activeChatTargetKey.trim()
    : '';
  const fallbackSubmitTarget = {
    attachMode: submitAttachMode,
    targetChatId: submitAttachMode === 'current' ? normalizedActiveChatTargetKey : null,
    targetDocumentTabId: submitAttachMode === 'document' ? normalizedDefaultSubmitTargetKey : null,
  };
  const previousActiveChatTargetKeyRef = useRef(normalizedActiveChatTargetKey);
  const isEditing = Number.isInteger(editingIndex);
  const normalizedCommentGroups = Array.isArray(commentGroups) ? commentGroups : null;
  const hasGroupedComments = Boolean(normalizedCommentGroups?.length);
  const hasComments = comments.length > 0 || hasGroupedComments;
  const hasUngroupedPendingComments = comments.some((comment) => Boolean(comment && typeof comment === 'object' && comment.pending));
  const canChooseSubmitAttachMode = normalizedSubmitAttachModes.length > 1;
  const getSubmitAttachModeLabel = (attachMode) => {
    if (attachMode === 'new') return 'Attach to New Chat Session';
    if (attachMode === 'document') return 'Attach to Current Agent MD';
    return 'Attach to Chat Session';
  };
  const normalizedCommentContextLabel = typeof commentContextLabel === 'string'
    ? commentContextLabel.trim()
    : '';
  const commentAgentLabel = getAiReviewAgentLabel(commentContextIcon);
  const normalizedFooterMetaLabel = typeof footerMetaLabel === 'string' ? footerMetaLabel.trim() : '';
  const normalizedSubmitButtonLabel = typeof submitButtonLabel === 'string' ? submitButtonLabel.trim() : '';
  const primarySubmitButtonLabel = normalizedSubmitButtonLabel || (isEditing ? 'Save AI Note' : 'Attach AI Note');
  const normalizedSubmitActionOptions = Array.isArray(submitActionOptions) && submitActionOptions.length > 0
      ? submitActionOptions
      : [
          { id: 'default', label: primarySubmitButtonLabel },
          { id: 'send-to-agent', label: 'Send AI Note to Agent' },
          // { id: 'send-all-to-agent', label: 'Send All AI Notes to Agent' },
        ];
  const selectedSubmitActionOption = normalizedSubmitActionOptions.find((option) => option.id === selectedSubmitAction)
    ?? normalizedSubmitActionOptions[0];
  const selectedPrimarySubmitButtonLabel = selectedSubmitActionOption.label;
  const canSubmitComment = typeof value === 'string' && value.trim().length > 0;
  const normalizedDefaultSubmitTargetLabel = typeof defaultSubmitTargetLabel === 'string'
    ? defaultSubmitTargetLabel.trim()
    : '';
  const selectedSubmitTargetLabel = (() => {
    const explicitLabel = typeof submitAttachTarget?.label === 'string' ? submitAttachTarget.label.trim() : '';
    if (explicitLabel.length > 0) return explicitLabel;
    if (submitAttachMode === 'document') return normalizedDefaultSubmitTargetLabel;
    if (submitAttachMode === 'current') return normalizedCommentContextLabel;
    if (submitAttachMode === 'new') return 'New Chat Session';
    return '';
  })();
  const selectedSubmitTargetIcon = (() => {
    const explicitIcon = typeof submitAttachTarget?.icon === 'string' ? submitAttachTarget.icon.trim() : '';
    if (explicitIcon.length > 0) return explicitIcon;
    if (submitAttachMode === 'document') return defaultSubmitTargetIcon || 'fileTypes/markdown';
    if (submitAttachMode === 'current') return commentContextIcon || 'claude';
    if (submitAttachMode === 'new') return 'claude';
    return '';
  })();
  const renderSelectedSubmitTargetIcon = () => {
    if (!selectedSubmitTargetIcon) return null;
    if (selectedSubmitTargetIcon === 'fileTypes/markdown') {
      return <AiChatAgentIcon icon={selectedSubmitTargetIcon} title={selectedSubmitTargetLabel} />;
    }
    if (selectedSubmitTargetIcon.includes('/')) {
      return <Icon name={selectedSubmitTargetIcon} size={16} />;
    }
    return <AiChatAgentIcon icon={selectedSubmitTargetIcon} />;
  };
  const renderCommentContextHeader = ({
    label = normalizedCommentContextLabel,
    icon = commentContextIcon,
    sessionLabel = commentContextSessionLabel,
    messageId = null,
    chatId = null,
    sourceTabId = null,
    contextType = 'chat',
    pending = false,
  } = {}) => {
    const normalizedSessionLabel = typeof sessionLabel === 'string' ? sessionLabel.trim() : '';
    const isDocumentContext = contextType === 'document';
    const isDocumentActiveSessionLabel = normalizedSessionLabel === 'Document';
    const isActiveSessionLabel = normalizedSessionLabel === 'Active' || normalizedSessionLabel === 'Current Chat' || isDocumentActiveSessionLabel;
    // Active/current ownership is expressed by the chat title and icon. Do not
    // repeat it with a "Current Chat" badge on saved comment cards.
    const visibleSessionLabel = isActiveSessionLabel ? '' : normalizedSessionLabel;
    const sessionToneClassName = isActiveSessionLabel ? 'is-active-session' : 'is-muted-session';
    const shouldShowSessionLabel = !isDocumentContext
      && !isDocumentActiveSessionLabel
      && visibleSessionLabel.length > 0
      && visibleSessionLabel !== 'Related Chats'
      && visibleSessionLabel !== 'Inactive';

    return label.length > 0
      ? (
          <button
            type="button"
            className={`diff-comment-submit-target-label spec-done-comment-popup-context-header text-ui-small ${sessionToneClassName}`}
            data-demo-id="diff-comment-context-message"
            aria-label={`Open chat context: ${label}`}
            title={label}
            onClick={() => onReturnToChat?.({
              messageId,
              chatId,
              sourceTabId,
              source: contextType === 'document' ? 'diff-comment-document-context' : 'diff-comment-context',
            })}
            disabled={!onReturnToChat}
          >
              <span className="spec-done-comment-popup-context-prefix">
                <span className={`spec-done-comment-popup-context-icon-slot${pending ? ' is-pending' : ''}`} aria-hidden="true">
                  {pending
                    ? <Loader className="spec-done-comment-popup-context-loader" size={16} />
                    : <AiChatAgentIcon icon={icon} />}
                </span>
                <span className="spec-done-comment-popup-context-title">
                  {label}
                </span>
                {shouldShowSessionLabel && (
                  <Badge
                    className="spec-done-comment-popup-context-session"
                    text={visibleSessionLabel}
                    color={isActiveSessionLabel ? 'blue-secondary' : 'gray-secondary'}
                  />
                )}
              </span>
          </button>
        )
      : null
  };

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea || !showCompose) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
  }, [showCompose, value]);

  useEffect(() => {
    if (!showCompose) return;
    const input = textareaRef.current;
    if (input) {
      input.focus({ preventScroll: true });
      if (isEditing) input.select();
    }
    if (preserveEditorSelection && preservedEditorSelectionSnapshot) {
      scheduleSelectionSnapshotRestore(preservedEditorSelectionSnapshot);
    }
  }, [hasComments, isEditing, preserveEditorSelection, preservedEditorSelectionSnapshot, showCompose]);

  useEffect(() => {
    if (!normalizedSubmitAttachModes.includes(submitAttachMode)) {
      setSubmitAttachMode(normalizedDefaultSubmitAttachMode);
    }
  }, [normalizedDefaultSubmitAttachMode, normalizedSubmitAttachModes, submitAttachMode]);

  useEffect(() => {
    if (!submitAttachTarget) return;
    if (normalizedSubmitAttachModes.includes(submitAttachTarget.attachMode)) return;
    setSubmitAttachTarget(null);
  }, [normalizedSubmitAttachModes, submitAttachTarget]);

  useEffect(() => {
    const previousActiveChatTargetKey = previousActiveChatTargetKeyRef.current;
    previousActiveChatTargetKeyRef.current = normalizedActiveChatTargetKey;
    if (!normalizedActiveChatTargetKey || previousActiveChatTargetKey === normalizedActiveChatTargetKey) return;
    if (submitAttachTarget?.attachMode !== 'current') return;
    if (submitAttachTarget.targetChatId === normalizedActiveChatTargetKey) return;
    setSubmitAttachTarget(null);
    setSubmitAttachMode('current');
  }, [normalizedActiveChatTargetKey, submitAttachTarget]);

  useEffect(() => {
    if (!normalizedDefaultSubmitTargetKey) return;
    setSubmitAttachMode(normalizedDefaultSubmitAttachMode);
    setSubmitAttachTarget(null);
  }, [normalizedDefaultSubmitAttachMode, normalizedDefaultSubmitTargetKey]);

  const handleSubmit = (attachMode = submitAttachMode, submitAction = selectedSubmitAction) => {
    setSubmitOptionsRect(null);
    setSubmitOptionsWidth(null);
    setSubmitActionMenuRect(null);
    if (!canSubmitComment) return;
    onSubmit?.({
      attachMode,
      submitAction,
      targetChatId: submitAttachTarget?.attachMode === attachMode ? submitAttachTarget.targetChatId : null,
      targetDocumentTabId: submitAttachTarget?.attachMode === attachMode ? submitAttachTarget.targetDocumentTabId : null,
    });
  };

  const handleSecondarySubmit = () => {
    if (!secondarySubmitAction?.id || secondarySubmitAction.disabled) return;
    setSubmitOptionsRect(null);
    setSubmitOptionsWidth(null);
    setSubmitActionMenuRect(null);
    onSubmit?.({
      attachMode: submitAttachMode,
      submitAction: secondarySubmitAction.id,
      targetChatId: submitAttachTarget?.attachMode === submitAttachMode ? submitAttachTarget.targetChatId : null,
      targetDocumentTabId: submitAttachTarget?.attachMode === submitAttachMode ? submitAttachTarget.targetDocumentTabId : null,
    });
  };

  const handleSendToAgentSubmit = () => {
    handleSubmit(submitAttachMode, 'send-to-agent');
  };

  const handleSubmitOptionSelect = (attachMode) => {
    setSubmitAttachMode(attachMode);
    setSubmitAttachTarget(null);
    setSubmitOptionsRect(null);
    setSubmitOptionsWidth(null);
    setSubmitActionMenuRect(null);
    textareaRef.current?.focus({ preventScroll: true });
  };

  const handleSubmitActionSelect = (submitAction) => {
    setSelectedSubmitAction(submitAction);
    setSubmitOptionsRect(null);
    setSubmitOptionsWidth(null);
    setSubmitActionMenuRect(null);
    textareaRef.current?.focus({ preventScroll: true });
  };

  const handleSubmitTargetSelect = (target) => {
    if (!target || !normalizedSubmitAttachModes.includes(target.attachMode)) {
      return;
    }
    setSubmitAttachMode(target.attachMode);
    setSubmitAttachTarget(target);
    if (target.createdNewChat) {
      setHasCreatedNewChatTarget(true);
    }
    setSubmitOptionsRect(null);
    setSubmitOptionsWidth(null);
    setSubmitActionMenuRect(null);
    textareaRef.current?.focus({ preventScroll: true });
  };

  const resolveSubmitOptionsWidth = (triggerRect) => {
    if (!triggerRect || typeof window === 'undefined') return null;

    const submitButton = ref.current?.querySelector('[data-demo-id="diff-comment-submit"], .spec-done-comment-popup-actions button:last-child');
    const submitButtonRect = submitButton instanceof HTMLElement ? submitButton.getBoundingClientRect() : null;
    const popupRect = ref.current?.getBoundingClientRect();
    const targetRight = submitButtonRect?.right ?? popupRect?.right ?? triggerRect.right;
    const viewportMaxWidth = window.innerWidth - 16;
    const width = Math.round(targetRight - triggerRect.left);

    return Math.max(320, Math.min(width, viewportMaxWidth));
  };

  const toggleSubmitOptions = (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!canChooseSubmitAttachMode) return;
    const rect = submitTargetRef.current?.getBoundingClientRect();
    if (submitOptionsRect) {
      setSubmitOptionsRect(null);
      setSubmitOptionsWidth(null);
      return;
    }
    setSubmitActionMenuRect(null);
    setSubmitOptionsWidth(resolveSubmitOptionsWidth(rect));
    setSubmitOptionsRect(rect);
  };

  const getAgentReplyDraftKey = (comment, fallbackIndex = 0) => {
    const source = typeof comment?.source === 'string' ? comment.source : 'diff';
    const chatId = typeof comment?.chatId === 'string' ? comment.chatId : '';
    const localIndex = Number.isInteger(comment?.localIndex) ? comment.localIndex : fallbackIndex;
    return `${source}:${chatId}:${localIndex}`;
  };

  const handleAgentReplyDraftChange = (draftKey, nextValue) => {
    setAgentReplyDrafts((prev) => ({
      ...prev,
      [draftKey]: nextValue,
    }));
  };

  const clearAgentReplyDraft = (draftKey) => {
    setAgentReplyDrafts((prev) => {
      const { [draftKey]: _clearedDraft, ...rest } = prev;
      return rest;
    });
  };

  const openAgentReplyComposer = (draftKey) => {
    setOpenAgentReplyComposers((prev) => ({ ...prev, [draftKey]: true }));
    window.requestAnimationFrame(() => {
      agentReplyTextareaRefs.current[draftKey]?.focus({ preventScroll: true });
    });
  };

  const closeAgentReplyComposer = (draftKey) => {
    clearAgentReplyDraft(draftKey);
    setOpenAgentReplyComposers((prev) => {
      const { [draftKey]: _closed, ...rest } = prev;
      return rest;
    });
  };

  const handleAgentReplySubmit = (comment, draftKey, fallbackIndex = 0, context = null) => {
    const trimmed = (agentReplyDrafts[draftKey] ?? '').trim();
    if (!trimmed || commentsReadOnly || comment?.reviewReadOnly || isReviewFindingDecided(comment)) return;
    const source = typeof comment?.source === 'string' ? comment.source : 'diff';
    const localIndex = Number.isInteger(comment?.localIndex) ? comment.localIndex : fallbackIndex;
    onReplyToAgent?.(localIndex, trimmed, source, context);
    closeAgentReplyComposer(draftKey);
  };

  const handleAgentQuickFix = (comment, fallbackIndex = 0, context = null) => {
    if (commentsReadOnly || comment?.reviewReadOnly || isReviewFindingDecided(comment)) return;
    const source = typeof comment?.source === 'string' ? comment.source : 'diff';
    const localIndex = Number.isInteger(comment?.localIndex) ? comment.localIndex : fallbackIndex;
    onQuickFix?.(localIndex, source, context, comment);
  };

  const handleAgentResolve = (comment, solved, fallbackIndex = 0, context = null) => {
    if (commentsReadOnly || comment?.reviewReadOnly || isReviewFindingDecided(comment)) return;
    const source = typeof comment?.source === 'string' ? comment.source : 'diff';
    const localIndex = Number.isInteger(comment?.localIndex) ? comment.localIndex : fallbackIndex;
    if (!solved) closeAgentReplyComposer(getAgentReplyDraftKey(comment, fallbackIndex));
    onResolveComment?.(localIndex, solved, source, context, comment);
  };

  const handleAgentDismiss = (comment, fallbackIndex = 0, context = null) => {
    if (commentsReadOnly || comment?.reviewReadOnly || isReviewFindingDecided(comment)) return;
    const source = typeof comment?.source === 'string' ? comment.source : 'diff';
    const localIndex = Number.isInteger(comment?.localIndex) ? comment.localIndex : fallbackIndex;
    onDismissComment?.(localIndex, source, context, comment);
  };

  // Apply fix / Mark resolved on an agent comment: show a loader while it's
  // being actioned, then run the real handler and update collected-comment
  // views. Applying a fix is the primary path; marking resolved is a manual
  // close when the user handled it elsewhere.
  const startAgentCommentProcessing = (comment, kind, draftKey, fallbackIndex = 0, context = null) => {
    if (
      commentsReadOnly
      || comment?.reviewReadOnly
      || comment?.pending
      || isReviewFindingDecided(comment)
      || processingAgentReplies[draftKey]
    ) return;
    closeAgentReplyComposer(draftKey);
    // Review quick fixes are local decisions, not a separate agent run. Apply
    // them in place so the existing card only changes status and never briefly
    // collapses/reflows around a loader.
    if (resolveKeepsComment && kind === 'quickfix') {
      handleAgentQuickFix(comment, fallbackIndex, context);
      return;
    }
    setProcessingAgentReplies((prev) => ({ ...prev, [draftKey]: true }));
    window.setTimeout(() => {
      if (kind === 'quickfix') handleAgentQuickFix(comment, fallbackIndex, context);
      else if (kind === 'dismiss') handleAgentDismiss(comment, fallbackIndex, context);
      else handleAgentResolve(comment, true, fallbackIndex, context);
      setProcessingAgentReplies((prev) => {
        const { [draftKey]: _done, ...rest } = prev;
        return rest;
      });
    }, 1400);
  };

  const renderMoreButton = (actions = []) => <PlanDiffCommentActionsMenu actions={actions} />;

  const renderSubmitTargetButton = () => (
    showSubmitTargetLabel && !isEditing && selectedSubmitTargetLabel.length > 0
      ? (
          <button
            type="button"
            ref={submitTargetRef}
            className={`diff-comment-submit-target-label text-ui-small${submitOptionsRect ? ' is-selected' : ''}`}
            title={selectedSubmitTargetLabel}
            aria-label={`Choose AI Note attachment target: ${selectedSubmitTargetLabel}`}
            aria-haspopup="menu"
            aria-expanded={Boolean(submitOptionsRect)}
            onClick={canChooseSubmitAttachMode ? toggleSubmitOptions : undefined}
            disabled={!canChooseSubmitAttachMode}
          >
            <span className="diff-comment-submit-target-icon" aria-hidden="true">
              {renderSelectedSubmitTargetIcon()}
            </span>
            <span className="diff-comment-submit-target-text">
              {selectedSubmitTargetLabel}
            </span>
            {canChooseSubmitAttachMode && (
              <Icon name="general/chevronDown" size={16} className="diff-comment-submit-target-chevron" />
            )}
          </button>
        )
      : null
  );

  const getEditableCommentActions = (index, source = 'diff', context = null) => [
    { label: 'Edit', icon: 'general/edit', onSelect: () => onStartEdit?.(index, source, context) },
    { label: 'Hide', icon: 'general/hide', onSelect: () => onHide?.(index, source, context) },
    { label: 'Hide all', icon: 'general/collapseAll', onSelect: () => onHideAll?.(source, context) },
    { label: 'Delete', icon: 'general/delete', onSelect: () => onDelete?.(index, source, context) },
  ];

  const getReturnToContextActions = (context = null) => (
    onReturnToChat
      ? [{
          label: 'To context',
          icon: 'aiAssistant/toolWindowChat@20x20',
          onSelect: () => onReturnToChat({ ...(context ?? {}), source: 'diff-comment-context' }),
        }]
      : []
  );

  const getAgentCommentActions = (comment, fallbackIndex = 0, context = null, source = 'diff') => {
    if (
      commentsReadOnly
      || comment?.reviewReadOnly
      || comment?.pending
      || (resolveKeepsComment && getReviewFindingStatus(comment) !== 'open')
      || isReviewFindingDecided(comment)
    ) {
      return getReturnToContextActions(context);
    }
    const draftKey = getAgentReplyDraftKey(comment, fallbackIndex);
    const changeLabel = typeof comment?.fixLabel === 'string' ? comment.fixLabel.trim() : '';
    return [
      ...(changeLabel ? [{
        label: changeLabel,
        icon: 'codeInsight/quickfixBulb',
        onSelect: () => startAgentCommentProcessing(comment, 'quickfix', draftKey, fallbackIndex, context),
      }] : []),
      ...(allowAgentReplies ? [{
        label: 'Reply',
        icon: 'general/balloon',
        onSelect: () => openAgentReplyComposer(draftKey),
      }] : []),
      {
        label: 'Dismiss',
        icon: 'general/hide',
        onSelect: () => startAgentCommentProcessing(comment, 'dismiss', draftKey, fallbackIndex, context),
      },
      ...(showCommentSeverity ? [{
        label: 'Delete',
        icon: 'general/delete',
        onSelect: () => onDelete?.(fallbackIndex, source, context),
      }] : []),
    ];
  };

  const startCommentTextEdit = (event, index, source = 'diff', context = null, comment = null) => {
    event.stopPropagation();
    if (!Number.isInteger(index) || commentsReadOnly || comment?.reviewReadOnly) return;
    onStartEdit?.(index, source, context);
  };

  const handleCommentTextKeyDown = (event, index, source = 'diff', context = null, comment = null) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    startCommentTextEdit(event, index, source, context, comment);
  };

  const popupClassName = [
    'cmp-popup',
    'spec-done-comment-popup',
    hasComments ? 'has-comments' : '',
  ].filter(Boolean).join(' ');

  // Agent/user replies stay in the same left-thread card without adding a
  // second visual indentation level.
  const hasAgentResolutionThread = (comment) => Boolean(comment && typeof comment === 'object' && comment.resolution);

  const renderStandaloneAgentFollowUp = (comment) => {
    const reply = typeof comment?.agentFollowUpReply === 'string'
      ? comment.agentFollowUpReply.trim()
      : '';
    if (!reply || hasAgentResolutionThread(comment)) return null;
    return (
      <div className="spec-done-comment-agent-follow-up-reply">
        <div className="spec-done-comment-agent-reply-head">
          <span className="spec-done-comment-agent-reply-avatar" aria-hidden="true">
            <AiChatAgentIcon icon={commentContextIcon} />
          </span>
          <span className="spec-done-comment-agent-reply-name">{commentAgentLabel}</span>
        </div>
        <p className="spec-done-comment-agent-reply-text">{reply}</p>
      </div>
    );
  };

  const renderAgentResolution = (comment, fallbackIndex = 0, context = null, options = {}) => {
    const resolution = comment && typeof comment === 'object' ? comment.resolution : null;
    if (!resolution) return null;
    const draftKey = getAgentReplyDraftKey(comment, fallbackIndex);
    const draftValue = agentReplyDrafts[draftKey] ?? '';
    const userReply = typeof comment.userReply === 'string' ? comment.userReply.trim() : '';
    const agentFollowUpReply = typeof comment.agentFollowUpReply === 'string'
      ? comment.agentFollowUpReply.trim()
      : '';
    const canReplyToAgent = allowAgentReplies
      && !commentsReadOnly
      && !comment?.reviewReadOnly
      && !comment?.pending
      && (!showCommentSeverity || getReviewFindingStatus(comment) === 'open')
      && !isReviewFindingDecided(comment)
      && typeof onReplyToAgent === 'function';
    const isComposerOpen = Boolean(openAgentReplyComposers[draftKey]);
    const canShowPendingLoader = options?.showPendingLoader !== false;
    const isProcessing = Boolean(processingAgentReplies[draftKey] || (canShowPendingLoader && comment?.pending));
    const showProcessingInReply = options?.showProcessingInReply !== false;
    const findingStatus = getReviewFindingStatus(comment);
    const isResolved = isReviewFindingDecided(comment);
    const resolvedLabel = getReviewFindingStatusLabel(comment);
    const resolvedBadgeTone = ` is-${findingStatus}`;
    const changeLabel = typeof comment.fixLabel === 'string' ? comment.fixLabel.trim() : '';
    const severity = typeof comment?.severity === 'string' ? comment.severity.trim().toLowerCase() : '';
    const hasReviewSeverity = showCommentSeverity && ['critical', 'warning', 'info'].includes(severity);
    return (
      <div className={`spec-done-comment-agent-reply${isResolved ? ' is-resolved' : ''}`}>
        <div className="spec-done-comment-agent-reply-thread">
          <div className="spec-done-comment-agent-reply-head">
            <span className={`spec-done-comment-agent-reply-avatar${isProcessing && showProcessingInReply ? ' is-processing' : ''}`} aria-hidden="true">
              {isProcessing && showProcessingInReply ? <Loader size={16} /> : <AiChatAgentIcon icon={commentContextIcon} />}
            </span>
            <span className="spec-done-comment-agent-reply-name">{commentAgentLabel}</span>
            {hasReviewSeverity && (
              <span className={`spec-done-status-severity is-${severity}`}>{severity}</span>
            )}
            {showCommentSeverity && findingStatus !== 'open' && (
              <span className={`spec-done-comment-resolved-badge${resolvedBadgeTone}`}>{resolvedLabel}</span>
            )}
          </div>
          {comment.agentReply && (
            <p className="spec-done-comment-agent-reply-text">{comment.agentReply}</p>
          )}
          {/* Line-number label in comments hidden for now.
          {comment.author === 'agent' && typeof comment.lineLabel === 'string' && comment.lineLabel.trim().length > 0 && (
            <div className="spec-done-comment-agent-reply-line text-ui-small">{comment.lineLabel.trim()}</div>
          )}
          */}
          {!isProcessing && !isResolved && canReplyToAgent && !isComposerOpen && (
            <div className="spec-done-comment-agent-reply-actions">
              {changeLabel.length > 0 && (
                <button
                  type="button"
                  className="spec-done-comment-agent-reply-link is-change-cta"
                  aria-label={`Apply change: ${changeLabel}`}
                  title={`Apply change: ${changeLabel}`}
                  onClick={(event) => { event.stopPropagation(); startAgentCommentProcessing(comment, 'quickfix', draftKey, fallbackIndex, context); }}
                >
                  {changeLabel}
                </button>
              )}
              <button
                type="button"
                className="spec-done-comment-agent-reply-link"
                onClick={(event) => { event.stopPropagation(); openAgentReplyComposer(draftKey); }}
              >
                Reply
              </button>
            </div>
          )}
          {allowAgentReplies && userReply.length > 0 && (
            <div className="spec-done-comment-agent-user-reply">
              <div className="spec-done-comment-agent-user-reply-head">
                <span className="spec-done-comment-agent-user-reply-icon" aria-hidden="true">
                  <Icon name="general/user" size={16} />
                </span>
                <span className="spec-done-comment-agent-user-reply-name">You</span>
              </div>
              <p className="spec-done-comment-agent-user-reply-text">{userReply}</p>
            </div>
          )}
          {agentFollowUpReply.length > 0 && (
            <div className="spec-done-comment-agent-follow-up-reply">
              <div className="spec-done-comment-agent-reply-head">
                <span className="spec-done-comment-agent-reply-avatar" aria-hidden="true">
                  <AiChatAgentIcon icon={commentContextIcon} />
                </span>
                <span className="spec-done-comment-agent-reply-name">{commentAgentLabel}</span>
              </div>
              <p className="spec-done-comment-agent-reply-text">{agentFollowUpReply}</p>
            </div>
          )}
        </div>
        {canReplyToAgent && isComposerOpen && (
          <div
            className="spec-done-comment-agent-reply-compose"
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                handleAgentReplySubmit(comment, draftKey, fallbackIndex, context);
              }
              if (event.key === 'Escape') {
                event.preventDefault();
                closeAgentReplyComposer(draftKey);
              }
            }}
          >
            <div className="spec-done-comment-popup-input-wrap">
              <textarea
                ref={(node) => {
                  if (node) agentReplyTextareaRefs.current[draftKey] = node;
                  else delete agentReplyTextareaRefs.current[draftKey];
                }}
                className="spec-done-comment-popup-textarea text-ui-default"
                value={draftValue}
                placeholder="Reply to Claude Agent"
                data-demo-id="diff-comment-agent-reply-input"
                onChange={(event) => handleAgentReplyDraftChange(draftKey, event.target.value)}
                rows={1}
              />
            </div>
            <div className="spec-done-comment-popup-footer">
              <div className="spec-done-comment-popup-actions">
                <Button
                  type="secondary"
                  data-demo-id="diff-comment-agent-reply-cancel"
                  onClick={() => closeAgentReplyComposer(draftKey)}
                >
                  Cancel
                </Button>
                <Button
                  type="primary"
                  data-demo-id="diff-comment-agent-reply-submit"
                  disabled={draftValue.trim().length === 0}
                  onClick={() => handleAgentReplySubmit(comment, draftKey, fallbackIndex, context)}
                >
                  Send
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  let hasRenderedThreadLoaderSlot = false;
  const visibleUngroupedComments = comments.map((comment, index) => ({ comment, index })).filter(({ comment, index }) => (
    isCommentVisibleForRender(comment)
    && (!isEditing || index !== editingIndex)
  ));
  const hasProcessingUngroupedComments = visibleUngroupedComments.some(({ comment, index }) => (
    Boolean(processingAgentReplies[getAgentReplyDraftKey(comment, index)])
  ));
  const showUngroupedHeader = !hasGroupedComments
    && (!showCompose || hasComments)
    && !(comments.length > 0 && comments.every((comment) => comment && typeof comment === 'object' && comment.author === 'agent'));
  const ungroupedHeaderComment = showUngroupedHeader && visibleUngroupedComments.length > 0
    ? visibleUngroupedComments[0]
    : null;
  const ungroupedHeaderCommentIsAgentAuthored = Boolean(
    ungroupedHeaderComment?.comment
      && typeof ungroupedHeaderComment.comment === 'object'
      && ungroupedHeaderComment.comment.author === 'agent',
  );
  const ungroupedHeaderActions = ungroupedHeaderComment
    ? ungroupedHeaderCommentIsAgentAuthored
      ? []
      : commentsReadOnly || ungroupedHeaderComment.comment?.reviewReadOnly
        ? getReturnToContextActions()
        : getEditableCommentActions(ungroupedHeaderComment.index)
    : [];
  const moveUngroupedCommentMenuToHeader = showUngroupedHeader && ungroupedHeaderActions.length > 0;

  return (
    <div ref={ref} className={popupClassName} onMouseDown={(e) => e.stopPropagation()}>
      {showUngroupedHeader && (
        <div className="spec-done-comment-popup-context-row">
          {renderCommentContextHeader({ pending: hasUngroupedPendingComments || hasProcessingUngroupedComments })}
          {moveUngroupedCommentMenuToHeader && renderMoreButton(ungroupedHeaderActions)}
        </div>
      )}
      {hasGroupedComments && (
        <div className="spec-done-comment-popup-groups">
          {normalizedCommentGroups.map((group) => {
            // Agent-authored comments carry their own header (Claude Agent +
            // severity + ⋯), so the chat context header is redundant for them.
            const isAgentOnlyGroup = group.comments.length > 0
              && group.comments.every((comment) => comment && typeof comment === 'object' && comment.author === 'agent');
            const showGroupHeader = !group.hideHeader && !isAgentOnlyGroup && (group.comments.length > 0 || group.showHeaderWhenEmpty);
            const hasPendingGroupComments = group.comments.some((comment) => Boolean(comment && typeof comment === 'object' && comment.pending));
            const hasProcessingGroupComments = group.comments.some((comment, index) => (
              Boolean(processingAgentReplies[getAgentReplyDraftKey(comment, comment?.localIndex ?? index)])
            ));
            const normalizedGroupSessionLabel = typeof group.sessionLabel === 'string' ? group.sessionLabel.trim() : '';
            const groupSessionToneClassName = normalizedGroupSessionLabel === 'Active' || normalizedGroupSessionLabel === 'Current Chat' || normalizedGroupSessionLabel === 'Document'
              ? 'is-active-session'
              : 'is-muted-session';
            const canSwitchToGroupChat = groupSessionToneClassName === 'is-muted-session'
              && typeof group.chatId === 'string'
              && group.chatId.trim().length > 0;
            const hasMultipleGroupComments = group.comments.length > 1;
            const handleGroupClick = (event) => {
              if (!canSwitchToGroupChat) return;
              const target = event.target;
              if (target instanceof HTMLElement && target.closest('button, a, [role="button"]')) return;

              onReturnToChat?.({
                messageId: group.messageId,
                chatId: group.chatId,
                source: 'diff-comment-context',
              });
            };
            const visibleGroupComments = group.comments.filter((commentEntry, i) => (
              isCommentVisibleForRender(commentEntry)
              && (!isEditing || (commentEntry.localIndex ?? i) !== editingIndex)
            ));
            const headerCommentEntry = showGroupHeader && visibleGroupComments.length > 0
              ? visibleGroupComments[0]
              : null;
            const headerCommentActionContext = headerCommentEntry ? { chatId: headerCommentEntry.chatId } : null;
            const headerCommentActions = headerCommentEntry
              ? headerCommentEntry.reviewReadOnly
                ? getReturnToContextActions({ messageId: group.messageId, chatId: group.chatId })
                : headerCommentEntry.editable
                ? getEditableCommentActions(headerCommentEntry.localIndex, headerCommentEntry.source, headerCommentActionContext)
                : headerCommentEntry.author === 'agent'
                  ? []
                  : getReturnToContextActions({ messageId: group.messageId, chatId: group.chatId })
              : [];
            const moveCommentMenuToHeader = showGroupHeader && headerCommentActions.length > 0;

            return (
            <div
              className={`spec-done-comment-popup-group ${groupSessionToneClassName}${canSwitchToGroupChat ? ' is-switchable-session' : ''}${hasMultipleGroupComments ? ' has-multiple-comments' : ''}`}
              key={`${group.chatId || group.label}-${group.messageId || group.label}`}
              onClick={handleGroupClick}
            >
              {showGroupHeader && (
                <div className="spec-done-comment-popup-context-row">
                  {renderCommentContextHeader({ ...group, pending: hasPendingGroupComments || hasProcessingGroupComments })}
                  {moveCommentMenuToHeader && renderMoreButton(headerCommentActions)}
                </div>
              )}
              {group.comments.length > 0 && (
                <div className="spec-done-comment-popup-list">
                  {visibleGroupComments.map((commentEntry, i) => {
                    const commentActionContext = { chatId: commentEntry.chatId };
                    const isAgentAuthored = commentEntry.author === 'agent';
                    const actions = commentEntry.reviewReadOnly
                      ? getReturnToContextActions({ messageId: group.messageId, chatId: group.chatId })
                      : commentEntry.editable
                      ? getEditableCommentActions(commentEntry.localIndex, commentEntry.source, commentActionContext)
                      : isAgentAuthored
                        ? getAgentCommentActions(commentEntry, commentEntry.localIndex ?? i, commentActionContext, commentEntry.source)
                        : getReturnToContextActions({ messageId: group.messageId, chatId: group.chatId });
                    const entryLineLabel = getCommentEntryLineLabel(commentEntry) || normalizedFooterMetaLabel;
                    const shouldUseThreadLoaderSlot = !hasRenderedThreadLoaderSlot && hasAgentResolutionThread(commentEntry);
                    if (shouldUseThreadLoaderSlot) hasRenderedThreadLoaderSlot = true;

                    return (
                      <div key={`${group.chatId || 'comment'}-${i}`} className={`spec-done-comment-popup-item${commentEntry.pending ? ' is-pending' : ''}${isAgentAuthored ? ' is-agent-authored' : ''}`}>
                        <div className="spec-done-comment-popup-item-body">
                          {!isAgentAuthored && (
                            <>
                              <div
                                className={`spec-done-comment-popup-item-text text-ui-default${commentEntry.editable ? ' is-editable' : ''}`}
                                role={commentEntry.editable ? 'button' : undefined}
                                tabIndex={commentEntry.editable ? 0 : undefined}
                                onClick={commentEntry.editable ? (event) => startCommentTextEdit(event, commentEntry.localIndex, commentEntry.source, commentActionContext, commentEntry) : undefined}
                                onKeyDown={commentEntry.editable ? (event) => handleCommentTextKeyDown(event, commentEntry.localIndex, commentEntry.source, commentActionContext, commentEntry) : undefined}
                              >
                                {commentEntry.text}
                              </div>
                              {entryLineLabel.length > 0 && (
                                <div className="spec-done-comment-popup-item-meta text-ui-small">{entryLineLabel}</div>
                              )}
                            </>
                          )}
                          {renderAgentResolution(commentEntry, commentEntry.localIndex ?? i, commentActionContext, {
                            showPendingLoader: shouldUseThreadLoaderSlot,
                            showProcessingInReply: !showGroupHeader,
                          })}
                          {renderStandaloneAgentFollowUp(commentEntry)}
                        </div>
                        {!showGroupHeader && renderMoreButton(actions)}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            );
          })}
        </div>
      )}
      {!hasGroupedComments && hasComments && (
        <div className="spec-done-comment-popup-list">
          {visibleUngroupedComments.map(({ comment, index }) => {
            const commentText = getCommentEntryText(comment);
            const entryLineLabel = getCommentEntryLineLabel(comment) || normalizedFooterMetaLabel;
            const isPending = Boolean(comment && typeof comment === 'object' && comment.pending);
            const isAgentAuthored = comment && typeof comment === 'object' && comment.author === 'agent';
            const actions = isAgentAuthored
              ? getAgentCommentActions(comment, index)
              : commentsReadOnly || comment?.reviewReadOnly
                ? getReturnToContextActions()
                : getEditableCommentActions(index);
            const shouldUseThreadLoaderSlot = !hasRenderedThreadLoaderSlot && hasAgentResolutionThread(comment);
            if (shouldUseThreadLoaderSlot) hasRenderedThreadLoaderSlot = true;

            return (
              <div key={index} className={`spec-done-comment-popup-item${isPending ? ' is-pending' : ''}${isAgentAuthored ? ' is-agent-authored' : ''}`}>
                <div className="spec-done-comment-popup-item-body">
                  {!isAgentAuthored && (
                    <>
                      <div
                        className={`spec-done-comment-popup-item-text text-ui-default${commentsReadOnly || comment?.reviewReadOnly ? '' : ' is-editable'}`}
                        role={commentsReadOnly || comment?.reviewReadOnly ? undefined : 'button'}
                        tabIndex={commentsReadOnly || comment?.reviewReadOnly ? undefined : 0}
                        onClick={commentsReadOnly || comment?.reviewReadOnly ? undefined : (event) => startCommentTextEdit(event, index, 'diff', null, comment)}
                        onKeyDown={commentsReadOnly || comment?.reviewReadOnly ? undefined : (event) => handleCommentTextKeyDown(event, index, 'diff', null, comment)}
                      >
                        {commentText}
                      </div>
                      {/* Line-number label in comments hidden for now.
                      {entryLineLabel.length > 0 && (
                        <div className="spec-done-comment-popup-item-meta text-ui-small">{entryLineLabel}</div>
                      )}
                      */}
                    </>
                  )}
                  {renderAgentResolution(comment, index, null, {
                    showPendingLoader: shouldUseThreadLoaderSlot,
                    showProcessingInReply: !showUngroupedHeader,
                  })}
                  {renderStandaloneAgentFollowUp(comment)}
                </div>
                {!showUngroupedHeader && renderMoreButton(actions)}
              </div>
            );
          })}
        </div>
      )}
      {showCompose && (
        <div
          className="spec-done-comment-popup-compose"
          onKeyDown={(e) => {
            if (e.key === 'Escape') { e.preventDefault(); onCancel?.(); }
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
          }}
        >
          {showSubmitTargetLabel && !isEditing && selectedSubmitTargetLabel.length > 0 && (
            <div className="spec-done-comment-popup-compose-header">
              {renderSubmitTargetButton()}
            </div>
          )}
          <div className="spec-done-comment-popup-input-wrap">
            <textarea
              ref={textareaRef}
              className="spec-done-comment-popup-textarea text-ui-default"
              value={value}
              placeholder={inputPlaceholder}
              data-demo-id="diff-comment-input"
              onChange={(e) => onChange?.(e.target.value)}
              rows={1}
            />
          </div>
          <div className="spec-done-comment-popup-footer">
            {normalizedFooterMetaLabel.length > 0 && (
              <div className="spec-done-comment-popup-footer-meta text-ui-small">
                {normalizedFooterMetaLabel}
              </div>
            )}
            <div className="spec-done-comment-popup-actions">
              <Button
                type="secondary"
                data-demo-id="diff-comment-cancel"
                onClick={() => {
                  setSubmitOptionsRect(null);
                  setSubmitOptionsWidth(null);
                  setSubmitActionMenuRect(null);
                  onCancel?.();
                }}
              >
                Cancel
              </Button>
              {secondarySubmitAction?.id && (
                <Button
                  type="secondary"
                  className="diff-comment-secondary-submit"
                  data-demo-id={`diff-comment-submit-${secondarySubmitAction.id}`}
                  disabled={Boolean(secondarySubmitAction.disabled)}
                  onClick={handleSecondarySubmit}
                >
                  <span className="diff-comment-secondary-submit-content">
                    {secondarySubmitAction.iconName && (
                      <Icon
                        name={secondarySubmitAction.iconName}
                        size={16}
                        className={secondarySubmitAction.accent ? `is-${secondarySubmitAction.accent}` : ''}
                      />
                    )}
                    {secondarySubmitAction.label}
                  </span>
                </Button>
              )}
              {!isEditing && showSendToAgentAction && (
                <Button
                  type="secondary"
                  data-demo-id="diff-comment-submit-send-to-agent"
                  disabled={!canSubmitComment}
                  onClick={handleSendToAgentSubmit}
                >
                  Send AI Note to Agent
                </Button>
              )}
              <Button
                type="primary"
                data-demo-id="diff-comment-submit"
                disabled={!canSubmitComment}
                onClick={() => handleSubmit(submitAttachMode, 'default')}
              >
                {primarySubmitButtonLabel}
              </Button>
              {/*
              {showSubmitActionMenu ? (
                <span className={`diff-comment-primary-split${submitActionMenuRect ? ' is-open' : ''}${!canSubmitComment ? ' is-disabled' : ''}`}>
                  <button
                    type="button"
                    className="diff-comment-primary-split-main"
                    data-demo-id="diff-comment-submit"
                    aria-label={selectedPrimarySubmitButtonLabel}
                    disabled={!canSubmitComment}
                    onClick={() => handleSubmit()}
                  >
                    {selectedSubmitActionOption.iconName && (
                      <Icon
                        name={selectedSubmitActionOption.iconName}
                        size={16}
                        className={selectedSubmitActionOption.accent ? `is-${selectedSubmitActionOption.accent}` : ''}
                      />
                    )}
                    {selectedPrimarySubmitButtonLabel}
                  </button>
                  <span className="diff-comment-primary-split-separator" aria-hidden="true" />
                  <button
                    type="button"
                    className="diff-comment-primary-split-menu"
                    aria-label={`${selectedPrimarySubmitButtonLabel} options`}
                    aria-haspopup="menu"
                    aria-expanded={Boolean(submitActionMenuRect)}
                    disabled={!canSubmitComment}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      const rect = event.currentTarget.getBoundingClientRect();
                      setSubmitOptionsRect(null);
                      setSubmitOptionsWidth(null);
                      setSubmitActionMenuRect((currentRect) => (
                        currentRect ? null : rect
                      ));
                    }}
                  >
                    <Icon name="general/chevronDown" size={16} />
                  </button>
                </span>
              ) : (
                <Button
                  type="primary"
                  data-demo-id="diff-comment-submit"
                  disabled={!canSubmitComment}
                  onClick={() => handleSubmit()}
                >
                  <span className="diff-comment-primary-submit-content">
                    {selectedSubmitActionOption.iconName && (
                      <Icon
                        name={selectedSubmitActionOption.iconName}
                        size={16}
                        className={selectedSubmitActionOption.accent ? `is-${selectedSubmitActionOption.accent}` : ''}
                      />
                    )}
                    {selectedPrimarySubmitButtonLabel}
                  </span>
                </Button>
              )}
              */}
            </div>
          </div>
          {/*
          {showSubmitActionMenu && submitActionMenuRect && createPortal(
            <div className="theme-dark">
              <PositionedPopup triggerRect={submitActionMenuRect} onDismiss={() => setSubmitActionMenuRect(null)} gap={4}>
                <Popup visible className="diff-comment-submit-action-popup" onClose={() => setSubmitActionMenuRect(null)}>
                  {normalizedSubmitActionOptions.map((option) => (
                    <PopupCell
                      key={option.id}
                      icon={option.iconName}
                      className={option.accent ? `is-${option.accent}` : ''}
                      selected={selectedSubmitAction === option.id}
                      onClick={() => handleSubmitActionSelect(option.id)}
                    >
                      {option.label}
                    </PopupCell>
                  ))}
                </Popup>
              </PositionedPopup>
            </div>,
            document.body,
          )}
          */}
          {canChooseSubmitAttachMode && submitOptionsRect && createPortal(
            typeof renderSubmitTargetPicker === 'function'
              ? renderSubmitTargetPicker({
                  triggerRect: submitOptionsRect,
                  width: submitOptionsWidth,
                  selectedTarget: submitAttachTarget ?? fallbackSubmitTarget,
                  canCreateNewChat: !hasCreatedNewChatTarget,
                  onSelectTarget: handleSubmitTargetSelect,
                  onDismiss: () => {
                    setSubmitOptionsRect(null);
                    setSubmitOptionsWidth(null);
                  },
                })
              : (
                <div className="theme-dark">
                  <PositionedPopup triggerRect={submitOptionsRect} onDismiss={() => setSubmitOptionsRect(null)} gap={4}>
                    <Popup visible className="diff-comment-submit-options-popup" onClose={() => setSubmitOptionsRect(null)}>
                      {normalizedSubmitAttachModes.map((attachMode) => (
                        <PopupCell
                          key={attachMode}
                          selected={submitAttachMode === attachMode}
                          onClick={() => handleSubmitOptionSelect(attachMode)}
                        >
                          {getSubmitAttachModeLabel(attachMode)}
                        </PopupCell>
                      ))}
                    </Popup>
                  </PositionedPopup>
                </div>
              ),
            document.body,
          )}
        </div>
      )}
    </div>
  );
}

function normalizeDiffCommentsState(diffComments = {}) {
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

function getCommentEntryText(comment) {
  if (typeof comment === 'string') return comment;
  return typeof comment?.text === 'string' ? comment.text : '';
}

function isCommentEntryHidden(comment) {
  return Boolean(comment && typeof comment === 'object' && comment.hidden);
}

function getCommentEntryLineLabel(comment) {
  return typeof comment?.lineLabel === 'string' ? comment.lineLabel.trim() : '';
}

function getCommentEntryRowIds(comment) {
  if (!comment || typeof comment !== 'object') return [];

  const rowIds = Array.isArray(comment.rowIds)
    ? comment.rowIds
    : (Array.isArray(comment.targetRowIds) ? comment.targetRowIds : []);

  return rowIds.filter((rowId) => typeof rowId === 'string' && rowId.length > 0);
}

function flattenDiffCommentsState(diffComments = {}) {
  return Object.values(normalizeDiffCommentsState(diffComments)).flat().map(getCommentEntryText);
}

function areCommentTextArraysEqual(left = [], right = []) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
    return false;
  }

  return left.every((comment, index) => getCommentEntryText(comment) === getCommentEntryText(right[index]));
}

function isMirroredLocalCommentSession({
  commentsReadOnly = false,
  sessionTitle = '',
  commentContextLabel = '',
  sessionComments = [],
  rowComments = [],
} = {}) {
  return !commentsReadOnly
    && sessionTitle === commentContextLabel
    && areCommentTextArraysEqual(sessionComments, rowComments);
}

function normalizeCommentSessions(commentSessions = []) {
  if (!Array.isArray(commentSessions)) {
    return [];
  }

  return commentSessions.map((session) => {
    if (!session || typeof session !== 'object') {
      return null;
    }

    return {
      chatId: typeof session.chatId === 'string' ? session.chatId : '',
      messageId: typeof session.messageId === 'string' ? session.messageId : '',
      title: typeof session.title === 'string' ? session.title : '',
      icon: typeof session.icon === 'string' ? session.icon : 'claude',
      comments: normalizeDiffCommentsState(session.comments),
    };
  }).filter((session) => (
    session && session.title.length > 0 && Object.keys(session.comments).length > 0
  ));
}

function orderPlanDiffRowsForDisplay(rows = []) {
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

    const removedRows = changedRows.filter((changedRow) => changedRow.kind === 'removed');
    const addedRows = changedRows.filter((changedRow) => changedRow.kind === 'added');

    orderedRows.push(
      ...removedRows,
      ...addedRows,
    );
  }

  return orderedRows;
}

export function normalizePlanDiffUiState(uiState = null) {
  const normalizedState = uiState && typeof uiState === 'object' ? uiState : {};
  const caretState = normalizedState.caretState && typeof normalizedState.caretState === 'object'
    ? normalizedState.caretState
    : {};

  return {
    activeRowId: typeof normalizedState.activeRowId === 'string' && normalizedState.activeRowId.length > 0
      ? normalizedState.activeRowId
      : null,
    commentRowId: typeof normalizedState.commentRowId === 'string' && normalizedState.commentRowId.length > 0
      ? normalizedState.commentRowId
      : null,
    commentValue: typeof normalizedState.commentValue === 'string'
      ? normalizedState.commentValue
      : '',
    commentEditingIndex: Number.isInteger(normalizedState.commentEditingIndex)
      ? normalizedState.commentEditingIndex
      : null,
    commentTargetRowIds: Array.isArray(normalizedState.commentTargetRowIds)
      ? normalizedState.commentTargetRowIds.filter((rowId) => typeof rowId === 'string' && rowId.length > 0)
      : [],
    commentTargetHasSelection: Boolean(normalizedState.commentTargetHasSelection),
    commentFooterMetaLabel: typeof normalizedState.commentFooterMetaLabel === 'string'
      ? normalizedState.commentFooterMetaLabel
      : '',
    caretState: {
      rowId: typeof caretState.rowId === 'string' && caretState.rowId.length > 0
        ? caretState.rowId
        : null,
      left: Number.isFinite(caretState.left)
        ? caretState.left
        : PLAN_DIFF_DEFAULT_CARET_LEFT,
    },
  };
}

export function arePlanDiffUiStatesEqual(left = null, right = null) {
  const normalizedLeft = normalizePlanDiffUiState(left);
  const normalizedRight = normalizePlanDiffUiState(right);

  return (
    normalizedLeft.activeRowId === normalizedRight.activeRowId
    && normalizedLeft.commentRowId === normalizedRight.commentRowId
    && normalizedLeft.commentValue === normalizedRight.commentValue
    && normalizedLeft.commentEditingIndex === normalizedRight.commentEditingIndex
    && JSON.stringify(normalizedLeft.commentTargetRowIds) === JSON.stringify(normalizedRight.commentTargetRowIds)
    && normalizedLeft.commentTargetHasSelection === normalizedRight.commentTargetHasSelection
    && normalizedLeft.commentFooterMetaLabel === normalizedRight.commentFooterMetaLabel
    && normalizedLeft.caretState.rowId === normalizedRight.caretState.rowId
    && normalizedLeft.caretState.left === normalizedRight.caretState.left
  );
}

function shouldDeleteRow(comment) {
  const normalized = (comment || '').trim().toLowerCase();
  return normalized === 'delete' || normalized === 'delete this';
}

function shouldFixRow(comment) {
  const normalized = (comment || '').trim().toLowerCase();
  return normalized === 'fix' || normalized === 'fix this';
}

const PLAN_DIFF_OPEN_SEVERITY_FILTERS = ['critical', 'warning', 'info'];
const PLAN_DIFF_UNCLASSIFIED_FILTER = 'unclassified';

function planDiffCommentSeverityPriority(comment) {
  const severity = String(comment?.severity || '').trim().toLowerCase();
  const index = PLAN_DIFF_OPEN_SEVERITY_FILTERS.indexOf(severity);
  return index === -1 ? PLAN_DIFF_OPEN_SEVERITY_FILTERS.length : index;
}

function normalizePlanDiffSeverityFilter(value = 'all') {
  const rawValues = Array.isArray(value)
    ? value
    : value === 'all'
      ? [...PLAN_DIFF_OPEN_SEVERITY_FILTERS, PLAN_DIFF_UNCLASSIFIED_FILTER]
      : [value];
  const allowed = new Set([...PLAN_DIFF_OPEN_SEVERITY_FILTERS, PLAN_DIFF_UNCLASSIFIED_FILTER, 'resolved']);
  const normalized = rawValues
    .map((entry) => String(entry || '').toLowerCase())
    .filter((entry, index, arr) => allowed.has(entry) && arr.indexOf(entry) === index);
  return normalized.length > 0 ? normalized : [...PLAN_DIFF_OPEN_SEVERITY_FILTERS, PLAN_DIFF_UNCLASSIFIED_FILTER];
}

export function PlanDiffOverlay({
  diffData,
  contextSelections = [],
  initialDiffComments = {},
  documentDiffComments = {},
  documentContextLabel = '',
  documentContextIcon = 'fileTypes/markdown',
  documentContextSessionLabel = 'Related Chats',
  documentContextSourceTabId = null,
  defaultSubmitAttachMode = 'current',
  defaultSubmitTargetLabel = '',
  defaultSubmitTargetIcon = '',
  defaultSubmitTargetKey = '',
  commentSessions = [],
  commentSessionActiveChatId = '',
  commentsReadOnly = false,
  commentContextLabel = '',
  commentContextIcon = 'claude',
  commentContextSessionLabel = '',
  pendingCommentRowIds = [],
  commentShortcutHintRowId = null,
  onTextSelectionChange = null,
  onInlineCommentOpenChange = null,
  externalCommentRequest = null,
  onDiffCommentsChange = null,
  onDiffCommentSubmit = null,
  onGutterCommentToggle = null,
  onRowDelete = null,
  onRowFix = null,
  onPlanMarkerClick = null,
  onReturnToChat = null,
  uiState = null,
  onUiStateChange = null,
  singleLineNumbers = false,
  showGutterComments = true,
  plainFileGutterCommentsEnabled = true,
  onPlainFileGutterCommentsEnabledChange = null,
  diffGutterCommentsEnabled = true,
  onDiffGutterCommentsEnabledChange = null,
  inspectionWidget = null,
  renderSubmitTargetPicker = null,
  severityFilter = 'all',
  resolveKeepsComment = false,
  allowInlineCommentCompose = true,
  viewMode = 'unified',
  // In 'comments' mode, clicking a card calls this with the row id so a host
  // can scroll the corresponding code overlay and highlight the target row(s).
  onCommentNavigate = null,
  onCommentSourceOpen = null,
  commentIndexFileLabel = '',
  showCommentIndexFileLabel = false,
  showCommentSourceContext = true,
  defaultCommentCodeExpanded = false,
  commentIndexGroupId = '',
  commentIndexStatusFilter = 'all',
  onReviewProcessingChange = null,
  onReviewAction = null,
  inlineCommentRowIdOnly = false,
  expandedInlineCommentRowId = null,
  onInlineCommentExpand = null,
  highlightCommentRowId = null,
  highlightedCommentRowIds = [],
  allowCommentReplies = true,
}) {
  const scrollRef = useRef(null);
  const canCreateInlineComments = !commentsReadOnly && allowInlineCommentCompose;
  const highlightedCommentRowIdSet = useMemo(() => {
    const ids = Array.isArray(highlightedCommentRowIds) ? highlightedCommentRowIds : [];
    return new Set([
      ...ids.filter((rowId) => typeof rowId === 'string' && rowId.length > 0),
      ...(typeof highlightCommentRowId === 'string' && highlightCommentRowId.length > 0 ? [highlightCommentRowId] : []),
    ]);
  }, [highlightCommentRowId, highlightedCommentRowIds]);
  // Visibility model (computed at render, never mutates data):
  //  - Resolved / quick-fixed comments carry hidden:true so they auto-collapse to
  //    the gutter. They stay collapsed under the default view; reopening one from
  //    its gutter badge clears that flag (so it shows again), and the "Resolved"
  //    filter reveals every resolved comment at once regardless of the flag.
  //  - Open comments follow the severity filter and the manual hide flag.
  //  - A caller that scopes the overlay to one group (`commentIndexGroupId`) or one
  //    status (`commentIndexStatusFilter`) gets that scope inline too, so a grouped
  //    review renders the same subset in the diff as in its comments list.
  const isCommentVisibleForRender = useCallback((comment) => {
    if (commentIndexGroupId && String(comment?.groupId || '') !== commentIndexGroupId) return false;
    const filterValues = normalizePlanDiffSeverityFilter(severityFilter);
    const findingStatus = getReviewFindingStatus(comment);
    const isResolved = ['accepted', 'dismissed', 'deleted'].includes(findingStatus);
    const isReplied = !isResolved && typeof comment?.userReply === 'string' && comment.userReply.trim().length > 0;
    if (commentIndexStatusFilter === 'unresolved' && isResolved) return false;
    if (commentIndexStatusFilter === 'resolved' && !isResolved) return false;
    if (commentIndexStatusFilter === 'replied' && !isReplied) return false;
    if (REVIEW_FINDING_STATUS_IDS.includes(commentIndexStatusFilter) && findingStatus !== commentIndexStatusFilter) return false;
    if (isResolved) {
      if (filterValues.includes('resolved')) return true;
      return !isCommentEntryHidden(comment);
    }
    if (isCommentEntryHidden(comment)) return false;
    if (filterValues.length === 1 && filterValues.includes('resolved')) return false;
    const sev = (comment && typeof comment === 'object' && typeof comment.severity === 'string')
      ? comment.severity.toLowerCase()
      : '';
    return filterValues.includes(sev || PLAN_DIFF_UNCLASSIFIED_FILTER);
  }, [commentIndexGroupId, commentIndexStatusFilter, severityFilter]);
  const isCommentMatchingIndexFilter = useCallback((comment) => {
    if (commentIndexGroupId && String(comment?.groupId || '') !== commentIndexGroupId) return false;
    const filterValues = normalizePlanDiffSeverityFilter(severityFilter);
    const findingStatus = getReviewFindingStatus(comment);
    const isResolved = ['accepted', 'dismissed', 'deleted'].includes(findingStatus);
    const isReplied = !isResolved && typeof comment?.userReply === 'string' && comment.userReply.trim().length > 0;
    if (commentIndexStatusFilter === 'unresolved' && isResolved) return false;
    if (commentIndexStatusFilter === 'resolved' && !isResolved) return false;
    if (commentIndexStatusFilter === 'replied' && !isReplied) return false;
    if (REVIEW_FINDING_STATUS_IDS.includes(commentIndexStatusFilter) && findingStatus !== commentIndexStatusFilter) return false;
    if (isResolved) {
      if (filterValues.includes('resolved')) return true;
      const sev = (comment && typeof comment === 'object' && typeof comment.severity === 'string')
        ? comment.severity.toLowerCase()
        : '';
      return filterValues.includes(sev || PLAN_DIFF_UNCLASSIFIED_FILTER);
    }
    if (filterValues.length === 1 && filterValues.includes('resolved')) return false;
    const sev = (comment && typeof comment === 'object' && typeof comment.severity === 'string')
      ? comment.severity.toLowerCase()
      : '';
    return filterValues.includes(sev || PLAN_DIFF_UNCLASSIFIED_FILTER);
  }, [commentIndexGroupId, commentIndexStatusFilter, severityFilter]);
  const isCommentHiddenForRender = useCallback(
    (comment) => !isCommentVisibleForRender(comment),
    [isCommentVisibleForRender],
  );
  const onDiffCommentsChangeRef = useRef(onDiffCommentsChange);
  const onUiStateChangeRef = useRef(onUiStateChange);
  const displayRows = useMemo(
    () => orderPlanDiffRowsForDisplay(diffData?.rows ?? []),
    [diffData?.rows],
  );
  const contextSelectionRangesByRowId = useMemo(() => {
    const rowsById = new Map((diffData?.rows ?? []).map((row) => [row.id, row]));
    const rangesByRowId = new Map();
    contextSelections.forEach((selection) => {
      const rowIds = (Array.isArray(selection?.rowIds) ? selection.rowIds : [])
        .filter((rowId) => rowsById.has(rowId));
      if (rowIds.length === 0) return;

      const selectedText = String(selection?.selectedText ?? '').replace(/\r\n?/g, '\n');
      const selectedLines = selectedText.split('\n');
      rowIds.forEach((rowId, rowIndex) => {
        const row = rowsById.get(rowId);
        const rowText = (row.fragments ?? [{ text: row.text || ' ' }])
          .map((fragment) => fragment.text || ' ')
          .join('');
        const candidate = rowIds.length === 1
          ? selectedText
          : (selectedLines.length === rowIds.length ? selectedLines[rowIndex] : null);
        const trimmedCandidate = candidate?.trim() ?? '';
        let start = candidate ? rowText.indexOf(candidate) : -1;
        let matchedText = candidate;
        if (start < 0 && trimmedCandidate) {
          start = rowText.indexOf(trimmedCandidate);
          matchedText = trimmedCandidate;
        }
        if (start < 0 || !matchedText) {
          start = 0;
          matchedText = rowText;
        }

        const ranges = rangesByRowId.get(rowId) ?? [];
        ranges.push({
          start,
          end: Math.max(start + matchedText.length, start + 1),
          chatTitle: selection?.contextChatTitle || 'New Chat',
        });
        rangesByRowId.set(rowId, ranges);
      });
    });
    return rangesByRowId;
  }, [contextSelections, diffData?.rows]);
  const normalizedUiState = useMemo(
    () => normalizePlanDiffUiState(uiState),
    [uiState],
  );
  const initialDiffCommentsSignature = JSON.stringify(normalizeDiffCommentsState(initialDiffComments));
  const documentDiffCommentsSignature = JSON.stringify(normalizeDiffCommentsState(documentDiffComments));
  const normalizedInitialDiffComments = useMemo(
    () => normalizeDiffCommentsState(initialDiffComments),
    [initialDiffCommentsSignature],
  );
  const normalizedDocumentDiffComments = useMemo(
    () => normalizeDiffCommentsState(documentDiffComments),
    [documentDiffCommentsSignature],
  );
  const normalizedCommentSessions = useMemo(
    () => normalizeCommentSessions(commentSessions),
    [JSON.stringify(commentSessions)],
  );
  const hasExternalUiState = useMemo(
    () => Boolean(uiState && typeof uiState === 'object' && Object.keys(uiState).length > 0),
    [uiState],
  );
  const initialActiveRowId = normalizedUiState.activeRowId || diffData?.focusRowId || null;
  const initialCaretRowId = normalizedUiState.caretState.rowId || initialActiveRowId;
  const [activeRowId, setActiveRowId] = useState(initialActiveRowId);
  const [commentRowId, setCommentRowId] = useState(normalizedUiState.commentRowId);
  const [commentValue, setCommentValue] = useState(normalizedUiState.commentValue);
  const [commentEditingIndex, setCommentEditingIndex] = useState(normalizedUiState.commentEditingIndex);
  const [commentEditingSource, setCommentEditingSource] = useState('diff');
  const [commentEditingTargetChatId, setCommentEditingTargetChatId] = useState(null);
  const [diffComments, setDiffComments] = useState(() => normalizedInitialDiffComments);
  const [caretState, setCaretState] = useState({
    rowId: initialCaretRowId,
    left: normalizedUiState.caretState.left,
  });
  const [caretKey, setCaretKey] = useState(0);
  const [gutterContextMenu, setGutterContextMenu] = useState(null);
  const [preserveSelectionCommentRowId, setPreserveSelectionCommentRowId] = useState(null);
  const [commentFooterMetaLabel, setCommentFooterMetaLabel] = useState('');
  const [commentTargetRowIds, setCommentTargetRowIds] = useState([]);
  const [commentTargetHasSelection, setCommentTargetHasSelection] = useState(
    Boolean(normalizedUiState.commentTargetHasSelection) || normalizedUiState.commentTargetRowIds.length > 1,
  );
  const [asideReplyComposerKey, setAsideReplyComposerKey] = useState(null);
  const [asideReplyDrafts, setAsideReplyDrafts] = useState({});
  const [asideProcessingCommentKey, setAsideProcessingCommentKey] = useState(null);
  const [expandedAsideCodeKeys, setExpandedAsideCodeKeys] = useState(() => new Set());
  const [collapsedAsideCodeKeys, setCollapsedAsideCodeKeys] = useState(() => new Set());
  const [submittedExpandedCommentRowIds, setSubmittedExpandedCommentRowIds] = useState(() => new Set());
  const [shortcutHintPosition, setShortcutHintPosition] = useState(null);
  const preservedSelectionSnapshotRef = useRef(null);
  const preservedSelectionTargetRowIdsRef = useRef([]);
  const latestSelectionSnapshotRef = useRef(null);
  const latestSelectionTargetRowIdsRef = useRef([]);
  const latestTextareaSelectionTargetRowIdsRef = useRef([]);
  const pointerSelectionRef = useRef(null);
  const lastExternalCommentRequestNonceRef = useRef(null);
  const pendingCommentRowIdSet = useMemo(
    () => new Set(Array.isArray(pendingCommentRowIds) ? pendingCommentRowIds : []),
    [pendingCommentRowIds],
  );
  const diffResetKey = JSON.stringify({
    title: diffData?.title ?? '',
    focusRowId: diffData?.focusRowId ?? null,
    rows: (diffData?.rows ?? []).map((row) => row.id),
  });
  const previousDiffResetKeyRef = useRef(diffResetKey);

  useEffect(() => {
    onDiffCommentsChangeRef.current = onDiffCommentsChange;
  }, [onDiffCommentsChange]);

  useEffect(() => {
    onInlineCommentOpenChange?.(Boolean(commentRowId));
    return () => onInlineCommentOpenChange?.(false);
  }, [commentRowId, onInlineCommentOpenChange]);

  const commitDiffComments = (nextComments, metadata = null) => {
    const normalizedComments = normalizeDiffCommentsState(nextComments);
    setDiffComments(normalizedComments);
    onDiffCommentsChangeRef.current?.(normalizedComments, metadata ?? undefined);
    return normalizedComments;
  };

  const clearNativeEditorSelection = () => {
    if (typeof window !== 'undefined') {
      window.getSelection()?.removeAllRanges();
    }
    if (typeof document === 'undefined') return;

    const editorEl = scrollRef.current?.closest('.editor');
    const rootEl = editorEl ?? scrollRef.current;
    if (!(rootEl instanceof HTMLElement)) return;

    Array.from(rootEl.querySelectorAll('.pce-textarea')).forEach((node) => {
      if (!(node instanceof HTMLTextAreaElement)) return;
      const caretPosition = node.selectionEnd ?? node.selectionStart ?? 0;
      node.setSelectionRange(caretPosition, caretPosition);
    });
  };

  const clearCommentComposeState = (nextActiveRowId = activeRowId) => {
    clearNativeEditorSelection();
    setCommentRowId(null);
    setCommentValue('');
    setCommentEditingIndex(null);
    setCommentEditingSource('diff');
    setCommentEditingTargetChatId(null);
    setPreserveSelectionCommentRowId(null);
    setCommentFooterMetaLabel('');
    setCommentTargetRowIds([]);
    setCommentTargetHasSelection(false);
    preservedSelectionSnapshotRef.current = null;
    preservedSelectionTargetRowIdsRef.current = [];
    latestSelectionSnapshotRef.current = null;
    latestSelectionTargetRowIdsRef.current = [];
    latestTextareaSelectionTargetRowIdsRef.current = [];
    pointerSelectionRef.current = null;
    onUiStateChangeRef.current?.({
      activeRowId: nextActiveRowId,
      commentRowId: null,
      commentValue: '',
      commentEditingIndex: null,
      commentTargetRowIds: [],
      commentTargetHasSelection: false,
      commentFooterMetaLabel: '',
      caretState,
    });
  };

  const setCommentEntryHidden = (comment, hidden) => (
    comment && typeof comment === 'object'
      ? { ...comment, hidden }
      : { text: getCommentEntryText(comment), hidden }
  );

  const setRowCommentsHidden = (commentsState, rowId, hidden, index = null) => {
    const existing = commentsState[rowId] ?? [];
    return normalizeDiffCommentsState({
      ...commentsState,
      [rowId]: existing.map((comment, commentIndex) => (
        Number.isInteger(index) && commentIndex !== index
          ? comment
          : setCommentEntryHidden(comment, hidden)
      )),
    });
  };

  const setAllCommentsHidden = (commentsState, hidden) => {
    const normalizedState = normalizeDiffCommentsState(commentsState);
    return normalizeDiffCommentsState(Object.entries(normalizedState).reduce((nextState, [rowId, comments]) => ({
      ...nextState,
      [rowId]: comments.map((comment) => setCommentEntryHidden(comment, hidden)),
    }), {}));
  };

  const hasCommentEntries = (commentsState) => (
    Object.values(normalizeDiffCommentsState(commentsState)).some((comments) => comments.length > 0)
  );

  const hideAllCommentsForDocument = () => {
    if (commentsReadOnly) return;

    if (hasCommentEntries(diffComments)) {
      commitDiffComments(setAllCommentsHidden(diffComments, true), {
        isEditing: true,
        hideAll: true,
      });
    }

    if (hasCommentEntries(normalizedDocumentDiffComments)) {
      onDiffCommentsChangeRef.current?.(setAllCommentsHidden(normalizedDocumentDiffComments, true), {
        attachMode: 'document',
        isEditing: true,
        hideAll: true,
      });
    }

    normalizedCommentSessions.forEach((session) => {
      if (!hasCommentEntries(session.comments)) return;
      onDiffCommentsChangeRef.current?.(setAllCommentsHidden(session.comments, true), {
        attachMode: 'current',
        targetChatId: session.chatId,
        isEditing: true,
        hideAll: true,
      });
    });

    clearCommentComposeState();
  };

  const revealHiddenCommentsForRow = (rowId) => {
    if (!rowId) return false;
    let didReveal = false;

    const hasHiddenLocalComments = (diffComments[rowId] ?? []).some(isCommentEntryHidden);
    if (hasHiddenLocalComments) {
      didReveal = true;
      commitDiffComments(setRowCommentsHidden(diffComments, rowId, false), {
        rowId,
        isEditing: true,
        revealHidden: true,
      });
    }

    const hasHiddenDocumentComments = (normalizedDocumentDiffComments[rowId] ?? []).some(isCommentEntryHidden);
    if (hasHiddenDocumentComments) {
      didReveal = true;
      onDiffCommentsChangeRef.current?.(setRowCommentsHidden(normalizedDocumentDiffComments, rowId, false), {
        attachMode: 'document',
        rowId,
        isEditing: true,
        revealHidden: true,
      });
    }

    normalizedCommentSessions.forEach((session) => {
      if (!(session.comments[rowId] ?? []).some(isCommentEntryHidden)) return;
      didReveal = true;
      onDiffCommentsChangeRef.current?.(setRowCommentsHidden(session.comments, rowId, false), {
        attachMode: 'current',
        targetChatId: session.chatId,
        rowId,
        isEditing: true,
        revealHidden: true,
      });
    });

    return didReveal;
  };

  useEffect(() => {
    onUiStateChangeRef.current = onUiStateChange;
  }, [onUiStateChange]);

  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

  const updateShortcutHintPosition = useCallback(() => {
    if (!commentShortcutHintRowId || typeof window === 'undefined' || typeof document === 'undefined') {
      setShortcutHintPosition(null);
      return;
    }

    const anchor = scrollRef.current?.querySelector('[data-comment-shortcut-anchor="true"]');
    if (!anchor) {
      setShortcutHintPosition(null);
      return;
    }

    const rect = anchor.getBoundingClientRect();
    const tooltipWidth = 231;
    const tooltipHeight = 72;
    const viewportPadding = 12;
    const anchorCenterX = rect.left + rect.width / 2;
    const anchorCenterY = rect.top + rect.height / 2;
    const preferredLeft = anchorCenterX - 18;
    const preferredTop = rect.top - tooltipHeight - 10;
    const fallbackTop = rect.bottom + 10;
    const nextLeft = clamp(preferredLeft, viewportPadding, window.innerWidth - tooltipWidth - viewportPadding);
    const placement = preferredTop >= viewportPadding ? 'above' : 'below';
    const nextTop = clamp(
      placement === 'above' ? preferredTop : fallbackTop,
      viewportPadding,
      window.innerHeight - tooltipHeight - viewportPadding,
    );
    const nextArrowX = clamp(anchorCenterX - nextLeft, 16, tooltipWidth - 16);

    setShortcutHintPosition((prev) => {
      if (
        prev
        && Math.abs(prev.left - nextLeft) < 0.5
        && Math.abs(prev.top - nextTop) < 0.5
        && Math.abs(prev.arrowX - nextArrowX) < 0.5
        && prev.placement === placement
      ) {
        return prev;
      }

      return {
        left: nextLeft,
        top: nextTop,
        arrowX: nextArrowX,
        placement,
      };
    });
  }, [clamp, commentShortcutHintRowId]);

  useLayoutEffect(() => {
    updateShortcutHintPosition();
    if (!commentShortcutHintRowId || typeof window === 'undefined') return undefined;

    const scrollEl = scrollRef.current;
    const handlePositionChange = () => {
      window.requestAnimationFrame(updateShortcutHintPosition);
    };

    window.addEventListener('resize', handlePositionChange);
    window.addEventListener('scroll', handlePositionChange, true);
    scrollEl?.addEventListener('scroll', handlePositionChange);

    return () => {
      window.removeEventListener('resize', handlePositionChange);
      window.removeEventListener('scroll', handlePositionChange, true);
      scrollEl?.removeEventListener('scroll', handlePositionChange);
    };
  }, [commentShortcutHintRowId, updateShortcutHintPosition]);

  const resolveCaretLeft = (codeEl, clientX = null) => {
    if (!(codeEl instanceof HTMLElement)) {
      return PLAN_DIFF_DEFAULT_CARET_LEFT;
    }

    const codeRect = codeEl.getBoundingClientRect();
    const codeStyle = window.getComputedStyle(codeEl);
    const paddingLeft = Number.parseFloat(codeStyle.paddingLeft) || PLAN_DIFF_DEFAULT_CARET_LEFT;
    const textEl = codeEl.querySelector('.plan-diff-row-code-text');

    if (!(textEl instanceof HTMLElement) || clientX === null) {
      return paddingLeft;
    }

    const textRect = textEl.getBoundingClientRect();
    const textContent = textEl.textContent ?? '';

    if (!textContent.length || textRect.width <= 0) {
      return paddingLeft;
    }

    const relativeTextStart = textRect.left - codeRect.left;
    const charWidth = textRect.width / textContent.length;
    const column = clamp(
      Math.round((clientX - textRect.left) / charWidth),
      0,
      textContent.length,
    );

    return clamp(
      relativeTextStart + (column * charWidth),
      paddingLeft,
      relativeTextStart + (textContent.length * charWidth),
    );
  };

  const activateRow = (rowId, codeEl = null, clientX = null) => {
    setActiveRowId(rowId);
    setCaretState({
      rowId,
      left: resolveCaretLeft(codeEl, clientX),
    });
    setCaretKey((prev) => prev + 1);
  };

  const getDiffRowLineNumber = useCallback((row) => {
    if (!row) return null;
    const normalizeLineNumber = (value) => {
      if (value === null || value === undefined || value === '') return null;
      const lineNumber = Number(value);
      return Number.isInteger(lineNumber) && lineNumber > 0 ? lineNumber : null;
    };
    return normalizeLineNumber(row.newNumber) ?? normalizeLineNumber(row.oldNumber);
  }, []);

  const getDiffCommentLineLabelForRowIds = useCallback((rowIds = [], fallbackRowId = null) => {
    const normalizedRowIds = Array.isArray(rowIds) && rowIds.length > 0
      ? rowIds
      : (fallbackRowId ? [fallbackRowId] : []);
    const rowById = new Map(displayRows.map((displayRow) => [displayRow.id, displayRow]));
    const lineNumbers = normalizedRowIds.map((rowId) => getDiffRowLineNumber(rowById.get(rowId)));

    return formatCommentLineLabel(lineNumbers);
  }, [displayRows, getDiffRowLineNumber]);

  const getDiffCommentFooterMetaLabel = useCallback((rowId, selectionSnapshot = null) => {
    const fallbackRow = displayRows.find((row) => row.id === rowId);
    const fallbackLineNumber = getDiffRowLineNumber(fallbackRow);
    const fallbackLabel = formatCommentLineLabel([fallbackLineNumber]);

    if (selectionSnapshot?.type === 'textarea') {
      const lineRange = getTextareaSelectionLineRange(selectionSnapshot);
      if (!lineRange) return fallbackLabel;

      const selectedLineNumbers = displayRows
        .slice(Math.max(0, lineRange.startLineNumber - 1), Math.max(0, lineRange.endLineNumber))
        .map((displayRow) => getDiffRowLineNumber(displayRow));

      return formatCommentLineLabel(selectedLineNumbers) || getTextareaSelectionCommentLineLabel(selectionSnapshot) || fallbackLabel;
    }

    if (selectionSnapshot?.type !== 'range' || !selectionSnapshot.range || !scrollRef.current) {
      return fallbackLabel;
    }

    const selectedLineNumbers = [];
    const rowNumberById = new Map(displayRows.map((row) => [row.id, getDiffRowLineNumber(row)]));
    const rowElements = Array.from(scrollRef.current.querySelectorAll('.plan-diff-row[data-diff-row-id]'));

    rowElements.forEach((rowElement) => {
      if (!(rowElement instanceof HTMLElement)) return;
      const rowIdFromElement = rowElement.dataset.diffRowId;
      if (!rowIdFromElement) return;

      const targetElement = rowElement.querySelector('.plan-diff-row-code') ?? rowElement;
      try {
        if (selectionSnapshot.range.intersectsNode(targetElement)) {
          selectedLineNumbers.push(rowNumberById.get(rowIdFromElement));
        }
      } catch {
        // The stored Range can become detached if the diff rerenders between mouse events.
      }
    });

    return formatCommentLineLabel(selectedLineNumbers) || fallbackLabel;
  }, [displayRows, getDiffRowLineNumber]);

  const getDiffCommentTargetRowIds = useCallback((rowId, selectionSnapshot = null) => {
    const fallbackRowIds = rowId ? [rowId] : [];

    if (selectionSnapshot?.type === 'textarea') {
      const lineRange = getTextareaSelectionLineRange(selectionSnapshot);
      if (!lineRange) return fallbackRowIds;

      const selectedRowIds = displayRows
        .slice(Math.max(0, lineRange.startLineNumber - 1), Math.max(0, lineRange.endLineNumber))
        .filter((displayRow) => Number.isFinite(getDiffRowLineNumber(displayRow)))
        .map((displayRow) => displayRow.id);

      return selectedRowIds.length > 0 ? selectedRowIds : fallbackRowIds;
    }

    if (selectionSnapshot?.type !== 'range' || !selectionSnapshot.range || !scrollRef.current) {
      return fallbackRowIds;
    }

    const selectedRowIds = [];
    const rowElements = Array.from(scrollRef.current.querySelectorAll('.plan-diff-row[data-diff-row-id]'));
    rowElements.forEach((rowElement) => {
      if (!(rowElement instanceof HTMLElement)) return;

      const rowIdFromElement = rowElement.dataset.diffRowId;
      if (!rowIdFromElement) return;

      const targetElement = rowElement.querySelector('.plan-diff-row-code') ?? rowElement;
      try {
        if (selectionSnapshot.range.intersectsNode(targetElement)) {
          selectedRowIds.push(rowIdFromElement);
        }
      } catch {
        // The stored Range can become detached if the diff rerenders between mouse events.
      }
    });

    return selectedRowIds.length > 0 ? selectedRowIds : fallbackRowIds;
  }, [displayRows, getDiffRowLineNumber]);

  const getDiffCommentAnchorRowId = useCallback((fallbackRowId, targetRowIds = []) => {
    if (!Array.isArray(targetRowIds) || targetRowIds.length <= 1) {
      return fallbackRowId;
    }

    const targetRowIdSet = new Set(targetRowIds);
    const orderedTargetRowIds = displayRows
      .filter((displayRow) => targetRowIdSet.has(displayRow.id))
      .map((displayRow) => displayRow.id);

    return orderedTargetRowIds[orderedTargetRowIds.length - 1] ?? fallbackRowId;
  }, [displayRows]);

  const getDiffRowRangeIds = useCallback((startRowId, endRowId) => {
    if (!startRowId || !endRowId) return [];

    const startIndex = displayRows.findIndex((displayRow) => displayRow.id === startRowId);
    const endIndex = displayRows.findIndex((displayRow) => displayRow.id === endRowId);
    if (startIndex < 0 || endIndex < 0) return [];

    const fromIndex = Math.min(startIndex, endIndex);
    const toIndex = Math.max(startIndex, endIndex);

    return displayRows
      .slice(fromIndex, toIndex + 1)
      .filter((displayRow) => Number.isFinite(getDiffRowLineNumber(displayRow)))
      .map((displayRow) => displayRow.id);
  }, [displayRows, getDiffRowLineNumber]);

  const getDiffCommentRowIdsForLineLabel = useCallback((lineLabel = '') => {
    const normalizedLineLabel = typeof lineLabel === 'string' ? lineLabel.trim() : '';
    if (!normalizedLineLabel) return [];

    const rangeMatch = normalizedLineLabel.match(/^(?:AI Notes|Comments) on lines (\d+) to (\d+)$/u);
    const singleMatch = normalizedLineLabel.match(/^(?:AI Note|Comment) on line (\d+)$/u);
    const startLineNumber = rangeMatch ? Number(rangeMatch[1]) : (singleMatch ? Number(singleMatch[1]) : null);
    const endLineNumber = rangeMatch ? Number(rangeMatch[2]) : startLineNumber;
    if (!Number.isInteger(startLineNumber) || !Number.isInteger(endLineNumber)) return [];

    const fromLineNumber = Math.min(startLineNumber, endLineNumber);
    const toLineNumber = Math.max(startLineNumber, endLineNumber);

    return displayRows
      .filter((displayRow) => {
        const lineNumber = getDiffRowLineNumber(displayRow);
        return Number.isInteger(lineNumber) && lineNumber >= fromLineNumber && lineNumber <= toLineNumber;
      })
      .map((displayRow) => displayRow.id);
  }, [displayRows, getDiffRowLineNumber]);

  const getDiffCommentTargetRowIdsForComment = useCallback((comment = null, fallbackRowId = null) => {
    const storedRowIds = getCommentEntryRowIds(comment);
    if (storedRowIds.length > 0) {
      const storedRowIdSet = new Set(storedRowIds);
      const orderedStoredRowIds = displayRows
        .filter((displayRow) => storedRowIdSet.has(displayRow.id))
        .map((displayRow) => displayRow.id);
      if (orderedStoredRowIds.length > 0) return orderedStoredRowIds;
    }

    const rowIdsFromLineLabel = getDiffCommentRowIdsForLineLabel(getCommentEntryLineLabel(comment));
    if (rowIdsFromLineLabel.length > 0) return rowIdsFromLineLabel;

    return fallbackRowId ? [fallbackRowId] : [];
  }, [displayRows, getDiffCommentRowIdsForLineLabel]);

  const getTextareaSelectionTargetRowIds = useCallback((textarea = null) => {
    if (!(textarea instanceof HTMLTextAreaElement)) return [];

    const start = textarea.selectionStart ?? 0;
    const end = textarea.selectionEnd ?? 0;
    if (start === end) return [];

    const lineRange = getTextareaSelectionLineRange({
      type: 'textarea',
      element: textarea,
      start,
      end,
      direction: textarea.selectionDirection ?? 'none',
    });
    if (!lineRange) return [];

    return displayRows
      .slice(Math.max(0, lineRange.startLineNumber - 1), Math.max(0, lineRange.endLineNumber))
      .filter((displayRow) => Number.isFinite(getDiffRowLineNumber(displayRow)))
      .map((displayRow) => displayRow.id);
  }, [displayRows, getDiffRowLineNumber]);

  const getVisibleEditorTextareas = useCallback(() => {
    const editorEl = scrollRef.current?.closest('.editor');
    const rootEl = editorEl ?? scrollRef.current;
    if (!(rootEl instanceof HTMLElement)) return [];

    return Array.from(rootEl.querySelectorAll('.pce-textarea'))
      .filter((node) => node instanceof HTMLTextAreaElement);
  }, []);

  const captureTextareaSelectionTargetRowIds = useCallback(() => {
    const textareas = getVisibleEditorTextareas();
    const activeTextarea = document.activeElement instanceof HTMLTextAreaElement
      && textareas.includes(document.activeElement)
      ? document.activeElement
      : null;
    const orderedTextareas = activeTextarea
      ? [activeTextarea, ...textareas.filter((textarea) => textarea !== activeTextarea)]
      : textareas;

    for (const textarea of orderedTextareas) {
      const rowIds = getTextareaSelectionTargetRowIds(textarea);
      if (rowIds.length > 0) return rowIds;
    }

    return [];
  }, [getTextareaSelectionTargetRowIds, getVisibleEditorTextareas]);

  const getDiffRowIdAtViewportPoint = useCallback((clientX, clientY) => {
    const scrollEl = scrollRef.current;
    if (!(scrollEl instanceof HTMLElement)) return null;

    const scrollRect = scrollEl.getBoundingClientRect();
    if (
      clientX < scrollRect.left
      || clientX > scrollRect.right
      || clientY < scrollRect.top
      || clientY > scrollRect.bottom
    ) {
      return null;
    }

    const rowElements = Array.from(scrollEl.querySelectorAll('.plan-diff-row[data-diff-row-id]'));
    for (const rowElement of rowElements) {
      if (!(rowElement instanceof HTMLElement)) continue;
      const rect = rowElement.getBoundingClientRect();
      if (clientY >= rect.top && clientY <= rect.bottom) {
        return rowElement.dataset.diffRowId || null;
      }
    }

    return null;
  }, []);

  const captureCommentSelectionSnapshot = useCallback(() => {
    const activeSnapshot = captureActiveSelectionSnapshot();
    if (activeSnapshot) return activeSnapshot;

    const selection = typeof window !== 'undefined' ? window.getSelection() : null;
    if (selection && !selection.isCollapsed && selection.rangeCount > 0 && scrollRef.current) {
      const range = selection.getRangeAt(0);
      const selectedOverlayRowCount = Array.from(scrollRef.current.querySelectorAll('.plan-diff-row[data-diff-row-id]'))
        .reduce((count, rowElement) => {
          if (!(rowElement instanceof HTMLElement)) return count;
          const targetElement = rowElement.querySelector('.plan-diff-row-code') ?? rowElement;
          try {
            return range.intersectsNode(targetElement) ? count + 1 : count;
          } catch {
            return count;
          }
        }, 0);

      if (selectedOverlayRowCount > 0) {
        return {
          type: 'range',
          range: range.cloneRange(),
        };
      }
    }

    const editorEl = scrollRef.current?.closest('.editor');
    const textarea = editorEl?.querySelector('.pce-textarea');
    if (!(textarea instanceof HTMLTextAreaElement)) return null;

    const start = textarea.selectionStart ?? 0;
    const end = textarea.selectionEnd ?? 0;
    const normalizedStart = Math.min(start, end);
    const normalizedEnd = Math.max(start, end);
    if (normalizedStart === normalizedEnd) return null;

    return {
      type: 'textarea',
      element: textarea,
      start,
      end,
      direction: textarea.selectionDirection ?? 'none',
    };
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined' || typeof window === 'undefined') return undefined;

    let frameId = 0;

    const syncLatestSelectionSnapshot = () => {
      frameId = 0;
      const snapshot = captureCommentSelectionSnapshot();
      if (snapshot) {
        latestSelectionSnapshotRef.current = snapshot;
      }
      const textareaTargetRowIds = captureTextareaSelectionTargetRowIds();
      if (textareaTargetRowIds.length > 0) {
        latestTextareaSelectionTargetRowIdsRef.current = textareaTargetRowIds;
      }
    };

    const scheduleSync = () => {
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }
      frameId = window.requestAnimationFrame(syncLatestSelectionSnapshot);
    };

    document.addEventListener('selectionchange', scheduleSync);
    document.addEventListener('select', scheduleSync, true);
    window.addEventListener('mouseup', scheduleSync);
    window.addEventListener('keyup', scheduleSync);

    return () => {
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }
      document.removeEventListener('selectionchange', scheduleSync);
      document.removeEventListener('select', scheduleSync, true);
      window.removeEventListener('mouseup', scheduleSync);
      window.removeEventListener('keyup', scheduleSync);
    };
  }, [captureCommentSelectionSnapshot, captureTextareaSelectionTargetRowIds]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const finishPointerSelection = (event) => {
      const pointerSelection = pointerSelectionRef.current;
      pointerSelectionRef.current = null;
      const nativeSelection = window.getSelection();
      const nativeSelectionText =
        nativeSelection && !nativeSelection.isCollapsed && nativeSelection.rangeCount > 0
          ? nativeSelection.toString().trim()
          : '';
      const nativeRange = nativeSelectionText ? nativeSelection.getRangeAt(0) : null;
      const nativeRowIds = nativeRange
        ? Array.from(scrollRef.current?.querySelectorAll('.plan-diff-row[data-diff-row-id]') ?? [])
          .filter((rowElement) => {
            const codeElement = rowElement.querySelector('.plan-diff-row-code-text');
            if (!(codeElement instanceof HTMLElement)) return false;
            try {
              return nativeRange.intersectsNode(codeElement);
            } catch {
              return false;
            }
          })
          .map((rowElement) => rowElement.dataset.diffRowId)
          .filter(Boolean)
        : [];
      const selectedRowIds = nativeRowIds.length > 0
        ? nativeRowIds
        : (pointerSelection?.rowIds ?? []);
      if (selectedRowIds.length === 0) return;
      latestSelectionTargetRowIdsRef.current = selectedRowIds;
      const pointerDistance = pointerSelection?.startPoint
        ? Math.hypot(
            event.clientX - pointerSelection.startPoint.x,
            event.clientY - pointerSelection.startPoint.y,
          )
        : 0;
      if (pointerDistance < 4 && !nativeSelectionText) {
        onTextSelectionChange?.(null);
        return;
      }

      const selectedRows = selectedRowIds
        .map((rowId) => diffData.rows.find((row) => row.id === rowId))
        .filter(Boolean);
      const selectedElements = selectedRowIds
        .map((rowId) => scrollRef.current?.querySelector(`[data-diff-row-id="${CSS.escape(rowId)}"] .plan-diff-row-code-text`))
        .filter((element) => element instanceof HTMLElement);
      if (selectedRows.length === 0 || selectedElements.length === 0) return;

      const nativeRects = nativeRange
        ? Array.from(nativeRange.getClientRects()).filter((rect) => rect.width > 0 || rect.height > 0)
        : [];
      const bounds = (nativeRects.length > 0 ? nativeRects : selectedElements).reduce((acc, elementOrRect) => {
        const rect = elementOrRect instanceof Element
          ? elementOrRect.getBoundingClientRect()
          : elementOrRect;
        return {
          top: Math.min(acc.top, rect.top),
          right: Math.max(acc.right, rect.right),
          bottom: Math.max(acc.bottom, rect.bottom),
          left: Math.min(acc.left, rect.left),
        };
      }, {
        top: Number.POSITIVE_INFINITY,
        right: Number.NEGATIVE_INFINITY,
        bottom: Number.NEGATIVE_INFINITY,
        left: Number.POSITIVE_INFINITY,
      });
      onTextSelectionChange?.({
        rect: {
          ...bounds,
          width: bounds.right - bounds.left,
          height: bounds.bottom - bounds.top,
        },
        point: { x: event.clientX, y: event.clientY },
        rowId: selectedRowIds[0],
        rowIds: selectedRowIds,
        selectedText: nativeSelectionText || selectedRows.map((row) => row.text || '').join('\n').trim(),
      });
    };

    window.addEventListener('mouseup', finishPointerSelection);

    return () => {
      window.removeEventListener('mouseup', finishPointerSelection);
    };
  }, [diffData.rows, onTextSelectionChange]);

  const trackPointerSelectionRow = useCallback((rowId, { start = false, point = null } = {}) => {
    if (!rowId) return;

    const currentPointerSelection = pointerSelectionRef.current;
    if (start || !currentPointerSelection) {
      const rowIds = getDiffRowRangeIds(rowId, rowId);
      latestSelectionSnapshotRef.current = null;
      latestTextareaSelectionTargetRowIdsRef.current = [];
      pointerSelectionRef.current = {
        startRowId: rowId,
        currentRowId: rowId,
        rowIds,
        startPoint: point,
      };
      latestSelectionTargetRowIdsRef.current = rowIds;
      return;
    }

    const rowIds = getDiffRowRangeIds(currentPointerSelection.startRowId, rowId);
    pointerSelectionRef.current = {
      ...currentPointerSelection,
      currentRowId: rowId,
      rowIds,
    };
    latestSelectionTargetRowIdsRef.current = rowIds;
  }, [getDiffRowRangeIds]);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;

    const shouldIgnorePointerTarget = (target) => (
      target instanceof Element
      && Boolean(target.closest('.plan-diff-gutter-icon-slot, button, [role="menu"], .popup, .cmp-popup'))
    );

    const handlePointerMouseDown = (event) => {
      if (event.button !== 0 || shouldIgnorePointerTarget(event.target)) return;

      const rowId = getDiffRowIdAtViewportPoint(event.clientX, event.clientY);
      if (!rowId) return;

      onTextSelectionChange?.(null);
      trackPointerSelectionRow(rowId, {
        start: true,
        point: { x: event.clientX, y: event.clientY },
      });
    };

    const handlePointerMouseMove = (event) => {
      if ((event.buttons & 1) !== 1 || !pointerSelectionRef.current) return;

      const rowId = getDiffRowIdAtViewportPoint(event.clientX, event.clientY);
      if (!rowId) return;

      trackPointerSelectionRow(rowId);
    };

    const handlePointerMouseUp = (event) => {
      if (!pointerSelectionRef.current) return;

      const rowId = getDiffRowIdAtViewportPoint(event.clientX, event.clientY);
      if (rowId) {
        trackPointerSelectionRow(rowId);
      }
    };

    document.addEventListener('mousedown', handlePointerMouseDown, true);
    document.addEventListener('mousemove', handlePointerMouseMove, true);
    document.addEventListener('mouseup', handlePointerMouseUp, true);

    return () => {
      document.removeEventListener('mousedown', handlePointerMouseDown, true);
      document.removeEventListener('mousemove', handlePointerMouseMove, true);
      document.removeEventListener('mouseup', handlePointerMouseUp, true);
    };
  }, [getDiffRowIdAtViewportPoint, onTextSelectionChange, trackPointerSelectionRow]);

  const toggleCommentForRow = (rowId, { selectionSnapshot = null, targetRowIds = null, targetHasSelection = null, forceOpen = false } = {}) => {
    const resolvedSelectionSnapshot = selectionSnapshot ?? null;
    const nextTargetRowIds = Array.isArray(targetRowIds) && targetRowIds.length > 0
      ? targetRowIds
      : getDiffCommentTargetRowIds(rowId, resolvedSelectionSnapshot);
    const nextTargetHasSelection = typeof targetHasSelection === 'boolean'
      ? targetHasSelection
      : Boolean(resolvedSelectionSnapshot) || nextTargetRowIds.length > 1;
    const anchorRowId = getDiffCommentAnchorRowId(rowId, nextTargetRowIds);
    onGutterCommentToggle?.({ rowId });
    const didRevealHiddenComments = revealHiddenCommentsForRow(anchorRowId);
    activateRow(anchorRowId);
    if (!canCreateInlineComments) {
      const hasExistingCommentsForRow =
        hasCommentEntries({ [anchorRowId]: diffComments[anchorRowId] ?? [] })
        || hasCommentEntries({ [anchorRowId]: normalizedDocumentDiffComments[anchorRowId] ?? [] })
        || normalizedCommentSessions.some((session) => (session.comments[anchorRowId] ?? []).length > 0);
      if (hasExistingCommentsForRow) {
        onInlineCommentExpand?.(anchorRowId);
      }
      return;
    }
    if (didRevealHiddenComments && !forceOpen) {
      return;
    }
    if (commentRowId === anchorRowId && !forceOpen) {
      clearCommentComposeState(anchorRowId);
      return;
    }
    onTextSelectionChange?.(null);
    setCommentFooterMetaLabel(
      getDiffCommentLineLabelForRowIds(nextTargetRowIds, rowId)
      || getDiffCommentFooterMetaLabel(rowId, resolvedSelectionSnapshot)
    );
    setCommentTargetRowIds(nextTargetRowIds);
    setCommentTargetHasSelection(nextTargetHasSelection);
    setPreserveSelectionCommentRowId(resolvedSelectionSnapshot ? anchorRowId : null);
    setCommentRowId(anchorRowId);
    setCommentValue('');
    setCommentEditingIndex(null);
    setCommentEditingSource('diff');
    setCommentEditingTargetChatId(null);
  };

  const openAdditionalCommentForRow = (rowId) => {
    if (!rowId || !canCreateInlineComments) return;
    onTextSelectionChange?.(null);
    activateRow(rowId);
    setCommentFooterMetaLabel(getDiffCommentFooterMetaLabel(rowId));
    setCommentTargetRowIds([rowId]);
    setCommentTargetHasSelection(false);
    setPreserveSelectionCommentRowId(null);
    setCommentRowId(rowId);
    setCommentValue('');
    setCommentEditingIndex(null);
    setCommentEditingSource('diff');
    setCommentEditingTargetChatId(null);
    preservedSelectionSnapshotRef.current = null;
    preservedSelectionTargetRowIdsRef.current = [];
  };

  useEffect(() => {
    const requestNonce = externalCommentRequest?.nonce;
    if (!requestNonce || lastExternalCommentRequestNonceRef.current === requestNonce) {
      return;
    }

    lastExternalCommentRequestNonceRef.current = requestNonce;
    if (!canCreateInlineComments) return;

    const explicitTargetRowIds = Array.isArray(externalCommentRequest?.rowIds)
      ? externalCommentRequest.rowIds.filter((rowId) => typeof rowId === 'string' && rowId.length > 0)
      : [];
    const fallbackRowId = externalCommentRequest?.rowId ?? explicitTargetRowIds[explicitTargetRowIds.length - 1] ?? activeRowId ?? diffData?.focusRowId ?? displayRows[0]?.id ?? null;
    const capturedSelectionSnapshot = captureCommentSelectionSnapshot();
    const capturedTargetRowIds = capturedSelectionSnapshot && fallbackRowId
      ? getDiffCommentTargetRowIds(fallbackRowId, capturedSelectionSnapshot)
      : [];
    const currentTextareaTargetRowIds = captureTextareaSelectionTargetRowIds();
    const latestTextareaTargetRowIds = latestTextareaSelectionTargetRowIdsRef.current ?? [];
    const latestSelectionSnapshot = latestSelectionSnapshotRef.current;
    const latestSnapshotTargetRowIds = latestSelectionSnapshot && fallbackRowId
      ? getDiffCommentTargetRowIds(fallbackRowId, latestSelectionSnapshot)
      : [];
    const latestTargetRowIds = latestSelectionTargetRowIdsRef.current ?? [];
    const targetRowIds = explicitTargetRowIds.length > 0
      ? explicitTargetRowIds
      : currentTextareaTargetRowIds.length > 0
      ? currentTextareaTargetRowIds
      : capturedTargetRowIds.length > 0
      ? capturedTargetRowIds
      : latestTextareaTargetRowIds.length > 0
      ? latestTextareaTargetRowIds
      : latestSnapshotTargetRowIds.length > 0
      ? latestSnapshotTargetRowIds
      : latestTargetRowIds.length > 1
      ? latestTargetRowIds
      : [];
    const selectionSnapshot = capturedSelectionSnapshot
      ?? (latestSnapshotTargetRowIds.length > 0 && targetRowIds === latestSnapshotTargetRowIds ? latestSelectionSnapshot : null);
    const targetHasSelection =
      Boolean(externalCommentRequest?.targetHasSelection)
      || explicitTargetRowIds.length > 0
      || currentTextareaTargetRowIds.length > 0
      || capturedTargetRowIds.length > 0
      || latestTextareaTargetRowIds.length > 0
      || latestSnapshotTargetRowIds.length > 0
      || latestTargetRowIds.length > 1;
    const targetFallbackRowId = targetRowIds[0] ?? fallbackRowId;

    if (!targetFallbackRowId) return;

    toggleCommentForRow(targetFallbackRowId, {
      selectionSnapshot,
      targetRowIds,
      targetHasSelection,
      forceOpen: true,
    });
  }, [externalCommentRequest?.nonce]);

  const openGutterContextMenu = (event, rowId) => {
    event.preventDefault();
    event.stopPropagation();
    activateRow(rowId);
    setGutterContextMenu({
      rowId,
      point: {
        x: event.clientX,
        y: event.clientY,
      },
    });
  };

  useEffect(() => {
    if (previousDiffResetKeyRef.current === diffResetKey) {
      return;
    }

    previousDiffResetKeyRef.current = diffResetKey;
    const nextActiveRowId = normalizedUiState.activeRowId || diffData?.focusRowId || null;
    const nextCaretRowId = normalizedUiState.caretState.rowId || nextActiveRowId;
    setActiveRowId(nextActiveRowId);
    setCommentRowId(normalizedUiState.commentRowId);
    setCommentValue(normalizedUiState.commentValue);
    setCommentEditingIndex(normalizedUiState.commentEditingIndex);
    setCommentEditingSource('diff');
    setCommentEditingTargetChatId(null);
    setSubmittedExpandedCommentRowIds(new Set());
    setCommentFooterMetaLabel(normalizedUiState.commentRowId
      ? (normalizedUiState.commentFooterMetaLabel || getDiffCommentFooterMetaLabel(normalizedUiState.commentRowId))
      : '');
    setCommentTargetRowIds(normalizedUiState.commentRowId
      ? (normalizedUiState.commentTargetRowIds.length > 0 ? normalizedUiState.commentTargetRowIds : [normalizedUiState.commentRowId])
      : []);
    setCommentTargetHasSelection(Boolean(normalizedUiState.commentTargetHasSelection) || normalizedUiState.commentTargetRowIds.length > 1);
    setDiffComments(normalizedInitialDiffComments);
    setCaretState({
      rowId: nextCaretRowId,
      left: normalizedUiState.caretState.left,
    });
  }, [diffData?.focusRowId, diffResetKey, normalizedInitialDiffComments, normalizedUiState]);

  useEffect(() => {
    setGutterContextMenu(null);
  }, [diffResetKey]);

  useEffect(() => {
    setDiffComments((prev) => (
      JSON.stringify(prev) === JSON.stringify(normalizedInitialDiffComments)
        ? prev
        : normalizedInitialDiffComments
    ));
  }, [initialDiffCommentsSignature, normalizedInitialDiffComments]);

  useEffect(() => {
    if (!hasExternalUiState) {
      return;
    }

    const nextActiveRowId = normalizedUiState.activeRowId || diffData?.focusRowId || null;
    const nextCaretRowId = normalizedUiState.caretState.rowId || nextActiveRowId;

    setActiveRowId((prev) => (prev === nextActiveRowId ? prev : nextActiveRowId));
    setCommentRowId((prev) => (prev === normalizedUiState.commentRowId ? prev : normalizedUiState.commentRowId));
    setCommentValue((prev) => (prev === normalizedUiState.commentValue ? prev : normalizedUiState.commentValue));
    setCommentEditingIndex((prev) => (
      prev === normalizedUiState.commentEditingIndex ? prev : normalizedUiState.commentEditingIndex
    ));
    if (!Number.isInteger(normalizedUiState.commentEditingIndex)) {
      setCommentEditingSource('diff');
      setCommentEditingTargetChatId(null);
    }
    setCommentFooterMetaLabel((prev) => {
      if (normalizedUiState.commentRowId && normalizedUiState.commentFooterMetaLabel) {
        return prev === normalizedUiState.commentFooterMetaLabel ? prev : normalizedUiState.commentFooterMetaLabel;
      }

      if (
        normalizedUiState.commentRowId
        && commentRowId === normalizedUiState.commentRowId
        && commentTargetRowIds.length > 1
      ) {
        const preservedLabel = getDiffCommentLineLabelForRowIds(commentTargetRowIds, normalizedUiState.commentRowId);
        return preservedLabel || prev;
      }

      const nextLabel = normalizedUiState.commentRowId
        ? getDiffCommentFooterMetaLabel(normalizedUiState.commentRowId)
        : '';
      return prev === nextLabel ? prev : nextLabel;
    });
    setCommentTargetRowIds((prev) => {
      if (normalizedUiState.commentRowId && normalizedUiState.commentTargetRowIds.length > 0) {
        return JSON.stringify(prev) === JSON.stringify(normalizedUiState.commentTargetRowIds)
          ? prev
          : normalizedUiState.commentTargetRowIds;
      }

      if (
        normalizedUiState.commentRowId
        && commentRowId === normalizedUiState.commentRowId
        && prev.length > 1
      ) {
        return prev;
      }

      const nextTargetRowIds = normalizedUiState.commentRowId ? [normalizedUiState.commentRowId] : [];
      return JSON.stringify(prev) === JSON.stringify(nextTargetRowIds) ? prev : nextTargetRowIds;
    });
    setCommentTargetHasSelection((prev) => {
      const nextTargetHasSelection = Boolean(normalizedUiState.commentTargetHasSelection) || normalizedUiState.commentTargetRowIds.length > 1;
      return prev === nextTargetHasSelection ? prev : nextTargetHasSelection;
    });
    setCaretState((prev) => (
      prev.rowId === nextCaretRowId && prev.left === normalizedUiState.caretState.left
        ? prev
        : {
            rowId: nextCaretRowId,
            left: normalizedUiState.caretState.left,
          }
    ));
  }, [diffData?.focusRowId, hasExternalUiState, normalizedUiState]);

  useEffect(() => {
    onUiStateChangeRef.current?.({
      activeRowId,
      commentRowId,
      commentValue,
      commentEditingIndex,
      commentTargetRowIds,
      commentTargetHasSelection,
      commentFooterMetaLabel,
      caretState,
    });
  }, [activeRowId, caretState, commentEditingIndex, commentFooterMetaLabel, commentRowId, commentTargetHasSelection, commentTargetRowIds, commentValue]);

  useEffect(() => {
    if (!activeRowId) return undefined;

    let frameId = 0;
    frameId = requestAnimationFrame(() => {
      const rowEl = scrollRef.current?.querySelector(`[data-diff-row-id="${activeRowId}"]`);
      rowEl?.scrollIntoView({ block: 'center', inline: 'nearest' });
    });

    return () => {
      if (frameId) cancelAnimationFrame(frameId);
    };
  }, [activeRowId]);

  const commentedRowIds = useMemo(() => {
    const ids = [];
    for (const row of displayRows) {
      const hasLocal = (diffComments[row.id] ?? []).length > 0;
      const hasSession = normalizedCommentSessions.some((s) => (s.comments[row.id] ?? []).length > 0);
      if (hasLocal || hasSession) ids.push(row.id);
    }
    return ids;
  }, [diffComments, displayRows, normalizedCommentSessions]);

  const totalCommentCount = useMemo(() => {
    const localCount = Object.values(diffComments).reduce((n, arr) => n + arr.length, 0);
    const sessionCount = normalizedCommentSessions.reduce((n, s) => (
      n + Object.values(s.comments).reduce((m, arr) => m + arr.length, 0)
    ), 0);
    const mirroredSessionCount = normalizedCommentSessions.reduce((count, session) => {
      if (commentsReadOnly || session.title !== commentContextLabel) {
        return count;
      }

      return count + Object.entries(session.comments).reduce((rowCount, [rowId, sessionComments]) => {
        const rowComments = diffComments[rowId] ?? [];
        return isMirroredLocalCommentSession({
          commentsReadOnly,
          sessionTitle: session.title,
          commentContextLabel,
          sessionComments,
          rowComments,
        })
          ? rowCount + sessionComments.length
          : rowCount;
      }, 0);
    }, 0);

    return localCount + sessionCount - mirroredSessionCount;
  }, [commentContextLabel, commentsReadOnly, diffComments, normalizedCommentSessions]);
  // Single-line (plain file) views can't be side-by-side, so only 'split' falls
  // back to unified; 'aside'/'code' (comments-panel layouts) are valid for them.
  const effectiveViewMode = (singleLineNumbers && viewMode === 'split') ? 'unified' : viewMode;

  const navigateComment = useCallback((direction) => {
    if (commentedRowIds.length === 0) return;
    const currentIndex = commentedRowIds.indexOf(activeRowId);
    let nextIndex;
    if (direction > 0) {
      nextIndex = currentIndex < commentedRowIds.length - 1 ? currentIndex + 1 : 0;
    } else {
      nextIndex = currentIndex > 0 ? currentIndex - 1 : commentedRowIds.length - 1;
    }
    activateRow(commentedRowIds[nextIndex]);
  }, [activateRow, activeRowId, commentedRowIds]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.altKey && event.shiftKey && (event.code === 'KeyK' || event.key.toLowerCase() === 'k')) {
        if (!canCreateInlineComments) return;
        const selectionSnapshot = captureCommentSelectionSnapshot() ?? latestSelectionSnapshotRef.current;
        const capturedTextareaTargetRowIds = captureTextareaSelectionTargetRowIds();
        const shortcutTargetRowIds = capturedTextareaTargetRowIds.length > 0
          ? capturedTextareaTargetRowIds
          : (latestTextareaSelectionTargetRowIdsRef.current.length > 0
              ? latestTextareaSelectionTargetRowIdsRef.current
              : latestSelectionTargetRowIdsRef.current);
        const shortcutRowId = shortcutTargetRowIds[shortcutTargetRowIds.length - 1]
          ?? activeRowId
          ?? null;
        if (!shortcutRowId) return;

        event.preventDefault();
        event.stopPropagation();
        toggleCommentForRow(shortcutRowId, {
          selectionSnapshot,
          targetRowIds: shortcutTargetRowIds,
        });
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [activeRowId, canCreateInlineComments, captureCommentSelectionSnapshot, captureTextareaSelectionTargetRowIds, toggleCommentForRow]);

  return (
    <>
      <div className={`plan-diff-overlay${singleLineNumbers ? ' plan-diff-overlay--single' : ''}${!showGutterComments ? ' plan-diff-overlay--gutter-comments-off' : ''}${effectiveViewMode === 'split' ? ' plan-diff-overlay--split' : ''}${effectiveViewMode === 'aside' ? ' plan-diff-overlay--aside' : ''}`}>
        {inspectionWidget}
        <div className="plan-diff-scroll" data-overlay-scroll-body="true" ref={scrollRef}>
          <div className="plan-diff-code">
	          {(() => {
	            const renderPlanDiffRows = (renderMode = 'unified') => {
                const rowsForRender = renderMode === 'aside-comments'
                  ? displayRows
                    .map((row, index) => {
                      const rowIndexComments = [
                        ...(diffComments[row.id] ?? []),
                        ...(normalizedDocumentDiffComments[row.id] ?? []),
                        ...normalizedCommentSessions.flatMap((session) => session.comments[row.id] ?? []),
                      ].filter(isCommentMatchingIndexFilter);
                      const severityPriority = rowIndexComments.length > 0
                        ? Math.min(...rowIndexComments.map(planDiffCommentSeverityPriority))
                        : PLAN_DIFF_OPEN_SEVERITY_FILTERS.length + 1;
                      return { row, index, severityPriority };
                    })
                    .sort((left, right) => left.severityPriority - right.severityPriority || left.index - right.index)
                    .map(({ row }) => row)
                  : displayRows;

                return rowsForRender.map((row) => {
            const hasInlineHighlight = row.kind === 'added' || row.kind === 'removed';
            const rowComments = diffComments[row.id] ?? [];
            const isRowCommentPending = pendingCommentRowIdSet.has(row.id);
            const documentRowComments = normalizedDocumentDiffComments[row.id] ?? [];
            const rowLineLabel = getDiffCommentLineLabelForRowIds([row.id], row.id);
            const documentGroup = documentRowComments.length > 0
              ? {
                  label: documentContextLabel,
                  icon: documentContextIcon,
                  sessionLabel: documentContextSessionLabel,
                  contextType: 'document',
                  sourceTabId: documentContextSourceTabId,
                  messageId: null,
                  chatId: null,
                  comments: documentRowComments.map((comment, commentIndex) => ({
                    ...((comment && typeof comment === 'object') ? comment : {}),
                    text: getCommentEntryText(comment),
	                    lineLabel: getCommentEntryLineLabel(comment) || rowLineLabel,
	                    editable: canCreateInlineComments && !comment?.reviewReadOnly,
	                    localIndex: commentIndex,
	                    source: 'document',
	                    pending: isRowCommentPending || Boolean(comment && typeof comment === 'object' && comment.pending),
	                  })),
                }
              : null;
            const sessionGroups = normalizedCommentSessions
              .map((session) => {
                const sessionComments = session.comments[row.id] ?? [];
                if (sessionComments.length === 0) {
                  return null;
                }

                return {
                  label: session.title,
                  icon: session.icon,
                  sessionLabel: commentsReadOnly ? 'Archive' : session.chatId === commentSessionActiveChatId ? 'Active' : 'Inactive',
                  messageId: session.messageId,
                  chatId: session.chatId,
                  comments: sessionComments.map((comment, commentIndex) => ({
                    ...((comment && typeof comment === 'object') ? comment : {}),
                    text: getCommentEntryText(comment),
                    lineLabel: getCommentEntryLineLabel(comment) || rowLineLabel,
                    editable: canCreateInlineComments && !comment?.reviewReadOnly,
                    localIndex: commentIndex,
                    source: 'session',
                    chatId: session.chatId,
                    pending: isRowCommentPending || Boolean(comment && typeof comment === 'object' && comment.pending),
                  })),
                };
              })
              .filter(Boolean)
              .filter((group) => !(
                isMirroredLocalCommentSession({
                  commentsReadOnly,
                  sessionTitle: group.label,
                  commentContextLabel,
                  sessionComments: group.comments.map((entry) => getCommentEntryText(entry)),
                  rowComments,
                })
              ));
            const localRowComments = rowComments.filter((comment) => {
              if (comment?.isReviewFeedback) return true;
              const commentChatId = typeof comment?.chatId === 'string' ? comment.chatId.trim() : '';
              return commentChatId.length === 0 || commentChatId === commentSessionActiveChatId;
            });
            const localGroup = (localRowComments.length > 0 || (canCreateInlineComments && commentRowId === row.id))
              ? {
                  label: commentContextLabel,
                  icon: commentContextIcon,
                  sessionLabel: commentContextSessionLabel,
                  messageId: null,
                  chatId: null,
                  hideHeader: commentRowId === row.id && localRowComments.length === 0,
                  comments: localRowComments.map((comment, index) => ({
                    ...((comment && typeof comment === 'object') ? comment : {}),
                    text: getCommentEntryText(comment),
                    lineLabel: getCommentEntryLineLabel(comment) || rowLineLabel,
                    editable: canCreateInlineComments && !comment?.reviewReadOnly,
                    localIndex: rowComments.indexOf(comment),
                    // Row-level pending (the diff's own `pendingCommentRowIds`) OR the
                    // comment's own flag, which bulk actions ("Apply all" / "Dismiss all")
                    // set per comment. Overwriting with the row flag alone dropped the
                    // loader everywhere the row list isn't used (review card, aside).
                    pending: isRowCommentPending || Boolean(comment && typeof comment === 'object' && comment.pending),
                  })),
                }
              : null;
            const isEmptyLocalComposeGroup = Boolean(localGroup && localGroup.comments.length === 0 && commentRowId === row.id);
            const rowCommentGroups = isEmptyLocalComposeGroup
              ? [
                  ...(documentGroup ? [documentGroup] : []),
                  ...sessionGroups,
                  localGroup,
                ]
              : [
                  ...(documentGroup ? [documentGroup] : []),
                  ...(localGroup ? [localGroup] : []),
                  ...sessionGroups,
                ];
            const hasVisibleRowComments = rowComments.length > 0 || documentRowComments.length > 0 || rowCommentGroups.some((group) => group.comments.length > 0);
            const visibleRowCommentCount = rowCommentGroups.reduce((count, group) => count + countCommentThreadMessages(group.comments), 0)
              || countCommentThreadMessages(rowComments);
            const isExpandedInlineCommentRow = expandedInlineCommentRowId === row.id
              || submittedExpandedCommentRowIds.has(row.id);
            const hasRenderableRowComments = rowCommentGroups.some((group) => (
              group.comments.some((comment) => isExpandedInlineCommentRow || !isCommentHiddenForRender(comment))
            ));
            const hiddenRowCommentTexts = rowCommentGroups.flatMap((group) => (
              (group?.comments ?? [])
                .filter(isCommentHiddenForRender)
                .map(getCommentEntryText)
            ));
            const hiddenRowCommentCount = hiddenRowCommentTexts.length;
            const aiNoteHint = singleLineNumbers ? AI_NOTE_FILE_HINT : AI_NOTE_DIFF_HINT;
            const isCommentComposeOpen = commentRowId === row.id;
            const isCommentSelectionHighlighted =
              commentTargetHasSelection
              &&
              Boolean(commentRowId)
              && !Number.isInteger(commentEditingIndex)
              && commentTargetRowIds.includes(row.id);
            const isEditingRowComment = commentRowId === row.id && Number.isInteger(commentEditingIndex);
            const hasExistingRowCommentGroups = rowCommentGroups.some((group) => group.comments.length > 0);
            const shouldRenderSeparateCompose = canCreateInlineComments && isCommentComposeOpen && !isEditingRowComment && hasExistingRowCommentGroups;
            const shouldShowPrimaryCompose = canCreateInlineComments && isCommentComposeOpen && !shouldRenderSeparateCompose;
            const isPrimaryComposeGroup = (group) => {
              if (!shouldShowPrimaryCompose) return false;
              if (!isEditingRowComment) return group === localGroup;
              if (commentEditingSource === 'document') return group?.contextType === 'document';
              return group === localGroup;
            };
            const visibleCommentGroups = rowCommentGroups.filter((group) => (
              group
              && (
                group.comments.some((comment) => isExpandedInlineCommentRow || !isCommentHiddenForRender(comment))
                || isPrimaryComposeGroup(group)
              )
            ));
            const visibleCommentPopups = visibleCommentGroups.flatMap((group, groupIndex) => {
              if (!group || isPrimaryComposeGroup(group) || !Array.isArray(group.comments) || group.comments.length <= 1) {
                return group ? [{ group, key: `${groupIndex}-group` }] : [];
              }

              return group.comments.map((comment, commentIndex) => ({
                group: {
                  ...group,
                  comments: [comment],
                },
                key: `${groupIndex}-${commentIndex}`,
              }));
            });
            const getSessionCommentsStateForChat = (chatId) => {
              const normalizedChatId = typeof chatId === 'string' ? chatId.trim() : '';
              if (!normalizedChatId) return {};
              return normalizedCommentSessions.find((session) => session.chatId === normalizedChatId)?.comments ?? {};
            };
            const getSessionRowCommentsForChat = (chatId) => (
              getSessionCommentsStateForChat(chatId)[row.id] ?? []
            );
            const handleRowCommentSubmit = ({ attachMode = 'current', submitAction = 'default', targetChatId = null, targetDocumentTabId = null } = {}) => {
              if (!canCreateInlineComments) return;
              const trimmed = (commentRowId === row.id ? commentValue : '').trim();
              if (!trimmed) return;

              if (shouldDeleteRow(trimmed)) {
                onRowDelete?.(row.id, trimmed);
                const { [row.id]: _, ...rest } = diffComments;
                commitDiffComments(rest);
                if (activeRowId === row.id) {
                  setActiveRowId(null);
                }
                clearCommentComposeState(activeRowId === row.id ? null : activeRowId);
                return;
              }

              if (shouldFixRow(trimmed)) {
                onRowFix?.(row.id, trimmed);
                clearCommentComposeState();
                return;
              }

              const isEditingComment = Number.isInteger(commentEditingIndex);
              const isEditingDocumentComment = commentEditingSource === 'document' && isEditingComment;
              const isEditingSessionComment = commentEditingSource === 'session' && isEditingComment;
              const editingSessionChatId = isEditingSessionComment ? commentEditingTargetChatId : null;
              const isDocumentAttachMode = isEditingDocumentComment || (attachMode === 'document' && !isEditingComment);
              const isNewChatAttachMode = attachMode === 'new' && !isEditingComment;
              const editingSourceComments = isEditingDocumentComment
                ? (normalizedDocumentDiffComments[row.id] ?? [])
                : isEditingSessionComment
                  ? getSessionRowCommentsForChat(editingSessionChatId)
                  : rowComments;
              const editingComment = isEditingComment
                ? (editingSourceComments[commentEditingIndex] ?? null)
                : null;
              const targetRowIds = isEditingComment
                ? getDiffCommentTargetRowIdsForComment(editingComment, row.id)
                : (commentTargetRowIds.length > 0 ? commentTargetRowIds : [row.id]);
              const commentStorageRowIds = [row.id];
              const submittedLineLabel = (
                getDiffCommentLineLabelForRowIds(targetRowIds, row.id)
                || commentFooterMetaLabel
                || getDiffCommentFooterMetaLabel(row.id)
              ).trim();
              const buildSubmittedComment = (text, previousComment = null) => {
                const previousLineLabel = getCommentEntryLineLabel(previousComment);
                const lineLabel = submittedLineLabel || previousLineLabel;
                const commentMetadata = {
                  ...((previousComment && typeof previousComment === 'object') ? previousComment : {}),
                  text,
                  ...(lineLabel.length > 0 ? { lineLabel } : {}),
                  rowIds: targetRowIds,
                };
                if (!isDocumentAttachMode && typeof targetChatId === 'string' && targetChatId.trim().length > 0) {
                  commentMetadata.chatId = targetChatId.trim();
                }
                return commentMetadata;
              };
              const sourceComments = isDocumentAttachMode
                ? normalizedDocumentDiffComments
                : isEditingSessionComment
                  ? getSessionCommentsStateForChat(editingSessionChatId)
                  : (isNewChatAttachMode ? {} : diffComments);
              const nextSubmittedComments = isDocumentAttachMode || isEditingSessionComment
                ? commentStorageRowIds.reduce((nextComments, targetRowId) => {
                    const existing = nextComments[targetRowId] ?? [];
                    return {
                      ...nextComments,
                      [targetRowId]: isEditingComment && targetRowId === row.id
                        ? existing.map((comment, index) => (
                            index === commentEditingIndex ? buildSubmittedComment(trimmed, comment) : comment
                          ))
                        : [...existing, buildSubmittedComment(trimmed)],
                    };
                  }, { ...sourceComments })
                : commentStorageRowIds.reduce((nextComments, targetRowId) => {
                    const existing = nextComments[targetRowId] ?? [];
                    return {
                      ...nextComments,
                      [targetRowId]: isEditingComment && targetRowId === row.id
                        ? existing.map((comment, index) => (
                            index === commentEditingIndex ? buildSubmittedComment(trimmed, comment) : comment
                          ))
                        : [...existing, buildSubmittedComment(trimmed)],
                    };
                  }, { ...sourceComments });
              const effectiveTargetChatId = isEditingSessionComment ? editingSessionChatId : targetChatId;
              const submitMetadata = {
                attachMode: isDocumentAttachMode ? 'document' : attachMode,
                targetChatId: effectiveTargetChatId,
                targetDocumentTabId,
                rowId: row.id,
                rowIds: targetRowIds,
                comment: trimmed,
                isEditing: Number.isInteger(commentEditingIndex),
                submitAction,
              };
              const isExplicitChatTarget = !isDocumentAttachMode
                && typeof effectiveTargetChatId === 'string'
                && effectiveTargetChatId.trim().length > 0;
              const nextDiffComments = isDocumentAttachMode
                ? (
                    onDiffCommentsChangeRef.current?.(normalizeDiffCommentsState(nextSubmittedComments), submitMetadata),
                    normalizeDiffCommentsState(nextSubmittedComments)
                  )
                : isExplicitChatTarget
                ? (
                    onDiffCommentsChangeRef.current?.(normalizeDiffCommentsState(nextSubmittedComments), submitMetadata),
                    normalizeDiffCommentsState(nextSubmittedComments)
                  )
                : commitDiffComments(
                    nextSubmittedComments,
                    submitMetadata,
                  );
              onDiffCommentSubmit?.({
                attachMode: isDocumentAttachMode ? 'document' : attachMode,
                targetChatId: effectiveTargetChatId,
                targetDocumentTabId,
                rowId: row.id,
                rowIds: targetRowIds,
                comment: trimmed,
                comments: nextDiffComments,
                isEditing: Number.isInteger(commentEditingIndex),
                submitAction,
              });
              setSubmittedExpandedCommentRowIds((current) => {
                if (current.has(row.id)) return current;
                const next = new Set(current);
                next.add(row.id);
                return next;
              });
              clearCommentComposeState();
            };
            const buildAgentUserReplyComment = (comment, userReply) => ({
              ...((comment && typeof comment === 'object') ? comment : {}),
              text: getCommentEntryText(comment),
              userReply,
              agentFollowUpReply: '',
              reviewStatus: 'pending-update',
              pending: false,
            });
            const handleAgentReplyToRowComment = (commentIndex, userReply, source = 'diff', context = null) => {
              if (commentsReadOnly || !Number.isInteger(commentIndex)) return;
              const trimmed = typeof userReply === 'string' ? userReply.trim() : '';
              if (trimmed.length === 0) return;
              const contextChatId = typeof context?.chatId === 'string' ? context.chatId.trim() : '';
              const sourceState = source === 'document'
                ? normalizedDocumentDiffComments
                : source === 'session' && contextChatId
                  ? getSessionCommentsStateForChat(contextChatId)
                  : diffComments;
              const targetComment = sourceState[row.id]?.[commentIndex];
              if (
                targetComment?.reviewReadOnly
                || targetComment?.pending
                || isReviewFindingDecided(targetComment)
              ) return;
              const submitAction = 'send-to-agent';
              const applyReplyToRow = (state) => ({
                ...state,
                [row.id]: (state[row.id] ?? []).map((comment, index) => (
                  index === commentIndex ? buildAgentUserReplyComment(comment, trimmed) : comment
                )),
              });

              if (source === 'document') {
                onDiffCommentsChangeRef.current?.(normalizeDiffCommentsState(applyReplyToRow(normalizedDocumentDiffComments)), {
                  attachMode: 'document',
                  rowId: row.id,
                  comment: trimmed,
                  isEditing: true,
                  submitAction,
                });
                return;
              }

              if (source === 'session' && contextChatId) {
                const sessionComments = getSessionCommentsStateForChat(contextChatId);
                const nextSessionComments = normalizeDiffCommentsState(applyReplyToRow(sessionComments));
                onDiffCommentsChangeRef.current?.(nextSessionComments, {
                  attachMode: 'current',
                  targetChatId: contextChatId,
                  rowId: row.id,
                  comment: trimmed,
                  isEditing: true,
                  submitAction,
                });
                return;
              }

              commitDiffComments(applyReplyToRow(diffComments), {
                rowId: row.id,
                comment: trimmed,
                isEditing: true,
                submitAction,
              });
            };
            const deleteRowComment = (commentIndex, source = 'diff', context = null) => {
              if (commentsReadOnly || !Number.isInteger(commentIndex)) return;
              const contextChatId = typeof context?.chatId === 'string' ? context.chatId.trim() : '';
              const sourceState = source === 'document'
                ? normalizedDocumentDiffComments
                : source === 'session' && contextChatId
                  ? getSessionCommentsStateForChat(contextChatId)
                  : diffComments;
              const targetComment = sourceState[row.id]?.[commentIndex];
              if (targetComment?.reviewReadOnly) return;
              const targetIsReviewFinding = Boolean(
                resolveKeepsComment
                && targetComment
                && typeof targetComment === 'object'
                && targetComment.author === 'agent',
              );
              const deleteFromState = (state) => {
                if (!targetIsReviewFinding) {
                  return normalizeDiffCommentsState({
                    ...state,
                    [row.id]: (state[row.id] ?? []).filter((_, index) => index !== commentIndex),
                  });
                }
                return normalizeDiffCommentsState({
                  ...state,
                  [row.id]: (state[row.id] ?? []).map((comment, index) => (
                    index === commentIndex
                      ? {
                          ...comment,
                          text: getCommentEntryText(comment),
                          reviewStatus: 'deleted',
                          resolved: true,
                          resolvedKind: 'deleted',
                          pending: false,
                          hidden: false,
                        }
                      : comment
                  )),
                });
              };

              if (source === 'document') {
                onDiffCommentsChangeRef.current?.(deleteFromState(normalizedDocumentDiffComments), {
                  attachMode: 'document', rowId: row.id, isEditing: true,
                });
                return;
              }
              if (source === 'session' && contextChatId) {
                onDiffCommentsChangeRef.current?.(deleteFromState(getSessionCommentsStateForChat(contextChatId)), {
                  attachMode: 'current', targetChatId: contextChatId, rowId: row.id, isEditing: true,
                });
                return;
              }
              commitDiffComments(deleteFromState(diffComments), {
                rowId: row.id,
                isEditing: true,
                resolveAction: targetIsReviewFinding ? {
                  kind: 'delete',
                  text: getCommentEntryText(targetComment),
                  comment: targetComment,
                  rowId: row.id,
                  isReviewFinding: true,
                } : null,
              });
            };
            // Apply fix / Mark resolved: regular chat notes disappear once the
            // action finishes. Only findings in the dedicated Review flow keep
            // a resolved record so that review status remains auditable.
            const removeRowComment = (commentIndex, source = 'diff', context = null, kind = 'resolve', commentHint = null) => {
              if (commentsReadOnly || !Number.isInteger(commentIndex)) return;
              const contextChatId = typeof context?.chatId === 'string' ? context.chatId.trim() : '';
              const sourceState = source === 'document'
                ? normalizedDocumentDiffComments
                : source === 'session' && contextChatId
                  ? getSessionCommentsStateForChat(contextChatId)
                  : diffComments;
              const sourceRow = sourceState[row.id] ?? [];
              const hintedText = getCommentEntryText(commentHint).trim();
              const hintedId = commentHint && typeof commentHint === 'object' ? commentHint.id : null;
              const hintedFindingId = commentHint && typeof commentHint === 'object' ? commentHint.findingId : null;
              const stableCommentIndex = commentHint && typeof commentHint === 'object'
                ? sourceRow.findIndex((candidate) => {
                    if (!candidate || typeof candidate !== 'object') return false;
                    if (hintedId && candidate.id === hintedId) return true;
                    if (hintedFindingId && candidate.findingId === hintedFindingId && getCommentEntryText(candidate).trim() === hintedText) return true;
                    return getCommentEntryText(candidate).trim() === hintedText
                      && candidate.author === commentHint.author
                      && String(candidate.agentReply ?? '') === String(commentHint.agentReply ?? '');
                  })
                : -1;
              const targetIndex = stableCommentIndex >= 0 ? stableCommentIndex : commentIndex;
              const targetComment = sourceRow[targetIndex];
              const actionComment = targetComment ?? commentHint;
              if (actionComment?.reviewReadOnly) return;
              const noteText = getCommentEntryText(actionComment) || 'Resolved';
              const targetIsReviewFinding = Boolean(
                resolveKeepsComment
                &&
                actionComment
                && typeof actionComment === 'object'
                && (
                  (kind === 'quickfix' && actionComment.fixLabel)
                  ||
                  actionComment.author === 'agent'
                  || (
                    actionComment.agentReply
                    && actionComment.fixLabel
                    && (actionComment.findingId || actionComment.reviewChatId)
                  )
                ),
              );
              const resolveAction = {
                kind,
                text: noteText,
                findingId: (actionComment && typeof actionComment === 'object')
                  ? (actionComment.findingId ?? null)
                  : null,
                fixLabel: (actionComment && typeof actionComment === 'object') ? (actionComment.fixLabel ?? null) : null,
                sourceLabel: (actionComment && typeof actionComment === 'object') ? (actionComment.sourceLabel ?? null) : null,
                lineLabel: (actionComment && typeof actionComment === 'object') ? (actionComment.lineLabel ?? null) : null,
                // Full comment + its row, so the App can snapshot the resolved
                // thread into a chat message (context) when it's a user comment.
                comment: (actionComment && typeof actionComment === 'object') ? actionComment : { text: noteText },
                rowId: row.id,
                isReviewFinding: targetIsReviewFinding,
                handledDirectly: Boolean(targetIsReviewFinding && onReviewAction),
              };
              if (targetIsReviewFinding) onReviewAction?.(resolveAction);
              // In a review, resolving/quick-fixing KEEPS the comment (dimmed +
              // badge) so handled findings stay visible until the review ends.
              // Everywhere else (e.g. a question comment the agent answered),
              // the action closes the thread, so the comment is removed and its
              // composer chip clears.
              const markResolved = (state) => {
                const existing = state[row.id] ?? [];
                const nextRow = existing.map((comment, index) => {
                  if (index !== targetIndex) return comment;
                  const base = (comment && typeof comment === 'object') ? comment : { text: comment };
                  return {
                    ...base,
                    text: getCommentEntryText(comment),
                    resolved: true,
                    resolvedKind: kind === 'quickfix' ? 'applied' : (kind === 'dismiss' ? 'dismissed' : 'manual'),
                    reviewStatus: kind === 'quickfix' ? 'accepted' : 'dismissed',
                    pending: false,
                    // Review findings stay visible after handling so the card can
                    // clearly change status instead of disappearing. Non-review
                    // resolved notes keep the older auto-collapse behavior.
                    hidden: resolveKeepsComment && targetIsReviewFinding ? false : true,
                  };
                });
                return { ...state, [row.id]: nextRow };
              };
              const withoutRowComment = (state) => {
                const existing = state[row.id] ?? [];
                const nextRow = existing.filter((_, index) => index !== targetIndex);
                if (nextRow.length > 0) return { ...state, [row.id]: nextRow };
                const { [row.id]: _dropped, ...rest } = state;
                return rest;
              };
	              const applyResolution = resolveKeepsComment && targetIsReviewFinding
	                ? markResolved
	                : withoutRowComment;

              if (source === 'document') {
                onDiffCommentsChangeRef.current?.(normalizeDiffCommentsState(applyResolution(normalizedDocumentDiffComments)), {
                  attachMode: 'document', rowId: row.id, comment: noteText, isEditing: true, resolveAction,
                });
                return;
              }
              if (source === 'session' && contextChatId) {
                onDiffCommentsChangeRef.current?.(normalizeDiffCommentsState(applyResolution(getSessionCommentsStateForChat(contextChatId))), {
                  attachMode: 'current', targetChatId: contextChatId, rowId: row.id, comment: noteText, isEditing: true, resolveAction,
                });
                return;
              }
              commitDiffComments(applyResolution(diffComments), { rowId: row.id, comment: noteText, isEditing: true, resolveAction });
            };
            const handleAgentQuickFixRowComment = (commentIndex, source = 'diff', context = null, comment = null) => removeRowComment(commentIndex, source, context, 'quickfix', comment);
            const handleAgentResolveRowComment = (commentIndex, _solved, source = 'diff', context = null, comment = null) => removeRowComment(commentIndex, source, context, 'resolve', comment);
            const handleAgentDismissRowComment = (commentIndex, source = 'diff', context = null, comment = null) => removeRowComment(commentIndex, source, context, 'dismiss', comment);

	            const renderCodeRow = (splitSide = null) => {
	              const isSplitSide = splitSide === 'left' || splitSide === 'right';
	              // Comment controls (and the hidden-comment reveal badge) must sit on
	              // the same split side that renders this row's comment card: a removed
	              // row lives on the left, everything else on the right. Otherwise a
	              // resolved comment on a removed line has no gutter icon to reopen it.
	              const rowCommentSide = row.kind === 'removed' ? 'left' : 'right';
	              const showRowCommentControls = !isSplitSide || splitSide === rowCommentSide;
	              const shouldRenderGutterCommentControl = showGutterComments
	                && showRowCommentControls
	                && (
	                  singleLineNumbers
	                    ? (isCommentComposeOpen || hasVisibleRowComments || hiddenRowCommentCount > 0)
	                    : (canCreateInlineComments || hasVisibleRowComments || hiddenRowCommentCount > 0)
	                );
	              const lineNumber = splitSide === 'right' ? row.newNumber : row.oldNumber;
	              const isHighlightedCommentTarget = highlightedCommentRowIdSet.has(row.id);
	              const contextSelectionRanges = contextSelectionRangesByRowId.get(row.id) ?? [];
	              let rowTextOffset = 0;
	              const renderedCodeFragments = (row.fragments ?? [{ text: row.text || ' ', tone: 'plain' }]).map((fragment, index) => (
	                <span
	                  key={`${row.id}-fragment-${index}`}
	                  className={`plan-diff-fragment${fragment.tone && fragment.tone !== 'plain' ? ` is-${fragment.tone}` : ''}`}
	                >
	                  {tokenizeCodeFragment(fragment.text || ' ', diffData?.language || 'text').map((token, tokenIndex) => {
	                    const tokenStart = rowTextOffset;
	                    const tokenEnd = tokenStart + token.text.length;
	                    rowTextOffset = tokenEnd;
	                    const boundaries = [...new Set([
	                      0,
	                      token.text.length,
	                      ...contextSelectionRanges.flatMap((range) => [
	                        Math.max(0, Math.min(token.text.length, range.start - tokenStart)),
	                        Math.max(0, Math.min(token.text.length, range.end - tokenStart)),
	                      ]),
	                    ])].sort((left, right) => left - right);
	                    return (
	                      <span
	                        key={`${row.id}-fragment-${index}-token-${tokenIndex}`}
	                        className={`plan-diff-token plan-diff-token-${token.type}`}
	                      >
	                        {boundaries.slice(0, -1).map((segmentStart, segmentIndex) => {
	                          const segmentEnd = boundaries[segmentIndex + 1];
	                          if (segmentEnd <= segmentStart) return null;
	                          const absoluteStart = tokenStart + segmentStart;
	                          const absoluteEnd = tokenStart + segmentEnd;
	                          const chatTitles = [...new Set(
	                            contextSelectionRanges
	                              .filter((range) => range.start < absoluteEnd && range.end > absoluteStart)
	                              .map((range) => range.chatTitle),
	                          )];
	                          const segmentText = token.text.slice(segmentStart, segmentEnd);
	                          if (chatTitles.length === 0) return segmentText;
	                          return (
	                            <mark
	                              key={`${row.id}-fragment-${index}-token-${tokenIndex}-context-${segmentIndex}`}
	                              className="plan-diff-context-selection-mark"
	                              title={`Quoted in: ${chatTitles.join(', ')}`}
	                            >
	                              {segmentText}
	                            </mark>
	                          );
	                        })}
	                      </span>
	                    );
	                  })}
	                </span>
	              ));
	              return (
	              <div
	                className={`plan-diff-row plan-diff-row-${row.kind}${isSplitSide ? ` plan-diff-row--split-${splitSide}` : ''}${row.id === activeRowId ? ' is-focus' : ''}${hasInlineHighlight ? ' has-inline-highlight' : ''}${isCommentSelectionHighlighted ? ' has-comment-selection-highlight' : ''}${contextSelectionRanges.length > 0 ? ' has-context-selection-highlight' : ''}${isHighlightedCommentTarget ? ' is-comment-target-highlight' : ''}`}
                data-diff-row-id={row.id}
                data-demo-id={`diff-row-${row.id}`}
                data-review-patch-id={row.reviewPatchId || undefined}
                data-review-patch-chat-id={row.reviewPatchChatId || undefined}
                data-review-patch-status={row.reviewPatchStatus || undefined}
                role="button"
                tabIndex={0}
                onMouseDown={(event) => {
                  if (event.button !== 0) return;
                  if (event.target instanceof Element && event.target.closest('button, .plan-diff-gutter-icon-slot')) return;
                  onTextSelectionChange?.(null);
                  trackPointerSelectionRow(row.id, {
                    start: true,
                    point: { x: event.clientX, y: event.clientY },
                  });
                }}
                onMouseEnter={(event) => {
                  if ((event.buttons & 1) !== 1) return;
                  trackPointerSelectionRow(row.id);
                }}
                onMouseMove={(event) => {
                  if ((event.buttons & 1) !== 1) return;
                  trackPointerSelectionRow(row.id);
                }}
                onClick={() => activateRow(row.id)}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return;
                  event.preventDefault();
                  activateRow(row.id);
                }}
              >
	                <div className="plan-diff-row-gutter" onContextMenu={(event) => openGutterContextMenu(event, row.id)}>
	                  <span className="plan-diff-line-number">{lineNumber ?? ''}</span>
	                  {!singleLineNumbers && !isSplitSide && <span className="plan-diff-line-number">{row.newNumber ?? ''}</span>}
	                  {shouldRenderGutterCommentControl ? (
                    <PlanDiffGutterAiNoteTooltip text={aiNoteHint} disabled={hiddenRowCommentTexts.length > 0}>
	                      <span
	                        className={`plan-diff-gutter-icon-slot${isCommentComposeOpen ? ' is-open' : ''}${hasVisibleRowComments ? ' has-comments' : ''}${hasRenderableRowComments ? ' has-renderable-comments' : ''}${hiddenRowCommentTexts.length > 0 ? ' has-hidden-comments' : ''}`}
                        data-demo-id={`diff-comment-toggle-${row.id}`}
                        data-comment-shortcut-anchor={commentShortcutHintRowId === row.id ? 'true' : undefined}
                        role="button"
                        tabIndex={0}
                        aria-label={
                          hasVisibleRowComments
                            ? `${visibleRowCommentCount} ${visibleRowCommentCount === 1 ? 'AI Note' : 'AI Notes'}${hiddenRowCommentCount > 0 ? ', collapsed in gutter' : ''}`
                            : canCreateInlineComments ? 'Add AI Note' : 'AI Note'
                        }
                        onMouseDown={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          if (!canCreateInlineComments) return;
                          const capturedSelectionSnapshot = captureCommentSelectionSnapshot();
                          const capturedTargetRowIds = capturedSelectionSnapshot
                            ? getDiffCommentTargetRowIds(row.id, capturedSelectionSnapshot)
                            : [];
                          const pointerTargetRowIds = latestSelectionTargetRowIdsRef.current ?? [];
                          const currentTextareaTargetRowIds = captureTextareaSelectionTargetRowIds();
                          const textareaTargetRowIds = currentTextareaTargetRowIds.length > 0
                            ? currentTextareaTargetRowIds
                            : (latestTextareaSelectionTargetRowIdsRef.current ?? []);
                          const hasTextareaSelection = textareaTargetRowIds.length > 1;
                          const hasPointerSelection = pointerTargetRowIds.length > 1;
                          const selectionSnapshot = hasPointerSelection
                            ? null
                            : capturedSelectionSnapshot;
                          preservedSelectionSnapshotRef.current = selectionSnapshot;
                          preservedSelectionTargetRowIdsRef.current = hasTextareaSelection
                            ? textareaTargetRowIds
                            : hasPointerSelection
                            ? pointerTargetRowIds
                            : (capturedTargetRowIds.length > 0 && selectionSnapshot ? capturedTargetRowIds : []);
                          setPreserveSelectionCommentRowId(selectionSnapshot ? row.id : null);
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleCommentForRow(row.id, {
                            selectionSnapshot: preservedSelectionSnapshotRef.current,
                            targetRowIds: preservedSelectionTargetRowIdsRef.current,
                          });
                        }}
                        onKeyDown={(event) => {
                          if (event.key !== 'Enter' && event.key !== ' ') return;
                          event.preventDefault();
                          event.stopPropagation();
                          toggleCommentForRow(row.id);
                        }}
                      >
                        {hasVisibleRowComments ? (
                          <PlanDiffCommentBadge
                            count={visibleRowCommentCount}
                            previewComments={hiddenRowCommentTexts}
                            onAdd={canCreateInlineComments && hasRenderableRowComments ? () => {
                              openAdditionalCommentForRow(row.id);
                            } : null}
                          />
                        ) : (
                          <Icon name="general/balloon" size={16} />
                        )}
                      </span>
                    </PlanDiffGutterAiNoteTooltip>
	                  ) : (
	                    <span className="plan-diff-gutter-icon-slot" aria-hidden="true" />
	                  )}
                </div>
                <div
                  className="plan-diff-row-code"
                  onClick={(event) => {
                    event.stopPropagation();
                    activateRow(row.id, event.currentTarget, event.clientX);
                  }}
                >
                  <span
                    key={row.id === activeRowId ? `caret-active-${caretKey}` : `caret-${row.id}`}
                    className={`plan-diff-row-caret${row.id === activeRowId ? ' is-visible' : ''}`}
                    style={{
                      left: `${row.id === caretState.rowId ? caretState.left : PLAN_DIFF_DEFAULT_CARET_LEFT}px`,
                    }}
                    aria-hidden="true"
                  />
                  <span className="plan-diff-row-rail" aria-hidden="true" />
                  <span className="plan-diff-row-code-text">
                    {renderedCodeFragments}
                  </span>
                </div>
	              </div>
	              );
	            };
	            const shouldRenderInlineCommentRow = (
	              ((hasRenderableRowComments || (
	                effectiveViewMode === 'comments'
	                && rowCommentGroups.some((group) => (
	                  (group?.comments ?? []).some(isCommentMatchingIndexFilter)
	                ))
	              )) && (
	                !inlineCommentRowIdOnly
	                || commentRowId === row.id
	                || isExpandedInlineCommentRow
	              ))
	              || commentRowId === row.id
	            );
            const renderCommentRow = (splitSide = null) => (shouldRenderInlineCommentRow && (
	                <div
                    className={`plan-diff-row plan-diff-row-comment${splitSide ? ` plan-diff-row--split-${splitSide}` : ''}${highlightCommentRowId === row.id ? ' is-comment-navigation-target' : ''}`}
                    data-demo-id={`diff-comment-row-${row.id}`}
                    data-review-comment-row={row.id}
                  >
	                  <div className="plan-diff-row-gutter" onContextMenu={(event) => openGutterContextMenu(event, row.id)}>
	                    <span className="plan-diff-line-number" />
	                    {!singleLineNumbers && !splitSide && <span className="plan-diff-line-number" />}
	                    <span className="plan-diff-gutter-icon-slot" />
	                  </div>
                  <div className="plan-diff-inline-comment">
                    {visibleCommentPopups.map(({ group, key }) => {
                      const showGroupCompose = isPrimaryComposeGroup(group);

                      return (
                        <DiffInlineCommentPopup
                          key={`${group.contextType || 'chat'}-${group.chatId || group.sourceTabId || group.label}-${group.messageId || row.id}-${key}`}
                          comments={[]}
                          commentGroups={[group]}
                          value={showGroupCompose ? commentValue : ''}
                          editingIndex={showGroupCompose ? commentEditingIndex : null}
                          showCompose={showGroupCompose}
                          commentsReadOnly={commentsReadOnly}
                          defaultSubmitAttachMode={defaultSubmitAttachMode}
                          commentContextLabel={commentContextLabel}
                          commentContextIcon={commentContextIcon}
                          commentContextSessionLabel={commentContextSessionLabel}
                          footerMetaLabel={commentFooterMetaLabel || getDiffCommentFooterMetaLabel(row.id)}
                          defaultSubmitTargetLabel={defaultSubmitTargetLabel || documentContextLabel}
                          defaultSubmitTargetIcon={defaultSubmitTargetIcon || documentContextIcon}
                          defaultSubmitTargetKey={defaultSubmitTargetKey}
                          activeChatTargetKey={commentSessionActiveChatId}
                          renderSubmitTargetPicker={renderSubmitTargetPicker}
                          preserveEditorSelection={preserveSelectionCommentRowId === row.id && showGroupCompose}
                          preservedEditorSelectionSnapshot={preservedSelectionSnapshotRef.current}
                          severityFilter={severityFilter}
                          forceShowHiddenComments={isExpandedInlineCommentRow}
                          showCommentSeverity={resolveKeepsComment}
                          resolveKeepsComment={resolveKeepsComment}
                          allowAgentReplies={allowCommentReplies}
                          onChange={setCommentValue}
                          onStartEdit={(idx, source = 'diff', context = null) => {
                            if (commentsReadOnly) return;
                            const contextChatId = typeof context?.chatId === 'string' ? context.chatId.trim() : '';
                            const sourceComments = source === 'document'
                              ? (normalizedDocumentDiffComments[row.id] ?? [])
                              : source === 'session'
                                ? getSessionRowCommentsForChat(contextChatId)
                                : rowComments;
                            const editedComment = sourceComments[idx] ?? '';
                            const editedTargetRowIds = getDiffCommentTargetRowIdsForComment(editedComment, row.id);
                            setCommentRowId(row.id);
                            setCommentValue(getCommentEntryText(editedComment));
                            setCommentEditingIndex(idx);
                            setCommentEditingSource(source === 'document' ? 'document' : (source === 'session' ? 'session' : 'diff'));
                            setCommentEditingTargetChatId(source === 'session' ? contextChatId : null);
                            setCommentTargetRowIds(editedTargetRowIds);
                            setCommentTargetHasSelection(false);
                            setCommentFooterMetaLabel(
                              getCommentEntryLineLabel(editedComment)
                              || getDiffCommentLineLabelForRowIds(editedTargetRowIds, row.id)
                              || getDiffCommentFooterMetaLabel(row.id)
                            );
                          }}
                          onDelete={deleteRowComment}
                          onHide={(idx, source = 'diff', context = null) => {
                            if (commentsReadOnly) return;
                            const contextChatId = typeof context?.chatId === 'string' ? context.chatId.trim() : '';
                            if (source === 'document') {
                              onDiffCommentsChangeRef.current?.(setRowCommentsHidden(normalizedDocumentDiffComments, row.id, true, idx), {
                                attachMode: 'document',
                                rowId: row.id,
                                isEditing: true,
                              });
                              return;
                            }
                            if (source === 'session' && contextChatId) {
                              const sessionComments = getSessionCommentsStateForChat(contextChatId);
                              onDiffCommentsChangeRef.current?.(setRowCommentsHidden(sessionComments, row.id, true, idx), {
                                attachMode: 'current',
                                targetChatId: contextChatId,
                                rowId: row.id,
                                isEditing: true,
                              });
                              return;
                            }

                            commitDiffComments(setRowCommentsHidden(diffComments, row.id, true, idx));
                          }}
                          onCancel={() => clearCommentComposeState()}
                          onSubmit={handleRowCommentSubmit}
	                          onReplyToAgent={handleAgentReplyToRowComment}
	                          onQuickFix={handleAgentQuickFixRowComment}
	                          onResolveComment={handleAgentResolveRowComment}
	                          onDismissComment={handleAgentDismissRowComment}
	                          onHideAll={hideAllCommentsForDocument}
                          onReturnToChat={onReturnToChat}
                        />
                      );
                    })}
                    {shouldRenderSeparateCompose && (
                      <DiffInlineCommentPopup
                        comments={[]}
                        commentGroups={null}
                        value={commentValue}
                        editingIndex={null}
                        showCompose
                        commentsReadOnly={commentsReadOnly}
                        defaultSubmitAttachMode={defaultSubmitAttachMode}
                        commentContextLabel={commentContextLabel}
                        commentContextIcon={commentContextIcon}
                        commentContextSessionLabel={commentContextSessionLabel}
                        footerMetaLabel={commentFooterMetaLabel || getDiffCommentFooterMetaLabel(row.id)}
                        defaultSubmitTargetLabel={defaultSubmitTargetLabel || documentContextLabel}
                        defaultSubmitTargetIcon={defaultSubmitTargetIcon || documentContextIcon}
                        defaultSubmitTargetKey={defaultSubmitTargetKey}
                        activeChatTargetKey={commentSessionActiveChatId}
                        renderSubmitTargetPicker={renderSubmitTargetPicker}
                        preserveEditorSelection={preserveSelectionCommentRowId === row.id}
                        preservedEditorSelectionSnapshot={preservedSelectionSnapshotRef.current}
                        severityFilter={severityFilter}
                        showCommentSeverity={resolveKeepsComment}
                        resolveKeepsComment={resolveKeepsComment}
                        allowAgentReplies={allowCommentReplies}
                        onChange={setCommentValue}
                        onCancel={() => clearCommentComposeState()}
                        onSubmit={handleRowCommentSubmit}
                        onHideAll={hideAllCommentsForDocument}
                        onReturnToChat={onReturnToChat}
	                      />
	                    )}
	                  </div>
		                </div>
			              ));
	            const renderSplitPlaceholderRow = (splitSide) => (
	              <div className={`plan-diff-row plan-diff-row-split-placeholder plan-diff-row--split-${splitSide}`} aria-hidden="true">
	                <div className="plan-diff-row-gutter">
	                  <span className="plan-diff-line-number" />
	                  <span className="plan-diff-gutter-icon-slot" />
	                </div>
	                <div className="plan-diff-row-code">
	                  <span className="plan-diff-row-code-text"> </span>
	                </div>
	              </div>
	            );
	            if (renderMode === 'split-left') {
	              if (row.kind === 'added') return <Fragment key={`left-placeholder-${row.id}`}>{renderSplitPlaceholderRow('left')}</Fragment>;
	              return (
	                <Fragment key={`left-${row.id}`}>
	                  {renderCodeRow('left')}
	                  {row.kind === 'removed' ? renderCommentRow('left') : null}
	                </Fragment>
	              );
	            }
	            if (renderMode === 'split-right') {
	              if (row.kind === 'removed') {
	                return (
	                  <Fragment key={`right-${row.id}`}>
	                    {renderSplitPlaceholderRow('right')}
	                  </Fragment>
	                );
	              }
	              return (
	                <Fragment key={`right-${row.id}`}>
	                  {renderCodeRow('right')}
	                  {renderCommentRow('right')}
	                </Fragment>
	              );
	            }
	            if (renderMode === 'aside-code') {
	              return (
	                <Fragment key={`aside-code-${row.id}`}>
	                  {renderCodeRow()}
	                  {(!inlineCommentRowIdOnly || commentRowId === row.id || isExpandedInlineCommentRow) ? renderCommentRow() : null}
	                </Fragment>
	              );
	            }
	            if (renderMode === 'aside-comments') {
	              const indexComments = rowCommentGroups.flatMap((group) => (
	                (group?.comments ?? [])
	                  .filter(isCommentMatchingIndexFilter)
	                  .map((comment) => ({ comment, group }))
	              )).sort((left, right) => (
	                planDiffCommentSeverityPriority(left.comment) - planDiffCommentSeverityPriority(right.comment)
	              ));
	              if (indexComments.length === 0) return null;
	              return (
	                <Fragment key={`aside-comment-${row.id}`}>
	                  {indexComments.map(({ comment, group }, commentIndex) => {
	                    const text = getCommentEntryText(comment).trim();
	                    const findingStatus = getReviewFindingStatus(comment);
	                    const resolved = isReviewFindingDecided(comment);
	                    const resolvedLabel = getReviewFindingStatusLabel(comment);
	                    const resolvedBadgeTone = ` is-${findingStatus}`;
	                    const pending = Boolean(comment && typeof comment === 'object' && comment.pending);
	                    const displayText = text || group?.label || 'AI Note';
	                    const lineLabel = getCommentEntryLineLabel(comment) || rowLineLabel;
	                    const fileLabel = showCommentIndexFileLabel && commentIndexFileLabel ? commentIndexFileLabel : '';
	                    const sourceLabel = fileLabel
	                      ? (singleLineNumbers || /^diff\s+/iu.test(fileLabel) ? fileLabel : `Diff ${fileLabel}`)
	                      : 'Source';
	                    const sourceIcon = singleLineNumbers
	                      ? (/\.java$/iu.test(fileLabel) ? 'fileTypes/java' : 'fileTypes/text')
	                      : 'vcs/diff';
	                    const targetRowIds = getDiffCommentTargetRowIdsForComment(comment, row.id);
	                    const targetRowIndices = targetRowIds
	                      .map((targetRowId) => displayRows.findIndex((displayRow) => displayRow.id === targetRowId))
	                      .filter((targetRowIndex) => targetRowIndex >= 0);
	                    const firstTargetRowIndex = targetRowIndices.length > 0 ? Math.min(...targetRowIndices) : displayRows.indexOf(row);
	                    const lastTargetRowIndex = targetRowIndices.length > 0 ? Math.max(...targetRowIndices) : firstTargetRowIndex;
	                    const codeContextRows = firstTargetRowIndex >= 0
	                      ? displayRows.slice(
	                          Math.max(0, firstTargetRowIndex - 2),
	                          Math.min(displayRows.length, lastTargetRowIndex + 3),
	                        )
	                      : [];
	                    const source = typeof comment?.source === 'string' ? comment.source : 'diff';
	                    const localIndex = Number.isInteger(comment?.localIndex) ? comment.localIndex : commentIndex;
	                    const context = { chatId: comment?.chatId || group?.chatId || null };
	                    const actionKey = `${row.id}:${source}:${context.chatId || 'local'}:${localIndex}`;
	                    const changeLabel = typeof comment?.fixLabel === 'string' ? comment.fixLabel.trim() : '';
	                    const userReply = typeof comment?.userReply === 'string' ? comment.userReply.trim() : '';
	                    const agentFollowUpReply = typeof comment?.agentFollowUpReply === 'string'
	                      ? comment.agentFollowUpReply.trim()
	                      : '';
	                    const isAgentAuthored = comment?.author === 'agent';
	                    const agentReply = typeof comment?.agentReply === 'string' ? comment.agentReply.trim() : '';
	                    const hasActionableAgentResponse = isAgentAuthored || agentReply.length > 0;
	                    const isReplyComposerOpen = asideReplyComposerKey === actionKey;
	                    const replyDraft = asideReplyDrafts[actionKey] ?? '';
	                    const isProcessing = pending || asideProcessingCommentKey === actionKey;
	                    const isCodeExpanded = defaultCommentCodeExpanded
	                      ? !collapsedAsideCodeKeys.has(actionKey)
	                      : expandedAsideCodeKeys.has(actionKey);
	                    const setCodeExpanded = (expanded) => {
	                      if (defaultCommentCodeExpanded) {
	                        setCollapsedAsideCodeKeys((current) => {
	                          const next = new Set(current);
	                          if (expanded) next.delete(actionKey);
	                          else next.add(actionKey);
	                          return next;
	                        });
	                        return;
	                      }
	                      setExpandedAsideCodeKeys((current) => {
	                        const next = new Set(current);
	                        if (expanded) next.add(actionKey);
	                        else next.delete(actionKey);
	                        return next;
	                      });
	                    };
	                    const navigateToRow = () => (
	                      onCommentNavigate
	                        ? onCommentNavigate(row.id, { rowIds: targetRowIds, comment })
	                        : activateRow(row.id)
	                    );
	                    const runAsideAction = (kind) => {
	                      if (commentsReadOnly || comment?.reviewReadOnly || isProcessing) return;
	                      setAsideReplyComposerKey(null);
	                      if (resolveKeepsComment && kind === 'quickfix') {
	                        handleAgentQuickFixRowComment(localIndex, source, context, comment);
	                        return;
	                      }
	                      setAsideProcessingCommentKey(actionKey);
	                      onReviewProcessingChange?.(true);
	                      window.setTimeout(() => {
	                        if (kind === 'quickfix') {
	                          handleAgentQuickFixRowComment(localIndex, source, context, comment);
	                        } else if (kind === 'dismiss') {
	                          handleAgentDismissRowComment(localIndex, source, context, comment);
	                        } else {
	                          handleAgentResolveRowComment(localIndex, true, source, context, comment);
	                        }
	                        setAsideProcessingCommentKey((currentKey) => (
	                          currentKey === actionKey ? null : currentKey
	                        ));
	                        onReviewProcessingChange?.(false);
	                      }, 2800);
	                    };
	                    const submitAsideReply = () => {
	                      const trimmedReply = replyDraft.trim();
	                      if (commentsReadOnly || comment?.reviewReadOnly || !trimmedReply || isProcessing) return;
	                      setAsideReplyComposerKey(null);
	                      handleAgentReplyToRowComment(localIndex, trimmedReply, source, context);
	                      setAsideReplyDrafts((drafts) => ({ ...drafts, [actionKey]: '' }));
	                    };

	                    return (
	                      <div
	                        className={`cmp-popup spec-done-comment-popup has-comments plan-diff-aside-comment${resolved ? ' is-resolved' : ''}`}
	                        key={`aside-comment-${row.id}-${group?.chatId || group?.label || 'local'}-${commentIndex}`}
	                        onClick={navigateToRow}
	                        onKeyDown={(event) => {
	                          if (event.target instanceof Element && event.target.closest('button, textarea')) return;
	                          if (event.key !== 'Enter' && event.key !== ' ') return;
	                          event.preventDefault();
	                          navigateToRow();
	                        }}
	                        role="button"
	                        tabIndex={0}
	                        title={displayText}
	                      >
	                        <div className="spec-done-comment-popup-groups">
	                          <div className="spec-done-comment-popup-group">
	                            <div className="spec-done-comment-popup-list">
	                              <div className="spec-done-comment-popup-item is-agent-authored">
	                                <div className="spec-done-comment-popup-item-body">
	                                  <div className={`spec-done-comment-agent-reply${resolved ? ' is-resolved' : ''}`}>
	                                    <div className="spec-done-comment-agent-reply-thread">
	                                      <div className="spec-done-comment-agent-reply-head">
	                                        <span className={`spec-done-comment-agent-reply-avatar${isProcessing ? ' is-processing' : ''}`} aria-hidden="true">
	                                          {isProcessing
	                                            ? <Loader size={16} />
	                                            : isAgentAuthored
	                                              ? <AiChatAgentIcon icon={commentContextIcon} />
	                                              : <Icon name="general/user" size={16} />}
	                                        </span>
	                                        <span className="spec-done-comment-agent-reply-name">{isAgentAuthored ? getAiReviewAgentLabel(commentContextIcon) : 'You'}</span>
                                        {resolveKeepsComment && ['critical', 'warning', 'info'].includes(String(comment?.severity || '').toLowerCase()) && (
                                          <span className={`spec-done-status-severity is-${String(comment.severity).toLowerCase()}`}>
                                            {String(comment.severity).toLowerCase()}
                                          </span>
                                        )}
	                                        {resolveKeepsComment && findingStatus !== 'open' && (
	                                          <span className={`spec-done-comment-resolved-badge${resolvedBadgeTone}`}>{resolvedLabel}</span>
	                                        )}
	                                        <PlanDiffCommentActionsMenu
	                                          actions={[
	                                            {
	                                              label: 'Go to code',
	                                              icon: 'general/locate',
	                                              onSelect: navigateToRow,
	                                            },
	                                            ...(!commentsReadOnly && findingStatus === 'open' && !resolved && !comment?.reviewReadOnly && !isProcessing ? [
	                                              {
	                                                label: changeLabel || 'Apply fix',
	                                                icon: 'codeInsight/quickfixBulb',
	                                                onSelect: () => runAsideAction('quickfix'),
	                                              },
	                                              ...(allowCommentReplies ? [{
	                                                label: 'Reply',
	                                                icon: 'general/balloon',
	                                                onSelect: () => setAsideReplyComposerKey(actionKey),
	                                              }] : []),
	                                              {
	                                                label: 'Dismiss',
	                                                icon: 'general/hide',
	                                                onSelect: () => runAsideAction('dismiss'),
	                                              },
	                                              {
	                                                label: 'Delete',
	                                                icon: 'general/delete',
	                                                onSelect: () => deleteRowComment(localIndex, source, context),
	                                              },
	                                            ] : []),
	                                          ]}
	                                        />
	                                      </div>
	                                      <span className="spec-done-comment-agent-reply-text plan-diff-aside-comment-text">{displayText}</span>
	                                      {showCommentSourceContext && (fileLabel || lineLabel || codeContextRows.length > 0) && (
	                                        <div
	                                          className="plan-diff-aside-comment-source"
	                                          onClick={(event) => event.stopPropagation()}
	                                        >
	                                          <TreeNode
	                                            key={`${actionKey}-${isCodeExpanded ? 'expanded' : 'collapsed'}`}
	                                            className="plan-diff-aside-comment-source-tree"
	                                            label={sourceLabel}
	                                            icon={fileLabel ? sourceIcon : undefined}
	                                            secondaryText={lineLabel || undefined}
	                                            hasChildren={codeContextRows.length > 0}
	                                            isExpanded={isCodeExpanded}
	                                            onToggle={setCodeExpanded}
	                                            onSelect={() => setCodeExpanded(!isCodeExpanded)}
	                                          >
	                                            {codeContextRows.length > 0 && (
	                                              <PlanDiffCommentCodeSnippet
	                                                rows={codeContextRows}
	                                                language={diffData?.language || 'text'}
	                                                targetRowIds={targetRowIds}
	                                                onOpen={onCommentSourceOpen
	                                                  ? () => onCommentSourceOpen(row.id, { rowIds: targetRowIds, comment })
	                                                  : null}
	                                              />
	                                            )}
	                                          </TreeNode>
	                                        </div>
	                                      )}
	                                      {!isAgentAuthored && agentReply.length > 0 && (
	                                        <div className="spec-done-comment-agent-follow-up-reply">
	                                          <div className="spec-done-comment-agent-reply-head">
	                                            <span className="spec-done-comment-agent-reply-avatar" aria-hidden="true">
	                                              <AiChatAgentIcon icon={commentContextIcon} />
	                                            </span>
	                                            <span className="spec-done-comment-agent-reply-name">{getAiReviewAgentLabel(commentContextIcon)}</span>
	                                          </div>
	                                          <p className="spec-done-comment-agent-reply-text">{agentReply}</p>
	                                        </div>
	                                      )}
	                                      {allowCommentReplies && userReply.length > 0 && (
	                                        <div className="spec-done-comment-agent-user-reply">
	                                          <div className="spec-done-comment-agent-user-reply-head">
	                                            <span className="spec-done-comment-agent-user-reply-icon" aria-hidden="true">
	                                              <Icon name="general/user" size={16} />
	                                            </span>
	                                            <span className="spec-done-comment-agent-user-reply-name">You</span>
	                                          </div>
	                                          <p className="spec-done-comment-agent-user-reply-text">{userReply}</p>
	                                        </div>
	                                      )}
	                                      {agentFollowUpReply.length > 0 && (
	                                        <div className="spec-done-comment-agent-follow-up-reply">
	                                          <div className="spec-done-comment-agent-reply-head">
	                                            <span className="spec-done-comment-agent-reply-avatar" aria-hidden="true">
	                                              <AiChatAgentIcon icon={commentContextIcon} />
	                                            </span>
	                                            <span className="spec-done-comment-agent-reply-name">{getAiReviewAgentLabel(commentContextIcon)}</span>
	                                          </div>
	                                          <p className="spec-done-comment-agent-reply-text">{agentFollowUpReply}</p>
	                                        </div>
	                                      )}
	                                      {!commentsReadOnly && findingStatus === 'open' && !resolved && !comment?.reviewReadOnly && hasActionableAgentResponse && !isProcessing && !isReplyComposerOpen && (
	                                        <div className="spec-done-comment-agent-reply-actions plan-diff-aside-comment-actions">
	                                          <button
	                                            type="button"
	                                            className="spec-done-comment-agent-reply-link is-change-cta"
	                                            onClick={(event) => {
	                                              event.stopPropagation();
	                                              runAsideAction('quickfix');
	                                            }}
	                                          >
	                                            {changeLabel || 'Apply fix'}
	                                          </button>
	                                          {allowCommentReplies && (
	                                            <button
	                                              type="button"
	                                              className="spec-done-comment-agent-reply-link"
	                                              onClick={(event) => {
	                                                event.stopPropagation();
	                                                setAsideReplyComposerKey(actionKey);
	                                              }}
	                                            >
	                                              Reply
	                                            </button>
	                                          )}
	                                        </div>
	                                      )}
	                                      {allowCommentReplies && !commentsReadOnly && findingStatus === 'open' && !resolved && !comment?.reviewReadOnly && hasActionableAgentResponse && isReplyComposerOpen && (
	                                        <div
	                                          className="spec-done-comment-agent-reply-compose plan-diff-aside-comment-reply"
	                                          onClick={(event) => event.stopPropagation()}
	                                          onKeyDown={(event) => {
	                                            event.stopPropagation();
	                                            if (event.key === 'Enter' && !event.shiftKey) {
	                                              event.preventDefault();
	                                              submitAsideReply();
	                                            }
	                                            if (event.key === 'Escape') {
	                                              event.preventDefault();
	                                              setAsideReplyComposerKey(null);
	                                            }
	                                          }}
	                                        >
	                                          <div className="spec-done-comment-popup-input-wrap">
	                                            <textarea
	                                              className="spec-done-comment-popup-textarea text-ui-default"
	                                              value={replyDraft}
	                                              placeholder="Reply to Claude Agent"
	                                              autoFocus
	                                              rows={1}
	                                              onChange={(event) => setAsideReplyDrafts((drafts) => ({
	                                                ...drafts,
	                                                [actionKey]: event.target.value,
	                                              }))}
	                                            />
	                                          </div>
	                                          <div className="spec-done-comment-popup-footer">
	                                            <div className="spec-done-comment-popup-actions">
	                                              <Button
	                                                type="secondary"
	                                                onClick={() => setAsideReplyComposerKey(null)}
	                                              >
	                                                Cancel
	                                              </Button>
	                                              <Button
	                                                type="primary"
	                                                disabled={!replyDraft.trim()}
	                                                onClick={submitAsideReply}
	                                              >
	                                                Send
	                                              </Button>
	                                            </div>
	                                          </div>
	                                        </div>
	                                      )}
	                                    </div>
	                                  </div>
	                                </div>
	                              </div>
	                            </div>
	                          </div>
	                        </div>
	                      </div>
	                    );
	                  })}
	                </Fragment>
	              );
	            }
	            return (
	              <Fragment key={row.id}>
	                {renderCodeRow()}
	                {renderCommentRow()}
	              </Fragment>
	            );
	            });
	            };
	          return effectiveViewMode === 'split' ? (
	            <div className="plan-diff-split-code">
	              <div className="plan-diff-split-pane plan-diff-split-pane-left">
	                {renderPlanDiffRows('split-left')}
	              </div>
	              <div className="plan-diff-split-pane plan-diff-split-pane-right">
	                {renderPlanDiffRows('split-right')}
	              </div>
	            </div>
	          ) : effectiveViewMode === 'aside' ? (
	            <div className="plan-diff-aside">
	              <div className="plan-diff-aside-code">
	                {renderPlanDiffRows('aside-code')}
	              </div>
	              <div className="plan-diff-aside-comments">
	                {renderPlanDiffRows('aside-comments')}
	              </div>
	            </div>
	          ) : effectiveViewMode === 'code' ? (
	            // Code-only can still render inline threads when the host wants
	            // the right comments column to work as navigation, not replacement.
	            <div className="plan-diff-code-only">
	              {renderPlanDiffRows('aside-code')}
	            </div>
	          ) : effectiveViewMode === 'comments' ? (
	            // Comments-only: just this file's real comment cards, for the shared
	            // right-hand comments column (no code).
	            <div className="plan-diff-comments-only">
	              {renderPlanDiffRows('aside-comments')}
	            </div>
	          ) : renderPlanDiffRows();
	        })()}
          </div>
        </div>
      </div>
      {shortcutHintPosition && createPortal(
        <div
          className="plan-diff-comment-shortcut-hint"
          role="tooltip"
          style={{
            left: `${shortcutHintPosition.left}px`,
            top: `${shortcutHintPosition.top}px`,
            '--plan-diff-comment-shortcut-arrow-x': `${shortcutHintPosition.arrowX}px`,
          }}
          data-placement={shortcutHintPosition.placement}
        >
          <span className="plan-diff-comment-shortcut-title">Add AI Notes faster</span>
          <span className="plan-diff-comment-shortcut-copy">
            <span>Press</span>
            <span className="plan-diff-comment-shortcut-keys" aria-label="Option Shift K">
              <kbd>⌥</kbd>
              <kbd>⇧</kbd>
              <kbd>K</kbd>
            </span>
            <span>from the editor</span>
          </span>
        </div>,
        document.body,
      )}
      {gutterContextMenu && (
        <PlanDiffGutterContextMenu
          point={gutterContextMenu.point}
          onClose={() => setGutterContextMenu(null)}
          plainFileGutterCommentsEnabled={plainFileGutterCommentsEnabled}
          onPlainFileGutterCommentsEnabledChange={onPlainFileGutterCommentsEnabledChange}
          diffGutterCommentsEnabled={diffGutterCommentsEnabled}
          onDiffGutterCommentsEnabledChange={onDiffGutterCommentsEnabledChange}
          commentSettingsKind={singleLineNumbers ? 'file' : 'diff'}
        />
      )}
    </>
  );
}

function formatPlanDiffDifferenceLabel(count) {
  if (count === 1) return '1 difference';
  return `${count} differences`;
}

export function PlanDiffEditorToolbar({
  diffData,
  viewMode = 'unified',
  onViewModeChange = null,
  onNavigatePrevious = null,
  onNavigateNext = null,
  scopeId = 'new',
  scopeFiles = null,
  currentFileIndex = 0,
  onSelectFile = null,
  onNavigatePreviousFile = null,
  onNavigateNextFile = null,
}) {
  const fileLabel = diffData?.sourceTabLabel || diffData?.title || 'File';
  const fileCount = Number.isFinite(diffData?.fileCount) ? diffData.fileCount : 1;

  return (
    <div className="plan-diff-toolbar-shell">
      <div className="plan-diff-toolbar">
        <div className="plan-diff-toolbar-left">
          <PlanDiffViewingScopeControl
            fileCount={fileCount}
            currentFileLabel={fileLabel}
            selectedScopeId={scopeId}
            files={scopeFiles}
            currentFileIndex={currentFileIndex}
            onSelectFile={onSelectFile}
            onNavigatePrevious={onNavigatePreviousFile}
            onNavigateNext={onNavigateNextFile}
          />
          <ToolbarSeparator className="plan-diff-toolbar-separator" />
          <div className="plan-diff-toolbar-group">
            <PlanDiffToolbarIconButton label="Scroll up" icon="up" onClick={onNavigatePrevious} />
            <PlanDiffToolbarIconButton label="Scroll down" icon="down" onClick={onNavigateNext} />
          </div>
          <ToolbarSeparator className="plan-diff-toolbar-separator" />
          <div className="plan-diff-toolbar-group">
            <PlanDiffToolbarIconButton label="Edit source" icon="edit" />
            <PlanDiffToolbarIconButton label="Collapse unchanged fragments" icon="collapse" />
          </div>
        </div>
        <div className="plan-diff-toolbar-right">
          <span className="plan-diff-toolbar-meta text-ui-default">
            {formatPlanDiffDifferenceLabel(diffData?.differenceCount ?? 0)}
          </span>
          <ToolbarSeparator className="plan-diff-toolbar-separator" />
          <SegmentedControl
            className="aiux-review-overview-viewtoggle plan-diff-toolbar-viewtoggle"
            value={viewMode}
            onChange={onViewModeChange}
            options={[
              { value: 'split', label: <Icon name="general/splitVertically" size={16} /> },
              { value: 'unified', label: <Icon name="general/editorOnly" size={16} /> },
            ]}
          />
          <PlanDiffToolbarIconButton label="Settings" icon="settings" />
        </div>
      </div>
      <div className="plan-diff-content-labels">
        <PlanDiffContentLabel>Initial content</PlanDiffContentLabel>
        <PlanDiffContentLabel>New content</PlanDiffContentLabel>
      </div>
    </div>
  );
}

export function PlanDiffInline({ diffData }) {
  const rows = useMemo(
    () => orderPlanDiffRowsForDisplay(diffData?.rows ?? []),
    [diffData?.rows],
  );
  const language = diffData?.language || 'text';

  return (
    <div className="plan-diff-inline">
      {rows.map((row) => {
        const fragments = row.fragments ?? [{ text: row.text || ' ', tone: 'plain' }];
        return (
          <div key={row.id} className={`plan-diff-inline-row plan-diff-inline-${row.kind}`}>
            {fragments.map((fragment, fi) => (
              <span
                key={fi}
                className={`plan-diff-fragment${fragment.tone && fragment.tone !== 'plain' ? ` is-${fragment.tone}` : ''}`}
              >
                {tokenizeCodeFragment(fragment.text || ' ', language).map((token, ti) => (
                  <span key={ti} className={`plan-diff-token plan-diff-token-${token.type}`}>
                    {token.text}
                  </span>
                ))}
              </span>
            ))}
          </div>
        );
      })}
    </div>
  );
}

export function PlanDiffEditorArea({
  diffData,
  contextSelections = [],
  // Attachments exactly as the chat composer renders them, so the AI Review popup opens with the
  // same chips (same notes, selections and hover cards) instead of a locally rebuilt one.
  composerAttachments = null,
  viewerData = null,
  initialDiffComments = {},
  documentDiffComments = {},
  documentContextLabel = '',
  documentContextIcon = 'fileTypes/markdown',
  documentContextSessionLabel = 'Related Chats',
  documentContextSourceTabId = null,
  defaultSubmitAttachMode = 'current',
  defaultSubmitTargetLabel = '',
  defaultSubmitTargetIcon = '',
  defaultSubmitTargetKey = '',
  commentSessions = [],
  commentSessionActiveChatId = '',
  commentsReadOnly = false,
  commentContextLabel = '',
  commentContextIcon = 'claude',
  commentContextSessionLabel = '',
  onDiffCommentsChange = null,
  onDiffCommentSubmit = null,
  onGutterCommentToggle = null,
  onRowDelete = null,
  onRowFix = null,
  onPlanMarkerClick = null,
  onReturnToChat = null,
  onNavigatePrevious = null,
  onNavigateNext = null,
  reviewNav = null,
  severityFilter = 'all',
  resolveKeepsComment = false,
  allowInlineCommentCompose = true,
  viewMode = 'unified',
  onCommentNavigate = null,
  inlineCommentRowIdOnly = false,
  expandedInlineCommentRowId = null,
  onInlineCommentExpand = null,
  uiState = null,
  onUiStateChange = null,
  singleLineNumbers = false,
  showGutterComments = true,
  plainFileGutterCommentsEnabled = true,
  onPlainFileGutterCommentsEnabledChange = null,
  diffGutterCommentsEnabled = true,
  onDiffGutterCommentsEnabledChange = null,
  pendingCommentRowIds = [],
  commentShortcutHintRowId = null,
  onTextSelectionChange = null,
  onInlineCommentOpenChange = null,
  externalCommentRequest = null,
  inspectionWidget = null,
  renderSubmitTargetPicker = null,
  reviewSourceTabId = null,
  onStartReview = null,
}) {
  const toolbarRef = useRef(null);
  const [overlayHost, setOverlayHost] = useState(null);
  // Local diff-display switch (split ↔ unified). The review "comments panel"
  // mode ('aside') comes in via `viewMode` and overrides this local layout.
  const [diffLayout, setDiffLayout] = useState('unified');
  const viewingScopeId = 'new';
  const effectiveViewMode = viewMode === 'aside' ? 'aside' : diffLayout;
  const toolbarFileLabel = diffData?.sourceTabLabel || diffData?.title || 'VisitController.java';
  const toolbarFileCount = Number.isFinite(diffData?.fileCount) ? diffData.fileCount : 3;
  const hasReviewableChanges = Number(diffData?.differenceCount ?? 0) > 0
    || (diffData?.rows ?? []).some((row) => row?.kind === 'added' || row?.kind === 'removed');
  const viewingScopeOptions = buildPlanDiffScopeOptions(toolbarFileCount, toolbarFileLabel);
  const viewingScope = viewingScopeOptions.find((item) => item.id === viewingScopeId) ?? viewingScopeOptions[0];
  const reviewDialogScopeId = viewingScopeId === 'current-file' ? 'file' : viewingScopeId === 'all' ? 'all' : 'current';
  const reviewDiffComments = {};
  const reviewCommentKeys = new Set();
  const appendReviewComments = (commentState = {}) => {
    Object.entries(commentState ?? {}).forEach(([rowId, comments]) => {
      (Array.isArray(comments) ? comments : [comments]).filter(Boolean).forEach((comment) => {
        const text = typeof comment === 'string' ? comment.trim() : String(comment?.text ?? '').trim();
        if (!text) return;
        const lineLabel = typeof comment === 'object' ? String(comment?.lineLabel ?? '').trim() : '';
        const key = `${rowId}\u0000${lineLabel}\u0000${text}`;
        if (reviewCommentKeys.has(key)) return;
        reviewCommentKeys.add(key);
        reviewDiffComments[rowId] = [...(reviewDiffComments[rowId] ?? []), comment];
      });
    });
  };
  appendReviewComments(initialDiffComments);
  (Array.isArray(commentSessions) ? commentSessions : []).forEach((session) => {
    appendReviewComments(session?.comments);
  });
  const reviewComments = Object.values(reviewDiffComments).flat();
  const localReviewSourceAttachments = [{
    id: `diff-${toolbarFileLabel}`,
    label: `Diff ${toolbarFileLabel}`,
    meta: viewingScope.meta,
    icon: 'vcs/diff',
    commentCount: reviewComments.length,
    comments: reviewComments,
    diffComments: reviewDiffComments,
    diffTabId: reviewSourceTabId,
    sourceTabId: reviewSourceTabId,
    sourceLabel: toolbarFileLabel,
  }];
  // Prefer the chat composer's own attachment objects when they cover this diff: they carry the
  // selections, notes and reply threads the composer chip hovers with.
  const composerReviewAttachments = Array.isArray(composerAttachments)
    ? composerAttachments.filter((attachment) => (
      attachment?.diffTabId === reviewSourceTabId
      || attachment?.sourceTabId === reviewSourceTabId
      || attachment?.sourceLabel === toolbarFileLabel
    ))
    : [];
  const reviewSourceAttachments = composerReviewAttachments.length > 0
    ? composerReviewAttachments
    : localReviewSourceAttachments;

  useEffect(() => {
    if (!toolbarRef.current) {
      setOverlayHost(null);
      return undefined;
    }

    let frameId = 0;
    frameId = requestAnimationFrame(() => {
      const editorEl = toolbarRef.current?.closest('.editor');
      const nextHost = editorEl?.querySelector('.editor-body');
      setOverlayHost(nextHost instanceof HTMLElement ? nextHost : null);
    });

    return () => {
      if (frameId) cancelAnimationFrame(frameId);
      setOverlayHost(null);
    };
  }, [diffData?.focusRowId]);

  return (
    <>
      <div className="plan-diff-editor-area" ref={toolbarRef}>
        {singleLineNumbers && reviewNav && (
          <div className="plan-diff-toolbar-shell">
            <div className="plan-diff-toolbar">
              <div className="plan-diff-toolbar-left">
                {reviewNav}
              </div>
              <div className="plan-diff-toolbar-right">
                <PlanDiffToolbarIconButton label="Settings" icon="settings" />
              </div>
            </div>
          </div>
        )}
        {!singleLineNumbers && (
          <div className="plan-diff-toolbar-shell">
            <div className="plan-diff-toolbar">
              <div className="plan-diff-toolbar-left">
                {reviewNav}
                {reviewNav && <ToolbarSeparator className="plan-diff-toolbar-separator" />}
              <PlanDiffViewingScopeControl
                fileCount={toolbarFileCount}
                currentFileLabel={toolbarFileLabel}
                selectedScopeId={viewingScopeId}
              />
                <ToolbarSeparator className="plan-diff-toolbar-separator" />
                <div className="plan-diff-toolbar-group">
                  <PlanDiffToolbarIconButton label="Scroll up" icon="up" onClick={onNavigatePrevious} />
                  <PlanDiffToolbarIconButton label="Scroll down" icon="down" onClick={onNavigateNext} />
                </div>
                <ToolbarSeparator className="plan-diff-toolbar-separator" />
                <div className="plan-diff-toolbar-group">
                  <PlanDiffToolbarIconButton label="Edit source" icon="edit" />
                  <PlanDiffToolbarIconButton label="Collapse unchanged fragments" icon="collapse" />
                </div>
                {onStartReview && (
                  <>
                    <ToolbarSeparator className="plan-diff-toolbar-separator" />
                    <div className="plan-diff-review-action-group" aria-label="Review controls">
                      <PlanDiffNewReviewButton
                        disabled={!hasReviewableChanges}
                        disabledReason="No changes to review"
                        currentScopeLabel="New changes"
                        currentFileLabel={toolbarFileLabel}
                        initialScopeId={reviewDialogScopeId}
                        contextLabel={viewingScope.label}
                        contextMeta={viewingScope.meta}
                        contextIcon="general/listFiles"
                        sourceAttachments={reviewSourceAttachments}
                        onStartReview={onStartReview}
                        launchSource="diff"
                      />
                    </div>
                  </>
                )}
              </div>
              <div className="plan-diff-toolbar-right">
                <span className="plan-diff-toolbar-meta text-ui-default">{formatPlanDiffDifferenceLabel(diffData?.differenceCount ?? 0)}</span>
                <ToolbarSeparator className="plan-diff-toolbar-separator" />
                {viewMode !== 'aside' && (
                  <SegmentedControl
                    className="aiux-review-overview-viewtoggle plan-diff-toolbar-viewtoggle"
                    value={diffLayout}
                    onChange={setDiffLayout}
                    options={[
                      { value: 'split', label: <Icon name="general/splitVertically" size={16} /> },
                      { value: 'unified', label: <Icon name="general/editorOnly" size={16} /> },
                    ]}
                  />
                )}
                <PlanDiffToolbarIconButton label="Settings" icon="settings" />
              </div>
            </div>
            <div className="plan-diff-content-labels">
              <PlanDiffContentLabel>Initial content</PlanDiffContentLabel>
              <PlanDiffContentLabel>New content</PlanDiffContentLabel>
            </div>
          </div>
        )}
      </div>
      {overlayHost && createPortal(
        <PlanDiffOverlay
          diffData={diffData}
          contextSelections={contextSelections}
          initialDiffComments={initialDiffComments}
          documentDiffComments={documentDiffComments}
          documentContextLabel={documentContextLabel}
          documentContextIcon={documentContextIcon}
          documentContextSessionLabel={documentContextSessionLabel}
          documentContextSourceTabId={documentContextSourceTabId}
          defaultSubmitAttachMode={defaultSubmitAttachMode}
          defaultSubmitTargetLabel={defaultSubmitTargetLabel || documentContextLabel}
          defaultSubmitTargetIcon={defaultSubmitTargetIcon || documentContextIcon}
          defaultSubmitTargetKey={defaultSubmitTargetKey}
          commentSessions={commentSessions}
          commentSessionActiveChatId={commentSessionActiveChatId}
          commentsReadOnly={commentsReadOnly}
          commentContextLabel={commentContextLabel}
          commentContextIcon={commentContextIcon}
          commentContextSessionLabel={commentContextSessionLabel}
          onDiffCommentsChange={onDiffCommentsChange}
          onDiffCommentSubmit={onDiffCommentSubmit}
          onGutterCommentToggle={onGutterCommentToggle}
          onRowDelete={onRowDelete}
          onRowFix={onRowFix}
          onPlanMarkerClick={onPlanMarkerClick}
          onReturnToChat={onReturnToChat}
          severityFilter={severityFilter}
          resolveKeepsComment={resolveKeepsComment}
          allowInlineCommentCompose={allowInlineCommentCompose}
          viewMode={effectiveViewMode}
          onCommentNavigate={onCommentNavigate}
          inlineCommentRowIdOnly={inlineCommentRowIdOnly}
          expandedInlineCommentRowId={expandedInlineCommentRowId}
          onInlineCommentExpand={onInlineCommentExpand}
          uiState={uiState}
          onUiStateChange={onUiStateChange}
          singleLineNumbers={singleLineNumbers}
          showGutterComments={showGutterComments}
          plainFileGutterCommentsEnabled={plainFileGutterCommentsEnabled}
          onPlainFileGutterCommentsEnabledChange={onPlainFileGutterCommentsEnabledChange}
          diffGutterCommentsEnabled={diffGutterCommentsEnabled}
          onDiffGutterCommentsEnabledChange={onDiffGutterCommentsEnabledChange}
          inspectionWidget={inspectionWidget}
          renderSubmitTargetPicker={renderSubmitTargetPicker}
          externalCommentRequest={externalCommentRequest}
          onTextSelectionChange={onTextSelectionChange}
          onInlineCommentOpenChange={onInlineCommentOpenChange}
	          pendingCommentRowIds={pendingCommentRowIds}
	          commentShortcutHintRowId={commentShortcutHintRowId}
	        />,
        overlayHost
      )}
    </>
  );
}

function normalizePlanDiffViewerStatus(status) {
  if (status === 'passed' || status === 'warning' || status === 'failed') {
    return status;
  }

  return 'pending';
}

function normalizePlanDiffViewerData(viewerData = null, diffData = null) {
  const fallbackChangedFiles = [
    diffData?.sourceTabLabel,
    ...((diffData?.rows ?? []).map((row) => row.file).filter((file) => typeof file === 'string' && file.trim().length > 0)),
  ].filter((file, index, files) => typeof file === 'string' && file.trim().length > 0 && files.indexOf(file) === index);

  const normalizedPlanItems = Array.isArray(viewerData?.planItems)
    ? viewerData.planItems
      .map((item, index) => ({
        id: typeof item?.id === 'string' && item.id.length > 0 ? item.id : `plan-viewer-item-${index}`,
        text: typeof item?.text === 'string' && item.text.trim().length > 0
          ? item.text.trim()
          : (diffData?.lineText ?? diffData?.title ?? 'Plan item'),
        status: normalizePlanDiffViewerStatus(item?.status),
        files: Array.isArray(item?.files)
          ? item.files.filter((file, fileIndex, files) => typeof file === 'string' && file.trim().length > 0 && files.indexOf(file) === fileIndex)
          : [],
        isCurrent: Boolean(item?.isCurrent),
      }))
      .filter((item) => item.text.length > 0)
    : [];

  const fallbackPlanItems = normalizedPlanItems.length > 0
    ? normalizedPlanItems
    : [{
        id: 'plan-viewer-fallback-item',
        text: diffData?.lineText ?? diffData?.title ?? 'Plan item',
        status: 'pending',
        files: [],
        isCurrent: true,
      }];

  const normalizedChangedFiles = Array.isArray(viewerData?.changedFiles)
    ? viewerData.changedFiles
      .filter((file, index, files) => typeof file === 'string' && file.trim().length > 0 && files.indexOf(file) === index)
    : fallbackChangedFiles;

  const hasFileAssignment = fallbackPlanItems.some((item) => item.files.length > 0);
  if (!hasFileAssignment && normalizedChangedFiles.length > 0) {
    const currentItemIndex = fallbackPlanItems.findIndex((item) => item.isCurrent);
    const targetIndex = currentItemIndex >= 0 ? currentItemIndex : 0;
    fallbackPlanItems[targetIndex] = {
      ...fallbackPlanItems[targetIndex],
      files: normalizedChangedFiles,
    };
  }

  return {
    planItems: fallbackPlanItems,
    changedFiles: normalizedChangedFiles,
  };
}

function resolvePlanDiffViewerFileIcon(fileName = '') {
  const normalized = String(fileName).toLowerCase();

  if (normalized.endsWith('.java')) return 'fileTypes/java';
  if (normalized.endsWith('.html')) return 'fileTypes/html';
  if (normalized.endsWith('.md')) return 'fileTypes/markdown';
  if (normalized.endsWith('.py')) return 'fileTypes/python';
  if (normalized.endsWith('.sql')) return 'fileTypes/sql';

  return 'fileTypes/text';
}

function PlanDiffViewerPythonFileIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path fillRule="evenodd" clipRule="evenodd" d="M8.00001 1C11 1 11 2 11 4L11 6.5C11 7.32843 10.3284 8 9.5 8H6.5C5.11929 8 4 9.11929 4 10.5V11C2 11 1 11 1 7.99999C1 4.99999 2 4.99998 4 4.99998L7.5 5C7.77614 5 8 4.77614 8 4.5C8 4.22386 7.77614 4 7.5 4H5.00001C5.00001 2 5.00001 1 8.00001 1ZM6.5 3C6.77614 3 7 2.77614 7 2.5C7 2.22386 6.77614 2 6.5 2C6.22386 2 6 2.22386 6 2.5C6 2.77614 6.22386 3 6.5 3Z" fill="#548AF7" />
      <path fillRule="evenodd" clipRule="evenodd" d="M12 5V6.5C12 7.88071 10.8807 9 9.5 9H6.5C5.67157 9 5 9.67157 5 10.5L5.00001 12C4.99946 14 5.00001 15 8.00001 15C11 15 11 14 11 12L8.5 12C8.22386 12 8 11.7761 8 11.5C8 11.2239 8.22386 11 8.5 11L12 11C14 11.0005 15 11 15 7.99999C15 5.00002 14 5.00001 12 5ZM9.5 14C9.77614 14 10 13.7761 10 13.5C10 13.2239 9.77614 13 9.5 13C9.22386 13 9 13.2239 9 13.5C9 13.7761 9.22386 14 9.5 14Z" fill="#F2C55C" />
    </svg>
  );
}

function PlanDiffViewerGenericFileIcon({ tone = '#CED0D6' }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M4.25 1.75H9.25L12.75 5.25V13.25C12.75 13.8023 12.3023 14.25 11.75 14.25H4.25C3.69772 14.25 3.25 13.8023 3.25 13.25V2.75C3.25 2.19772 3.69772 1.75 4.25 1.75Z" fill="rgba(206, 208, 214, 0.12)" stroke={tone} />
      <path d="M9.25 1.75V5.25H12.75" stroke={tone} strokeLinejoin="round" />
    </svg>
  );
}

function PlanDiffViewerFileIcon({ fileName = '' }) {
  const normalized = String(fileName).toLowerCase();

  if (normalized.endsWith('.py')) {
    return <PlanDiffViewerPythonFileIcon />;
  }

  const iconName = resolvePlanDiffViewerFileIcon(fileName);
  if (iconName === 'fileTypes/text') {
    return <PlanDiffViewerGenericFileIcon />;
  }

  return (
    <span className="plan-diff-viewer-fallback-icon">
      <Icon name={iconName} size={16} />
    </span>
  );
}

function resolvePlanDiffViewerPopupStyle(anchorRect = null) {
  if (typeof window === 'undefined') {
    return { top: 12, left: 12, right: 12 };
  }

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const horizontalInset = 12;
  const verticalInset = 12;
  const preferredWidth = Math.min(442, viewportWidth - (horizontalInset * 2));
  const preferredHeight = Math.min(342, viewportHeight - (verticalInset * 2));

  if (!anchorRect || viewportWidth <= 520) {
    return {
      top: verticalInset,
      left: horizontalInset,
      right: horizontalInset,
      height: preferredHeight,
      maxHeight: preferredHeight,
    };
  }

  const estimatedHeight = preferredHeight;
  const nextLeft = Math.min(
    Math.max(horizontalInset, anchorRect.right - preferredWidth),
    Math.max(horizontalInset, viewportWidth - preferredWidth - horizontalInset),
  );
  const nextTop = Math.min(
    Math.max(verticalInset, anchorRect.bottom + 8),
    Math.max(verticalInset, viewportHeight - estimatedHeight - verticalInset),
  );

  return {
    top: nextTop,
    left: nextLeft,
    width: preferredWidth,
    maxHeight: estimatedHeight,
  };
}

function PlanDiffViewerStatusIcon({ status }) {
  if (status === 'passed') {
    return (
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
        <path d="M9.75 0H2.25C1.00736 0 0 1.00736 0 2.25V9.75C0 10.9926 1.00736 12 2.25 12H9.75C10.9926 12 12 10.9926 12 9.75V2.25C12 1.00736 10.9926 0 9.75 0Z" fill="#57965C" />
        <path d="M3 6.375L5.25 8.625L9.375 3.75" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (status === 'warning') {
    return (
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
        <rect width="12" height="12" rx="3" fill="#2E436E" />
        <rect x="3" y="5.25" width="6" height="1.5" rx="0.75" fill="#DFE1E5" />
      </svg>
    );
  }

  if (status === 'failed') {
    return (
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
        <rect width="12" height="12" rx="3" fill="#6D3136" />
        <path d="M3.75 3.75L8.25 8.25M8.25 3.75L3.75 8.25" stroke="#FFF" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <rect x="0.5" y="0.5" width="11" height="11" rx="2.5" stroke="#4C4F56" />
    </svg>
  );
}

function PlanDiffViewerPopup({ diffData, viewerData = null, anchorRect = null, onClose }) {
  const popupRef = useRef(null);
  const resolvedViewerData = useMemo(
    () => normalizePlanDiffViewerData(viewerData, diffData),
    [diffData, viewerData],
  );
  const popupStyle = useMemo(
    () => resolvePlanDiffViewerPopupStyle(anchorRect),
    [anchorRect],
  );
  const activeFile = useMemo(() => {
    const currentItemFile = resolvedViewerData.planItems.find((item) => item.isCurrent && item.files.length > 0)?.files[0];
    if (typeof currentItemFile === 'string' && currentItemFile.length > 0) {
      return currentItemFile;
    }

    const changedFile = resolvedViewerData.changedFiles.find((file) => typeof file === 'string' && file.length > 0);
    if (typeof changedFile === 'string' && changedFile.length > 0) {
      return changedFile;
    }

    return resolvedViewerData.planItems.find((item) => item.files.length > 0)?.files[0] ?? null;
  }, [resolvedViewerData]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose?.();
      }
    };

    const handlePointerDown = (event) => {
      if (!popupRef.current || popupRef.current.contains(event.target)) {
        return;
      }

      onClose?.();
    };

    const handleViewportResize = () => {
      onClose?.();
    };

    const handleViewportScroll = (event) => {
      if (popupRef.current?.contains(event.target)) {
        return;
      }

      onClose?.();
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('resize', handleViewportResize);
    window.addEventListener('scroll', handleViewportScroll, true);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('resize', handleViewportResize);
      window.removeEventListener('scroll', handleViewportScroll, true);
    };
  }, [onClose]);

  if (typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div
      ref={popupRef}
      className="plan-diff-viewer-popup"
      style={popupStyle}
      role="dialog"
      aria-modal="true"
      aria-label="Viewer mode"
    >
      <div className="plan-diff-viewer-list">
        {resolvedViewerData.planItems.map((item) => (
          <section key={item.id} className={`plan-diff-viewer-card${item.isCurrent ? ' is-current' : ''}`}>
            <div className="plan-diff-viewer-card-header">
              <span className={`plan-diff-viewer-status plan-diff-viewer-status-${item.status}`}>
                <PlanDiffViewerStatusIcon status={item.status} />
              </span>
              <span className="plan-diff-viewer-card-title">{renderPlanDiffViewerTitle(item.text)}</span>
            </div>
            {item.files.length > 0 && (
              <div className="plan-diff-viewer-file-list">
                {item.files.map((file) => (
                  <div
                    key={`${item.id}-${file}`}
                    className={`plan-diff-viewer-file-row${file === activeFile ? ' is-active' : ''}`}
                    aria-selected={file === activeFile}
                  >
                    <span className="plan-diff-viewer-file-icon">
                      <PlanDiffViewerFileIcon fileName={file} />
                    </span>
                    <span className="plan-diff-viewer-file-label">{file}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        ))}
      </div>
    </div>,
    document.body,
  );
}

function renderPlanDiffViewerTitle(text = '') {
  const normalizedText = typeof text === 'string' ? text : '';
  const parts = normalizedText.split(/(@[A-Za-z0-9_.:/-]+)/g).filter(Boolean);

  return parts.map((part, index) => (
    part.startsWith('@')
      ? <span key={`${part}-${index}`} className="plan-diff-viewer-mention">{part}</span>
      : <Fragment key={`${part}-${index}`}>{part}</Fragment>
  ));
}
