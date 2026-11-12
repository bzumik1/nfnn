package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.IntegrationTest;
import cz.novanadeje.app.donations.application.importing.BankStatement;
import cz.novanadeje.app.donations.application.importing.BankStatementRecorder;
import cz.novanadeje.app.donations.application.importing.ImportCounts;
import cz.novanadeje.app.donations.domain.bank.BankTransactionId;
import cz.novanadeje.app.donations.domain.bank.IncomingMovement;
import cz.novanadeje.app.donations.domain.bank.SenderAccount;
import cz.novanadeje.app.donations.domain.importing.ImportPeriod;
import cz.novanadeje.app.donations.domain.importing.ImportPlan;
import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.DonorRepository;
import cz.novanadeje.app.donors.domain.PasswordHash;
import cz.novanadeje.app.donors.domain.SecondFactor;
import cz.novanadeje.app.donors.domain.SecondFactorRecovery;
import cz.novanadeje.app.donors.domain.SecondFactorRecoveryRepository;
import cz.novanadeje.app.donors.domain.SecondFactorRepository;
import cz.novanadeje.app.donors.domain.Totp;
import cz.novanadeje.app.donors.domain.TotpSecret;
import cz.novanadeje.app.shared.application.event.DonorRegistered;
import cz.novanadeje.app.shared.domain.DonorType;
import cz.novanadeje.app.shared.domain.EmailAddress;
import cz.novanadeje.app.shared.domain.LocaleCode;
import cz.novanadeje.app.shared.domain.Money;
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

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

@IntegrationTest
class SecondFactorRecoveryImportConcurrencyTest {

    private static final TotpSecret SECRET = new TotpSecret("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    private static final SenderAccount ACCOUNT = new SenderAccount("2000145399", "0800");
    private static final SecondFactorRecoveryCode CODE = new SecondFactorRecoveryCode("ABCD2345");

    @Autowired
    private DonorErasureService erasures;
    @Autowired
    private BankStatementRecorder recorder;
    @Autowired
    private DonorRepository donors;
    @Autowired
    private SecondFactorRepository secondFactors;
    @Autowired
    private SecondFactorRecoveryRepository recoveries;
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
    void anAdministratorAndADonorWithAProvenAccountWhoStartedTheRecoveryByPayment() {
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
            recoveries.replaceOpenOf(petr.id(), SecondFactorRecovery.open(petr.id(), CODE, now.minusSeconds(60), Duration.ofDays(14)));
        });
        provenAccountOf(petr, now.minus(Duration.ofDays(8)));
    }

    @Test
    @DisplayName("Given an erasure of a donor that has done its work and waits to commit, when the bank import brings the donor's recovery payment meanwhile, then both commit without a deadlock, the erasure stands and the import records the payment")
    void should_commit_both_without_a_deadlock_when_the_recovery_payment_arrives_given_an_erasure_of_the_donor_in_flight() throws Exception {
        LocalDate today = LocalDate.ofInstant(clock.instant(), ZoneOffset.UTC);
        CountDownLatch erased = new CountDownLatch(1);
        CountDownLatch commit = new CountDownLatch(1);
        ExecutorService callers = Executors.newFixedThreadPool(2);
        try {
            Future<?> erasure = callers.submit(() -> inTransaction(() -> {
                erasures.erase(jana.id(), petr.id());
                erased.countDown();
                waitFor(commit);
            }));
            assertThat(erased.await(30, TimeUnit.SECONDS)).isTrue();
            Future<ImportCounts> importRun = callers.submit(() -> recorder.record(
                    new BankStatement(new ImportPeriod(today.minusDays(1), today), Optional.empty(), List.of(recoveryPayment(today)), 1, Optional.empty()),
                    new ImportPlan(new ImportPeriod(today.minusDays(1), today), false), clock.instant()));
            await().atMost(Duration.ofSeconds(30)).until(() -> waitingOnLocks() > 0);
            commit.countDown();

            erasure.get(30, TimeUnit.SECONDS);
            assertThat(importRun.get(30, TimeUnit.SECONDS).incomingNew()).isOne();
        } finally {
            commit.countDown();
            callers.shutdownNow();
        }
        assertThat(donors.findById(petr.id()).orElseThrow().isErased()).isTrue();
        assertThat(jdbc.sql("select count(*) from bank_payment where bank_transaction_id = 4243").query(Long.class).single()).isOne();
        assertThat(recoveries.findByCodeHash(CODE.hash())).isEmpty();
    }

    private static IncomingMovement recoveryPayment(LocalDate bookedOn) {
        return IncomingMovement.of(new BankTransactionId(4243), bookedOn, Money.czk(100), Optional.of(ACCOUNT), Optional.of(ACCOUNT.accountNumber()),
                Optional.of(ACCOUNT.bankCode()), Optional.empty(), Optional.empty(), Optional.empty(), Optional.empty(), Optional.of(CODE.message()),
                "Bezhotovostní příjem");
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
