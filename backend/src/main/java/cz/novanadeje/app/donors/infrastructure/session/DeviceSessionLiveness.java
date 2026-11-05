package cz.novanadeje.app.donors.infrastructure.session;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import cz.novanadeje.app.donors.domain.DeviceId;
import cz.novanadeje.app.donors.domain.DonorDeviceRepository;
import cz.novanadeje.app.shared.application.event.DeviceSignedOut;
import cz.novanadeje.app.shared.application.session.SessionLiveness;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import java.time.Clock;
import java.time.Duration;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

@Component
class DeviceSessionLiveness implements SessionLiveness {

    static final Duration CACHE_WINDOW = Duration.ofSeconds(30);
    private static final int MAXIMUM_CACHED_SESSIONS = 10_000;

    private final DonorDeviceRepository devices;
    private final Clock clock;
    private final Cache<UUID, Boolean> answers;

    DeviceSessionLiveness(DonorDeviceRepository devices, Clock clock) {
        this.devices = devices;
        this.clock = clock;
        this.answers = Caffeine.newBuilder()
                .expireAfterWrite(CACHE_WINDOW)
                .maximumSize(MAXIMUM_CACHED_SESSIONS)
                .ticker(() -> TimeUnit.MILLISECONDS.toNanos(clock.millis()))
                .build();
    }

    @Override
    public boolean isLive(UUID sessionId) {
        return answers.get(sessionId, id -> devices.isSignedIn(new DeviceId(id), clock.instant()));
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
    void forget(DeviceSignedOut signedOut) {
        answers.invalidate(signedOut.deviceId());
    }
}
