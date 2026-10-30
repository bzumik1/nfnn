package cz.novanadeje.app.donations.domain.payment;

import cz.novanadeje.app.donations.BankPayments;
import cz.novanadeje.app.donations.domain.BankAccount;
import cz.novanadeje.app.donations.domain.bank.SenderAccount;
import cz.novanadeje.app.donations.domain.donation.DonationPurpose;
import cz.novanadeje.app.shared.domain.Currency;
import cz.novanadeje.app.shared.domain.Iban;
import cz.novanadeje.app.shared.domain.Money;
import cz.novanadeje.app.shared.domain.VariableSymbol;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

class PaymentDetailsTest {

    private static final BankAccount FOUNDATION = new BankAccount("5544332217/2010", new Iban("CZ2620100000005544332217"), "Nadační fond Nová naděje");
    private static final VariableSymbol SYMBOL = new VariableSymbol("1234567890");

    private final PaymentDetails details = PaymentDetails.of(FOUNDATION);

    @Test
    @DisplayName("Given the foundation's account, when its payment details are made, then they carry the account, CZK and the SPAYD texts of the recipient and both messages")
    void should_carry_the_account_and_the_spayd_texts_when_made_given_the_foundations_account() {
        assertThat(details.account()).isEqualTo(FOUNDATION);
        assertThat(details.currency()).isEqualTo(Currency.CZK);
        assertThat(details.recipientName()).isEqualTo(new SpaydText("NADACNI FOND NOVA NADEJE"));
        assertThat(details.donationMessage()).isEqualTo(new SpaydText("DAR NADACNI FOND NOVA NADEJE"));
        assertThat(details.accountVerificationMessage()).isEqualTo(new SpaydText("OVERENI UCTU NADACNI FOND NOVA NADEJE"));
        assertThat(details.accountVerificationAmount()).isEqualTo(Money.czk(100));
    }

    @Test
    @DisplayName("Given the payment details, when they are compared with today's QR payments, then the recipient and each message are the RN and MSG those payments send")
    void should_match_the_rn_and_msg_of_todays_qr_payments_when_compared() {
        String donation = QrPayment.donation(FOUNDATION, Money.czk(50_000)).toSpayd();
        String verification = QrPayment.accountVerification(FOUNDATION, details.accountVerificationAmount(), SYMBOL).toSpayd();

        assertThat(donation).endsWith("*RN:" + details.recipientName().value() + "*MSG:" + details.donationMessage().value());
        assertThat(verification).endsWith("*RN:" + details.recipientName().value() + "*MSG:" + details.accountVerificationMessage().value());
    }

    @Test
    @DisplayName("Given a payment of the verification amount with the verification message, when the import reads its purpose, then it is an account verification")
    void should_be_read_as_an_account_verification_when_the_import_reads_a_payment_of_the_served_amount_and_message() {
        var payment = BankPayments.payment(1, BankPayments.BOOKED_ON, details.accountVerificationAmount(),
                Optional.of(new SenderAccount("19-2000145399", "0800")), SYMBOL.value(), details.accountVerificationMessage().value());

        assertThat(DonationPurpose.of(payment)).isEqualTo(DonationPurpose.ACCOUNT_VERIFICATION);
    }

    @Test
    @DisplayName("Given a recipient name with a percent sign, when the payment details are made, then the recipient's SPAYD text has a space for it")
    void should_write_a_space_for_a_percent_sign_when_made_given_it_in_the_recipient_name() {
        BankAccount account = new BankAccount("5544332217/2010", new Iban("CZ2620100000005544332217"), "Fond 100% pro děti");

        assertThat(PaymentDetails.of(account).recipientName()).isEqualTo(new SpaydText("FOND 100 PRO DETI"));
    }

    @Test
    @DisplayName("Given a verification amount that is not positive, when the payment details are created, then they are refused")
    void should_refuse_when_created_given_a_verification_amount_that_is_not_positive() {
        assertThatIllegalArgumentException().isThrownBy(() -> new PaymentDetails(FOUNDATION, Currency.CZK, details.recipientName(),
                details.donationMessage(), details.accountVerificationMessage(), Money.zero(Currency.CZK)));
    }

    @Test
    @DisplayName("Given a recipient's SPAYD text over 35 characters, when the payment details are created, then they are refused, since RN holds 35 at most")
    void should_refuse_when_created_given_a_recipient_over_35_characters() {
        SpaydText thirtySix = new SpaydText("A".repeat(SpaydText.RECIPIENT_NAME_LENGTH + 1));

        assertThatIllegalArgumentException().isThrownBy(() -> new PaymentDetails(FOUNDATION, Currency.CZK, thirtySix,
                details.donationMessage(), details.accountVerificationMessage(), details.accountVerificationAmount()));
    }

    @ParameterizedTest(name = "{0} message empty")
    @ValueSource(strings = {"donation", "account verification"})
    @DisplayName("Given an empty message, when the payment details are created, then they are refused, since the contract promises a message that is never empty")
    void should_refuse_when_created_given_an_empty_message(String emptyOne) {
        SpaydText empty = SpaydText.message("");
        SpaydText donation = emptyOne.equals("donation") ? empty : details.donationMessage();
        SpaydText verification = emptyOne.equals("donation") ? details.accountVerificationMessage() : empty;

        assertThatIllegalArgumentException().isThrownBy(() -> new PaymentDetails(FOUNDATION, Currency.CZK, details.recipientName(),
                donation, verification, details.accountVerificationAmount()));
    }

    @Test
    @DisplayName("Given a missing part, when the payment details are created, then they are refused")
    void should_refuse_when_created_given_a_missing_part() {
        assertThatIllegalArgumentException().isThrownBy(() -> new PaymentDetails(null, Currency.CZK, details.recipientName(),
                details.donationMessage(), details.accountVerificationMessage(), details.accountVerificationAmount()));
        assertThatIllegalArgumentException().isThrownBy(() -> new PaymentDetails(FOUNDATION, Currency.CZK, details.recipientName(),
                null, details.accountVerificationMessage(), details.accountVerificationAmount()));
    }
}
