package cz.novanadeje.app.donations.application.importing;

import cz.novanadeje.app.donations.domain.importing.BankImportState;
import cz.novanadeje.app.donations.domain.importing.BankImportStateRepository;
import cz.novanadeje.app.donations.domain.importing.ImportPeriod;
import cz.novanadeje.app.support.MutableClock;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.Period;
import java.time.ZoneOffset;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class ImportStatusServiceTest {

    private static final Instant NOW = Instant.parse("2026-11-05T11:00:00Z");

    private final BankImportStateRepository states = mock(BankImportStateRepository.class);
    private final HistoryImportTracker tracker = new HistoryImportTracker();

    @Test
    @DisplayName("Given a configured history start, when the import state is read, then the default day of older payments is that start")
    void should_default_to_configured_start_when_read_given_history_from() {
        when(states.current()).thenReturn(BankImportState.initial(NOW));

        ImportStatusView view = service("2025-03-01", NOW).currentState();

        assertThat(view.defaultHistoryFrom()).isEqualTo(LocalDate.of(2025, 3, 1));
    }

    @Test
    @DisplayName("Given no configured history start, when the import state is read, then the default day is 1 January of the year")
    void should_default_to_new_year_when_read_given_no_history_from() {
        when(states.current()).thenReturn(BankImportState.initial(NOW));

        assertThat(service("", NOW).currentState().defaultHistoryFrom()).isEqualTo(LocalDate.of(2026, 1, 1));
    }

    @Test
    @DisplayName("Given New Year's night in Prague while UTC is still in the old year, when the import state is read, then the default day is 1 January of Prague's new year")
    void should_default_to_prague_new_year_when_read_given_new_years_night() {
        Instant pragueNewYear = Instant.parse("2026-12-31T23:30:00Z");
        when(states.current()).thenReturn(BankImportState.initial(pragueNewYear));

        assertThat(service("", pragueNewYear).currentState().defaultHistoryFrom()).isEqualTo(LocalDate.of(2027, 1, 1));
    }

    @Test
    @DisplayName("Given a queued history run, when the import state is read, then it carries the run beside the stored state")
    void should_carry_last_run_when_read_given_queued_run() {
        BankImportState state = BankImportState.initial(NOW);
        when(states.current()).thenReturn(state);
        HistoryImportRun run = tracker.queue(new ImportPeriod(LocalDate.of(2026, 1, 1), LocalDate.of(2026, 11, 5)), true, NOW, NOW);

        ImportStatusView view = service("", NOW).currentState();

        assertThat(view.state()).isSameAs(state);
        assertThat(view.historyImport()).contains(run);
    }

    private ImportStatusService service(String historyFrom, Instant now) {
        BankImportProperties properties = new BankImportProperties(Period.ofDays(3), Period.ofDays(89), historyFrom, Duration.ofSeconds(30));
        return new ImportStatusService(states, tracker, properties, new MutableClock(now, ZoneOffset.UTC));
    }
}
