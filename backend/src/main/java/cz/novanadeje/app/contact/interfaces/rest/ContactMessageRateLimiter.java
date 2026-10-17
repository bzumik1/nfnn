package cz.novanadeje.app.contact.interfaces.rest;

import cz.novanadeje.app.shared.infrastructure.ratelimit.FixedWindowRateLimiter;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Duration;

@Component
class ContactMessageRateLimiter {

    private static final int MESSAGES_PER_WINDOW = 5;
    private static final Duration WINDOW = Duration.ofHours(1);

    private final FixedWindowRateLimiter limiter;

    ContactMessageRateLimiter(Clock clock) {
        this.limiter = new FixedWindowRateLimiter(MESSAGES_PER_WINDOW, WINDOW, clock);
    }

    boolean allows(String clientAddress) {
        return limiter.tryAcquire(clientAddress);
    }
}
