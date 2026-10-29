package cz.novanadeje.app.shared.infrastructure.ratelimit;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;

import java.time.Clock;
import java.time.Duration;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

public final class FixedWindowRateLimiter {

    private static final int MAXIMUM_TRACKED_KEYS = 50_000;

    private final int limit;
    private final Cache<ClientAddressKey, AtomicInteger> windows;

    public FixedWindowRateLimiter(int limit, Duration window, Clock clock) {
        this.limit = limit;
        this.windows = Caffeine.newBuilder()
                .maximumSize(MAXIMUM_TRACKED_KEYS)
                .expireAfterWrite(window)
                .ticker(() -> TimeUnit.MILLISECONDS.toNanos(clock.millis()))
                .build();
    }

    public boolean tryAcquire(ClientAddressKey key) {
        AtomicInteger counter = windows.get(key, ignored -> new AtomicInteger());
        return counter.incrementAndGet() <= limit;
    }

    long trackedKeys() {
        windows.cleanUp();
        return windows.estimatedSize();
    }
}
