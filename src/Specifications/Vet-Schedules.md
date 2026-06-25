# Vet Schedules

## Goal

Define the parallel Vet Schedules track that enables real availability checks for visit booking without blocking the initial visit-booking rollout.

## Plan

- [ ] Add `VetSchedule` entity under the `vet` package.
- [ ] Add repository queries by vet and date.
- [ ] Validate requested `visit_time` against schedule windows.
- [ ] Seed sample schedules in H2 `data.sql`.
- [ ] Add tests for off-hours booking rejection.

## Acceptance Criteria

- [ ] Vets can have working schedules stored by day of week.
- [ ] Booking validation can reject slots outside a vet's working hours.
- [ ] Demo seed data includes at least one schedule per vet.
- [ ] Visit-booking can keep using static hourly slots while this task is in progress.

## Notes

- Parallel task from Beat 5 of the PetClinic demo scenario.
- Does not change the current visit-booking acceptance criteria yet.
