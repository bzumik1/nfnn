package cz.novanadeje.app.shared.infrastructure.ratelimit;

import cz.novanadeje.app.support.MutableClock;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;

import static org.assertj.core.api.Assertions.assertThat;

class FixedWindowRateLimiterTest {

    private final MutableClock clock = new MutableClock(Instant.parse("2026-10-17T10:00:00Z"), ZoneOffset.UTC);
    private final FixedWindowRateLimiter limiter = new FixedWindowRateLimiter(2, Duration.ofHours(1), clock);

    @Test
    @DisplayName("Given a limit of 2 per hour, when one key asks three times, then the third is refused")
    void should_refuse_third_attempt_when_acquired_given_limit_of_two() {
        assertThat(limiter.tryAcquire("10.0.0.1")).isTrue();
        assertThat(limiter.tryAcquire("10.0.0.1")).isTrue();
        assertThat(limiter.tryAcquire("10.0.0.1")).isFalse();
    }

    @Test
    @DisplayName("Given two keys, when each is acquired, then the limiter counts them separately")
    void should_count_keys_separately_when_acquired_given_two_keys() {
        limiter.tryAcquire("10.0.0.1");
        limiter.tryAcquire("10.0.0.1");

        assertThat(limiter.tryAcquire("10.0.0.2")).isTrue();
    }

    @Test
    @DisplayName("Given a window that has passed, when the key is acquired, then the limiter allows it again")
    void should_allow_again_when_acquired_given_window_has_passed() {
        limiter.tryAcquire("10.0.0.1");
        limiter.tryAcquire("10.0.0.1");
        clock.advance(Duration.ofHours(1).plusSeconds(1));

        assertThat(limiter.tryAcquire("10.0.0.1")).isTrue();
    }
}
