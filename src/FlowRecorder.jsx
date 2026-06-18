import { useCallback, useEffect, useRef, useState } from 'react';

const HTML2CANVAS_CDN = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';

function loadHtml2Canvas() {
  if (window.html2canvas) return Promise.resolve(window.html2canvas);
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = HTML2CANVAS_CDN;
    s.async = true;
    s.onload = () => resolve(window.html2canvas);
    s.onerror = (e) => reject(e);
    document.head.appendChild(s);
  });
}

function describeClickTarget(el) {
  if (!el) return null;
  const interactive = el.closest(
    'button, a, [role="button"], [role="menuitem"], [data-demo-id], input, select, textarea, ' +
    '.ws-disclosure-item, .ws-project-cell, .ws-action-tile, [class*="popup"], [class*="menu-item"]'
  );
  if (!interactive) return null;
  const text = (interactive.innerText || interactive.value || interactive.getAttribute('aria-label') || '').trim().slice(0, 80);
  const demoId = interactive.dataset?.demoId || null;
  const id = interactive.id || '';
  const classes = (interactive.className?.toString?.() || '').trim().split(/\s+/).slice(0, 3).join('.');
  const tag = interactive.tagName.toLowerCase();
  const rect = interactive.getBoundingClientRect();
  return {
    selector: `${tag}${id ? `#${id}` : ''}${classes ? `.${classes}` : ''}`,
    demoId,
    text,
    rect: {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      w: Math.round(rect.width),
      h: Math.round(rect.height),
    },
  };
}

function downloadBlob(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function renderMarkdown(payload) {
  const lines = [];
  lines.push(`# Flow: ${payload.session}`);
  lines.push('');
  lines.push(`- Started: \`${payload.startedAt}\``);
  lines.push(`- Finished: \`${payload.finishedAt}\``);
  lines.push(`- Steps: **${payload.steps.length}**`);
  lines.push(`- User-Agent: \`${payload.userAgent}\``);
  lines.push('');
  lines.push('---');
  lines.push('');

  for (const s of payload.steps) {
    lines.push(`## Step ${s.n} — ${s.action} · t=${s.t}ms`);
    lines.push('');
    lines.push(`- URL: \`${s.url}\``);
    lines.push(`- Viewport: ${s.viewport.w}×${s.viewport.h}`);
    if (s.click) {
      lines.push(`- Click target:`);
      lines.push(`  - selector: \`${s.click.selector}\``);
      if (s.click.demoId) lines.push(`  - demoId: \`${s.click.demoId}\``);
      if (s.click.text) lines.push(`  - text: "${s.click.text.replace(/"/g, '\\"')}"`);
      lines.push(`  - rect: x=${s.click.rect.x}, y=${s.click.rect.y}, w=${s.click.rect.w}, h=${s.click.rect.h}`);
    }
    if (s.floating) {
      lines.push(`- Floating element:`);
      if (s.floating.role) lines.push(`  - role: \`${s.floating.role}\``);
      if (s.floating.className) lines.push(`  - class: \`${s.floating.className}\``);
      if (s.floating.text) lines.push(`  - text: "${s.floating.text.replace(/"/g, '\\"')}"`);
    }
    lines.push('');
    lines.push(`![Step ${s.n}](${s.screenshot})`);
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  return lines.join('\n');
}

export function FlowRecorder() {
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [session, setSession] = useState('');
  const [stepsCount, setStepsCount] = useState(0);
  const stepsRef = useRef([]);
  const startRef = useRef(0);
  const recordingRef = useRef(false);
  const pendingRef = useRef(0);
  const snapQueueRef = useRef(Promise.resolve());

  useEffect(() => { recordingRef.current = recording; }, [recording]);

  const snap = useCallback((action, meta = {}) => {
    if (!recordingRef.current) return Promise.resolve();

    pendingRef.current += 1;
    setBusy(true);
    const t = Date.now() - startRef.current;
    const url = window.location.pathname + window.location.search + window.location.hash;
    const viewport = { w: window.innerWidth, h: window.innerHeight };
    const domSnapshot = document.body.outerHTML;
    const placeholder = {
      n: stepsRef.current.length + 1,
      t,
      action,
      url,
      viewport,
      width: 0,
      height: 0,
      screenshot: '',
      domSnapshot,
      ...meta,
    };
    stepsRef.current = [...stepsRef.current, placeholder];
    setStepsCount(stepsRef.current.length);
    const placeholderId = placeholder.n;

    const promise = (async () => {
      try {
        const h2c = await loadHtml2Canvas();
        const canvas = await h2c(document.body, {
          useCORS: true,
          allowTaint: true,
          scale: 1,
          backgroundColor: null,
          logging: false,
          ignoreElements: (el) => el.hasAttribute?.('data-flow-recorder'),
        });
        const dataUrl = canvas.toDataURL('image/png');
        stepsRef.current = stepsRef.current.map((s) =>
          s.n === placeholderId
            ? { ...s, screenshot: dataUrl, width: canvas.width, height: canvas.height }
            : s
        );
      } catch (e) {
        console.error('[flow] snap failed', e);
      } finally {
        pendingRef.current = Math.max(0, pendingRef.current - 1);
        if (pendingRef.current === 0) setBusy(false);
      }
    })();
    snapQueueRef.current = snapQueueRef.current.then(() => promise).catch(() => {});
    return promise;
  }, []);

  const handleStart = useCallback(() => {
    const name = window.prompt('Имя сессии (используется в имени файла и в Figma):', 'flow') || 'flow';
    setSession(name);
    stepsRef.current = [];
    setStepsCount(0);
    startRef.current = Date.now();
    setRecording(true);
    setTimeout(() => snap('initial'), 200);
  }, [snap]);

  const handleStop = useCallback(async () => {
    setBusy(true);
    const drainStart = Date.now();
    while (pendingRef.current > 0 && Date.now() - drainStart < 8000) {
      await new Promise((r) => setTimeout(r, 100));
    }
    try { await snapQueueRef.current; } catch {}
    setRecording(false);
    const payload = {
      session,
      startedAt: new Date(startRef.current).toISOString(),
      finishedAt: new Date().toISOString(),
      userAgent: navigator.userAgent,
      steps: stepsRef.current,
    };
    const stamp = Date.now();
    downloadBlob(`flow-${session}-${stamp}.json`, JSON.stringify(payload, null, 2), 'application/json');
    downloadBlob(`flow-${session}-${stamp}.md`, renderMarkdown(payload), 'text/markdown');
    setBusy(false);
  }, [session]);

  const lastClickRef = useRef(null);

  const manualSnap = useCallback(() => {
    const click = lastClickRef.current;
    const stale = click && Date.now() - click.at > 5000;
    const label = !click || stale
      ? 'Manual snap'
      : `Snap after "${click.target?.text || click.target?.demoId || click.target?.selector || 'click'}"`;
    snap(label, click && !stale ? { click: click.target } : {});
    lastClickRef.current = null;
  }, [snap]);

  useEffect(() => {
    if (!recording) return;

    let ctrlAlone = false;

    function onClick(e) {
      if (e.target.closest?.('[data-flow-recorder]')) return;
      const target = describeClickTarget(e.target);
      lastClickRef.current = { at: Date.now(), target };
    }

    function onKeydown(e) {
      if (e.key === 'Control') {
        ctrlAlone = true;
        return;
      }
      ctrlAlone = false;
      if (e.altKey && e.shiftKey && (e.key === 'X' || e.key === 'x')) {
        e.preventDefault();
        handleStop();
      }
    }

    function onKeyup(e) {
      if (e.key === 'Control' && ctrlAlone) {
        ctrlAlone = false;
        manualSnap();
      }
    }

    document.addEventListener('click', onClick, true);
    window.addEventListener('keydown', onKeydown);
    window.addEventListener('keyup', onKeyup);
    return () => {
      document.removeEventListener('click', onClick, true);
      window.removeEventListener('keydown', onKeydown);
      window.removeEventListener('keyup', onKeyup);
    };
  }, [recording, manualSnap, handleStop]);

  return (
    <div data-flow-recorder style={styles.root}>
      {!recording ? (
        <button style={styles.startBtn} onClick={handleStart}>
          <span style={{ ...styles.dot, background: '#7CC76C' }} />
          Record flow
        </button>
      ) : (
        <>
          <div style={styles.indicator}>
            <span style={{ ...styles.dot, background: '#EF4444', animation: 'flowpulse 1s infinite' }} />
            <span style={styles.session}>{session}</span>
            <span style={styles.count}>{stepsCount} {busy ? '⏳' : ''}</span>
          </div>
          <button
            style={styles.snapBtn}
            onClick={manualSnap}
            title="Control"
          >
            📸 Snap (⌃)
          </button>
          <button
            style={styles.stopBtn}
            onClick={handleStop}
            title="Alt+Shift+X"
          >
            ■ Stop
          </button>
        </>
      )}
      <style>{`@keyframes flowpulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.3 } }`}</style>
    </div>
  );
}

const styles = {
  root: {
    position: 'fixed',
    bottom: 16,
    right: 16,
    zIndex: 2147483647,
    display: 'flex',
    gap: 6,
    alignItems: 'center',
    background: '#1B1C1F',
    color: '#E3E5E9',
    padding: '6px 8px',
    borderRadius: 10,
    boxShadow: '0 6px 24px rgba(0,0,0,0.45)',
    border: '1px solid #2D2F33',
    font: '12px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    pointerEvents: 'auto',
  },
  startBtn: {
    display: 'flex', alignItems: 'center', gap: 8,
    background: '#2D2F33', color: '#E3E5E9', border: '1px solid #3D4045',
    padding: '6px 12px', borderRadius: 8, cursor: 'pointer', font: 'inherit',
  },
  indicator: {
    display: 'flex', alignItems: 'center', gap: 8, padding: '0 8px',
  },
  session: { fontWeight: 500, color: '#E3E5E9', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  count: { color: '#A0A3A8', fontVariantNumeric: 'tabular-nums' },
  snapBtn: {
    background: '#3574F0', color: '#fff', border: 'none',
    padding: '6px 12px', borderRadius: 8, cursor: 'pointer', font: 'inherit', fontWeight: 500,
  },
  stopBtn: {
    background: '#D32E2E', color: '#fff', border: 'none',
    padding: '6px 12px', borderRadius: 8, cursor: 'pointer', font: 'inherit', fontWeight: 500,
  },
  dot: { width: 8, height: 8, borderRadius: '50%', display: 'inline-block' },
};
