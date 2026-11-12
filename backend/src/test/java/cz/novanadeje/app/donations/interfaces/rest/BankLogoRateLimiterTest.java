package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.shared.interfaces.rest.RateLimitExceededException;
import cz.novanadeje.app.support.MutableClock;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;

import static org.assertj.core.api.Assertions.assertThatNoException;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class BankLogoRateLimiterTest {

    private final MutableClock clock = new MutableClock(Instant.parse("2026-11-11T10:00:00Z"), ZoneOffset.UTC);
    private final BankLogoRateLimiter limiter = new BankLogoRateLimiter(clock);

    @Test
    @DisplayName("Given 120 logo reads from one address within 15 minutes, when the 121st comes, then it is refused, another address still reads, and after the window the first reads again")
    void should_refuse_the_hundred_twenty_first_when_checked_given_one_address() {
        for (int i = 0; i < 120; i++) {
            limiter.check("198.51.100.7");
        }

        assertThatThrownBy(() -> limiter.check("198.51.100.7")).isInstanceOf(RateLimitExceededException.class);
        assertThatNoException().isThrownBy(() -> limiter.check("198.51.100.8"));
        clock.advance(Duration.ofMinutes(15));
        assertThatNoException().isThrownBy(() -> limiter.check("198.51.100.7"));
    }
}
