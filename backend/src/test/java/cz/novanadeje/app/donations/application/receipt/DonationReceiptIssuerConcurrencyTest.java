package cz.novanadeje.app.donations.application.receipt;

import cz.novanadeje.app.TestcontainersConfiguration;
import cz.novanadeje.app.donations.domain.FoundationCalendar;
import cz.novanadeje.app.donations.domain.bank.BankPayment;
import cz.novanadeje.app.donations.domain.bank.BankPaymentRepository;
import cz.novanadeje.app.donations.domain.bank.SenderAccount;
import cz.novanadeje.app.donations.domain.donation.Donation;
import cz.novanadeje.app.donations.domain.donation.DonationId;
import cz.novanadeje.app.donations.domain.donation.DonationRepository;
import cz.novanadeje.app.donations.domain.donation.PairingMethod;
import cz.novanadeje.app.donations.domain.donor.DonorRecord;
import cz.novanadeje.app.donations.domain.donor.DonorRecordRepository;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
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

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
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

@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = {"app.donations.fio.token=", "app.donations.report.cron=-", "app.contact.retention.cron=-"})
class DonationReceiptIssuerConcurrencyTest {

    @Autowired
    private DonationReceiptIssuer issuer;
    @Autowired
    private DonorRecordRepository donorRecords;
    @Autowired
    private BankPaymentRepository payments;
    @Autowired
    private DonationRepository donations;
    @Autowired
    private JdbcClient jdbc;

    @AfterEach
    void cleanTables() {
        new DatabaseCleaner(jdbc).truncateAllTables();
    }

    @Test
    @DisplayName("Given one received donation, when two callers issue its receipt at the same moment, then one receipt is stored and both get its number")
    void should_store_one_receipt_with_one_number_when_issued_concurrently_given_one_donation() throws Exception {
        Instant now = Instant.now();
        DonorRecord jana = DonorRecord.registerPerson(new DonorReference(UuidV7.generate(now)), "Jana Nováková",
                new PostalAddress("Dlouhá 12", "Ústí nad Labem", "400 01"), new VariableSymbol("4821937560"), LocaleCode.CS, now);
        donorRecords.save(jana);
        BankPayment paid = payment(7001, LocalDate.of(2026, 3, 15), Money.czk(50000), Optional.of(new SenderAccount("2900233333", "2010")), null);
        payments.saveAll(List.of(paid));
        Donation donation = Donation.fromBankPayment(DonationId.newId(now), jana.id(), paid, PairingMethod.VARIABLE_SYMBOL, now);
        donations.save(donation);
        ReceiptRequest request = ReceiptRequest.forDonation(jana, donation, FoundationCalendar.today(Clock.systemUTC()));
        CountDownLatch start = new CountDownLatch(1);
        Callable<IssuedReceipt> issue = () -> {
            start.await();
            return issuer.issue(request);
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
        assertThat(jdbc.sql("select count(*) from donation_receipt").query(Long.class).single()).isEqualTo(1);
        assertThat(jdbc.sql("select count(*) from donation_receipt where superseded_at is null and donation_id = ?")
                .param(donation.id().value()).query(Long.class).single()).isEqualTo(1);
    }
}
