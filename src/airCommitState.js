export const STORAGE_KEY = 'ijai2499:petclinic:air:v1';
export const AGENTS = [
  { value: 'junie', label: 'Junie', models: ['Claude Sonnet 4.5', 'GPT-5'] },
  { value: 'claude', label: 'Claude Agent', models: ['Claude Haiku 4.5', 'Claude Sonnet 4.5'] },
  { value: 'codex', label: 'Codex', models: ['GPT-5 mini · medium', 'GPT-5'] },
];
export const DEFAULT_PROMPT = 'Avoid overly verbose descriptions or unnecessary details.';
const LEGACY_DEFAULT_PROMPT = 'Avoid overly verbose descriptions or unnecessary details.\nStart with a short sentence in imperative form, no more than 50 characters long.\nThen leave an empty line and continue with a short list of changes.';
export const DEFAULT_SETTINGS = { agent: 'codex', model: 'GPT-5 mini · medium', prompt: DEFAULT_PROMPT };

export function normalizeSettings(value) {
  const agent = AGENTS.find(item => item.value === (value?.agent ?? DEFAULT_SETTINGS.agent))
    ?? AGENTS.find(item => item.value === DEFAULT_SETTINGS.agent);
  return {
    agent: agent.value,
    model: agent.models.includes(value?.model) ? value.model : agent.models[0],
    prompt: typeof value?.prompt === 'string' && value.prompt !== LEGACY_DEFAULT_PROMPT ? value.prompt : DEFAULT_PROMPT,
  };
}

export function readSettings(storage) {
  try {
    const saved = JSON.parse(storage.getItem(STORAGE_KEY));
    const isPreviousDefault = !saved?.defaultsVersion && saved?.agent === 'junie'
      && saved?.model === 'Claude Sonnet 4.5'
      && [DEFAULT_PROMPT, LEGACY_DEFAULT_PROMPT].includes(saved?.prompt);
    return isPreviousDefault ? { ...DEFAULT_SETTINGS } : normalizeSettings(saved);
  }
  catch { return { ...DEFAULT_SETTINGS }; }
}

export function getCheckedFiles(files, checkedIds) {
  return files.filter(file => checkedIds.has(file.id));
}

// Deterministic demo, using the fork's actual checked-file metadata. No model
// or Git service is invoked; there is no second, unrelated set of demo files.
export function generateDemoMessage({ files, settings, branch }) {
  if (!files.length) return '';
  const prompt = settings.prompt;
  const ru = /russian|русск/i.test(prompt);
  const verbs = ru
    ? { added: 'Добавить', untracked: 'Добавить', deleted: 'Удалить', renamed: 'Переименовать', modified: 'Обновить' }
    : { added: 'Add', untracked: 'Add', deleted: 'Remove', renamed: 'Rename', modified: 'Update' };
  const summary = file => `${verbs[file.status] ?? verbs.modified} ${file.previousLabel ? `${file.previousLabel} → ` : ''}${file.label}`;
  let title = files.length === 1 ? summary(files[0]) : (ru ? 'Обновить выбранные файлы PetClinic' : 'Update selected PetClinic files');
  if (/conventional/i.test(prompt)) title = `chore: ${title.charAt(0).toLowerCase()}${title.slice(1)}`;
  const limit = Number(prompt.match(/(?:no more than|max(?:imum)?|up to)\s+(\d+)\s+characters/i)?.[1]);
  if (limit > 3 && title.length > limit) title = title.slice(0, limit - 1).trimEnd() + '…';
  const singleLine = /one[- ]line|single[- ]line|одн[ау] строк|только заголовок/i.test(prompt);
  const numbered = /numbered|нумерован/i.test(prompt);
  const details = files.map((file, index) => `${numbered ? `${index + 1}.` : '-'} ${summary(file)}.`).join('\n');
  const branchContext = (prompt.includes('$GIT_BRANCH_NAME') || prompt.includes('{branch_name}')) ? branch : '';
  return [title + (singleLine && branchContext ? ` (${branchContext})` : ''), ...(!singleLine ? [details, branchContext].filter(Boolean) : [])].join('\n\n');
}
