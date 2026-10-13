import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { DEFAULT_SETTINGS, STORAGE_KEY, generateDemoMessage, getCheckedFiles, normalizeSettings, readSettings } from './airCommitState.js';

const SETTINGS_CHANGED = 'ijai2499:air-settings-changed';

export function useAirCommitPreferences() {
  const [settings, setSettings] = useState(() => {
    try { return readSettings(window.localStorage); } catch { return { ...DEFAULT_SETTINGS }; }
  });
  const [storageError, setStorageError] = useState(false);
  useEffect(() => {
    const sync = event => setSettings(normalizeSettings(event.detail));
    window.addEventListener(SETTINGS_CHANGED, sync);
    return () => window.removeEventListener(SETTINGS_CHANGED, sync);
  }, []);
  useEffect(() => {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...settings, defaultsVersion: 2 })); setStorageError(false); }
    catch { setStorageError(true); }
  }, [settings]);
  const changeSettings = useCallback(value => {
    const next = normalizeSettings(value);
    setSettings(next);
    window.dispatchEvent(new CustomEvent(SETTINGS_CHANGED, { detail: next }));
  }, []);
  return { settings, changeSettings, storageError };
}

export function useAirCommit({ files, checkedIds, branch, scopeId, onGenerationStart, onGenerationFinish }) {
  const [message, setMessage] = useState('');
  const { settings, changeSettings: saveSettings, storageError } = useAirCommitPreferences();
  const [job, setJob] = useState(null);
  const [status, setStatus] = useState('');
  const [issue, setIssue] = useState(null);
  const requestId = useRef(0);
  const jobRef = useRef(null);
  const callbacks = useRef(null);
  callbacks.current = { onGenerationStart, onGenerationFinish };
  const messageRef = useRef(null);
  const scenario = useRef(new URLSearchParams(window.location.search).get('scenario') ?? 'info');
  const hasAgent = scenario.current !== 'no-agents';
  const checkedFiles = getCheckedFiles(files, checkedIds);
  const selectionKey = JSON.stringify(checkedFiles.map(file => [file.id, file.status, file.path]));

  const cancel = useCallback((notice = '') => {
    requestId.current += 1;
    const pending = jobRef.current;
    jobRef.current = null;
    setJob(null);
    setIssue(null);
    setStatus('');
    if (pending) {
      const result = notice
        ? { kind: 'error', code: 'stopped', title: 'Commit message generation stopped.',
            description: 'Generation was stopped before a result was returned. Your draft is preserved.' }
        : { kind: 'cancelled', description: 'Generation was cancelled because its files, settings or draft changed.' };
      callbacks.current.onGenerationFinish?.(pending, result);
      if (notice) setIssue({ ...result, request: pending });
    }
  }, []);
  useLayoutEffect(() => { cancel(); }, [selectionKey, branch, scopeId, settings, cancel]);
  useEffect(() => () => {
    const pending = jobRef.current;
    jobRef.current = null;
    if (pending) callbacks.current.onGenerationFinish?.(pending, { kind: 'cancelled', description: 'Generation was cancelled when Commit closed.' });
  }, []);
  useEffect(() => {
    if (!job || job.phase === 'awaiting-input') return;
    const timer = window.setTimeout(() => {
      if (job.id !== requestId.current) return;
      let result;
      if (job.outcome === 'info') {
        const pending = { ...job, phase: 'awaiting-input' };
        jobRef.current = pending;
        setJob(pending);
        result = { kind: 'info', title: 'Confirm access in chat to continue generation.',
          description: 'I need your confirmation before reading the selected local changes.' };
      } else if (job.outcome === 'error') {
        result = { kind: 'error', code: 'timeout', title: 'Commit message generation failed.',
          description: 'The request timed out before a result was returned. Your draft is preserved.' };
      } else {
        const generatedMessage = generateDemoMessage(job);
        setMessage(generatedMessage);
        setStatus('');
        messageRef.current?.focus();
        result = { kind: 'success', message: generatedMessage };
      }
      if (result.kind !== 'info') { setJob(null); jobRef.current = null; }
      callbacks.current.onGenerationFinish?.(job, result);
      if (result.kind === 'info' || result.kind === 'error') setIssue({ ...result, request: job });
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [job]);

  function generate() {
    if (!hasAgent || !checkedFiles.length || jobRef.current) return;
    setIssue(null); setStatus('');
    const outcome = ['info', 'error', 'success'].includes(scenario.current) ? scenario.current : 'info';
    const request = { id: ++requestId.current, files: checkedFiles.map(file => ({ ...file })),
      settings: { ...settings }, branch, draft: message, outcome };
    request.chatId = callbacks.current.onGenerationStart?.(request, () => cancel('Generation stopped.'), answer => confirm(request.id, answer)) ?? null;
    jobRef.current = request;
    setJob(request);
  }
  function confirm(expectedId, answer) {
    const pending = jobRef.current;
    if (!pending || pending.phase !== 'awaiting-input' || pending.id !== requestId.current || pending.id !== expectedId) return false;
    if (answer?.choiceId === 'reject' || answer?.choiceId === 'skip') { cancel('Generation stopped.'); return true; }
    const resumed = { ...pending, phase: 'generating', outcome: 'success', confirmation: answer.label,
      settings: { ...pending.settings, prompt: [pending.settings.prompt, answer.instructions].filter(Boolean).join('\n') } };
    jobRef.current = resumed;
    setIssue(null);
    setJob(resumed);
    callbacks.current.onGenerationFinish?.(resumed, { kind: 'resuming', answer: answer.label });
    return true;
  }
  function editMessage(value) { cancel(); setMessage(value); }
  function changeSettings(value) { cancel(); saveSettings(value); }
  return { message, messageRef, editMessage, settings, changeSettings, storageError, job, generate, cancel,
    status, issue, checkedFiles, hasAgent, canGenerate: hasAgent && checkedFiles.length > 0 && !job && issue?.kind !== 'info',
    canCommit: checkedFiles.length > 0 && !job && Boolean(message.trim()) };
}
