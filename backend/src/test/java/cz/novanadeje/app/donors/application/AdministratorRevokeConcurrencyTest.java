package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.IntegrationTest;
import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.DonorRepository;
import cz.novanadeje.app.donors.domain.LastAdministratorRevoked;
import cz.novanadeje.app.donors.domain.PasswordHash;
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
class AdministratorRevokeConcurrencyTest {

    @Autowired
    private AdministratorService administrators;
    @Autowired
    private DonorRepository donors;
    @Autowired
    private PlatformTransactionManager transactionManager;
    @Autowired
    private JdbcClient jdbc;
    @Autowired
    private Clock clock;

    private Donor jana;
    private Donor petr;

    @BeforeEach
    void twoAdministrators() {
        new DatabaseCleaner(jdbc).emptyAllTables();
        Instant now = clock.instant();
        jana = administrator("Jana Nováková", "jana@example.cz", "4821937560", now);
        petr = administrator("Petr Svoboda", "petr@example.cz", "4821937561", now);
        inTransaction(() -> {
            donors.save(jana);
            donors.save(petr);
        });
    }

    @Test
    @DisplayName("Given the only two administrators, when each takes the role from the other at the same moment, then the second revoke waits for the first, is refused because no administrator would be left, and one administrator remains")
    void should_refuse_the_second_and_keep_one_administrator_when_two_administrators_revoke_each_other_at_once() throws Exception {
        CountDownLatch revoked = new CountDownLatch(1);
        CountDownLatch commit = new CountDownLatch(1);
        ExecutorService callers = Executors.newFixedThreadPool(2);
        try {
            Future<?> first = callers.submit(() -> inTransaction(() -> {
                administrators.revoke(jana.id(), petr.id());
                revoked.countDown();
                waitFor(commit);
            }));
            assertThat(revoked.await(30, TimeUnit.SECONDS)).isTrue();
            Future<?> second = callers.submit(() -> administrators.revoke(petr.id(), jana.id()));
            await().atMost(Duration.ofSeconds(30)).until(() -> waitingOnLocks() > 0);
            commit.countDown();
            first.get(30, TimeUnit.SECONDS);

            assertThatThrownBy(() -> second.get(30, TimeUnit.SECONDS)).isInstanceOf(ExecutionException.class).cause()
                    .isInstanceOf(LastAdministratorRevoked.class);
        } finally {
            commit.countDown();
            callers.shutdownNow();
        }
        assertThat(donors.findAdministrators()).extracting(Donor::id).containsExactly(jana.id());
    }

    private Donor administrator(String name, String email, String variableSymbol, Instant at) {
        Donor donor = Donor.register(DonorId.newId(at), DonorType.PERSON, name, null, new PostalAddress("Dlouhá 12", "Ústí nad Labem", "400 01"),
                new EmailAddress(email), new PasswordHash("$hash"), new VariableSymbol(variableSymbol), LocaleCode.CS, at);
        donor.verifyEmail(at);
        donor.grantAdministration(true);
        return donor;
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
