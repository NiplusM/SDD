import { useState } from 'react';
import { Icon } from '@jetbrains/int-ui-kit';
import './ComposerFollowUpQueue.css';

// Ported from JetBrains/aia-design:
// int-ui-prototypes/src/shared/ComposerFollowUpQueue/ComposerFollowUpQueue.jsx.
// The shared shell is kept generic; review supplies file icons, status labels and navigation
// instead of the editable follow-up actions used by the original queue demo.
export function ComposerFollowUpQueue({
  items = [],
  title = 'Queue',
  ariaLabel = 'Follow-up queue',
  className = '',
  onItemClick = null,
}) {
  const [collapsed, setCollapsed] = useState(false);
  const visibleItems = Array.isArray(items) ? items.filter(Boolean) : [];

  if (visibleItems.length === 0) return null;

  const toggleCollapsed = () => setCollapsed((value) => !value);

  return (
    <section
      className={[
        'ij-air-follow-up-queue',
        collapsed ? 'ij-air-follow-up-queue--collapsed' : '',
        className,
      ].filter(Boolean).join(' ')}
      aria-label={ariaLabel}
    >
      <header className="ij-air-follow-up-queue__header">
        <button
          type="button"
          className="ij-air-follow-up-queue__tab"
          aria-expanded={!collapsed}
          onClick={toggleCollapsed}
        >
          <span className="ij-air-follow-up-queue__title">{title}</span>
          <span className="ij-air-follow-up-queue__count">{visibleItems.length}</span>
        </button>
        <button
          type="button"
          className={`ij-air-follow-up-queue__collapse${collapsed ? ' collapsed' : ''}`}
          aria-label={collapsed ? `Expand ${title}` : `Collapse ${title}`}
          aria-expanded={!collapsed}
          onClick={toggleCollapsed}
        >
          <Icon name="general/chevronDown" size={16} />
        </button>
      </header>
      {!collapsed && (
        <ul className="ij-air-follow-up-queue__list">
          {visibleItems.map((item) => {
            const isClickable = Boolean(item.openTarget && onItemClick);
            return (
              <li
                className={`ij-air-follow-up-queue__item ${item.state ?? 'pending'}`}
                key={item.id}
              >
                <button
                  type="button"
                  className={`ij-air-follow-up-queue__item-button${isClickable ? ' is-clickable' : ''}`}
                  onClick={isClickable ? () => onItemClick(item) : undefined}
                >
                  <span className="ij-air-follow-up-queue__item-lead" aria-hidden="true">
                    <Icon name={item.icon ?? 'general/listFiles'} size={16} />
                  </span>
                  <span className="ij-air-follow-up-queue__item-text">{item.text}</span>
                  {item.statusLabel && (
                    <span className="ij-air-follow-up-queue__item-status">{item.statusLabel}</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
