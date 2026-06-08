import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon, Button, PositionedPopup, Popup, PopupCell, ToolbarButton, Badge } from '@jetbrains/int-ui-kit';
import { AiChatAgentIcon } from './AiChatListParts.jsx';

const PLAN_DIFF_DEFAULT_CARET_LEFT = 12;
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

function PlanDiffAgentTaskIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path fillRule="evenodd" clipRule="evenodd" d="M12.5929 9.9438L12.5929 4.70001L13.7929 4.70002L13.7929 9.94379L15.0763 8.66037L15.9248 9.5089L13.1929 12.2409L10.4609 9.5089L11.3095 8.66037L12.5929 9.9438Z" fill="#9B6BDA" />
      <path d="M0.5 4.70001H2.94558L4.65385 9.14463L4.76288 9.60155L4.85635 9.14463L6.51269 4.70001H8.98423V11.9692H7.14096V7.59732L7.17212 7.12482L5.34442 11.9692H4.08269L2.31212 7.17155L2.34327 7.59732V11.9692H0.5V4.70001Z" fill="#9B6BDA" />
    </svg>
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

  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 2C6.34386 2 5 3.34386 5 5C5 5.27614 5.22386 5.5 5.5 5.5C5.77614 5.5 6 5.27614 6 5C6 3.89614 6.89614 3 8 3C9.10386 3 10 3.89614 10 5C10 5.67621 9.86049 6.07982 9.68538 6.36C9.5025 6.6526 9.25707 6.85403 8.93765 7.10957L8.91812 7.12519C8.61602 7.36676 8.24644 7.66229 7.96663 8.11C7.67299 8.57982 7.5 9.17621 7.5 10V10.5C7.5 10.7761 7.72386 11 8 11C8.27614 11 8.5 10.7761 8.5 10.5V10C8.5 9.32379 8.63951 8.92018 8.81462 8.64C8.9975 8.3474 9.24293 8.14597 9.56235 7.89043L9.58188 7.87481C9.88398 7.63324 10.2536 7.33771 10.5334 6.89C10.827 6.42018 11 5.82379 11 5C11 3.34386 9.65614 2 8 2ZM8 14C8.41421 14 8.75 13.6642 8.75 13.25C8.75 12.8358 8.41421 12.5 8 12.5C7.58579 12.5 7.25 12.8358 7.25 13.25C7.25 13.6642 7.58579 14 8 14Z" fill="currentColor" />
    </svg>
  );
}

function PlanDiffToolbarIconButton({ label, icon, onClick = null }) {
  return (
    <button type="button" className="plan-diff-toolbar-icon-btn" aria-label={label} title={label} onClick={onClick}>
      <PlanDiffToolbarIcon type={icon} />
    </button>
  );
}

function PlanDiffToolbarSelect({ label, width = null, onClick = null }) {
  return (
    <button type="button" className="plan-diff-toolbar-select" style={width ? { width } : undefined} aria-label={label} onClick={onClick}>
      <span className="plan-diff-toolbar-select-label">{label}</span>
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M11.5 6.25L8 9.75L4.5 6.25" stroke="#B4B8BF" strokeLinecap="round" />
      </svg>
    </button>
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

export function DiffInlineCommentPopup({
  comments,
  commentGroups = null,
  value,
  editingIndex,
  showCompose = true,
  commentsReadOnly = false,
  defaultSubmitAttachMode = 'current',
  submitAttachModes = ['current', 'new'],
  commentContextLabel = '',
  commentContextIcon = 'claude',
  commentContextSessionLabel = '',
  onChange,
  onCancel,
  onSubmit,
  onStartEdit,
  onDelete,
  onReturnToChat,
}) {
  const ref = useRef(null);
  const textareaRef = useRef(null);
  const splitButtonRef = useRef(null);
  const [submitOptionsRect, setSubmitOptionsRect] = useState(null);
  const [actionMenu, setActionMenu] = useState(null);
  const normalizedSubmitAttachModes = useMemo(() => {
    const nextModes = Array.isArray(submitAttachModes)
      ? submitAttachModes.filter((mode) => mode === 'current' || mode === 'new')
      : [];

    return nextModes.length > 0 ? Array.from(new Set(nextModes)) : ['current', 'new'];
  }, [submitAttachModes]);
  const normalizedDefaultSubmitAttachMode = normalizedSubmitAttachModes.includes(defaultSubmitAttachMode)
    ? defaultSubmitAttachMode
    : normalizedSubmitAttachModes[0];
  const [submitAttachMode, setSubmitAttachMode] = useState(normalizedDefaultSubmitAttachMode);
  const isEditing = Number.isInteger(editingIndex);
  const normalizedCommentGroups = Array.isArray(commentGroups) ? commentGroups : null;
  const hasGroupedComments = Boolean(normalizedCommentGroups?.length);
  const hasComments = comments.length > 0 || hasGroupedComments;
  const canChooseSubmitAttachMode = normalizedSubmitAttachModes.length > 1;
  const submitOptionLabel = submitAttachMode === 'new'
    ? 'Add to New Session'
    : 'Add to Current Session';
  const submitButtonLabel = isEditing ? 'Save Comment' : 'Add Comment';
  const normalizedCommentContextLabel = typeof commentContextLabel === 'string'
    ? commentContextLabel.trim()
    : '';
  const normalizedCommentContextSessionLabel = typeof commentContextSessionLabel === 'string'
    ? commentContextSessionLabel.trim()
    : '';
  const renderCommentContextHeader = ({
    label = normalizedCommentContextLabel,
    icon = commentContextIcon,
    sessionLabel = normalizedCommentContextSessionLabel,
    messageId = null,
    chatId = null,
  } = {}) => {
    const normalizedSessionLabel = typeof sessionLabel === 'string' ? sessionLabel.trim() : '';

    return label.length > 0
      ? (
          <ToolbarButton
            className="spec-done-comment-popup-context-header text-ui-small"
            icon={(
              <span className="spec-done-comment-popup-context-prefix">
                <AiChatAgentIcon icon={icon} />
                <span className="spec-done-comment-popup-context-title">
                  {label}
                </span>
                {normalizedSessionLabel.length > 0 && (
                  <Badge
                    className="spec-done-comment-popup-context-session"
                    text={normalizedSessionLabel}
                    color={normalizedSessionLabel === 'Active' ? 'blue-secondary' : 'gray-secondary'}
                  />
                )}
              </span>
            )}
            data-demo-id="diff-comment-context-message"
            aria-label={`Open chat context: ${label}`}
            title={label}
            onClick={() => onReturnToChat?.({ messageId, chatId, source: 'diff-comment-context' })}
          />
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
    if (input) { input.focus({ preventScroll: true }); if (isEditing) input.select(); }
  }, [hasComments, isEditing, showCompose]);

  useEffect(() => {
    if (!normalizedSubmitAttachModes.includes(submitAttachMode)) {
      setSubmitAttachMode(normalizedDefaultSubmitAttachMode);
    }
  }, [normalizedDefaultSubmitAttachMode, normalizedSubmitAttachModes, submitAttachMode]);

  const handleSubmit = (attachMode = submitAttachMode) => {
    setSubmitOptionsRect(null);
    onSubmit?.({ attachMode });
  };

  const handleSubmitOptionSelect = (attachMode) => {
    setSubmitAttachMode(attachMode);
    setSubmitOptionsRect(null);
    textareaRef.current?.focus({ preventScroll: true });
  };

  const toggleSubmitOptions = (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!canChooseSubmitAttachMode) return;
    const rect = splitButtonRef.current?.getBoundingClientRect();
    setSubmitOptionsRect((prev) => (prev ? null : rect));
  };

  const openActionMenu = (event, actions = []) => {
    event.preventDefault();
    event.stopPropagation();
    if (actions.length === 0) return;
    setActionMenu({
      rect: event.currentTarget.getBoundingClientRect(),
      actions,
    });
  };

  const runAction = (action) => {
    setActionMenu(null);
    action?.onSelect?.();
  };

  const renderMoreButton = (actions = []) => (
    actions.length > 0
      ? (
          <button
            type="button"
            className="spec-done-comment-popup-more-btn"
            aria-label="More actions"
            onClick={(event) => openActionMenu(event, actions)}
          >
            <Icon name="general/moreVertical" size={16} />
          </button>
        )
      : null
  );

  const getEditableCommentActions = (index) => [
    { label: 'Change', icon: 'general/edit', onSelect: () => onStartEdit?.(index) },
    { label: 'Delete', icon: 'general/delete', onSelect: () => onDelete?.(index) },
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

  const popupClassName = [
    'cmp-popup',
    'spec-done-comment-popup',
    hasComments ? 'has-comments' : '',
  ].filter(Boolean).join(' ');

  return (
    <div ref={ref} className={popupClassName} onMouseDown={(e) => e.stopPropagation()}>
      {!hasGroupedComments && (!showCompose || hasComments) && renderCommentContextHeader()}
      {hasGroupedComments && (
        <div className="spec-done-comment-popup-groups">
          {normalizedCommentGroups.map((group) => {
            const showGroupHeader = !group.hideHeader && (group.comments.length > 0 || group.showHeaderWhenEmpty);

            return (
            <div className="spec-done-comment-popup-group" key={`${group.chatId || group.label}-${group.messageId || group.label}`}>
              {showGroupHeader && renderCommentContextHeader(group)}
              {group.comments.length > 0 && (
                <div className="spec-done-comment-popup-list">
                  {group.comments.map((commentEntry, i) => {
                    const actions = commentEntry.editable
                      ? getEditableCommentActions(commentEntry.localIndex)
                      : getReturnToContextActions({ messageId: group.messageId, chatId: group.chatId });

                    return (
                      <div key={`${group.chatId || 'comment'}-${i}`} className="spec-done-comment-popup-item">
                        <div className="spec-done-comment-popup-item-body">
                          <div className="spec-done-comment-popup-item-text text-ui-default">{commentEntry.text}</div>
                        </div>
                        {renderMoreButton(actions)}
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
          {comments.map((comment, i) => {
            const actions = commentsReadOnly
              ? getReturnToContextActions()
              : getEditableCommentActions(i);

            return (
              <div key={i} className="spec-done-comment-popup-item">
                <div className="spec-done-comment-popup-item-body">
                  <div className="spec-done-comment-popup-item-text text-ui-default">{comment}</div>
                </div>
                {renderMoreButton(actions)}
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
          <div className="spec-done-comment-popup-input-wrap">
            <textarea
              ref={textareaRef}
              className="spec-done-comment-popup-textarea text-ui-default"
              value={value}
              placeholder="Write a comment"
              data-demo-id="diff-comment-input"
              onChange={(e) => onChange?.(e.target.value)}
              rows={1}
            />
          </div>
          <div className="spec-done-comment-popup-footer">
            <div className="spec-done-comment-popup-actions">
              <Button
                type="secondary"
                data-demo-id="diff-comment-cancel"
                onClick={() => {
                  setSubmitOptionsRect(null);
                  onCancel?.();
                }}
              >
                Cancel
              </Button>
              <div className="diff-comment-submit-split" ref={splitButtonRef}>
                <Button
                  type="primary"
                  data-demo-id="diff-comment-submit"
                  title={submitButtonLabel}
                  aria-label={submitButtonLabel}
                  onClick={() => handleSubmit()}
                >
                  {submitButtonLabel}
                </Button>
                {canChooseSubmitAttachMode && (
                  <Button
                    type="primary"
                    className="diff-comment-submit-menu-button"
                    data-demo-id="diff-comment-submit-menu"
                    aria-label="Choose comment attachment target"
                    aria-haspopup="menu"
                    aria-expanded={Boolean(submitOptionsRect)}
                    onClick={toggleSubmitOptions}
                  >
                    <Icon name="general/chevronDown" size={16} />
                  </Button>
                )}
              </div>
            </div>
          </div>
          {canChooseSubmitAttachMode && submitOptionsRect && createPortal(
            <div className="theme-dark">
              <PositionedPopup triggerRect={submitOptionsRect} onDismiss={() => setSubmitOptionsRect(null)} gap={4}>
                <Popup visible className="diff-comment-submit-options-popup" onClose={() => setSubmitOptionsRect(null)}>
                  {normalizedSubmitAttachModes.includes('current') && (
                    <PopupCell
                      selected={submitAttachMode === 'current'}
                      onClick={() => handleSubmitOptionSelect('current')}
                    >
                      Add to Current Session
                    </PopupCell>
                  )}
                  {normalizedSubmitAttachModes.includes('new') && (
                    <PopupCell
                      selected={submitAttachMode === 'new'}
                      onClick={() => handleSubmitOptionSelect('new')}
                    >
                      Add to New Session
                    </PopupCell>
                  )}
                </Popup>
              </PositionedPopup>
            </div>,
            document.body,
          )}
        </div>
      )}
      {actionMenu && createPortal(
        <div className="theme-dark">
          <PositionedPopup triggerRect={actionMenu.rect} onDismiss={() => setActionMenu(null)} gap={4}>
            <Popup visible className="diff-comment-actions-popup" onClose={() => setActionMenu(null)}>
              {actionMenu.actions.map((action) => (
                <PopupCell
                  key={action.label}
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
    </div>
  );
}

function normalizeDiffCommentsState(diffComments = {}) {
  if (!diffComments || typeof diffComments !== 'object') {
    return {};
  }

  return Object.entries(diffComments).reduce((nextState, [rowId, comments]) => {
    const nextComments = Array.isArray(comments)
      ? comments.filter((comment) => typeof comment === 'string' && comment.trim().length > 0)
      : [];

    if (nextComments.length > 0) {
      nextState[rowId] = nextComments;
    }

    return nextState;
  }, {});
}

function flattenDiffCommentsState(diffComments = {}) {
  return Object.values(normalizeDiffCommentsState(diffComments)).flat();
}

function areCommentTextArraysEqual(left = [], right = []) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
    return false;
  }

  return left.every((comment, index) => comment === right[index]);
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

function buildPlanDiffPlanMarkerRow(anchorRow, text = '') {
  const normalizedText = typeof text === 'string' ? text.trim() : '';

  if (!anchorRow || normalizedText.length === 0) {
    return null;
  }

  return {
    id: `${anchorRow.id}-plan-marker`,
    kind: 'plan-marker',
    text: normalizedText,
    oldNumber: null,
    newNumber: null,
    isSynthetic: true,
  };
}

function orderPlanDiffRowsForDisplay(rows = [], planMarkerText = '') {
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
    const markerRow = buildPlanDiffPlanMarkerRow(addedRows[0], planMarkerText);

    orderedRows.push(
      ...removedRows,
      ...(markerRow ? [markerRow] : []),
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

export function PlanDiffOverlay({
  diffData,
  initialDiffComments = {},
  commentSessions = [],
  commentSessionActiveChatId = '',
  commentsReadOnly = false,
  commentContextLabel = '',
  commentContextIcon = 'claude',
  commentContextSessionLabel = '',
  onDiffCommentsChange = null,
  onDiffCommentSubmit = null,
  onRowDelete = null,
  onRowFix = null,
  onPlanMarkerClick = null,
  onReturnToChat = null,
  uiState = null,
  onUiStateChange = null,
  singleLineNumbers = false,
}) {
  const [commentsEnabled, setCommentsEnabled] = useState(!singleLineNumbers);
  const scrollRef = useRef(null);
  const onDiffCommentsChangeRef = useRef(onDiffCommentsChange);
  const onUiStateChangeRef = useRef(onUiStateChange);
  const displayRows = useMemo(
    () => orderPlanDiffRowsForDisplay(diffData?.rows ?? [], diffData?.lineText ?? ''),
    [diffData?.lineText, diffData?.rows],
  );
  const normalizedUiState = useMemo(
    () => normalizePlanDiffUiState(uiState),
    [uiState],
  );
  const initialDiffCommentsSignature = JSON.stringify(normalizeDiffCommentsState(initialDiffComments));
  const normalizedInitialDiffComments = useMemo(
    () => normalizeDiffCommentsState(initialDiffComments),
    [initialDiffCommentsSignature],
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
  const [diffComments, setDiffComments] = useState(() => normalizedInitialDiffComments);
  const [caretState, setCaretState] = useState({
    rowId: initialCaretRowId,
    left: normalizedUiState.caretState.left,
  });
  const [caretKey, setCaretKey] = useState(0);
  const diffResetKey = JSON.stringify({
    title: diffData?.title ?? '',
    focusRowId: diffData?.focusRowId ?? null,
    rows: (diffData?.rows ?? []).map((row) => row.id),
  });
  const previousDiffResetKeyRef = useRef(diffResetKey);

  useEffect(() => {
    onDiffCommentsChangeRef.current = onDiffCommentsChange;
  }, [onDiffCommentsChange]);

  const commitDiffComments = (nextComments, metadata = null) => {
    const normalizedComments = normalizeDiffCommentsState(nextComments);
    setDiffComments(normalizedComments);
    onDiffCommentsChangeRef.current?.(normalizedComments, metadata ?? undefined);
    return normalizedComments;
  };

  const clearCommentComposeState = (nextActiveRowId = activeRowId) => {
    setCommentRowId(null);
    setCommentValue('');
    setCommentEditingIndex(null);
    onUiStateChangeRef.current?.({
      activeRowId: nextActiveRowId,
      commentRowId: null,
      commentValue: '',
      commentEditingIndex: null,
      caretState,
    });
  };

  useEffect(() => {
    onUiStateChangeRef.current = onUiStateChange;
  }, [onUiStateChange]);

  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

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

  const toggleCommentForRow = (rowId) => {
    activateRow(rowId);
    if (commentsReadOnly) {
      return;
    }
    if (commentRowId === rowId) {
      clearCommentComposeState(rowId);
      return;
    }
    setCommentRowId(rowId);
    setCommentValue('');
    setCommentEditingIndex(null);
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
    setDiffComments(normalizedInitialDiffComments);
    setCaretState({
      rowId: nextCaretRowId,
      left: normalizedUiState.caretState.left,
    });
  }, [diffData?.focusRowId, diffResetKey, normalizedInitialDiffComments, normalizedUiState]);

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
      caretState,
    });
  }, [activeRowId, caretState, commentEditingIndex, commentRowId]);

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
      if (row.kind === 'plan-marker') continue;
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
      if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
        if (commentsReadOnly) return;
        if (!activeRowId) return;
        event.preventDefault();
        setCommentRowId((prev) => (prev === activeRowId ? null : activeRowId));
        setCommentValue('');
        setCommentEditingIndex(null);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [activeRowId, commentsReadOnly]);

  return (
    <div className={`plan-diff-overlay${singleLineNumbers ? ' plan-diff-overlay--single' : ''}${singleLineNumbers && !commentsEnabled ? ' plan-diff-overlay--comments-off' : ''}`}>
      {singleLineNumbers && (
        <div className="plan-diff-comment-toggle-widget">
          <button
            type="button"
            className={`plan-diff-comment-toggle-btn${commentsEnabled ? ' is-active' : ''}`}
            aria-label={commentsEnabled ? 'Disable comments' : 'Enable comments'}
            onClick={() => setCommentsEnabled((prev) => !prev)}
          >
            <Icon name="general/balloon" size={16} />
            {totalCommentCount > 0 && (
              <span className="plan-diff-comment-toggle-count">{totalCommentCount}</span>
            )}
          </button>
          {totalCommentCount > 0 && (
            <div className="plan-diff-comment-toggle-nav">
              <button
                type="button"
                className="plan-diff-comment-nav-btn"
                aria-label="Previous comment"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => navigateComment(-1)}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M4.5 9.75L8 6.25L11.5 9.75" stroke="currentColor" strokeLinecap="round" />
                </svg>
              </button>
              <button
                type="button"
                className="plan-diff-comment-nav-btn"
                aria-label="Next comment"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => navigateComment(1)}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M11.5 6.25L8 9.75L4.5 6.25" stroke="currentColor" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          )}
        </div>
      )}
      <div className="plan-diff-scroll" data-overlay-scroll-body="true" ref={scrollRef}>
        <div className="plan-diff-code">
          {displayRows.map((row) => {
            if (row.kind === 'plan-marker') {
              return (
                <div
                  key={row.id}
                  className="plan-diff-row plan-diff-row-plan-marker"
                  data-diff-row-id={row.id}
                  data-demo-id={`diff-row-${row.id}`}
                  role={onPlanMarkerClick ? 'button' : undefined}
                  tabIndex={onPlanMarkerClick ? 0 : undefined}
                  onClick={onPlanMarkerClick ? () => onPlanMarkerClick(row) : undefined}
                  onKeyDown={onPlanMarkerClick ? (event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return;
                    event.preventDefault();
                    onPlanMarkerClick(row);
                  } : undefined}
                >
                  <div className="plan-diff-row-gutter">
                    <span className="plan-diff-line-number" />
                    {!singleLineNumbers && <span className="plan-diff-line-number" />}
                    <span className="plan-diff-gutter-icon-slot" />
                  </div>
                  <div className="plan-diff-row-code">
                      <span className="plan-diff-plan-marker-content">
                        <span className="plan-diff-plan-marker-icon" aria-hidden="true">
                        <PlanDiffAgentTaskIcon />
                      </span>
                      <span className="plan-diff-plan-marker-text">{row.text}</span>
                    </span>
                  </div>
                </div>
              );
            }

            const hasInlineHighlight = row.kind === 'added' || row.kind === 'removed';
            const rowComments = diffComments[row.id] ?? [];
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
                  comments: sessionComments.map((comment) => ({
                    text: comment,
                    editable: false,
                  })),
                };
              })
              .filter(Boolean)
              .filter((group) => !(
                isMirroredLocalCommentSession({
                  commentsReadOnly,
                  sessionTitle: group.label,
                  commentContextLabel,
                  sessionComments: group.comments.map((entry) => entry.text),
                  rowComments,
                })
              ));
            const localGroup = !commentsReadOnly && (rowComments.length > 0 || commentRowId === row.id)
              ? {
                  label: commentContextLabel,
                  icon: commentContextIcon,
                  sessionLabel: commentContextSessionLabel,
                  messageId: null,
                  chatId: null,
                  hideHeader: commentRowId === row.id && rowComments.length === 0,
                  comments: rowComments.map((comment, index) => ({
                    text: comment,
                    editable: true,
                    localIndex: index,
                  })),
                }
              : null;
            const isEmptyLocalComposeGroup = Boolean(localGroup && localGroup.comments.length === 0 && commentRowId === row.id);
            const rowCommentGroups = isEmptyLocalComposeGroup
              ? [
                  ...sessionGroups,
                  localGroup,
                ]
              : [
                  ...(localGroup ? [localGroup] : []),
                  ...sessionGroups,
                ];
            const hasVisibleRowComments = rowComments.length > 0 || rowCommentGroups.some((group) => group.comments.length > 0);

            return (<Fragment key={row.id}>
              <div
                className={`plan-diff-row plan-diff-row-${row.kind}${row.id === activeRowId ? ' is-focus' : ''}${hasInlineHighlight ? ' has-inline-highlight' : ''}`}
                data-diff-row-id={row.id}
                data-demo-id={`diff-row-${row.id}`}
                role="button"
                tabIndex={0}
                onClick={() => activateRow(row.id)}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return;
                  event.preventDefault();
                  activateRow(row.id);
                }}
              >
                <div className="plan-diff-row-gutter">
                  <span className="plan-diff-line-number">{row.oldNumber ?? ''}</span>
                  {!singleLineNumbers && <span className="plan-diff-line-number">{row.newNumber ?? ''}</span>}
                  <span
                    className="plan-diff-gutter-icon-slot"
                    data-demo-id={`diff-comment-toggle-${row.id}`}
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleCommentForRow(row.id);
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter' && event.key !== ' ') return;
                      event.preventDefault();
                      event.stopPropagation();
                      toggleCommentForRow(row.id);
                    }}
                  >
                    {hasVisibleRowComments ? (
                      <span className="plan-diff-comment-badge">
                        <Icon name="general/balloon" size={16} />
                        <span className="plan-diff-comment-count">
                          {rowCommentGroups.reduce((count, group) => count + group.comments.length, 0) || rowComments.length}
                        </span>
                      </span>
                    ) : (
                      <Icon name="general/balloon" size={16} />
                    )}
                  </span>
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
                    {(row.fragments ?? [{ text: row.text || ' ', tone: 'plain' }]).map((fragment, index) => (
                      <span
                        key={`${row.id}-fragment-${index}`}
                        className={`plan-diff-fragment${fragment.tone && fragment.tone !== 'plain' ? ` is-${fragment.tone}` : ''}`}
                      >
                        {tokenizeCodeFragment(fragment.text || ' ', diffData?.language || 'text').map((token, tokenIndex) => (
                          <span
                            key={`${row.id}-fragment-${index}-token-${tokenIndex}`}
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
              {(hasVisibleRowComments || commentRowId === row.id) && (
                <div className="plan-diff-row plan-diff-row-comment">
                  <div className="plan-diff-row-gutter">
                    <span className="plan-diff-line-number" />
                    {!singleLineNumbers && <span className="plan-diff-line-number" />}
                    <span className="plan-diff-gutter-icon-slot" />
                  </div>
                  <div className="plan-diff-inline-comment">
                    <DiffInlineCommentPopup
                      comments={rowComments}
                      commentGroups={rowCommentGroups.length > 0 ? rowCommentGroups : null}
                      value={commentRowId === row.id ? commentValue : ''}
                      editingIndex={commentRowId === row.id ? commentEditingIndex : null}
                      showCompose={!commentsReadOnly && commentRowId === row.id}
                      commentsReadOnly={commentsReadOnly}
                      commentContextLabel={commentContextLabel}
                      commentContextIcon={commentContextIcon}
                      commentContextSessionLabel={commentContextSessionLabel}
                      onChange={setCommentValue}
                      onStartEdit={(idx) => {
                        if (commentsReadOnly) return;
                        setCommentRowId(row.id);
                        setCommentValue(rowComments[idx] ?? '');
                        setCommentEditingIndex(idx);
                      }}
                      onDelete={(idx) => {
                        if (commentsReadOnly) return;
                        const existing = diffComments[row.id] ?? [];
                        commitDiffComments({
                          ...diffComments,
                          [row.id]: existing.filter((_, i) => i !== idx),
                        });
                      }}
                      onCancel={() => clearCommentComposeState()}
                      onSubmit={({ attachMode = 'current' } = {}) => {
                        if (commentsReadOnly) return;
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

                        const existing = diffComments[row.id] ?? [];
                        const nextRowComments = Number.isInteger(commentEditingIndex)
                          ? existing.map((comment, index) => (index === commentEditingIndex ? trimmed : comment))
                          : [...existing, trimmed];
                        const nextSubmittedComments = attachMode === 'new' && !Number.isInteger(commentEditingIndex)
                          ? { [row.id]: [trimmed] }
                          : {
                              ...diffComments,
                              [row.id]: nextRowComments,
                            };
                        const nextDiffComments = commitDiffComments(
                          nextSubmittedComments,
                          {
                            attachMode,
                            rowId: row.id,
                            comment: trimmed,
                            isEditing: Number.isInteger(commentEditingIndex),
                          },
                        );
                        onDiffCommentSubmit?.({
                          attachMode,
                          rowId: row.id,
                          comment: trimmed,
                          comments: nextDiffComments,
                          isEditing: Number.isInteger(commentEditingIndex),
                        });
                        clearCommentComposeState();
                      }}
                      onReturnToChat={onReturnToChat}
                    />
                  </div>
                </div>
              )}
            </Fragment>);
          })}
        </div>
      </div>
    </div>
  );
}

function formatPlanDiffDifferenceLabel(count) {
  if (count === 1) return '1 difference';
  return `${count} differences`;
}

export function PlanDiffInline({ diffData }) {
  const rows = useMemo(
    () => orderPlanDiffRowsForDisplay(diffData?.rows ?? [], diffData?.lineText ?? ''),
    [diffData?.rows, diffData?.lineText],
  );
  const language = diffData?.language || 'text';

  return (
    <div className="plan-diff-inline">
      {rows.map((row) => {
        if (row.kind === 'plan-marker') {
          return (
            <div key={row.id} className="plan-diff-inline-row plan-diff-inline-marker">
              <PlanDiffAgentTaskIcon />
              <span className="plan-diff-inline-marker-text">{row.text}</span>
            </div>
          );
        }

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
  viewerData = null,
  initialDiffComments = {},
  commentSessions = [],
  commentSessionActiveChatId = '',
  commentsReadOnly = false,
  commentContextLabel = '',
  commentContextIcon = 'claude',
  commentContextSessionLabel = '',
  onDiffCommentsChange = null,
  onDiffCommentSubmit = null,
  onRowDelete = null,
  onRowFix = null,
  onPlanMarkerClick = null,
  onReturnToChat = null,
  onNavigatePrevious = null,
  onNavigateNext = null,
  uiState = null,
  onUiStateChange = null,
  singleLineNumbers = false,
}) {
  const toolbarRef = useRef(null);
  const [overlayHost, setOverlayHost] = useState(null);
  const [showViewerPopup, setShowViewerPopup] = useState(false);
  const [viewerPopupAnchorRect, setViewerPopupAnchorRect] = useState(null);

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

  useEffect(() => {
    setShowViewerPopup(false);
    setViewerPopupAnchorRect(null);
  }, [diffData?.title, diffData?.focusRowId]);

  return (
    <>
      <div className="plan-diff-editor-area" ref={toolbarRef}>
        {!singleLineNumbers && (
          <div className="plan-diff-toolbar-shell">
            <div className="plan-diff-toolbar">
              <div className="plan-diff-toolbar-left">
                <div className="plan-diff-toolbar-group">
                  <PlanDiffToolbarIconButton label="Scroll up" icon="up" onClick={onNavigatePrevious} />
                  <PlanDiffToolbarIconButton label="Scroll down" icon="down" onClick={onNavigateNext} />
                  <PlanDiffToolbarIconButton label="Edit source" icon="edit" />
                </div>
                <span className="plan-diff-toolbar-separator" aria-hidden="true" />
                <PlanDiffToolbarSelect
                  label="Unified viewer"
                  width={136}
                  onClick={(event) => {
                    if (showViewerPopup) {
                      setShowViewerPopup(false);
                      setViewerPopupAnchorRect(null);
                      return;
                    }

                    setViewerPopupAnchorRect(event.currentTarget.getBoundingClientRect());
                    setShowViewerPopup(true);
                  }}
                />
                <span className="plan-diff-toolbar-separator" aria-hidden="true" />
                <PlanDiffToolbarIconButton label="Settings" icon="settings" />
              </div>
              <div className="plan-diff-toolbar-right">
                <span className="plan-diff-toolbar-meta text-ui-default">{formatPlanDiffDifferenceLabel(diffData?.differenceCount ?? 0)}</span>
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
          initialDiffComments={initialDiffComments}
          commentSessions={commentSessions}
          commentSessionActiveChatId={commentSessionActiveChatId}
          commentsReadOnly={commentsReadOnly}
          commentContextLabel={commentContextLabel}
          commentContextIcon={commentContextIcon}
          commentContextSessionLabel={commentContextSessionLabel}
          onDiffCommentsChange={onDiffCommentsChange}
          onDiffCommentSubmit={onDiffCommentSubmit}
          onRowDelete={onRowDelete}
          onRowFix={onRowFix}
          onPlanMarkerClick={onPlanMarkerClick}
          onReturnToChat={onReturnToChat}
          uiState={uiState}
          onUiStateChange={onUiStateChange}
          singleLineNumbers={singleLineNumbers}
        />,
        overlayHost
      )}
      {showViewerPopup && (
        <PlanDiffViewerPopup
          diffData={diffData}
          viewerData={viewerData}
          anchorRect={viewerPopupAnchorRect}
          onClose={() => {
            setShowViewerPopup(false);
            setViewerPopupAnchorRect(null);
          }}
        />
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
