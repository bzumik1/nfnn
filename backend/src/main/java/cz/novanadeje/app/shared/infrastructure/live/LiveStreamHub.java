package cz.novanadeje.app.shared.infrastructure.live;

import cz.novanadeje.app.shared.application.event.DonorSessionsEnded;
import cz.novanadeje.app.shared.application.event.LiveFeed;
import cz.novanadeje.app.shared.application.event.StoredDataChanged;
import cz.novanadeje.app.shared.infrastructure.config.BuildProperties;
import cz.novanadeje.app.shared.infrastructure.security.JwtProperties;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.SmartLifecycle;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Function;

@Component
public class LiveStreamHub implements SmartLifecycle {

    static final String REVISION_EVENT = "revision";
    static final String CHANGED_EVENT = "changed";
    static final Duration TIMEOUT_MARGIN = Duration.ofSeconds(5);
    private static final int THREADS = 2;
    private static final Duration TOKEN_SKEW = Duration.ofMinutes(1);

    private final LiveProperties properties;
    private final Duration sessionEndMemory;
    private final String revision;
    private final Clock clock;
    private final ScheduledExecutorService executor;
    private final List<LiveStream> streams = new ArrayList<>();
    private final Map<UUID, Instant> sessionsEnded = new HashMap<>();
    private long opened;
    private volatile boolean running;

    @Autowired
    LiveStreamHub(LiveProperties properties, JwtProperties jwt, BuildProperties build, Clock clock) {
        this(properties, jwt.accessTokenTtl().plus(TOKEN_SKEW), build.revision(), clock, Executors.newScheduledThreadPool(THREADS, hubThreads()));
    }

    LiveStreamHub(LiveProperties properties, Duration sessionEndMemory, String revision, Clock clock, ScheduledExecutorService executor) {
        this.properties = properties;
        this.sessionEndMemory = sessionEndMemory;
        this.revision = revision;
        this.clock = clock;
        this.executor = executor;
    }

    public <C extends LiveConnection> LiveOpening<C> open(LiveSubscriber subscriber, Function<Duration, C> connections) {
        return new LiveOpening.Full<>();
    }

    public void publish(StoredDataChanged change) {
    }

    public void endSessions(DonorSessionsEnded ended) {
    }

    synchronized int openStreams() {
        return streams.size();
    }

    @Override
    public void start() {
        running = true;
    }

    @Override
    public void stop() {
        List<LiveStream> closing;
        synchronized (this) {
            running = false;
            closing = List.copyOf(streams);
            streams.clear();
        }
        closing.forEach(LiveStream::close);
        executor.shutdownNow();
    }

    @Override
    public boolean isRunning() {
        return running;
    }

    private boolean endedBefore(LiveSubscriber subscriber, Instant now) {
        Instant cutoff = sessionsEnded.get(subscriber.donor());
        return cutoff != null && !cutoff.plus(sessionEndMemory).isBefore(now) && subscriber.issuedAt().isBefore(cutoff);
    }

    private synchronized void forget(LiveStream stream) {
        streams.remove(stream);
        stream.cancelTimers();
    }

    private static ThreadFactory hubThreads() {
        AtomicInteger number = new AtomicInteger();
        return work -> {
            Thread thread = new Thread(work, "live-hub-" + number.incrementAndGet());
            thread.setDaemon(true);
            return thread;
        };
    }

    private final class LiveStream {

        private final long sequence;
        private final LiveSubscriber subscriber;
        private final LiveConnection connection;
        private final Set<LiveFeed> pending = EnumSet.noneOf(LiveFeed.class);
        private boolean flushQueued;
        private volatile ScheduledFuture<?> expiry;
        private volatile ScheduledFuture<?> heartbeat;

        private LiveStream(long sequence, LiveSubscriber subscriber, LiveConnection connection) {
            this.sequence = sequence;
            this.subscriber = subscriber;
            this.connection = connection;
        }

        private boolean wants(StoredDataChanged change) {
            return switch (change.feed().audience()) {
                case DONOR -> subscriber.administrator() || change.donor().filter(subscriber.donor()::equals).isPresent();
                case EVERYONE -> true;
                case ADMINISTRATION -> subscriber.administrator();
            };
        }

        private void flush() {
            List<LiveFeed> feeds;
            synchronized (LiveStreamHub.this) {
                feeds = List.copyOf(pending);
                pending.clear();
                flushQueued = false;
            }
            feeds.forEach(feed -> send(CHANGED_EVENT, Map.of("feed", feed.wireName())));
        }

        private void send(String event, Map<String, String> data) {
            try {
                connection.send(event, data);
            } catch (IOException | RuntimeException gone) {
                close();
            }
        }

        private void heartbeat() {
            try {
                connection.heartbeat();
            } catch (IOException | RuntimeException gone) {
                close();
            }
        }

        private void close() {
            forget(this);
            try {
                connection.close();
            } catch (RuntimeException alreadyEnded) {
                cancelTimers();
            }
        }

        private void cancelTimers() {
            ScheduledFuture<?> ending = expiry;
            if (ending != null) {
                ending.cancel(false);
            }
            ScheduledFuture<?> beating = heartbeat;
            if (beating != null) {
                beating.cancel(false);
            }
        }
    }
}
