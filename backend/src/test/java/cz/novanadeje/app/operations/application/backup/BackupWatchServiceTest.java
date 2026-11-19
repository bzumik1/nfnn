package cz.novanadeje.app.operations.application.backup;

import cz.novanadeje.app.operations.application.alerts.OperationalAlertService;
import cz.novanadeje.app.operations.domain.alerts.MonitoredArea;
import cz.novanadeje.app.operations.domain.backup.BackupAlert;
import cz.novanadeje.app.operations.domain.backup.BackupAlertRepository;
import cz.novanadeje.app.operations.domain.backup.BackupAlertState;
import cz.novanadeje.app.operations.domain.backup.BackupAlertStateRepository;
import cz.novanadeje.app.operations.domain.backup.BackupHealth;
import cz.novanadeje.app.operations.domain.backup.BackupProblem;
import cz.novanadeje.app.support.MutableClock;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.InOrder;
import org.springframework.transaction.support.TransactionOperations;

import java.time.Instant;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class BackupWatchServiceTest {

    private static final Instant NOW = Instant.parse("2026-10-23T05:15:00Z");

    private final BackupAdministrationService backups = mock(BackupAdministrationService.class);
    private final BackupAlertStateRepository states = mock(BackupAlertStateRepository.class);
    private final BackupAlertRepository backupAlerts = mock(BackupAlertRepository.class);
    private final OperationalAlertService alerts = mock(OperationalAlertService.class);
    private final BackupAlertDelivery delivery = mock(BackupAlertDelivery.class);
    private final MutableClock clock = new MutableClock(NOW, ZoneId.of("Europe/Prague"));
    private final BackupWatchService service = new BackupWatchService(backups, states, backupAlerts, alerts, delivery, TransactionOperations.withoutTransaction(),
            clock);

    @Test
    @DisplayName("Given a failed backup not yet reported, when the check runs, then the problem is reported once and remembered and the backup alert is recorded as opened")
    void should_report_when_checked_given_a_new_problem() {
        when(backups.view()).thenReturn(view(Set.of(BackupProblem.BACKUP_FAILED)));
        when(states.current()).thenReturn(BackupAlertState.nothingReported());

        Set<BackupProblem> problems = service.check();

        assertThat(problems).containsExactly(BackupProblem.BACKUP_FAILED);
        verify(states).save(BackupAlertState.reported(Set.of(BackupProblem.BACKUP_FAILED), NOW));
        InOrder order = inOrder(backupAlerts, delivery);
        order.verify(backupAlerts).dropWaiting(NOW);
        order.verify(backupAlerts).add(new BackupAlert.ProblemsDetected(Set.of(BackupProblem.BACKUP_FAILED), NOW), NOW);
        order.verify(delivery).deliverWaiting(new LastBackupRuns(Optional.empty(), Optional.empty()));
        verify(alerts).record(MonitoredArea.BACKUPS, true, NOW);
    }

    @Test
    @DisplayName("Given the same problem already reported, when the check runs again, then only the backup alert is recorded as opened and nothing is reported or saved")
    void should_only_record_open_alert_when_checked_given_the_same_problem_reported() {
        when(backups.view()).thenReturn(view(Set.of(BackupProblem.BACKUP_FAILED)));
        when(states.current()).thenReturn(BackupAlertState.reported(Set.of(BackupProblem.BACKUP_FAILED), NOW.minusSeconds(86_400)));

        service.check();

        verify(alerts).record(MonitoredArea.BACKUPS, true, NOW);
        verifyNoInteractions(backupAlerts);
        verify(states, never()).save(any());
        verify(delivery).deliverWaiting(any());
    }

    @Test
    @DisplayName("Given a reported problem replaced by another, when the check runs, then the new set is reported")
    void should_report_again_when_checked_given_a_different_problem() {
        when(backups.view()).thenReturn(view(Set.of(BackupProblem.BACKUP_FAILED, BackupProblem.TEST_RESTORE_STALE)));
        when(states.current()).thenReturn(BackupAlertState.reported(Set.of(BackupProblem.BACKUP_FAILED), NOW.minusSeconds(86_400)));

        service.check();

        verify(states).save(BackupAlertState.reported(Set.of(BackupProblem.BACKUP_FAILED, BackupProblem.TEST_RESTORE_STALE), NOW));
        InOrder order = inOrder(backupAlerts);
        order.verify(backupAlerts).dropWaiting(NOW);
        order.verify(backupAlerts).add(new BackupAlert.ProblemsDetected(Set.of(BackupProblem.BACKUP_FAILED, BackupProblem.TEST_RESTORE_STALE), NOW), NOW);
        verify(alerts).record(MonitoredArea.BACKUPS, true, NOW);
    }

    @Test
    @DisplayName("Given a reported problem that has ended, when the check runs, then the recovery is queued once after any waiting alert is dropped, the state cleared and the backup alert recorded as resolved")
    void should_queue_recovery_when_checked_given_problems_ended() {
        when(backups.view()).thenReturn(view(Set.of()));
        when(states.current()).thenReturn(BackupAlertState.reported(Set.of(BackupProblem.BACKUP_STALE), NOW.minusSeconds(86_400)));

        Set<BackupProblem> problems = service.check();

        assertThat(problems).isEmpty();
        verify(states).save(BackupAlertState.nothingReported());
        InOrder order = inOrder(backupAlerts, delivery);
        order.verify(backupAlerts).dropWaiting(NOW);
        order.verify(backupAlerts).add(new BackupAlert.Recovered(Set.of(BackupProblem.BACKUP_STALE), NOW), NOW);
        order.verify(delivery).deliverWaiting(any());
        verify(alerts).record(MonitoredArea.BACKUPS, false, NOW);
    }

    @Test
    @DisplayName("Given healthy backups and nothing reported, when the check runs, then only the backup alert is recorded as resolved and nothing is reported or saved")
    void should_only_record_resolved_alert_when_checked_given_healthy_and_nothing_reported() {
        when(backups.view()).thenReturn(view(Set.of()));
        when(states.current()).thenReturn(BackupAlertState.nothingReported());

        service.check();

        verify(alerts).record(MonitoredArea.BACKUPS, false, NOW);
        verifyNoInteractions(backupAlerts);
        verify(states, never()).save(any());
    }

    @Test
    @DisplayName("Given the delivery fails, when the check runs, then the check still answers its problems and the failure does not escape")
    void should_answer_problems_when_checked_given_the_delivery_fails() {
        when(backups.view()).thenReturn(view(Set.of(BackupProblem.BACKUP_FAILED)));
        when(states.current()).thenReturn(BackupAlertState.nothingReported());
        doThrow(new IllegalStateException("broken")).when(delivery).deliverWaiting(any());

        assertThat(service.check()).containsExactly(BackupProblem.BACKUP_FAILED);
    }

    private static BackupAdministrationView view(Set<BackupProblem> problems) {
        return new BackupAdministrationView(true, List.of(), Optional.empty(), Optional.empty(), Optional.empty(), List.of(), 0, false,
                new BackupHealth(problems));
    }
}
