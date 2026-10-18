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

class SignInRateLimiterTest {

    private final MutableClock clock = new MutableClock(Instant.parse("2026-10-18T10:00:00Z"), ZoneId.of("Europe/Prague"));
    private final SignInRateLimiter limiter = new SignInRateLimiter(clock);

    @Test
    @DisplayName("Given ten sign-ins from one address within 15 minutes, when an eleventh comes, then it is refused as donors/rate-limited")
    void should_refuse_eleventh_when_checked_given_ten_sign_ins_within_fifteen_minutes() {
        for (int i = 0; i < 10; i++) {
            limiter.check("203.0.113.7");
            clock.advance(Duration.ofMinutes(1));
        }

        assertThatThrownBy(() -> limiter.check("203.0.113.7"))
                .isInstanceOfSatisfying(RateLimitExceededException.class, refused -> {
                    assertThat(refused.getStatusCode()).isEqualTo(HttpStatus.TOO_MANY_REQUESTS);
                    assertThat(refused.getBody().getType()).isEqualTo(URI.create("https://nfnn.cz/problems/donors/rate-limited"));
                });
        assertThatNoException().isThrownBy(() -> limiter.check("198.51.100.1"));
    }

    @Test
    @DisplayName("Given ten sign-ins from one address, when 15 minutes have passed since the first, then the address may sign in again")
    void should_allow_again_when_checked_given_fifteen_minutes_passed() {
        for (int i = 0; i < 10; i++) {
            limiter.check("203.0.113.7");
        }

        clock.advance(Duration.ofMinutes(14));
        assertThatThrownBy(() -> limiter.check("203.0.113.7")).isInstanceOf(RateLimitExceededException.class);

        clock.advance(Duration.ofMinutes(1));
        assertThatNoException().isThrownBy(() -> limiter.check("203.0.113.7"));
    }
}
