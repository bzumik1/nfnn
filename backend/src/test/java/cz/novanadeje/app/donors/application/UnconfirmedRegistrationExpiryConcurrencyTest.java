package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.IntegrationTest;
import cz.novanadeje.app.donors.domain.DeviceDescription;
import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.DonorRepository;
import cz.novanadeje.app.donors.domain.EmailVerificationToken;
import cz.novanadeje.app.donors.domain.EmailVerificationTokenRepository;
import cz.novanadeje.app.donors.domain.InvalidEmailVerificationToken;
import cz.novanadeje.app.donors.domain.LinkSecret;
import cz.novanadeje.app.donors.domain.PasswordHash;
import cz.novanadeje.app.donors.domain.SessionKind;
import cz.novanadeje.app.shared.domain.DonorName;
import cz.novanadeje.app.shared.domain.DonorType;
import cz.novanadeje.app.shared.domain.EmailAddress;
import cz.novanadeje.app.shared.domain.LocaleCode;
import cz.novanadeje.app.shared.domain.PostalAddress;
import cz.novanadeje.app.shared.domain.VariableSymbol;
import cz.novanadeje.app.support.DatabaseCleaner;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.Callable;
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
class UnconfirmedRegistrationExpiryConcurrencyTest {

    private static final String ADDRESS = "jana@example.cz";

    @Autowired
    private DonorRegistrationExpiryService expiry;
    @Autowired
    private DonorEmailVerificationService emailVerification;
    @Autowired
    private DonorRepository donors;
    @Autowired
    private EmailVerificationTokenRepository tokens;
    @Autowired
    private PlatformTransactionManager transactionManager;
    @Autowired
    private JdbcClient jdbc;
    @Autowired
    private Clock clock;
    @PersistenceContext
    private EntityManager entityManager;

    private Donor jana;
    private LinkSecret link;

    @BeforeEach
    void unconfirmedRegistrationFortyDaysOldWithALiveLink() {
        new DatabaseCleaner(jdbc).emptyAllTables();
        Instant registeredAt = clock.instant().minus(Duration.ofDays(40));
        jana = Donor.register(DonorId.newId(registeredAt), DonorType.PERSON, new DonorName("Jana Nováková"), null,
                new PostalAddress("Dlouhá 12", "Ústí nad Labem", "400 01"), new EmailAddress(ADDRESS), new PasswordHash("$hash"),
                new VariableSymbol("4821937590"), LocaleCode.CS, registeredAt);
        link = LinkSecret.generate();
        inTransaction(() -> {
            donors.save(jana);
            tokens.save(EmailVerificationToken.issue(link, jana.id(), clock.instant(), Duration.ofHours(24)));
        });
    }

    @Test
    @DisplayName("Given an old registration confirmed but not committed yet, when the expiry runs meanwhile, then it deletes nothing and the confirmed account stays")
    void should_keep_account_when_expiry_runs_during_confirmation_given_old_registration() throws Exception {
        Future<Integer> deletion = whileHeldBy(
                () -> emailVerification.confirm(link.value(), DeviceDescription.UNKNOWN, SessionKind.REMEMBERED),
                expiry::expireUnconfirmed);

        assertThat(deletion.get(30, TimeUnit.SECONDS)).isZero();
        assertThat(jdbc.sql("select email_verified_at is not null from donor where id = ?").param(jana.id().value()).query(Boolean.class).single())
                .isTrue();
    }

    @Test
    @DisplayName("Given an old registration deleted by the expiry but not committed yet, when its link is opened meanwhile, then the link is refused and no account is left")
    void should_refuse_link_when_opened_during_expiry_given_old_registration() {
        Future<?> confirmation = whileHeldBy(expiry::expireUnconfirmed,
                () -> emailVerification.confirm(link.value(), DeviceDescription.UNKNOWN, SessionKind.REMEMBERED));

        assertThatThrownBy(() -> confirmation.get(30, TimeUnit.SECONDS))
                .isInstanceOf(ExecutionException.class)
                .hasCauseInstanceOf(InvalidEmailVerificationToken.class);
        assertThat(accountsWith(ADDRESS)).isZero();
    }

    @Test
    @DisplayName("Given an old registration deleted by the expiry but not committed yet, when a new link is asked for meanwhile, then the request ends without a link and without an error and no account is left")
    void should_issue_no_link_when_asked_during_expiry_given_old_registration() throws Exception {
        Future<?> request = whileHeldBy(expiry::expireUnconfirmed, () -> {
            emailVerification.requestVerification(new EmailAddress(ADDRESS));
            return null;
        });

        request.get(30, TimeUnit.SECONDS);
        assertThat(accountsWith(ADDRESS)).isZero();
        assertThat(jdbc.sql("select count(*) from donor_email_verification_token").query(Long.class).single()).isZero();
    }

    private <T> Future<T> whileHeldBy(Callable<?> firstWriter, Callable<T> secondWriter) {
        CountDownLatch written = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        ExecutorService callers = Executors.newFixedThreadPool(2);
        try {
            Future<?> first = callers.submit(() -> inTransaction(() -> {
                call(firstWriter);
                entityManager.flush();
                written.countDown();
                waitFor(release);
            }));
            assertThat(written.await(30, TimeUnit.SECONDS)).isTrue();
            Future<T> second = callers.submit(secondWriter);
            await().until(() -> second.isDone() || waitingForLocks() >= 1);
            release.countDown();
            first.get(30, TimeUnit.SECONDS);
            return second;
        } catch (Exception failed) {
            throw new IllegalStateException("The first writer did not finish", failed);
        } finally {
            release.countDown();
            callers.shutdown();
        }
    }

    private long accountsWith(String email) {
        return jdbc.sql("select count(*) from donor where email = ?").param(email).query(Long.class).single();
    }

    private long waitingForLocks() {
        return jdbc.sql("select count(*) from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock'")
                .query(Long.class).single();
    }

    private void inTransaction(Runnable work) {
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> work.run());
    }

    private static void call(Callable<?> work) {
        try {
            work.call();
        } catch (Exception failed) {
            throw new IllegalStateException(failed);
        }
    }

    private static void waitFor(CountDownLatch latch) {
        try {
            latch.await(30, TimeUnit.SECONDS);
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
        }
    }
}
