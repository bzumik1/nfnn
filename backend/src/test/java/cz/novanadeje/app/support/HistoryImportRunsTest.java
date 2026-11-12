package cz.novanadeje.app.support;

import cz.novanadeje.app.donations.application.importing.BankImportProperties;
import cz.novanadeje.app.donations.application.importing.HistoryImportTracker;
import cz.novanadeje.app.donations.application.importing.ImportBankPaymentsService;
import cz.novanadeje.app.donations.domain.importing.ImportPeriod;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.Period;
import java.time.ZoneOffset;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

class HistoryImportRunsTest {

    private static final Instant NOW = Instant.parse("2026-11-05T11:00:00Z");

    @Test
    @DisplayName("Given a scenario that left a queued history run and turned the import off, when the runs are forgotten, then the next scenario sees no run, nothing queued and the import on")
    void should_leave_no_run_nothing_queued_and_import_on_when_forgotten_given_previous_scenario_state() {
        HistoryImportTracker tracker = new HistoryImportTracker();
        SynchronousBankImportRequests requests = new SynchronousBankImportRequests(mock(ImportBankPaymentsService.class),
                new BankImportProperties(Period.ofDays(3), Period.ofDays(89), "", Duration.ofSeconds(30)), new MutableClock(NOW, ZoneOffset.UTC));
        requests.requestHistoryImport(tracker.queue(new ImportPeriod(LocalDate.of(2026, 1, 1), LocalDate.of(2026, 11, 5)), true, NOW, NOW.plusSeconds(20)));
        requests.turnOff();

        HistoryImportRuns.forget(tracker, requests);

        assertThat(tracker.last()).isEmpty();
        assertThat(requests.queuedHistoryImportAt()).isEmpty();
        assertThat(requests.enabled()).isTrue();
    }
}
