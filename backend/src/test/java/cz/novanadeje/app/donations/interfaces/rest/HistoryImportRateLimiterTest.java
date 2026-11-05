package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.shared.interfaces.rest.RateLimitExceededException;
import cz.novanadeje.app.support.MutableClock;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.net.URI;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatNoException;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class HistoryImportRateLimiterTest {

    private final MutableClock clock = new MutableClock(Instant.parse("2026-11-05T10:00:00Z"), ZoneId.of("Europe/Prague"));
    private final HistoryImportRateLimiter limiter = new HistoryImportRateLimiter(clock);

    @Test
    @DisplayName("Given 10 requests from one address within an hour, when the 11th comes, then it is refused and another address is still served")
    void should_refuse_the_11th_when_checked_given_10_requests_from_one_address() {
        for (int i = 0; i < 10; i++) {
            limiter.check("203.0.113.7");
        }
        clock.advance(Duration.ofMinutes(59));

        assertThatThrownBy(() -> limiter.check("203.0.113.7")).isInstanceOfSatisfying(RateLimitExceededException.class,
                refused -> assertThat(refused.getBody().getType()).isEqualTo(URI.create("https://nfnn.cz/problems/donations/rate-limited")));
        assertThatNoException().isThrownBy(() -> limiter.check("198.51.100.1"));
    }

    @Test
    @DisplayName("Given 20 requests from many addresses within an hour, when the 21st comes from a new address, then the site-wide cap refuses it, so the hourly import keeps its turn at the bank")
    void should_refuse_the_21st_from_new_address_when_checked_given_20_requests_site_wide() {
        for (int i = 0; i < 20; i++) {
            limiter.check("203.0.113." + i);
        }

        assertThatThrownBy(() -> limiter.check("198.51.100.1")).isInstanceOf(RateLimitExceededException.class);
        clock.advance(Duration.ofHours(1));
        assertThatNoException().isThrownBy(() -> limiter.check("198.51.100.1"));
    }

    @Test
    @DisplayName("Given one address refused after its 10 requests, when it keeps asking, then its refused requests leave the site-wide cap to the other addresses")
    void should_not_spend_site_wide_cap_when_refused_given_address_over_its_limit() {
        for (int i = 0; i < 30; i++) {
            try {
                limiter.check("203.0.113.7");
            } catch (RateLimitExceededException expected) {
                assertThat(i).isGreaterThanOrEqualTo(10);
            }
        }

        for (int i = 0; i < 10; i++) {
            limiter.check("198.51.100." + i);
        }
    }
}
