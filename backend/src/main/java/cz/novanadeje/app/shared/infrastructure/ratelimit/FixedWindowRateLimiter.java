package cz.novanadeje.app.shared.infrastructure.ratelimit;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;

import java.time.Clock;
import java.time.Duration;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

public final class FixedWindowRateLimiter {

    private final int limit;
    private final Cache<String, AtomicInteger> windows;

    public FixedWindowRateLimiter(int limit, Duration window, Clock clock) {
        this.limit = limit;
        this.windows = Caffeine.newBuilder()
                .expireAfterWrite(window)
                .ticker(() -> TimeUnit.MILLISECONDS.toNanos(clock.millis()))
                .build();
    }

    public boolean tryAcquire(String key) {
        AtomicInteger counter = windows.get(key, ignored -> new AtomicInteger());
        return counter.incrementAndGet() <= limit;
    }
}
