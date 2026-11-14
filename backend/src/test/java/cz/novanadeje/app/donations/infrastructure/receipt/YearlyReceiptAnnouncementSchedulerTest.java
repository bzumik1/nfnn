package cz.novanadeje.app.donations.infrastructure.receipt;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import cz.novanadeje.app.donations.application.receipt.YearlyReceiptAnnouncement;
import cz.novanadeje.app.donations.application.receipt.YearlyReceiptAnnouncementService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.dao.QueryTimeoutException;

import java.time.Year;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class YearlyReceiptAnnouncementSchedulerTest {

    private final YearlyReceiptAnnouncementService service = mock(YearlyReceiptAnnouncementService.class);
    private final YearlyReceiptAnnouncementScheduler scheduler = new YearlyReceiptAnnouncementScheduler(service);
    private final Logger logger = (Logger) LoggerFactory.getLogger(YearlyReceiptAnnouncementScheduler.class);
    private final ListAppender<ILoggingEvent> lines = new ListAppender<>();

    @BeforeEach
    void captureLog() {
        lines.start();
        logger.addAppender(lines);
    }

    @AfterEach
    void releaseLog() {
        logger.detachAppender(lines);
    }

    @Test
    @DisplayName("Given a due announcement, when the daily check runs, then one line names the year and the number of donors only")
    void should_log_year_and_count_when_check_runs_given_due_announcement() {
        when(service.announceDue()).thenReturn(Optional.of(new YearlyReceiptAnnouncement(Year.of(2026), 42)));

        scheduler.announceDue();

        assertThat(lines.list).singleElement().satisfies(line -> {
            assertThat(line.getLevel().toString()).isEqualTo("INFO");
            assertThat(line.getFormattedMessage()).isEqualTo("Yearly receipts of 2026 announced to 42 donors");
        });
    }

    @Test
    @DisplayName("Given nothing due, when the daily check runs, then nothing is logged")
    void should_log_nothing_when_check_runs_given_nothing_due() {
        when(service.announceDue()).thenReturn(Optional.empty());

        scheduler.announceDue();

        assertThat(lines.list).isEmpty();
    }

    @Test
    @DisplayName("Given a database that does not answer, when the daily check runs, then the failure is swallowed with one warning of its class only")
    void should_swallow_failure_with_class_only_when_check_runs_given_database_timeout() {
        when(service.announceDue()).thenThrow(new QueryTimeoutException("select from donation where donor = 'Jana Nováková'"));

        scheduler.announceDue();

        assertThat(lines.list).singleElement().satisfies(line -> {
            assertThat(line.getLevel().toString()).isEqualTo("WARN");
            assertThat(line.getFormattedMessage()).isEqualTo("Yearly receipt announcement failed: QueryTimeoutException; retrying at the next check");
            assertThat(line.getThrowableProxy()).isNull();
        });
    }
}
