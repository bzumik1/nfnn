package cz.novanadeje.app.donors.interfaces.rest;

import cz.novanadeje.app.shared.infrastructure.ratelimit.FixedWindowRateLimiter;
import cz.novanadeje.app.shared.interfaces.rest.ProblemTypes;
import cz.novanadeje.app.shared.interfaces.rest.RateLimitExceededException;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Duration;

@Component
class PasswordResetRateLimiter {

    private static final int REQUESTS_PER_WINDOW = 5;
    private static final Duration WINDOW = Duration.ofHours(1);

    private final FixedWindowRateLimiter limiter;

    PasswordResetRateLimiter(Clock clock) {
        this.limiter = new FixedWindowRateLimiter(REQUESTS_PER_WINDOW, WINDOW, clock);
    }

    void check(String clientAddress) {
        if (!limiter.tryAcquire(clientAddress)) {
            throw new RateLimitExceededException(ProblemTypes.of("donors", "rate-limited"));
        }
    }
}
