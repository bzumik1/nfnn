package cz.novanadeje.app.operations.application.clienterrors;

import cz.novanadeje.app.operations.application.loggers.ResetTimer;
import cz.novanadeje.app.operations.domain.clienterrors.ClientErrorBucket;
import cz.novanadeje.app.operations.domain.clienterrors.ClientErrorKind;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.EnumMap;
import java.util.Map;

@Component
public class ClientErrorCap {

    public static final Duration WINDOW = Duration.ofHours(1);
    private static final Logger log = LoggerFactory.getLogger(ClientErrorReportService.LOGGER);

    private final Clock clock;
    private final ResetTimer timer;
    private final Map<ClientErrorBucket, Window> windows = new EnumMap<>(ClientErrorBucket.class);

    public ClientErrorCap(Clock clock, ResetTimer timer) {
        this.clock = clock;
        this.timer = timer;
    }

    public synchronized boolean admits(ClientErrorKind kind) {
        ClientErrorBucket bucket = ClientErrorBucket.of(kind);
        Window window = currentWindow(bucket, clock.instant());
        if (window.admitted < bucket.perHour()) {
            window.admitted++;
            return true;
        }
        if (window.dropped++ == 0) {
            timer.at(window.end, () -> warnOfDropped(bucket, window));
        }
        return false;
    }

    private Window currentWindow(ClientErrorBucket bucket, Instant now) {
        Window window = windows.get(bucket);
        if (window == null || !now.isBefore(window.end)) {
            window = new Window(now.plus(WINDOW));
            windows.put(bucket, window);
        }
        return window;
    }

    private synchronized void warnOfDropped(ClientErrorBucket bucket, Window window) {
        if (window.dropped == 0) {
            return;
        }
        log.warn("Browser error reports over the hourly cap bucket={} dropped={}", bucket.wire(), window.dropped);
    }

    private static final class Window {

        private final Instant end;
        private int admitted;
        private int dropped;

        private Window(Instant end) {
            this.end = end;
        }
    }
}
