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

class ReportSendRateLimiterTest {

    private static final String JANA = "0190f5c1-0000-7000-8000-000000000001";
    private static final String ANDREA = "0190f5c1-0000-7000-8000-000000000002";

    private final MutableClock clock = new MutableClock(Instant.parse("2026-11-02T10:00:00Z"), ZoneOffset.UTC);
    private final ReportSendRateLimiter limiter = new ReportSendRateLimiter(clock);

    @Test
    @DisplayName("Given five reports sent by hand by one administrator within the hour, when the sixth comes, then it is refused as donations/rate-limited and another administrator still sends")
    void should_refuse_the_sixth_when_checked_given_five_within_the_hour() {
        for (int i = 0; i < 5; i++) {
            limiter.check(JANA);
        }

        assertThatThrownBy(() -> limiter.check(JANA)).isInstanceOfSatisfying(RateLimitExceededException.class,
                refused -> assertThat(refused.getBody().getType()).isEqualTo(URI.create("https://nfnn.cz/problems/donations/rate-limited")));
        assertThatNoException().isThrownBy(() -> limiter.check(ANDREA));
    }

    @Test
    @DisplayName("Given five reports sent by hand within the hour, when the hour has passed, then the next one is accepted")
    void should_accept_again_when_the_hour_has_passed_given_five_within_it() {
        for (int i = 0; i < 5; i++) {
            limiter.check(JANA);
        }

        clock.advance(Duration.ofHours(1));

        assertThatNoException().isThrownBy(() -> limiter.check(JANA));
    }
}
