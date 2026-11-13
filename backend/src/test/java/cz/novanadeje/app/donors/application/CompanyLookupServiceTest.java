package cz.novanadeje.app.donors.application;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import cz.novanadeje.app.donors.domain.CompanyIdentifier;
import cz.novanadeje.app.donors.domain.RegisteredCompany;
import cz.novanadeje.app.shared.domain.PostalAddress;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;

import java.time.Duration;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class CompanyLookupServiceTest {

    private static final CompanyIdentifier ICO = new CompanyIdentifier("45274649");
    private static final RegisteredCompany COMPANY = new RegisteredCompany(ICO, "Stavby Novák s.r.o.",
            Optional.of(new PostalAddress("Dlouhá 12", "Ústí nad Labem", "400 01")));

    private final CompanyRegistry registry = mock(CompanyRegistry.class);
    private final CompanyLookupService service = new CompanyLookupService(registry);
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
    @DisplayName("Given the register knows the company, when it is looked up, then its name and seat come back and nothing is logged")
    void should_return_company_when_looked_up_given_register_knows_it() {
        when(registry.find(ICO)).thenReturn(Optional.of(COMPANY));

        assertThat(service.lookUp(ICO)).contains(COMPANY);
        assertThat(log.list).isEmpty();
    }

    @Test
    @DisplayName("Given the register does not know the company, when it is looked up, then nothing comes back and nothing is logged")
    void should_return_nothing_when_looked_up_given_unknown_company() {
        when(registry.find(ICO)).thenReturn(Optional.empty());

        assertThat(service.lookUp(ICO)).isEmpty();
        assertThat(log.list).isEmpty();
    }

    @Test
    @DisplayName("Given the register fails, when a company is looked up, then nothing comes back and one warning names the outcome but not the identifier")
    void should_warn_without_identifier_when_looked_up_given_register_fails() {
        when(registry.find(ICO)).thenThrow(new CompanyRegistryUnavailable(CompanyRegistryFailure.TIMEOUT));

        assertThat(service.lookUp(ICO)).isEmpty();

        assertThat(log.list).singleElement().satisfies(event -> {
            assertThat(event.getLevel()).isEqualTo(Level.WARN);
            assertThat(event.getFormattedMessage()).isEqualTo("The company register lookup failed: timeout");
            assertThat(event.getThrowableProxy()).isNull();
        });
    }

    @Test
    @DisplayName("Given the register answers with a status, when a company is looked up, then the warning names the status")
    void should_warn_with_status_when_looked_up_given_register_answers_with_status() {
        when(registry.find(ICO)).thenThrow(CompanyRegistryUnavailable.status(503));

        assertThat(service.lookUp(ICO)).isEmpty();

        assertThat(log.list).singleElement()
                .satisfies(event -> assertThat(event.getFormattedMessage()).isEqualTo("The company register lookup failed: status 503"));
    }

    @Test
    @DisplayName("Given the register is unavailable for an unexpected exception, when a company is looked up, then nothing comes back and the warning names only the exception class")
    void should_warn_with_class_when_looked_up_given_unexpected_exception() {
        when(registry.find(ICO)).thenThrow(CompanyRegistryUnavailable.unexpected(new IllegalStateException("45274649 broke")));

        assertThat(service.lookUp(ICO)).isEmpty();

        assertThat(log.list).singleElement().satisfies(event -> {
            assertThat(event.getLevel()).isEqualTo(Level.WARN);
            assertThat(event.getFormattedMessage()).isEqualTo("The company register lookup failed: IllegalStateException");
        });
    }

    @Test
    @DisplayName("Given the failure that pauses the register, when a company is looked up, then the warning says how many failures came in a row and that the register is skipped for five minutes")
    void should_say_register_is_skipped_when_looked_up_given_failure_that_pauses() {
        when(registry.find(ICO)).thenThrow(CompanyRegistryUnavailable.status(503).pausing(new CompanyRegistryPause(3, Duration.ofMinutes(5))));

        assertThat(service.lookUp(ICO)).isEmpty();

        assertThat(log.list).singleElement().satisfies(event -> {
            assertThat(event.getLevel()).isEqualTo(Level.WARN);
            assertThat(event.getFormattedMessage())
                    .isEqualTo("The company register lookup failed: status 503; 3 failures in a row, so it is skipped for 5 minutes");
        });
    }

    @Test
    @DisplayName("Given the register is paused, when a company is looked up, then nothing comes back and nothing is logged")
    void should_return_nothing_silently_when_looked_up_given_paused_register() {
        when(registry.find(ICO)).thenThrow(new CompanyRegistryUnavailable(CompanyRegistryFailure.PAUSED));

        assertThat(service.lookUp(ICO)).isEmpty();
        assertThat(log.list).isEmpty();
    }

    private static Logger logger() {
        return (Logger) LoggerFactory.getLogger(CompanyLookupService.class);
    }
}
