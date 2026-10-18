package cz.novanadeje.app.donations.infrastructure.report;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import cz.novanadeje.app.donations.application.report.MonthlyReportNotDelivered;
import cz.novanadeje.app.donations.application.report.MonthlyReportOutcome;
import cz.novanadeje.app.donations.application.report.MonthlyReportService;
import cz.novanadeje.app.donations.domain.report.ReportMonth;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.mail.MailSendException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class MonthlyReportSchedulerTest {

    private static final ReportMonth SEPTEMBER = ReportMonth.of(2026, 9);

    private final MonthlyReportService service = mock(MonthlyReportService.class);
    private final MonthlyReportScheduler scheduler = new MonthlyReportScheduler(service);
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
    @DisplayName("Given a due report, when the daily check runs, then the report is sent and one INFO line names the month")
    void should_log_sent_month_when_checked_given_due_report() {
        when(service.sendDueReport()).thenReturn(MonthlyReportOutcome.sent(SEPTEMBER));

        scheduler.checkDueReport();

        verify(service).sendDueReport();
        assertThat(log.list).singleElement().satisfies(event -> {
            assertThat(event.getLevel()).isEqualTo(Level.INFO);
            assertThat(event.getFormattedMessage()).isEqualTo("Monthly report for 2026-09 sent");
        });
    }

    @Test
    @DisplayName("Given the report already sent this month, when the daily check runs, then nothing is logged")
    void should_log_nothing_when_checked_given_report_already_sent() {
        when(service.sendDueReport()).thenReturn(MonthlyReportOutcome.alreadySent(SEPTEMBER));

        scheduler.checkDueReport();

        assertThat(log.list).isEmpty();
    }

    @Test
    @DisplayName("Given a mail server that refuses the report, when the daily check runs, then it logs the month and the exception class only and does not throw")
    void should_log_month_and_exception_class_when_checked_given_refused_mail() {
        when(service.sendDueReport()).thenThrow(new MonthlyReportNotDelivered(SEPTEMBER, new MailSendException("550 user info@nfnn.cz unknown")));

        assertThatCode(scheduler::checkDueReport).doesNotThrowAnyException();

        assertThat(log.list).singleElement().satisfies(event -> {
            assertThat(event.getLevel()).isEqualTo(Level.ERROR);
            assertThat(event.getFormattedMessage())
                    .isEqualTo("Monthly report for 2026-09 could not be sent: MailSendException; retrying at the next check");
            assertThat(event.getThrowableProxy()).isNull();
        });
    }

    @Test
    @DisplayName("Given an unexpected failure, when the daily check runs, then it is logged as an error and does not throw")
    void should_log_error_when_checked_given_unexpected_failure() {
        when(service.sendDueReport()).thenThrow(new IllegalStateException("database gone"));

        assertThatCode(scheduler::checkDueReport).doesNotThrowAnyException();

        assertThat(log.list).singleElement().satisfies(event -> {
            assertThat(event.getLevel()).isEqualTo(Level.ERROR);
            assertThat(event.getFormattedMessage()).isEqualTo("Monthly report check failed unexpectedly; retrying at the next check");
        });
    }

    private static Logger logger() {
        return (Logger) LoggerFactory.getLogger(MonthlyReportScheduler.class);
    }
}
