package org.springframework.samples.petclinic.vet;

import java.time.DayOfWeek;
import java.time.LocalTime;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotNull;
import org.springframework.samples.petclinic.model.BaseEntity;

@Entity
@Table(name = "vet_schedules")
public class VetSchedule extends BaseEntity {
    @NotNull
    @ManyToOne
    @JoinColumn(name = "vet_id", nullable = false)
    private Vet vet;

    @NotNull
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 9)
    private DayOfWeek weekday;

    @NotNull
    @Column(name = "start_time", nullable = false)
    private LocalTime startTime;

    @NotNull
    @Column(name = "end_time", nullable = false)
    private LocalTime endTime;

    @AssertTrue(message = "End time must be after start time")
    public boolean isValidTimeRange() {
        return startTime == null || endTime == null || endTime.isAfter(startTime);
    }

    public Vet getVet() { return this.vet; }
    public void setVet(Vet vet) { this.vet = vet; }
    public DayOfWeek getWeekday() { return this.weekday; }
    public void setWeekday(DayOfWeek weekday) { this.weekday = weekday; }
    public LocalTime getStartTime() { return this.startTime; }
    public void setStartTime(LocalTime startTime) { this.startTime = startTime; }
    public LocalTime getEndTime() { return this.endTime; }
    public void setEndTime(LocalTime endTime) { this.endTime = endTime; }
}
