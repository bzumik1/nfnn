package cz.novanadeje.app.operations.application.backup;

import cz.novanadeje.app.operations.application.event.BackupProblemsDetected;
import cz.novanadeje.app.operations.application.event.BackupRecovered;
import cz.novanadeje.app.operations.domain.backup.BackupAlertState;
import cz.novanadeje.app.operations.domain.backup.BackupAlertStateRepository;
import cz.novanadeje.app.operations.domain.backup.BackupHealth;
import cz.novanadeje.app.operations.domain.backup.BackupProblem;
import cz.novanadeje.app.support.MutableClock;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.context.ApplicationEventPublisher;

import java.time.Instant;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class BackupWatchServiceTest {

    private static final Instant NOW = Instant.parse("2026-10-23T05:15:00Z");

    private final BackupAdministrationService backups = mock(BackupAdministrationService.class);
    private final BackupAlertStateRepository states = mock(BackupAlertStateRepository.class);
    private final ApplicationEventPublisher events = mock(ApplicationEventPublisher.class);
    private final MutableClock clock = new MutableClock(NOW, ZoneId.of("Europe/Prague"));
    private final BackupWatchService service = new BackupWatchService(backups, states, events, clock);

    @Test
    @DisplayName("Given a failed backup not yet reported, when the check runs, then the problem is reported once and remembered")
    void should_report_when_checked_given_a_new_problem() {
        when(backups.view()).thenReturn(view(Set.of(BackupProblem.BACKUP_FAILED)));
        when(states.current()).thenReturn(BackupAlertState.nothingReported());

        Set<BackupProblem> problems = service.check();

        assertThat(problems).containsExactly(BackupProblem.BACKUP_FAILED);
        verify(states).save(BackupAlertState.reported(Set.of(BackupProblem.BACKUP_FAILED), NOW));
        ArgumentCaptor<Object> published = ArgumentCaptor.forClass(Object.class);
        verify(events).publishEvent(published.capture());
        assertThat(published.getValue()).isInstanceOfSatisfying(BackupProblemsDetected.class, event -> {
            assertThat(event.problems()).containsExactly(BackupProblem.BACKUP_FAILED);
            assertThat(event.detectedAt()).isEqualTo(NOW);
        });
    }

    @Test
    @DisplayName("Given the same problem already reported, when the check runs again, then nothing is published or saved")
    void should_stay_quiet_when_checked_given_the_same_problem_reported() {
        when(backups.view()).thenReturn(view(Set.of(BackupProblem.BACKUP_FAILED)));
        when(states.current()).thenReturn(BackupAlertState.reported(Set.of(BackupProblem.BACKUP_FAILED), NOW.minusSeconds(86_400)));

        service.check();

        verify(events, never()).publishEvent(any());
        verify(states, never()).save(any());
    }

    @Test
    @DisplayName("Given a reported problem replaced by another, when the check runs, then the new set is reported")
    void should_report_again_when_checked_given_a_different_problem() {
        when(backups.view()).thenReturn(view(Set.of(BackupProblem.BACKUP_FAILED, BackupProblem.TEST_RESTORE_STALE)));
        when(states.current()).thenReturn(BackupAlertState.reported(Set.of(BackupProblem.BACKUP_FAILED), NOW.minusSeconds(86_400)));

        service.check();

        verify(states).save(BackupAlertState.reported(Set.of(BackupProblem.BACKUP_FAILED, BackupProblem.TEST_RESTORE_STALE), NOW));
        verify(events).publishEvent(any(BackupProblemsDetected.class));
    }

    @Test
    @DisplayName("Given a reported problem that has ended, when the check runs, then the recovery is published once and the state cleared")
    void should_report_recovery_when_checked_given_problems_ended() {
        when(backups.view()).thenReturn(view(Set.of()));
        when(states.current()).thenReturn(BackupAlertState.reported(Set.of(BackupProblem.BACKUP_STALE), NOW.minusSeconds(86_400)));

        Set<BackupProblem> problems = service.check();

        assertThat(problems).isEmpty();
        verify(states).save(BackupAlertState.nothingReported());
        ArgumentCaptor<Object> published = ArgumentCaptor.forClass(Object.class);
        verify(events).publishEvent(published.capture());
        assertThat(published.getValue()).isInstanceOfSatisfying(BackupRecovered.class,
                event -> assertThat(event.resolvedProblems()).containsExactly(BackupProblem.BACKUP_STALE));
    }

    @Test
    @DisplayName("Given healthy backups and nothing reported, when the check runs, then nothing happens")
    void should_do_nothing_when_checked_given_healthy_and_nothing_reported() {
        when(backups.view()).thenReturn(view(Set.of()));
        when(states.current()).thenReturn(BackupAlertState.nothingReported());

        service.check();

        verify(events, never()).publishEvent(any());
        verify(states, never()).save(any());
    }

    private static BackupAdministrationView view(Set<BackupProblem> problems) {
        return new BackupAdministrationView(true, List.of(), Optional.empty(), Optional.empty(), Optional.empty(), List.of(), 0, false,
                new BackupHealth(problems));
    }
}
