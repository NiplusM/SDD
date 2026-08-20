import { useLayoutEffect, useRef, useState } from 'react';
import { Icon } from '@jetbrains/int-ui-kit';
import './ComposerVcsBanner.css';

const BANNER_BODY_MAX_HEIGHT = 176;

function VcsBannerFileRow({ file, onOpenFile }) {
  const isMarkdown = file.label?.endsWith('.md');
  return (
    <button
      type="button"
      className="ij-air-vcs-banner__file"
      onClick={() => onOpenFile?.(file)}
    >
      <Icon
        name={isMarkdown ? 'fileTypes/markdown' : 'fileTypes/java'}
        size={16}
        className={`icon ij-air-vcs-banner__file-icon${isMarkdown ? ' is-markdown' : ''}`}
      />
      <span className="ij-air-vcs-banner__file-label">{file.label}</span>
      <span
        className="ij-air-vcs-banner__file-counts"
        aria-label={`Changes: plus ${file.added}, minus ${file.removed}`}
      >
        <span className="is-added">+{file.added}</span>
        <span className="is-removed">-{file.removed}</span>
      </span>
    </button>
  );
}

// A standalone summary bar for changes across every session in the project.
// It sits above the composer (and above the follow-up queue, when one is
// showing) but isn't part of either — no shared tabs, no shared state.
export function ComposerVcsBanner({
  label,
  branch,
  added = 0,
  removed = 0,
  files = [],
  onOpenFile,
  onRunReview,
  reviewDisabled = false,
}) {
  const [collapsed, setCollapsed] = useState(true);
  const bodyContentRef = useRef(null);
  const [bodyHeight, setBodyHeight] = useState(0);

  useLayoutEffect(() => {
    if (collapsed) {
      setBodyHeight(0);
      return;
    }
    const measured = bodyContentRef.current?.scrollHeight ?? 0;
    setBodyHeight(Math.min(measured, BANNER_BODY_MAX_HEIGHT));
  }, [collapsed, files]);

  const toggleCollapsed = () => setCollapsed((current) => !current);

  const handleBannerClick = (event) => {
    if (event.target.closest('.ij-air-vcs-banner__files, .ij-air-vcs-banner__review')) return;
    toggleCollapsed();
  };

  const handleHeaderKeyDown = (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    toggleCollapsed();
  };

  return (
    <section
      className={`ij-air-vcs-banner${collapsed ? ' ij-air-vcs-banner--collapsed' : ''}`}
      aria-label={label}
      onClick={handleBannerClick}
    >
      <header
        className="ij-air-vcs-banner__header"
        role="button"
        tabIndex={0}
        aria-expanded={!collapsed}
        aria-label={collapsed ? `Expand ${label}` : `Collapse ${label}`}
        onKeyDown={handleHeaderKeyDown}
      >
        <span
          className={`ij-air-vcs-banner__collapse ${collapsed ? 'collapsed' : ''}`}
          aria-hidden="true"
        >
          <Icon name="general/chevronDown" size={16} />
        </span>
        <span className="ij-air-vcs-banner__label">
          <span className="ij-air-vcs-banner__title">{label}</span>
          <span className="ij-air-vcs-banner__count">{branch}</span>
          <span className="ij-air-vcs-banner__counts" aria-hidden="true">
            <span className="is-added">+{added}</span>
            <span className="is-removed">-{removed}</span>
          </span>
        </span>
        <button
          type="button"
          className="ij-air-vcs-banner__review"
          disabled={reviewDisabled}
          onClick={(event) => {
            event.stopPropagation();
            onRunReview?.();
          }}
        >
          Review
        </button>
      </header>
      <div className="ij-air-vcs-banner__body" style={{ height: bodyHeight }}>
        <div ref={bodyContentRef} className="ij-air-vcs-banner__body-inner">
          <div className="ij-air-vcs-banner__files" aria-label="All Project Changes files">
            {files.map((file) => (
              <VcsBannerFileRow key={file.tabId} file={file} onOpenFile={onOpenFile} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
