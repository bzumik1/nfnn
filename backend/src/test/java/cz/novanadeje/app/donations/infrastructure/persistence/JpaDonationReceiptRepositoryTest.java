package cz.novanadeje.app.donations.infrastructure.persistence;

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
import cz.novanadeje.app.donations.domain.receipt.DonationReceipt;
import cz.novanadeje.app.donations.domain.receipt.DonationReceiptId;
import cz.novanadeje.app.donations.domain.receipt.DonationReceiptRepository;
import cz.novanadeje.app.donations.domain.receipt.ReceiptFingerprint;
import cz.novanadeje.app.donations.domain.receipt.ReceiptKind;
import cz.novanadeje.app.donations.domain.receipt.ReceiptNumber;
import cz.novanadeje.app.shared.domain.LocaleCode;
import cz.novanadeje.app.shared.domain.Money;
import cz.novanadeje.app.shared.domain.PostalAddress;
import cz.novanadeje.app.shared.domain.UuidV7;
import cz.novanadeje.app.shared.domain.VariableSymbol;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.transaction.TestTransaction;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Instant;
import java.time.LocalDate;
import java.time.Year;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static cz.novanadeje.app.donations.BankPayments.payment;
import static cz.novanadeje.app.donations.infrastructure.persistence.BankPersistenceTestConfiguration.NOW;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(BankPersistenceTestConfiguration.class)
class JpaDonationReceiptRepositoryTest {

    private static final Optional<SenderAccount> ACCOUNT = Optional.of(new SenderAccount("2900233333", "2010"));
    private static final LocalDate ISSUED_ON = LocalDate.of(2026, 10, 17);
    private static final Year YEAR_2025 = Year.of(2025);
    private static final byte[] PDF = {'%', 'P', 'D', 'F', '-', '1', '.', '7'};
    private static final ReceiptFingerprint FINGERPRINT = new ReceiptFingerprint("0123456789abcdef".repeat(4));

    @Autowired
    private DonationReceiptRepository receipts;
    @Autowired
    private DonationRepository donations;
    @Autowired
    private DonorRecordRepository donorRecords;
    @Autowired
    private BankPaymentRepository payments;
    @Autowired
    private EntityManager entityManager;
    @Autowired
    private JdbcClient jdbc;
    @Autowired
    private PlatformTransactionManager transactionManager;

    private long transactionIds = 5000;

    @Test
    @DisplayName("Given a single receipt, when it is saved and its donation's active receipt is read, then every field survives")
    void should_keep_every_field_when_saved_and_read_given_single_receipt() {
        DonorReference jana = storedDonor("4821937560");
        Donation donation = storedDonation(jana, LocalDate.of(2026, 3, 15));
        DonationReceipt receipt = single(jana, donation, "2026-000001");

        receipts.save(receipt);
        flushAndClear();

        assertThat(receipts.findActiveForDonation(donation.id())).hasValueSatisfying(stored -> {
            assertThat(stored.id()).isEqualTo(receipt.id());
            assertThat(stored.donor()).isEqualTo(jana);
            assertThat(stored.kind()).isEqualTo(ReceiptKind.SINGLE);
            assertThat(stored.donation()).contains(donation.id());
            assertThat(stored.year()).isEmpty();
            assertThat(stored.number()).isEqualTo(new ReceiptNumber("2026-000001"));
            assertThat(stored.issuedOn()).isEqualTo(ISSUED_ON);
            assertThat(stored.issuedAt()).isEqualTo(NOW);
            assertThat(stored.locale()).isEqualTo(LocaleCode.EN);
            assertThat(stored.fingerprint()).isEqualTo(FINGERPRINT);
            assertThat(stored.content()).isEqualTo(PDF);
            assertThat(stored.supersedes()).isEmpty();
            assertThat(stored.supersededAt()).isEmpty();
        });
        assertThat(receipts.findActiveForYear(jana, YEAR_2025)).isEmpty();
    }

    @Test
    @DisplayName("Given a yearly receipt, when it is saved and the donor's active receipt of that year is read, then it comes back with its year")
    void should_find_yearly_receipt_when_read_given_saved_for_year() {
        DonorReference jana = storedDonor("4821937560");
        DonationReceipt receipt = yearly(jana, YEAR_2025, "2026-000002", Optional.empty());

        receipts.save(receipt);
        flushAndClear();

        assertThat(receipts.findActiveForYear(jana, YEAR_2025)).hasValueSatisfying(stored -> {
            assertThat(stored.kind()).isEqualTo(ReceiptKind.YEARLY);
            assertThat(stored.year()).contains(YEAR_2025);
            assertThat(stored.donation()).isEmpty();
            assertThat(stored.number()).isEqualTo(new ReceiptNumber("2026-000002"));
        });
        assertThat(receipts.findActiveForYear(jana, Year.of(2024))).isEmpty();
        assertThat(receipts.findActiveForYear(storedDonor("7310945528"), YEAR_2025)).isEmpty();
    }

    @Test
    @DisplayName("Given a receipt replaced by a newer one, when the active receipt is read, then the superseded one is left out")
    void should_leave_out_superseded_receipt_when_active_read_given_replacement() {
        DonorReference jana = storedDonor("4821937560");
        DonationReceipt first = yearly(jana, YEAR_2025, "2026-000001", Optional.empty());
        receipts.save(first);
        Instant replacedAt = NOW.plusSeconds(3600);
        first.markSuperseded(replacedAt);
        receipts.save(first);
        DonationReceipt second = yearly(jana, YEAR_2025, "2026-000002", Optional.of(first.id()));
        receipts.save(second);
        flushAndClear();

        assertThat(receipts.findActiveForYear(jana, YEAR_2025)).hasValueSatisfying(stored -> {
            assertThat(stored.id()).isEqualTo(second.id());
            assertThat(stored.supersedes()).contains(first.id());
        });
        assertThat(jdbc.sql("select superseded_at from donation_receipt where id = ?").param(first.id().value()).query(Instant.class).single())
                .isEqualTo(replacedAt);
    }

    @Test
    @DisplayName("Given a stored receipt, when a superseded copy of it with other content is saved, then only superseded_at changes and the PDF stays")
    void should_change_only_superseded_at_when_saved_given_stored_receipt() {
        DonorReference jana = storedDonor("4821937560");
        DonationReceipt stored = yearly(jana, YEAR_2025, "2026-000001", Optional.empty());
        receipts.save(stored);
        flushAndClear();
        Instant replacedAt = NOW.plusSeconds(3600);
        DonationReceipt copy = DonationReceipt.reconstitute(stored.id(), jana, ReceiptKind.YEARLY, Optional.empty(), Optional.of(YEAR_2025),
                new ReceiptNumber("2026-000001"), ISSUED_ON, NOW, LocaleCode.CS, FINGERPRINT, new byte[] {'o', 't', 'h', 'e', 'r'}, Optional.empty(),
                Optional.of(replacedAt));

        receipts.save(copy);
        flushAndClear();

        assertThat(jdbc.sql("select content from donation_receipt where id = ?").param(stored.id().value()).query(byte[].class).single())
                .isEqualTo(PDF);
        assertThat(jdbc.sql("select superseded_at from donation_receipt where id = ?").param(stored.id().value()).query(Instant.class).single())
                .isEqualTo(replacedAt);
    }

    @Test
    @DisplayName("Given single, yearly, superseded and other donors' receipts, when the donor's single numbers are read, then only their active single ones come")
    void should_map_active_single_numbers_when_read_given_mixed_receipts() {
        DonorReference jana = storedDonor("4821937560");
        DonorReference petr = storedDonor("7310945528");
        Donation march = storedDonation(jana, LocalDate.of(2026, 3, 15));
        Donation june = storedDonation(jana, LocalDate.of(2026, 6, 1));
        Donation petrs = storedDonation(petr, LocalDate.of(2026, 4, 1));
        DonationReceipt replaced = single(jana, march, "2026-000001");
        receipts.save(replaced);
        replaced.markSuperseded(NOW.plusSeconds(60));
        receipts.save(replaced);
        receipts.save(single(jana, march, "2026-000002"));
        receipts.save(single(jana, june, "2026-000003"));
        receipts.save(single(petr, petrs, "2026-000004"));
        receipts.save(yearly(jana, YEAR_2025, "2026-000005", Optional.empty()));
        flushAndClear();

        Map<DonationId, ReceiptNumber> numbers = receipts.findActiveSingleNumbersFor(jana);

        assertThat(numbers).containsExactlyInAnyOrderEntriesOf(Map.of(
                march.id(), new ReceiptNumber("2026-000002"),
                june.id(), new ReceiptNumber("2026-000003")));
        assertThat(receipts.findActiveSingleNumbersFor(storedDonor("1111111111"))).isEmpty();
    }

    @Test
    @DisplayName("Given the receipt number sequence, when two serials are taken, then the second is one more than the first")
    void should_increment_when_next_serial_taken_given_sequence() {
        long first = receipts.nextSerial();
        long second = receipts.nextSerial();

        assertThat(first).isPositive();
        assertThat(second).isEqualTo(first + 1);
    }

    @Test
    @DisplayName("Given a committed donor, when the donor is locked for issuing, then another transaction cannot lock the same row")
    void should_hold_donor_row_lock_when_locked_given_committed_donor() {
        TestTransaction.end();
        TransactionTemplate separately = new TransactionTemplate(transactionManager);
        separately.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        DonorReference jana = separately.execute(status -> storedDonor("5555555555"));
        try {
            separately.executeWithoutResult(status -> {
                receipts.lockDonor(jana);

                assertThatThrownBy(() -> separately.executeWithoutResult(other -> jdbc
                        .sql("select donor_id from donor_record where donor_id = ? for update nowait").param(jana.value()).query().listOfRows()))
                        .isInstanceOf(DataAccessException.class)
                        .hasMessageContaining("could not obtain lock on row");
            });
        } finally {
            separately.executeWithoutResult(status -> jdbc.sql("delete from donor_record where donor_id = ?").param(jana.value()).update());
        }
    }

    @Test
    @DisplayName("Given no donor record, when the donor is locked for issuing, then the adapter refuses with an invariant breach")
    void should_refuse_when_locked_given_unknown_donor() {
        DonorReference unknown = new DonorReference(UuidV7.generate(NOW));

        assertThatThrownBy(() -> receipts.lockDonor(unknown))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("cannot be locked");
    }

    @Test
    @DisplayName("Given the schema, when a single receipt without a donation is inserted, then the shape check refuses it")
    void should_refuse_when_inserted_given_single_receipt_without_donation() {
        DonorReference jana = storedDonor("4821937560");
        entityManager.flush();

        assertThatThrownBy(() -> jdbc.sql("insert into donation_receipt (id, donor_id, kind, receipt_year, number, issued_on, issued_at, locale,"
                        + " fingerprint, content) values (?, ?, 'SINGLE', 2025, '2026-000009', current_date, now(), 'cs', ?, ?)")
                .params(UuidV7.generate(NOW), jana.value(), FINGERPRINT.value(), PDF).update())
                .hasMessageContaining("ck_donation_receipt_shape");
    }

    @Test
    @DisplayName("Given an active receipt of a donation, when a second active receipt of it is saved, then the partial unique index refuses it")
    void should_refuse_when_saved_given_second_active_receipt_of_donation() {
        DonorReference jana = storedDonor("4821937560");
        Donation donation = storedDonation(jana, LocalDate.of(2026, 3, 15));
        receipts.save(single(jana, donation, "2026-000001"));
        flushAndClear();

        assertThatThrownBy(() -> receipts.save(single(jana, donation, "2026-000002")))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("uq_donation_receipt_active_donation");
    }

    @Test
    @DisplayName("Given an active yearly receipt, when a second active receipt of the same donor and year is saved, then the partial unique index refuses it")
    void should_refuse_when_saved_given_second_active_receipt_of_year() {
        DonorReference jana = storedDonor("4821937560");
        receipts.save(yearly(jana, YEAR_2025, "2026-000001", Optional.empty()));
        flushAndClear();

        assertThatThrownBy(() -> receipts.save(yearly(jana, YEAR_2025, "2026-000002", Optional.empty())))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("uq_donation_receipt_active_year");
    }

    private DonationReceipt single(DonorReference donor, Donation donation, String number) {
        return DonationReceipt.issueForDonation(DonationReceiptId.newId(NOW), donor, donation.id(), new ReceiptNumber(number), ISSUED_ON, NOW,
                LocaleCode.EN, FINGERPRINT, PDF, Optional.empty());
    }

    private DonationReceipt yearly(DonorReference donor, Year year, String number, Optional<DonationReceiptId> supersedes) {
        return DonationReceipt.issueForYear(DonationReceiptId.newId(NOW), donor, year, new ReceiptNumber(number), ISSUED_ON, NOW, LocaleCode.CS,
                FINGERPRINT, PDF, supersedes);
    }

    private DonorReference storedDonor(String symbol) {
        DonorRecord record = DonorRecord.registerPerson(new DonorReference(UuidV7.generate(NOW)), "Jana Nováková",
                new PostalAddress("Dlouhá 12", "Ústí nad Labem", "400 01"), new VariableSymbol(symbol), LocaleCode.CS, NOW);
        donorRecords.save(record);
        return record.id();
    }

    private Donation storedDonation(DonorReference donor, LocalDate receivedOn) {
        BankPayment payment = payment(transactionIds++, receivedOn, Money.czk(50000), ACCOUNT, null);
        payments.saveAll(List.of(payment));
        Donation donation = Donation.fromBankPayment(DonationId.newId(NOW), donor, payment, PairingMethod.VARIABLE_SYMBOL, NOW);
        donations.save(donation);
        return donation;
    }

    private void flushAndClear() {
        entityManager.flush();
        entityManager.clear();
    }
}
