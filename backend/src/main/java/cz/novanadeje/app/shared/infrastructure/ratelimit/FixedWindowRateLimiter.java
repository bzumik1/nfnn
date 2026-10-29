package cz.novanadeje.app.shared.infrastructure.ratelimit;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

public final class FixedWindowRateLimiter {

    private static final Logger log = LoggerFactory.getLogger(FixedWindowRateLimiter.class);
    private static final int MAXIMUM_TRACKED_KEYS = 50_000;
    private static final Duration WARNING_INTERVAL = Duration.ofMinutes(1);

    private final int limit;
    private final Duration window;
    private final Clock clock;
    private final Cache<ClientAddressKey, AtomicInteger> windows;
    private final AtomicReference<Instant> nextWarning = new AtomicReference<>(Instant.MIN);

    public FixedWindowRateLimiter(int limit, Duration window, Clock clock) {
        this.limit = limit;
        this.window = window;
        this.clock = clock;
        this.windows = Caffeine.newBuilder()
                .maximumSize(MAXIMUM_TRACKED_KEYS)
                .expireAfterWrite(window)
                .ticker(() -> TimeUnit.MILLISECONDS.toNanos(clock.millis()))
                .build();
    }

    public boolean tryAcquire(ClientAddressKey key) {
        if (!key.isAddress()) {
            warnOfMissingAddress();
        }
        AtomicInteger counter = windows.get(key, ignored -> new AtomicInteger());
        return counter.incrementAndGet() <= limit;
    }

    private void warnOfMissingAddress() {
        Instant now = clock.instant();
        Instant due = nextWarning.get();
        if (!now.isBefore(due) && nextWarning.compareAndSet(due, now.plus(WARNING_INTERVAL))) {
            log.warn("Rate limit counted a request without a client address in its shared bucket (limit {} per {})", limit, window);
        }
    }

    long trackedKeys() {
        windows.cleanUp();
        return windows.estimatedSize();
    }
}
