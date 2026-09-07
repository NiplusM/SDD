package org.springframework.samples.petclinic.owner;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.temporal.TemporalAdjusters;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.annotation.Transactional;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = "spring.docker.compose.enabled=false")
@AutoConfigureMockMvc
@Transactional
class VisitControllerTests {
    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private EntityManager entityManager;

    private final LocalDate bookingDate = LocalDate.now().with(TemporalAdjusters.next(DayOfWeek.MONDAY));

    @Test
    void initNewVisitForm() throws Exception {
        mockMvc.perform(get("/owners/1/pets/1/visits/new"))
            .andExpect(status().isOk())
            .andExpect(model().attributeExists("owner", "pet", "visit", "vets", "timeSlots"))
            .andExpect(view().name("pets/createOrUpdateVisitForm"));
    }

    @Test
    void processNewVisitFormSuccess() throws Exception {
        book("10:00").andExpect(status().is3xxRedirection())
            .andExpect(redirectedUrl("/owners/1"));
        assertThat(savedVisitsAt("10:00")).isEqualTo(1);
    }

    @Test
    void processNewVisitFormHasErrors() throws Exception {
        mockMvc.perform(post("/owners/1/pets/1/visits/new")
                .param("date", bookingDate.toString()).param("vet", "1").param("time", "10:00"))
            .andExpect(status().isOk())
            .andExpect(model().attributeHasFieldErrors("visit", "description"));
        assertThat(savedVisitsAt("10:00")).isZero();
    }

    @Test
    void rejectsBookingOutsideVetWorkingHours() throws Exception {
        book("18:00").andExpect(status().isOk())
            .andExpect(model().attributeHasFieldErrorCode("visit", "time", "outsideWorkingHours"));
        assertThat(savedVisitsAt("18:00")).isZero();
    }

    @Test
    void rejectsBookingAtScheduleEndBoundary() throws Exception {
        book("17:00").andExpect(status().isOk())
            .andExpect(model().attributeHasFieldErrorCode("visit", "time", "outsideWorkingHours"));
        assertThat(savedVisitsAt("17:00")).isZero();
    }

    @Test
    void acceptsBookingAtScheduleStartBoundary() throws Exception {
        book("09:00").andExpect(status().is3xxRedirection());
        assertThat(savedVisitsAt("09:00")).isEqualTo(1);
    }

    @Test
    void rejectsBookingWhenVetHasNoSchedule() throws Exception {
        entityManager.createQuery("delete from VetSchedule s where s.vet.id = 1").executeUpdate();
        book("10:00").andExpect(status().isOk())
            .andExpect(model().attributeHasFieldErrorCode("visit", "time", "outsideWorkingHours"));
        assertThat(savedVisitsAt("10:00")).isZero();
    }

    @Test
    void preservesConfirmedAppointmentAfterScheduleChange() throws Exception {
        // Confirm an 18:00 appointment under the previous 09:00–19:00 schedule.
        entityManager.createQuery("update VetSchedule s set s.endTime = :end where s.vet.id = 1")
            .setParameter("end", LocalTime.of(19, 0)).executeUpdate();
        book("18:00").andExpect(status().is3xxRedirection());
        assertThat(savedVisitsAt("18:00")).isEqualTo(1);
        Visit confirmed = entityManager.createQuery(
            "select v from Visit v where v.vet.id = 1 and v.date = :date and v.time = :time", Visit.class)
            .setParameter("date", bookingDate).setParameter("time", LocalTime.of(18, 0)).getSingleResult();
        Integer confirmedId = confirmed.getId();

        // Shortening working hours must not cancel or move the confirmed visit.
        entityManager.createQuery("update VetSchedule s set s.endTime = :end where s.vet.id = 1")
            .setParameter("end", LocalTime.of(17, 0)).executeUpdate();
        entityManager.flush();
        entityManager.clear();
        // Saving another visit also exercises PetClinic's owner-to-visit cascade.
        book("10:00").andExpect(status().is3xxRedirection());
        assertThat(savedVisitsAt("18:00")).isEqualTo(1);
        Visit preserved = entityManager.find(Visit.class, confirmedId);
        assertThat(preserved.getDate()).isEqualTo(bookingDate);
        assertThat(preserved.getTime()).isEqualTo(LocalTime.of(18, 0));
        assertThat(preserved.getVet().getId()).isEqualTo(1);
        assertThat(preserved.getDescription()).isEqualTo("Annual check-up");

        book("18:00").andExpect(status().isOk())
            .andExpect(model().attributeHasFieldErrorCode("visit", "time", "outsideWorkingHours"));
        assertThat(savedVisitsAt("18:00")).isEqualTo(1);
    }

    private ResultActions book(String time) throws Exception {
        return mockMvc.perform(post("/owners/1/pets/1/visits/new")
            .param("date", bookingDate.toString())
            .param("vet", "1")
            .param("time", time)
            .param("description", "Annual check-up"));
    }

    private long savedVisitsAt(String time) {
        entityManager.flush();
        entityManager.clear();
        return entityManager.createQuery(
            "select count(v) from Visit v where v.vet.id = 1 and v.date = :date and v.time = :time", Long.class)
            .setParameter("date", bookingDate).setParameter("time", LocalTime.parse(time)).getSingleResult();
    }
}
