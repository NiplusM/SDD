import test from 'node:test';
import assert from 'node:assert/strict';
import {
  VET_INITIAL_PLAN, VET_BOOKING_AC, VET_BOOKING_COMMENT,
  VET_BOOKING_RESOLVED_AC, reconcileVetBookingComment,
  invalidateVetBookingResults, getVetSchedulesAcStatuses,
} from '../src/vetSchedulesScenario.js';

const rows = ['## Plan', ...VET_INITIAL_PLAN.map(text => `- [x] ${text}`), '## Acceptance Criteria', `- [ ] ${VET_BOOKING_AC}`];
const source = rows.join('\n');
const criterionIndex = rows.length - 1;

test('any nonempty comment on the policy AC advances the scripted revision', () => {
  for (const reply of [VET_BOOKING_COMMENT, 'Test', 'Please clarify this.', 'Перепиши критерий', 'Do not keep them.', 'Keep them.', 'Leave existing appointments unchanged.',
    'Only validate new appointments.', 'Do not reschedule existing bookings.',
    'Сохраняем старые записи. Ограничение только для новых.']) {
    const result = reconcileVetBookingComment(source, reply, criterionIndex);
    assert.ok(result, reply);
    const updated = result.split('\n');
    assert.equal(updated[criterionIndex], `- [ ] ${VET_BOOKING_RESOLVED_AC}`, reply);
    assert.deepEqual(updated.slice(0, 5), rows.slice(0, 5), reply);
    assert.match(updated[5], /^- \[ \] Apply working-hours validation only to new bookings/);
    assert.match(updated[6], /^- \[ \] Test off-hours rejection and preservation/);
    assert.equal(reconcileVetBookingComment(result, reply, criterionIndex), result);
  }
});

test('empty comments and comments on other rows do not advance the policy beat', () => {
  for (const reply of ['', '   ']) {
    assert.equal(reconcileVetBookingComment(source, reply, criterionIndex), null);
  }
  assert.equal(reconcileVetBookingComment(source, 'Keep them.', 1), null);
});

test('feedback clears stale evidence and preserves unaffected verification', () => {
  const plan = VET_INITIAL_PLAN.map(() => ({ status: 'passed' }));
  const ac = getVetSchedulesAcStatuses(false);
  const next = invalidateVetBookingResults(plan, ac);
  assert.deepEqual(next.plan.map(row => row.status), ['passed', 'passed', 'passed', 'passed', 'pending', 'pending']);
  assert.deepEqual(next.ac.map(row => row.status), ['passed', 'pending', 'passed', 'passed']);
  assert.deepEqual(next.ac[1], { status: 'pending' });
  for (const index of [0, 2, 3]) assert.equal(next.ac[index], ac[index]);
  assert.equal(ac[1].status, 'failed');
});
