// The "Add context" popup behind the composer's "+" button. Shared so the AI Review popup's "+"
// opens exactly the same thing instead of a bespoke menu.
import { useMemo, useState } from 'react';
import { Popup, PopupCell, PositionedPopup } from '@jetbrains/int-ui-kit';

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
  // When set, picking a row hands the caller an attachment instead of only closing the popup.
  onSelectAttachment = null,
  recentFiles = AI_CHAT_RECENT_CONTEXT_FILES,
  width = 336,
}) {
  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleRecentFiles = useMemo(() => {
    const uniqueFiles = [];
    const seenFiles = new Set();

    (Array.isArray(recentFiles) ? recentFiles : []).forEach((file, index) => {
      const label = String(file?.label ?? file?.name ?? file?.source?.label ?? '').trim();
      if (!label) return;
      const path = String(file?.path ?? file?.meta ?? file?.hint ?? file?.source?.label ?? '').trim();
      const identity = `${label}\u0000${path}`;
      if (seenFiles.has(identity)) return;
      seenFiles.add(identity);
      uniqueFiles.push({
        ...file,
        id: file?.id ?? `recent-context-${index}`,
        label,
        path,
        icon: file?.icon ?? inferRecentFileIcon(label),
      });
    });

    return uniqueFiles.filter((file) => (
      !normalizedQuery
      || file.label.toLocaleLowerCase().includes(normalizedQuery)
      || file.path.toLocaleLowerCase().includes(normalizedQuery)
    ));
  }, [normalizedQuery, recentFiles]);

  const menuItems = [
    { id: 'project-files', label: 'Project Files and Folders', icon: 'nodes/folder', submenu: true },
    { id: 'upload', label: 'Upload from Computer...', icon: 'general/upload' },
    { id: 'screen', label: 'Context from Screen...', icon: 'actions/viewAsImage' },
    { id: 'commits', label: 'Commits...', icon: 'vcs/commit' },
    { id: 'skills', label: 'Skills', icon: 'toolwindows/packageManager', submenu: true },
  ].filter((item) => !normalizedQuery || item.label.toLocaleLowerCase().includes(normalizedQuery));

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
            placeholder="Search context to add"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <AiChatAddContextSeparator />

          {menuItems.map((item) => (
            <PopupCell
              key={item.id}
              icon={item.icon}
              submenu={item.submenu}
              onClick={() => {
                if (item.id === 'upload') {
                  onSelectAttachment?.({ id: 'context-upload', label: 'Uploaded file', icon: 'nodes/folder' });
                } else if (item.id === 'screen') {
                  onSelectAttachment?.({ id: 'context-screen', label: 'Screen context', icon: 'fileTypes/image' });
                }
                handleClose();
              }}
            >
              {item.label}
            </PopupCell>
          ))}

          {!normalizedQuery && (
            <>
              <AiChatAddContextSeparator />
              <PopupCell
                icon="general/locate"
                shortcut={<span className="ai-chat-add-context-goal-hint">Set a goal to keep pursuing</span>}
                onClick={handleClose}
              >
                Goal
              </PopupCell>
            </>
          )}

          {visibleRecentFiles.length > 0 && (
            <>
              <AiChatAddContextSeparator />
              <div className="ai-chat-add-context-section-label">Recent files</div>

              {visibleRecentFiles.map((file) => (
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
            </>
          )}
        </Popup>
      </PositionedPopup>
    </div>
  );
}

function inferRecentFileIcon(label) {
  const extension = label.split('.').pop()?.toLocaleLowerCase();
  if (extension === 'js' || extension === 'jsx' || extension === 'mjs') return 'fileTypes/javaScript';
  if (extension === 'ts' || extension === 'tsx') return 'fileTypes/typeScript';
  if (extension === 'css') return 'fileTypes/css';
  if (extension === 'json') return 'fileTypes/json';
  if (extension === 'java') return 'fileTypes/java';
  if (extension === 'md' || extension === 'markdown') return 'fileTypes/modified';
  return 'fileTypes/unknown';
}

function AiChatAddContextSeparator() {
  return (
    <div className="ai-chat-add-context-separator" aria-hidden="true">
      <div className="ai-chat-add-context-separator-line" />
    </div>
  );
}
