package cz.novanadeje.app.operations.interfaces.rest;

import cz.novanadeje.app.shared.interfaces.rest.RateLimitExceededException;
import cz.novanadeje.app.support.MutableClock;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.net.URI;
import java.time.Instant;
import java.time.ZoneOffset;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatNoException;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class BackupKeyRateLimiterTest {

    private final MutableClock clock = new MutableClock(Instant.parse("2026-10-30T10:00:00Z"), ZoneOffset.UTC);
    private final BackupKeyRateLimiter limiter = new BackupKeyRateLimiter(clock);

    @Test
    @DisplayName("Given ten backup key requests from one address within the window, when the eleventh comes, then it is refused as operations/rate-limited")
    void should_refuse_the_eleventh_when_checked_given_ten_within_the_window() {
        for (int i = 0; i < 10; i++) {
            limiter.check("203.0.113.7");
        }

        assertThatThrownBy(() -> limiter.check("203.0.113.7")).isInstanceOfSatisfying(RateLimitExceededException.class,
                refused -> assertThat(refused.getBody().getType()).isEqualTo(URI.create("https://nfnn.cz/problems/operations/rate-limited")));
        assertThatNoException().isThrownBy(() -> limiter.check("198.51.100.1"));
    }

    @Test
    @DisplayName("Given an endpoint only administrators reach, when 5 000 addresses ask once, then the limiter keeps at most 1 000 of them")
    void should_keep_at_most_a_thousand_addresses_when_checked_given_an_administrator_only_endpoint() {
        for (int address = 0; address < 5_000; address++) {
            limiter.check("10.2." + (address >> 8 & 0xff) + "." + (address & 0xff));
        }

        assertThat(limiter.trackedKeys()).isBetween(900L, 1_000L);
    }
}
