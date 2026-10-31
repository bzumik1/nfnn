package cz.novanadeje.app.operations.interfaces.rest;

import cz.novanadeje.app.shared.interfaces.rest.RateLimitExceededException;
import cz.novanadeje.app.support.MutableClock;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.net.URI;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatNoException;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ClientErrorRateLimiterTest {

    private final MutableClock clock = new MutableClock(Instant.parse("2026-11-04T09:00:00Z"), ZoneOffset.UTC);
    private final ClientErrorRateLimiter limiter = new ClientErrorRateLimiter(clock);

    @Test
    @DisplayName("Given thirty reports from one address within 15 minutes, when the next comes, then it is refused as operations/rate-limited and another address passes")
    void should_refuse_the_thirty_first_when_checked_given_thirty_within_the_window() {
        for (int report = 0; report < 30; report++) {
            limiter.check("203.0.113.7");
        }

        assertThatThrownBy(() -> limiter.check("203.0.113.7")).isInstanceOfSatisfying(RateLimitExceededException.class,
                refused -> assertThat(refused.getBody().getType()).isEqualTo(URI.create("https://nfnn.cz/problems/operations/rate-limited")));
        assertThatNoException().isThrownBy(() -> limiter.check("198.51.100.1"));
    }

    @Test
    @DisplayName("Given two addresses of one IPv6 /64, when they report, then they share one window")
    void should_share_one_window_when_reporting_given_two_addresses_of_one_slash_64() {
        for (int report = 0; report < 30; report++) {
            limiter.check("2001:db8:1:2::" + Integer.toHexString(report + 1));
        }

        assertThatThrownBy(() -> limiter.check("2001:db8:1:2:ffff::1")).isInstanceOf(RateLimitExceededException.class);
        assertThatNoException().isThrownBy(() -> limiter.check("2001:db8:1:3::1"));
    }

    @Test
    @DisplayName("Given a full window, when 15 minutes have passed, then the address reports again")
    void should_admit_again_when_the_window_passed_given_a_full_window() {
        for (int report = 0; report < 30; report++) {
            limiter.check("203.0.113.7");
        }

        clock.advance(Duration.ofMinutes(15));

        assertThatNoException().isThrownBy(() -> limiter.check("203.0.113.7"));
    }
}
