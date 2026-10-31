package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.shared.infrastructure.ratelimit.ClientAddressKey;
import cz.novanadeje.app.shared.infrastructure.ratelimit.FixedWindowRateLimiter;
import cz.novanadeje.app.shared.interfaces.rest.ProblemTypes;
import cz.novanadeje.app.shared.interfaces.rest.RateLimitExceededException;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Duration;

@Component
class ReceiptSigningKeyWithdrawalRateLimiter {

    private static final int REQUESTS_PER_WINDOW = 10;
    private static final Duration WINDOW = Duration.ofMinutes(15);

    private final FixedWindowRateLimiter limiter;

    ReceiptSigningKeyWithdrawalRateLimiter(Clock clock) {
        this.limiter = new FixedWindowRateLimiter(REQUESTS_PER_WINDOW, WINDOW, FixedWindowRateLimiter.ADMINISTRATOR_ONLY_MAXIMUM_TRACKED_KEYS, clock);
    }

    void check(String clientAddress) {
        if (!limiter.tryAcquire(new ClientAddressKey(clientAddress))) {
            throw new RateLimitExceededException(ProblemTypes.of("donations", "rate-limited"));
        }
    }
}
