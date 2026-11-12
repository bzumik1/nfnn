package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.IntegrationTest;
import cz.novanadeje.app.donors.domain.DeviceDescription;
import cz.novanadeje.app.donors.domain.DeviceSignOutReason;
import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.DonorRepository;
import cz.novanadeje.app.donors.domain.InvalidRefreshToken;
import cz.novanadeje.app.donors.domain.PasswordHash;
import cz.novanadeje.app.donors.domain.RefreshTokenSecret;
import cz.novanadeje.app.donors.domain.SessionKind;
import cz.novanadeje.app.shared.domain.DonorType;
import cz.novanadeje.app.shared.domain.EmailAddress;
import cz.novanadeje.app.shared.domain.LocaleCode;
import cz.novanadeje.app.shared.domain.PostalAddress;
import cz.novanadeje.app.shared.domain.VariableSymbol;
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
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.function.Function;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.awaitility.Awaitility.await;

@IntegrationTest
class DonorSessionLockOrderTest {

    @Autowired
    private DonorSessionService sessions;
    @Autowired
    private DonorSessionCleanupService cleanup;
    @Autowired
    private DeviceSignOuts signOuts;
    @Autowired
    private DonorRepository donors;
    @Autowired
    private PlatformTransactionManager transactionManager;
    @Autowired
    private JdbcClient jdbc;
    @Autowired
    private Clock clock;

    private Donor jana;

    @BeforeEach
    void aDonor() {
        new DatabaseCleaner(jdbc).emptyAllTables();
        jana = Donor.register(DonorId.newId(clock.instant()), DonorType.PERSON, "Jana Nováková", null,
                new PostalAddress("Dlouhá 12", "Ústí nad Labem", "400 01"), new EmailAddress("jana@example.cz"), new PasswordHash("$hash"),
                new VariableSymbol("4821937560"), LocaleCode.CS, clock.instant());
        inTransaction(() -> donors.save(jana));
    }

    @Test
    @DisplayName("Given a donor signed in on a phone and a laptop, when both sign out at the same moment, then both sign-outs complete and both devices end")
    void should_complete_both_and_end_both_devices_when_signed_out_at_once_given_two_devices() throws Exception {
        String phone = signIn();
        String laptop = signIn();

        List<Future<Object>> signedOut = whileTokensHeld(List.of(phone, laptop), callers -> List.of(
                callers.submit(() -> close(phone)),
                callers.submit(() -> close(laptop))));

        for (Future<Object> signOut : signedOut) {
            signOut.get(30, TimeUnit.SECONDS);
        }
        assertThat(activeDevices()).isZero();
        assertThat(unrevokedTokens()).isZero();
    }

    @Test
    @DisplayName("Given a superseded token of one device and the token of another, when the superseded one is presented while the other device signs out, then the replay ends every session, the sign-out completes and nothing deadlocks")
    void should_end_every_session_and_complete_sign_out_when_replayed_during_sign_out_given_superseded_token() throws Exception {
        String replayed = signIn();
        String laptop = signIn();
        jdbc.sql("update donor_refresh_token set revoked_at = now(), superseded_at = now() where secret_hash = ?")
                .param(RefreshTokenSecret.fromValue(replayed).hash()).update();

        List<Future<Object>> calls = whileTokensHeld(List.of(replayed, laptop), callers -> List.of(
                callers.submit(() -> sessions.refresh(replayed, SessionCookie.BROWSER, DeviceDescription.UNKNOWN)),
                callers.submit(() -> close(laptop))));

        assertThatThrownBy(() -> calls.get(0).get(30, TimeUnit.SECONDS))
                .isInstanceOf(ExecutionException.class)
                .hasCauseInstanceOf(InvalidRefreshToken.class);
        calls.get(1).get(30, TimeUnit.SECONDS);
        assertThat(activeDevices()).isZero();
        assertThat(unrevokedTokens()).isZero();
    }

    @Test
    @DisplayName("Given two spent tokens stored against their id order, when every session of the donor ends while the nightly cleanup deletes them, then both complete and the spent tokens are gone")
    void should_complete_both_and_delete_spent_tokens_when_sessions_end_during_cleanup_given_spent_tokens() throws Exception {
        signIn();
        signIn();
        Timestamp longAgo = Timestamp.from(clock.instant().minus(Duration.ofDays(40)));
        jdbc.sql("update donor_device set ended_at = ?, end_reason = 'SIGNED_OUT'").param(longAgo).update();
        List<String> byIdDescending = jdbc.sql("select secret_hash from donor_refresh_token order by id desc").query(String.class).list();
        for (String spent : byIdDescending) {
            jdbc.sql("update donor_refresh_token set revoked_at = ? where secret_hash = ?").param(longAgo).param(spent).update();
        }
        String lowerId = byIdDescending.getLast();
        Instant now = clock.instant();

        CountDownLatch held = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        ExecutorService callers = Executors.newFixedThreadPool(3);
        try {
            Future<?> holder = callers.submit(() -> inTransaction(() -> {
                jdbc.sql("select id from donor_refresh_token where secret_hash = ? for update").param(lowerId).query(Object.class).single();
                held.countDown();
                waitFor(release);
            }));
            assertThat(held.await(30, TimeUnit.SECONDS)).isTrue();
            Future<Object> endingAll = callers.submit(() -> {
                inTransaction(() -> signOuts.endAllOf(jana.id(), DeviceSignOutReason.CREDENTIALS_CHANGED, now));
                return null;
            });
            await().until(() -> waitingForLocks() >= 1);
            Future<DonorSessionCleanupService.SessionCleanup> cleaning = callers.submit(cleanup::cleanUp);
            await().until(() -> waitingForLocks() >= 2);
            release.countDown();
            holder.get(30, TimeUnit.SECONDS);

            endingAll.get(30, TimeUnit.SECONDS);
            assertThat(cleaning.get(30, TimeUnit.SECONDS).deletedTokens()).isEqualTo(2);
        } finally {
            release.countDown();
            callers.shutdownNow();
        }
        assertThat(jdbc.sql("select count(*) from donor_refresh_token").query(Long.class).single()).isZero();
    }

    private String signIn() {
        return new TransactionTemplate(transactionManager)
                .execute(status -> sessions.signIn(jana, false, DeviceDescription.UNKNOWN, SessionKind.REMEMBERED).refreshToken());
    }

    private Object close(String secret) {
        sessions.close(secret);
        return null;
    }

    private List<Future<Object>> whileTokensHeld(List<String> secrets, Function<ExecutorService, List<Future<Object>>> calls) throws Exception {
        CountDownLatch held = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        ExecutorService callers = Executors.newFixedThreadPool(secrets.size() + 1);
        try {
            Future<?> holder = callers.submit(() -> inTransaction(() -> {
                for (String secret : secrets) {
                    jdbc.sql("select id from donor_refresh_token where secret_hash = ? for update")
                            .param(RefreshTokenSecret.fromValue(secret).hash()).query(Object.class).single();
                }
                held.countDown();
                waitFor(release);
            }));
            assertThat(held.await(30, TimeUnit.SECONDS)).isTrue();
            List<Future<Object>> started = calls.apply(callers);
            await().until(() -> waitingForLocks() >= started.size());
            release.countDown();
            holder.get(30, TimeUnit.SECONDS);
            return started;
        } finally {
            release.countDown();
            callers.shutdown();
        }
    }

    private long activeDevices() {
        return jdbc.sql("select count(*) from donor_device where ended_at is null").query(Long.class).single();
    }

    private long unrevokedTokens() {
        return jdbc.sql("select count(*) from donor_refresh_token where revoked_at is null").query(Long.class).single();
    }

    private long waitingForLocks() {
        return jdbc.sql("select count(*) from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock'")
                .query(Long.class).single();
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
