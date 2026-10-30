package cz.novanadeje.app.operations.interfaces.rest;

import cz.novanadeje.app.shared.infrastructure.ratelimit.ClientAddressKey;
import cz.novanadeje.app.shared.infrastructure.ratelimit.FixedWindowRateLimiter;
import cz.novanadeje.app.shared.interfaces.rest.ProblemTypes;
import cz.novanadeje.app.shared.interfaces.rest.RateLimitExceededException;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Duration;

@Component
class TestEmailRateLimiter {

    private static final int REQUESTS_PER_WINDOW = 10;
    private static final Duration WINDOW = Duration.ofHours(1);

    private final FixedWindowRateLimiter limiter;

    TestEmailRateLimiter(Clock clock) {
        this.limiter = new FixedWindowRateLimiter(REQUESTS_PER_WINDOW, WINDOW, clock);
    }

    void check(String clientAddress) {
        if (!limiter.tryAcquire(new ClientAddressKey(clientAddress))) {
            throw new RateLimitExceededException(ProblemTypes.of("operations", "rate-limited"));
        }
    }

    long trackedKeys() {
        return limiter.trackedKeys();
    }
}
