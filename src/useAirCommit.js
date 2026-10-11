import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AGENTS, DEFAULT_SETTINGS, STORAGE_KEY, generateDemoMessage, getCheckedFiles, normalizeSettings, readSettings } from './airCommitState.js';

const SETTINGS_CHANGED = 'aiux594-v4:air-settings-changed';

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

export function useAirCommit({ files, checkedIds, branch, scopeId }) {
  const [message, setMessage] = useState('');
  const { settings, changeSettings: saveSettings, storageError } = useAirCommitPreferences();
  const [job, setJob] = useState(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState(null);
  const requestId = useRef(0);
  const messageRef = useRef(null);
  const completedAttempts = useRef(0);
  const errorAttempt = useRef(new URLSearchParams(window.location.search).get('scenario') === 'error' ? 1 : 2);
  const checkedFiles = getCheckedFiles(files, checkedIds);
  const selectionKey = JSON.stringify(checkedFiles.map(file => [file.id, file.status, file.path]));

  const cancel = useCallback((notice = '') => {
    requestId.current += 1;
    setJob(null);
    setError(null);
    setStatus(notice);
  }, []);
  useLayoutEffect(() => { cancel(); }, [selectionKey, branch, scopeId, settings, cancel]);
  useEffect(() => {
    if (!job) return;
    const timer = window.setTimeout(() => {
      if (job.id !== requestId.current) return;
      setJob(null);
      completedAttempts.current += 1;
      if (completedAttempts.current === errorAttempt.current) {
        const agent = AGENTS.find(item => item.value === job.settings.agent);
        setError({
          title: 'Couldn’t generate a commit message',
          description: `${agent.label} did not respond before the request timed out. Your draft is preserved.`,
          request: job,
        });
      } else {
        setMessage(generateDemoMessage(job));
        setStatus('');
        messageRef.current?.focus();
      }
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [job]);

  function generate() {
    if (!checkedFiles.length || job) return;
    setError(null); setStatus('');
    setJob({ id: ++requestId.current, files: checkedFiles.map(file => ({ ...file })), settings: { ...settings }, branch });
  }
  function editMessage(value) { cancel(); setMessage(value); }
  function changeSettings(value) { cancel(); saveSettings(value); }
  return { message, messageRef, editMessage, settings, changeSettings, storageError, job, generate, cancel,
    status, error, checkedFiles, canGenerate: checkedFiles.length > 0 && !job,
    canCommit: checkedFiles.length > 0 && !job && Boolean(message.trim()) };
}
