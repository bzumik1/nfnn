package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.shared.infrastructure.ratelimit.ClientAddressKey;
import cz.novanadeje.app.shared.infrastructure.ratelimit.FixedWindowRateLimiter;
import cz.novanadeje.app.shared.infrastructure.ratelimit.SubjectKey;
import cz.novanadeje.app.shared.interfaces.rest.ProblemTypes;
import cz.novanadeje.app.shared.interfaces.rest.RateLimitExceededException;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Duration;

@Component
class HistoryImportRateLimiter {

    static final int REQUESTS_PER_WINDOW = 10;
    static final int SITE_WIDE_REQUESTS_PER_WINDOW = 20;
    static final Duration WINDOW = Duration.ofHours(1);

    private static final SubjectKey SITE = new SubjectKey("site");

    private final FixedWindowRateLimiter limiter;
    private final FixedWindowRateLimiter siteWide;

    HistoryImportRateLimiter(Clock clock) {
        this.limiter = new FixedWindowRateLimiter(REQUESTS_PER_WINDOW, WINDOW, FixedWindowRateLimiter.ADMINISTRATOR_ONLY_MAXIMUM_TRACKED_KEYS, clock);
        this.siteWide = new FixedWindowRateLimiter(SITE_WIDE_REQUESTS_PER_WINDOW, WINDOW, 1, clock);
    }

    void check(String clientAddress) {
        if (!limiter.tryAcquire(new ClientAddressKey(clientAddress)) || !siteWide.tryAcquire(SITE)) {
            throw new RateLimitExceededException(ProblemTypes.of("donations", "rate-limited"));
        }
    }
}
