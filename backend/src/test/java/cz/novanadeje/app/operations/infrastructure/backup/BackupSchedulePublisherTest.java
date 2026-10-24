package cz.novanadeje.app.operations.infrastructure.backup;

import cz.novanadeje.app.operations.application.backup.BackupScheduleService;
import cz.novanadeje.app.operations.domain.backup.BackupsUnavailable;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class BackupSchedulePublisherTest {

    private final BackupScheduleService schedules = mock(BackupScheduleService.class);
    private final BackupSchedulePublisher publisher = new BackupSchedulePublisher(schedules);

    @Test
    @DisplayName("Given the backend has started, when it is ready, then the planned schedule is handed to the backup container")
    void should_publish_the_plan_when_ready() {
        publisher.publishAtStart();

        verify(schedules).publishPlanned();
    }

    @Test
    @DisplayName("Given the backup folder is not connected or the write fails, when the backend is ready, then the start goes on")
    void should_not_fail_the_start_when_ready_given_the_plan_cannot_be_handed_over() {
        doThrow(new BackupsUnavailable()).when(schedules).publishPlanned();
        assertThatCode(publisher::publishAtStart).doesNotThrowAnyException();

        doThrow(new IllegalStateException("disk")).when(schedules).publishPlanned();
        assertThatCode(publisher::publishAtStart).doesNotThrowAnyException();
    }
}
