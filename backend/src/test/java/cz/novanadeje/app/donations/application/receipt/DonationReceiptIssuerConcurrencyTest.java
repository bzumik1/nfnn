package cz.novanadeje.app.donations.application.receipt;

import cz.novanadeje.app.IntegrationTest;
import cz.novanadeje.app.donations.application.donor.ChangeDonorRecordProfileCommand;
import cz.novanadeje.app.donations.application.donor.DonorRecordService;
import cz.novanadeje.app.donations.domain.FoundationCalendar;
import cz.novanadeje.app.donations.domain.bank.BankPayment;
import cz.novanadeje.app.donations.domain.bank.BankPaymentRepository;
import cz.novanadeje.app.donations.domain.bank.SenderAccount;
import cz.novanadeje.app.donations.domain.donation.Donation;
import cz.novanadeje.app.donations.domain.donation.DonationId;
import cz.novanadeje.app.donations.domain.donation.DonationNotFound;
import cz.novanadeje.app.donations.domain.donation.DonationRepository;
import cz.novanadeje.app.donations.domain.donation.PairingMethod;
import cz.novanadeje.app.donations.domain.donor.DonorRecord;
import cz.novanadeje.app.donations.domain.donor.DonorRecordRepository;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.donations.domain.receipt.YearlyReceiptNotAvailable;
import cz.novanadeje.app.shared.domain.LocaleCode;
import cz.novanadeje.app.shared.domain.Money;
import cz.novanadeje.app.shared.domain.PostalAddress;
import cz.novanadeje.app.shared.domain.UuidV7;
import cz.novanadeje.app.shared.domain.VariableSymbol;
import cz.novanadeje.app.support.DatabaseCleaner;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.IllegalTransactionStateException;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.Year;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static cz.novanadeje.app.donations.BankPayments.payment;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.awaitility.Awaitility.await;

@IntegrationTest
class DonationReceiptIssuerConcurrencyTest {

    private static final Year YEAR_2025 = Year.of(2025);
    private static final PostalAddress OLD_ADDRESS = new PostalAddress("Dlouhá 12", "Ústí nad Labem", "400 01");
    private static final PostalAddress NEW_ADDRESS = new PostalAddress("Krátká 3", "Děčín", "405 02");
    private static final Optional<SenderAccount> JANAS_ACCOUNT = Optional.of(new SenderAccount("2900233333", "2010"));

    @Autowired
    private DonationReceiptIssuer issuer;
    @Autowired
    private DonationReceiptService receipts;
    @Autowired
    private ReceiptRequestReader requests;
    @Autowired
    private DonorRecordService donorRecordService;
    @Autowired
    private DonorRecordRepository donorRecords;
    @Autowired
    private BankPaymentRepository payments;
    @Autowired
    private DonationRepository donations;
    @Autowired
    private PlatformTransactionManager transactionManager;
    @Autowired
    private JdbcClient jdbc;

    @BeforeEach
    void startFromEmptyTables() {
        new DatabaseCleaner(jdbc).emptyAllTables();
    }

    @Test
    @DisplayName("Given one received donation, when two callers issue its receipt at the same moment, then one receipt is stored and both get its number")
    void should_store_one_receipt_with_one_number_when_issued_concurrently_given_one_donation() throws Exception {
        DonorRecord jana = storedJana();
        Donation donation = storedDonation(jana, 7001, LocalDate.of(2026, 3, 15), 50000);
        LocalDate today = FoundationCalendar.today(Clock.systemUTC());
        CountDownLatch start = new CountDownLatch(1);
        Callable<IssuedReceipt> issue = () -> {
            start.await();
            return issuer.issueForDonation(jana.id(), donation.id(), today);
        };

        ExecutorService callers = Executors.newFixedThreadPool(2);
        try {
            Future<IssuedReceipt> first = callers.submit(issue);
            Future<IssuedReceipt> second = callers.submit(issue);
            start.countDown();

            IssuedReceipt firstReceipt = first.get(60, TimeUnit.SECONDS);
            IssuedReceipt secondReceipt = second.get(60, TimeUnit.SECONDS);

            assertThat(secondReceipt.number()).isEqualTo(firstReceipt.number());
            assertThat(secondReceipt.content()).isEqualTo(firstReceipt.content());
        } finally {
            callers.shutdownNow();
        }
        assertThat(storedReceipts()).isEqualTo(1);
        assertThat(jdbc.sql("select count(*) from donation_receipt where superseded_at is null and donation_id = ?")
                .param(donation.id().value()).query(Long.class).single()).isEqualTo(1);
    }

    @Test
    @DisplayName("Given an issued yearly receipt and a profile change that holds the donor's row until it commits, when a download waits for it, then the download issues the replacement certifying the new address")
    void should_issue_replacement_from_committed_profile_when_download_waited_given_profile_change_in_flight() throws Exception {
        DonorRecord jana = storedJana();
        storedDonation(jana, 7101, LocalDate.of(2025, 3, 15), 50000);
        IssuedReceipt beforeTheChange = receipts.yearlyReceipt(jana.id(), YEAR_2025);

        IssuedReceipt waited = downloadWaitingFor(
                () -> donorRecordService.changeProfile(new ChangeDonorRecordProfileCommand(jana.id().value(), jana.name(), NEW_ADDRESS, LocaleCode.CS)),
                () -> receipts.yearlyReceipt(jana.id(), YEAR_2025));

        assertThat(waited.number()).isNotEqualTo(beforeTheChange.number());
        assertThat(receipts.yearlyReceipt(jana.id(), YEAR_2025).number()).isEqualTo(waited.number());
        assertThat(storedReceipts()).isEqualTo(2);
    }

    @Test
    @DisplayName("Given an import that has stored a donation of the donor and not committed yet, when a download waits for it, then the receipt certifies that donation too")
    void should_certify_committed_donation_when_download_waited_given_import_in_flight() throws Exception {
        DonorRecord jana = storedJana();
        storedDonation(jana, 7201, LocalDate.of(2025, 3, 15), 50000);

        IssuedReceipt waited = downloadWaitingFor(
                () -> storedDonation(jana, 7202, LocalDate.of(2025, 9, 1), 25000),
                () -> receipts.yearlyReceipt(jana.id(), YEAR_2025));

        assertThat(receipts.yearlyReceipt(jana.id(), YEAR_2025).number()).isEqualTo(waited.number());
        assertThat(storedReceipts()).isEqualTo(1);
    }

    @Test
    @DisplayName("Given a donor without a donor record, when their receipts are issued, then the donation is not found and the yearly receipt is not available")
    void should_answer_not_found_when_issued_given_donor_without_record() {
        DonorReference unknown = new DonorReference(UuidV7.generate(Instant.now()));
        DonationId donation = DonationId.newId(Instant.now());
        LocalDate today = FoundationCalendar.today(Clock.systemUTC());

        assertThatThrownBy(() -> issuer.issueForDonation(unknown, donation, today))
                .isInstanceOf(DonationNotFound.class)
                .extracting("code").isEqualTo("donations/donation-not-found");
        assertThatThrownBy(() -> issuer.issueForYear(unknown, YEAR_2025, today))
                .isInstanceOf(YearlyReceiptNotAvailable.class)
                .extracting("code").isEqualTo("donations/yearly-receipt-not-available");
        assertThat(storedReceipts()).isZero();
    }

    @Test
    @DisplayName("Given no transaction, when a receipt request is read, then it is refused, so the certified data is never read before the issuer's lock")
    void should_refuse_reading_when_read_given_no_transaction() {
        DonorRecord jana = storedJana();
        Donation donation = storedDonation(jana, 7301, LocalDate.of(2025, 3, 15), 50000);
        LocalDate today = FoundationCalendar.today(Clock.systemUTC());

        assertThatThrownBy(() -> requests.forDonation(jana.id(), donation.id(), today)).isInstanceOf(IllegalTransactionStateException.class);
        assertThatThrownBy(() -> requests.forYear(jana.id(), YEAR_2025, today)).isInstanceOf(IllegalTransactionStateException.class);
    }

    private IssuedReceipt downloadWaitingFor(Runnable uncommittedChange, Callable<IssuedReceipt> download) throws Exception {
        CountDownLatch changed = new CountDownLatch(1);
        CountDownLatch commit = new CountDownLatch(1);
        TransactionTemplate separately = new TransactionTemplate(transactionManager);
        ExecutorService threads = Executors.newFixedThreadPool(2);
        try {
            Future<?> changing = threads.submit(() -> separately.executeWithoutResult(status -> {
                uncommittedChange.run();
                status.flush();
                changed.countDown();
                awaitRelease(commit);
            }));
            assertThat(changed.await(30, TimeUnit.SECONDS)).isTrue();
            Future<IssuedReceipt> downloading = threads.submit(download);
            await().atMost(Duration.ofSeconds(30)).until(() -> sessionsWaitingForALock() > 0);
            commit.countDown();
            changing.get(30, TimeUnit.SECONDS);
            return downloading.get(60, TimeUnit.SECONDS);
        } finally {
            commit.countDown();
            threads.shutdownNow();
        }
    }

    private long sessionsWaitingForALock() {
        return jdbc.sql("select count(*) from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock'")
                .query(Long.class).single();
    }

    private static void awaitRelease(CountDownLatch latch) {
        try {
            if (!latch.await(60, TimeUnit.SECONDS)) {
                throw new IllegalStateException("The change was never released");
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(e);
        }
    }

    private DonorRecord storedJana() {
        Instant now = Instant.now();
        DonorRecord jana = DonorRecord.registerPerson(new DonorReference(UuidV7.generate(now)), "Jana Nováková", OLD_ADDRESS,
                new VariableSymbol("4821937560"), LocaleCode.CS, now);
        donorRecords.save(jana);
        return jana;
    }

    private Donation storedDonation(DonorRecord donor, long transactionId, LocalDate receivedOn, long amountMinor) {
        Instant now = Instant.now();
        BankPayment paid = payment(transactionId, receivedOn, Money.czk(amountMinor), JANAS_ACCOUNT, null);
        payments.saveAll(List.of(paid));
        Donation donation = Donation.fromBankPayment(DonationId.newId(now), donor.id(), paid, PairingMethod.VARIABLE_SYMBOL, now);
        donations.save(donation);
        return donation;
    }

    private long storedReceipts() {
        return jdbc.sql("select count(*) from donation_receipt").query(Long.class).single();
    }
}
