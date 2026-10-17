package cz.novanadeje.app.donations.domain.bank;

import cz.novanadeje.app.shared.domain.Money;
import cz.novanadeje.app.shared.domain.VariableSymbol;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

class IncomingMovementTest {

    private static final BankTransactionId ID = new BankTransactionId(1001);
    private static final LocalDate BOOKED_ON = LocalDate.of(2026, 10, 15);
    private static final Optional<SenderAccount> SENDER = SenderAccount.parse("2900233333", "2010");

    @Test
    void should_reject_when_created_given_zero_amount() {
        assertThatIllegalArgumentException().isThrownBy(() -> movementOf(Money.czk(0)));
    }

    @Test
    void should_reject_when_created_given_negative_amount() {
        assertThatIllegalArgumentException().isThrownBy(() -> movementOf(Money.czk(-100)));
    }

    @Test
    void should_keep_raw_symbol_next_to_matching_form_when_created_given_padded_symbol() {
        IncomingMovement movement = movement(Optional.empty(), Optional.empty(), Optional.empty(), Optional.of("0004821937560"),
                Optional.empty(), Optional.empty(), Optional.empty(), "Bezhotovostní příjem");

        assertThat(movement.variableSymbol()).contains("0004821937560");
        assertThat(movement.matchingVariableSymbol()).contains(new VariableSymbol("4821937560"));
    }

    @Test
    void should_turn_blank_into_empty_when_created_given_blank_texts() {
        IncomingMovement movement = movement(Optional.of(" "), Optional.of(""), Optional.of("  "), Optional.of(" "),
                Optional.of(" "), Optional.of(" "), Optional.of("\t"), "Bezhotovostní příjem");

        assertThat(movement.counterpartyAccount()).isEmpty();
        assertThat(movement.counterpartyBankCode()).isEmpty();
        assertThat(movement.counterpartyName()).isEmpty();
        assertThat(movement.variableSymbol()).isEmpty();
        assertThat(movement.matchingVariableSymbol()).isEmpty();
        assertThat(movement.constantSymbol()).isEmpty();
        assertThat(movement.specificSymbol()).isEmpty();
        assertThat(movement.messageForRecipient()).isEmpty();
    }

    @Test
    void should_trim_when_created_given_surrounding_spaces() {
        IncomingMovement movement = movement(Optional.of(" 2900233333 "), Optional.of(" 2010 "), Optional.of(" Nováková Jana "),
                Optional.of(" 558 "), Optional.empty(), Optional.empty(), Optional.empty(), " Bezhotovostní příjem ");

        assertThat(movement.counterpartyAccount()).contains("2900233333");
        assertThat(movement.counterpartyBankCode()).contains("2010");
        assertThat(movement.counterpartyName()).contains("Nováková Jana");
        assertThat(movement.variableSymbol()).contains("558");
        assertThat(movement.transactionType()).isEqualTo("Bezhotovostní příjem");
    }

    @Test
    void should_cut_counterparty_account_when_created_given_overlong_account() {
        assertThat(withTexts(text(70), null, null, null, null, null, null, "t").counterpartyAccount())
                .hasValueSatisfying(value -> assertThat(value).hasSize(IncomingMovement.COUNTERPARTY_ACCOUNT_LENGTH));
    }

    @Test
    void should_cut_counterparty_bank_code_when_created_given_overlong_code() {
        assertThat(withTexts(null, text(12), null, null, null, null, null, "t").counterpartyBankCode())
                .hasValueSatisfying(value -> assertThat(value).hasSize(IncomingMovement.COUNTERPARTY_BANK_CODE_LENGTH));
    }

    @Test
    void should_cut_counterparty_name_when_created_given_overlong_name() {
        assertThat(withTexts(null, null, text(300), null, null, null, null, "t").counterpartyName())
                .hasValueSatisfying(value -> assertThat(value).hasSize(IncomingMovement.COUNTERPARTY_NAME_LENGTH));
    }

    @Test
    void should_cut_variable_symbol_and_match_the_cut_value_when_created_given_overlong_symbol() {
        IncomingMovement movement = withTexts(null, null, null, "0".repeat(15) + "1234567890", null, null, null, "t");

        assertThat(movement.variableSymbol()).contains("0".repeat(15) + "12345");
        assertThat(movement.matchingVariableSymbol()).contains(new VariableSymbol("12345"));
    }

    @Test
    void should_cut_constant_symbol_when_created_given_overlong_symbol() {
        assertThat(withTexts(null, null, null, null, text(11), null, null, "t").constantSymbol())
                .hasValueSatisfying(value -> assertThat(value).hasSize(IncomingMovement.CONSTANT_SYMBOL_LENGTH));
    }

    @Test
    void should_cut_specific_symbol_when_created_given_overlong_symbol() {
        assertThat(withTexts(null, null, null, null, null, text(11), null, "t").specificSymbol())
                .hasValueSatisfying(value -> assertThat(value).hasSize(IncomingMovement.SPECIFIC_SYMBOL_LENGTH));
    }

    @Test
    void should_cut_message_when_created_given_overlong_message() {
        assertThat(withTexts(null, null, null, null, null, null, text(600), "t").messageForRecipient())
                .hasValueSatisfying(value -> assertThat(value).hasSize(IncomingMovement.MESSAGE_FOR_RECIPIENT_LENGTH));
    }

    @Test
    void should_cut_transaction_type_when_created_given_overlong_type() {
        assertThat(withTexts(null, null, null, null, null, null, null, text(120)).transactionType())
                .hasSize(IncomingMovement.TRANSACTION_TYPE_LENGTH);
    }

    @Test
    void should_count_characters_not_code_units_when_cut_given_supplementary_characters() {
        String name = "😀".repeat(300);

        assertThat(withTexts(null, null, name, null, null, null, null, "t").counterpartyName())
                .hasValueSatisfying(value -> assertThat(value.codePointCount(0, value.length())).isEqualTo(IncomingMovement.COUNTERPARTY_NAME_LENGTH));
    }

    @Test
    void should_reject_when_created_given_inconsistent_matching_symbol() {
        assertThatIllegalArgumentException().isThrownBy(() -> new IncomingMovement(ID, BOOKED_ON, Money.czk(50000), SENDER,
                Optional.empty(), Optional.empty(), Optional.empty(), Optional.of("0558"), Optional.of(new VariableSymbol("0558")),
                Optional.empty(), Optional.empty(), Optional.empty(), "Bezhotovostní příjem"));
        assertThatIllegalArgumentException().isThrownBy(() -> new IncomingMovement(ID, BOOKED_ON, Money.czk(50000), SENDER,
                Optional.empty(), Optional.empty(), Optional.empty(), Optional.empty(), Optional.of(new VariableSymbol("558")),
                Optional.empty(), Optional.empty(), Optional.empty(), "Bezhotovostní příjem"));
    }

    @Test
    void should_accept_when_created_given_consistent_matching_symbol() {
        IncomingMovement movement = new IncomingMovement(ID, BOOKED_ON, Money.czk(50000), SENDER,
                Optional.empty(), Optional.empty(), Optional.empty(), Optional.of("0558"), Optional.of(new VariableSymbol("558")),
                Optional.empty(), Optional.empty(), Optional.empty(), "Bezhotovostní příjem");

        assertThat(movement.matchingVariableSymbol()).contains(new VariableSymbol("558"));
    }

    @Test
    void should_reject_when_created_given_missing_required_values() {
        assertThatIllegalArgumentException().isThrownBy(() -> IncomingMovement.of(null, BOOKED_ON, Money.czk(100), SENDER,
                Optional.empty(), Optional.empty(), Optional.empty(), Optional.empty(), Optional.empty(), Optional.empty(), Optional.empty(), "t"));
        assertThatIllegalArgumentException().isThrownBy(() -> IncomingMovement.of(ID, null, Money.czk(100), SENDER,
                Optional.empty(), Optional.empty(), Optional.empty(), Optional.empty(), Optional.empty(), Optional.empty(), Optional.empty(), "t"));
        assertThatIllegalArgumentException().isThrownBy(() -> IncomingMovement.of(ID, BOOKED_ON, Money.czk(100), SENDER,
                Optional.empty(), Optional.empty(), Optional.empty(), Optional.empty(), Optional.empty(), Optional.empty(), Optional.empty(), null));
    }

    private static IncomingMovement movementOf(Money amount) {
        return IncomingMovement.of(ID, BOOKED_ON, amount, SENDER, Optional.empty(), Optional.empty(), Optional.empty(), Optional.empty(),
                Optional.empty(), Optional.empty(), Optional.empty(), "Bezhotovostní příjem");
    }

    private static IncomingMovement movement(Optional<String> account, Optional<String> bankCode, Optional<String> name,
                                             Optional<String> variableSymbol, Optional<String> constantSymbol,
                                             Optional<String> specificSymbol, Optional<String> message, String type) {
        return IncomingMovement.of(ID, BOOKED_ON, Money.czk(50000), SENDER, account, bankCode, name, variableSymbol,
                constantSymbol, specificSymbol, message, type);
    }

    private static IncomingMovement withTexts(String account, String bankCode, String name, String variableSymbol,
                                              String constantSymbol, String specificSymbol, String message, String type) {
        return movement(Optional.ofNullable(account), Optional.ofNullable(bankCode), Optional.ofNullable(name),
                Optional.ofNullable(variableSymbol), Optional.ofNullable(constantSymbol), Optional.ofNullable(specificSymbol),
                Optional.ofNullable(message), type);
    }

    private static String text(int length) {
        return "x".repeat(length);
    }
}
