package cz.novanadeje.app.donations.application.importing;

import cz.novanadeje.app.donations.domain.importing.BankImportState;
import cz.novanadeje.app.donations.domain.importing.BankImportStateRepository;
import cz.novanadeje.app.donations.domain.importing.ImportCoverage;
import cz.novanadeje.app.donations.domain.importing.ImportFailureKind;
import cz.novanadeje.app.donations.domain.importing.ImportPeriod;
import cz.novanadeje.app.support.MutableClock;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.Period;
import java.time.ZoneId;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class BankCheckServiceTest {

    private static final Instant NOW = Instant.parse("2026-10-18T10:00:00Z");
    private static final Duration COOLDOWN = Duration.ofSeconds(30);
    private static final ImportCoverage COVERED = ImportCoverage.of(new ImportPeriod(LocalDate.of(2026, 7, 21), LocalDate.of(2026, 10, 18)));

    private final BankImportStateRepository states = mock(BankImportStateRepository.class);
    private final BankImportRequests imports = mock(BankImportRequests.class);
    private final BankImportProperties properties = new BankImportProperties(Period.ofDays(3), Period.ofDays(89), "", COOLDOWN);
    private final BankCheckService service = new BankCheckService(states, imports, properties, new MutableClock(NOW, ZoneId.of("Europe/Prague")));

    @Test
    @DisplayName("Given the bank was never asked, when a donor asks for a check, then an import is requested and the check reports no bank data yet")
    void should_request_import_when_check_asked_given_no_attempt() {
        when(states.current()).thenReturn(BankImportState.initial(NOW));
        when(imports.inProgress()).thenReturn(true);

        BankCheck check = service.requestCheck();

        verify(imports).requestImport();
        assertThat(check).isEqualTo(new BankCheck(Optional.empty(), true));
    }

    @Test
    @DisplayName("Given the last import succeeded 30 seconds ago, when a donor asks for a check, then an import is requested")
    void should_request_import_when_check_asked_given_attempt_as_old_as_cooldown() {
        when(states.current()).thenReturn(succeededAt(NOW.minus(COOLDOWN)));

        service.requestCheck();

        verify(imports).requestImport();
    }

    @Test
    @DisplayName("Given an attempt 29 seconds ago, when a donor asks for a check, then no import is requested and the last success is reported")
    void should_not_request_import_when_check_asked_given_recent_attempt() {
        BankImportState state = succeededAt(NOW.minusSeconds(600));
        state.failed(ImportFailureKind.TRANSPORT, "timed out", NOW.minusSeconds(29));
        when(states.current()).thenReturn(state);

        BankCheck check = service.requestCheck();

        verify(imports, never()).requestImport();
        assertThat(check).isEqualTo(new BankCheck(Optional.of(NOW.minusSeconds(600)), false));
    }

    @Test
    @DisplayName("Given an import is running, when a donor reads the check, then it reports the last success and that the bank is being checked")
    void should_report_progress_when_check_read_given_import_running() {
        when(states.current()).thenReturn(succeededAt(NOW.minusSeconds(5)));
        when(imports.inProgress()).thenReturn(true);

        assertThat(service.currentCheck()).isEqualTo(new BankCheck(Optional.of(NOW.minusSeconds(5)), true));
        verify(imports, never()).requestImport();
    }

    private static BankImportState succeededAt(Instant at) {
        BankImportState state = BankImportState.initial(at);
        state.succeeded(COVERED, at);
        return state;
    }
}
