package cz.novanadeje.app.donations.domain.bank;

import cz.novanadeje.app.shared.domain.Money;
import cz.novanadeje.app.shared.domain.VariableSymbol;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

class BankPaymentTest {

    private static final Instant NOW = Instant.parse("2026-10-17T10:00:00Z");
    private static final BankPaymentId PAYMENT_ID = BankPaymentId.newId(NOW);

    @Test
    @DisplayName("Given an incoming movement, when a payment is created from it, then every field is copied")
    void should_copy_every_field_when_created_given_incoming_movement() {
        IncomingMovement movement = IncomingMovement.of(new BankTransactionId(1001), LocalDate.of(2026, 10, 15), Money.czk(50000),
                SenderAccount.parse("2900233333", "2010"), Optional.of("2900233333"), Optional.of("2010"), Optional.of("Nováková Jana"),
                Optional.of("0558"), Optional.of("0308"), Optional.of("77"), Optional.of("Dar"), "Bezhotovostní příjem");

        BankPayment payment = BankPayment.incoming(PAYMENT_ID, movement, NOW);

        assertThat(payment.id()).isEqualTo(PAYMENT_ID);
        assertThat(payment.transactionId()).isEqualTo(new BankTransactionId(1001));
        assertThat(payment.bookedOn()).isEqualTo(LocalDate.of(2026, 10, 15));
        assertThat(payment.amount()).isEqualTo(Money.czk(50000));
        assertThat(payment.sender()).contains(new SenderAccount("2900233333", "2010"));
        assertThat(payment.counterpartyAccount()).contains("2900233333");
        assertThat(payment.counterpartyBankCode()).contains("2010");
        assertThat(payment.counterpartyName()).contains("Nováková Jana");
        assertThat(payment.variableSymbol()).contains("0558");
        assertThat(payment.matchingVariableSymbol()).contains(new VariableSymbol("558"));
        assertThat(payment.constantSymbol()).contains("0308");
        assertThat(payment.specificSymbol()).contains("77");
        assertThat(payment.messageForRecipient()).contains("Dar");
        assertThat(payment.transactionType()).isEqualTo("Bezhotovostní příjem");
        assertThat(payment.importedAt()).isEqualTo(NOW);
    }

    @Test
    @DisplayName("Given a matching form, when the payment is asked, then it carries the variable symbol")
    void should_carry_variable_symbol_when_asked_given_matching_form_present() {
        assertThat(paymentWithSymbol("0558").carriesVariableSymbol()).isTrue();
    }

    @Test
    @DisplayName("Given a symbol without a matching form, when the payment is asked, then it carries no variable symbol")
    void should_not_carry_variable_symbol_when_asked_given_symbol_without_matching_form() {
        BankPayment payment = paymentWithSymbol("ABC");

        assertThat(payment.variableSymbol()).contains("ABC");
        assertThat(payment.carriesVariableSymbol()).isFalse();
    }

    @Test
    @DisplayName("Given a Czech or a foreign payer, when the payment is asked, then it tells whether the sender is known")
    void should_tell_whether_a_sender_is_known_when_asked_given_czech_or_foreign_payer() {
        assertThat(paymentWithSymbol(null).hasSender()).isTrue();
        BankPayment foreign = BankPayment.incoming(PAYMENT_ID, IncomingMovement.of(new BankTransactionId(1), LocalDate.of(2026, 10, 15),
                Money.czk(100), SenderAccount.parse("DE89370400440532013000", null), Optional.of("DE89370400440532013000"),
                Optional.empty(), Optional.empty(), Optional.empty(), Optional.empty(), Optional.empty(), Optional.empty(), "t"), NOW);
        assertThat(foreign.hasSender()).isFalse();
    }

    @Test
    @DisplayName("Given a non-positive amount, when a payment is created, then it is rejected")
    void should_reject_when_created_given_non_positive_amount() {
        assertThatIllegalArgumentException().isThrownBy(() -> new BankPayment(PAYMENT_ID, new BankTransactionId(1), LocalDate.of(2026, 10, 15),
                Money.czk(0), Optional.empty(), Optional.empty(), Optional.empty(), Optional.empty(), Optional.empty(), Optional.empty(),
                Optional.empty(), Optional.empty(), Optional.empty(), "t", NOW, Optional.empty()));
    }

    @Test
    @DisplayName("Given an inconsistent matching symbol, when a payment is created, then it is rejected")
    void should_reject_when_created_given_inconsistent_matching_symbol() {
        assertThatIllegalArgumentException().isThrownBy(() -> new BankPayment(PAYMENT_ID, new BankTransactionId(1), LocalDate.of(2026, 10, 15),
                Money.czk(100), Optional.empty(), Optional.empty(), Optional.empty(), Optional.empty(), Optional.of("0558"),
                Optional.of(new VariableSymbol("0558")), Optional.empty(), Optional.empty(), Optional.empty(), "t", NOW, Optional.empty()));
    }

    @Test
    @DisplayName("Given a missing import time, when a payment is created, then it is rejected")
    void should_reject_when_created_given_missing_import_time() {
        assertThatIllegalArgumentException().isThrownBy(() -> new BankPayment(PAYMENT_ID, new BankTransactionId(1), LocalDate.of(2026, 10, 15),
                Money.czk(100), Optional.empty(), Optional.empty(), Optional.empty(), Optional.empty(), Optional.empty(),
                Optional.empty(), Optional.empty(), Optional.empty(), Optional.empty(), "t", null, Optional.empty()));
    }

    @Test
    @DisplayName("Given an incoming movement, when it is imported, then the payment is not left to pairing by hand")
    void should_pair_automatically_when_imported_given_incoming_movement() {
        assertThat(paymentWithSymbol(null).isPairedByHandOnly()).isFalse();
        assertThat(paymentWithSymbol(null).unpairedByAdminAt()).isEmpty();
    }

    @Test
    @DisplayName("Given an imported payment, when an administrator has unpaired it, then it is paired only by hand")
    void should_be_paired_by_hand_only_when_an_admin_unpaired_it_given_imported_payment() {
        BankPayment payment = paymentWithSymbol("0558");
        Instant unpairedAt = NOW.plusSeconds(3600);

        BankPayment held = payment.unpairedByAdmin(unpairedAt);

        assertThat(held.isPairedByHandOnly()).isTrue();
        assertThat(held.unpairedByAdminAt()).contains(unpairedAt);
        assertThat(held.id()).isEqualTo(payment.id());
        assertThat(held.matchingVariableSymbol()).isEqualTo(payment.matchingVariableSymbol());
        assertThat(payment.isPairedByHandOnly()).isFalse();
    }

    @Test
    @DisplayName("Given no time, when an administrator unpairs a payment, then it is rejected")
    void should_reject_when_unpaired_by_admin_given_no_time() {
        assertThatIllegalArgumentException().isThrownBy(() -> paymentWithSymbol(null).unpairedByAdmin(null));
    }

    @Test
    @DisplayName("Given a negative transaction id, when a payment is created, then it is rejected")
    void should_reject_when_created_given_negative_transaction_id() {
        assertThatIllegalArgumentException().isThrownBy(() -> new BankTransactionId(-1));
    }

    @Test
    @DisplayName("Given an id text, when it is parsed, then it reads the payment id")
    void should_read_id_when_parsed_given_text() {
        assertThat(BankPaymentId.of(PAYMENT_ID.toString())).isEqualTo(PAYMENT_ID);
    }

    private static BankPayment paymentWithSymbol(String variableSymbol) {
        return BankPayment.incoming(PAYMENT_ID, IncomingMovement.of(new BankTransactionId(1), LocalDate.of(2026, 10, 15), Money.czk(100),
                SenderAccount.parse("2900233333", "2010"), Optional.of("2900233333"), Optional.of("2010"), Optional.empty(),
                Optional.ofNullable(variableSymbol), Optional.empty(), Optional.empty(), Optional.empty(), "t"), NOW);
    }
}
