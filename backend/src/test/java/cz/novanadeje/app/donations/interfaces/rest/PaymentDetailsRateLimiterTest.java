package cz.novanadeje.app.donations.interfaces.rest;

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

class PaymentDetailsRateLimiterTest {

    private final MutableClock clock = new MutableClock(Instant.parse("2026-10-30T10:00:00Z"), ZoneId.of("Europe/Prague"));
    private final PaymentDetailsRateLimiter limiter = new PaymentDetailsRateLimiter(clock);

    @Test
    @DisplayName("Given 120 requests from one address within 15 minutes, when the 121st comes, then it is refused as donations/rate-limited and another address is still served")
    void should_refuse_the_121st_when_checked_given_120_requests_within_fifteen_minutes() {
        for (int i = 0; i < 120; i++) {
            limiter.check("203.0.113.7");
        }
        clock.advance(Duration.ofMinutes(14));

        assertThatThrownBy(() -> limiter.check("203.0.113.7"))
                .isInstanceOfSatisfying(RateLimitExceededException.class, refused -> {
                    assertThat(refused.getStatusCode()).isEqualTo(HttpStatus.TOO_MANY_REQUESTS);
                    assertThat(refused.getBody().getType()).isEqualTo(URI.create("https://nfnn.cz/problems/donations/rate-limited"));
                });
        assertThatNoException().isThrownBy(() -> limiter.check("198.51.100.1"));
    }

    @Test
    @DisplayName("Given 120 requests from one address, when 15 minutes have passed since the first, then the address is served again")
    void should_serve_again_when_checked_given_fifteen_minutes_passed() {
        for (int i = 0; i < 120; i++) {
            limiter.check("203.0.113.7");
        }

        clock.advance(Duration.ofMinutes(15));

        assertThatNoException().isThrownBy(() -> limiter.check("203.0.113.7"));
    }
}
