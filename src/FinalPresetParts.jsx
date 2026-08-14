// Shared primitives for the AIUX-550 final-4 session control, preset menu, Manage Presets dialog
// and agents catalogue. Ported from the prototype
// (JetBrains/aia-design → int-ui-prototypes/src/designers/tanya/AIUX-550-Final4/index.jsx).
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@jetbrains/int-ui-kit';
import { AiChatAgentIcon } from './AiChatListParts.jsx';
import { FINAL_LOGO_AGENT_IDS, isCatalogueAgent } from './finalPresetModel.js';
// The two agents whose real logos ship as assets in the prototype
// (int-ui-prototypes/src/assets/openAI.svg, github-copilot.svg).
import openAiIconUrl from './assets/openAI.svg';
import githubCopilotIconUrl from './assets/github-copilot.svg';

const FINAL_AGENT_ICON_URLS = {
  codex: openAiIconUrl,
  copilot: githubCopilotIconUrl,
};

export function TrafficLights({ onClose } = {}) {
  return (
    <div className="aiux550f4-base-traffic" aria-hidden={!onClose}>
      {onClose ? (
        <button
          className="red"
          type="button"
          aria-label="Close window"
          title="Close window"
          onClick={onClose}
        />
      ) : (
        <span className="red" />
      )}
      <span className="yellow" />
      <span className="green" />
    </div>
  );
}

export function CloudMarker() {
  return (
    <svg
      className="aiux550f4-base-cloud-marker"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        fill="currentColor"
        fillRule="evenodd"
        clipRule="evenodd"
        d="M8 4C6.80272 4 5.76826 4.70135 5.28689 5.71782L5.1583 5.98935L4.85818 6.00328C3.26739 6.07711 2 7.39069 2 9C2 10.6569 3.34315 12 5 12H11.5C12.8807 12 14 10.8807 14 9.5C14 8.11976 12.8815 7.00076 11.5014 7C11.5009 7 11.5005 7 11.5 7L11.0314 7.00276L10.9696 6.57098C10.7618 5.11752 9.51098 4 8 4ZM4.51881 5.02868C5.20575 3.81809 6.5069 3 8 3C9.87134 3 11.4419 4.28465 11.879 6.02029C13.6338 6.20925 15 7.69507 15 9.5C15 11.433 13.433 13 11.5 13H5C2.79086 13 1 11.2091 1 9C1 6.9537 2.53638 5.2665 4.51881 5.02868Z"
      />
    </svg>
  );
}

export function FinalAgentBadge({ agentId, size = 20 }) {
  // The catalogue's Available rows draw the badge at its natural 32px; smaller slots opt into an
  // override class instead of an inline style so the shape/colour variants stay in the stylesheet.
  const sizeClass = size >= 32
    ? ''
    : `aiux550f4-final-agent-inline-badge${size < 20 ? ' small' : ''}`;

  return (
    <span className={`aiux550f4-final-agent-catalogue-custom-icon ${sizeClass} ${agentId}`.replace(/\s+/g, ' ').trim()}>
      {agentId.slice(0, 2).toUpperCase()}
    </span>
  );
}

export function FinalChoiceIcon({ option, size = 20 }) {
  if (option?.iconUrl) {
    return <img src={option.iconUrl} alt="" width={size} height={size} />;
  }
  const iconUrl = option?.agentId ? FINAL_AGENT_ICON_URLS[option.agentId] : null;
  if (iconUrl) {
    return (
      <img
        src={iconUrl}
        alt=""
        width={size}
        height={size}
        data-agent={option.agentId}
        aria-hidden="true"
      />
    );
  }
  if (option?.agentId && FINAL_LOGO_AGENT_IDS.includes(option.agentId)) {
    return <AiChatAgentIcon icon={option.agentId} title="" />;
  }
  // Agents without a bundled logo (Cursor, anything installed from the catalogue) get the same
  // initials badge everywhere they appear.
  if (option?.agentId && isCatalogueAgent(option.agentId)) {
    return <FinalAgentBadge agentId={option.agentId} size={size} />;
  }
  if (option?.cloud) return <CloudMarker />;
  if (option?.icon) return <Icon name={option.icon} size={size} />;
  return null;
}

export function getFinalAnchoredPopupPosition(anchorRect, width, estimatedHeight, align = 'start') {
  const margin = 8;
  const gap = 4;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const desiredHeight = Math.min(estimatedHeight, viewportHeight - (margin * 2));
  const availableBelow = viewportHeight - anchorRect.bottom - margin - gap;
  const availableAbove = anchorRect.top - margin - gap;
  const placeAbove = availableBelow < Math.min(desiredHeight, 180) && availableAbove > availableBelow;
  const maxHeight = Math.max(120, Math.min(desiredHeight, placeAbove ? availableAbove : availableBelow));
  const preferredLeft = align === 'end' ? anchorRect.right - width : anchorRect.left;
  const left = Math.max(margin, Math.min(viewportWidth - width - margin, preferredLeft));
  const top = placeAbove
    ? Math.max(margin, anchorRect.top - maxHeight - gap)
    : Math.min(viewportHeight - maxHeight - margin, anchorRect.bottom + gap);

  return { left, maxHeight, top };
}

export function FinalAnchoredPopup({
  align = 'start',
  anchorRef,
  ariaLabel,
  children,
  className = '',
  estimatedHeight,
  onClose,
  open,
  width,
}) {
  const popupRef = useRef(null);
  const [position, setPosition] = useState(null);

  const updatePosition = useCallback(() => {
    const anchorRect = anchorRef.current?.getBoundingClientRect();
    if (!anchorRect) return;
    setPosition(getFinalAnchoredPopupPosition(anchorRect, width, estimatedHeight, align));
  }, [align, anchorRef, estimatedHeight, width]);

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return undefined;
    }

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return undefined;

    const handlePointerDown = (event) => {
      if (anchorRef.current?.contains(event.target) || popupRef.current?.contains(event.target)) return;
      onClose?.();
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.();
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [anchorRef, onClose, open]);

  if (!open || !position) return null;

  return createPortal(
    <div
      ref={popupRef}
      className={`aiux550f4-final-final-anchored-popup ${className}`.trim()}
      role="menu"
      aria-label={ariaLabel}
      data-final-popup={ariaLabel}
      style={{
        left: `${position.left}px`,
        maxHeight: `${position.maxHeight}px`,
        top: `${position.top}px`,
        width: `${width}px`,
      }}
    >
      {children}
    </div>,
    document.body,
  );
}

export function FinalSessionSelect({
  align = 'start',
  ariaLabel,
  className = '',
  // Optional trailing action, rendered under a separator: { label, onSelect }.
  footerAction,
  getMenuOptionLabel = (option) => option.label,
  getSelectedOptionLabel = (option) => option.label,
  onChange,
  options,
  value,
}) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef(null);
  const selectedOption = options.find((option) => option.id === value) ?? options[0];
  const menuOptions = options.map((option) => ({
    ...option,
    menuLabel: getMenuOptionLabel(option),
  }));
  const popupWidth = Math.max(
    176,
    ...menuOptions.map((option) => option.menuLabel.length * 8 + 64),
    ...(footerAction ? [footerAction.label.length * 8 + 64] : []),
  );

  return (
    <span className={`aiux550f4-final-final-select ${className}`.trim()} ref={anchorRef}>
      <button
        type="button"
        className={`aiux550f4-final-final-select-button ${open ? 'open' : ''}`.trim()}
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <FinalChoiceIcon option={selectedOption} size={16} />
        <span>{getSelectedOptionLabel(selectedOption)}</span>
        <Icon name="general/chevronDown" size={16} />
      </button>
      <FinalAnchoredPopup
        anchorRef={anchorRef}
        ariaLabel={`${ariaLabel} options`}
        className="aiux550f4-final-final-select-menu"
        estimatedHeight={((options.length + (footerAction ? 1 : 0)) * 30) + 10}
        onClose={() => setOpen(false)}
        open={open}
        width={popupWidth}
        align={align}
      >
        {menuOptions.map((option) => (
          <button
            key={option.id}
            type="button"
            className={option.id === value ? 'selected' : ''}
            role="menuitemradio"
            aria-checked={option.id === value}
            onClick={() => {
              onChange?.(option.id);
              setOpen(false);
            }}
          >
            <span className="aiux550f4-final-final-menu-option-icon">
              <FinalChoiceIcon option={option} size={16} />
            </span>
            <span>{option.menuLabel}</span>
            {option.id === value ? <Icon name="general/checkmark" size={16} /> : null}
          </button>
        ))}
        {footerAction ? (
          <>
            <div className="aiux550f4-final-final-select-menu-divider" aria-hidden="true" />
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                footerAction.onSelect?.();
              }}
            >
              {/* Empty icon cell keeps the label on the same x as the agent labels above. */}
              <span className="aiux550f4-final-final-menu-option-icon" />
              <span>{footerAction.label}</span>
            </button>
          </>
        ) : null}
      </FinalAnchoredPopup>
    </span>
  );
}

export function FinalPresetSectionHelp({ ariaLabel, tooltip, tooltipId }) {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState(null);
  const anchorRef = useRef(null);

  const showTooltip = () => {
    const rect = anchorRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = 280;
    setPosition({
      left: Math.min(window.innerWidth - width - 8, rect.left),
      top: rect.bottom + 6,
      width,
    });
    setVisible(true);
  };

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        className="aiux550f4-final-final-preset-section-help"
        aria-label={ariaLabel}
        aria-describedby={visible ? tooltipId : undefined}
        onBlur={() => setVisible(false)}
        onFocus={showTooltip}
        onMouseEnter={showTooltip}
        onMouseLeave={() => setVisible(false)}
      >
        ?
      </button>
      {visible && position ? createPortal(
        <span
          id={tooltipId}
          className="aiux550f4-final-final-preset-section-tooltip"
          role="tooltip"
          style={{
            left: `${position.left}px`,
            top: `${position.top}px`,
            width: `${position.width}px`,
          }}
        >
          {tooltip}
        </span>,
        document.body,
      ) : null}
    </>
  );
}
