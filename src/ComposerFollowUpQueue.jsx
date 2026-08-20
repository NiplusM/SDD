import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon, Popup, PopupCell } from '@jetbrains/int-ui-kit';
import { IjAirFollowUpBulletIcon } from './IjAirFollowUpBulletIcon.jsx';
import './ComposerFollowUpQueue.css';

const QUEUE_ITEM_MENU_WIDTH = 231;
const QUEUE_BODY_MAX_HEIGHT = 176;

const QUEUE_ITEM_MENU_ITEMS = [
  { id: 'edit', label: 'Edit Message', icon: 'general/edit' },
  { id: 'delete', label: 'Delete', icon: 'general/delete' },
  { id: 'open-chat', label: 'Open in New Chat', icon: 'aiAssistant/toolWindowChat' },
  { id: 'turn-off', label: 'Turn Off Queueing', icon: 'general/projectWideAnalysisOff' },
];

function reorderQueueItems(items, activeId, overId) {
  if (activeId === overId) return items;

  const fromIndex = items.findIndex((item) => item.id === activeId);
  const toIndex = items.findIndex((item) => item.id === overId);
  if (fromIndex < 0 || toIndex < 0) return items;

  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

function DragGripIcon() {
  return (
    <span className="ij-air-follow-up-queue__drag-grip" aria-hidden="true">
      {Array.from({ length: 6 }, (_, index) => <span key={index} />)}
    </span>
  );
}

function ReviewScopeQueueRow({ item }) {
  const isProcessing = item.status === 'processing';
  const isDone = item.status === 'done';

  return (
    <li
      className={`ij-air-follow-up-queue__scope-item is-${item.status}`}
      data-review-scope-file-status={item.status}
    >
      <span className="ij-air-follow-up-queue__scope-item-icon" aria-hidden="true">
        {isProcessing ? (
          <span className="ij-air-follow-up-queue__scope-spinner" />
        ) : isDone ? (
          <Icon name="general/checkmark" size={16} />
        ) : (
          <Icon name={item.icon ?? 'fileTypes/text'} size={16} />
        )}
      </span>
      <span className="ij-air-follow-up-queue__scope-item-text">{item.text}</span>
    </li>
  );
}

function VcsSummaryFileRow({ file, onOpenFile }) {
  const isMarkdown = file.label?.endsWith('.md');
  return (
    <button
      type="button"
      className="ij-air-follow-up-queue__vcs-file"
      onClick={() => onOpenFile?.(file)}
    >
      <Icon
        name={isMarkdown ? 'fileTypes/markdown' : 'fileTypes/java'}
        size={16}
        className={`icon ij-air-follow-up-queue__vcs-file-icon${isMarkdown ? ' is-markdown' : ''}`}
      />
      <span className="ij-air-follow-up-queue__vcs-file-label">{file.label}</span>
      <span
        className="ij-air-follow-up-queue__vcs-file-counts"
        aria-label={`Changes: plus ${file.added}, minus ${file.removed}`}
      >
        <span className="is-added">+{file.added}</span>
        <span className="is-removed">-{file.removed}</span>
      </span>
    </button>
  );
}

function QueueItemMoreMenu({ item, isOpen, onToggle, onDeleteItem }) {
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const [pos, setPos] = useState(null);

  const closeMenu = () => onToggle(null);

  useLayoutEffect(() => {
    if (!isOpen || !buttonRef.current) {
      setPos(null);
      return;
    }

    const rect = buttonRef.current.getBoundingClientRect();
    const menuHeight = menuRef.current?.getBoundingClientRect().height ?? 0;
    const gap = 4;
    const estimatedHeight = menuHeight || 160;
    let top = rect.bottom + gap;

    if (top + estimatedHeight > window.innerHeight - 8) {
      top = Math.max(8, rect.top - gap - estimatedHeight);
    }

    let left = rect.right - QUEUE_ITEM_MENU_WIDTH;
    if (left < 8) left = 8;

    setPos({ top, left });
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const handleMouseDown = (event) => {
      if (
        buttonRef.current?.contains(event.target)
        || menuRef.current?.contains(event.target)
      ) {
        return;
      }
      closeMenu();
    };

    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [isOpen, onToggle]);

  const handleToggle = (event) => {
    event.stopPropagation();
    if (isOpen) {
      closeMenu();
      return;
    }
    onToggle(item.id);
  };

  const handleMenuAction = (actionId) => {
    if (actionId === 'delete') onDeleteItem?.(item.id);
    closeMenu();
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={`ij-air-follow-up-queue__more${isOpen ? ' open' : ''}`}
        aria-label="More actions"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={handleToggle}
      >
        <Icon name="general/moreHorizontal" size={16} />
      </button>
      {isOpen && typeof document !== 'undefined' && createPortal(
        <div
          ref={menuRef}
          className="ij-air-follow-up-queue__menu-wrap"
          style={{
            position: 'fixed',
            top: pos?.top ?? -9999,
            left: pos?.left ?? 0,
            visibility: pos ? 'visible' : 'hidden',
          }}
        >
          <Popup
            visible
            className="ij-air-follow-up-queue__menu"
            style={{ position: 'static', width: QUEUE_ITEM_MENU_WIDTH }}
          >
            {QUEUE_ITEM_MENU_ITEMS.map((menuItem) => (
              <PopupCell
                key={menuItem.id}
                icon={menuItem.icon}
                onClick={() => handleMenuAction(menuItem.id)}
              >
                {menuItem.label}
              </PopupCell>
            ))}
          </Popup>
        </div>,
        document.body,
      )}
    </>
  );
}

function QueueItemRow({
  item,
  isDragging,
  isDragOver,
  isMenuOpen,
  onToggleMenu,
  onDeleteItem,
  onSendNowItem,
  onDragStart,
}) {
  return (
    <li
      className={[
        'ij-air-follow-up-queue__item',
        isDragging ? 'is-dragging' : '',
        isDragOver ? 'is-drag-over' : '',
      ].filter(Boolean).join(' ')}
      data-queue-item-id={item.id}
    >
      <span className="ij-air-follow-up-queue__item-lead">
        <IjAirFollowUpBulletIcon className="ij-air-follow-up-queue__item-icon" />
        <button
          type="button"
          className="ij-air-follow-up-queue__drag-handle"
          aria-label="Reorder queue item"
          onPointerDown={(event) => onDragStart(event, item.id)}
        >
          <DragGripIcon />
        </button>
      </span>
      <span className="ij-air-follow-up-queue__item-text">{item.text}</span>
      <div className="ij-air-follow-up-queue__item-actions">
        <button
          type="button"
          className="ij-air-follow-up-queue__send-now"
          onClick={() => onSendNowItem?.(item.id)}
        >
          Send now
        </button>
        <QueueItemMoreMenu
          item={item}
          isOpen={isMenuOpen}
          onToggle={onToggleMenu}
          onDeleteItem={onDeleteItem}
        />
      </div>
    </li>
  );
}

export function ComposerFollowUpQueue({
  items = [],
  scopeItems = [],
  label,
  vcsTab = null,
  onDeleteItem,
  onReorderItems,
  onSendNowItem,
  revealSendNowOnHover = false,
  collapsed: collapsedProp,
  onCollapsedChange,
}) {
  const resolvedLabel = label ?? (scopeItems.length > 0 ? 'AI Review' : 'Queue');
  const hasQueueContent = scopeItems.length > 0 || items.length > 0;
  const hasVcsTab = Boolean(vcsTab);
  // The queue is the more time-sensitive surface, so it takes the leftmost
  // tab slot whenever it has anything to show; the VCS summary otherwise
  // occupies that first slot on its own.
  const tabOrder = hasQueueContent
    ? (hasVcsTab ? ['queue', 'vcs'] : ['queue'])
    : (hasVcsTab ? ['vcs'] : []);
  const [activeTab, setActiveTab] = useState(tabOrder[0] ?? 'queue');
  const resolvedActiveTab = tabOrder.includes(activeTab) ? activeTab : (tabOrder[0] ?? 'queue');
  const [collapsedInternal, setCollapsedInternal] = useState(true);
  const [collapsedOverride, setCollapsedOverride] = useState(null);
  const isCollapseControlled = onCollapsedChange != null;
  const collapsed = isCollapseControlled
    ? Boolean(collapsedProp)
    : (collapsedOverride ?? collapsedProp ?? collapsedInternal);
  const [openMenuItemId, setOpenMenuItemId] = useState(null);
  const [draggingId, setDraggingId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);
  const dragStateRef = useRef({ activeId: null, overId: null });
  const itemsRef = useRef(items);
  const bodyContentRef = useRef(null);
  const [bodyHeight, setBodyHeight] = useState(0);

  // Switching tabs (or the queue growing/shrinking) swaps in content of a
  // different natural height. Measure it and animate the wrapper's height
  // instead of letting the box snap to the new size.
  useLayoutEffect(() => {
    if (collapsed) {
      setBodyHeight(0);
      return;
    }
    const measured = bodyContentRef.current?.scrollHeight ?? 0;
    setBodyHeight(Math.min(measured, QUEUE_BODY_MAX_HEIGHT));
  }, [collapsed, resolvedActiveTab, items, scopeItems, vcsTab, openMenuItemId, draggingId, dragOverId]);

  const applyCollapsed = (next) => {
    if (isCollapseControlled) {
      onCollapsedChange(next);
      return;
    }
    if (collapsedProp !== undefined) {
      setCollapsedOverride(next);
      return;
    }
    setCollapsedInternal(next);
  };

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    if (isCollapseControlled) return;
    setCollapsedOverride(null);
  }, [collapsedProp, isCollapseControlled]);

  useEffect(() => {
    if (!openMenuItemId) return;
    const itemStillExists = items.some((item) => item.id === openMenuItemId);
    if (!itemStillExists) setOpenMenuItemId(null);
  }, [items, openMenuItemId]);

  // As soon as the queue has something to show, bring it to the front tab
  // and reveal it — it's more urgent than a lingering VCS summary.
  const hadQueueContentRef = useRef(hasQueueContent);
  useEffect(() => {
    if (hasQueueContent && !hadQueueContentRef.current) {
      setActiveTab('queue');
      applyCollapsed(false);
    }
    hadQueueContentRef.current = hasQueueContent;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasQueueContent]);

  const clearDragListeners = () => {
    const dragState = dragStateRef.current.listeners;
    if (!dragState) return;

    window.removeEventListener('pointermove', dragState.handlePointerMove);
    window.removeEventListener('pointerup', dragState.handlePointerUp);
    window.removeEventListener('pointercancel', dragState.handlePointerUp);
    dragStateRef.current.listeners = null;
  };

  useEffect(() => () => clearDragListeners(), []);

  if (tabOrder.length === 0) return null;

  const finishDrag = () => {
    const { activeId, overId } = dragStateRef.current;
    if (activeId && overId && activeId !== overId) {
      onReorderItems?.(reorderQueueItems(itemsRef.current, activeId, overId));
    }

    dragStateRef.current = { activeId: null, overId: null, listeners: null };
    setDraggingId(null);
    setDragOverId(null);
    clearDragListeners();
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  };

  const handleDragStart = (event, itemId) => {
    event.preventDefault();
    event.stopPropagation();
    setOpenMenuItemId(null);

    dragStateRef.current = {
      activeId: itemId,
      overId: itemId,
      listeners: null,
    };
    setDraggingId(itemId);
    setDragOverId(itemId);

    const handlePointerMove = (moveEvent) => {
      const element = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY);
      const row = element?.closest('[data-queue-item-id]');
      const overId = row?.getAttribute('data-queue-item-id');
      if (!overId) return;

      dragStateRef.current.overId = overId;
      setDragOverId(overId);
    };

    const handlePointerUp = () => finishDrag();

    dragStateRef.current.listeners = { handlePointerMove, handlePointerUp };
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
    document.body.style.cursor = 'grabbing';
    document.body.style.userSelect = 'none';
  };

  const toggleCollapsed = () => applyCollapsed(!collapsed);

  const selectTab = (tabId) => {
    setActiveTab(tabId);
    if (collapsed) applyCollapsed(false);
  };

  const handleQueueToggle = (event) => {
    if (
      event.target.closest(
        '.ij-air-follow-up-queue__list, .ij-air-follow-up-queue__vcs-files, .ij-air-follow-up-queue__item-actions, .ij-air-follow-up-queue__more, .ij-air-follow-up-queue__drag-handle, .ij-air-follow-up-queue__tab, .ij-air-follow-up-queue__vcs-actions',
      )
    ) {
      return;
    }
    if (!collapsed && !event.target.closest('.ij-air-follow-up-queue__header')) return;
    toggleCollapsed();
  };

  const handleHeaderKeyDown = (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    toggleCollapsed();
  };

  const activeTabLabel = resolvedActiveTab === 'vcs' ? (vcsTab?.label ?? resolvedLabel) : resolvedLabel;

  return (
    <section
      className={[
        'ij-air-follow-up-queue',
        collapsed ? 'ij-air-follow-up-queue--collapsed' : '',
        revealSendNowOnHover ? 'ij-air-follow-up-queue--reveal-send-on-hover' : '',
      ].filter(Boolean).join(' ')}
      aria-label={activeTabLabel}
      onClick={handleQueueToggle}
    >
      <header
        className="ij-air-follow-up-queue__header"
        role="button"
        tabIndex={0}
        aria-expanded={!collapsed}
        aria-label={collapsed ? `Expand ${activeTabLabel}` : `Collapse ${activeTabLabel}`}
        onKeyDown={handleHeaderKeyDown}
      >
        <span className="ij-air-follow-up-queue__tabstrip">
          {tabOrder.map((tabId) => (
            <button
              key={tabId}
              type="button"
              className={`ij-air-follow-up-queue__tab${tabId === resolvedActiveTab ? ' is-active' : ''}`}
              onClick={(event) => {
                event.stopPropagation();
                selectTab(tabId);
              }}
            >
              {tabId === 'queue' ? (
                <>
                  <span className="ij-air-follow-up-queue__title">{resolvedLabel}</span>
                  <span className="ij-air-follow-up-queue__count">{scopeItems.length || items.length}</span>
                </>
              ) : (
                <>
                  <span className="ij-air-follow-up-queue__title">{vcsTab.label}</span>
                  <span className="ij-air-follow-up-queue__count">{vcsTab.branch}</span>
                  <span className="ij-air-follow-up-queue__tab-counts" aria-hidden="true">
                    <span className="is-added">+{vcsTab.added}</span>
                    <span className="is-removed">-{vcsTab.removed}</span>
                  </span>
                </>
              )}
            </button>
          ))}
        </span>
        {resolvedActiveTab === 'vcs' && vcsTab && (
          <span className="ij-air-follow-up-queue__vcs-actions">
            <button
              type="button"
              className="ij-air-follow-up-queue__vcs-skip"
              onClick={(event) => {
                event.stopPropagation();
                vcsTab.onDismiss?.();
              }}
            >
              Skip
            </button>
            <button
              type="button"
              className="ij-air-follow-up-queue__vcs-review"
              disabled={Boolean(vcsTab.reviewDisabled)}
              onClick={(event) => {
                event.stopPropagation();
                vcsTab.onRunReview?.();
              }}
            >
              Review
            </button>
          </span>
        )}
        <span
          className={`ij-air-follow-up-queue__collapse ${collapsed ? 'collapsed' : ''}`}
          aria-hidden="true"
        >
          <Icon name="general/chevronDown" size={16} />
        </span>
      </header>
      <div className="ij-air-follow-up-queue__body" style={{ height: bodyHeight }}>
        <div ref={bodyContentRef} className="ij-air-follow-up-queue__body-inner">
          {resolvedActiveTab === 'vcs' ? (
            <div className="ij-air-follow-up-queue__vcs-files" aria-label="All Project Changes files">
              {(vcsTab?.files ?? []).map((file) => (
                <VcsSummaryFileRow key={file.tabId} file={file} onOpenFile={vcsTab.onOpenFile} />
              ))}
            </div>
          ) : (
            <ul className="ij-air-follow-up-queue__list">
              {scopeItems.map((item) => (
                <ReviewScopeQueueRow key={item.id} item={item} />
              ))}
              {items.map((item) => (
                <QueueItemRow
                  key={item.id}
                  item={item}
                  isDragging={draggingId === item.id}
                  isDragOver={dragOverId === item.id && draggingId !== item.id}
                  isMenuOpen={openMenuItemId === item.id}
                  onToggleMenu={setOpenMenuItemId}
                  onDeleteItem={onDeleteItem}
                  onSendNowItem={onSendNowItem}
                  onDragStart={handleDragStart}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
