package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.IntegrationTest;
import cz.novanadeje.app.donors.domain.DeviceDescription;
import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.DonorRepository;
import cz.novanadeje.app.donors.domain.InvalidSecondFactorCode;
import cz.novanadeje.app.donors.domain.LinkSecret;
import cz.novanadeje.app.donors.domain.PasswordHash;
import cz.novanadeje.app.donors.domain.SecondFactor;
import cz.novanadeje.app.donors.domain.SecondFactorChallenge;
import cz.novanadeje.app.donors.domain.SecondFactorChallengeRepository;
import cz.novanadeje.app.donors.domain.SecondFactorRepository;
import cz.novanadeje.app.donors.domain.SessionKind;
import cz.novanadeje.app.donors.domain.Totp;
import cz.novanadeje.app.donors.domain.TotpSecret;
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

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

@IntegrationTest
class SecondFactorSignInConcurrencyTest {

    private static final TotpSecret SECRET = new TotpSecret("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");

    @Autowired
    private DonorAuthenticationService authentication;
    @Autowired
    private DonorRepository donors;
    @Autowired
    private SecondFactorRepository secondFactors;
    @Autowired
    private SecondFactorChallengeRepository challenges;
    @Autowired
    private PlatformTransactionManager transactionManager;
    @Autowired
    private JdbcClient jdbc;
    @Autowired
    private Clock clock;

    private Donor jana;

    @BeforeEach
    void aDonorWithTheCodeFromTheApp() {
        new DatabaseCleaner(jdbc).emptyAllTables();
        Instant now = clock.instant();
        jana = Donor.register(DonorId.newId(now), DonorType.PERSON, "Jana Nováková", null,
                new PostalAddress("Dlouhá 12", "Ústí nad Labem", "400 01"), new EmailAddress("jana@example.cz"), new PasswordHash("$hash"),
                new VariableSymbol("4821937560"), LocaleCode.CS, now);
        jana.verifyEmail(now);
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
            donors.save(jana);
            secondFactors.save(SecondFactor.reconstitute(jana.id(), SECRET, now.minusSeconds(600), now.minusSeconds(600), Totp.stepAt(now) - 2));
        });
    }

    @Test
    @DisplayName("Given two open challenges of one donor, when both are completed at the same moment with the same right code, then exactly one session opens and the other is refused as a used code")
    void should_open_exactly_one_session_when_completed_at_once_given_two_challenges_and_the_same_code() throws Exception {
        LinkSecret first = challenge();
        LinkSecret second = challenge();
        String code = Totp.codeAt(SECRET, Totp.stepAt(clock.instant()));
        CountDownLatch rowHeld = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        ExecutorService callers = Executors.newFixedThreadPool(3);
        try {
            Future<?> holder = callers.submit(() -> new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
                jdbc.sql("select donor_id from donor_second_factor where donor_id = ? for update").param(jana.id().value()).query(Object.class).single();
                rowHeld.countDown();
                waitFor(release);
            }));
            assertThat(rowHeld.await(30, TimeUnit.SECONDS)).isTrue();

            List<Future<AuthenticatedDonor>> completions = List.of(
                    callers.submit(() -> authentication.completeSecondFactor(first.value(), code, DeviceDescription.UNKNOWN, SessionKind.BROWSER)),
                    callers.submit(() -> authentication.completeSecondFactor(second.value(), code, DeviceDescription.UNKNOWN, SessionKind.BROWSER)));
            await().until(() -> jdbc.sql("select count(*) from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock'")
                    .query(Long.class).single() >= 2);
            release.countDown();
            holder.get(30, TimeUnit.SECONDS);

            int opened = 0;
            int refused = 0;
            for (Future<AuthenticatedDonor> completion : completions) {
                try {
                    completion.get(30, TimeUnit.SECONDS);
                    opened++;
                } catch (ExecutionException failed) {
                    assertThat(failed.getCause()).isInstanceOf(InvalidSecondFactorCode.class);
                    refused++;
                }
            }
            assertThat(opened).isEqualTo(1);
            assertThat(refused).isEqualTo(1);
            assertThat(jdbc.sql("select count(*) from donor_refresh_token where donor_id = ?").param(jana.id().value()).query(Long.class).single())
                    .isEqualTo(1);
        } finally {
            release.countDown();
            callers.shutdownNow();
        }
    }

    private LinkSecret challenge() {
        LinkSecret secret = LinkSecret.generate();
        new TransactionTemplate(transactionManager).executeWithoutResult(status ->
                challenges.save(SecondFactorChallenge.issue(secret, jana.id(), clock.instant(), Duration.ofMinutes(5))));
        return secret;
    }

    private static void waitFor(CountDownLatch latch) {
        try {
            latch.await(30, TimeUnit.SECONDS);
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
        }
    }
}
