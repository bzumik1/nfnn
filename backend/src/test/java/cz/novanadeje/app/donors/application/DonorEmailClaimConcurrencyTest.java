package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.IntegrationTest;
import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.DonorRepository;
import cz.novanadeje.app.donors.domain.EmailVerificationToken;
import cz.novanadeje.app.donors.domain.EmailVerificationTokenRepository;
import cz.novanadeje.app.donors.domain.InvalidEmailVerificationToken;
import cz.novanadeje.app.donors.domain.LinkSecret;
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
import java.util.Optional;
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
class DonorEmailClaimConcurrencyTest {

    private static final String NEW_ADDRESS = "nova.adresa@example.cz";
    private static final PostalAddress ADDRESS = new PostalAddress("Dlouhá 12", "Ústí nad Labem", "400 01");

    @Autowired
    private DonorRegistrationService registrations;
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
    private Donor petr;

    @BeforeEach
    void twoVerifiedDonors() {
        new DatabaseCleaner(jdbc).emptyAllTables();
        jana = verified("Jana Nováková", "jana@example.cz", "4821937560");
        petr = verified("Petr Svoboda", "petr@example.cz", "4821937561");
        inTransaction(() -> {
            donors.save(jana);
            donors.save(petr);
        });
    }

    @Test
    @DisplayName("Given a registration of a new address written but not committed yet, when the same address registers again meanwhile, then the second is answered as a repeated registration and one account holds the address")
    void should_answer_second_as_repeated_registration_when_registered_twice_at_once_given_new_address() throws Exception {
        Future<?> second = whileHeldBy(() -> registrations.register(registration()), () -> registrations.register(registration()));

        second.get(30, TimeUnit.SECONDS);
        assertThat(accountsWith(NEW_ADDRESS)).isEqualTo(1);
        assertThat(jdbc.sql("select email_verified_at is null from donor where email = ?").param(NEW_ADDRESS).query(Boolean.class).single()).isTrue();
    }

    @Test
    @DisplayName("Given two donors confirming a change to the same new address, when the second confirms while the first is not committed yet, then the second link is refused and only the first donor holds the address")
    void should_refuse_second_change_when_confirmed_at_once_given_same_new_address() {
        LinkSecret janasLink = changeLink(jana, NEW_ADDRESS);
        LinkSecret petrsLink = changeLink(petr, NEW_ADDRESS);

        Future<?> second = whileHeldBy(() -> emailVerification.confirmChange(janasLink.value()), () -> emailVerification.confirmChange(petrsLink.value()));

        assertThatThrownBy(() -> second.get(30, TimeUnit.SECONDS))
                .isInstanceOf(ExecutionException.class)
                .hasCauseInstanceOf(InvalidEmailVerificationToken.class);
        assertThat(accountsWith(NEW_ADDRESS)).isEqualTo(1);
        assertThat(jdbc.sql("select id from donor where email = ?").param(NEW_ADDRESS).query(UUID.class).single()).isEqualTo(jana.id().value());
    }

    @Test
    @DisplayName("Given a donor's change to a new address confirmed but not committed yet, when the same address registers meanwhile, then the registration is answered as a repeated one and the donor keeps the address")
    void should_answer_registration_as_repeated_when_registered_during_change_given_same_new_address() throws Exception {
        LinkSecret janasLink = changeLink(jana, NEW_ADDRESS);

        Future<?> registration = whileHeldBy(() -> emailVerification.confirmChange(janasLink.value()), () -> registrations.register(registration()));

        registration.get(30, TimeUnit.SECONDS);
        assertThat(accountsWith(NEW_ADDRESS)).isEqualTo(1);
        assertThat(jdbc.sql("select id from donor where email = ?").param(NEW_ADDRESS).query(UUID.class).single()).isEqualTo(jana.id().value());
    }

    private Future<?> whileHeldBy(Runnable firstWriter, Runnable secondWriter) {
        CountDownLatch written = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        ExecutorService callers = Executors.newFixedThreadPool(2);
        try {
            Future<?> first = callers.submit(() -> inTransaction(() -> {
                firstWriter.run();
                entityManager.flush();
                written.countDown();
                waitFor(release);
            }));
            assertThat(written.await(30, TimeUnit.SECONDS)).isTrue();
            Future<?> second = callers.submit(secondWriter);
            await().until(() -> waitingForLocks() >= 1);
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

    private RegisterDonorCommand registration() {
        return new RegisterDonorCommand(DonorType.PERSON, "Eva Malá", null, "Krátká 3", "Most", "434 01", NEW_ADDRESS, "a brand new horse battery",
                "cs", Optional.empty());
    }

    private LinkSecret changeLink(Donor donor, String newAddress) {
        LinkSecret secret = LinkSecret.generate();
        inTransaction(() -> tokens.save(EmailVerificationToken.issueForChange(secret, donor.id(), new EmailAddress(newAddress), clock.instant(),
                Duration.ofHours(1))));
        return secret;
    }

    private long accountsWith(String email) {
        return jdbc.sql("select count(*) from donor where email = ?").param(email).query(Long.class).single();
    }

    private long waitingForLocks() {
        return jdbc.sql("select count(*) from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock'")
                .query(Long.class).single();
    }

    private Donor verified(String name, String email, String symbol) {
        Instant now = clock.instant();
        Donor donor = Donor.register(DonorId.newId(now), DonorType.PERSON, name, null, ADDRESS, new EmailAddress(email), null,
                new VariableSymbol(symbol), LocaleCode.CS, now);
        donor.verifyEmail(now);
        return donor;
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
