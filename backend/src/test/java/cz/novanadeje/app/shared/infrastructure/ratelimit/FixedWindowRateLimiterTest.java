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
        assertThat(limiter.tryAcquire(key("10.0.0.1"))).isTrue();
        assertThat(limiter.tryAcquire(key("10.0.0.1"))).isTrue();
        assertThat(limiter.tryAcquire(key("10.0.0.1"))).isFalse();
    }

    @Test
    @DisplayName("Given two keys, when each is acquired, then the limiter counts them separately")
    void should_count_keys_separately_when_acquired_given_two_keys() {
        limiter.tryAcquire(key("10.0.0.1"));
        limiter.tryAcquire(key("10.0.0.1"));

        assertThat(limiter.tryAcquire(key("10.0.0.2"))).isTrue();
    }

    @Test
    @DisplayName("Given a window that has passed, when the key is acquired, then the limiter allows it again")
    void should_allow_again_when_acquired_given_window_has_passed() {
        limiter.tryAcquire(key("10.0.0.1"));
        limiter.tryAcquire(key("10.0.0.1"));
        clock.advance(Duration.ofHours(1).plusSeconds(1));

        assertThat(limiter.tryAcquire(key("10.0.0.1"))).isTrue();
    }

    @Test
    @DisplayName("Given two addresses of one IPv6 /64 used up the limit, when a third address of that /64 asks, then it is refused")
    void should_refuse_when_acquired_given_limit_used_up_within_one_slash_64() {
        limiter.tryAcquire(key("2001:db8:1:2::a"));
        limiter.tryAcquire(key("2001:db8:1:2::b"));

        assertThat(limiter.tryAcquire(key("[2001:db8:1:2:ffff::c]"))).isFalse();
        assertThat(limiter.tryAcquire(key("2001:db8:1:3::a"))).isTrue();
    }

    @Test
    @DisplayName("Given an IPv4 address used up the limit, when it asks again as an IPv4-mapped address, then it is refused")
    void should_refuse_when_acquired_given_limit_used_up_by_same_ipv4_address() {
        limiter.tryAcquire(key("203.0.113.7"));
        limiter.tryAcquire(key("203.0.113.7"));

        assertThat(limiter.tryAcquire(key("[::ffff:203.0.113.7]"))).isFalse();
        assertThat(limiter.tryAcquire(key("::ffff:203.0.113.8"))).isTrue();
    }

    @Test
    @DisplayName("Given more addresses than the limiter tracks, when each asks once, then it keeps at most 50 000 of them")
    void should_keep_at_most_fifty_thousand_keys_when_acquired_given_more_addresses() {
        for (int address = 0; address < 60_000; address++) {
            limiter.tryAcquire(key("10." + (address >> 16 & 0xff) + "." + (address >> 8 & 0xff) + "." + (address & 0xff)));
        }

        assertThat(limiter.trackedKeys()).isPositive().isLessThanOrEqualTo(50_000);
    }

    private static ClientAddressKey key(String clientAddress) {
        return new ClientAddressKey(clientAddress);
    }
}
