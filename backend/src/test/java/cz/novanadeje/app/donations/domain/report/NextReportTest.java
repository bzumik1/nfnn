package cz.novanadeje.app.donations.domain.report;

import cz.novanadeje.app.shared.domain.EmailAddress;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class NextReportTest {

    private static final ReportSettings ON_THE_THIRD = new ReportSettings(ReportRecipients.of(new EmailAddress("info@nfnn.cz")), 3, 7, ReportSections.all());
    private static final LocalDate MID_NOVEMBER = LocalDate.of(2026, 11, 13);

    @Test
    @DisplayName("Given October not sent yet, when the next report is chosen in November, then it is October's, due on the send day in November")
    void should_be_previous_month_when_chosen_given_it_is_not_sent() {
        assertThat(NextReport.after(ON_THE_THIRD, List.of(), MID_NOVEMBER)).isEqualTo(new NextReport(ReportMonth.of(2026, 10), LocalDate.of(2026, 11, 3)));
    }

    @Test
    @DisplayName("Given October already sent, when the next report is chosen in November, then it is November's, due on the send day in December")
    void should_be_current_month_when_chosen_given_previous_is_sent() {
        List<SentReport> sent = List.of(new SentReport(ReportMonth.of(2026, 10), Instant.parse("2026-11-03T06:00:00Z")));

        assertThat(NextReport.after(ON_THE_THIRD, sent, MID_NOVEMBER)).isEqualTo(new NextReport(ReportMonth.of(2026, 11), LocalDate.of(2026, 12, 3)));
    }

    @Test
    @DisplayName("Given a due date outside the month after the reported one, when a next report is made, then it is refused")
    void should_refuse_the_report_when_made_given_a_due_date_outside_the_following_month() {
        assertThatThrownBy(() -> new NextReport(ReportMonth.of(2026, 10), LocalDate.of(2026, 10, 3))).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new NextReport(ReportMonth.of(2026, 10), LocalDate.of(2026, 12, 3))).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("Given a missing month or due date, when a next report is made, then it is refused")
    void should_refuse_the_report_when_made_given_a_missing_part() {
        assertThatThrownBy(() -> new NextReport(null, LocalDate.of(2026, 11, 3))).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new NextReport(ReportMonth.of(2026, 10), null)).isInstanceOf(IllegalArgumentException.class);
    }
}
