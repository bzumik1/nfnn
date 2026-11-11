package cz.novanadeje.app.donations.interfaces.rest;

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

class BankLogoFetchRateLimiterTest {

    private static final String JANA = "0190f5c1-0000-7000-8000-000000000001";
    private static final String ANDREA = "0190f5c1-0000-7000-8000-000000000002";

    private final MutableClock clock = new MutableClock(Instant.parse("2026-11-11T10:00:00Z"), ZoneOffset.UTC);
    private final BankLogoFetchRateLimiter limiter = new BankLogoFetchRateLimiter(clock);

    @Test
    @DisplayName("Given 20 logo downloads by one administrator within the hour, when the 21st comes, then it is refused as donations/rate-limited and another administrator still downloads")
    void should_refuse_the_twenty_first_when_checked_given_twenty_within_the_hour() {
        for (int i = 0; i < 20; i++) {
            limiter.check(JANA);
        }

        assertThatThrownBy(() -> limiter.check(JANA)).isInstanceOfSatisfying(RateLimitExceededException.class,
                refused -> assertThat(refused.getBody().getType()).isEqualTo(URI.create("https://nfnn.cz/problems/donations/rate-limited")));
        assertThatNoException().isThrownBy(() -> limiter.check(ANDREA));
    }

    @Test
    @DisplayName("Given 20 logo downloads within the hour, when the hour has passed, then the next one is accepted")
    void should_accept_again_when_the_hour_has_passed_given_twenty_within_it() {
        for (int i = 0; i < 20; i++) {
            limiter.check(JANA);
        }

        clock.advance(Duration.ofHours(1));

        assertThatNoException().isThrownBy(() -> limiter.check(JANA));
    }
}
