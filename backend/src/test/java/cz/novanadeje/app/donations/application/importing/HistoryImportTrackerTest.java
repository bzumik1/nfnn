package cz.novanadeje.app.donations.application.importing;

import cz.novanadeje.app.donations.domain.importing.ImportCoverage;
import cz.novanadeje.app.donations.domain.importing.ImportFailureKind;
import cz.novanadeje.app.donations.domain.importing.ImportPeriod;
import cz.novanadeje.app.donations.domain.importing.ImportTrigger;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;

class HistoryImportTrackerTest {

    private static final Instant NOW = Instant.parse("2026-11-05T10:00:00Z");
    private static final ImportPeriod DEEP = new ImportPeriod(LocalDate.of(2026, 1, 1), LocalDate.of(2026, 11, 5));
    private static final ImportPeriod SHALLOW = new ImportPeriod(LocalDate.of(2026, 10, 1), LocalDate.of(2026, 11, 5));

    private final HistoryImportTracker tracker = new HistoryImportTracker();

    @Test
    @DisplayName("Given a fresh server, when the last history run is asked, then there is none")
    void should_have_no_run_when_asked_given_fresh_server() {
        assertThat(tracker.last()).isEmpty();
    }

    @Test
    @DisplayName("Given two runs queued one after the other, when they are compared, then each has its own id and only the newer one is current")
    void should_give_each_run_its_id_when_queued_given_two_requests() {
        HistoryImportRun first = tracker.queue(DEEP, true, NOW, NOW);
        HistoryImportRun second = tracker.queue(SHALLOW, false, NOW, NOW);

        assertThat(second.id()).isNotEqualTo(first.id());
        assertThat(tracker.current(first.id())).isFalse();
        assertThat(tracker.current(second.id())).isTrue();
        assertThat(tracker.last()).contains(second);
    }

    @Test
    @DisplayName("Given a queued run, when it is abandoned, then it ends as failed with the reason and the time and is no longer current")
    void should_end_failed_when_abandoned_given_queued_run() {
        HistoryImportRun run = tracker.queue(DEEP, true, NOW, NOW);

        tracker.abandoned(run.id(), ImportFailureKind.RATE_LIMITED, NOW.plusSeconds(90));

        assertThat(tracker.last()).map(HistoryImportRun::status).contains(HistoryImportStatus.FAILED);
        assertThat(tracker.last()).flatMap(HistoryImportRun::failure).contains(ImportFailureKind.RATE_LIMITED);
        assertThat(tracker.last()).flatMap(HistoryImportRun::finishedAt).contains(NOW.plusSeconds(90));
        assertThat(tracker.current(run.id())).isFalse();
    }

    @Test
    @DisplayName("Given a completed run, when it is abandoned, then its outcome stays")
    void should_keep_outcome_when_abandoned_given_completed_run() {
        HistoryImportRun run = tracker.queue(DEEP, true, NOW, NOW);
        tracker.started(run.id());
        tracker.finished(run.id(), completed(2), NOW);

        tracker.abandoned(run.id(), ImportFailureKind.RATE_LIMITED, NOW.plusSeconds(90));

        assertThat(tracker.last()).map(HistoryImportRun::status).contains(HistoryImportStatus.COMPLETED);
        assertThat(tracker.last()).flatMap(HistoryImportRun::added).contains(2);
    }

    @Test
    @DisplayName("Given a newer run queued over a running one, when the older one starts, fails or finishes, then the newer one stays queued")
    void should_leave_newer_run_queued_when_older_run_changes_given_replaced_run() {
        HistoryImportRun older = tracker.queue(DEEP, true, NOW, NOW);
        tracker.started(older.id());
        HistoryImportRun newer = tracker.queue(SHALLOW, false, NOW.plusSeconds(5), NOW.plusSeconds(30));

        tracker.started(older.id());
        tracker.abandoned(older.id(), ImportFailureKind.UNEXPECTED, NOW.plusSeconds(10));
        tracker.finished(older.id(), completed(3), NOW.plusSeconds(10));

        assertThat(tracker.last()).contains(newer);
    }

    @Test
    @DisplayName("Given the same day requested twice, when the first request's run finishes, then the second one is untouched")
    void should_leave_second_run_when_first_finishes_given_same_day_twice() {
        HistoryImportRun first = tracker.queue(DEEP, true, NOW, NOW);
        tracker.started(first.id());
        HistoryImportRun second = tracker.queue(DEEP, true, NOW.plusSeconds(5), NOW.plusSeconds(30));

        tracker.finished(first.id(), completed(1), NOW.plusSeconds(10));

        assertThat(tracker.last()).contains(second);
    }

    @Test
    @DisplayName("Given a running run, when the bank holds it back with a follow-up, then it is queued again for the follow-up's time")
    void should_wait_for_follow_up_when_finished_given_rate_limited_report() {
        HistoryImportRun run = tracker.queue(DEEP, true, NOW, NOW);
        tracker.started(run.id());

        tracker.finished(run.id(), rateLimited(NOW.plusSeconds(31)), NOW);

        assertThat(tracker.last()).map(HistoryImportRun::status).contains(HistoryImportStatus.QUEUED);
        assertThat(tracker.last()).map(HistoryImportRun::startsAt).contains(NOW.plusSeconds(31));
        assertThat(tracker.current(run.id())).isTrue();
    }

    private static ImportReport completed(int newPayments) {
        ImportCounts counts = new ImportCounts(newPayments, newPayments, 0, 0, 0, 0, 0, newPayments);
        return new ImportReport(ImportTrigger.HISTORY, DEEP, true, Optional.of(DEEP), ImportCoverage.none(), counts,
                Optional.empty(), Optional.empty(), Optional.empty());
    }

    private static ImportReport rateLimited(Instant followUpAt) {
        return new ImportReport(ImportTrigger.HISTORY, DEEP, true, Optional.empty(), ImportCoverage.none(), ImportCounts.none(),
                Optional.of(ImportFailureKind.RATE_LIMITED), Optional.of("HTTP 409"), Optional.of(new FollowUp(followUpAt, ImportTrigger.HISTORY)));
    }
}
