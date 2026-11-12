package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.IntegrationTest;
import cz.novanadeje.app.donors.domain.AuthorizationCode;
import cz.novanadeje.app.donors.domain.AuthorizationCodeRepository;
import cz.novanadeje.app.donors.domain.ClientId;
import cz.novanadeje.app.donors.domain.CodeChallenge;
import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.DonorRepository;
import cz.novanadeje.app.donors.domain.LinkSecret;
import cz.novanadeje.app.donors.domain.OAuthScope;
import cz.novanadeje.app.donors.domain.PasswordHash;
import cz.novanadeje.app.donors.domain.SecondFactor;
import cz.novanadeje.app.donors.domain.SecondFactorChallenge;
import cz.novanadeje.app.donors.domain.SecondFactorChallengeRepository;
import cz.novanadeje.app.donors.domain.SecondFactorRecovery;
import cz.novanadeje.app.donors.domain.SecondFactorRecoveryRepository;
import cz.novanadeje.app.donors.domain.SecondFactorRepository;
import cz.novanadeje.app.donors.domain.Totp;
import cz.novanadeje.app.donors.domain.TotpSecret;
import cz.novanadeje.app.shared.application.event.DonorRegistered;
import cz.novanadeje.app.shared.domain.DonorType;
import cz.novanadeje.app.shared.domain.EmailAddress;
import cz.novanadeje.app.shared.domain.LocaleCode;
import cz.novanadeje.app.shared.domain.PostalAddress;
import cz.novanadeje.app.shared.domain.SecondFactorRecoveryCode;
import cz.novanadeje.app.shared.domain.VariableSymbol;
import cz.novanadeje.app.support.DatabaseCleaner;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.net.URI;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

@IntegrationTest
class OneTimeSecretsConcurrencyTest {

    private static final TotpSecret SECRET = new TotpSecret("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    private static final String CODE_CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";

    @Autowired
    private SecondFactorRecoveryService recoveryService;
    @Autowired
    private DonorErasureService erasures;
    @Autowired
    private DonorRepository donors;
    @Autowired
    private SecondFactorRepository secondFactors;
    @Autowired
    private SecondFactorChallengeRepository challenges;
    @Autowired
    private SecondFactorRecoveryRepository recoveries;
    @Autowired
    private AuthorizationCodeRepository authorizationCodes;
    @Autowired
    private ApplicationEventPublisher events;
    @Autowired
    private PlatformTransactionManager transactionManager;
    @Autowired
    private JdbcClient jdbc;
    @Autowired
    private Clock clock;

    private Donor jana;
    private Donor petr;

    @BeforeEach
    void anAdministratorAndADonorWithTheCodeFromTheAppAndAProvenAccount() {
        new DatabaseCleaner(jdbc).emptyAllTables();
        Instant now = clock.instant();
        jana = verified("Jana Nováková", "jana@example.cz", "4821937560", now);
        jana.grantAdministration();
        petr = verified("Petr Svoboda", "petr@example.cz", "4821937561", now);
        inTransaction(() -> {
            donors.save(jana);
            donors.save(petr);
            events.publishEvent(new DonorRegistered(petr.id().value(), petr.type(), petr.name(), Optional.empty(), petr.address(), petr.email(),
                    petr.variableSymbol(), petr.preferredLocale(), petr.registeredAt()));
            secondFactors.save(SecondFactor.reconstitute(petr.id(), SECRET, now.minusSeconds(600), now.minusSeconds(600), Totp.stepAt(now) - 2));
        });
        provenAccountOf(petr, now.minus(Duration.ofDays(8)));
    }

    @Test
    @DisplayName("Given a donor who lost the authenticator, when the recovery by payment is started twice at the same moment, then both starts show the same code and only one recovery is open")
    void should_show_one_code_and_open_one_recovery_when_started_twice_at_once() throws Exception {
        LinkSecret challenge = challengeOf(petr);
        CountDownLatch tableHeld = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        ExecutorService callers = Executors.newFixedThreadPool(3);
        try {
            Future<?> holder = callers.submit(() -> new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
                jdbc.sql("lock table donor_second_factor_recovery in share mode").update();
                tableHeld.countDown();
                waitFor(release);
            }));
            assertThat(tableHeld.await(30, TimeUnit.SECONDS)).isTrue();

            List<Future<SecondFactorRecoveryInstructions>> starts = List.of(
                    callers.submit(() -> recoveryService.start(challenge.value())),
                    callers.submit(() -> recoveryService.start(challenge.value())));
            await().until(() -> waitingOnLocks() >= 2);
            release.countDown();
            holder.get(30, TimeUnit.SECONDS);

            SecondFactorRecoveryInstructions first = starts.get(0).get(30, TimeUnit.SECONDS);
            SecondFactorRecoveryInstructions second = starts.get(1).get(30, TimeUnit.SECONDS);
            assertThat(first.message()).isEqualTo(second.message());
            assertThat(List.of(first.resumed(), second.resumed())).containsExactlyInAnyOrder(false, true);
            assertThat(jdbc.sql("select count(*) from donor_second_factor_recovery where donor_id = ? and used_at is null").param(petr.id().value())
                    .query(Long.class).single()).isOne();
        } finally {
            release.countDown();
            callers.shutdownNow();
        }
    }

    @Test
    @DisplayName("Given a donor's challenge, recovery and authorization code held by a sign-in, a payment and an exchange in flight, and one more of each, when the donor is erased meanwhile, then the erasure does not wait for them and deletes only the ones nobody holds")
    void should_delete_only_unheld_secrets_without_waiting_when_erased_given_secrets_held_by_use_cases_in_flight() throws Exception {
        Instant now = clock.instant();
        LinkSecret heldChallenge = challengeOf(petr);
        LinkSecret freeChallenge = challengeOf(petr);
        SecondFactorRecoveryCode heldCode = new SecondFactorRecoveryCode("ABCD2345");
        SecondFactorRecoveryCode freeCode = new SecondFactorRecoveryCode("WXYZ6789");
        inTransaction(() -> {
            recoveries.replaceOpenOf(petr.id(), SecondFactorRecovery.open(petr.id(), freeCode, now.minusSeconds(60), Duration.ofDays(14)));
            recoveries.markUsed(recoveries.findByCodeHash(freeCode.hash()).orElseThrow().id(), now.minusSeconds(30));
            recoveries.replaceOpenOf(petr.id(), SecondFactorRecovery.open(petr.id(), heldCode, now, Duration.ofDays(14)));
        });
        AuthorizationCode heldExchange = authorizationCodeOf(petr, now);
        AuthorizationCode freeExchange = authorizationCodeOf(petr, now);
        CountDownLatch rowsHeld = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        ExecutorService callers = Executors.newFixedThreadPool(2);
        try {
            Future<?> holder = callers.submit(() -> new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
                jdbc.sql("select id from donor_second_factor_challenge where secret_hash = ? for update").param(heldChallenge.hash()).query(UUID.class).single();
                jdbc.sql("select id from donor_second_factor_recovery where code_hash = ? for update").param(heldCode.hash()).query(UUID.class).single();
                jdbc.sql("select id from oauth_authorization_code where id = ? for update").param(heldExchange.id()).query(UUID.class).single();
                rowsHeld.countDown();
                waitFor(release);
            }));
            assertThat(rowsHeld.await(30, TimeUnit.SECONDS)).isTrue();

            callers.submit(() -> erasures.erase(jana.id(), petr.id())).get(30, TimeUnit.SECONDS);

            release.countDown();
            holder.get(30, TimeUnit.SECONDS);
        } finally {
            release.countDown();
            callers.shutdownNow();
        }
        assertThat(challenges.findBySecretHash(freeChallenge.hash())).isEmpty();
        assertThat(recoveries.findByCodeHash(freeCode.hash())).isEmpty();
        assertThat(authorizationCodes.findBySecretHash(freeExchange.secretHash())).isEmpty();
        assertThat(challenges.findBySecretHash(heldChallenge.hash())).isPresent();
        assertThat(recoveries.findByCodeHash(heldCode.hash())).isPresent();
        assertThat(authorizationCodes.findBySecretHash(heldExchange.secretHash())).isPresent();
    }

    private LinkSecret challengeOf(Donor donor) {
        LinkSecret secret = LinkSecret.generate();
        inTransaction(() -> challenges.save(SecondFactorChallenge.issue(secret, donor.id(), clock.instant(), Duration.ofMinutes(5))));
        return secret;
    }

    private AuthorizationCode authorizationCodeOf(Donor donor, Instant at) {
        AuthorizationCode code = AuthorizationCode.issue(LinkSecret.generate(), donor.id(), new ClientId("https://claude.ai/oauth/mcp-oauth-client-metadata"),
                URI.create("https://claude.ai/api/mcp/auth_callback"), new CodeChallenge(CODE_CHALLENGE, "S256"), Set.of(OAuthScope.ADMIN_READ),
                "https://nfnn.cz/mcp", true, at, Duration.ofMinutes(5));
        inTransaction(() -> authorizationCodes.save(code));
        return code;
    }

    private void provenAccountOf(Donor donor, Instant provedAt) {
        UUID payment = UUID.randomUUID();
        jdbc.sql("insert into bank_payment (id, bank_transaction_id, booked_on, amount_minor, currency, sender_account_number, sender_bank_code, "
                        + "counterparty_account, counterparty_bank_code, counterparty_name, variable_symbol, matching_variable_symbol, constant_symbol, "
                        + "specific_symbol, message_for_recipient, transaction_type, imported_at, unpaired_by_admin_at) values (:id, 4242, :booked, "
                        + "50000, 'CZK', '2000145399', '0800', '2000145399', '0800', null, null, null, null, null, null, 'Bezhotovostní příjem', :at, null)")
                .param("id", payment)
                .param("booked", LocalDate.ofInstant(provedAt, ZoneOffset.UTC))
                .param("at", Timestamp.from(provedAt))
                .update();
        jdbc.sql("insert into donor_sender_account (id, donor_id, account_number, bank_code, learned_from_payment_id, learned_at, status, valid_from, valid_to, "
                        + "created_at, disconnected_at) values (:id, :donor, '2000145399', '0800', :payment, :at, 'ACTIVE', null, null, :at, null)")
                .param("id", UUID.randomUUID())
                .param("donor", donor.id().value())
                .param("payment", payment)
                .param("at", Timestamp.from(provedAt))
                .update();
    }

    private Donor verified(String name, String email, String variableSymbol, Instant at) {
        Donor donor = Donor.register(DonorId.newId(at), DonorType.PERSON, name, null, new PostalAddress("Dlouhá 12", "Ústí nad Labem", "400 01"),
                new EmailAddress(email), new PasswordHash("$hash"), new VariableSymbol(variableSymbol), LocaleCode.CS, at);
        donor.verifyEmail(at);
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
