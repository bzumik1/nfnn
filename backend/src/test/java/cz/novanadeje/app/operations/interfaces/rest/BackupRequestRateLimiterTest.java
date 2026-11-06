package cz.novanadeje.app.operations.interfaces.rest;

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

class BackupRequestRateLimiterTest {

    private static final String JANA = "0190f5c1-0000-7000-8000-000000000001";
    private static final String ANDREA = "0190f5c1-0000-7000-8000-000000000002";

    private final MutableClock clock = new MutableClock(Instant.parse("2026-10-23T10:00:00Z"), ZoneOffset.UTC);
    private final BackupRequestRateLimiter limiter = new BackupRequestRateLimiter(clock);

    @Test
    @DisplayName("Given ten backup requests of one administrator within the day, when the eleventh comes, then it is refused as operations/rate-limited and another administrator still asks")
    void should_refuse_the_eleventh_when_checked_given_ten_within_the_day() {
        for (int i = 0; i < 10; i++) {
            limiter.check(JANA);
        }

        assertThatThrownBy(() -> limiter.check(JANA)).isInstanceOfSatisfying(RateLimitExceededException.class,
                refused -> assertThat(refused.getBody().getType()).isEqualTo(URI.create("https://nfnn.cz/problems/operations/rate-limited")));
        assertThatNoException().isThrownBy(() -> limiter.check(ANDREA));
    }

    @Test
    @DisplayName("Given ten backup requests within the day, when the day has passed, then the next one is accepted")
    void should_accept_again_when_the_day_has_passed_given_ten_within_it() {
        for (int i = 0; i < 10; i++) {
            limiter.check(JANA);
        }

        clock.advance(Duration.ofDays(1));

        assertThatNoException().isThrownBy(() -> limiter.check(JANA));
    }
}
