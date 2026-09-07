// Keep unchanged lines between separate edits as context in the recording diff.
export function buildPetClinicDiff(before = '', after = '', prefix = 'petclinic') {
  const oldLines = before ? before.split(/\r?\n/) : [];
  const newLines = after ? after.split(/\r?\n/) : [];
  const lcs = Array.from({ length: oldLines.length + 1 }, () => new Uint32Array(newLines.length + 1));
  for (let i = oldLines.length - 1; i >= 0; i--) {
    for (let j = newLines.length - 1; j >= 0; j--) {
      lcs[i][j] = oldLines[i] === newLines[j]
        ? 1 + lcs[i + 1][j + 1]
        : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const rows = [];
  let i = 0;
  let j = 0;
  while (i < oldLines.length || j < newLines.length) {
    const kind = i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]
      ? 'context'
      : j < newLines.length && (i === oldLines.length || lcs[i][j + 1] > lcs[i + 1][j])
        ? 'added' : 'removed';
    const text = kind === 'added' ? newLines[j] : oldLines[i];
    rows.push({
      id: `${prefix}-${kind}-${i}-${j}`,
      kind, text,
      oldNumber: kind === 'added' ? null : i + 1,
      newNumber: kind === 'removed' ? null : j + 1,
      fragments: [{ text: text || ' ', tone: kind === 'context' ? 'plain' : kind }],
    });
    if (kind !== 'added') i++;
    if (kind !== 'removed') j++;
  }
  const changed = rows.filter((row) => row.kind !== 'context');
  const focus = changed.find((row) => row.kind === 'added' && row.text.includes('boolean withinWorkingHours'))
    ?? changed.find((row) => row.kind === 'added') ?? rows[0];
  return {
    rows,
    focusRowId: focus?.id ?? null,
    differenceCount: rows.filter((row, index) => row.kind !== 'context' && (!index || rows[index - 1].kind === 'context')).length,
  };
}
