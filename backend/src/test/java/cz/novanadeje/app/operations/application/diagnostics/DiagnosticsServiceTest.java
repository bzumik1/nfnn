package cz.novanadeje.app.operations.application.diagnostics;

import cz.novanadeje.app.operations.application.loggers.LogLevelService;
import cz.novanadeje.app.operations.application.loggers.LogLevelsView;
import cz.novanadeje.app.operations.application.loggers.LoggerView;
import cz.novanadeje.app.operations.domain.diagnostics.DatabaseDiagnostics;
import cz.novanadeje.app.operations.domain.diagnostics.DiskSpace;
import cz.novanadeje.app.operations.domain.diagnostics.JvmDiagnostics;
import cz.novanadeje.app.operations.domain.loggers.LogLevel;
import cz.novanadeje.app.operations.domain.loggers.LogLevelOverride;
import cz.novanadeje.app.operations.domain.loggers.LoggerName;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class DiagnosticsServiceTest {

    private static final Instant NOW = Instant.parse("2026-10-23T10:00:00Z");

    @Mock
    private DiagnosticsSource source;
    @Mock
    private DatabaseDiagnosticsSource database;
    @Mock
    private LogLevelService logLevels;

    @Test
    @DisplayName("Given the JVM, the database, the disks and one raised logger, when the diagnostics are viewed, then they carry all of it with the time and only the active overrides")
    void should_collect_sources_and_active_overrides_when_viewed_given_one_override() {
        JvmDiagnostics jvm = new JvmDiagnostics("25", NOW.minusSeconds(3600), 1, 2, 3, 4, 5, 6, 7, 8, 9, 0.5);
        DatabaseDiagnostics db = new DatabaseDiagnostics(true, 2, 0, 10, 0, 10);
        List<DiskSpace> disks = List.of(new DiskSpace("/logs", true, 1, 2));
        LogLevelOverride override = LogLevelOverride.forMinutes(new LoggerName("cz.novanadeje.app"), LogLevel.DEBUG, Optional.of(LogLevel.INFO), NOW, 5,
                UUID.randomUUID());
        when(source.jvm()).thenReturn(jvm);
        when(database.database()).thenReturn(db);
        when(source.disks()).thenReturn(disks);
        when(logLevels.view()).thenReturn(new LogLevelsView(List.of(
                new LoggerView("ROOT", Optional.of(LogLevel.INFO), LogLevel.INFO, Optional.empty()),
                new LoggerView("cz.novanadeje.app", Optional.of(LogLevel.DEBUG), LogLevel.DEBUG, Optional.of(override)))));
        DiagnosticsService service = new DiagnosticsService(source, database, logLevels, Clock.fixed(NOW, ZoneOffset.UTC));

        DiagnosticsView view = service.view();

        assertThat(view.now()).isEqualTo(NOW);
        assertThat(view.jvm()).isEqualTo(jvm);
        assertThat(view.database()).isEqualTo(db);
        assertThat(view.disks()).isEqualTo(disks);
        assertThat(view.logLevelOverrides()).containsExactly(override);
    }

    @Test
    @DisplayName("Given a thread dump from the JVM, when it is asked for, then it is passed on as it is")
    void should_pass_thread_dump_when_asked_given_source() {
        when(source.threadDump()).thenReturn("\"main\" #1 state=RUNNABLE\n    at a.b.C.d(C.java:1)\n");
        DiagnosticsService service = new DiagnosticsService(source, database, logLevels, Clock.fixed(NOW, ZoneOffset.UTC));

        assertThat(service.threadDump()).startsWith("\"main\" #1 state=RUNNABLE");
    }
}
