import { createPortal } from 'react-dom';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button, Checkbox, Dialog, DialogGroupHeader, Dropdown, Icon, IconButton, Input, Link, Banner, Popup, PopupCell, PositionedPopup, SettingsDialog, ToolbarButton, TreeNode } from '@jetbrains/int-ui-kit';
import { AGENTS, DEFAULT_PROMPT, DEFAULT_SETTINGS, normalizeSettings } from './airCommitState.js';
import { AiChatAgentIcon } from './AiChatListParts.jsx';
import './AirCommit.css';

const CHECKS = ['Reformat code', 'Rearrange code', 'Optimize imports', 'Cleanup', 'Check malicious dependencies', 'Update copyright']
const ADVANCED_CHECKS = ['Analyze code', 'Check TODO', 'Run Configuration']
const CHECK_ACTIONS = { 'Analyze code': 'inspection', 'Check TODO': 'todo', Cleanup: 'cleanup', 'Run Configuration': 'tests' }
const COMMIT_PREFERENCES = {
  inspection: { title: 'Choose inspection profile', label: 'Profile', action: 'Choose profile', options: ['Project Default', 'Default'] },
  todo: { title: 'Configure TODO check', label: 'Filter', action: 'Configure', options: ['All TODO items', 'TODO only', 'FIXME only'] },
  cleanup: { title: 'Choose cleanup profile', label: 'Profile', action: 'Choose profile', options: ['Project Default', 'Default'] },
  tests: { title: 'Choose run configuration', label: 'Configuration', action: 'Choose configuration', options: ['All Tests', 'Unit Tests', 'Integration Tests'] },
  upload: { title: 'Deployment', label: 'Upload files to', options: ['<None>', 'Staging'] },
}

function useOverlayFocus(ref, close, restore) {
  useEffect(() => {
    const previous = restore ?? document.activeElement
    const el = ref.current
    const selector = 'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), [tabindex="0"]'
    el?.querySelector(selector)?.focus()
    function keyDown(event) {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return }
      if (event.key !== 'Tab') return
      const items = [...(el?.querySelectorAll(selector) ?? [])].filter(node => node.getClientRects().length)
      if (!items.length) return
      if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1).focus() }
      else if (!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0].focus() }
    }
    el?.addEventListener('keydown', keyDown)
    return () => { el?.removeEventListener('keydown', keyDown); if (previous?.isConnected) previous.focus() }
  // The overlay owns focus for its lifetime, not on every field update.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}

function AirSelectorMenu({ title, options, value, defaultValue, anchor, onChange, close }) {
  const ref = useRef(null)
  const [active, setActive] = useState(Math.max(0, options.findIndex(option => option.value === value)))
  useOverlayFocus(ref, close, anchor.element)
  useEffect(() => { ref.current?.querySelector('[tabindex="0"]')?.focus() }, [active])
  const choose = option => { onChange(option.value); close() }
  function keyDown(event) {
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault(); event.stopPropagation()
      setActive(index => event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1
        : (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length)
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault(); event.stopPropagation(); choose(options[active])
    }
  }
  return createPortal(<div className="ij2499-selector-layer">
    <PositionedPopup triggerRect={anchor.rect} onDismiss={close}>
      <Popup visible header={title} className="ij2499-selector-menu theme-dark" style={{ position: 'static' }}>
        <div ref={ref} role="menu" aria-label={title} onKeyDown={keyDown}>
          {options.map((option, index) => <div key={option.value} role="menuitemradio" aria-checked={option.value === value}
            tabIndex={index === active ? 0 : -1} onMouseEnter={() => setActive(index)}>
            <PopupCell type="advanced" icon={option.icon} selected={index === active} hint={option.value === defaultValue ? 'Default' : undefined}
              moduleIcon={option.value === value ? 'general/checkmark' : undefined} onClick={() => choose(option)}>
              {option.label}
            </PopupCell>
          </div>)}
        </div>
      </Popup>
    </PositionedPopup>
  </div>, document.body)
}

function AirFields({ value, onChange, prefix, disabled = false, compact = false, readOnlyConfiguration = false, openSettings }) {
  const agent = AGENTS.find(a => a.value === value.agent)
  const textareaRef = useRef(null)
  const changeAgent = id => onChange(normalizeSettings({ ...value, agent: id, model: null }))
  const [selector, setSelector] = useState(null)
  function openSelector(kind, event) {
    const element = event.currentTarget
    setSelector(current => current?.kind === kind ? null : { kind, element, rect: element.getBoundingClientRect() })
  }
  const agentOptions = AGENTS.map(({ value, label }) => ({ value, label, icon: <AiChatAgentIcon icon={value} /> }))
  const modelOptions = agent.models.map(model => ({ value: model, label: model }))
  return (
    <div className="ij2499-air-fields">
      <div className="ij2499-selector-row" data-testid={`${prefix}-agent`}>
        <span className="ij2499-selector-label">Agent:</span>
        {readOnlyConfiguration ? <span className="ij2499-configuration-value"><AiChatAgentIcon icon={agent.value} />{agent.label}</span> : <ToolbarButton text={agent.label} icon={<AiChatAgentIcon icon={agent.value} />} showChevron disabled={disabled} aria-label={`Agent: ${agent.label}`}
          aria-haspopup="menu" aria-expanded={selector?.kind === 'agent'}
          onClick={event => openSelector('agent', event)} />}
      </div>
      <div className="ij2499-selector-row" data-testid={`${prefix}-model`}>
        <span className="ij2499-selector-label">Model:</span>
        {readOnlyConfiguration ? <span className="ij2499-configuration-value">{value.model}</span> : <ToolbarButton text={value.model} showChevron disabled={disabled} aria-label={`Model: ${value.model}`}
          aria-haspopup="menu" aria-expanded={selector?.kind === 'model'}
          onClick={event => openSelector('model', event)} />}
      </div>
      {selector && <AirSelectorMenu title={selector.kind === 'agent' ? 'Agent' : 'Model'}
        options={selector.kind === 'agent' ? agentOptions : modelOptions}
        value={selector.kind === 'agent' ? value.agent : value.model}
        defaultValue={selector.kind === 'agent' ? DEFAULT_SETTINGS.agent : agent.models[0]}
        anchor={selector} onChange={selector.kind === 'agent' ? changeAgent : model => onChange({ ...value, model })}
        close={() => setSelector(null)} />}
      <div className="ij2499-prompt-block">
      <div className="ij2499-prompt-label"><label htmlFor={`${prefix}-prompt`}>Prompt for generation:</label></div>
      <textarea ref={textareaRef} id={`${prefix}-prompt`} className="commit-message-textarea ij2499-prompt" value={value.prompt}
        onChange={event => onChange({ ...value, prompt: event.target.value })} disabled={disabled} />
      {!compact && <><p className="ij2499-help">Set the length, language, and format of the message.</p>
      <div className="ij2499-prompt-actions"><Link onClick={() => onChange({ ...value, prompt: DEFAULT_PROMPT })} disabled={disabled || value.prompt === DEFAULT_PROMPT}>Restore default</Link></div></>}
      {openSettings && <Link className="ij2499-open-settings" onClick={openSettings}>Open in Settings…</Link>}
      </div>
    </div>
  )
}

function CommitPreferenceDialog({ preference, value, save, close }) {
  const [draft, setDraft] = useState(value)
  const ref = useRef(null)
  const config = COMMIT_PREFERENCES[preference]
  useOverlayFocus(ref, close)
  return <div ref={ref} className="ij2499-modal theme-dark" role="dialog" aria-modal="true" aria-label={config.title}>
    <Dialog title={config.title} width={420} showMacOSButtons={false} showHelp={false} buttons={[
      { children: 'Cancel', onClick: close },
      { children: 'OK', type: 'primary', onClick: () => { save(draft); close() } },
    ]}>
      <div className="ij2499-preference-content"><Dropdown label={config.label} value={draft} onChange={setDraft}
        options={config.options.map(option => ({ value: option, label: option }))} /></div>
    </Dialog>
  </div>
}

export function CommitOptions({ anchor, close, settings, changeSettings, openSettings, git, setGit, storageError }) {
  const ref = useRef(null)
  const [preference, setPreference] = useState(null)
  const availableHeight = Math.max(anchor.rect.top, window.innerHeight - anchor.rect.bottom) - 24
  useOverlayFocus(ref, close, anchor.element)
  const renderCheck = label => <div key={label} className="ij2499-check-row"><Checkbox label={label} checked={git.checks.includes(label)}
    onChange={checked => setGit({ ...git, checks: checked ? [...git.checks, label] : git.checks.filter(item => item !== label) })} />
    {CHECK_ACTIONS[label] && <Link aria-label={`${COMMIT_PREFERENCES[CHECK_ACTIONS[label]].action} for ${label}`} onClick={() => setPreference(CHECK_ACTIONS[label])}>
      {COMMIT_PREFERENCES[CHECK_ACTIONS[label]].action}
    </Link>}
  </div>
  return (
    <><PositionedPopup triggerRect={anchor.rect} onDismiss={() => { if (!preference) close(); }}>
      <Popup visible className="ij2499-options theme-dark" style={{ position: 'static' }}>
        <div ref={ref} role="dialog" aria-label="Commit Options" className="ij2499-options-content" style={{ maxHeight: availableHeight }}>
          <section><DialogGroupHeader title="Git" role="heading" aria-level={3} />
            <div className="ij2499-option-fields"><Input label="Author" labelWidth={48} value={git.author} onChange={event => setGit({ ...git, author: event.target.value })} aria-label="Author" />
            <Checkbox label="Sign-off commit" checked={git.signOff} onChange={signOff => setGit({ ...git, signOff })} />
            </div>
          </section>
          <section><DialogGroupHeader title="Commit Checks" role="heading" aria-level={3} /><div className="ij2499-option-fields ij2499-checks">
            {CHECKS.map(renderCheck)}
          </div></section>
          <section><DialogGroupHeader title="Advanced Commit Checks" role="heading" aria-level={3} />
            <div className="ij2499-option-fields ij2499-checks ij2499-advanced-checks">
              {ADVANCED_CHECKS.map(renderCheck)}
              <div className="ij2499-advanced-after">
                <Checkbox label="Run advanced checks after a commit is done" checked={git.advancedAfterCommit}
                  onChange={advancedAfterCommit => setGit({ ...git, advancedAfterCommit })} />
                <p className="ij2499-help">Failed checks will not prevent a commit</p>
              </div>
            </div>
          </section>
          <section><DialogGroupHeader title="After Commit" role="heading" aria-level={3} /><div className="ij2499-option-fields">
            <div className="ij2499-upload-row"><Dropdown label="Upload files to" value={git.upload} onChange={upload => setGit({ ...git, upload })}
              options={COMMIT_PREFERENCES.upload.options.map(option => ({ value: option, label: option }))} />
              <Button size="slim" aria-label="Configure deployment" title="Configure deployment" onClick={() => setPreference('upload')}>…</Button>
            </div>
            <Checkbox className="ij2499-upload-default" label="Always use selected server or group of servers" checked={git.alwaysUpload} onChange={alwaysUpload => setGit({ ...git, alwaysUpload })} />
          </div></section>
          <section><DialogGroupHeader title="Air" role="heading" aria-level={3} /><div className="ij2499-option-fields">
            <AirFields value={settings} onChange={changeSettings} prefix="popup" compact readOnlyConfiguration openSettings={openSettings} />
            {storageError && <p role="status" className="ij2499-help">Settings apply to this session. Browser storage is unavailable.</p>}
          </div>
          </section>
        </div>
      </Popup>
    </PositionedPopup>
    {preference && createPortal(<CommitPreferenceDialog preference={preference} value={git[preference]} close={() => setPreference(null)} save={value => setGit({ ...git, [preference]: value })} />, document.body)}</>
  )
}

export function CommitGenerationBanner({ issue, onOpenChat }) {
  return <Banner className="ij2499-generation-banner" type={issue.kind} showCloseButton={false}
    role={issue.kind === 'error' ? 'alert' : 'status'} aria-live="polite"
    actions={[{ label: 'Open chat', onClick: onOpenChat }]}>
    {issue.title}
  </Banner>
}

export function AirGenerationSettingsSection({ settings, onChange, storageError, branch, breadcrumb }) {
  return <section className="ij2499-settings-page" aria-label="Commit Message Generation">
    {breadcrumb ?? <div className="ij2499-settings-breadcrumb">Air <Icon name="general/chevronRight" size={16} /> Commit Message Generation</div>}
    <p>Generate a message from the changes selected for a commit.</p>
    <AirFields value={settings} onChange={onChange} prefix="settings" />
    {storageError && <p role="status">Settings apply to this session. Browser storage is unavailable.</p>}
  </section>
}

export function AirSettings({ settings, save, close, storageError, branch }) {
  const [draft, setDraft] = useState({ ...settings })
  const [applied, setApplied] = useState({ ...settings })
  const ref = useRef(null)
  useOverlayFocus(ref, close)
  const dirty = JSON.stringify(draft) !== JSON.stringify(applied)
  return (
    <div className="ij2499-modal theme-dark" ref={ref} role="dialog" aria-modal="true" aria-label="Settings — Air">
      <SettingsDialog title="Settings" onClose={close} className="ij2499-settings" buttons={[
        { children: 'Cancel', onClick: close },
        { children: 'Apply', disabled: !dirty, onClick: () => { save(draft); setApplied({ ...draft }) } },
        { children: 'OK', type: 'primary', onClick: () => { save(draft); close() } },
      ]}>
        <div className="settings-layout">
          <div className="settings-tree-panel">
            <TreeNode label="Air" hasChildren isExpanded>
              <TreeNode label="Commit Message Generation" level={2} isSelected />
            </TreeNode>
          </div>
          <div className="settings-content-panel ij2499-settings-container"><AirGenerationSettingsSection settings={draft} onChange={setDraft} branch={branch} storageError={storageError} /></div>
        </div>
      </SettingsDialog>
    </div>
  )
}
