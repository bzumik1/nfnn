package cz.novanadeje.app.operations.domain.backup;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.DayOfWeek;
import java.time.LocalTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class BackupScheduleTest {

    @Test
    @DisplayName("Given no plan was chosen, when the default is read, then the backup runs at 03:00 and the test restore on Sunday at 04:00")
    void should_back_up_at_three_and_test_on_sunday_at_four_when_the_default_is_read() {
        assertThat(BackupSchedule.DEFAULT).isEqualTo(new BackupSchedule(LocalTime.of(3, 0), DayOfWeek.SUNDAY, LocalTime.of(4, 0)));
    }

    @Test
    @DisplayName("Given a time with seconds, when a plan is made, then it is refused because the backup container plans whole minutes")
    void should_refuse_when_made_given_a_time_with_seconds() {
        assertThatThrownBy(() -> new BackupSchedule(LocalTime.of(3, 0, 30), DayOfWeek.SUNDAY, LocalTime.of(4, 0)))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new BackupSchedule(LocalTime.of(3, 0), DayOfWeek.SUNDAY, LocalTime.of(4, 0, 0, 1)))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("Given a missing part, when a plan is made, then it is refused")
    void should_refuse_when_made_given_a_missing_part() {
        assertThatThrownBy(() -> new BackupSchedule(null, DayOfWeek.SUNDAY, LocalTime.of(4, 0))).isInstanceOf(NullPointerException.class);
        assertThatThrownBy(() -> new BackupSchedule(LocalTime.of(3, 0), null, LocalTime.of(4, 0))).isInstanceOf(NullPointerException.class);
        assertThatThrownBy(() -> new BackupSchedule(LocalTime.of(3, 0), DayOfWeek.SUNDAY, null)).isInstanceOf(NullPointerException.class);
    }
}
