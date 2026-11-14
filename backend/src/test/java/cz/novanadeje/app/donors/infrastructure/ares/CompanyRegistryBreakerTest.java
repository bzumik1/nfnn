package cz.novanadeje.app.donors.infrastructure.ares;

import cz.novanadeje.app.donors.application.CompanyRegistry;
import cz.novanadeje.app.donors.application.CompanyRegistryFailure;
import cz.novanadeje.app.donors.application.CompanyRegistryPause;
import cz.novanadeje.app.donors.application.CompanyRegistryUnavailable;
import cz.novanadeje.app.donors.domain.RegisteredCompany;
import cz.novanadeje.app.shared.domain.CompanyIdentifier;
import cz.novanadeje.app.shared.domain.PostalAddress;
import cz.novanadeje.app.support.MutableClock;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.catchThrowableOfType;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class CompanyRegistryBreakerTest {

    private static final CompanyIdentifier ICO = new CompanyIdentifier("45274649");
    private static final RegisteredCompany COMPANY = new RegisteredCompany(ICO, "Stavby Novák s.r.o.",
            Optional.of(new PostalAddress("Dlouhá 12", "Ústí nad Labem", "400 01")));

    private final MutableClock clock = new MutableClock(Instant.parse("2026-10-24T10:00:00Z"), ZoneOffset.UTC);
    private final CompanyRegistry registry = mock(CompanyRegistry.class);
    private final CompanyRegistryBreaker breaker = new CompanyRegistryBreaker(registry, clock);

    @Test
    @DisplayName("Given the register knows the company, when it is found, then the company comes back unchanged")
    void should_return_company_when_found_given_register_knows_it() {
        when(registry.find(ICO)).thenReturn(Optional.of(COMPANY));

        assertThat(breaker.find(ICO)).contains(COMPANY);
    }

    @Test
    @DisplayName("Given the register fails, when a company is found, then the same closed failure comes back without a pause")
    void should_pass_failure_on_without_pause_when_found_given_register_fails() {
        CompanyRegistryUnavailable timeout = new CompanyRegistryUnavailable(CompanyRegistryFailure.TIMEOUT);
        when(registry.find(ICO)).thenThrow(timeout);

        CompanyRegistryUnavailable failure = catchThrowableOfType(CompanyRegistryUnavailable.class, () -> breaker.find(ICO));

        assertThat(failure.failure()).isEqualTo(CompanyRegistryFailure.TIMEOUT);
        assertThat(failure.pause()).isEmpty();
    }

    @Test
    @DisplayName("Given the register throws something unexpected, when a company is found, then it is unavailable as unexpected naming only the exception class")
    void should_be_unavailable_naming_only_the_class_when_found_given_unexpected_failure() {
        when(registry.find(ICO)).thenThrow(new IllegalStateException("45274649 broke"));

        CompanyRegistryUnavailable failure = catchThrowableOfType(CompanyRegistryUnavailable.class, () -> breaker.find(ICO));

        assertThat(failure.failure()).isEqualTo(CompanyRegistryFailure.UNEXPECTED_EXCEPTION);
        assertThat(failure.outcome()).isEqualTo("IllegalStateException");
    }

    @Nested
    @DisplayName("Given the register failed three times in a row")
    class GivenThreeFailuresInARow {

        private CompanyRegistryUnavailable third;

        @BeforeEach
        void failThreeTimes() {
            when(registry.find(any())).thenThrow(CompanyRegistryUnavailable.status(503));
            for (int attempt = 0; attempt < CompanyRegistryBreaker.FAILURES_BEFORE_PAUSE; attempt++) {
                third = catchThrowableOfType(CompanyRegistryUnavailable.class, () -> breaker.find(ICO));
            }
        }

        @Test
        @DisplayName("when the third failure comes back, then it names the failures in a row and the five minutes the register is skipped")
        void should_name_the_pause_when_third_failure_comes_back() {
            assertThat(third.outcome()).isEqualTo("status 503");
            assertThat(third.pause()).contains(new CompanyRegistryPause(3, Duration.ofMinutes(5)));
        }

        @Test
        @DisplayName("when a company is found within five minutes, then the register is not asked and the lookup is paused")
        void should_skip_register_when_found_within_pause() {
            clock.advance(CompanyRegistryBreaker.PAUSE.minusSeconds(1));

            CompanyRegistryUnavailable failure = catchThrowableOfType(CompanyRegistryUnavailable.class, () -> breaker.find(ICO));

            assertThat(failure.failure()).isEqualTo(CompanyRegistryFailure.PAUSED);
            verify(registry, times(CompanyRegistryBreaker.FAILURES_BEFORE_PAUSE)).find(any());
        }

        @Test
        @DisplayName("when five minutes have passed and the register answers, then the company comes back and the next failure does not pause again")
        void should_ask_again_when_pause_passed() {
            clock.advance(CompanyRegistryBreaker.PAUSE);
            reset(registry);
            when(registry.find(ICO)).thenReturn(Optional.of(COMPANY)).thenThrow(new CompanyRegistryUnavailable(CompanyRegistryFailure.TIMEOUT))
                    .thenReturn(Optional.of(COMPANY));

            assertThat(breaker.find(ICO)).contains(COMPANY);
            assertThat(catchThrowableOfType(CompanyRegistryUnavailable.class, () -> breaker.find(ICO)).pause()).isEmpty();
            assertThat(breaker.find(ICO)).contains(COMPANY);
            verify(registry, times(3)).find(ICO);
        }

        @Test
        @DisplayName("when five minutes have passed and the register still fails, then it is skipped for another five minutes")
        void should_pause_again_when_pause_passed_and_register_still_fails() {
            clock.advance(CompanyRegistryBreaker.PAUSE);
            assertThat(catchThrowableOfType(CompanyRegistryUnavailable.class, () -> breaker.find(ICO)).pause())
                    .contains(new CompanyRegistryPause(4, Duration.ofMinutes(5)));
            clock.advance(Duration.ofMinutes(1));

            assertThatThrownBy(() -> breaker.find(ICO)).isInstanceOf(CompanyRegistryUnavailable.class);

            verify(registry, times(CompanyRegistryBreaker.FAILURES_BEFORE_PAUSE + 1)).find(any());
        }
    }

    @Test
    @DisplayName("Given three unexpected exceptions in a row, when a company is found, then the register is not asked for five minutes")
    void should_pause_when_found_given_three_unexpected_exceptions() {
        when(registry.find(ICO)).thenThrow(new IllegalStateException("broke"));
        for (int attempt = 0; attempt < CompanyRegistryBreaker.FAILURES_BEFORE_PAUSE; attempt++) {
            assertThatThrownBy(() -> breaker.find(ICO)).isInstanceOf(CompanyRegistryUnavailable.class);
        }

        CompanyRegistryUnavailable failure = catchThrowableOfType(CompanyRegistryUnavailable.class, () -> breaker.find(ICO));

        assertThat(failure.failure()).isEqualTo(CompanyRegistryFailure.PAUSED);
        verify(registry, times(CompanyRegistryBreaker.FAILURES_BEFORE_PAUSE)).find(ICO);
    }

    @Test
    @DisplayName("Given two failures followed by an answer, when the register fails again, then it is still asked next time")
    void should_keep_asking_when_failures_are_not_in_a_row() {
        when(registry.find(ICO)).thenThrow(new CompanyRegistryUnavailable(CompanyRegistryFailure.TIMEOUT))
                .thenThrow(new CompanyRegistryUnavailable(CompanyRegistryFailure.TIMEOUT))
                .thenReturn(Optional.empty()).thenThrow(new CompanyRegistryUnavailable(CompanyRegistryFailure.TIMEOUT))
                .thenReturn(Optional.of(COMPANY));

        for (int attempt = 0; attempt < 4; attempt++) {
            findIgnoringFailure();
        }

        assertThat(breaker.find(ICO)).contains(COMPANY);
        verify(registry, times(5)).find(ICO);
    }

    @Test
    @DisplayName("Given two failures more than five minutes ago, when the register fails once more, then it is still asked next time")
    void should_forget_old_failures_when_register_fails_again() {
        when(registry.find(ICO)).thenThrow(new CompanyRegistryUnavailable(CompanyRegistryFailure.TIMEOUT));
        findIgnoringFailure();
        findIgnoringFailure();
        clock.advance(CompanyRegistryBreaker.PAUSE.plusSeconds(1));
        findIgnoringFailure();

        findIgnoringFailure();

        verify(registry, times(4)).find(ICO);
    }

    private void findIgnoringFailure() {
        catchThrowableOfType(CompanyRegistryUnavailable.class, () -> breaker.find(ICO));
    }
}
