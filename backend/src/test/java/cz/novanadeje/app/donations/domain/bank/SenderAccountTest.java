package cz.novanadeje.app.donations.domain.bank;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

class SenderAccountTest {

    @Test
    @DisplayName("Given a prefixed account with zeros, when it is parsed, then leading zeros are stripped")
    void should_strip_leading_zeros_when_parsed_given_prefixed_account_with_zeros() {
        assertThat(SenderAccount.parse("000123-0000456789", "0100"))
                .contains(new SenderAccount("123-456789", "0100"))
                .map(SenderAccount::display)
                .contains("123-456789/0100");
    }

    @Test
    @DisplayName("Given an account with spaces, when it is parsed, then the spaces are removed")
    void should_remove_spaces_when_parsed_given_account_with_spaces() {
        assertThat(SenderAccount.parse(" 29 0023 3333 ", " 2010 ")).contains(new SenderAccount("2900233333", "2010"));
    }

    @Test
    @DisplayName("Given an all-zero prefix, when the account is parsed, then the prefix is dropped")
    void should_drop_prefix_when_parsed_given_all_zero_prefix() {
        assertThat(SenderAccount.parse("000000-2900233333", "2010")).contains(new SenderAccount("2900233333", "2010"));
    }

    @Test
    @DisplayName("Given a missing bank code, when the account is parsed, then the result is empty")
    void should_be_empty_when_parsed_given_missing_bank_code() {
        assertThat(SenderAccount.parse("2900233333", null)).isEmpty();
        assertThat(SenderAccount.parse("2900233333", " ")).isEmpty();
    }

    @Test
    @DisplayName("Given a missing account, when it is parsed, then the result is empty")
    void should_be_empty_when_parsed_given_missing_account() {
        assertThat(SenderAccount.parse(null, "2010")).isEmpty();
        assertThat(SenderAccount.parse("", "2010")).isEmpty();
    }

    @Test
    @DisplayName("Given a three-digit bank code, when the account is parsed, then the result is empty")
    void should_be_empty_when_parsed_given_three_digit_bank_code() {
        assertThat(SenderAccount.parse("2900233333", "201")).isEmpty();
    }

    @Test
    @DisplayName("Given an IBAN, when it is parsed as a Czech account, then the result is empty")
    void should_be_empty_when_parsed_given_iban() {
        assertThat(SenderAccount.parse("DE89370400440532013000", null)).isEmpty();
        assertThat(SenderAccount.parse("DE89370400440532013000", "2010")).isEmpty();
    }

    @Test
    @DisplayName("Given an all-zero number, when the account is parsed, then the result is empty")
    void should_be_empty_when_parsed_given_all_zero_number() {
        assertThat(SenderAccount.parse("123-0000000000", "0100")).isEmpty();
    }

    @Test
    @DisplayName("Given parts that are too long, when the account is parsed, then the result is empty")
    void should_be_empty_when_parsed_given_too_long_parts() {
        assertThat(SenderAccount.parse("12345678901", "0100")).isEmpty();
        assertThat(SenderAccount.parse("1234567-2900233333", "0100")).isEmpty();
    }

    @Test
    @DisplayName("Given the same canonical form, when two accounts are compared, then they are equal")
    void should_be_equal_when_compared_given_same_canonical_form() {
        assertThat(SenderAccount.parse("0000-0029002333", "2010")).isEqualTo(SenderAccount.parse("29002333", "2010")).isPresent();
    }

    @Test
    @DisplayName("Given an account without a prefix, when it is displayed, then it shows no prefix")
    void should_display_without_prefix_when_displayed_given_account_without_prefix() {
        assertThat(new SenderAccount("2900233333", "2010").display()).isEqualTo("2900233333/2010");
    }

    @Test
    @DisplayName("Given accounts with and without a prefix, when they are shown shortened, then only the last four digits and the bank code remain")
    void should_keep_the_last_four_digits_and_the_bank_code_when_shown_shortened() {
        assertThat(new SenderAccount("2900233333", "2010").shortDisplay()).isEqualTo("…3333/2010");
        assertThat(new SenderAccount("19-2000145399", "0800").shortDisplay()).isEqualTo("…5399/0800");
        assertThat(new SenderAccount("29", "2010").shortDisplay()).isEqualTo("…29/2010");
    }

    @Test
    @DisplayName("Given non-canonical values, when an account is created, then it is rejected")
    void should_reject_when_created_given_non_canonical_values() {
        assertThatIllegalArgumentException().isThrownBy(() -> new SenderAccount("0029", "2010"));
        assertThatIllegalArgumentException().isThrownBy(() -> new SenderAccount("0-29", "2010"));
        assertThatIllegalArgumentException().isThrownBy(() -> new SenderAccount("29", "201"));
        assertThatIllegalArgumentException().isThrownBy(() -> new SenderAccount(null, "2010"));
        assertThatIllegalArgumentException().isThrownBy(() -> new SenderAccount("29 33", "2010"));
    }
}
