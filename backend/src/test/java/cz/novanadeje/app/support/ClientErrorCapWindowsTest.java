package cz.novanadeje.app.support;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import cz.novanadeje.app.operations.application.clienterrors.ClientErrorCap;
import cz.novanadeje.app.operations.application.clienterrors.ClientErrorReportService;
import cz.novanadeje.app.operations.domain.clienterrors.ClientErrorBucket;
import cz.novanadeje.app.operations.domain.clienterrors.ClientErrorKind;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;

import java.time.Instant;
import java.time.ZoneOffset;

import static org.assertj.core.api.Assertions.assertThat;

class ClientErrorCapWindowsTest {

    @Test
    @DisplayName("Given a full cap at a fixed instant, when its windows are reset, then the next scenario at the same instant starts with an open cap")
    void should_open_the_cap_when_reset_given_a_full_cap_at_a_fixed_instant() {
        ClientErrorCap cap = new ClientErrorCap(new MutableClock(Instant.parse("2026-11-04T09:00:00Z"), ZoneOffset.UTC), new RecordingResetTimer());
        for (int report = 0; report < ClientErrorBucket.GENERAL.perHour(); report++) {
            cap.admits(ClientErrorKind.UNEXPECTED);
        }
        assertThat(cap.admits(ClientErrorKind.UNEXPECTED)).isFalse();

        ClientErrorCapWindows.reset(cap);

        assertThat(cap.admits(ClientErrorKind.UNEXPECTED)).isTrue();
    }

    @Test
    @DisplayName("Given a cap that dropped a report and still owes its hourly warning, when its windows are reset, then the owed warning writes nothing into the next scenario")
    void should_owe_no_warning_when_reset_given_a_dropped_report() {
        RecordingResetTimer timer = new RecordingResetTimer();
        ClientErrorCap cap = new ClientErrorCap(new MutableClock(Instant.parse("2026-11-04T09:00:00Z"), ZoneOffset.UTC), timer);
        for (int report = 0; report <= ClientErrorBucket.PDF_LOAD.perHour(); report++) {
            cap.admits(ClientErrorKind.PDF_LOAD);
        }
        Logger logger = (Logger) LoggerFactory.getLogger(ClientErrorReportService.LOGGER);
        ListAppender<ILoggingEvent> lines = new ListAppender<>();
        lines.start();
        logger.addAppender(lines);

        try {
            ClientErrorCapWindows.reset(cap);
            timer.fireAll();
        } finally {
            logger.detachAppender(lines);
        }

        assertThat(lines.list).isEmpty();
    }
}
