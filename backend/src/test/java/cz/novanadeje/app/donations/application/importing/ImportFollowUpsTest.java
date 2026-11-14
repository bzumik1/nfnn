package cz.novanadeje.app.donations.application.importing;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import cz.novanadeje.app.donations.domain.importing.ImportCoverage;
import cz.novanadeje.app.donations.domain.importing.ImportFailureKind;
import cz.novanadeje.app.donations.domain.importing.ImportPeriod;
import cz.novanadeje.app.donations.domain.importing.ImportTrigger;
import cz.novanadeje.app.support.MutableClock;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.Period;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;

import static cz.novanadeje.app.donations.domain.importing.ImportTrigger.HISTORY;
import static cz.novanadeje.app.donations.domain.importing.ImportTrigger.STARTUP;
import static org.assertj.core.api.Assertions.assertThat;

class ImportFollowUpsTest {

    private static final Instant NOW = Instant.parse("2026-10-17T10:00:00Z");
    private static final Instant RETRY_AT = Instant.parse("2026-10-17T10:00:31Z");
    private static final Duration COOLDOWN = Duration.ofSeconds(30);
    private static final ImportPeriod REQUESTED = new ImportPeriod(LocalDate.parse("2026-01-01"), LocalDate.parse("2026-10-17"));
    private static final BankImportProperties PROPERTIES = new BankImportProperties(Period.ofDays(3), Period.ofDays(89), "2025-01-01", COOLDOWN);

    private final MutableClock clock = new MutableClock(NOW, ZoneId.of("Europe/Prague"));
    private final HistoryImportTracker historyImports = new HistoryImportTracker();
    private final ImportFollowUps followUps = new ImportFollowUps(historyImports, PROPERTIES, clock);
    private ListAppender<ILoggingEvent> log;

    @BeforeEach
    void captureLog() {
        log = new ListAppender<>();
        log.start();
        logger().addAppender(log);
    }

    @AfterEach
    void releaseLog() {
        logger().detachAppender(log);
    }

    @Test
    @DisplayName("Given a run the bank held back, when its follow-up is asked, then the reported follow-up runs")
    void should_follow_up_when_asked_given_run_held_back() {
        FollowUp followUp = new FollowUp(RETRY_AT, STARTUP);

        assertThat(followUps.after(failed(STARTUP, followUp))).contains(followUp);
    }

    @Test
    @DisplayName("Given a completed run, when its follow-up is asked, then there is none and the budget stays")
    void should_have_no_follow_up_when_asked_given_completed_run() {
        assertThat(followUps.after(completed())).isEmpty();
        for (int followUp = 0; followUp < ImportFollowUps.MAX_IN_A_ROW; followUp++) {
            assertThat(followUps.after(failed(STARTUP, new FollowUp(RETRY_AT, STARTUP)))).isPresent();
        }
    }

    @Test
    @DisplayName("Given three follow-ups since the scheduled run, when a fourth is reported, then it does not run and a warning says the import waits for the hourly run")
    void should_refuse_fourth_follow_up_when_reported_given_three_since_scheduled_run() {
        ImportReport heldBack = failed(STARTUP, new FollowUp(RETRY_AT, STARTUP));
        for (int followUp = 0; followUp < ImportFollowUps.MAX_IN_A_ROW; followUp++) {
            followUps.after(heldBack);
        }

        assertThat(followUps.after(heldBack)).isEmpty();
        assertThat(messages(Level.WARN)).containsExactly("Fio refused 4 follow-ups in a row; waiting for the next hourly run");
    }

    @Test
    @DisplayName("Given the follow-ups used up, when the next scheduled run starts, then three follow-ups are allowed again")
    void should_allow_three_follow_ups_again_when_scheduled_run_starts_given_budget_used_up() {
        ImportReport heldBack = failed(STARTUP, new FollowUp(RETRY_AT, STARTUP));
        for (int followUp = 0; followUp <= ImportFollowUps.MAX_IN_A_ROW; followUp++) {
            followUps.after(heldBack);
        }

        followUps.scheduledRunStarted();

        for (int followUp = 0; followUp < ImportFollowUps.MAX_IN_A_ROW; followUp++) {
            assertThat(followUps.after(heldBack)).isPresent();
        }
    }

    @Test
    @DisplayName("Given the current history run, when it is due, then it runs, and once a newer run replaces it, it does not")
    void should_run_only_current_history_run_when_due_given_newer_run_replaces_it() {
        HistoryImportRun first = queue();

        assertThat(followUps.due(first)).isTrue();
        HistoryImportRun second = queue();
        assertThat(followUps.due(first)).isFalse();
        assertThat(followUps.due(second)).isTrue();
    }

    @Test
    @DisplayName("Given the current history run held back by the bank, when its follow-up is asked, then it runs again at the reported time")
    void should_run_history_again_at_reported_time_when_asked_given_current_run_held_back() {
        HistoryImportRun run = queue();

        assertThat(followUps.afterHistory(run, failed(HISTORY, new FollowUp(RETRY_AT, HISTORY)))).contains(RETRY_AT);
    }

    @Test
    @DisplayName("Given a history run without a follow-up, when its follow-up is asked, then there is none")
    void should_have_no_history_follow_up_when_asked_given_no_follow_up_reported() {
        HistoryImportRun run = queue();

        assertThat(followUps.afterHistory(run, completed())).isEmpty();
    }

    @Test
    @DisplayName("Given a history run replaced by a newer one, when the bank held the old one back, then it gets no follow-up and its outcome stays")
    void should_have_no_history_follow_up_when_held_back_given_run_replaced() {
        HistoryImportRun old = queue();
        HistoryImportRun newer = queue();

        assertThat(followUps.afterHistory(old, failed(HISTORY, new FollowUp(RETRY_AT, HISTORY)))).isEmpty();
        assertThat(historyImports.last()).contains(newer);
    }

    @Test
    @DisplayName("Given three history follow-ups in a row, when the bank holds the run back a fourth time, then it ends as rate limited now and a warning says it waits to be requested again")
    void should_abandon_history_run_when_held_back_fourth_time_given_three_follow_ups() {
        HistoryImportRun run = queue();
        ImportReport heldBack = failed(HISTORY, new FollowUp(RETRY_AT, HISTORY));
        for (int followUp = 0; followUp < ImportFollowUps.MAX_IN_A_ROW; followUp++) {
            assertThat(followUps.afterHistory(run, heldBack)).contains(RETRY_AT);
        }

        assertThat(followUps.afterHistory(run, heldBack)).isEmpty();

        assertThat(historyImports.last()).map(HistoryImportRun::status).contains(HistoryImportStatus.FAILED);
        assertThat(historyImports.last()).flatMap(HistoryImportRun::failure).contains(ImportFailureKind.RATE_LIMITED);
        assertThat(historyImports.last()).flatMap(HistoryImportRun::finishedAt).contains(NOW);
        assertThat(messages(Level.WARN)).containsExactly("Fio import HISTORY put off 4 times in a row; it waits to be requested again");
    }

    @Test
    @DisplayName("Given a run that used up its follow-ups but one, when a newer run is held back, then the newer run gets all three follow-ups")
    void should_give_newer_run_three_follow_ups_when_held_back_given_older_run_used_them() {
        ImportReport heldBack = failed(HISTORY, new FollowUp(RETRY_AT, HISTORY));
        HistoryImportRun older = queue();
        followUps.afterHistory(older, heldBack);
        followUps.afterHistory(older, heldBack);

        HistoryImportRun newer = queue();

        for (int followUp = 0; followUp < ImportFollowUps.MAX_IN_A_ROW; followUp++) {
            assertThat(followUps.afterHistory(newer, heldBack)).contains(RETRY_AT);
        }
    }

    @Test
    @DisplayName("Given the hourly follow-ups used up, when the history run is held back, then it keeps its own three follow-ups")
    void should_keep_history_follow_ups_when_held_back_given_hourly_follow_ups_used_up() {
        ImportReport hourlyHeldBack = failed(STARTUP, new FollowUp(RETRY_AT, STARTUP));
        for (int followUp = 0; followUp <= ImportFollowUps.MAX_IN_A_ROW; followUp++) {
            followUps.after(hourlyHeldBack);
        }
        HistoryImportRun run = queue();

        assertThat(followUps.afterHistory(run, failed(HISTORY, new FollowUp(RETRY_AT, HISTORY)))).contains(RETRY_AT);
    }

    @Test
    @DisplayName("Given a history run held back twice, when the next scheduled run starts between its follow-ups, then the history run keeps its count and the fourth refusal still ends it")
    void should_keep_history_count_when_scheduled_run_starts_given_history_run_held_back_twice() {
        HistoryImportRun run = queue();
        ImportReport heldBack = failed(HISTORY, new FollowUp(RETRY_AT, HISTORY));
        followUps.afterHistory(run, heldBack);
        followUps.afterHistory(run, heldBack);

        followUps.scheduledRunStarted();

        assertThat(followUps.afterHistory(run, heldBack)).contains(RETRY_AT);
        assertThat(followUps.afterHistory(run, heldBack)).isEmpty();
        assertThat(historyImports.last()).flatMap(HistoryImportRun::failure).contains(ImportFailureKind.RATE_LIMITED);
    }

    @Test
    @DisplayName("Given another import holding the thread, when a history run is put off, then it runs again after the bank's cooldown without using up a follow-up")
    void should_put_off_by_cooldown_without_follow_up_when_thread_busy_given_history_run() {
        HistoryImportRun run = queue();
        ImportReport heldBack = failed(HISTORY, new FollowUp(RETRY_AT, HISTORY));

        assertThat(followUps.putOffWhileBusy()).isEqualTo(NOW.plus(COOLDOWN));

        for (int followUp = 0; followUp < ImportFollowUps.MAX_IN_A_ROW; followUp++) {
            assertThat(followUps.afterHistory(run, heldBack)).contains(RETRY_AT);
        }
    }

    @Test
    @DisplayName("Given a history run waiting for its follow-up, when it cannot be scheduled again, then it ends as failed unexpectedly now")
    void should_end_failed_when_not_rescheduled_given_waiting_history_run() {
        HistoryImportRun run = queue();

        followUps.notRescheduled(run);

        assertThat(historyImports.last()).map(HistoryImportRun::status).contains(HistoryImportStatus.FAILED);
        assertThat(historyImports.last()).flatMap(HistoryImportRun::failure).contains(ImportFailureKind.UNEXPECTED);
        assertThat(historyImports.last()).flatMap(HistoryImportRun::finishedAt).contains(NOW);
    }

    private HistoryImportRun queue() {
        return historyImports.queue(REQUESTED, true, NOW, NOW);
    }

    private static ImportReport failed(ImportTrigger trigger, FollowUp followUp) {
        return new ImportReport(trigger, REQUESTED, true, Optional.empty(), ImportCoverage.none(), ImportCounts.none(),
                Optional.of(ImportFailureKind.RATE_LIMITED), Optional.of("refused"), Optional.of(followUp));
    }

    private static ImportReport completed() {
        return new ImportReport(STARTUP, REQUESTED, false, Optional.of(REQUESTED), new ImportCoverage(REQUESTED.from(), REQUESTED.to()),
                ImportCounts.none(), Optional.empty(), Optional.empty(), Optional.empty());
    }

    private List<String> messages(Level level) {
        return log.list.stream().filter(event -> event.getLevel() == level).map(ILoggingEvent::getFormattedMessage).toList();
    }

    private static Logger logger() {
        return (Logger) LoggerFactory.getLogger(ImportFollowUps.class);
    }
}
