package cz.novanadeje.app.support;

import cz.novanadeje.app.shared.infrastructure.ratelimit.FixedWindowRateLimiter;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class RateLimiterWindowsTest {

    private final Clock fixed = Clock.fixed(Instant.parse("2026-11-04T09:00:00Z"), ZoneOffset.UTC);

    @Test
    @DisplayName("Given a limiter exhausted under a fixed clock, when its windows are reset, then it lets the next request through")
    void should_let_the_next_request_through_when_windows_are_reset_given_an_exhausted_limiter() {
        LimiterHolder holder = new LimiterHolder(new FixedWindowRateLimiter(1, Duration.ofMinutes(15), fixed));
        holder.limiter().tryAcquire("10.0.0.1");
        assertThat(holder.limiter().tryAcquire("10.0.0.1")).isFalse();

        int reset = RateLimiterWindows.reset(List.of(holder, "not a limiter"));

        assertThat(reset).isEqualTo(1);
        assertThat(holder.limiter().tryAcquire("10.0.0.1")).isTrue();
    }

    @Test
    @DisplayName("Given beans that hold no limiter, when windows are reset, then it fails, so a changed limiter cannot slip past the reset")
    void should_fail_when_no_limiter_is_found() {
        assertThatThrownBy(() -> RateLimiterWindows.reset(List.of("not a limiter"))).isInstanceOf(IllegalStateException.class);
    }

    private record LimiterHolder(FixedWindowRateLimiter limiter) {
    }
}
