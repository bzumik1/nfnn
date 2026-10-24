package cz.novanadeje.app.operations.application.backup;

import cz.novanadeje.app.operations.domain.backup.BackupSchedule;
import cz.novanadeje.app.operations.domain.backup.BackupScheduleRepository;
import cz.novanadeje.app.operations.domain.backup.BackupsUnavailable;
import cz.novanadeje.app.shared.application.event.AdminActionPerformed;
import cz.novanadeje.app.support.MutableClock;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.context.ApplicationEventPublisher;

import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class BackupScheduleServiceTest {

    private static final Instant NOW = Instant.parse("2026-10-24T08:00:00Z");
    private static final UUID ADMIN = UUID.fromString("01a18e56-bdb0-775a-bd0a-a60756831369");
    private static final BackupSchedule EARLIER = new BackupSchedule(LocalTime.of(2, 30), DayOfWeek.SATURDAY, LocalTime.of(5, 15));

    private final BackupScheduleRepository schedules = mock(BackupScheduleRepository.class);
    private final BackupStore store = mock(BackupStore.class);
    private final ApplicationEventPublisher events = mock(ApplicationEventPublisher.class);
    private final BackupScheduleService service = new BackupScheduleService(schedules, store, events, new MutableClock(NOW, ZoneId.of("Europe/Prague")));

    @Test
    @DisplayName("Given no plan was saved, when the plan is viewed, then it is the default with what the backup container reports")
    void should_show_the_default_when_viewed_given_no_saved_plan() {
        when(schedules.find()).thenReturn(Optional.empty());
        when(store.appliedSchedule()).thenReturn(Optional.of(BackupSchedule.DEFAULT));

        BackupScheduleView view = service.view();

        assertThat(view.planned()).isEqualTo(BackupSchedule.DEFAULT);
        assertThat(view.applied()).contains(BackupSchedule.DEFAULT);
    }

    @Test
    @DisplayName("Given the default plan, when an administrator changes it, then it is saved, handed to the backup container and audited in Czech")
    void should_save_publish_and_audit_when_changed_given_the_default() {
        when(schedules.find()).thenReturn(Optional.empty());

        BackupSchedule changed = service.change(ADMIN, EARLIER);

        assertThat(changed).isEqualTo(EARLIER);
        verify(schedules).save(EARLIER);
        verify(store).publishSchedule(EARLIER);
        ArgumentCaptor<AdminActionPerformed> audit = ArgumentCaptor.forClass(AdminActionPerformed.class);
        verify(events).publishEvent(audit.capture());
        assertThat(audit.getValue().adminId()).isEqualTo(ADMIN);
        assertThat(audit.getValue().action()).isEqualTo("CHANGE_BACKUP_SCHEDULE");
        assertThat(audit.getValue().performedAt()).isEqualTo(NOW);
        assertThat(audit.getValue().details()).isEqualTo("Plán záloh změněn z „denní záloha 03:00, zkušební obnova v neděli 04:00“"
                + " na „denní záloha 02:30, zkušební obnova v sobotu 05:15“");
    }

    @Test
    @DisplayName("Given the backup folder is not connected, when the plan is changed, then it is refused and nothing is audited")
    void should_refuse_when_changed_given_no_backup_folder() {
        when(schedules.find()).thenReturn(Optional.empty());
        doThrow(new BackupsUnavailable()).when(store).publishSchedule(EARLIER);

        assertThatThrownBy(() -> service.change(ADMIN, EARLIER)).isInstanceOf(BackupsUnavailable.class);

        verify(events, never()).publishEvent(any());
    }

    @Test
    @DisplayName("Given a saved plan, when the plan is handed over at start, then the backup container gets the saved plan")
    void should_publish_the_saved_plan_when_handed_over_given_a_saved_plan() {
        when(schedules.find()).thenReturn(Optional.of(EARLIER));

        service.publishPlanned();

        verify(store).publishSchedule(EARLIER);
    }
}
