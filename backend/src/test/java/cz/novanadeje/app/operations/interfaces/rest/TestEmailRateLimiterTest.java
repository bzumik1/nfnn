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

class TestEmailRateLimiterTest {

    private final MutableClock clock = new MutableClock(Instant.parse("2026-10-30T10:00:00Z"), ZoneOffset.UTC);
    private final TestEmailRateLimiter limiter = new TestEmailRateLimiter(clock);

    @Test
    @DisplayName("Given ten test e-mails from one address within the window, when the eleventh comes, then it is refused as operations/rate-limited")
    void should_refuse_the_eleventh_when_checked_given_ten_within_the_window() {
        for (int i = 0; i < 10; i++) {
            limiter.check("203.0.113.7");
        }

        assertThatThrownBy(() -> limiter.check("203.0.113.7")).isInstanceOfSatisfying(RateLimitExceededException.class,
                refused -> assertThat(refused.getBody().getType()).isEqualTo(URI.create("https://nfnn.cz/problems/operations/rate-limited")));
        assertThatNoException().isThrownBy(() -> limiter.check("198.51.100.1"));
    }

    @Test
    @DisplayName("Given the public setup test e-mail also reaches it before any access check, when 5 000 addresses ask once, then the limiter keeps all of them")
    void should_keep_every_address_of_a_flood_when_checked_given_the_public_setup_reaches_it() {
        for (int address = 0; address < 5_000; address++) {
            limiter.check("10.2." + (address >> 8 & 0xff) + "." + (address & 0xff));
        }

        assertThat(limiter.trackedKeys()).isEqualTo(5_000L);
    }
}
