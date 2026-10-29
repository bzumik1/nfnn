package cz.novanadeje.app.donors.interfaces.rest;

import cz.novanadeje.app.shared.interfaces.rest.RateLimitExceededException;
import cz.novanadeje.app.support.MutableClock;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

import java.net.URI;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatNoException;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class CompanyLookupRateLimiterTest {

    private final MutableClock clock = new MutableClock(Instant.parse("2026-10-24T10:00:00Z"), ZoneId.of("Europe/Prague"));
    private final CompanyLookupRateLimiter limiter = new CompanyLookupRateLimiter(clock);

    @Test
    @DisplayName("Given twenty lookups from one address within 15 minutes, when the twenty-first comes, then it is refused as donors/rate-limited")
    void should_refuse_twenty_first_when_checked_given_twenty_lookups_within_window() {
        for (int i = 0; i < 20; i++) {
            limiter.check("203.0.113.7");
        }

        assertThatThrownBy(() -> limiter.check("203.0.113.7"))
                .isInstanceOfSatisfying(RateLimitExceededException.class, refused -> {
                    assertThat(refused.getStatusCode()).isEqualTo(HttpStatus.TOO_MANY_REQUESTS);
                    assertThat(refused.getBody().getType()).isEqualTo(URI.create("https://nfnn.cz/problems/donors/rate-limited"));
                });
        assertThatNoException().isThrownBy(() -> limiter.check("198.51.100.1"));
    }

    @Test
    @DisplayName("Given twenty lookups from one address, when 15 minutes have passed since the first, then the address may look up again")
    void should_allow_again_when_checked_given_window_passed() {
        for (int i = 0; i < 20; i++) {
            limiter.check("203.0.113.7");
        }

        clock.advance(Duration.ofMinutes(15));

        assertThatNoException().isThrownBy(() -> limiter.check("203.0.113.7"));
    }
}
