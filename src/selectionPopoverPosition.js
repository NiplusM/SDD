export function getSelectionFocusRect(selection) {
  if (!selection?.focusNode || selection.isCollapsed) return null;
  const caret = document.createRange();
  caret.setStart(selection.focusNode, selection.focusOffset);
  caret.collapse(true);
  const rect = caret.getClientRects()[0];
  if (rect?.height) return rect;
  const rects = Array.from(selection.getRangeAt(0).getClientRects()).filter((item) => item.height > 0);
  const range = selection.getRangeAt(0);
  const backward = selection.focusNode === range.startContainer && selection.focusOffset === range.startOffset;
  const edge = backward ? rects[0] : rects.at(-1);
  if (!edge) return null;
  const x = backward ? edge.left : edge.right;
  return { left: x, right: x, top: edge.top, bottom: edge.bottom, width: 0, height: edge.height };
}

export function getVisibleCodeRects(editor) {
  if (!editor) return [];
  const root = editor.querySelector('.plan-diff-overlay') ?? editor;
  const viewport = root.getBoundingClientRect();
  return Array.from(root.querySelectorAll('.pce-line, .plan-diff-row-code-text')).flatMap((line) => {
    const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
    const nodes = [];
    let node;
    while ((node = walker.nextNode())) if (node.textContent.trim()) nodes.push(node);
    if (!nodes.length) return [];
    const first = nodes[0];
    const last = nodes.at(-1);
    const range = document.createRange();
    range.setStart(first, first.textContent.length - first.textContent.trimStart().length);
    range.setEnd(last, last.textContent.trimEnd().length);
    const rect = range.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.bottom > viewport.top && rect.top < viewport.bottom
      && rect.right > viewport.left && rect.left < viewport.right ? [rect] : [];
  });
}

export function getSelectionPopoverPosition({ anchor, selection = anchor, width, height, viewportWidth, viewportHeight, codeRects = [] }) {
  const gap = 10;
  const gutter = 8;
  const clamp = (value, min, max) => Math.max(min, Math.min(value, Math.max(min, max)));
  let left = clamp(anchor.right + gap, gutter, viewportWidth - width - gutter);
  // Use the entire selected block for vertical clearance, including a reverse
  // selection whose focus is on its first line.
  const below = Math.max(anchor.bottom, selection.bottom) + gap;
  const above = Math.min(anchor.top, selection.top) - height - gap;
  let placement = below + height <= viewportHeight - gutter || above < gutter ? 'bottom' : 'top';
  let top = clamp(placement === 'bottom' ? below : above, gutter, viewportHeight - height - gutter);
  const intersectsCode = (x, y) => codeRects.some((rect) => (
    x < rect.right + 4 && x + width > rect.left - 4 && y < rect.bottom + 4 && y + height > rect.top - 4
  ));
  if (intersectsCode(left, top)) {
    const xs = [...new Set([left, ...codeRects.map((rect) => rect.right + gap)])]
      .filter((x) => x >= gutter && x + width <= viewportWidth - gutter);
    const ys = [...new Set([below, above, ...codeRects.flatMap((rect) => [rect.bottom + gap, rect.top - height - gap])])]
      .filter((y) => y >= gutter && y + height <= viewportHeight - gutter
        && (y >= selection.bottom + gap || y + height <= selection.top - gap));
    const available = xs.flatMap((x) => ys.map((y) => ({ x, y })))
      .filter(({ x, y }) => !intersectsCode(x, y));
    const nearbyBelow = available.filter(({ y }) => y >= below && y <= below + height + gap);
    // Keep the bar at the selected lines when there is horizontal room. If
    // that space is occupied, a nearby position above is better than moving
    // several paragraphs away from the cursor.
    const candidates = (nearbyBelow.length ? nearbyBelow : available).sort((a, b) => (
      Math.hypot((a.x - left) / 2, (a.y - below) * 2) - Math.hypot((b.x - left) / 2, (b.y - below) * 2)
    ));
    if (candidates.length) {
      left = candidates[0].x;
      top = candidates[0].y;
      placement = top >= selection.bottom ? 'bottom' : 'top';
    }
  }
  return { left, top, placement, arrowX: clamp(anchor.right - left, 16, width - 16) };
}
