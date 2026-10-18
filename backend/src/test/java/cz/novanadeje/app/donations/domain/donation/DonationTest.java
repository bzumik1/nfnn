package cz.novanadeje.app.donations.domain.donation;

import cz.novanadeje.app.donations.domain.bank.BankPayment;
import cz.novanadeje.app.donations.domain.bank.BankPaymentId;
import cz.novanadeje.app.donations.domain.bank.SenderAccount;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.shared.domain.Money;
import cz.novanadeje.app.shared.domain.UuidV7;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Optional;

import static cz.novanadeje.app.donations.BankPayments.payment;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

class DonationTest {

    private static final Instant NOW = Instant.parse("2026-10-17T11:00:00Z");
    private static final DonationId DONATION_ID = DonationId.newId(NOW);
    private static final DonorReference DONOR = new DonorReference(UuidV7.generate(NOW));
    private static final LocalDate RECEIVED_ON = LocalDate.of(2026, 10, 15);

    @Test
    @DisplayName("Given a bank payment, when a donation is made from it, then it is a received bank transfer on the booking date with the payment's amount")
    void should_be_received_bank_transfer_when_made_from_payment_given_bank_payment() {
        BankPayment payment = payment(1001, RECEIVED_ON, Money.czk(50000), SenderAccount.parse("2900233333", "2010"), "4821937560");

        Donation donation = Donation.fromBankPayment(DONATION_ID, DONOR, payment, PairingMethod.VARIABLE_SYMBOL, NOW);

        assertThat(donation.id()).isEqualTo(DONATION_ID);
        assertThat(donation.donor()).isEqualTo(DONOR);
        assertThat(donation.bankPayment()).contains(payment.id());
        assertThat(donation.receivedOn()).isEqualTo(RECEIVED_ON);
        assertThat(donation.amount()).isEqualTo(Money.czk(50000));
        assertThat(donation.source()).isEqualTo(DonationSource.BANK_TRANSFER);
        assertThat(donation.status()).isEqualTo(DonationStatus.RECEIVED);
        assertThat(donation.pairedBy()).contains(PairingMethod.VARIABLE_SYMBOL);
        assertThat(donation.recordedAt()).isEqualTo(NOW);
    }

    @Test
    @DisplayName("Given a bank transfer without its payment or without a pairing method, when reconstituted, then it is refused")
    void should_refuse_when_reconstituted_given_bank_transfer_without_payment_or_method() {
        BankPaymentId paymentId = BankPaymentId.newId(NOW);

        assertThatIllegalArgumentException().isThrownBy(() -> Donation.reconstitute(DONATION_ID, DONOR, Optional.empty(), RECEIVED_ON,
                Money.czk(50000), DonationSource.BANK_TRANSFER, DonationStatus.RECEIVED, Optional.of(PairingMethod.SENDER_ACCOUNT), NOW));
        assertThatIllegalArgumentException().isThrownBy(() -> Donation.reconstitute(DONATION_ID, DONOR, Optional.of(paymentId), RECEIVED_ON,
                Money.czk(50000), DonationSource.BANK_TRANSFER, DonationStatus.RECEIVED, Optional.empty(), NOW));
    }

    @Test
    @DisplayName("Given a manual donation with a bank payment or a pairing method, when reconstituted, then it is refused")
    void should_refuse_when_reconstituted_given_manual_donation_with_payment_or_method() {
        assertThatIllegalArgumentException().isThrownBy(() -> Donation.reconstitute(DONATION_ID, DONOR, Optional.of(BankPaymentId.newId(NOW)),
                RECEIVED_ON, Money.czk(50000), DonationSource.MANUAL, DonationStatus.RECEIVED, Optional.empty(), NOW));
        assertThatIllegalArgumentException().isThrownBy(() -> Donation.reconstitute(DONATION_ID, DONOR, Optional.empty(), RECEIVED_ON,
                Money.czk(50000), DonationSource.MANUAL, DonationStatus.RECEIVED, Optional.of(PairingMethod.VARIABLE_SYMBOL), NOW));
    }

    @Test
    @DisplayName("Given a manual donation without a payment, when reconstituted, then it is accepted")
    void should_accept_when_reconstituted_given_manual_donation_without_payment() {
        Donation donation = Donation.reconstitute(DONATION_ID, DONOR, Optional.empty(), RECEIVED_ON, Money.czk(10000), DonationSource.MANUAL,
                DonationStatus.REFUNDED, Optional.empty(), NOW);

        assertThat(donation.bankPayment()).isEmpty();
        assertThat(donation.pairedBy()).isEmpty();
        assertThat(donation.status()).isEqualTo(DonationStatus.REFUNDED);
    }

    @Test
    @DisplayName("Given a zero or negative amount, when reconstituted, then it is refused")
    void should_refuse_when_reconstituted_given_non_positive_amount() {
        assertThatIllegalArgumentException().isThrownBy(() -> Donation.reconstitute(DONATION_ID, DONOR, Optional.empty(), RECEIVED_ON,
                Money.czk(0), DonationSource.MANUAL, DonationStatus.RECEIVED, Optional.empty(), NOW));
        assertThatIllegalArgumentException().isThrownBy(() -> Donation.reconstitute(DONATION_ID, DONOR, Optional.empty(), RECEIVED_ON,
                Money.czk(-100), DonationSource.MANUAL, DonationStatus.RECEIVED, Optional.empty(), NOW));
    }

    @Test
    @DisplayName("Given missing parts, when reconstituted, then it is refused")
    void should_refuse_when_reconstituted_given_missing_parts() {
        assertThatIllegalArgumentException().isThrownBy(() -> Donation.reconstitute(null, DONOR, Optional.empty(), RECEIVED_ON,
                Money.czk(100), DonationSource.MANUAL, DonationStatus.RECEIVED, Optional.empty(), NOW));
        assertThatIllegalArgumentException().isThrownBy(() -> Donation.reconstitute(DONATION_ID, null, Optional.empty(), RECEIVED_ON,
                Money.czk(100), DonationSource.MANUAL, DonationStatus.RECEIVED, Optional.empty(), NOW));
        assertThatIllegalArgumentException().isThrownBy(() -> Donation.reconstitute(DONATION_ID, DONOR, Optional.empty(), null,
                Money.czk(100), DonationSource.MANUAL, DonationStatus.RECEIVED, Optional.empty(), NOW));
        assertThatIllegalArgumentException().isThrownBy(() -> Donation.reconstitute(DONATION_ID, DONOR, Optional.empty(), RECEIVED_ON,
                Money.czk(100), DonationSource.MANUAL, DonationStatus.RECEIVED, Optional.empty(), null));
    }

    @Test
    void should_round_trip_when_parsed_given_donation_id_text() {
        assertThat(DonationId.of(DONATION_ID.toString())).isEqualTo(DONATION_ID);
    }
}
