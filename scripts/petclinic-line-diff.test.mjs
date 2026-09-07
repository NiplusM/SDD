import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import { buildPetClinicDiff } from '../src/demo/petclinic/lineDiff.js';

test('separate edits do not mark the unchanged code between them as changed', () => {
  const diff = buildPetClinicDiff('import A;\nclass Example {\n  old();\n}', 'import B;\nclass Example {\n  newCall();\n}');
  assert.equal(diff.differenceCount, 2);
  assert.equal(diff.rows.find((row) => row.text === 'class Example {').kind, 'context');
  assert.deepEqual(diff.rows.filter((row) => row.kind === 'removed').map((row) => row.text), ['import A;', '  old();']);
  assert.deepEqual(diff.rows.filter((row) => row.kind === 'added').map((row) => row.text), ['import B;', '  newCall();']);
});

test('all displayed diffs reconstruct both exact source files and retain original line numbers', () => {
  const root = new URL('../src/demo/petclinic/', import.meta.url);
  for (const name of fs.readdirSync(new URL('generated/', root))) {
    const baseline = new URL(`baseline/${name}`, root);
    const before = fs.existsSync(baseline) ? fs.readFileSync(baseline, 'utf8').trimEnd() : '';
    const after = fs.readFileSync(new URL(`generated/${name}`, root), 'utf8').trimEnd();
    const { rows } = buildPetClinicDiff(before, after);
    for (const [side, code, excluded] of [['oldNumber', before, 'added'], ['newNumber', after, 'removed']]) {
      const reconstructed = rows.filter((row) => row.kind !== excluded);
      assert.equal(reconstructed.map((row) => row.text).join('\n'), code, name);
      assert.deepEqual(reconstructed.map((row) => row[side]), reconstructed.map((_, index) => index + 1), name);
    }
  }
});
