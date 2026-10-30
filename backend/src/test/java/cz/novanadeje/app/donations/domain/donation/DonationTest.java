package cz.novanadeje.app.donations.domain.donation;

import cz.novanadeje.app.donations.domain.bank.BankPayment;
import cz.novanadeje.app.donations.domain.bank.BankPaymentId;
import cz.novanadeje.app.donations.domain.bank.SenderAccount;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.donations.domain.donor.SenderAccountLinkId;
import cz.novanadeje.app.donations.domain.donor.SymbolClaimId;
import cz.novanadeje.app.shared.domain.Money;
import cz.novanadeje.app.shared.domain.UuidV7;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.LocalDate;
import java.time.Year;
import java.util.Optional;

import static cz.novanadeje.app.donations.BankPayments.payment;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

class DonationTest {

    private static final Instant NOW = Instant.parse("2026-10-17T11:00:00Z");
    private static final DonationId DONATION_ID = DonationId.newId(NOW);
    private static final DonorReference DONOR = new DonorReference(UuidV7.generate(NOW));
    private static final LocalDate RECEIVED_ON = LocalDate.of(2026, 10, 15);
    private static final Optional<SenderAccount> ACCOUNT = SenderAccount.parse("1234567", "0800");

    @Test
    @DisplayName("Given a bank payment an administrator assigns, when the donation is made by hand, then it is a received bank transfer paired manually")
    void should_be_paired_manually_when_made_from_payment_given_manual_method() {
        BankPayment payment = payment(1001, RECEIVED_ON, Money.czk(50000), SenderAccount.parse("2900233333", "2010"), "1111111111");

        Donation donation = Donation.fromBankPayment(DONATION_ID, DONOR, payment, PairingMethod.MANUAL, NOW);

        assertThat(donation.source()).isEqualTo(DonationSource.BANK_TRANSFER);
        assertThat(donation.pairedBy()).contains(PairingMethod.MANUAL);
        assertThat(donation.pairedThrough()).isEmpty();
        assertThat(donation.confirmedClaim()).isEmpty();
    }

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
        assertThat(donation.purpose()).isEqualTo(DonationPurpose.GENERAL);
        assertThat(donation.recordedAt()).isEqualTo(NOW);
    }

    @Test
    @DisplayName("Given a bank payment verifying an account, when a donation is made from it or paired through a link, then its purpose is the account verification")
    void should_take_verification_purpose_when_made_from_payment_given_verification_message() {
        BankPayment payment = payment(1001, RECEIVED_ON, Money.czk(100), SenderAccount.parse("2900233333", "2010"), "4821937560",
                "OVERENI UCTU NADACNI FOND NOVA NADEJE");

        assertThat(Donation.fromBankPayment(DONATION_ID, DONOR, payment, PairingMethod.VARIABLE_SYMBOL, NOW).purpose())
                .isEqualTo(DonationPurpose.ACCOUNT_VERIFICATION);
        assertThat(Donation.pairedBySenderAccount(DONATION_ID, DONOR, payment, SenderAccountLinkId.newId(NOW), NOW).purpose())
                .isEqualTo(DonationPurpose.ACCOUNT_VERIFICATION);
    }

    @Test
    @DisplayName("Given a donation verifying an account and an ordinary gift, when asked whether each is a verification, then only the first is")
    void should_tell_verification_when_asked_given_verification_and_gift() {
        BankPayment verification = payment(1001, RECEIVED_ON, Money.czk(100), SenderAccount.parse("2900233333", "2010"), "4821937560",
                "OVERENI UCTU NADACNI FOND NOVA NADEJE");
        BankPayment gift = payment(1002, RECEIVED_ON, Money.czk(100), SenderAccount.parse("2900233333", "2010"), "4821937560");

        assertThat(Donation.fromBankPayment(DONATION_ID, DONOR, verification, PairingMethod.VARIABLE_SYMBOL, NOW).isAccountVerification())
                .isTrue();
        assertThat(Donation.fromBankPayment(DONATION_ID, DONOR, gift, PairingMethod.VARIABLE_SYMBOL, NOW).isAccountVerification()).isFalse();
    }

    @Test
    @DisplayName("Given a donation without a purpose, when reconstituted, then it is refused")
    void should_refuse_when_reconstituted_given_no_purpose() {
        assertThatIllegalArgumentException().isThrownBy(() -> Donation.reconstitute(DONATION_ID, DONOR, Optional.empty(), RECEIVED_ON,
                Money.czk(100), DonationSource.MANUAL, DonationStatus.RECEIVED, Optional.empty(), Optional.empty(), Optional.empty(), null, NOW));
    }

    @Test
    @DisplayName("Given a bank payment and a sender account link, when a donation is paired through the link, then it names the link")
    void should_name_link_when_paired_by_sender_account_given_link() {
        BankPayment payment = payment(1001, RECEIVED_ON, Money.czk(30000), SenderAccount.parse("2900233333", "2010"), null);
        SenderAccountLinkId link = SenderAccountLinkId.newId(NOW);

        Donation donation = Donation.pairedBySenderAccount(DONATION_ID, DONOR, payment, link, NOW);

        assertThat(donation.pairedBy()).contains(PairingMethod.SENDER_ACCOUNT);
        assertThat(donation.pairedThrough()).contains(link);
        assertThat(donation.receivedOn()).isEqualTo(RECEIVED_ON);
    }

    @Test
    @DisplayName("Given a donation paired by symbol, when reconstituted with a sender account link, then it is refused")
    void should_refuse_when_reconstituted_given_link_without_account_pairing() {
        assertThatIllegalArgumentException().isThrownBy(() -> Donation.reconstitute(DONATION_ID, DONOR, Optional.of(BankPaymentId.newId(NOW)),
                RECEIVED_ON, Money.czk(50000), DonationSource.BANK_TRANSFER, DonationStatus.RECEIVED, Optional.of(PairingMethod.VARIABLE_SYMBOL),
                Optional.of(SenderAccountLinkId.newId(NOW)), NOW));
    }

    @Test
    @DisplayName("Given a payment with a symbol nobody has and the donor's confirmed claim, when a donation is paired by the confirmed symbol, then it names the method, the link and the claim and keeps the purpose")
    void should_name_link_and_claim_when_paired_by_confirmed_symbol_given_claim() {
        BankPayment payment = payment(1001, RECEIVED_ON, Money.czk(30000), ACCOUNT, "6123456789", "Dar");
        SenderAccountLinkId link = SenderAccountLinkId.newId(NOW);
        SymbolClaimId claim = SymbolClaimId.newId(NOW);

        Donation donation = Donation.pairedByConfirmedSymbol(DONATION_ID, DONOR, payment, link, claim, NOW);

        assertThat(donation.pairedBy()).contains(PairingMethod.CONFIRMED_SYMBOL);
        assertThat(donation.pairedThrough()).contains(link);
        assertThat(donation.confirmedClaim()).contains(claim);
        assertThat(donation.bankPayment()).contains(payment.id());
        assertThat(donation.receivedOn()).isEqualTo(RECEIVED_ON);
        assertThat(donation.amount()).isEqualTo(Money.czk(30000));
        assertThat(donation.status()).isEqualTo(DonationStatus.RECEIVED);
        assertThat(donation.purpose()).isEqualTo(DonationPurpose.GENERAL);
        assertThat(donation.recordedAt()).isEqualTo(NOW);
    }

    @Test
    @DisplayName("Given a payment without a symbol or without a Czech sender, when a donation is paired by a confirmed symbol, then it is refused")
    void should_refuse_when_paired_by_confirmed_symbol_given_payment_without_symbol_or_sender() {
        SenderAccountLinkId link = SenderAccountLinkId.newId(NOW);
        SymbolClaimId claim = SymbolClaimId.newId(NOW);

        assertThatIllegalArgumentException().isThrownBy(() -> Donation.pairedByConfirmedSymbol(DONATION_ID, DONOR,
                payment(1001, RECEIVED_ON, Money.czk(30000), ACCOUNT, null), link, claim, NOW));
        assertThatIllegalArgumentException().isThrownBy(() -> Donation.pairedByConfirmedSymbol(DONATION_ID, DONOR,
                payment(1002, RECEIVED_ON, Money.czk(30000), ACCOUNT, "0"), link, claim, NOW));
        assertThatIllegalArgumentException().isThrownBy(() -> Donation.pairedByConfirmedSymbol(DONATION_ID, DONOR,
                payment(1003, RECEIVED_ON, Money.czk(30000), Optional.empty(), "6123456789"), link, claim, NOW));
        assertThatIllegalArgumentException().isThrownBy(() -> Donation.pairedByConfirmedSymbol(DONATION_ID, DONOR,
                payment(1004, RECEIVED_ON, Money.czk(30000), ACCOUNT, "6123456789"), null, claim, NOW));
        assertThatIllegalArgumentException().isThrownBy(() -> Donation.pairedByConfirmedSymbol(DONATION_ID, DONOR,
                payment(1005, RECEIVED_ON, Money.czk(30000), ACCOUNT, "6123456789"), link, null, NOW));
    }

    @Test
    @DisplayName("Given a donation paired by a confirmed symbol, when reconstituted with its link and claim, then it keeps both")
    void should_keep_link_and_claim_when_reconstituted_given_confirmed_symbol_pairing() {
        SenderAccountLinkId link = SenderAccountLinkId.newId(NOW);
        SymbolClaimId claim = SymbolClaimId.newId(NOW);

        Donation donation = reconstituted(PairingMethod.CONFIRMED_SYMBOL, Optional.of(link), Optional.of(claim));

        assertThat(donation.pairedBy()).contains(PairingMethod.CONFIRMED_SYMBOL);
        assertThat(donation.pairedThrough()).contains(link);
        assertThat(donation.confirmedClaim()).contains(claim);
    }

    @Test
    @DisplayName("Given a donation paired by a confirmed symbol with only its link or only its claim, when reconstituted, then it is refused, while one with neither is accepted as erased with the donor")
    void should_refuse_when_reconstituted_given_confirmed_symbol_with_only_link_or_only_claim() {
        assertThatIllegalArgumentException().isThrownBy(() -> reconstituted(PairingMethod.CONFIRMED_SYMBOL, Optional.empty(),
                Optional.of(SymbolClaimId.newId(NOW))));
        assertThatIllegalArgumentException().isThrownBy(() -> reconstituted(PairingMethod.CONFIRMED_SYMBOL,
                Optional.of(SenderAccountLinkId.newId(NOW)), Optional.empty()));
        assertThat(reconstituted(PairingMethod.CONFIRMED_SYMBOL, Optional.empty(), Optional.empty()).pairedBy())
                .contains(PairingMethod.CONFIRMED_SYMBOL);
    }

    @Test
    @DisplayName("Given a donation paired by a confirmed symbol, when its pairing sources are forgotten, then a copy keeps everything but the link and the claim")
    void should_keep_everything_but_link_and_claim_when_pairing_sources_forgotten_given_confirmed_symbol_pairing() {
        Donation donation = reconstituted(PairingMethod.CONFIRMED_SYMBOL, Optional.of(SenderAccountLinkId.newId(NOW)),
                Optional.of(SymbolClaimId.newId(NOW)));

        Donation forgotten = donation.withoutPairingSources();

        assertThat(forgotten.id()).isEqualTo(donation.id());
        assertThat(forgotten.donor()).isEqualTo(donation.donor());
        assertThat(forgotten.bankPayment()).isEqualTo(donation.bankPayment());
        assertThat(forgotten.amount()).isEqualTo(donation.amount());
        assertThat(forgotten.receivedOn()).isEqualTo(donation.receivedOn());
        assertThat(forgotten.pairedBy()).contains(PairingMethod.CONFIRMED_SYMBOL);
        assertThat(forgotten.pairedThrough()).isEmpty();
        assertThat(forgotten.confirmedClaim()).isEmpty();
        assertThat(forgotten.purpose()).isEqualTo(donation.purpose());
        assertThat(forgotten.recordedAt()).isEqualTo(donation.recordedAt());
        assertThat(donation.pairedThrough()).isPresent();
    }

    @Test
    @DisplayName("Given a donation paired by symbol or by sender account, when reconstituted with a claim, then it is refused")
    void should_refuse_when_reconstituted_given_claim_without_confirmed_symbol_pairing() {
        assertThatIllegalArgumentException().isThrownBy(() -> reconstituted(PairingMethod.SENDER_ACCOUNT,
                Optional.of(SenderAccountLinkId.newId(NOW)), Optional.of(SymbolClaimId.newId(NOW))));
        assertThatIllegalArgumentException().isThrownBy(() -> reconstituted(PairingMethod.VARIABLE_SYMBOL, Optional.empty(),
                Optional.of(SymbolClaimId.newId(NOW))));
    }

    @Test
    @DisplayName("Given a donation paired by sender account without its link, when reconstituted, then it is accepted as before the links existed")
    void should_accept_when_reconstituted_given_sender_account_pairing_without_link() {
        Donation donation = reconstituted(PairingMethod.SENDER_ACCOUNT, Optional.empty(), Optional.empty());

        assertThat(donation.pairedThrough()).isEmpty();
        assertThat(donation.confirmedClaim()).isEmpty();
    }

    @Test
    @DisplayName("Given a bank payment, when a donation is made from it as paired by a confirmed symbol without the link and claim, then it is refused")
    void should_refuse_when_made_from_payment_given_confirmed_symbol_method() {
        BankPayment payment = payment(1001, RECEIVED_ON, Money.czk(30000), ACCOUNT, "6123456789");

        assertThatIllegalArgumentException().isThrownBy(() -> Donation.fromBankPayment(DONATION_ID, DONOR, payment,
                PairingMethod.CONFIRMED_SYMBOL, NOW));
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
    @DisplayName("Given a received and a refunded donation, when asked whether they count, then only the received one counts")
    void should_count_only_received_when_asked_given_received_and_refunded() {
        Donation received = Donation.reconstitute(DONATION_ID, DONOR, Optional.empty(), RECEIVED_ON, Money.czk(100), DonationSource.MANUAL,
                DonationStatus.RECEIVED, Optional.empty(), NOW);
        Donation refunded = Donation.reconstitute(DONATION_ID, DONOR, Optional.empty(), RECEIVED_ON, Money.czk(100), DonationSource.MANUAL,
                DonationStatus.REFUNDED, Optional.empty(), NOW);

        assertThat(received.isReceived()).isTrue();
        assertThat(refunded.isReceived()).isFalse();
    }

    @Test
    @DisplayName("Given a donation received on the last day of a year, when asked for its year, then it belongs to that year only")
    void should_belong_to_receipt_year_when_asked_given_last_day_of_year() {
        Donation donation = Donation.reconstitute(DONATION_ID, DONOR, Optional.empty(), LocalDate.of(2025, 12, 31), Money.czk(100),
                DonationSource.MANUAL, DonationStatus.RECEIVED, Optional.empty(), NOW);

        assertThat(donation.receivedIn(Year.of(2025))).isTrue();
        assertThat(donation.receivedIn(Year.of(2026))).isFalse();
        assertThat(donation.receivedYear()).isEqualTo(Year.of(2025));
    }

    @Test
    @DisplayName("Given the text of a donation id, when it is parsed, then it gives back the same id")
    void should_round_trip_when_parsed_given_donation_id_text() {
        assertThat(DonationId.of(DONATION_ID.toString())).isEqualTo(DONATION_ID);
    }

    private static Donation reconstituted(PairingMethod method, Optional<SenderAccountLinkId> link, Optional<SymbolClaimId> claim) {
        return Donation.reconstitute(DONATION_ID, DONOR, Optional.of(BankPaymentId.newId(NOW)), RECEIVED_ON, Money.czk(30000),
                DonationSource.BANK_TRANSFER, DonationStatus.RECEIVED, Optional.of(method), link, claim, DonationPurpose.GENERAL, NOW);
    }
}
