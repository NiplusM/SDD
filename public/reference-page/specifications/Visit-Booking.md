# Visit Booking

## Goal

Add vet assignment and time slot selection to the visit creation flow.

When booking a visit, users pick a vet and a time slot for the chosen date. The system prevents double-booking for the same vet, date, and time.

## Plan

- [ ] Schema changes - add `vet_id` (FK) and `visit_time` (TIME) to the visits table.
- [ ] Visit entity - add `@ManyToOne Vet vet` and `LocalTime time` with `@NotNull`.
- [ ] VisitRepository - add `existsByVetIdAndDateAndTime` for the double-booking check.
- [ ] VisitController - inject `VetRepository`, add `@ModelAttribute("vets")` with `findAll()`.
- [ ] Form template - add `<select>` for vet and `<select>` for time slot.
- [ ] Owner details - add Vet and Time columns to the visit history table.
- [ ] Tests - vet list in model, successful booking, double-booking rejected.

## Acceptance Criteria

- [ ] Visit form shows a dropdown filtered to available vets for selected date/time.
- [ ] Visit form includes a time slot picker, for example hourly slots from 09:00 to 16:00.
- [ ] A vet cannot be booked for the same date and time twice, enforced by server-side validation and a database unique constraint.
- [ ] Vet and time are persisted with the visit.
- [ ] Existing visit display on the owner details page shows the assigned vet and time.
- [ ] H2, MySQL, and PostgreSQL schemas and seed data are updated.

## Implementation Notes

- Current `Visit` entity has only `date` (`LocalDate`) and `description` (`String`). There is no relationship to `Vet`.
- Visits are persisted via cascade from `Owner` to `Pet` to `Visit`. No `VisitRepository` exists yet.
- `VetRepository.findAll()` is `@Cacheable("vets")` and returns `Collection<Vet>`.
- The project uses `Formatter<T>` for form selects. Use `PetTypeFormatter` as the reference pattern.

## Decisions

No tradeoffs selected yet.

## Other

- Dynamic availability through AJAX is out of scope for the initial prompt.
- Vet specialty matching is out of scope.
