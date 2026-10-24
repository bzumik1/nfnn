package cz.novanadeje.app.donors.application;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import cz.novanadeje.app.donors.domain.CompanyIdentifier;
import cz.novanadeje.app.donors.domain.RegisteredCompany;
import cz.novanadeje.app.shared.domain.PostalAddress;
import cz.novanadeje.app.support.MutableClock;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;

import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class CompanyLookupServiceTest {

    private static final CompanyIdentifier ICO = new CompanyIdentifier("45274649");
    private static final RegisteredCompany COMPANY = new RegisteredCompany(ICO, "ČEZ, a. s.",
            Optional.of(new PostalAddress("Duhová 1444/2", "Praha 4", "140 00")));

    private final MutableClock clock = new MutableClock(Instant.parse("2026-10-24T10:00:00Z"), ZoneOffset.UTC);
    private final CompanyRegistry registry = mock(CompanyRegistry.class);
    private final CompanyLookupService service = new CompanyLookupService(registry, clock);
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
        when(registry.find(ICO)).thenThrow(new CompanyRegistryUnavailable("timeout"));

        assertThat(service.lookUp(ICO)).isEmpty();

        assertThat(log.list).singleElement().satisfies(event -> {
            assertThat(event.getLevel()).isEqualTo(Level.WARN);
            assertThat(event.getFormattedMessage()).contains("timeout").doesNotContain(ICO.value());
            assertThat(event.getThrowableProxy()).isNull();
        });
    }

    @Test
    @DisplayName("Given the register throws something unexpected, when a company is looked up, then nothing comes back and the warning names only the exception class")
    void should_warn_with_class_when_looked_up_given_unexpected_failure() {
        when(registry.find(ICO)).thenThrow(new IllegalStateException("45274649 broke"));

        assertThat(service.lookUp(ICO)).isEmpty();

        assertThat(log.list).singleElement().satisfies(event -> {
            assertThat(event.getLevel()).isEqualTo(Level.WARN);
            assertThat(event.getFormattedMessage()).contains("IllegalStateException").doesNotContain(ICO.value());
        });
    }

    @Nested
    @DisplayName("Given the register failed three times in a row")
    class GivenThreeFailuresInARow {

        @BeforeEach
        void failThreeTimes() {
            when(registry.find(any())).thenThrow(new CompanyRegistryUnavailable("status 503"));
            for (int attempt = 0; attempt < CompanyLookupService.FAILURES_BEFORE_PAUSE; attempt++) {
                service.lookUp(ICO);
            }
        }

        @Test
        @DisplayName("when a company is looked up within five minutes, then the register is not asked and nothing more is logged")
        void should_skip_register_when_looked_up_within_pause() {
            log.list.clear();
            clock.advance(CompanyLookupService.PAUSE.minusSeconds(1));

            assertThat(service.lookUp(ICO)).isEmpty();

            verify(registry, times(CompanyLookupService.FAILURES_BEFORE_PAUSE)).find(any());
            assertThat(log.list).isEmpty();
        }

        @Test
        @DisplayName("when the third failure is logged, then the warning says the register is skipped for a while")
        void should_say_register_is_skipped_when_third_failure_logged() {
            assertThat(log.list).last().satisfies(event -> assertThat(event.getFormattedMessage()).contains("5 minutes"));
        }

        @Test
        @DisplayName("when five minutes have passed and the register answers, then the company comes back and the next failure does not pause again")
        void should_ask_again_when_pause_passed() {
            clock.advance(CompanyLookupService.PAUSE);
            reset(registry);
            when(registry.find(ICO)).thenReturn(Optional.of(COMPANY)).thenThrow(new CompanyRegistryUnavailable("timeout"))
                    .thenReturn(Optional.of(COMPANY));

            assertThat(service.lookUp(ICO)).contains(COMPANY);
            assertThat(service.lookUp(ICO)).isEmpty();
            assertThat(service.lookUp(ICO)).contains(COMPANY);
            verify(registry, times(3)).find(ICO);
        }

        @Test
        @DisplayName("when five minutes have passed and the register still fails, then it is skipped for another five minutes")
        void should_pause_again_when_pause_passed_and_register_still_fails() {
            clock.advance(CompanyLookupService.PAUSE);
            service.lookUp(ICO);
            clock.advance(Duration.ofMinutes(1));

            service.lookUp(ICO);

            verify(registry, times(CompanyLookupService.FAILURES_BEFORE_PAUSE + 1)).find(any());
        }
    }

    @Test
    @DisplayName("Given two failures followed by an answer, when the register fails again, then it is still asked next time")
    void should_keep_asking_when_failures_are_not_in_a_row() {
        when(registry.find(ICO)).thenThrow(new CompanyRegistryUnavailable("timeout")).thenThrow(new CompanyRegistryUnavailable("timeout"))
                .thenReturn(Optional.empty()).thenThrow(new CompanyRegistryUnavailable("timeout")).thenReturn(Optional.of(COMPANY));

        for (int attempt = 0; attempt < 4; attempt++) {
            service.lookUp(ICO);
        }

        assertThat(service.lookUp(ICO)).contains(COMPANY);
        verify(registry, times(5)).find(ICO);
    }

    @Test
    @DisplayName("Given two failures more than five minutes ago, when the register fails once more, then it is still asked next time")
    void should_forget_old_failures_when_register_fails_again() {
        when(registry.find(ICO)).thenThrow(new CompanyRegistryUnavailable("timeout"));
        service.lookUp(ICO);
        service.lookUp(ICO);
        clock.advance(CompanyLookupService.PAUSE.plusSeconds(1));
        service.lookUp(ICO);

        service.lookUp(ICO);

        verify(registry, times(4)).find(ICO);
    }

    private static Logger logger() {
        return (Logger) LoggerFactory.getLogger(CompanyLookupService.class);
    }
}
