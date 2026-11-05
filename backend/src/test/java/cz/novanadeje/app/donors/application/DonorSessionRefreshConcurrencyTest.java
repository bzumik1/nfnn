package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.IntegrationTest;
import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.DonorRepository;
import cz.novanadeje.app.donors.domain.PasswordHash;
import cz.novanadeje.app.donors.domain.RefreshTokenRepository;
import cz.novanadeje.app.donors.domain.RefreshTokenSecret;
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
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;

@IntegrationTest
class DonorSessionRefreshConcurrencyTest {

    @Autowired
    private DonorSessionService sessions;
    @Autowired
    private DonorRepository donors;
    @Autowired
    private RefreshTokenRepository refreshTokens;
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
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> donors.save(jana));
    }

    @Test
    @DisplayName("Given two tabs that present the same refresh cookie at the same moment, when both refresh, then both get a session, only the later one stays usable and no session of the donor is ended")
    void should_give_both_a_session_and_keep_the_later_one_when_refreshed_at_once_given_the_same_cookie() throws Exception {
        String cookie = new TransactionTemplate(transactionManager).execute(status -> sessions.open(jana, false).refreshToken());
        CountDownLatch rowHeld = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        ExecutorService callers = Executors.newFixedThreadPool(3);
        try {
            Future<?> holder = callers.submit(() -> new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
                jdbc.sql("select id from donor_refresh_token where secret_hash = ? for update")
                        .param(RefreshTokenSecret.fromValue(cookie).hash()).query(Object.class).single();
                rowHeld.countDown();
                await(release);
            }));
            assertThat(rowHeld.await(30, TimeUnit.SECONDS)).isTrue();

            Future<RefreshedSession> first = callers.submit(() -> sessions.refresh(cookie));
            Future<RefreshedSession> second = callers.submit(() -> sessions.refresh(cookie));
            Thread.sleep(300);
            release.countDown();
            holder.get(30, TimeUnit.SECONDS);

            List<String> issued = List.of(first.get(30, TimeUnit.SECONDS).tokens().refreshToken(),
                    second.get(30, TimeUnit.SECONDS).tokens().refreshToken());
            List<Boolean> usable = issued.stream()
                    .map(secret -> refreshTokens.findBySecretHash(RefreshTokenSecret.fromValue(secret).hash()).orElseThrow().isUsableAt(clock.instant()))
                    .toList();
            assertThat(usable).containsExactlyInAnyOrder(true, false);
        } finally {
            release.countDown();
            callers.shutdownNow();
        }
    }

    private static void await(CountDownLatch latch) {
        try {
            latch.await(30, TimeUnit.SECONDS);
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
        }
    }
}
