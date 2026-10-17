package cz.novanadeje.app.donations.domain.bank;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class SenderAccountTest {

    @Test
    @DisplayName("Given an account with zero-padded prefix and number, when parsed, then the canonical form drops the leading zeros and keeps the bank code")
    void should_strip_leading_zeros_when_parsed_given_padded_prefix_and_number() {
        Optional<SenderAccount> account = SenderAccount.parse("000123-0000456789", "0100");

        assertThat(account).contains(new SenderAccount("123-456789", "0100"));
        assertThat(account.orElseThrow().display()).isEqualTo("123-456789/0100");
    }

    @Test
    @DisplayName("Given an account and a bank code with spaces, when parsed, then the spaces are removed")
    void should_remove_spaces_when_parsed_given_account_with_spaces() {
        assertThat(SenderAccount.parse(" 29 0023 3333 ", " 2010 ")).contains(new SenderAccount("2900233333", "2010"));
    }

    @Test
    @DisplayName("Given an all-zero prefix, when parsed, then the prefix is dropped")
    void should_drop_prefix_when_parsed_given_all_zero_prefix() {
        assertThat(SenderAccount.parse("000000-2900233333", "2010")).contains(new SenderAccount("2900233333", "2010"));
    }

    @Test
    @DisplayName("Given no bank code, when parsed, then there is no sender account")
    void should_be_empty_when_parsed_given_missing_bank_code() {
        assertThat(SenderAccount.parse("2900233333", null)).isEmpty();
        assertThat(SenderAccount.parse("2900233333", "  ")).isEmpty();
    }

    @Test
    @DisplayName("Given no account number, when parsed, then there is no sender account")
    void should_be_empty_when_parsed_given_missing_account() {
        assertThat(SenderAccount.parse(null, "2010")).isEmpty();
        assertThat(SenderAccount.parse("", "2010")).isEmpty();
    }

    @Test
    @DisplayName("Given a three-digit bank code, when parsed, then there is no sender account")
    void should_be_empty_when_parsed_given_three_digit_bank_code() {
        assertThat(SenderAccount.parse("2900233333", "201")).isEmpty();
    }

    @Test
    @DisplayName("Given an IBAN, when parsed, then there is no sender account")
    void should_be_empty_when_parsed_given_iban() {
        assertThat(SenderAccount.parse("DE89370400440532013000", null)).isEmpty();
        assertThat(SenderAccount.parse("DE89370400440532013000", "3704")).isEmpty();
    }

    @Test
    @DisplayName("Given an all-zero account number, when parsed, then there is no sender account")
    void should_be_empty_when_parsed_given_all_zero_number() {
        assertThat(SenderAccount.parse("0000000000", "2010")).isEmpty();
        assertThat(SenderAccount.parse("123-000", "2010")).isEmpty();
    }

    @Test
    @DisplayName("Given a number longer than ten digits or a prefix longer than six, when parsed, then there is no sender account")
    void should_be_empty_when_parsed_given_overlong_parts() {
        assertThat(SenderAccount.parse("12345678901", "2010")).isEmpty();
        assertThat(SenderAccount.parse("1234567-2900233333", "2010")).isEmpty();
    }

    @Test
    @DisplayName("Given two spellings of one account, when parsed, then they are equal by their canonical form")
    void should_be_equal_when_parsed_given_two_spellings_of_one_account() {
        assertThat(SenderAccount.parse("0-2900233333", "2010")).isEqualTo(SenderAccount.parse("2900 233 333", "2010"));
    }

    @Test
    @DisplayName("Given a non-canonical account, when constructed directly, then it is refused")
    void should_refuse_when_constructed_given_non_canonical_values() {
        assertThatThrownBy(() -> new SenderAccount("0123", "2010")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new SenderAccount("0-123", "2010")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new SenderAccount("123", "201")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new SenderAccount(null, "2010")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new SenderAccount("123", null)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("Given the column widths, when read, then the number fits 17 characters and the bank code 4")
    void should_expose_column_widths_when_read_given_constants() {
        assertThat(SenderAccount.MAX_ACCOUNT_NUMBER_LENGTH).isEqualTo(17);
        assertThat(SenderAccount.BANK_CODE_LENGTH).isEqualTo(4);
    }
}
