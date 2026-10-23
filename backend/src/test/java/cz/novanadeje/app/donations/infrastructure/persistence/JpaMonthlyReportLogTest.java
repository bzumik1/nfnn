package cz.novanadeje.app.donations.infrastructure.persistence;

import cz.novanadeje.app.donations.domain.report.MonthlyReportLog;
import cz.novanadeje.app.donations.domain.report.ReportMonth;
import cz.novanadeje.app.donations.domain.report.SentReport;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

import java.time.Instant;
import java.time.LocalDate;

import static cz.novanadeje.app.donations.infrastructure.persistence.BankPersistenceTestConfiguration.NOW;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(BankPersistenceTestConfiguration.class)
class JpaMonthlyReportLogTest {

    private static final ReportMonth SEPTEMBER = ReportMonth.of(2026, 9);

    @Autowired
    private MonthlyReportLog reportLog;
    @Autowired
    private JdbcClient jdbc;

    @Test
    @DisplayName("Given no report for September, when its sending is recorded, then it is recorded once with the month's first day and the time")
    void should_record_month_when_recorded_given_no_earlier_record() {
        assertThat(reportLog.recordSending(SEPTEMBER, NOW)).isTrue();

        assertThat(jdbc.sql("select report_month from donation_monthly_report").query(LocalDate.class).single())
                .isEqualTo(LocalDate.of(2026, 9, 1));
        assertThat(jdbc.sql("select sent_at from donation_monthly_report").query(Instant.class).single()).isEqualTo(NOW);
    }

    @Test
    @DisplayName("Given September's report recorded, when its sending is recorded again, then the second recording is refused and the first time stays")
    void should_refuse_second_recording_when_recorded_given_month_already_recorded() {
        reportLog.recordSending(SEPTEMBER, NOW);

        assertThat(reportLog.recordSending(SEPTEMBER, NOW.plusSeconds(86400))).isFalse();
        assertThat(jdbc.sql("select sent_at from donation_monthly_report").query(Instant.class).single()).isEqualTo(NOW);
    }

    @Test
    @DisplayName("Given September's report recorded, when October's sending is recorded, then October is recorded too")
    void should_record_next_month_when_recorded_given_previous_month_recorded() {
        reportLog.recordSending(SEPTEMBER, NOW);

        assertThat(reportLog.recordSending(ReportMonth.of(2026, 10), NOW)).isTrue();
        assertThat(jdbc.sql("select count(*) from donation_monthly_report").query(Long.class).single()).isEqualTo(2);
    }

    @Test
    @DisplayName("Given September and October recorded, when the sent reports are listed, then October comes first with its time")
    void should_list_newest_first_when_listed_given_two_months_recorded() {
        reportLog.recordSending(SEPTEMBER, NOW);
        reportLog.recordSending(ReportMonth.of(2026, 10), NOW.plusSeconds(86400));

        assertThat(reportLog.sentReportsNewestFirst()).containsExactly(
                new SentReport(ReportMonth.of(2026, 10), NOW.plusSeconds(86400)),
                new SentReport(SEPTEMBER, NOW));
    }

    @Test
    @DisplayName("Given the schema, when a month is stored on another day than its first, then the check constraint refuses it")
    void should_refuse_when_inserted_given_day_other_than_first() {
        assertThatThrownBy(() -> jdbc.sql("insert into donation_monthly_report (report_month, sent_at) values (date '2026-09-15', now())").update())
                .hasMessageContaining("ck_donation_monthly_report_first_day");
    }
}
