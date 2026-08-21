import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon, Popup, PopupCell } from '@jetbrains/int-ui-kit';
import { IjAirFollowUpBulletIcon } from './IjAirFollowUpBulletIcon.jsx';
import './ComposerFollowUpQueue.css';

const QUEUE_ITEM_MENU_WIDTH = 231;
// One fixed height for every tab's expanded body — it never changes based
// on content (item count, or which tab is active); anything past 5 rows
// worth just scrolls within it instead of growing the box.
const QUEUE_BODY_MAX_HEIGHT = 5 * 24;

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

// Row for a plain-chat file-edit run's "Files" tab — unlike
// ReviewScopeQueueRow (which walks queued -> processing -> done with a
// spinner), these files simply materialize into the list already carrying
// their final change counts; there's no separate "processing" state to show.
function EditedFileQueueRow({ item }) {
  return (
    <div className="ij-air-follow-up-queue__edited-item">
      <span className="ij-air-follow-up-queue__edited-item-text">{item.text}</span>
      <span className="ij-air-follow-up-queue__files-counts">
        {item.added ? <span className="is-added">{item.added}</span> : null}
        {item.removed ? <span className="is-removed">{item.removed}</span> : null}
      </span>
    </div>
  );
}

function VcsSummaryFileRow({ file, onOpenFile }) {
  return (
    <button
      type="button"
      className="ij-air-follow-up-queue__vcs-file"
      onClick={() => onOpenFile?.(file)}
    >
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
  filesTab = null,
  vcsTab = null,
  onDeleteItem,
  onReorderItems,
  onSendNowItem,
  revealSendNowOnHover = false,
  collapsed: collapsedProp,
  onCollapsedChange,
}) {
  const resolvedLabel = label ?? 'Queue';
  const hasFilesTab = scopeItems.length > 0;
  const hasQueueTab = items.length > 0;
  const hasVcsTab = Boolean(vcsTab);
  // The follow-up queue is the most urgent surface — it's a direct action
  // the user just took and must stay visible/active for — so it takes the
  // leftmost tab slot; files-in-progress is next, then the VCS summary
  // occupies whatever's left.
  const tabOrder = [
    hasQueueTab ? 'queue' : null,
    hasFilesTab ? 'files' : null,
    hasVcsTab ? 'vcs' : null,
  ].filter(Boolean);
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

  // Expanded height is the same fixed value regardless of content or which
  // tab is active — it never grows/shrinks with item count, and switching
  // tabs doesn't resize the box either; short content just leaves empty
  // space, and anything past the cap scrolls within it.
  useLayoutEffect(() => {
    setBodyHeight(collapsed ? 0 : QUEUE_BODY_MAX_HEIGHT);
  }, [collapsed]);

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

  // Priority order for stealing the active tab on arrival: queue > files >
  // vcs. Queue always claims focus the instant it appears; files claims it
  // right after (but only when queue isn't already the reason the panel is
  // open); vcs never auto-claims — it's reachable by hand but stays third.
  //
  // The files tab still auto-collapses the panel once it disappears — but
  // only when NOTHING else (queue or vcs) is left to show. Collapsing just
  // because files went away, while the user is sitting on the All Changes
  // tab (or a queue is still pending), would hide a tab that's still there
  // in the strip and still worth looking at.
  //
  // Debounced on purpose: a run finishing and the next queued item's run
  // starting both drive hasFilesTab/hasQueueTab through a single-commit dip
  // to (false, false) before settling back to non-empty — collapsing right
  // on that dip snapped the panel shut on every drained queue item even
  // though nothing ever actually disappeared from the user's point of view.
  // Waiting a beat and re-checking absorbs that dip; a real, sustained
  // disappearance still collapses, just a little after the fact.
  const hadFilesTabRef = useRef(hasFilesTab);
  useEffect(() => {
    const shouldCollapse = !hasFilesTab && hadFilesTabRef.current && !hasQueueTab && !hasVcsTab;
    hadFilesTabRef.current = hasFilesTab;
    if (!shouldCollapse) return undefined;
    const timer = window.setTimeout(() => applyCollapsed(true), 200);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasFilesTab, hasQueueTab, hasVcsTab]);

  // #1 priority: the queue tab claims focus and forces the panel open the
  // instant it appears — a follow-up only gets queued because a run was
  // already busy, so the user should see it land, not have it queue up
  // behind whatever tab (or collapsed state) they happened to be on.
  const hadQueueTabRef = useRef(hasQueueTab);
  useEffect(() => {
    if (hasQueueTab && !hadQueueTabRef.current) {
      setActiveTab('queue');
      applyCollapsed(false);
    }
    hadQueueTabRef.current = hasQueueTab;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasQueueTab]);

  // #2 priority: files claims focus on arrival too, but only when queue
  // isn't already the one claiming it this same tick (queue outranks it).
  const hadFilesAppearRef = useRef(hasFilesTab);
  useEffect(() => {
    if (hasFilesTab && !hadFilesAppearRef.current && !hasQueueTab) {
      setActiveTab('files');
    }
    hadFilesAppearRef.current = hasFilesTab;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasFilesTab, hasQueueTab]);

  // #3 priority: vcs (All Changes) never auto-claims focus on arrival —
  // it's still reachable by clicking its tab, it just doesn't steal
  // attention the way queue/files do.

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
              {tabId === 'files' ? (
                <>
                  <span className="ij-air-follow-up-queue__title">{filesTab?.label ?? 'Files'}</span>
                  <span className="ij-air-follow-up-queue__files-counts">
                    <span className="is-added">+{filesTab?.addedTotal ?? 0}</span>
                    <span className="is-removed">-{filesTab?.removedTotal ?? 0}</span>
                  </span>
                </>
              ) : tabId === 'queue' ? (
                <>
                  <span className="ij-air-follow-up-queue__title">{resolvedLabel}</span>
                  <span className="ij-air-follow-up-queue__count">{items.length}</span>
                </>
              ) : (
                <>
                  <span className="ij-air-follow-up-queue__title">{vcsTab.label}</span>
                  <span className="ij-air-follow-up-queue__count">{vcsTab.branch}</span>
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
                vcsTab.onDismissForever?.();
              }}
            >
              Don't show
            </button>
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
              className="ij-air-follow-up-queue__vcs-counts"
              disabled={Boolean(vcsTab.reviewDisabled)}
              aria-label={`Open ${vcsTab.label}. ${vcsTab.added} lines added, ${vcsTab.removed} lines removed`}
              onClick={(event) => {
                event.stopPropagation();
                vcsTab.onRunReview?.();
              }}
            >
              <span className="is-added">+{vcsTab.added}</span>
              <span className="is-removed">-{vcsTab.removed}</span>
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
            <div className="ij-air-follow-up-queue__vcs-files" aria-label={`${vcsTab?.label ?? 'All Changes'} files`}>
              {(vcsTab?.files ?? []).map((file) => (
                <VcsSummaryFileRow key={file.tabId} file={file} onOpenFile={vcsTab.onOpenFile} />
              ))}
            </div>
          ) : resolvedActiveTab === 'files' && filesTab?.variant === 'edit' ? (
            // Same row metrics and gap as the All Changes tab's file list
            // (.ij-air-follow-up-queue__vcs-files) so the two blocks read
            // as one consistent rhythm.
            <div className="ij-air-follow-up-queue__vcs-files">
              {/* Not-yet-revealed files aren't rendered as placeholders —
                  they simply aren't in the list yet, so the list grows as
                  each one materializes with its final change count. */}
              {scopeItems
                .filter((item) => item.status !== 'queued')
                .map((item) => <EditedFileQueueRow key={item.id} item={item} />)}
            </div>
          ) : resolvedActiveTab === 'files' ? (
            <ul className="ij-air-follow-up-queue__list">
              {scopeItems.map((item) => <ReviewScopeQueueRow key={item.id} item={item} />)}
            </ul>
          ) : (
            <ul className="ij-air-follow-up-queue__list">
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
