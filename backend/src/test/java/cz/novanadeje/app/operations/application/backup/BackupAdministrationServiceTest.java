package cz.novanadeje.app.operations.application.backup;

import cz.novanadeje.app.operations.domain.backup.BackupFile;
import cz.novanadeje.app.operations.domain.backup.BackupLimits;
import cz.novanadeje.app.operations.domain.backup.BackupNotFound;
import cz.novanadeje.app.operations.domain.backup.BackupProblem;
import cz.novanadeje.app.operations.domain.backup.BackupRequestKind;
import cz.novanadeje.app.operations.domain.backup.BackupRun;
import cz.novanadeje.app.operations.domain.backup.RunOutcome;
import cz.novanadeje.app.shared.application.event.AdminActionPerformed;
import cz.novanadeje.app.support.MutableClock;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.context.ApplicationEventPublisher;

import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class BackupAdministrationServiceTest {

    private static final Instant NOW = Instant.parse("2026-10-23T05:15:00Z");
    private static final UUID ADMIN = UUID.fromString("01a18e56-bdb0-775a-bd0a-a60756831369");
    private static final String FILE = "nfnn-2026-10-23_0300.dump";

    private final BackupStore store = mock(BackupStore.class);
    private final ApplicationEventPublisher events = mock(ApplicationEventPublisher.class);
    private final MutableClock clock = new MutableClock(NOW, ZoneId.of("Europe/Prague"));
    private final BackupAdministrationService service = new BackupAdministrationService(store,
            new BackupLimits(Duration.ofHours(26), Duration.ofDays(8)), events, clock);

    @Test
    @DisplayName("Given the backup folder is missing, when the view is asked for, then it is unavailable with that one problem")
    void should_report_unavailable_when_viewed_given_no_folder() {
        when(store.isAvailable()).thenReturn(false);

        BackupAdministrationView view = service.view();

        assertThat(view.available()).isFalse();
        assertThat(view.backups()).isEmpty();
        assertThat(view.health().problems()).containsExactly(BackupProblem.BACKUPS_UNAVAILABLE);
    }

    @Test
    @DisplayName("Given backups and a stale last backup, when the view is asked for, then the files, the runs and the problems are combined")
    void should_combine_store_and_health_when_viewed_given_backups() {
        BackupFile file = new BackupFile(FILE, 1590, NOW.minus(Duration.ofDays(2)));
        BackupRun stale = run(RunOutcome.OK, NOW.minus(Duration.ofDays(2)));
        when(store.isAvailable()).thenReturn(true);
        when(store.backupsNewestFirst()).thenReturn(List.of(file));
        when(store.lastBackup()).thenReturn(Optional.of(stale));
        when(store.lastTestRestore()).thenReturn(Optional.of(run(RunOutcome.OK, NOW.minus(Duration.ofDays(1)))));
        when(store.lastRestore()).thenReturn(Optional.empty());
        when(store.restoreFilesNewestFirst()).thenReturn(List.of());
        when(store.pendingRequests()).thenReturn(1);

        BackupAdministrationView view = service.view();

        assertThat(view.available()).isTrue();
        assertThat(view.backups()).containsExactly(file);
        assertThat(view.lastBackup()).contains(stale);
        assertThat(view.pendingRequests()).isEqualTo(1);
        assertThat(view.health().problems()).containsExactly(BackupProblem.BACKUP_STALE);
    }

    @Test
    @DisplayName("Given an administrator, when a backup is requested, then a request file is written and the request is audited")
    void should_write_request_and_audit_when_requested_given_an_administrator() {
        BackupRequest request = service.request(ADMIN, BackupRequestKind.BACKUP);

        assertThat(request.kind()).isEqualTo(BackupRequestKind.BACKUP);
        assertThat(request.requestedAt()).isEqualTo(NOW);
        verify(store).request(BackupRequestKind.BACKUP, request.id());
        AdminActionPerformed action = publishedAction();
        assertThat(action.adminId()).isEqualTo(ADMIN);
        assertThat(action.action()).isEqualTo("REQUEST_BACKUP");
        assertThat(action.subjectId()).isEmpty();
        assertThat(action.details()).contains(request.id());
    }

    @Test
    @DisplayName("Given an administrator, when a test restore is requested, then the request is audited as such")
    void should_audit_test_restore_when_requested_given_an_administrator() {
        BackupRequest request = service.request(ADMIN, BackupRequestKind.TEST_RESTORE);

        verify(store).request(BackupRequestKind.TEST_RESTORE, request.id());
        assertThat(publishedAction().action()).isEqualTo("REQUEST_TEST_RESTORE");
    }

    @Test
    @DisplayName("Given a backup in the folder, when it is downloaded, then the file comes back and the download is audited with its name")
    void should_open_and_audit_when_downloaded_given_the_backup_exists() {
        BackupDownload download = new BackupDownload(new BackupFile(FILE, 1590, NOW), Path.of("/backups", FILE));
        when(store.open(FILE)).thenReturn(Optional.of(download));

        assertThat(service.download(ADMIN, FILE)).isEqualTo(download);

        AdminActionPerformed action = publishedAction();
        assertThat(action.action()).isEqualTo("DOWNLOAD_BACKUP");
        assertThat(action.details()).contains(FILE).contains("1590");
    }

    @Test
    @DisplayName("Given a path that is not a backup name, when it is downloaded, then the backup is not found and the store is not asked")
    void should_refuse_when_downloaded_given_a_traversal_name() {
        assertThatThrownBy(() -> service.download(ADMIN, "../env/backend.env")).isInstanceOf(BackupNotFound.class);

        verify(store, never()).open(any());
        verify(events, never()).publishEvent(any(AdminActionPerformed.class));
    }

    @Test
    @DisplayName("Given a well-formed name of a backup that does not exist, when it is downloaded, then the backup is not found")
    void should_refuse_when_downloaded_given_an_unknown_backup() {
        when(store.open(eq(FILE))).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.download(ADMIN, FILE)).isInstanceOf(BackupNotFound.class);
    }

    private AdminActionPerformed publishedAction() {
        ArgumentCaptor<Object> published = ArgumentCaptor.forClass(Object.class);
        verify(events).publishEvent(published.capture());
        return (AdminActionPerformed) published.getValue();
    }

    private static BackupRun run(RunOutcome outcome, Instant finishedAt) {
        return new BackupRun(outcome, finishedAt.minusSeconds(2), finishedAt, Optional.of(FILE), Optional.of(1590L), Optional.empty(), Optional.empty(),
                Optional.empty());
    }
}
