package cz.novanadeje.app.donations.infrastructure.persistence;

import cz.novanadeje.app.donations.domain.bank.BankPayment;
import cz.novanadeje.app.donations.domain.bank.BankPaymentId;
import cz.novanadeje.app.donations.domain.bank.BankPaymentRepository;
import cz.novanadeje.app.donations.domain.bank.SenderAccount;
import cz.novanadeje.app.donations.domain.donation.Donation;
import cz.novanadeje.app.donations.domain.donation.DonationId;
import cz.novanadeje.app.donations.domain.donation.DonationRepository;
import cz.novanadeje.app.donations.domain.donation.DonationSource;
import cz.novanadeje.app.donations.domain.donation.DonationStatus;
import cz.novanadeje.app.donations.domain.donation.PairingMethod;
import cz.novanadeje.app.donations.domain.donor.DonorRecord;
import cz.novanadeje.app.donations.domain.donor.DonorRecordRepository;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
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
import org.springframework.jdbc.core.simple.JdbcClient;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import static cz.novanadeje.app.donations.BankPayments.payment;
import static cz.novanadeje.app.donations.infrastructure.persistence.BankPersistenceTestConfiguration.NOW;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(BankPersistenceTestConfiguration.class)
class JpaDonationRepositoryTest {

    private static final Optional<SenderAccount> ACCOUNT = Optional.of(new SenderAccount("2900233333", "2010"));

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

    @Test
    @DisplayName("Given a donation from a bank payment, when it is saved and read back, then every field survives and the payment counts as paired")
    void should_keep_every_field_when_saved_and_read_given_bank_transfer() {
        DonorReference jana = storedDonor("4821937560");
        BankPayment payment = storedPayment(1001, LocalDate.of(2026, 10, 15));
        Donation donation = Donation.fromBankPayment(DonationId.newId(NOW), jana, payment, PairingMethod.SENDER_ACCOUNT, NOW);

        donations.save(donation);
        flushAndClear();

        assertThat(donations.findByDonorOrderedByReceivedOnDesc(jana)).singleElement().satisfies(stored -> {
            assertThat(stored.id()).isEqualTo(donation.id());
            assertThat(stored.donor()).isEqualTo(jana);
            assertThat(stored.bankPayment()).contains(payment.id());
            assertThat(stored.receivedOn()).isEqualTo(LocalDate.of(2026, 10, 15));
            assertThat(stored.amount()).isEqualTo(Money.czk(50000));
            assertThat(stored.source()).isEqualTo(DonationSource.BANK_TRANSFER);
            assertThat(stored.status()).isEqualTo(DonationStatus.RECEIVED);
            assertThat(stored.pairedBy()).contains(PairingMethod.SENDER_ACCOUNT);
            assertThat(stored.recordedAt()).isEqualTo(NOW);
        });
        assertThat(donations.existsForBankPayment(payment.id())).isTrue();
        assertThat(donations.existsForBankPayment(BankPaymentId.newId(NOW))).isFalse();
    }

    @Test
    @DisplayName("Given donations of two donors, when one donor's donations are listed, then only theirs come, latest receipt first")
    void should_list_only_donor_donations_latest_first_when_listed_given_two_donors() {
        DonorReference jana = storedDonor("4821937560");
        DonorReference petr = storedDonor("7310945528");
        donations.save(bySymbol(jana, storedPayment(1001, LocalDate.of(2026, 10, 10))));
        donations.save(bySymbol(jana, storedPayment(1002, LocalDate.of(2026, 10, 16))));
        donations.save(bySymbol(petr, storedPayment(1003, LocalDate.of(2026, 10, 12))));
        flushAndClear();

        assertThat(donations.findByDonorOrderedByReceivedOnDesc(jana)).extracting(Donation::receivedOn)
                .containsExactly(LocalDate.of(2026, 10, 16), LocalDate.of(2026, 10, 10));
    }

    @Test
    @DisplayName("Given a paired bank payment, when a second donation for it is saved, then the save itself fails with an integrity violation")
    void should_refuse_when_saved_given_second_donation_for_payment() {
        DonorReference jana = storedDonor("4821937560");
        DonorReference petr = storedDonor("7310945528");
        BankPayment payment = storedPayment(1001, LocalDate.of(2026, 10, 15));
        donations.save(bySymbol(jana, payment));
        flushAndClear();

        assertThatThrownBy(() -> donations.save(bySymbol(petr, payment)))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("uq_donation_bank_payment");
    }

    @Test
    @DisplayName("Given the schema, when a bank transfer without a payment is inserted, then the check constraint refuses it")
    void should_refuse_when_inserted_given_bank_transfer_without_payment() {
        DonorReference jana = storedDonor("4821937560");
        entityManager.flush();

        assertThatThrownBy(() -> jdbc.sql("insert into donation (id, donor_id, received_on, amount_minor, currency, source, status, recorded_at)"
                        + " values (?, ?, current_date, 100, 'CZK', 'BANK_TRANSFER', 'RECEIVED', now())")
                .params(UuidV7.generate(NOW), jana.value()).update())
                .hasMessageContaining("ck_donation_bank_transfer_has_payment");
    }

    private Donation bySymbol(DonorReference donor, BankPayment payment) {
        return Donation.fromBankPayment(DonationId.newId(NOW), donor, payment, PairingMethod.VARIABLE_SYMBOL, NOW);
    }

    private DonorReference storedDonor(String symbol) {
        DonorRecord record = DonorRecord.registerPerson(new DonorReference(UuidV7.generate(NOW)), "Jana Nováková",
                new PostalAddress("Dlouhá 12", "Ústí nad Labem", "400 01"), new VariableSymbol(symbol), LocaleCode.CS, NOW);
        donorRecords.save(record);
        return record.id();
    }

    private BankPayment storedPayment(long transactionId, LocalDate bookedOn) {
        BankPayment payment = payment(transactionId, bookedOn, Money.czk(50000), ACCOUNT, null);
        payments.saveAll(List.of(payment));
        return payment;
    }

    private void flushAndClear() {
        entityManager.flush();
        entityManager.clear();
    }
}
