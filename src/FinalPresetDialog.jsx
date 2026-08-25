// Manage Presets dialog. Ported from the AIUX-550 final-4 prototype
// (JetBrains/aia-design → int-ui-prototypes/src/designers/tanya/AIUX-550-Final4/index.jsx:8545-9044).
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@jetbrains/int-ui-kit';
import {
  FinalAnchoredPopup,
  FinalChoiceIcon,
  FinalPresetSectionHelp,
  CloudMarker,
  FinalSessionSelect,
  TrafficLights,
} from './FinalPresetParts.jsx';
import {
  FINAL_ACCESS_OPTIONS,
  FINAL_CLAUDE_EDIT_OPTIONS,
  FINAL_DIRECT_AGENT_OPTIONS,
  FINAL_MANAGED_RECOMMENDED_PRESET,
  finalItemStartsInTerminal,
  getFinalAgentDefaults,
  getFinalAgentLabel,
  getFinalEffortOptions,
  getFinalModelOptions,
  getFinalPresetName,
} from './finalPresetModel.js';

export function FinalPresetDialog({
  allowSaveAfterPresetRemoval = false,
  customPresetsOnly = false,
  draft: providedDraft,
  defaultPresets = FINAL_DIRECT_AGENT_OPTIONS,
  empty = false,
  onAddAgent,
  onCancel,
  onChange,
  onDuplicate,
  onEmpty,
  onOpenAgentCatalogue,
  onRemove,
  onResetDefault,
  onSave,
  open,
  presetBehaviorV2 = false,
  preserveDefaultPresetNames = false,
  showPresetSectionHelp = false,
  presets = [],
}) {
  const [addAgentOpen, setAddAgentOpen] = useState(false);
  const [presetListModified, setPresetListModified] = useState(false);
  // Figma 9882-205548 draws the "Advanced" group expanded.
  const [advancedOpen, setAdvancedOpen] = useState(true);
  const addAgentAnchorRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onCancel?.();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onCancel, open]);

  if (!open || (!providedDraft && !empty)) return null;

  const draft = providedDraft ?? {
    id: null,
    label: '',
    agentId: 'codex',
    runInId: 'this-mac',
    launchTarget: 'chat',
    ...getFinalAgentDefaults('codex'),
    customPrompt: '',
    preset: false,
    defaultPreset: false,
    presetKind: 'custom',
    autoUpdate: false,
    defaultPresetModified: false,
  };

  const defaultPresetModified = Boolean(draft.defaultPresetModified);
  const recommendedDraft = Boolean(draft.managedRecommendation);
  const lockedDraft = Boolean(draft.lockedPreset);

  const update = (key, nextValue) => {
    const nextDraft = {
      ...draft,
      [key]: nextValue,
      defaultPresetModified: draft.defaultPreset ? true : draft.defaultPresetModified,
    };
    onChange?.(nextDraft);
  };
  // Switching the agent has to reset the parameters: models and efforts are per-agent lists.
  const changeDraftAgent = (nextAgentId) => {
    if (nextAgentId === draft.agentId) return;
    // The name defaults to the agent's own name and keeps following it until the user types
    // something else — otherwise a preset created for Codex stays called "Codex" after the agent
    // has been switched to Junie.
    // A default (installed-agent) row is identified by its agent name, so it keeps its label.
    const autoNamed = !draft.defaultPreset
      && (!draft.label?.trim() || draft.label === getFinalAgentLabel(draft.agentId));
    onChange?.({
      ...draft,
      agentId: nextAgentId,
      ...getFinalAgentDefaults(nextAgentId),
      label: autoNamed ? getFinalAgentLabel(nextAgentId) : draft.label,
      defaultPresetModified: draft.defaultPreset ? true : draft.defaultPresetModified,
    });
  };
  const claudeSelected = draft.agentId === 'claude';
  const modelOptions = getFinalModelOptions(draft.agentId);
  const effortOptions = getFinalEffortOptions(draft.agentId);
  const modeOptions = claudeSelected ? FINAL_CLAUDE_EDIT_OPTIONS : FINAL_ACCESS_OPTIONS;
  const sddModeOptions = [
    { id: 'on', label: 'On' },
    { id: 'off', label: 'Off' },
  ];
  // Figma 9882-205548 has a single "OK": it saves when there is something to save, else it closes.
  // The recommendation still goes through `onSave` — it has nothing to persist, but OK has to hand
  // the selected preset to the chat behind the dialog.
  const confirmDialog = () => {
    if (empty || !draft.label?.trim()) {
      onCancel?.();
      return;
    }
    onSave?.({ presetListModified });
  };
  // `defaultPresets` may already start with the recommended agent; the managed preset replaces it.
  const installedAgentPresets = defaultPresets.filter((item) => !item.recommended);
  const lockedCustomPresets = presets.filter((item) => item.lockedPreset);
  const editableCustomPresets = presets.filter((item) => !item.lockedPreset);
  const dialogPresetItems = (
    // Every installed agent gets a preset row, so the list always offers a starting point.
    customPresetsOnly
      ? [FINAL_MANAGED_RECOMMENDED_PRESET, ...lockedCustomPresets, ...installedAgentPresets, ...editableCustomPresets]
      : [...defaultPresets, ...presets]
  ).map((item) => (
    item.id === draft.id ? { ...item, ...draft } : item
  ));
  if (draft.id && !dialogPresetItems.some((item) => item.id === draft.id)) {
    dialogPresetItems.push(draft);
  }
  const selectedDialogPresetId = dialogPresetItems.some((item) => item.id === draft.id)
    ? draft.id
    : draft.agentId;
  const defaultPresetIds = new Set(defaultPresets.map((item) => item.id));
  const isDefaultDialogPreset = (item) => (
    !item.managedRecommendation && (item.defaultPreset || defaultPresetIds.has(item.id))
  );
  const defaultDialogPresetItems = dialogPresetItems.filter(isDefaultDialogPreset);
  const customDialogPresetItems = dialogPresetItems.filter((item) => !isDefaultDialogPreset(item));

  const selectDialogPreset = (item) => {
    if (item.preset) {
      onChange?.({
        ...draft,
        ...item,
        // Explicit, not inherited from whatever preset was open before —
        // otherwise switching e.g. SDD -> another preset without its own
        // sddMode field would silently keep SDD mode "On".
        sddMode: Boolean(item.sddMode),
        managedRecommendation: Boolean(item.managedRecommendation),
        lockedPreset: Boolean(item.lockedPreset),
        defaultPreset: false,
        defaultPresetModified: false,
      }, { promote: false });
      return;
    }

    const nextDraft = {
      ...draft,
      id: null,
      preset: false,
      // Leaving the managed recommendation keeps the editor read-only on the agent we just picked.
      managedRecommendation: false,
      lockedPreset: false,
      defaultPreset: true,
      presetKind: 'default',
      defaultPresetModified: Boolean(item.defaultPresetModified),
      autoUpdate: item.autoUpdate ?? true,
      agentId: item.agentId,
      ...getFinalAgentDefaults(item.agentId),
      runInId: item.runInId ?? 'this-mac',
      launchTarget: item.launchTarget ?? 'chat',
      modelId: item.modelId ?? getFinalAgentDefaults(item.agentId).modelId,
      modeId: item.modeId ?? getFinalAgentDefaults(item.agentId).modeId,
      effortId: item.effortId ?? getFinalAgentDefaults(item.agentId).effortId,
      accessId: item.accessId ?? getFinalAgentDefaults(item.agentId).accessId,
      planEffortId: item.planEffortId ?? getFinalAgentDefaults(item.agentId).planEffortId,
      customPrompt: item.customPrompt ?? '',
      // These built-in agent entries (Codex, Claude, Junie, ...) never carry
      // sddMode themselves — always reset explicitly, or it'd keep whatever
      // was left over from the previously open preset (e.g. SDD's "On").
      sddMode: Boolean(item.sddMode),
    };
    onChange?.({
      ...nextDraft,
      label: preserveDefaultPresetNames ? item.label : getFinalPresetName(nextDraft),
    }, { promote: false });
  };

  const renderDialogPresetItem = (item) => {
    const itemLaunchTarget = item.id === selectedDialogPresetId
      ? draft.launchTarget ?? item.launchTarget
      : item.launchTarget;
    const defaultItem = isDefaultDialogPreset(item);

    return (
      <button
        key={item.id}
        type="button"
        className={[
          item.id === selectedDialogPresetId ? 'selected' : '',
          item.managedRecommendation ? 'recommended' : '',
        ].filter(Boolean).join(' ')}
        role="option"
        aria-selected={item.id === selectedDialogPresetId}
        onClick={() => selectDialogPreset(item)}
      >
        <span className="aiux550f4-final-final-preset-list-icon">
          <FinalChoiceIcon option={item} />
          {item.cloud ? <span className="aiux550f4-final-final-agent-cloud"><CloudMarker /></span> : null}
        </span>
        <span className="aiux550f4-final-final-preset-list-label">
          <span>{item.label}</span>
          {!defaultItem && item.secondaryLabel ? <span>{item.secondaryLabel}</span> : null}
          {finalItemStartsInTerminal({ ...item, launchTarget: itemLaunchTarget }) ? (
            <span>Terminal</span>
          ) : null}
        </span>
        {item.id === selectedDialogPresetId ? (
          // Figma 9882-205548 marks the row the editor pane is showing with a checkmark.
          <Icon name="general/checkmark" size={16} className="aiux550f4-final-final-preset-list-check" />
        ) : null}
      </button>
    );
  };

  return createPortal(
    <div
      className="aiux550f4-final-final-preset-overlay"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onCancel?.();
      }}
    >
      <section
        className={`aiux550f4-final-final-preset-dialog ${draft.defaultPreset ? 'default-preset' : 'custom-preset'}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-label="Agent preset"
        data-final-popup="Agent preset"
        onPointerDown={(event) => event.stopPropagation()}
      >
        {/* Figma 9882-205548: a macOS dialog header with the traffic lights and a centered title. */}
        <header className="aiux550f4-final-final-preset-dialog-header">
          <TrafficLights onClose={onCancel} />
          <h2>Manage Presets</h2>
        </header>
        <div className="aiux550f4-final-final-preset-dialog-body">
          <div className="aiux550f4-final-final-preset-sidebar">
            <div className="aiux550f4-final-final-preset-list-toolbar" role="toolbar" aria-label="Preset actions">
              <button
                ref={addAgentAnchorRef}
                type="button"
                aria-label="Add preset"
                aria-haspopup="menu"
                aria-expanded={addAgentOpen}
                onClick={() => setAddAgentOpen((current) => !current)}
              >
                <Icon name="general/add" size={16} />
              </button>
              <button
                type="button"
                aria-label="Remove preset"
                disabled={empty || recommendedDraft || lockedDraft || (!draft.id && !draft.defaultPreset)}
                onClick={() => {
                  const isCurrentPreset = (item) => (draft.defaultPreset
                    ? item.defaultPreset && item.agentId === draft.agentId
                    : item.id === draft.id);
                  const remainingItems = dialogPresetItems.filter((item) => !isCurrentPreset(item));
                  const nextItem = remainingItems.find((item) => item.agentId === draft.agentId)
                    ?? remainingItems[0];

                  if (allowSaveAfterPresetRemoval) setPresetListModified(true);
                  onRemove?.(draft);
                  if (nextItem) {
                    selectDialogPreset(nextItem);
                  } else {
                    onEmpty?.();
                  }
                }}
              >
                <Icon name="general/remove" size={16} />
              </button>
              <button
                type="button"
                aria-label="Duplicate preset"
                disabled={empty || recommendedDraft || lockedDraft}
                onClick={() => onDuplicate?.(draft)}
              >
                <Icon name="general/copy" size={16} />
              </button>
              <button type="button" aria-label="Move preset up" disabled={empty || recommendedDraft || lockedDraft}>
                <Icon name="general/moveUp" size={16} />
              </button>
              <button type="button" aria-label="Move preset down" disabled={empty || recommendedDraft || lockedDraft}>
                <Icon name="general/moveDown" size={16} />
              </button>
            </div>
            {/* Figma 9929-208448: the "+" popup offers preset actions, not a list of agents. */}
            <FinalAnchoredPopup
              align="start"
              anchorRef={addAgentAnchorRef}
              ariaLabel="Add preset"
              className="aiux550f4-final-final-select-menu aiux550f4-final-final-preset-add-menu"
              estimatedHeight={92}
              onClose={() => setAddAgentOpen(false)}
              open={addAgentOpen}
              width={274}
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setAddAgentOpen(false);
                  // No agent is picked here anymore: keep the one being edited, else the first installed agent.
                  onAddAgent?.({ agentId: draft?.agentId ?? FINAL_DIRECT_AGENT_OPTIONS[0].agentId });
                }}
              >
                <span className="aiux550f4-final-final-menu-option-icon">
                  <Icon name="general/add" size={20} />
                </span>
                <span>New Preset</span>
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => setAddAgentOpen(false)}
              >
                <span className="aiux550f4-final-final-menu-option-icon">
                  <Icon name="general/import" size={20} />
                </span>
                <span>Import Preset...</span>
              </button>
            </FinalAnchoredPopup>
            <div className="aiux550f4-final-final-preset-list" role="listbox" aria-label="Presets">
              {empty ? (
                <button
                  type="button"
                  className="aiux550f4-final-final-preset-empty-add"
                  aria-label="Add a new preset"
                  onClick={() => setAddAgentOpen(true)}
                >
                  <span>Add</span>
                  <span>a new preset</span>
                </button>
              ) : customPresetsOnly ? (
                // One flat list: recommendation, then the installed agents, then custom presets.
                dialogPresetItems.map(renderDialogPresetItem)
              ) : (
                <>
                  <div className="aiux550f4-final-final-preset-section-label">
                    <span>Default presets</span>
                    {showPresetSectionHelp ? (
                      <FinalPresetSectionHelp
                        ariaLabel="About default presets"
                        tooltip="Changes to default presets are saved immediately and reused for future sessions."
                        tooltipId="final-default-presets-help"
                      />
                    ) : null}
                  </div>
                  {defaultDialogPresetItems.map(renderDialogPresetItem)}
                  {!presetBehaviorV2 && customDialogPresetItems.length ? (
                    <>
                      <div className="aiux550f4-final-final-preset-group-divider" aria-hidden="true" />
                      <div className="aiux550f4-final-final-preset-section-label">
                        <span>Custom presets</span>
                        {showPresetSectionHelp ? (
                          <FinalPresetSectionHelp
                            ariaLabel="About custom presets"
                            tooltip="Changes to custom presets stay session-only until you update the preset or save a new one."
                            tooltipId="final-custom-presets-help"
                          />
                        ) : null}
                      </div>
                      {customDialogPresetItems.map(renderDialogPresetItem)}
                    </>
                  ) : null}
                </>
              )}
            </div>
          </div>
          <div className="aiux550f4-final-final-preset-main">
            {empty ? (
              <p className="aiux550f4-final-final-preset-empty-main">
                Create a new preset to change parameters
              </p>
            ) : recommendedDraft ? (
              <div className="aiux550f4-final-final-recommended-preset-details">
                <p>Currently: Codex • 5.6 Sol • high</p>
                <p>
                  Picks the best performance-to-cost agent and model.
                  <br />
                  <a href="https://dpaia.dev/" target="_blank" rel="noreferrer">
                    How the agent is selected ↗
                  </a>
                </p>
                <p className="muted">You can’t change the recommended preset</p>
              </div>
            ) : (
              <div className="aiux550f4-final-final-preset-main-fields">
                <label className="aiux550f4-final-final-preset-name">
                  <span>Name:</span>
                  <span className="aiux550f4-final-final-preset-name-control">
                    <input
                      value={draft.label}
                      onChange={(event) => update('label', event.target.value)}
                    />
                    {draft.defaultPreset && defaultPresetModified ? (
                      <button
                        type="button"
                        className="aiux550f4-final-final-reset-default"
                        onClick={() => onResetDefault?.(draft)}
                      >
                        Reset to default
                      </button>
                    ) : null}
                  </span>
                </label>
                <div className="aiux550f4-final-final-preset-agent-row">
                  <span className="aiux550f4-final-final-preset-labelled-row">
                    <span>Agent:</span>
                    <FinalSessionSelect
                      ariaLabel="Preset agent"
                      options={FINAL_DIRECT_AGENT_OPTIONS}
                      value={draft.agentId}
                      getSelectedOptionLabel={(option) => option.buttonLabel ?? option.label}
                      onChange={changeDraftAgent}
                      footerAction={onOpenAgentCatalogue ? {
                        label: 'Add Agent...',
                        // The catalogue is an editor tab, so it cannot open behind the modal.
                        onSelect: () => {
                          onCancel?.();
                          onOpenAgentCatalogue();
                        },
                      } : undefined}
                    />
                  </span>
                  <span className="aiux550f4-final-final-preset-agent-row-label">in:</span>
                  <span className="aiux550f4-final-final-preset-segmented" role="group" aria-label="Start session in">
                    {[
                      { id: 'chat', label: 'Chat', icon: 'aiAssistant/toolWindowChat' },
                      { id: 'terminal', label: 'Terminal', icon: 'toolwindows/terminal' },
                    ].map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        className={draft.launchTarget === option.id ? 'selected' : ''}
                        aria-pressed={draft.launchTarget === option.id}
                        onClick={() => update('launchTarget', option.id)}
                      >
                        <Icon name={option.icon} size={16} />
                        <span>{option.label}</span>
                      </button>
                    ))}
                  </span>
                </div>
                <div className="aiux550f4-final-final-preset-parameters">
                  <span>Model:</span>
                  <FinalSessionSelect
                    ariaLabel="Preset model"
                    options={modelOptions}
                    value={draft.modelId}
                    onChange={(nextValue) => update('modelId', nextValue)}
                  />
                  <span>Mode:</span>
                  <FinalSessionSelect
                    ariaLabel="Preset mode"
                    options={modeOptions}
                    value={draft.accessId}
                    getMenuOptionLabel={(option) => option.label.replace(/\s+access$/i, '')}
                    getSelectedOptionLabel={(option) => option.label.replace(/\s+access$/i, '')}
                    onChange={(nextValue) => update('accessId', nextValue)}
                  />
                  <span>Effort:</span>
                  <FinalSessionSelect
                    ariaLabel="Preset effort"
                    options={effortOptions}
                    value={draft.effortId}
                    getMenuOptionLabel={(option) => option.label.replace(/\s+effort$/i, '')}
                    getSelectedOptionLabel={(option) => option.label.replace(/\s+effort$/i, '')}
                    onChange={(nextValue) => update('effortId', nextValue)}
                  />
                </div>
                <div className="aiux550f4-final-final-preset-group">
                  <div className="aiux550f4-final-final-preset-group-header">
                    <button
                      type="button"
                      aria-expanded={advancedOpen}
                      onClick={() => setAdvancedOpen((current) => !current)}
                    >
                      <Icon name={advancedOpen ? 'general/chevronDown' : 'general/chevronRight'} size={16} />
                      <span>Advanced</span>
                    </button>
                    <span className="aiux550f4-final-final-preset-group-rule" aria-hidden="true" />
                  </div>
                  {advancedOpen ? (
                    <>
                      <div className="aiux550f4-final-final-preset-parameters aiux550f4-final-final-preset-parameters-sdd">
                        <span>SDD mode:</span>
                        <FinalSessionSelect
                          ariaLabel="SDD mode"
                          options={sddModeOptions}
                          value={draft.sddMode ? 'on' : 'off'}
                          onChange={(nextValue) => update('sddMode', nextValue === 'on')}
                        />
                      </div>
                      <label className="aiux550f4-final-final-preset-field custom-prompt">
                        <span>Injected instructions:</span>
                        <textarea
                          value={draft.customPrompt}
                          placeholder="Prefill the input"
                          onChange={(event) => update('customPrompt', event.target.value)}
                        />
                        <span className="aiux550f4-final-final-preset-field-hint">
                          Sent before the first prompt and hidden from AIR’s editor, transcript, and session title
                        </span>
                      </label>
                    </>
                  ) : null}
                </div>
              </div>
            )}
          </div>
        </div>
        <footer className="aiux550f4-final-final-preset-actions">
          <button
            type="button"
            className="aiux550f4-final-final-preset-help-button"
            aria-label="Preset help"
          >
            <Icon name="general/help" size={20} />
          </button>
          <button type="button" className="primary" onClick={confirmDialog}>OK</button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
