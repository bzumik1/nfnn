package cz.novanadeje.app.operations.infrastructure.persistence;

import cz.novanadeje.app.PersistenceTest;
import cz.novanadeje.app.operations.domain.backup.BackupSchedule;
import cz.novanadeje.app.operations.domain.backup.BackupScheduleRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.time.DayOfWeek;
import java.time.LocalTime;

import static org.assertj.core.api.Assertions.assertThat;

@PersistenceTest
class JpaBackupScheduleRepositoryTest {

    @Autowired
    private BackupScheduleRepository schedules;

    @Test
    @DisplayName("Given no plan saved, when the plan is read, then there is none")
    void should_find_nothing_when_read_given_nothing_saved() {
        assertThat(schedules.find()).isEmpty();
    }

    @Test
    @DisplayName("Given a plan saved and then changed, when it is read, then the latest plan comes back")
    void should_round_trip_when_saved_given_a_changed_plan() {
        schedules.save(new BackupSchedule(LocalTime.of(2, 30), DayOfWeek.SATURDAY, LocalTime.of(5, 15)));
        BackupSchedule changed = new BackupSchedule(LocalTime.of(23, 45), DayOfWeek.MONDAY, LocalTime.of(0, 0));

        schedules.save(changed);

        assertThat(schedules.find()).contains(changed);
    }
}
