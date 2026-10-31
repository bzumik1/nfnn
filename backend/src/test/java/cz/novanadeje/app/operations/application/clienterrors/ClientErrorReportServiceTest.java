package cz.novanadeje.app.operations.application.clienterrors;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import cz.novanadeje.app.operations.domain.clienterrors.ClientAppVersion;
import cz.novanadeje.app.operations.domain.clienterrors.ClientBrowser;
import cz.novanadeje.app.operations.domain.clienterrors.ClientDisplayMode;
import cz.novanadeje.app.operations.domain.clienterrors.ClientErrorKind;
import cz.novanadeje.app.operations.domain.clienterrors.ClientErrorName;
import cz.novanadeje.app.operations.domain.clienterrors.ClientErrorPlace;
import cz.novanadeje.app.operations.domain.clienterrors.ClientErrorReport;
import cz.novanadeje.app.operations.domain.clienterrors.ClientOperatingSystem;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class ClientErrorReportServiceTest {

    private final ClientErrorCap cap = mock(ClientErrorCap.class);
    private final ClientErrorReportService service = new ClientErrorReportService(cap);
    private final Logger logger = (Logger) LoggerFactory.getLogger(ClientErrorReportService.LOGGER);
    private final ListAppender<ILoggingEvent> log = new ListAppender<>();

    @BeforeEach
    void captureLog() {
        log.start();
        logger.addAppender(log);
    }

    @AfterEach
    void releaseLog() {
        logger.detachAppender(log);
    }

    @Test
    @DisplayName("Given a report the cap admits, when it is recorded, then one warning of the browser error logger names every value in a fixed order")
    void should_log_one_warning_with_every_value_when_recorded_given_admitted_report() {
        when(cap.admits(ClientErrorKind.VERIFY_SIGNATURE)).thenReturn(true);

        service.record(new ClientErrorReport(ClientErrorKind.VERIFY_SIGNATURE, ClientErrorPlace.NAVIGATION, ClientErrorName.OPERATION_ERROR,
                new ClientAppVersion("1a2b3c4"), ClientBrowser.SAFARI, Optional.of(18), ClientOperatingSystem.IPADOS, ClientDisplayMode.STANDALONE, 7));

        assertThat(log.list).singleElement().satisfies(line -> {
            assertThat(line.getLevel()).isEqualTo(Level.WARN);
            assertThat(line.getLoggerName()).isEqualTo("cz.novanadeje.app.operations.clienterrors");
            assertThat(line.getFormattedMessage()).isEqualTo(
                    "Browser error kind=verify-signature place=navigation name=OperationError version=1a2b3c4 browser=safari/18 os=ipados display=standalone count=7");
            assertThat(line.getThrowableProxy()).isNull();
        });
    }

    @Test
    @DisplayName("Given a browser without a known major version, when its report is recorded, then the line names the family alone")
    void should_name_the_family_alone_when_recorded_given_no_major_version() {
        when(cap.admits(ClientErrorKind.UNEXPECTED)).thenReturn(true);

        service.record(new ClientErrorReport(ClientErrorKind.UNEXPECTED, ClientErrorPlace.GLOBAL, ClientErrorName.OTHER,
                new ClientAppVersion("dev"), ClientBrowser.OTHER, Optional.empty(), ClientOperatingSystem.OTHER, ClientDisplayMode.BROWSER, 1));

        assertThat(log.list).extracting(ILoggingEvent::getFormattedMessage).containsExactly(
                "Browser error kind=unexpected place=global name=Other version=dev browser=other os=other display=browser count=1");
    }

    @Test
    @DisplayName("Given a report over the cap, when it is recorded, then nothing is logged")
    void should_log_nothing_when_recorded_given_report_over_the_cap() {
        when(cap.admits(ClientErrorKind.UNEXPECTED)).thenReturn(false);

        service.record(new ClientErrorReport(ClientErrorKind.UNEXPECTED, ClientErrorPlace.GLOBAL, ClientErrorName.ERROR,
                new ClientAppVersion("dev"), ClientBrowser.CHROME, Optional.of(131), ClientOperatingSystem.ANDROID, ClientDisplayMode.BROWSER, 1));

        assertThat(log.list).isEmpty();
    }
}
