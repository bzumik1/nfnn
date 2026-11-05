package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.shared.infrastructure.ratelimit.FixedWindowRateLimiter;
import cz.novanadeje.app.shared.infrastructure.ratelimit.SubjectKey;
import cz.novanadeje.app.shared.interfaces.rest.ProblemTypes;
import cz.novanadeje.app.shared.interfaces.rest.RateLimitExceededException;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Duration;

@Component
class AdminDonationsSyncRateLimiter {

    static final int REQUESTS_PER_WINDOW = 60;
    private static final Duration WINDOW = Duration.ofMinutes(15);

    private final FixedWindowRateLimiter limiter;

    AdminDonationsSyncRateLimiter(Clock clock) {
        this.limiter = new FixedWindowRateLimiter(REQUESTS_PER_WINDOW, WINDOW, FixedWindowRateLimiter.ADMINISTRATOR_ONLY_MAXIMUM_TRACKED_KEYS, clock);
    }

    void check(String administrator) {
        if (!limiter.tryAcquire(new SubjectKey(administrator))) {
            throw new RateLimitExceededException(ProblemTypes.of("donations", "rate-limited"));
        }
    }
}
