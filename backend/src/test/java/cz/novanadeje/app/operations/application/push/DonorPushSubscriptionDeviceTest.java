package cz.novanadeje.app.operations.application.push;

import cz.novanadeje.app.IntegrationTest;
import cz.novanadeje.app.donors.application.DeviceSignOuts;
import cz.novanadeje.app.donors.domain.DeviceId;
import cz.novanadeje.app.donors.domain.DeviceSignOutReason;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.operations.domain.push.DonorNotifications;
import cz.novanadeje.app.operations.domain.push.PushClientKeys;
import cz.novanadeje.app.operations.domain.push.PushDeviceKeepsNothing;
import cz.novanadeje.app.operations.domain.push.PushEndpoint;
import cz.novanadeje.app.shared.domain.error.AuthenticationFailure;
import cz.novanadeje.app.support.DatabaseCleaner;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.awaitility.Awaitility.await;

@IntegrationTest
class DonorPushSubscriptionDeviceTest {

    private static final UUID JANA = UUID.fromString("01a18e56-bdb0-775a-bd0a-a60756831369");
    private static final UUID PHONE = UUID.fromString("01a18e56-bdb0-775a-bd0a-a6075683136a");
    private static final PushEndpoint ENDPOINT = new PushEndpoint("https://fcm.googleapis.com/fcm/send/phone");
    private static final PushClientKeys KEYS = new PushClientKeys(
            "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4", "BTBZMqHH6r4Tts7J_aSIgg");

    @Autowired
    private DonorPushService subscriptions;
    @Autowired
    private DeviceSignOuts signOuts;
    @Autowired
    private PlatformTransactionManager transactionManager;
    @Autowired
    private JdbcClient jdbc;
    @Autowired
    private Clock clock;

    @BeforeEach
    void aDonorSignedInOnAPhone() {
        new DatabaseCleaner(jdbc).emptyAllTables();
        Instant now = clock.instant();
        jdbc.sql("insert into donor (id, type, name, company_identifier, street, city, postal_code, email, password_hash, variable_symbol, "
                        + "preferred_locale, registered_at, email_verified_at, erased_at) values (:id, 'PERSON', 'Jana Nováková', null, 'Dlouhá 12', "
                        + "'Ústí nad Labem', '400 01', 'jana@example.cz', null, '4821937560', 'cs', :at, :at, null)")
                .param("id", JANA).param("at", Timestamp.from(now)).update();
        jdbc.sql("insert into donor_device (id, donor_id, platform, browser, signed_in_at, last_used_at) values (:id, :donor, 'OTHER', 'OTHER', :now, :now)")
                .param("id", PHONE).param("donor", JANA).param("now", Timestamp.from(now)).update();
        jdbc.sql("insert into donor_refresh_token (id, donor_id, secret_hash, issued_at, granted_at, expires_at, device_id) "
                        + "values (:id, :donor, :hash, :now, :now, :expires, :device)")
                .param("id", UUID.randomUUID()).param("donor", JANA).param("hash", "0123456789abcdef0123456789abcdef")
                .param("now", Timestamp.from(now)).param("expires", Timestamp.from(now.plus(Duration.ofDays(14)))).param("device", PHONE).update();
    }

    @Test
    @DisplayName("Given a phone signed out a moment ago whose access token still lives, when its open tab turns push notifications on, then the session is refused as ended and no subscription is stored")
    void should_refuse_the_session_and_store_nothing_when_the_tab_subscribes_given_a_phone_signed_out_a_moment_ago() {
        inTransaction(() -> signOuts.end(new DonorId(JANA), new DeviceId(PHONE), DeviceSignOutReason.REMOTE_SIGN_OUT, clock.instant()));

        assertThatThrownBy(() -> subscriptions.subscribe(JANA, PHONE, ENDPOINT, KEYS, DonorNotifications.ALL))
                .isInstanceOfSatisfying(AuthenticationFailure.class, failure -> assertThat(failure.code()).isEqualTo("auth/session-ended"));
        assertThat(storedSubscriptions()).isZero();
    }

    @Test
    @DisplayName("Given a sign-out of the phone that has ended it and waits to commit, when its open tab turns push notifications on meanwhile, then the subscription waits for the sign-out, is refused as ended and nothing is stored")
    void should_wait_and_refuse_when_the_tab_subscribes_given_a_sign_out_of_the_phone_in_flight() throws Exception {
        CountDownLatch ended = new CountDownLatch(1);
        CountDownLatch commit = new CountDownLatch(1);
        ExecutorService callers = Executors.newFixedThreadPool(2);
        try {
            Future<?> signOut = callers.submit(() -> inTransaction(() -> {
                signOuts.end(new DonorId(JANA), new DeviceId(PHONE), DeviceSignOutReason.REMOTE_SIGN_OUT, clock.instant());
                ended.countDown();
                waitFor(commit);
            }));
            assertThat(ended.await(30, TimeUnit.SECONDS)).isTrue();
            Future<?> subscription = callers.submit(() -> subscriptions.subscribe(JANA, PHONE, ENDPOINT, KEYS, DonorNotifications.ALL));
            await().atMost(Duration.ofSeconds(30)).until(() -> waitingOnLocks() > 0);
            commit.countDown();
            signOut.get(30, TimeUnit.SECONDS);

            assertThatThrownBy(() -> subscription.get(30, TimeUnit.SECONDS)).isInstanceOf(ExecutionException.class).cause()
                    .isInstanceOfSatisfying(AuthenticationFailure.class, failure -> assertThat(failure.code()).isEqualTo("auth/session-ended"));
        } finally {
            commit.countDown();
            callers.shutdownNow();
        }
        assertThat(storedSubscriptions()).isZero();
    }

    @Test
    @DisplayName("Given a phone signed in as a public computer, when it turns push notifications on, then it is refused, since such a session keeps nothing on the device, and nothing is stored")
    void should_refuse_and_store_nothing_when_subscribing_given_a_public_computer_session() {
        jdbc.sql("update donor_device set session_kind = 'PUBLIC' where id = :id").param("id", PHONE).update();

        assertThatThrownBy(() -> subscriptions.subscribe(JANA, PHONE, ENDPOINT, KEYS, DonorNotifications.ALL)).isInstanceOf(PushDeviceKeepsNothing.class);
        assertThat(storedSubscriptions()).isZero();
    }

    private long storedSubscriptions() {
        return jdbc.sql("select count(*) from operations_donor_push_subscription").query(Long.class).single();
    }

    private long waitingOnLocks() {
        return jdbc.sql("select count(*) from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock'").query(Long.class).single();
    }

    private void inTransaction(Runnable work) {
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> work.run());
    }

    private static void waitFor(CountDownLatch latch) {
        try {
            latch.await(30, TimeUnit.SECONDS);
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
        }
    }
}
