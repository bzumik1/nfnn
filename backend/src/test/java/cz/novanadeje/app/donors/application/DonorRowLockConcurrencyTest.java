package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.shared.application.version.ExpectedVersion;
import cz.novanadeje.app.IntegrationTest;
import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorAlreadyErased;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.DonorRepository;
import cz.novanadeje.app.donors.domain.LastSignInMethod;
import cz.novanadeje.app.donors.domain.LinkSecret;
import cz.novanadeje.app.donors.domain.Passkey;
import cz.novanadeje.app.donors.domain.PasskeyRepository;
import cz.novanadeje.app.donors.domain.PasswordHash;
import cz.novanadeje.app.donors.domain.PasswordResetToken;
import cz.novanadeje.app.donors.domain.PasswordResetTokenRepository;
import cz.novanadeje.app.donors.domain.Role;
import cz.novanadeje.app.shared.application.event.DonorRegistered;
import cz.novanadeje.app.shared.domain.DonorName;
import cz.novanadeje.app.shared.domain.DonorType;
import cz.novanadeje.app.shared.domain.EmailAddress;
import cz.novanadeje.app.shared.domain.ErasedPersonalData;
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
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.Set;
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
class DonorRowLockConcurrencyTest {

    private static final PostalAddress ADDRESS = new PostalAddress("Dlouhá 12", "Ústí nad Labem", "400 01");
    private static final UpdateDonorProfileCommand NEW_PROFILE = new UpdateDonorProfileCommand("Petr Svoboda", "Krátká 3", "Most", "434 01", null);
    private static final String OLD_HASH = "$old-hash";

    @Autowired
    private DonorProfileService profiles;
    @Autowired
    private DonorPasswordResetService passwordResets;
    @Autowired
    private DonorErasureService erasures;
    @Autowired
    private DonorPasskeyService passkeyService;
    @Autowired
    private DonorRepository donors;
    @Autowired
    private PasswordResetTokenRepository resetTokens;
    @Autowired
    private PasskeyRepository passkeys;
    @Autowired
    private ApplicationEventPublisher events;
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
    void twoDonors() {
        new DatabaseCleaner(jdbc).emptyAllTables();
        jana = verified("Jana Nováková", "jana@example.cz", "4821937560", new PasswordHash(OLD_HASH));
        jana.grantAdministration(true);
        petr = verified("Petr Svoboda", "petr@example.cz", "4821937561", new PasswordHash(OLD_HASH));
        inTransaction(() -> {
            donors.save(jana);
            donors.save(petr);
            events.publishEvent(new DonorRegistered(petr.id().value(), petr.type(), petr.name(), Optional.empty(), petr.address(), petr.email(),
                    petr.variableSymbol(), petr.preferredLocale(), petr.registeredAt()));
        });
    }

    @Test
    @DisplayName("Given a password reset written but not committed yet, when the donor's other tab saves the profile meanwhile, then the new password and the new name both stay")
    void should_keep_new_password_when_profile_saved_during_reset_given_reset_not_committed() throws Exception {
        LinkSecret link = LinkSecret.generate();
        inTransaction(() -> resetTokens.save(PasswordResetToken.issue(link, petr.id(), clock.instant(), Duration.ofHours(1))));

        Future<?> profileSave = whileHeldBy(() -> passwordResets.confirmReset(link.value(), "a brand new horse battery"),
                () -> profiles.updateProfile(petr.id(), Set.of(Role.DONOR), NEW_PROFILE, ExpectedVersion.none()));

        profileSave.get(30, TimeUnit.SECONDS);
        assertThat(column("password_hash")).isNotEqualTo(OLD_HASH).startsWith("$2");
        assertThat(column("street")).isEqualTo("Krátká 3");
    }

    @Test
    @DisplayName("Given an erasure written but not committed yet, when the donor's open tab saves the profile meanwhile, then the save is refused as already erased and neither the account nor the donations record gets the personal data back")
    void should_refuse_profile_and_keep_erasure_when_saved_during_erasure_given_erasure_not_committed() {
        Future<?> profileSave = whileHeldBy(() -> erasures.erase(jana.id(), petr.id()),
                () -> profiles.updateProfile(petr.id(), Set.of(Role.DONOR), NEW_PROFILE, ExpectedVersion.none()));

        assertThatThrownBy(() -> profileSave.get(30, TimeUnit.SECONDS))
                .isInstanceOf(ExecutionException.class)
                .hasCauseInstanceOf(DonorAlreadyErased.class);
        assertThat(jdbc.sql("select erased_at is not null from donor where id = ?").param(petr.id().value()).query(Boolean.class).single()).isTrue();
        assertThat(column("name")).isEqualTo(ErasedPersonalData.NAME);
        assertThat(column("street")).isEqualTo(ErasedPersonalData.ADDRESS.street());
        assertThat(column("email")).isEqualTo(ErasedPersonalData.emailFor(petr.id().value()).value());
        assertThat(column("password_hash")).isNull();
        assertThat(jdbc.sql("select name from donor_record where donor_id = ?").param(petr.id().value()).query(String.class).single())
                .isEqualTo(ErasedPersonalData.NAME);
        assertThat(jdbc.sql("select street from donor_record where donor_id = ?").param(petr.id().value()).query(String.class).single())
                .isEqualTo(ErasedPersonalData.ADDRESS.street());
    }

    @Test
    @DisplayName("Given a donor without a password and with two passkeys, when both are removed at the same moment, then one goes, the other is refused as the last sign-in method and one passkey stays")
    void should_keep_one_passkey_when_both_removed_at_once_given_no_password() throws Exception {
        Donor eva = verified("Eva Malá", "eva@example.cz", "4821937562", null);
        Passkey phone = passkey(eva, "credential-phone");
        Passkey laptop = passkey(eva, "credential-laptop");
        inTransaction(() -> {
            donors.save(eva);
            passkeys.save(phone);
            passkeys.save(laptop);
        });
        CountDownLatch rowsHeld = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        ExecutorService callers = Executors.newFixedThreadPool(3);
        try {
            Future<?> holder = callers.submit(() -> inTransaction(() -> {
                jdbc.sql("select id from donor_passkey where donor_id = ? for update").param(eva.id().value()).query(Object.class).list();
                rowsHeld.countDown();
                waitFor(release);
            }));
            assertThat(rowsHeld.await(30, TimeUnit.SECONDS)).isTrue();

            List<Future<?>> removals = List.of(
                    callers.submit(() -> passkeyService.remove(eva.id(), true, phone.id())),
                    callers.submit(() -> passkeyService.remove(eva.id(), true, laptop.id())));
            await().until(() -> waitingForLocks() >= 2);
            release.countDown();
            holder.get(30, TimeUnit.SECONDS);

            int removed = 0;
            int refused = 0;
            for (Future<?> removal : removals) {
                try {
                    removal.get(30, TimeUnit.SECONDS);
                    removed++;
                } catch (ExecutionException failed) {
                    assertThat(failed.getCause()).isInstanceOf(LastSignInMethod.class);
                    refused++;
                }
            }
            assertThat(removed).isEqualTo(1);
            assertThat(refused).isEqualTo(1);
            assertThat(jdbc.sql("select count(*) from donor_passkey where donor_id = ?").param(eva.id().value()).query(Long.class).single())
                    .isEqualTo(1);
        } finally {
            release.countDown();
            callers.shutdownNow();
        }
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

    private long waitingForLocks() {
        return jdbc.sql("select count(*) from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock'")
                .query(Long.class).single();
    }

    private String column(String name) {
        return jdbc.sql("select " + name + " from donor where id = ?").param(petr.id().value()).query(String.class).optional().orElse(null);
    }

    private Donor verified(String name, String email, String symbol, PasswordHash hash) {
        Instant now = clock.instant();
        Donor donor = Donor.register(DonorId.newId(now), DonorType.PERSON, new DonorName(name), null, ADDRESS, new EmailAddress(email), hash,
                new VariableSymbol(symbol), LocaleCode.CS, now);
        donor.verifyEmail(now);
        return donor;
    }

    private Passkey passkey(Donor owner, String credentialId) {
        return Passkey.register(owner.id(), credentialId, new byte[]{1, 2, 3}, 0, List.of("internal"), credentialId, "localhost", clock.instant());
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
