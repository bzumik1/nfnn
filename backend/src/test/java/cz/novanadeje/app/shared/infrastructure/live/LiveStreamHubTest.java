package cz.novanadeje.app.shared.infrastructure.live;

import cz.novanadeje.app.shared.application.event.DonorSessionsEnded;
import cz.novanadeje.app.shared.application.event.LiveFeed;
import cz.novanadeje.app.shared.application.event.StoredDataChanged;
import cz.novanadeje.app.support.MutableClock;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledThreadPoolExecutor;
import java.util.stream.IntStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

class LiveStreamHubTest {

    private static final Instant NOW = Instant.parse("2026-11-05T09:00:00Z");
    private static final Duration TOKEN_LIFETIME = Duration.ofMinutes(15);
    private static final UUID JANA = UUID.fromString("0190a000-0000-7000-8000-000000000001");
    private static final UUID PETR = UUID.fromString("0190a000-0000-7000-8000-000000000002");
    private static final UUID ADMIN = UUID.fromString("0190a000-0000-7000-8000-000000000003");

    private final MutableClock clock = new MutableClock(NOW, ZoneId.of("Europe/Prague"));
    private LiveStreamHub hub = hub(new LiveProperties(Duration.ofMinutes(1), 5, 50, 10));

    @AfterEach
    void stopHub() {
        hub.stop();
    }

    @Test
    @DisplayName("Given a stream, when it opens, then its first event names the server's revision and its timeout lies just past the token's expiry")
    void should_send_revision_first_when_stream_opens_given_valid_token() {
        RecordingConnection jana = open(donor(JANA));

        assertThat(jana.sent()).containsExactly(new RecordingConnection.Sent(LiveStreamHub.REVISION_EVENT, Map.of("revision", "f00ba12")));
        assertThat(jana.timeout()).isEqualTo(TOKEN_LIFETIME.plus(LiveStreamHub.TIMEOUT_MARGIN));
    }

    @Test
    @DisplayName("Given streams of two donors, when the first donor's donations change, then only the first donor's stream hears it")
    void should_hint_only_owning_donor_when_donor_feed_changes_given_two_donors() {
        RecordingConnection jana = open(donor(JANA));
        RecordingConnection petr = open(donor(PETR));

        hub.publish(StoredDataChanged.ofDonor(LiveFeed.DONATIONS, JANA));
        hub.publish(StoredDataChanged.of(LiveFeed.BANK_IMPORT));

        await().untilAsserted(() -> assertThat(jana.changedFeeds()).containsExactlyInAnyOrder("donations", "bank-import"));
        await().untilAsserted(() -> assertThat(petr.changedFeeds()).containsExactly("bank-import"));
    }

    @Test
    @DisplayName("Given a donor's and an administrator's stream, when payments, another donor's bank accounts and the administrator's own donations change, then only the administrator hears the payments and own donations, and nobody the other donor's accounts")
    void should_hint_administrator_of_payments_and_own_feeds_when_feeds_change_given_donor_and_administrator() {
        RecordingConnection jana = open(donor(JANA));
        RecordingConnection admin = open(administrator(ADMIN));

        hub.publish(StoredDataChanged.of(LiveFeed.PAYMENTS));
        hub.publish(StoredDataChanged.ofDonor(LiveFeed.BANK_ACCOUNTS, PETR));
        hub.publish(StoredDataChanged.ofDonor(LiveFeed.DONATIONS, ADMIN));
        hub.publish(StoredDataChanged.of(LiveFeed.BANK_IMPORT));

        await().untilAsserted(() -> assertThat(admin.changedFeeds()).containsExactlyInAnyOrder("payments", "donations", "bank-import"));
        await().untilAsserted(() -> assertThat(jana.changedFeeds()).containsExactly("bank-import"));
    }

    @Test
    @DisplayName("Given a change committed while a stream opens, when the revision is still being written, then the hint follows the revision and never comes before it")
    void should_send_hint_after_revision_when_change_races_opening_given_new_stream() {
        LiveOpening<RecordingConnection> opening = hub.open(donor(JANA), timeout -> {
            RecordingConnection connection = new RecordingConnection(timeout);
            connection.beforeEachSend(() -> {
                connection.beforeEachSend(() -> {
                });
                new Thread(() -> hub.publish(StoredDataChanged.ofDonor(LiveFeed.DONATIONS, JANA))).start();
                await().pollDelay(Duration.ofMillis(100)).until(() -> true);
            });
            return connection;
        });
        RecordingConnection jana = ((LiveOpening.Opened<RecordingConnection>) opening).connection();

        await().untilAsserted(() -> assertThat(jana.sent()).extracting(RecordingConnection.Sent::event)
                .containsExactly(LiveStreamHub.REVISION_EVENT, LiveStreamHub.CHANGED_EVENT));
    }

    @Test
    @DisplayName("Given the hub's own scheduler, when streams close before their timers ran, then no cancelled timer stays queued holding the stream")
    void should_leave_no_timer_queued_when_streams_close_given_hub_scheduler() {
        hub.stop();
        ScheduledThreadPoolExecutor scheduler = LiveStreamHub.scheduler();
        hub = new LiveStreamHub(new LiveProperties(Duration.ofMinutes(1), 5, 50, 10), TOKEN_LIFETIME.plusMinutes(1), "f00ba12", clock, () -> scheduler);
        hub.start();

        IntStream.range(0, 20).forEach(index -> open(donor(UUID.randomUUID())).close());

        assertThat(hub.openStreams()).isZero();
        assertThat(scheduler.getQueue()).isEmpty();
    }

    @Test
    @DisplayName("Given an open stream, when the heartbeat interval passes, then a heartbeat goes out")
    void should_send_heartbeat_when_interval_passes_given_open_stream() {
        hub.stop();
        hub = hub(new LiveProperties(Duration.ofMillis(20), 5, 50, 10));
        RecordingConnection jana = open(donor(JANA));

        await().untilAsserted(() -> assertThat(jana.heartbeats()).isGreaterThanOrEqualTo(2));
    }

    @Test
    @DisplayName("Given a stream whose token expires shortly, when the expiry passes, then the stream is closed and forgotten")
    void should_close_stream_when_token_expires_given_short_lived_token() {
        RecordingConnection jana = open(new LiveSubscriber(JANA, false, NOW, NOW.plusMillis(50)));

        await().untilAsserted(() -> assertThat(jana.closed()).isTrue());
        assertThat(hub.openStreams()).isZero();
    }

    @Test
    @DisplayName("Given a token that has already expired, when a stream is asked for, then the hub refuses it as an ended session")
    void should_refuse_stream_when_opened_given_expired_token() {
        LiveOpening<RecordingConnection> opening = hub.open(new LiveSubscriber(JANA, false, NOW.minus(TOKEN_LIFETIME), NOW.minusSeconds(1)), RecordingConnection::new);

        assertThat(opening).isInstanceOf(LiveOpening.SessionEnded.class);
    }

    @Test
    @DisplayName("Given a donor's streams of an old and a new token, when the donor's sessions end between them, then only the old one closes and the old token cannot open another")
    void should_close_older_streams_and_refuse_older_tokens_when_sessions_end_given_two_tokens() {
        RecordingConnection old = open(new LiveSubscriber(JANA, false, NOW.minusSeconds(60), NOW.plus(TOKEN_LIFETIME)));
        RecordingConnection petr = open(donor(PETR));
        Instant endedAt = NOW.plusMillis(400);
        RecordingConnection fresh = open(new LiveSubscriber(JANA, false, NOW, NOW.plus(TOKEN_LIFETIME)));

        hub.endSessions(new DonorSessionsEnded(JANA, endedAt));

        assertThat(old.closed()).isTrue();
        assertThat(fresh.closed()).isFalse();
        assertThat(petr.closed()).isFalse();
        assertThat(hub.open(new LiveSubscriber(JANA, false, NOW.minusSeconds(60), NOW.plus(TOKEN_LIFETIME)), RecordingConnection::new))
                .isInstanceOf(LiveOpening.SessionEnded.class);
    }

    @Test
    @DisplayName("Given an ended session long enough ago, when a stream of a token from before it is asked for, then the hub no longer remembers it and only the token's own expiry counts")
    void should_forget_session_end_when_memory_passes_given_old_session_end() {
        hub.endSessions(new DonorSessionsEnded(JANA, NOW));
        clock.advance(Duration.ofMinutes(17));

        LiveOpening<RecordingConnection> opening = hub.open(new LiveSubscriber(JANA, false, NOW.minusSeconds(60), clock.instant().plusSeconds(60)), RecordingConnection::new);

        assertThat(opening).isInstanceOf(LiveOpening.Opened.class);
    }

    @Test
    @DisplayName("Given five streams of one donor, when a sixth opens, then the oldest of them closes")
    void should_close_oldest_stream_of_donor_when_sixth_opens_given_five_open() {
        List<RecordingConnection> five = IntStream.range(0, 5).mapToObj(index -> open(donor(JANA))).toList();

        RecordingConnection sixth = open(donor(JANA));

        assertThat(five.getFirst().closed()).isTrue();
        assertThat(five.subList(1, 5)).noneMatch(RecordingConnection::closed);
        assertThat(sixth.closed()).isFalse();
        assertThat(hub.openStreams()).isEqualTo(5);
    }

    @Test
    @DisplayName("Given donors holding every stream not reserved, when another donor and an administrator ask, then the donor is refused and the administrator gets a reserved one")
    void should_keep_reserved_streams_for_administrators_when_donors_fill_the_rest_given_cap() {
        hub.stop();
        hub = hub(new LiveProperties(Duration.ofMinutes(1), 1, 3, 1));
        open(donor(JANA));
        open(donor(PETR));

        LiveOpening<RecordingConnection> another = hub.open(donor(UUID.randomUUID()), RecordingConnection::new);
        LiveOpening<RecordingConnection> admin = hub.open(administrator(ADMIN), RecordingConnection::new);
        LiveOpening<RecordingConnection> secondAdmin = hub.open(administrator(UUID.randomUUID()), RecordingConnection::new);

        assertThat(another).isInstanceOf(LiveOpening.Full.class);
        assertThat(admin).isInstanceOf(LiveOpening.Opened.class);
        assertThat(secondAdmin).isInstanceOf(LiveOpening.Full.class);
    }

    @Test
    @DisplayName("Given a stream whose client is gone, when a hint is sent to it, then the stream is closed and forgotten")
    void should_forget_stream_when_send_fails_given_gone_client() {
        RecordingConnection jana = open(donor(JANA));
        jana.failFromNowOn();

        hub.publish(StoredDataChanged.ofDonor(LiveFeed.DONATIONS, JANA));

        await().untilAsserted(() -> assertThat(jana.closed()).isTrue());
        assertThat(hub.openStreams()).isZero();
    }

    @Test
    @DisplayName("Given open streams, when the hub stops, then every stream is closed and no new one opens")
    void should_close_every_stream_when_hub_stops_given_open_streams() {
        RecordingConnection jana = open(donor(JANA));
        RecordingConnection admin = open(administrator(ADMIN));

        hub.stop();

        assertThat(jana.closed()).isTrue();
        assertThat(admin.closed()).isTrue();
        assertThat(hub.isRunning()).isFalse();
        assertThat(hub.open(donor(PETR), RecordingConnection::new)).isInstanceOf(LiveOpening.Unavailable.class);
    }

    @Test
    @DisplayName("Given a hub that was stopped, as the test framework pauses a cached context, when it starts again, then streams open and hear hints as before")
    void should_open_streams_and_hint_when_started_again_given_stopped_hub() {
        hub.stop();
        hub.start();

        RecordingConnection jana = open(donor(JANA));
        hub.publish(StoredDataChanged.ofDonor(LiveFeed.DONATIONS, JANA));

        await().untilAsserted(() -> assertThat(jana.changedFeeds()).containsExactly("donations"));
    }

    private LiveStreamHub hub(LiveProperties properties) {
        LiveStreamHub created = new LiveStreamHub(properties, TOKEN_LIFETIME.plusMinutes(1), "f00ba12", clock, () -> Executors.newScheduledThreadPool(2));
        created.start();
        return created;
    }

    private RecordingConnection open(LiveSubscriber subscriber) {
        LiveOpening<RecordingConnection> opening = hub.open(subscriber, RecordingConnection::new);
        assertThat(opening).isInstanceOf(LiveOpening.Opened.class);
        return ((LiveOpening.Opened<RecordingConnection>) opening).connection();
    }

    private static LiveSubscriber donor(UUID donor) {
        return new LiveSubscriber(donor, false, NOW, NOW.plus(TOKEN_LIFETIME));
    }

    private static LiveSubscriber administrator(UUID donor) {
        return new LiveSubscriber(donor, true, NOW, NOW.plus(TOKEN_LIFETIME));
    }
}
