package cz.novanadeje.app.donations.application.pairing;

import cz.novanadeje.app.TestcontainersConfiguration;
import cz.novanadeje.app.donations.application.importing.BankStatement;
import cz.novanadeje.app.donations.application.importing.BankStatementRecorder;
import cz.novanadeje.app.donations.application.importing.ImportCounts;
import cz.novanadeje.app.donations.domain.bank.BankPayment;
import cz.novanadeje.app.donations.domain.bank.BankPaymentRepository;
import cz.novanadeje.app.donations.domain.bank.BankTransactionId;
import cz.novanadeje.app.donations.domain.bank.IncomingMovement;
import cz.novanadeje.app.donations.domain.bank.SenderAccount;
import cz.novanadeje.app.donations.domain.donation.Donation;
import cz.novanadeje.app.donations.domain.donation.DonationId;
import cz.novanadeje.app.donations.domain.donation.DonationRepository;
import cz.novanadeje.app.donations.domain.donation.PairingMethod;
import cz.novanadeje.app.donations.domain.donor.DonorRecord;
import cz.novanadeje.app.donations.domain.donor.DonorRecordRepository;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.donations.domain.donor.ExcludedSenderAccounts;
import cz.novanadeje.app.donations.domain.donor.SymbolClaim;
import cz.novanadeje.app.donations.domain.donor.SymbolClaimAnswer;
import cz.novanadeje.app.donations.domain.donor.SymbolClaimId;
import cz.novanadeje.app.donations.domain.donor.SymbolClaimRepository;
import cz.novanadeje.app.donations.domain.importing.BankImportStateRepository;
import cz.novanadeje.app.donations.domain.importing.ImportCoverage;
import cz.novanadeje.app.donations.domain.importing.ImportPeriod;
import cz.novanadeje.app.donations.domain.importing.ImportPlan;
import cz.novanadeje.app.shared.domain.LocaleCode;
import cz.novanadeje.app.shared.domain.Money;
import cz.novanadeje.app.shared.domain.PostalAddress;
import cz.novanadeje.app.shared.domain.UuidV7;
import cz.novanadeje.app.shared.domain.VariableSymbol;
import cz.novanadeje.app.support.DatabaseCleaner;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.IllegalTransactionStateException;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

import static cz.novanadeje.app.donations.BankPayments.payment;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.awaitility.Awaitility.await;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = {"app.donations.fio.token=", "app.donations.report.cron=-", "app.contact.retention.cron=-", "app.content.media-cleanup.cron=-", "app.operations.backups.check-cron=-", "app.donors.registration-reminder.cron=-"})
class SymbolClaimPairingConcurrencyTest {

    private static final SenderAccount ACCOUNT = new SenderAccount("1234567", "0800");
    private static final String JANAS_SYMBOL = "4821937560";
    private static final VariableSymbol OLD_SYMBOL = new VariableSymbol("6123456789");
    private static final ImportPeriod REQUESTED = new ImportPeriod(LocalDate.of(2026, 10, 1), LocalDate.of(2026, 10, 21));
    private static final List<Long> OLD_PAYMENTS = List.of(9102L, 9103L, 9104L, 9105L, 9106L);

    @Autowired
    private PaymentPairingService pairing;
    @Autowired
    private BankStatementRecorder recorder;
    @Autowired
    private PairingLock lock;
    @Autowired
    private SymbolClaimRepository claims;
    @Autowired
    private DonorRecordRepository donorRecords;
    @Autowired
    private BankPaymentRepository payments;
    @Autowired
    private DonationRepository donations;
    @Autowired
    private BankImportStateRepository importStates;
    @Autowired
    private PlatformTransactionManager transactionManager;
    @Autowired
    private JdbcClient jdbc;

    @AfterEach
    void cleanTables() {
        new DatabaseCleaner(jdbc).truncateAllTables();
    }

    @Test
    @DisplayName("Given unpaired payments with an old symbol from a donor's proved account, when her confirmation and an import pair them at the same moment, then each payment gets exactly one donation, neither call fails, the coverage grows and the claim is stored")
    void should_pair_each_payment_once_when_confirmation_and_import_run_together_given_unpaired_old_symbol_payments() throws Exception {
        DonorReference jana = storedJanaWithProvedAccount();
        storedOldSymbolPayments();
        SymbolClaim claim = confirmedClaim(jana);
        Instant now = Instant.now();
        CountDownLatch start = new CountDownLatch(1);
        Callable<ConfirmedSymbolPairing> confirming = () -> {
            start.await();
            return confirm(claim, now);
        };
        Callable<ImportCounts> importing = () -> {
            start.await();
            return recorder.record(statementWith(movement(9107, LocalDate.of(2026, 10, 20))), new ImportPlan(REQUESTED, false), now);
        };

        ExecutorService callers = Executors.newFixedThreadPool(2);
        try {
            Future<ConfirmedSymbolPairing> confirmation = callers.submit(confirming);
            Future<ImportCounts> importRun = callers.submit(importing);
            start.countDown();

            ConfirmedSymbolPairing confirmed = confirmation.get(60, TimeUnit.SECONDS);
            ImportCounts imported = importRun.get(60, TimeUnit.SECONDS);

            assertThat(confirmed.count() + imported.pairedByConfirmedSymbol()).isEqualTo(6);
        } finally {
            callers.shutdownNow();
        }
        assertThat(donationsPerPayment()).hasSize(7).allSatisfy((transactionId, count) -> assertThat(count).isEqualTo(1));
        assertThat(confirmedSymbolDonations()).isEqualTo(6);
        assertThat(importStates.current().coverage()).isEqualTo(ImportCoverage.of(REQUESTED));
        assertThat(claims.findByDonor(jana)).extracting(SymbolClaim::id).containsExactly(claim.id());
    }

    @Test
    @DisplayName("Given a confirmation that holds the pairing lock until it commits, when an import pairs at the same time, then the import waits and afterwards pairs its new payment by the confirmed symbol")
    void should_wait_and_pair_by_confirmed_symbol_when_import_runs_given_confirmation_holding_lock() throws Exception {
        DonorReference jana = storedJanaWithProvedAccount();
        storedOldSymbolPayments();
        SymbolClaim claim = confirmedClaim(jana);
        Instant now = Instant.now();
        CountDownLatch paired = new CountDownLatch(1);
        CountDownLatch commit = new CountDownLatch(1);
        TransactionTemplate separately = new TransactionTemplate(transactionManager);

        ExecutorService threads = Executors.newFixedThreadPool(2);
        try {
            Future<ConfirmedSymbolPairing> confirmation = threads.submit(() -> separately.execute(status -> {
                ConfirmedSymbolPairing result = confirmWithinTransaction(claim, now);
                paired.countDown();
                awaitRelease(commit);
                return result;
            }));
            assertThat(paired.await(30, TimeUnit.SECONDS)).isTrue();
            Future<ImportCounts> importRun = threads.submit(() -> recorder.record(statementWith(movement(9107, LocalDate.of(2026, 10, 20))),
                    new ImportPlan(REQUESTED, false), now));
            await().atMost(Duration.ofSeconds(30)).until(() -> sessionsWaitingForAdvisoryLock() > 0);
            assertThat(importRun).isNotDone();
            commit.countDown();

            assertThat(confirmation.get(30, TimeUnit.SECONDS).count()).isEqualTo(5);
            ImportCounts imported = importRun.get(60, TimeUnit.SECONDS);

            assertThat(imported.pairedByConfirmedSymbol()).isEqualTo(1);
            assertThat(imported.leftUnpaired()).isZero();
        } finally {
            commit.countDown();
            threads.shutdownNow();
        }
        assertThat(donationsPerPayment()).hasSize(7).allSatisfy((transactionId, count) -> assertThat(count).isEqualTo(1));
        assertThat(confirmedSymbolDonations()).isEqualTo(6);
    }

    @Test
    @DisplayName("Given no transaction, when the pairing lock is taken, then it is refused, so it is never released before the pairing commits")
    void should_refuse_when_taken_given_no_transaction() {
        assertThatThrownBy(() -> lock.acquire()).isInstanceOf(IllegalTransactionStateException.class);
    }

    private ConfirmedSymbolPairing confirm(SymbolClaim claim, Instant now) {
        return new TransactionTemplate(transactionManager).execute(status -> confirmWithinTransaction(claim, now));
    }

    private ConfirmedSymbolPairing confirmWithinTransaction(SymbolClaim claim, Instant now) {
        lock.acquire();
        claims.saveIfAbsent(claim);
        return pairing.pairConfirmedSymbol(claim, now);
    }

    private DonorReference storedJanaWithProvedAccount() {
        Instant now = Instant.now();
        DonorRecord jana = DonorRecord.registerPerson(new DonorReference(UuidV7.generate(now)), "Jana Nováková",
                new PostalAddress("Dlouhá 12", "Ústí nad Labem", "400 01"), new VariableSymbol(JANAS_SYMBOL), LocaleCode.CS, now);
        BankPayment proof = payment(9101, LocalDate.of(2026, 9, 1), Money.czk(100), Optional.of(ACCOUNT), JANAS_SYMBOL, "OVERENI UCTU");
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
            donorRecords.save(jana);
            payments.saveAll(List.of(proof));
            donations.save(Donation.fromBankPayment(DonationId.newId(now), jana.id(), proof, PairingMethod.VARIABLE_SYMBOL, now));
            donorRecords.saveSenderAccountLink(jana.id(),
                    jana.learnSenderAccountFrom(proof, Optional.empty(), ExcludedSenderAccounts.none(), now).orElseThrow());
        });
        return jana.id();
    }

    private void storedOldSymbolPayments() {
        LocalDate first = LocalDate.of(2025, 3, 15);
        payments.saveAll(OLD_PAYMENTS.stream()
                .map(id -> payment(id, first.plusMonths(3L * OLD_PAYMENTS.indexOf(id)), Money.czk(50000), Optional.of(ACCOUNT), OLD_SYMBOL.value()))
                .toList());
    }

    private static SymbolClaim confirmedClaim(DonorReference donor) {
        Instant now = Instant.now();
        return SymbolClaim.answer(SymbolClaimId.newId(now), donor, ACCOUNT, OLD_SYMBOL, SymbolClaimAnswer.CONFIRMED, now);
    }

    private static BankStatement statementWith(IncomingMovement movement) {
        return new BankStatement(REQUESTED, Optional.empty(), List.of(movement), 1);
    }

    private static IncomingMovement movement(long transactionId, LocalDate bookedOn) {
        return IncomingMovement.of(new BankTransactionId(transactionId), bookedOn, Money.czk(50000), Optional.of(ACCOUNT),
                Optional.of(ACCOUNT.accountNumber()), Optional.of(ACCOUNT.bankCode()), Optional.of("Nováková Jana"),
                Optional.of(OLD_SYMBOL.value()), Optional.empty(), Optional.empty(), Optional.empty(), "Bezhotovostní příjem");
    }

    private Map<Long, Long> donationsPerPayment() {
        return jdbc.sql("select p.bank_transaction_id, count(d.id) from bank_payment p left join donation d on d.bank_payment_id = p.id "
                        + "group by p.bank_transaction_id")
                .query((row, number) -> Map.entry(row.getLong(1), row.getLong(2)))
                .list()
                .stream()
                .collect(Collectors.toMap(Map.Entry::getKey, Map.Entry::getValue));
    }

    private long confirmedSymbolDonations() {
        return jdbc.sql("select count(*) from donation where paired_by = 'CONFIRMED_SYMBOL' and symbol_claim_id is not null "
                        + "and sender_account_id is not null")
                .query(Long.class).single();
    }

    private long sessionsWaitingForAdvisoryLock() {
        return jdbc.sql("select count(*) from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock' "
                        + "and wait_event = 'advisory'")
                .query(Long.class).single();
    }

    private static void awaitRelease(CountDownLatch latch) {
        try {
            if (!latch.await(60, TimeUnit.SECONDS)) {
                throw new IllegalStateException("The confirmation was never released");
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(e);
        }
    }
}
