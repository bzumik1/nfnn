package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.shared.infrastructure.ratelimit.FixedWindowRateLimiter;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Duration;

@Component
class PaymentDetailsRateLimiter {

    private final FixedWindowRateLimiter limiter;

    PaymentDetailsRateLimiter(Clock clock) {
        this.limiter = new FixedWindowRateLimiter(Integer.MAX_VALUE, Duration.ofMinutes(15), clock);
    }

    void check(String clientAddress) {
    }
}
