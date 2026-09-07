// Recording fixtures: applying feedback edits the task; Execute verifies it.
export const VET_BOOKING_COMMENT = 'Keep previously confirmed appointments. Apply the restriction only to new bookings.';
export const VET_BOOKING_AC = 'Bookings outside the vet\'s working hours are rejected.';
export const VET_BOOKING_RESOLVED_AC = 'New bookings outside the vet\'s working hours are rejected. Previously confirmed appointments remain unchanged.';
export const VET_AFFECTED_PLAN_INDICES = [4, 5];
export const VET_AFFECTED_AC_INDEX = 1;

export const VET_INITIAL_PLAN = [
  'Add working hours by day of week in @VetSchedule.java',
  'Find schedules by vet and day of week in @VetScheduleRepository.java',
  'Add the `vet_schedules` table and constraints in @schema.sql',
  'Seed working hours for the six demo vets in @data.sql',
  'Validate booking times in @VisitController.processNewVisitForm()',
  'Test booking validation and schedule boundaries in @VisitControllerTests.java',
];

const VET_REVISED_PLAN = {
  4: 'Apply working-hours validation only to new bookings in @VisitController.processNewVisitForm()',
  5: 'Test off-hours rejection and preservation of confirmed appointments in @VisitControllerTests.java',
};

export function isVetBookingPolicyResolved(code = '') {
  return code.replace(/\*\*/g, '').includes(VET_BOOKING_RESOLVED_AC);
}

export function reconcileVetBookingComment(code, note, rawLineIndex) {
  const lines = code.split(/\r?\n/);
  const target = lines[rawLineIndex] ?? '';
  // This is a scripted recording flow, not a natural-language interpreter.
  // Any submitted comment on this AC advances the agreed clarification beat.
  if (!/bookings.*working hours/i.test(target) || !note.trim()) return null;
  lines[rawLineIndex] = `- [ ] ${VET_BOOKING_RESOLVED_AC}`;
  for (const index of VET_AFFECTED_PLAN_INDICES) {
    const row = lines.findIndex((line) => line.includes(VET_INITIAL_PLAN[index]) || line.includes(VET_REVISED_PLAN[index]));
    if (row >= 0) lines[row] = `- [ ] ${VET_REVISED_PLAN[index]}`;
  }
  return lines.join('\n');
}

export function invalidateVetBookingResults(plan = null, ac = null) {
  return {
    plan: plan?.map((item, index) => VET_AFFECTED_PLAN_INDICES.includes(index) ? { status: 'pending' } : item) ?? null,
    ac: ac?.map((item, index) => index === VET_AFFECTED_AC_INDEX ? { status: 'pending' } : item) ?? null,
  };
}

export function getVetSchedulesAcStatuses(resolved = false) {
  return [
    { status: 'passed', checks: [
      { status: 'passed', text: '09:00 is accepted; 17:00 is rejected for a 09:00–17:00 window.' },
    ] },
    resolved ? { status: 'passed', checks: [
      { status: 'passed', text: 'Existing confirmed appointment at 18:00 is preserved after the schedule changes.' },
      { status: 'passed', text: 'New booking at 18:00 is rejected. No visit is saved.' },
    ] } : { status: 'failed', checks: [
      { status: 'passed', text: 'New booking at 18:00 is rejected for a 09:00–17:00 schedule.' },
      { status: 'failed', text: 'The criterion does not cover existing appointments after working hours change. Keep them or flag for rescheduling?' },
    ] },
    { status: 'passed', checks: [
      { status: 'passed', text: 'H2 seed data includes a Monday 09:00–17:00 working-hours window for each of the six demo vets.' },
    ] },
    { status: 'passed', checks: [
      { status: 'passed', text: 'The form keeps its vet selector and 09:00–18:00 hourly slots. Working hours are validated server-side on form submission.' },
    ] },
  ];
}
