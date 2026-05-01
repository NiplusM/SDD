import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon, Input, Button } from '@jetbrains/int-ui-kit';

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

function tokenizeCodeFragment(text = '', language = 'text') {
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
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path fillRule="evenodd" clipRule="evenodd" d="M5.14648 0.146447C5.34175 -0.0488155 5.65825 -0.0488155 5.85352 0.146447L9.20703 3.49996L5.85352 6.85348C5.65825 7.04874 5.34175 7.04874 5.14648 6.85348C4.95122 6.65822 4.95122 6.34171 5.14648 6.14645L7.29297 3.99996H0.5C0.223858 3.99996 0 3.7761 0 3.49996C0 3.22382 0.223858 2.99996 0.5 2.99996H7.29297L5.14648 0.853478C4.95122 0.658216 4.95122 0.341709 5.14648 0.146447Z" fill="#CED0D6" />
      <path fillRule="evenodd" clipRule="evenodd" d="M10.0606 9.14645C9.86536 8.95118 9.54885 8.95118 9.35359 9.14645C9.15832 9.34171 9.15832 9.65829 9.35359 9.85355L11.5001 12L4.70711 12C4.43097 12 4.20711 12.2239 4.20711 12.5C4.20711 12.7761 4.43097 13 4.70711 13L11.5001 13L9.35359 15.1464C9.15832 15.3417 9.15832 15.6583 9.35359 15.8536C9.54885 16.0488 9.86536 16.0488 10.0606 15.8536L13.4141 12.5L10.0606 9.14645Z" fill="#DFE1E5" />
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
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M1.14645 5.85355C0.951184 5.65829 0.951184 5.34171 1.14645 5.14645L4.14645 2.14645C4.34171 1.95118 4.65829 1.95118 4.85355 2.14645L7.85355 5.14645C8.04882 5.34171 8.04882 5.65829 7.85355 5.85355C7.65829 6.04882 7.34171 6.04882 7.14645 5.85355L5 3.70711L5 13.5C5 13.7761 4.77614 14 4.5 14C4.22386 14 4 13.7761 4 13.5V3.70711L1.85355 5.85355C1.65829 6.04882 1.34171 6.04882 1.14645 5.85355ZM8.14645 10.1464C8.34171 9.95118 8.65829 9.95118 8.85355 10.1464L11 12.2929V2.5C11 2.22386 11.2239 2 11.5 2C11.7761 2 12 2.22386 12 2.5V12.2929L14.1464 10.1464C14.3417 9.95118 14.6583 9.95118 14.8536 10.1464C15.0488 10.3417 15.0488 10.6583 14.8536 10.8536L11.8536 13.8536C11.6583 14.0488 11.3417 14.0488 11.1464 13.8536L8.14645 10.8536C7.95118 10.6583 7.95118 10.3417 8.14645 10.1464Z" fill="currentColor" />
      </svg>
    );
  }

  if (type === 'settings') {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M7.99994 6C6.89537 6 5.99994 6.89543 5.99994 8C5.99994 9.10457 6.89537 10 7.99994 10C9.10451 10 9.99994 9.10457 9.99994 8C9.99994 6.89543 9.10451 6 7.99994 6ZM6.99994 8C6.99994 7.44772 7.44765 7 7.99994 7C8.55222 7 8.99994 7.44772 8.99994 8C8.99994 8.55228 8.55222 9 7.99994 9C7.44765 9 6.99994 8.55228 6.99994 8ZM10.618 4.39833C10.233 4.46825 9.86392 4.21413 9.7937 3.83074L9.53397 2.41496C9.50816 2.27427 9.39961 2.16301 9.25912 2.13325C8.84818 2.04621 8.42685 2.00195 8 2.00195C7.57289 2.00195 7.1513 2.04627 6.74013 2.13341C6.5996 2.1632 6.49104 2.27452 6.46529 2.41527L6.20629 3.8308C6.1994 3.86844 6.18942 3.90551 6.17647 3.9416C6.04476 4.30859 5.6392 4.49978 5.27062 4.36863L3.91115 3.88463C3.77603 3.83652 3.62511 3.87431 3.52891 3.98033C2.96005 4.60729 2.52892 5.34708 2.2672 6.15302C2.22305 6.28899 2.26562 6.43805 2.37502 6.53053L3.47694 7.46206C3.50626 7.48685 3.53352 7.51399 3.55843 7.5432C3.81177 7.84027 3.77528 8.28558 3.47693 8.53783L2.37502 9.46935C2.26562 9.56183 2.22305 9.71089 2.2672 9.84685C2.52892 10.6528 2.96005 11.3926 3.52891 12.0196C3.62511 12.1256 3.77603 12.1634 3.91115 12.1153L5.27068 11.6312C5.30687 11.6184 5.3441 11.6084 5.38196 11.6015C5.76701 11.5316 6.13608 11.7857 6.2063 12.1691L6.46529 13.5846C6.49104 13.7254 6.5996 13.8367 6.74013 13.8665C7.1513 13.9536 7.57289 13.9979 8 13.9979C8.42685 13.9979 8.84818 13.9537 9.25912 13.8666C9.39961 13.8369 9.50816 13.7256 9.53397 13.5849L9.79368 12.1692C9.8006 12.1314 9.81058 12.0944 9.82353 12.0583C9.95524 11.6913 10.3608 11.5001 10.7294 11.6312L12.0888 12.1153C12.224 12.1634 12.3749 12.1256 12.4711 12.0196C13.04 11.3926 13.4711 10.6528 13.7328 9.84685C13.777 9.71089 13.7344 9.56183 13.625 9.46935L12.5231 8.53782C12.4937 8.51303 12.4665 8.48589 12.4416 8.45667C12.1882 8.1596 12.2247 7.71429 12.5231 7.46205L13.625 6.53053C13.7344 6.43805 13.777 6.28899 13.7328 6.15302C13.4711 5.34708 13.04 4.60729 12.4711 3.98033C12.3749 3.87431 12.224 3.83652 12.0888 3.88463L10.7293 4.36865C10.6931 4.38152 10.6559 4.39146 10.618 4.39833Z" fill="currentColor" />
      </svg>
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

function PlanDiffToolbarSelect({ label, width = null }) {
  return (
    <button type="button" className="plan-diff-toolbar-select" style={width ? { width } : undefined} aria-label={label}>
      <span className="plan-diff-toolbar-select-label">{label}</span>
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M11.5 6.25L8 9.75L4.5 6.25" stroke="#B4B8BF" strokeLinecap="round" />
      </svg>
    </button>
  );
}

function DiffInlineCommentPopup({ comments, value, editingIndex, showCompose = true, onChange, onCancel, onSubmit, onStartEdit, onDelete }) {
  const ref = useRef(null);
  const isEditing = Number.isInteger(editingIndex);
  const hasComments = comments.length > 0;

  useEffect(() => {
    if (!showCompose) return;
    const input = ref.current?.querySelector('input');
    if (input) { input.focus(); if (isEditing) input.select(); }
  }, [hasComments, isEditing, showCompose]);

  return (
    <div ref={ref} className={`cmp-popup spec-done-comment-popup${hasComments ? ' has-comments' : ''}`} onMouseDown={(e) => e.stopPropagation()}>
      {hasComments && (
        <div className="spec-done-comment-popup-list">
          {comments.map((comment, i) => (
            <div key={i} className="spec-done-comment-popup-item">
              <div className="spec-done-comment-popup-item-text text-ui-default">{comment}</div>
              <div className="spec-done-comment-popup-item-actions">
                <button type="button" className="spec-done-comment-popup-link" onClick={() => onStartEdit?.(i)}>Change</button>
                <button type="button" className="spec-done-comment-popup-link" onClick={() => onDelete?.(i)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
      {showCompose && (
        <div className="spec-done-comment-popup-compose">
          <div className="spec-done-comment-popup-input-wrap">
            <Input
              value={value}
              placeholder="Write a comment"
              data-demo-id="diff-comment-input"
              onChange={(e) => onChange?.(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') { e.preventDefault(); onCancel?.(); }
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSubmit?.(); }
              }}
            />
          </div>
          <div className="spec-done-comment-popup-actions">
            <Button type="secondary" data-demo-id="diff-comment-cancel" onClick={onCancel}>Cancel</Button>
            <Button type="primary" data-demo-id="diff-comment-submit" onClick={onSubmit}>{isEditing ? 'Save Comment' : 'Add a Comment'}</Button>
          </div>
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

function PlanDiffOverlay({ diffData, initialDiffComments = {}, onDiffCommentsChange = null, onRowDelete = null, onRowFix = null, uiState = null, onUiStateChange = null }) {
  const scrollRef = useRef(null);
  const normalizedUiState = useMemo(
    () => normalizePlanDiffUiState(uiState),
    [uiState],
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
  const [diffComments, setDiffComments] = useState(() => normalizeDiffCommentsState(initialDiffComments));
  const [caretState, setCaretState] = useState({
    rowId: initialCaretRowId,
    left: normalizedUiState.caretState.left,
  });
  const diffResetKey = JSON.stringify({
    title: diffData?.title ?? '',
    focusRowId: diffData?.focusRowId ?? null,
    initialDiffComments: normalizeDiffCommentsState(initialDiffComments),
  });
  const previousDiffResetKeyRef = useRef(diffResetKey);

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
    setDiffComments(normalizeDiffCommentsState(initialDiffComments));
    setCaretState({
      rowId: nextCaretRowId,
      left: normalizedUiState.caretState.left,
    });
  }, [diffData?.focusRowId, diffResetKey, initialDiffComments, normalizedUiState]);

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
    onDiffCommentsChange?.(normalizeDiffCommentsState(diffComments));
  }, [diffComments, onDiffCommentsChange]);

  useEffect(() => {
    onUiStateChange?.({
      activeRowId,
      commentRowId,
      commentValue,
      commentEditingIndex,
      caretState,
    });
  }, [activeRowId, caretState, commentEditingIndex, commentRowId, commentValue, onUiStateChange]);

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

  return (
    <div className="plan-diff-overlay">
      <div className="plan-diff-scroll" data-overlay-scroll-body="true" ref={scrollRef}>
        <div className="plan-diff-code">
          {(diffData?.rows ?? []).map((row) => {
            const hasInlineHighlight = row.kind === 'added' || row.kind === 'removed';
            const rowComments = diffComments[row.id] ?? [];

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
                  <span className="plan-diff-line-number">{row.newNumber ?? ''}</span>
                  <span
                    className="plan-diff-gutter-icon-slot"
                    data-demo-id={`diff-comment-toggle-${row.id}`}
                    role="button"
                    tabIndex={row.id === activeRowId || rowComments.length > 0 ? 0 : -1}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (row.id === activeRowId || rowComments.length > 0) {
                        setCommentRowId((prev) => prev === row.id ? null : row.id);
                        setCommentValue('');
                        setCommentEditingIndex(null);
                      }
                    }}
                  >
                    {rowComments.length > 0 ? (
                      <span className="plan-diff-comment-badge">
                        <Icon name="general/balloon" size={16} />
                        <span className="plan-diff-comment-count">{rowComments.length}</span>
                      </span>
                    ) : (
                      row.id === activeRowId ? <Icon name="general/balloon" size={16} /> : null
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
              {(rowComments.length > 0 || commentRowId === row.id) && (
                <div className="plan-diff-row plan-diff-row-comment">
                  <div className="plan-diff-row-gutter">
                    <span className="plan-diff-line-number" />
                    <span className="plan-diff-line-number" />
                    <span className="plan-diff-gutter-icon-slot" />
                  </div>
                  <div className="plan-diff-inline-comment">
                    <DiffInlineCommentPopup
                      comments={rowComments}
                      value={commentRowId === row.id ? commentValue : ''}
                      editingIndex={commentRowId === row.id ? commentEditingIndex : null}
                      showCompose={commentRowId === row.id}
                      onChange={setCommentValue}
                      onStartEdit={(idx) => {
                        setCommentRowId(row.id);
                        setCommentValue((rowComments[idx] ?? ''));
                        setCommentEditingIndex(idx);
                      }}
                      onDelete={(idx) => {
                        setDiffComments((prev) => {
                          const existing = prev[row.id] ?? [];
                          return { ...prev, [row.id]: existing.filter((_, i) => i !== idx) };
                        });
                      }}
                      onCancel={() => { setCommentRowId(null); setCommentValue(''); setCommentEditingIndex(null); }}
                      onSubmit={() => {
                        const trimmed = (commentRowId === row.id ? commentValue : '').trim();
                        if (!trimmed) return;

                        if (shouldDeleteRow(trimmed)) {
                          onRowDelete?.(row.id, trimmed);
                          setDiffComments((prev) => {
                            const { [row.id]: _, ...rest } = prev;
                            return rest;
                          });
                          setCommentRowId(null);
                          setCommentValue('');
                          setCommentEditingIndex(null);
                          if (activeRowId === row.id) {
                            setActiveRowId(null);
                          }
                          return;
                        }

                        if (shouldFixRow(trimmed)) {
                          onRowFix?.(row.id, trimmed);
                          setCommentRowId(null);
                          setCommentValue('');
                          setCommentEditingIndex(null);
                          return;
                        }

                        setDiffComments((prev) => {
                          const existing = prev[row.id] ?? [];
                          if (Number.isInteger(commentEditingIndex)) {
                            return { ...prev, [row.id]: existing.map((c, i) => i === commentEditingIndex ? trimmed : c) };
                          }
                          return { ...prev, [row.id]: [...existing, trimmed] };
                        });
                        setCommentRowId(null);
                        setCommentValue('');
                        setCommentEditingIndex(null);
                      }}
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

export function PlanDiffEditorArea({
  diffData,
  viewerData = null,
  initialDiffComments = {},
  onDiffCommentsChange = null,
  onRowDelete = null,
  onRowFix = null,
  uiState = null,
  onUiStateChange = null,
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
        <div className="plan-diff-toolbar">
          <div className="plan-diff-toolbar-left">
            <div className="plan-diff-toolbar-group">
              <PlanDiffToolbarIconButton label="Scroll down" icon="down" />
              <PlanDiffToolbarIconButton label="Scroll up" icon="up" />
              <PlanDiffToolbarIconButton label="Edit source" icon="edit" />
            </div>
            <div className="plan-diff-toolbar-group">
              <PlanDiffToolbarIconButton label="Previous change" icon="left" />
              <PlanDiffToolbarIconButton label="Next change" icon="right" />
              <PlanDiffToolbarIconButton
                label="Viewer mode"
                icon="list"
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
            </div>
            <div className="plan-diff-toolbar-group plan-diff-toolbar-group-selects">
              <PlanDiffToolbarSelect label="Unified viewer" width={126} />
              <PlanDiffToolbarSelect label="Do not ignore" width={119} />
              <PlanDiffToolbarSelect label="Highlight words" width={131} />
            </div>
            <div className="plan-diff-toolbar-group plan-diff-toolbar-group-trailing">
              <PlanDiffToolbarIconButton label="Collapse all" icon="collapse" />
              <PlanDiffToolbarIconButton label="Swap sides" icon="swap" />
              <PlanDiffToolbarIconButton label="Settings" icon="settings" />
              <PlanDiffToolbarIconButton label="Help" icon="help" />
            </div>
          </div>
          <div className="plan-diff-toolbar-right">
            <span className="plan-diff-toolbar-meta text-ui-default">{formatPlanDiffDifferenceLabel(diffData?.differenceCount ?? 0)}</span>
          </div>
        </div>
      </div>
      {overlayHost && createPortal(
        <PlanDiffOverlay
          diffData={diffData}
          initialDiffComments={initialDiffComments}
          onDiffCommentsChange={onDiffCommentsChange}
          onRowDelete={onRowDelete}
          onRowFix={onRowFix}
          uiState={uiState}
          onUiStateChange={onUiStateChange}
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
