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

class PasswordResetRateLimiterTest {

    private final MutableClock clock = new MutableClock(Instant.parse("2026-10-18T10:00:00Z"), ZoneId.of("Europe/Prague"));
    private final PasswordResetRateLimiter limiter = new PasswordResetRateLimiter(clock);

    @Test
    @DisplayName("Given five requests from one address within the hour, when a sixth comes, then it is refused as donors/rate-limited")
    void should_refuse_sixth_when_checked_given_five_requests_within_hour() {
        for (int i = 0; i < 5; i++) {
            limiter.check("203.0.113.7");
        }

        assertThatThrownBy(() -> limiter.check("203.0.113.7"))
                .isInstanceOfSatisfying(RateLimitExceededException.class, refused -> {
                    assertThat(refused.getStatusCode()).isEqualTo(HttpStatus.TOO_MANY_REQUESTS);
                    assertThat(refused.getBody().getType()).isEqualTo(URI.create("https://novanadeje.cz/problems/donors/rate-limited"));
                });
        assertThatNoException().isThrownBy(() -> limiter.check("198.51.100.1"));
    }

    @Test
    @DisplayName("Given five requests from one address, when the hour has passed, then the address may ask again")
    void should_allow_again_when_checked_given_hour_passed() {
        for (int i = 0; i < 5; i++) {
            limiter.check("203.0.113.7");
        }

        clock.advance(Duration.ofMinutes(61));

        assertThatNoException().isThrownBy(() -> limiter.check("203.0.113.7"));
    }
}
