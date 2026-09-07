package org.springframework.samples.petclinic.vet;

import java.time.DayOfWeek;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.transaction.annotation.Transactional;

@Transactional(readOnly = true)
public interface VetScheduleRepository extends JpaRepository<VetSchedule, Integer> {
    List<VetSchedule> findByVetIdAndWeekday(int vetId, DayOfWeek weekday);
}
