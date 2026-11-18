export function NoteShortcutHint({ style, placement = 'above', hintRef = null }) {
  return (
    <div ref={hintRef} className="plan-diff-comment-shortcut-hint" role="tooltip" style={style} data-placement={placement}>
      <span className="plan-diff-comment-shortcut-title">Add Notes faster</span>
      <span className="plan-diff-comment-shortcut-copy">
        <span>Press</span>
        <span className="plan-diff-comment-shortcut-keys" aria-label="Option Shift K">
          <kbd>⌥</kbd><kbd>⇧</kbd><kbd>K</kbd>
        </span>
        <span>from the editor</span>
      </span>
    </div>
  );
}
