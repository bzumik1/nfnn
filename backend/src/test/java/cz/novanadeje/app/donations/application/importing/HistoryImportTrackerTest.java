package cz.novanadeje.app.donations.application.importing;

import cz.novanadeje.app.donations.domain.importing.ImportFailureKind;
import cz.novanadeje.app.donations.domain.importing.ImportPeriod;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;

class HistoryImportTrackerTest {

    private static final Instant NOW = Instant.parse("2026-11-05T10:00:00Z");
    private static final LocalDate FROM = LocalDate.of(2026, 1, 1);
    private static final HistoryImportRun QUEUED = HistoryImportRun.queued(new ImportPeriod(FROM, LocalDate.of(2026, 11, 5)), true, NOW, NOW);

    @Test
    @DisplayName("Given a fresh server, when the last history run is asked, then there is none")
    void should_have_no_run_when_asked_given_fresh_server() {
        assertThat(new HistoryImportTracker().last()).isEmpty();
    }

    @Test
    @DisplayName("Given a queued run, when it is abandoned, then it ends as failed with the reason and the time")
    void should_end_failed_when_abandoned_given_queued_run() {
        HistoryImportTracker tracker = new HistoryImportTracker();
        tracker.queued(QUEUED);

        tracker.abandoned(ImportFailureKind.RATE_LIMITED, NOW.plusSeconds(90));

        assertThat(tracker.last()).map(HistoryImportRun::status).contains(HistoryImportStatus.FAILED);
        assertThat(tracker.last()).flatMap(HistoryImportRun::failure).contains(ImportFailureKind.RATE_LIMITED);
        assertThat(tracker.last()).flatMap(HistoryImportRun::finishedAt).contains(NOW.plusSeconds(90));
    }

    @Test
    @DisplayName("Given a finished run, when it is abandoned, then its outcome stays")
    void should_keep_outcome_when_abandoned_given_finished_run() {
        HistoryImportTracker tracker = new HistoryImportTracker();
        tracker.queued(QUEUED.completed(2, NOW));

        tracker.abandoned(ImportFailureKind.RATE_LIMITED, NOW.plusSeconds(90));

        assertThat(tracker.last()).map(HistoryImportRun::status).contains(HistoryImportStatus.COMPLETED);
    }

    @Test
    @DisplayName("Given a run queued from another day, when a run starts, then the queued one stays queued")
    void should_stay_queued_when_another_day_starts_given_queued_run() {
        HistoryImportTracker tracker = new HistoryImportTracker();
        tracker.queued(QUEUED);

        tracker.started(FROM.plusDays(1));

        assertThat(tracker.last()).contains(QUEUED);
    }
}
