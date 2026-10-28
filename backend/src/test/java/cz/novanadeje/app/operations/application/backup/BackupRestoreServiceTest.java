package cz.novanadeje.app.operations.application.backup;

import cz.novanadeje.app.operations.application.settings.ApplicationRestarter;
import cz.novanadeje.app.operations.domain.backup.BackupFile;
import cz.novanadeje.app.operations.domain.backup.BackupKey;
import cz.novanadeje.app.operations.domain.backup.BackupNotFound;
import cz.novanadeje.app.operations.domain.backup.BackupRun;
import cz.novanadeje.app.operations.domain.backup.RestorePending;
import cz.novanadeje.app.operations.domain.backup.RestoreRecordRepository;
import cz.novanadeje.app.operations.domain.backup.RestoreSource;
import cz.novanadeje.app.operations.domain.backup.RunOutcome;
import cz.novanadeje.app.shared.application.event.AdminActionPerformed;
import cz.novanadeje.app.support.MutableClock;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.context.ApplicationEventPublisher;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.time.Instant;
import java.time.ZoneId;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class BackupRestoreServiceTest {

    private static final Instant NOW = Instant.parse("2026-10-23T19:30:00Z");
    private static final UUID ADMIN = UUID.fromString("01a18e56-bdb0-775a-bd0a-a60756831369");
    private static final String FILE = "nfnn-2026-10-22_0300.dump.age";
    private static final String REQUEST = "019a1b2c-0000-7000-8000-000000000001";

    private final BackupStore store = mock(BackupStore.class);
    private final RestoreRecordRepository records = mock(RestoreRecordRepository.class);
    private final ApplicationRestarter restarter = mock(ApplicationRestarter.class);
    private final ApplicationEventPublisher events = mock(ApplicationEventPublisher.class);
    private final MutableClock clock = new MutableClock(NOW, ZoneId.of("Europe/Prague"));
    private final BackupRestoreService service = new BackupRestoreService(store, records, restarter, events, clock);

    @Test
    @DisplayName("Given a backup on the server, when an administrator restores it, then a restore request names it and the administrator, it is audited and the backend restarts")
    void should_request_restore_when_restored_given_a_backup() {
        when(store.open(FILE)).thenReturn(Optional.of(new BackupDownload(new BackupFile(FILE, 1590, NOW), Path.of(FILE))));

        RestoreRequest request = service.restoreBackup(ADMIN, FILE);

        assertThat(request.source()).isEqualTo(RestoreSource.BACKUP);
        assertThat(request.fileName()).isEqualTo(FILE);
        assertThat(request.requestedBy()).contains(ADMIN);
        assertThat(request.requestedAt()).isEqualTo(NOW);
        verify(store).requestRestore(request);
        verify(restarter).restartAfterCommit();
        ArgumentCaptor<AdminActionPerformed> audit = ArgumentCaptor.forClass(AdminActionPerformed.class);
        verify(events).publishEvent(audit.capture());
        assertThat(audit.getValue().action()).isEqualTo("RESTORE_BACKUP");
        assertThat(audit.getValue().adminId()).isEqualTo(ADMIN);
        assertThat(audit.getValue().details()).contains("Vyžádána obnova ze zálohy " + FILE + " (požadavek " + request.id() + ")");
    }

    @Test
    @DisplayName("Given an unknown or odd backup name, when an administrator restores it, then it is not found and nothing happens")
    void should_refuse_restore_when_restored_given_an_unknown_backup() {
        when(store.open(any())).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.restoreBackup(ADMIN, FILE)).isInstanceOf(BackupNotFound.class);
        assertThatThrownBy(() -> service.restoreBackup(ADMIN, "../restore/x.dump")).isInstanceOf(BackupNotFound.class);

        verify(store, never()).requestRestore(any());
        verifyNoInteractions(restarter, events);
    }

    @Test
    @DisplayName("Given a restore is already waiting or running, when another is asked for, then it is refused and nothing restarts")
    void should_refuse_restore_when_restored_given_one_pending() {
        when(store.open(FILE)).thenReturn(Optional.of(new BackupDownload(new BackupFile(FILE, 1590, NOW), Path.of(FILE))));
        when(store.restorePending()).thenReturn(true);

        assertThatThrownBy(() -> service.restoreBackup(ADMIN, FILE)).isInstanceOf(RestorePending.class);
        assertThatThrownBy(() -> service.restoreUpload(new ByteArrayInputStream(new byte[1]), Optional.empty())).isInstanceOf(RestorePending.class);

        verify(store, never()).requestRestore(any());
        verify(store, never()).storeUpload(any(), any(), any());
        verifyNoInteractions(restarter, events);
    }

    @Test
    @DisplayName("Given an uploaded dump, when it is restored, then it is stored under the request, the request names it without an administrator and the backend restarts")
    void should_request_restore_when_uploaded_given_a_dump() {
        InputStream content = new ByteArrayInputStream("age-encryption.org/v1".getBytes(StandardCharsets.US_ASCII));
        Optional<BackupKey> key = Optional.of(new BackupKey("AGE-SECRET-KEY-1R45A984EXXAFC85YZSYGY9R6XJTD4E9AKY65ZCRGPDQ89E7ANW8QKT6GWH"));
        when(store.storeUpload(any(), eq(content), eq(key))).thenAnswer(call -> call.getArgument(0) + ".upload");

        RestoreRequest request = service.restoreUpload(content, key);

        assertThat(request.source()).isEqualTo(RestoreSource.UPLOAD);
        assertThat(request.fileName()).isEqualTo(request.id() + ".upload");
        assertThat(request.requestedBy()).isEmpty();
        verify(store).requestRestore(request);
        verify(restarter).restartAfterCommit();
        verifyNoInteractions(events);
    }

    @Test
    @DisplayName("Given the backup container restored a backup an administrator asked for, when the backend starts twice, then the restore is audited once under that administrator")
    void should_audit_once_when_started_given_a_finished_restore() {
        when(store.lastRestore()).thenReturn(Optional.of(restore(RunOutcome.OK, Optional.of(ADMIN), Optional.empty())));
        when(records.recordOnce(REQUEST, NOW)).thenReturn(true, false);

        service.recordFinishedRestore();
        service.recordFinishedRestore();

        ArgumentCaptor<AdminActionPerformed> audit = ArgumentCaptor.forClass(AdminActionPerformed.class);
        verify(events).publishEvent(audit.capture());
        assertThat(audit.getValue().action()).isEqualTo("BACKUP_RESTORED");
        assertThat(audit.getValue().adminId()).isEqualTo(ADMIN);
        assertThat(audit.getValue().details()).isEqualTo("Databáze obnovena ze zálohy " + FILE + " (požadavek " + REQUEST + "), tabulek: 37");
    }

    @Test
    @DisplayName("Given a failed restore an administrator asked for, when the backend starts, then the failure is audited with its error")
    void should_audit_failure_when_started_given_a_failed_restore() {
        when(store.lastRestore()).thenReturn(Optional.of(restore(RunOutcome.FAILED, Optional.of(ADMIN), Optional.of("pg_restore: error: x"))));
        when(records.recordOnce(REQUEST, NOW)).thenReturn(true);

        service.recordFinishedRestore();

        ArgumentCaptor<AdminActionPerformed> audit = ArgumentCaptor.forClass(AdminActionPerformed.class);
        verify(events).publishEvent(audit.capture());
        assertThat(audit.getValue().action()).isEqualTo("BACKUP_RESTORE_FAILED");
        assertThat(audit.getValue().details())
                .isEqualTo("Obnova ze zálohy " + FILE + " (požadavek " + REQUEST + ") selhala: pg_restore: error: x; data zůstala, jak byla");
    }

    @Test
    @DisplayName("Given a restore nobody in the administration asked for (an upload or the restore folder), when the backend starts, then nothing is audited")
    void should_not_audit_when_started_given_no_administrator() {
        when(store.lastRestore()).thenReturn(Optional.of(restore(RunOutcome.OK, Optional.empty(), Optional.empty())));

        service.recordFinishedRestore();

        verifyNoInteractions(records, events);
    }

    private static BackupRun restore(RunOutcome outcome, Optional<UUID> admin, Optional<String> error) {
        return new BackupRun(outcome, NOW.minusSeconds(60), NOW.minusSeconds(30), Optional.of(FILE), Optional.of(1590L),
                outcome == RunOutcome.OK ? Optional.of(37) : Optional.empty(), Optional.of(REQUEST), admin, error);
    }
}
