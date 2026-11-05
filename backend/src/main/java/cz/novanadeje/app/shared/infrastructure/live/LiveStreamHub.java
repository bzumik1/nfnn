package cz.novanadeje.app.shared.infrastructure.live;

import cz.novanadeje.app.shared.application.event.DeviceSignedOut;
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
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.ScheduledThreadPoolExecutor;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Function;
import java.util.function.Supplier;

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
    private final Supplier<ScheduledExecutorService> schedulers;
    private ScheduledExecutorService executor;
    private final List<LiveStream> streams = new ArrayList<>();
    private final Map<UUID, Instant> sessionsEnded = new HashMap<>();
    private final Map<UUID, Instant> devicesSignedOut = new HashMap<>();
    private long opened;
    private volatile boolean running;

    @Autowired
    LiveStreamHub(LiveProperties properties, JwtProperties jwt, BuildProperties build, Clock clock) {
        this(properties, jwt.accessTokenTtl().plus(TOKEN_SKEW), build.revision(), clock, LiveStreamHub::scheduler);
    }

    LiveStreamHub(LiveProperties properties, Duration sessionEndMemory, String revision, Clock clock, Supplier<ScheduledExecutorService> schedulers) {
        this.properties = properties;
        this.sessionEndMemory = sessionEndMemory;
        this.revision = revision;
        this.clock = clock;
        this.schedulers = schedulers;
    }

    public <C extends LiveConnection> LiveOpening<C> open(LiveSubscriber subscriber, Function<Duration, C> connections) {
        Instant now = clock.instant();
        Duration lifetime = Duration.between(now, subscriber.expiresAt());
        List<LiveStream> evicted = new ArrayList<>();
        LiveStream stream;
        C connection;
        ScheduledExecutorService scheduler;
        synchronized (this) {
            if (!running) {
                return new LiveOpening.Unavailable<>();
            }
            scheduler = executor;
            if (lifetime.isNegative() || lifetime.isZero() || endedBefore(subscriber, now)) {
                return new LiveOpening.SessionEnded<>();
            }
            List<LiveStream> ofDonor = streams.stream().filter(each -> each.subscriber.donor().equals(subscriber.donor()))
                    .sorted(Comparator.comparingLong(each -> each.sequence)).toList();
            int surplus = ofDonor.size() - properties.streamsPerDonor() + 1;
            int limit = subscriber.administrator() ? properties.streams() : properties.streamsForDonors();
            if (streams.size() - Math.max(0, surplus) >= limit) {
                return new LiveOpening.Full<>();
            }
            for (int index = 0; index < surplus; index++) {
                LiveStream oldest = ofDonor.get(index);
                streams.remove(oldest);
                evicted.add(oldest);
            }
            connection = connections.apply(lifetime.plus(TIMEOUT_MARGIN));
            stream = new LiveStream(++opened, subscriber, connection);
            streams.add(stream);
        }
        evicted.forEach(LiveStream::close);
        LiveStream opening = stream;
        connection.onEnd(() -> forget(opening));
        try {
            stream.expiry = scheduler.schedule(stream::close, lifetime.toMillis(), TimeUnit.MILLISECONDS);
            long heartbeat = properties.heartbeat().toMillis();
            stream.heartbeat = scheduler.scheduleAtFixedRate(stream::heartbeat, heartbeat, heartbeat, TimeUnit.MILLISECONDS);
        } catch (RejectedExecutionException stopping) {
            stream.close();
            return new LiveOpening.Unavailable<>();
        }
        stream.send(REVISION_EVENT, Map.of("revision", revision));
        stream.revisionSent();
        return new LiveOpening.Opened<>(connection);
    }

    public void publish(StoredDataChanged change) {
        List<LiveStream> due = new ArrayList<>();
        synchronized (this) {
            for (LiveStream stream : streams) {
                if (stream.wants(change) && stream.pending.add(change.feed()) && !stream.flushQueued) {
                    stream.flushQueued = true;
                    due.add(stream);
                }
            }
        }
        due.forEach(this::flushLater);
    }

    private void flushLater(LiveStream stream) {
        ScheduledExecutorService scheduler;
        synchronized (this) {
            scheduler = executor;
        }
        try {
            scheduler.execute(stream::flush);
        } catch (RejectedExecutionException stopping) {
            stream.close();
        }
    }

    public void endSessions(DonorSessionsEnded ended) {
        Instant cutoff = ended.endedAt().truncatedTo(ChronoUnit.SECONDS);
        List<LiveStream> closing;
        synchronized (this) {
            Instant now = clock.instant();
            sessionsEnded.values().removeIf(at -> at.plus(sessionEndMemory).isBefore(now));
            sessionsEnded.merge(ended.donorId(), cutoff, (earlier, later) -> earlier.isAfter(later) ? earlier : later);
            closing = streams.stream()
                    .filter(stream -> stream.subscriber.donor().equals(ended.donorId()) && stream.subscriber.issuedAt().isBefore(cutoff))
                    .toList();
            streams.removeAll(closing);
        }
        closing.forEach(LiveStream::close);
    }

    public void endDevice(DeviceSignedOut signedOut) {
        List<LiveStream> closing;
        synchronized (this) {
            Instant now = clock.instant();
            devicesSignedOut.values().removeIf(at -> at.plus(sessionEndMemory).isBefore(now));
            devicesSignedOut.put(signedOut.deviceId(), signedOut.at());
            closing = streams.stream()
                    .filter(stream -> stream.subscriber.donor().equals(signedOut.donorId())
                            && stream.subscriber.session().filter(signedOut.deviceId()::equals).isPresent())
                    .toList();
            streams.removeAll(closing);
        }
        closing.forEach(LiveStream::close);
    }

    synchronized int openStreams() {
        return streams.size();
    }

    @Override
    public synchronized void start() {
        executor = schedulers.get();
        running = true;
    }

    @Override
    public void stop() {
        List<LiveStream> closing;
        ScheduledExecutorService stopping;
        synchronized (this) {
            running = false;
            closing = List.copyOf(streams);
            streams.clear();
            stopping = executor;
        }
        closing.forEach(LiveStream::close);
        if (stopping != null) {
            stopping.shutdownNow();
        }
    }

    @Override
    public boolean isRunning() {
        return running;
    }

    private boolean endedBefore(LiveSubscriber subscriber, Instant now) {
        Instant cutoff = sessionsEnded.get(subscriber.donor());
        return cutoff != null && !cutoff.plus(sessionEndMemory).isBefore(now) && subscriber.issuedAt().isBefore(cutoff)
                || subscriber.session().map(devicesSignedOut::get).filter(at -> !at.plus(sessionEndMemory).isBefore(now)).isPresent();
    }

    private synchronized void forget(LiveStream stream) {
        streams.remove(stream);
        stream.cancelTimers();
    }

    static ScheduledThreadPoolExecutor scheduler() {
        ScheduledThreadPoolExecutor scheduler = new ScheduledThreadPoolExecutor(THREADS, hubThreads());
        scheduler.setRemoveOnCancelPolicy(true);
        return scheduler;
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
        private boolean flushQueued = true;
        private volatile ScheduledFuture<?> expiry;
        private volatile ScheduledFuture<?> heartbeat;

        private LiveStream(long sequence, LiveSubscriber subscriber, LiveConnection connection) {
            this.sequence = sequence;
            this.subscriber = subscriber;
            this.connection = connection;
        }

        private boolean wants(StoredDataChanged change) {
            return switch (change.feed().audience()) {
                case DONOR -> change.donor().filter(subscriber.donor()::equals).isPresent();
                case EVERYONE -> true;
                case ADMINISTRATION -> subscriber.administrator();
            };
        }

        private void revisionSent() {
            boolean due;
            synchronized (LiveStreamHub.this) {
                due = !pending.isEmpty();
                flushQueued = due;
            }
            if (due) {
                flushLater(this);
            }
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
