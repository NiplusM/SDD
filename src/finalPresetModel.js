// Data model for the toolbar "New Session" split control, its preset menu, the Manage Presets
// dialog and the agents catalogue. Ported from the AIUX-550 final-4 prototype
// (JetBrains/aia-design → int-ui-prototypes/src/designers/tanya/AIUX-550-Final4/index.jsx:6225-7690).
import { useSyncExternalStore } from 'react';

export const FINAL_RUN_IN_OPTIONS = [
  { id: 'this-mac', label: 'This Mac', icon: 'nodes/homeFolder' },
  { id: 'cloud', label: 'Send to cloud', cloud: true },
  { id: 'worktree', label: 'Worktree', icon: 'general/vcs' },
];

export const FINAL_MODEL_OPTIONS = [
  { id: 'luna-5-6', label: '5.6 Luna' },
  { id: 'codex-5-3', label: '5.3' },
  { id: 'automatic', label: 'Automatic' },
];

export const FINAL_CLAUDE_MODEL_OPTIONS = [
  { id: 'claude-opus-4-8', label: 'Opus 4.8' },
  { id: 'claude-sonnet-4-5', label: 'Sonnet 4.5' },
  { id: 'claude-haiku-4-5', label: 'Haiku 4.5' },
];

export const FINAL_COPILOT_MODEL_OPTIONS = [
  { id: 'copilot-auto', label: 'Copilot Auto' },
];

export const FINAL_CODEX_MODEL_OPTIONS = [
  { id: 'gpt-5-6-sol', label: 'GPT-5.6-Sol' },
];

export const FINAL_MODE_OPTIONS = [
  { id: 'default', label: 'Default mode' },
  { id: 'plan', label: 'Plan mode' },
  { id: 'ask', label: 'Ask mode' },
];

export const FINAL_EFFORT_OPTIONS = [
  { id: 'low', label: 'Low effort' },
  { id: 'medium', label: 'Medium effort' },
  { id: 'high', label: 'High effort' },
];

export const FINAL_CLAUDE_EFFORT_OPTIONS = [
  { id: 'default', label: 'Default effort' },
  { id: 'low', label: 'Low effort' },
  { id: 'medium', label: 'Medium effort' },
  { id: 'high', label: 'High effort' },
];

export const FINAL_CODEX_EFFORT_OPTIONS = [
  { id: 'low', label: 'Low' },
  { id: 'medium', label: 'Medium' },
  { id: 'high', label: 'High' },
  { id: 'extra-high', label: 'Extra High' },
];

export const FINAL_ACCESS_OPTIONS = [
  { id: 'full', label: 'Full access' },
  { id: 'workspace', label: 'Workspace access' },
  { id: 'read-only', label: 'Read-only access' },
];

export const FINAL_CLAUDE_EDIT_OPTIONS = [
  { id: 'accept-edits', label: 'Accept edits' },
  { id: 'ask-before-edits', label: 'Ask before edits' },
  { id: 'read-only', label: 'Read only' },
];

export const FINAL_PLAN_EFFORT_OPTIONS = [
  { id: 'default', label: 'Default plan effort' },
  { id: 'low', label: 'Low plan effort' },
  { id: 'high', label: 'High plan effort' },
];

// Mutable on purpose: installing an agent from the catalogue pushes it here, and getFinalAgentItems
// maps this array on every render, so the new agent shows up in the picker and in the preset list.
export const FINAL_DIRECT_AGENT_OPTIONS = [
  { id: 'junie', label: 'Junie by JetBrains', buttonLabel: 'Junie', agentId: 'junie' },
  { id: 'claude', label: 'Claude Agent', buttonLabel: 'Claude Agent', agentId: 'claude' },
  { id: 'codex', label: 'Codex', buttonLabel: 'Codex', agentId: 'codex' },
  { id: 'copilot', label: 'GitHub Copilot', buttonLabel: 'GitHub Copilot', agentId: 'copilot' },
];

export const FINAL_PRESET_AGENT_OPTIONS = [
  { id: 'codex', label: 'Codex', agentId: 'codex' },
  { id: 'junie', label: 'Junie by JetBrains', agentId: 'junie' },
  { id: 'claude', label: 'Claude Agent', agentId: 'claude' },
  { id: 'copilot', label: 'GitHub Copilot', agentId: 'copilot' },
];

export function getFinalAgentDefaults(agentId) {
  if (agentId === 'claude') {
    return {
      modelId: 'claude-opus-4-8',
      modeId: 'default',
      effortId: 'default',
      accessId: 'accept-edits',
      planEffortId: 'default',
    };
  }

  if (agentId === 'copilot') {
    return {
      modelId: 'copilot-auto',
      modeId: 'default',
      effortId: 'medium',
      accessId: 'full',
      planEffortId: 'default',
    };
  }

  if (agentId === 'codex') {
    return {
      modelId: 'gpt-5-6-sol',
      modeId: 'default',
      effortId: 'extra-high',
      accessId: 'full',
      planEffortId: 'default',
    };
  }

  return {
    modelId: 'luna-5-6',
    modeId: 'default',
    effortId: 'medium',
    accessId: 'full',
    planEffortId: 'default',
  };
}

export const FINAL_RECOMMENDED_AGENT = {
  id: 'recommended',
  label: 'Recommended · Codex',
  // The trigger shows the choice the user made, not the agent it resolves to.
  buttonLabel: 'Recommended Agent',
  agentId: 'codex',
  runInId: 'this-mac',
  launchTarget: 'chat',
  ...getFinalAgentDefaults('codex'),
  customPrompt: '',
  preset: false,
  defaultPreset: false,
  directAgent: true,
  recommended: true,
};

export const FINAL_MANAGED_RECOMMENDED_PRESET = {
  ...FINAL_RECOMMENDED_AGENT,
  label: 'Recommended Agent',
  preset: true,
  managedRecommendation: true,
};

// Ships with the prototype's own "Default Review Agent" preset: Codex in Chat on its
// defaults (5.6 Luna • Full • Medium) with `/review` as the injected instruction.
export const FINAL_CODE_REVIEW_PRESET = {
  id: 'code-review',
  label: 'Default Review Agent',
  buttonLabel: 'Default Review Agent',
  agentId: 'codex',
  runInId: 'this-mac',
  launchTarget: 'chat',
  ...getFinalAgentDefaults('codex'),
  customPrompt: '/review',
  preset: true,
  defaultPreset: false,
  presetKind: 'custom',
  autoUpdate: false,
  lockedPreset: true,
};

// Task Mode (AIUX-639): Codex in Chat on its defaults. Ships by default — unlike a user-added
// preset, it does not require "Add Agents"/"Manage Presets".
export const FINAL_SDD_PRESET = {
  id: 'sdd',
  label: 'Task Mode',
  buttonLabel: 'Task Mode',
  agentId: 'codex',
  runInId: 'this-mac',
  launchTarget: 'chat',
  ...getFinalAgentDefaults('codex'),
  customPrompt: '',
  sddMode: true,
  preset: true,
  defaultPreset: false,
  presetKind: 'custom',
  autoUpdate: false,
  lockedPreset: true,
};

export const FINAL_INITIAL_PRESETS = [FINAL_CODE_REVIEW_PRESET, FINAL_SDD_PRESET];

export function getFinalModelOptions(agentId) {
  if (agentId === 'copilot') return FINAL_COPILOT_MODEL_OPTIONS;
  if (agentId === 'codex') return FINAL_CODEX_MODEL_OPTIONS;
  return agentId === 'claude' ? FINAL_CLAUDE_MODEL_OPTIONS : FINAL_MODEL_OPTIONS;
}

export function getFinalEffortOptions(agentId) {
  if (agentId === 'codex') return FINAL_CODEX_EFFORT_OPTIONS;
  return agentId === 'claude' ? FINAL_CLAUDE_EFFORT_OPTIONS : FINAL_EFFORT_OPTIONS;
}

export function getFinalAgentItems(
  presets,
  defaultOverrides = {},
  removedDefaultAgentIds = [],
  preserveRemovedAgents = false,
  preserveDefaultLaunchTarget = false,
  includeRecommendedAgent = false,
) {
  const defaultItems = FINAL_DIRECT_AGENT_OPTIONS.map((item) => {
    const defaultPresetRemoved = removedDefaultAgentIds.includes(item.agentId);
    const override = defaultOverrides[item.agentId] ?? {};

    if (defaultPresetRemoved && preserveRemovedAgents) {
      return {
        ...item,
        id: item.id,
        agentId: item.agentId,
        preset: false,
        defaultPreset: false,
        directAgent: true,
        presetKind: null,
        autoUpdate: false,
        presetBehaviorV2: true,
      };
    }

    return {
      ...item,
      ...getFinalAgentDefaults(item.agentId),
      runInId: 'this-mac',
      launchTarget: 'chat',
      customPrompt: '',
      ...override,
      id: item.id,
      agentId: item.agentId,
      preset: false,
      defaultPreset: true,
      presetKind: 'default',
      autoUpdate: override.autoUpdate ?? true,
      presetBehaviorV2: preserveRemovedAgents,
      preserveDefaultLaunchTarget,
      defaultPresetModified: Boolean(override.defaultPresetModified),
    };
  }).filter((item) => preserveRemovedAgents || !removedDefaultAgentIds.includes(item.agentId));

  const items = preserveRemovedAgents ? [...presets, ...defaultItems] : [...defaultItems, ...presets];
  return includeRecommendedAgent ? [FINAL_RECOMMENDED_AGENT, ...items] : items;
}

// The agent's own name, as the picker shows it.
export function getFinalAgentLabel(agentId) {
  return [...FINAL_DIRECT_AGENT_OPTIONS, ...FINAL_PRESET_AGENT_OPTIONS]
    .find((option) => option.agentId === agentId)?.label ?? agentId ?? 'Agent';
}

// Compose a preset name from its parameters: [Model] · [Effort] · [Access].
// The model leads the name; effort and access are appended only when they
// differ from the agent defaults, with their " effort"/" access" suffixes dropped.
export function getFinalPresetName(configuration) {
  const defaults = getFinalAgentDefaults(configuration.agentId);
  const parts = [];

  const modelLabel = getFinalModelOptions(configuration.agentId)
    .find((option) => option.id === configuration.modelId)?.label;
  if (modelLabel) parts.push(modelLabel);

  const effortLabel = getFinalEffortOptions(configuration.agentId)
    .find((option) => option.id === configuration.effortId)?.label;
  if (effortLabel && configuration.effortId !== defaults.effortId) {
    parts.push(effortLabel.replace(/\s+effort$/i, ''));
  }

  const accessOptions = configuration.agentId === 'claude' ? FINAL_CLAUDE_EDIT_OPTIONS : FINAL_ACCESS_OPTIONS;
  const accessLabel = accessOptions.find((option) => option.id === configuration.accessId)?.label;
  if (accessLabel && configuration.accessId !== defaults.accessId) {
    parts.push(accessLabel.replace(/\s+access$/i, ''));
  }

  if (parts.length) return parts.join(' · ');

  return getFinalAgentLabel(configuration.agentId);
}

// Single source of truth for "this preset opens a terminal session". Custom presets always keep
// their launch target; a default (installed-agent) preset only does so in the variants that let the
// user edit it — the same condition getFinalSessionConfiguration uses to keep `launchTarget`.
export function finalItemStartsInTerminal(item) {
  return Boolean(
    item
    && item.launchTarget === 'terminal'
    && (item.preset || item.presetBehaviorV2 || item.preserveDefaultLaunchTarget),
  );
}

export function getFinalSessionConfiguration(item = null) {
  const recommended = item?.id === 'recommended';
  const preset = Boolean(
    item?.preset
    || (item?.defaultPreset && (item?.presetBehaviorV2 || item?.preserveDefaultLaunchTarget)),
  );
  const agentId = recommended ? 'codex' : item?.agentId ?? 'codex';
  const defaults = getFinalAgentDefaults(agentId);

  return {
    choiceId: item?.id ?? 'codex',
    agentId,
    runInId: recommended ? 'this-mac' : item?.runInId ?? 'this-mac',
    launchTarget: preset ? item.launchTarget ?? 'chat' : 'chat',
    modelId: item?.modelId ?? defaults.modelId,
    modeId: item?.modeId ?? defaults.modeId,
    effortId: item?.effortId ?? defaults.effortId,
    accessId: item?.accessId ?? defaults.accessId,
    planEffortId: item?.planEffortId ?? defaults.planEffortId,
    customPrompt: preset ? item.customPrompt ?? '' : '',
  };
}

export function createFinalPresetDraftFromConfiguration(configuration, sourcePreset = null) {
  if (sourcePreset) return { ...sourcePreset };

  return {
    id: null,
    // A brand new preset is named after its agent, not after its parameters: it still carries the
    // agent defaults, so `[Model] · [Effort] · [Access]` gave every preset the same "5.6 Luna" name.
    label: getFinalAgentLabel(configuration.agentId),
    agentId: configuration.agentId,
    runInId: configuration.runInId,
    launchTarget: configuration.launchTarget,
    modelId: configuration.modelId,
    modeId: configuration.modeId,
    effortId: configuration.effortId,
    accessId: configuration.accessId,
    planEffortId: configuration.planEffortId,
    customPrompt: configuration.customPrompt,
    preset: true,
    defaultPreset: false,
    presetKind: 'custom',
    autoUpdate: false,
  };
}

export const FINAL_PRESET_CONFIGURATION_KEYS = [
  'agentId',
  'runInId',
  'launchTarget',
  'modelId',
  'modeId',
  'effortId',
  'accessId',
  'planEffortId',
];

const FINAL_SESSION_CONFIGURATION_KEYS = ['choiceId', ...FINAL_PRESET_CONFIGURATION_KEYS];

// Persist the toolbar session controls (agent, location, model, effort, access…) across page
// reloads so the picks the user makes are remembered between sessions.
// The typed task (customPrompt) is intentionally NOT persisted.
const FINAL_CONFIGURATION_STORAGE_PREFIX = 'aiux550f4:session-configuration:';

export function readStoredFinalConfiguration(variantKey) {
  try {
    const raw = window.localStorage.getItem(FINAL_CONFIGURATION_STORAGE_PREFIX + variantKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const result = {};
    for (const key of FINAL_SESSION_CONFIGURATION_KEYS) {
      if (typeof parsed[key] === 'string') result[key] = parsed[key];
    }
    return Object.keys(result).length ? result : null;
  } catch {
    return null;
  }
}

export function writeStoredFinalConfiguration(variantKey, configuration) {
  if (!configuration) return;
  try {
    const result = {};
    for (const key of FINAL_SESSION_CONFIGURATION_KEYS) {
      if (typeof configuration[key] === 'string') result[key] = configuration[key];
    }
    window.localStorage.setItem(
      FINAL_CONFIGURATION_STORAGE_PREFIX + variantKey,
      JSON.stringify(result),
    );
  } catch {
    // Ignore storage failures (private mode, quota, unavailable localStorage).
  }
}

// Edits made to an installed agent's preset in the Manage Presets dialog — most visibly its
// `in: Chat / Terminal` choice — survive a reload, like the session configuration above. Entries for
// agents that are no longer installed are simply never read.
const FINAL_DEFAULT_PRESET_OVERRIDES_STORAGE_KEY = 'aiux550f4:default-preset-overrides';

export function readStoredFinalDefaultPresetOverrides() {
  try {
    const raw = window.localStorage.getItem(FINAL_DEFAULT_PRESET_OVERRIDES_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function writeStoredFinalDefaultPresetOverrides(overrides) {
  try {
    window.localStorage.setItem(
      FINAL_DEFAULT_PRESET_OVERRIDES_STORAGE_KEY,
      JSON.stringify(overrides ?? {}),
    );
  } catch {
    // Ignore storage failures (private mode, quota, unavailable localStorage).
  }
}

export function isFinalPresetModified(preset, configuration) {
  return Boolean(preset) && FINAL_PRESET_CONFIGURATION_KEYS.some(
    (key) => preset[key] !== configuration[key],
  );
}

// The only agents with a bundled logo. Everything else in the catalogue draws an initials badge, in
// the picker and the preset list exactly as in the catalogue itself — see FinalChoiceIcon.
export const FINAL_LOGO_AGENT_IDS = ['claude', 'codex', 'gemini', 'junie', 'copilot'];

// ─── Agents catalogue ────────────────────────────────────────────────────────

export const AGENT_CATALOGUE_COLUMNS = [
  [
    {
      id: 'amp',
      name: 'Amp',
      version: 'v0.7.0',
      updateTo: 'v0.8.1',
      description: 'ACP wrapper for Amp - the frontier coding agent',
      author: 'tao12345666333',
      action: 'Update',
    },
    {
      id: 'claude',
      name: 'Claude Agent',
      version: 'v0.32.0',
      updateTo: 'v0.53.0',
      description: "ACP wrapper for Anthropic's Claude",
      author: 'Anthropic +2',
      action: 'Update',
      bundled: true,
    },
    {
      id: 'cline',
      name: 'Cline',
      version: 'v2.14.0',
      updateTo: 'v3.0.34',
      description: 'Autonomous coding agent CLI for editing files and running commands',
      author: 'Cline Bot Inc.',
      action: 'Update',
    },
    {
      id: 'codex',
      name: 'Codex',
      version: 'v0.0.44',
      updateTo: 'v1.0.2',
      description: "ACP adapter for OpenAI's coding assistant",
      author: 'OpenAI +1',
      action: 'Update',
      bundled: true,
    },
    {
      id: 'cursor',
      name: 'Cursor',
      version: 'v0.1.0',
      updateTo: 'v2026.06.26',
      description: "Cursor's coding agent",
      author: 'Cursor',
      action: 'Update',
    },
    {
      id: 'gemini',
      name: 'Gemini CLI',
      version: 'v0.41.1',
      updateTo: 'v0.49.0',
      description: "Google's official CLI for Gemini",
      author: 'Google',
      action: 'Update',
    },
    {
      id: 'copilot',
      name: 'GitHub Copilot',
      version: 'v1.503.0',
      updateTo: 'v1.515.0',
      description: "GitHub's AI pair programmer",
      author: 'GitHub',
      action: 'Update',
    },
    {
      id: 'junie',
      name: 'Junie',
      version: 'v1468.30.0',
      updateTo: 'v2045.46.0',
      description: 'AI Coding Agent by JetBrains',
      author: 'JetBrains',
      action: 'Update',
      bundled: true,
    },
    {
      id: 'kilo',
      name: 'Kilo',
      version: 'v7.2.10',
      updateTo: 'v7.3.54',
      description: 'The open source coding agent',
      author: 'Kilo Code',
      action: 'Update',
    },
  ],
  [
    {
      id: 'deepagents',
      name: 'DeepAgents',
      version: 'v0.1.7',
      description: 'Batteries-included AI coding and general purpose agent',
      author: 'LangChain',
      action: 'Uninstall',
    },
    {
      id: 'agoragentic',
      name: 'Agoragentic',
      version: 'v1.3.0',
      description: 'Agent marketplace with 174+ AI capabilities',
      author: 'ACRE / Agoragentic',
      action: 'Install',
    },
    {
      id: 'auggie',
      name: 'Auggie CLI',
      version: 'v0.31.0',
      description: "Augment Code's powerful software agent",
      author: 'Augment Code',
      action: 'Install',
    },
    {
      id: 'autohand',
      name: 'Autohand Code',
      version: 'v0.2.1',
      description: 'AI coding agent powered by Autohand AI',
      author: 'Autohand AI',
      action: 'Install',
    },
    {
      id: 'codebuddy',
      name: 'Codebuddy Code',
      version: 'v2.106.7',
      description: "Tencent Cloud's official intelligent coding tool",
      author: 'Tencent Cloud',
      action: 'Install',
    },
    {
      id: 'cortex',
      name: 'Cortex Code',
      version: 'v1.0.73',
      description: "Snowflake's Cortex Code coding agent",
      author: 'Snowflake',
      action: 'Install',
    },
    {
      id: 'corust',
      name: 'Corust Agent',
      version: 'v0.6.0',
      description: 'Co-building with a seasoned Rust partner',
      author: 'Corust AI',
      action: 'Install',
    },
    {
      id: 'crow',
      name: 'crow-cli',
      version: 'v0.1.24',
      description: 'Minimal ACP Native Coding Agent',
      author: 'Thomas Wood',
      action: 'Install',
    },
    {
      id: 'devin',
      name: 'Devin',
      version: 'v2026.8.18',
      description: 'Devin CLI coding agent by Cognition',
      author: 'Cognition',
      action: 'Install',
    },
  ],
];

// Only the agents offered in the agent picker ship installed; everything else stays available
// until the user installs it from the catalogue.
const BUNDLED_INSTALLED_AGENT_IDS = ['junie', 'claude', 'codex', 'copilot'];

// The catalogue editor is rendered without props from two different subtrees, and the install has to
// reach the agent picker and the preset list as well, so the state lives in a tiny module store.
// Deliberately not persisted: an install lasts for the session, and a reload resets the catalogue to
// the bundled four so the prototype always opens in a known state.
let agentInstallState = {
  installed: [...BUNDLED_INSTALLED_AGENT_IDS],
  // { [agentId]: progress 0..100 } while the fake download runs.
  installing: {},
};
const agentInstallListeners = new Set();

function setAgentInstallState(next) {
  agentInstallState = { ...agentInstallState, ...next };
  agentInstallListeners.forEach((listener) => listener());
}

function subscribeToAgentInstalls(listener) {
  agentInstallListeners.add(listener);
  return () => agentInstallListeners.delete(listener);
}

export function useAgentInstallState() {
  return useSyncExternalStore(subscribeToAgentInstalls, () => agentInstallState);
}

// Installing an agent adds it to FINAL_DIRECT_AGENT_OPTIONS in place: getFinalAgentItems maps that
// array on every render, so the agent shows up in the picker and gets its own row in the Manage
// Presets list without threading anything through the call sites.
function addFinalDirectAgentOption(agentId) {
  if (FINAL_DIRECT_AGENT_OPTIONS.some((option) => option.id === agentId)) return;

  const catalogueAgent = AGENT_CATALOGUE_COLUMNS.flat().find((agent) => agent.id === agentId);
  const label = catalogueAgent?.name ?? agentId;

  // No `icon`: FinalChoiceIcon draws the same initials badge the catalogue uses for this agent.
  FINAL_DIRECT_AGENT_OPTIONS.push({ id: agentId, label, buttonLabel: label, agentId });
}

const AGENT_INSTALL_STEP_MS = 260;

export function startAgentInstall(agentId) {
  if (agentInstallState.installed.includes(agentId)) return;
  if (agentInstallState.installing[agentId] !== undefined) return;

  setAgentInstallState({
    installing: { ...agentInstallState.installing, [agentId]: 0 },
  });

  const tick = () => {
    const current = agentInstallState.installing[agentId];
    if (current === undefined) return;

    const next = current + 20;

    if (next < 100) {
      setAgentInstallState({
        installing: { ...agentInstallState.installing, [agentId]: next },
      });
      window.setTimeout(tick, AGENT_INSTALL_STEP_MS);
      return;
    }

    addFinalDirectAgentOption(agentId);

    const installing = { ...agentInstallState.installing };
    delete installing[agentId];
    const installed = [...agentInstallState.installed, agentId];
    setAgentInstallState({ installed, installing });
  };

  window.setTimeout(tick, AGENT_INSTALL_STEP_MS);
}

export function getAgentCatalogueSections(installedIds) {
  const agents = AGENT_CATALOGUE_COLUMNS.flat();

  return [
    {
      id: 'installed',
      title: 'Installed',
      agents: agents
        .filter((agent) => installedIds.includes(agent.id))
        // A just-installed agent is on its latest version, so it neither offers an update nor
        // counts towards "Update all N".
        .map((agent) => (
          BUNDLED_INSTALLED_AGENT_IDS.includes(agent.id)
            ? agent
            : { ...agent, updateTo: undefined }
        )),
    },
    {
      id: 'not-installed',
      title: 'Available',
      agents: agents.filter((agent) => !installedIds.includes(agent.id)),
    },
  ];
}

export function isCatalogueAgent(agentId) {
  return AGENT_CATALOGUE_COLUMNS.some((column) => column.some((agent) => agent.id === agentId));
}
