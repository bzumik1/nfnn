package cz.novanadeje.app.donations.domain.importing;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.time.Period;
import java.util.Optional;

import static cz.novanadeje.app.donations.domain.importing.ImportCoverageTest.coverage;
import static cz.novanadeje.app.donations.domain.importing.ImportPeriodTest.period;
import static cz.novanadeje.app.donations.domain.importing.ImportTrigger.HOURLY;
import static cz.novanadeje.app.donations.domain.importing.ImportTrigger.STARTUP;
import static org.assertj.core.api.Assertions.assertThat;

class ImportPlannerTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 10, 17);
    private static final ImportSettings DEFAULTS = ImportSettings.defaults();
    private static final ImportSettings DEEP = withHistoryFrom("2025-01-01");

    @Test
    void should_default_to_three_days_overlap_and_eighty_nine_days_window_when_defaults_asked() {
        assertThat(DEFAULTS).isEqualTo(new ImportSettings(Period.ofDays(3), Period.ofDays(89), Optional.empty()));
    }

    @Test
    @DisplayName("Given no coverage, when an hourly run plans, then it asks for the servable window")
    void should_plan_servable_window_when_hourly_given_empty_coverage() {
        assertThat(ImportPlanner.plan(ImportCoverage.none(), TODAY, DEFAULTS, HOURLY))
                .isEqualTo(new ImportPlan(period("2026-07-20", "2026-10-17"), false));
    }

    @Test
    @DisplayName("Given no coverage and a history start, when an hourly run plans, then it ignores the history start")
    void should_ignore_history_from_when_hourly_given_empty_coverage() {
        assertThat(ImportPlanner.plan(ImportCoverage.none(), TODAY, DEEP, HOURLY))
                .isEqualTo(new ImportPlan(period("2026-07-20", "2026-10-17"), false));
    }

    @Test
    @DisplayName("Given no coverage and no history start, when the startup run plans, then it asks for the servable window")
    void should_plan_servable_window_when_startup_given_empty_coverage() {
        assertThat(ImportPlanner.plan(ImportCoverage.none(), TODAY, DEFAULTS, STARTUP))
                .isEqualTo(new ImportPlan(period("2026-07-20", "2026-10-17"), false));
    }

    @Test
    @DisplayName("Given no coverage and a deep history start, when the startup run plans, then it asks from the history start and needs the unlock")
    void should_plan_deep_period_when_startup_given_empty_coverage_and_deep_history_from() {
        assertThat(ImportPlanner.plan(ImportCoverage.none(), TODAY, DEEP, STARTUP))
                .isEqualTo(new ImportPlan(period("2025-01-01", "2026-10-17"), true));
    }

    @Test
    @DisplayName("Given no coverage and a history start inside the window, when the startup run plans, then it asks from that start without the unlock")
    void should_plan_from_history_start_when_startup_given_history_from_inside_window() {
        assertThat(ImportPlanner.plan(ImportCoverage.none(), TODAY, withHistoryFrom("2026-09-01"), STARTUP))
                .isEqualTo(new ImportPlan(period("2026-09-01", "2026-10-17"), false));
    }

    @Test
    @DisplayName("Given a recent coverage, when an hourly run plans, then it asks from the covered end minus the overlap")
    void should_plan_overlap_when_hourly_given_recent_coverage() {
        assertThat(ImportPlanner.plan(coverage("2026-07-20", "2026-10-16"), TODAY, DEFAULTS, HOURLY))
                .isEqualTo(new ImportPlan(period("2026-10-13", "2026-10-17"), false));
    }

    @Test
    @DisplayName("Given a recent coverage, when the startup run plans, then it asks from the covered end minus the overlap")
    void should_plan_overlap_when_startup_given_recent_coverage() {
        assertThat(ImportPlanner.plan(coverage("2026-07-20", "2026-10-16"), TODAY, DEFAULTS, STARTUP))
                .isEqualTo(new ImportPlan(period("2026-10-13", "2026-10-17"), false));
    }

    @Test
    @DisplayName("Given a coverage that ended long ago, when an hourly run plans, then it is clamped to the servable window")
    void should_clamp_to_window_when_hourly_given_old_coverage() {
        assertThat(ImportPlanner.plan(coverage("2026-01-01", "2026-03-31"), TODAY, DEFAULTS, HOURLY))
                .isEqualTo(new ImportPlan(period("2026-07-20", "2026-10-17"), false));
    }

    @Test
    @DisplayName("Given a coverage that ended long ago, when the startup run plans, then it asks for the whole missing period and needs the unlock")
    void should_plan_missing_period_when_startup_given_old_coverage() {
        assertThat(ImportPlanner.plan(coverage("2026-01-01", "2026-03-31"), TODAY, DEFAULTS, STARTUP))
                .isEqualTo(new ImportPlan(period("2026-03-28", "2026-10-17"), true));
    }

    @Test
    @DisplayName("Given a history start before the coverage, when the startup run plans, then it attempts the deep history again")
    void should_reattempt_deep_history_when_startup_given_history_from_before_coverage() {
        assertThat(ImportPlanner.plan(coverage("2026-07-20", "2026-10-16"), TODAY, DEEP, STARTUP))
                .isEqualTo(new ImportPlan(period("2025-01-01", "2026-10-17"), true));
    }

    @Test
    @DisplayName("Given a pending deep history, when an hourly run plans, then it asks only for the overlap window")
    void should_plan_only_overlap_when_hourly_given_pending_deep_history() {
        assertThat(ImportPlanner.plan(coverage("2026-07-20", "2026-10-16"), TODAY, DEEP, HOURLY))
                .isEqualTo(new ImportPlan(period("2026-10-13", "2026-10-17"), false));
    }

    @Test
    @DisplayName("Given a history start the coverage already reaches, when the startup run plans, then it asks only for the overlap window")
    void should_plan_only_overlap_when_startup_given_history_already_covered() {
        assertThat(ImportPlanner.plan(coverage("2025-01-01", "2026-10-16"), TODAY, DEEP, STARTUP))
                .isEqualTo(new ImportPlan(period("2026-10-13", "2026-10-17"), false));
    }

    @Test
    @DisplayName("Given a coverage reaching past today, when either run plans, then the period never starts after today")
    void should_never_start_after_today_when_planned_given_coverage_in_the_future() {
        assertThat(ImportPlanner.plan(coverage("2026-07-20", "2026-10-25"), TODAY, DEFAULTS, HOURLY))
                .isEqualTo(new ImportPlan(period("2026-10-17", "2026-10-17"), false));
        assertThat(ImportPlanner.plan(coverage("2026-07-20", "2026-10-25"), TODAY, DEFAULTS, STARTUP))
                .isEqualTo(new ImportPlan(period("2026-10-17", "2026-10-17"), false));
    }

    @Test
    @DisplayName("Given a history start after today, when the startup run plans, then the period never starts after today")
    void should_never_start_after_today_when_startup_given_history_from_in_the_future() {
        assertThat(ImportPlanner.plan(ImportCoverage.none(), TODAY, withHistoryFrom("2026-12-01"), STARTUP))
                .isEqualTo(new ImportPlan(period("2026-10-17", "2026-10-17"), false));
    }

    private static ImportSettings withHistoryFrom(String date) {
        return new ImportSettings(Period.ofDays(3), Period.ofDays(89), Optional.of(LocalDate.parse(date)));
    }
}
