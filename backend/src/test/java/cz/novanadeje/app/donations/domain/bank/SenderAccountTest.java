package cz.novanadeje.app.donations.domain.bank;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

class SenderAccountTest {

    @Test
    void should_strip_leading_zeros_when_parsed_given_prefixed_account_with_zeros() {
        assertThat(SenderAccount.parse("000123-0000456789", "0100"))
                .contains(new SenderAccount("123-456789", "0100"))
                .map(SenderAccount::display)
                .contains("123-456789/0100");
    }

    @Test
    void should_remove_spaces_when_parsed_given_account_with_spaces() {
        assertThat(SenderAccount.parse(" 29 0023 3333 ", " 2010 ")).contains(new SenderAccount("2900233333", "2010"));
    }

    @Test
    void should_drop_prefix_when_parsed_given_all_zero_prefix() {
        assertThat(SenderAccount.parse("000000-2900233333", "2010")).contains(new SenderAccount("2900233333", "2010"));
    }

    @Test
    void should_be_empty_when_parsed_given_missing_bank_code() {
        assertThat(SenderAccount.parse("2900233333", null)).isEmpty();
        assertThat(SenderAccount.parse("2900233333", " ")).isEmpty();
    }

    @Test
    void should_be_empty_when_parsed_given_missing_account() {
        assertThat(SenderAccount.parse(null, "2010")).isEmpty();
        assertThat(SenderAccount.parse("", "2010")).isEmpty();
    }

    @Test
    void should_be_empty_when_parsed_given_three_digit_bank_code() {
        assertThat(SenderAccount.parse("2900233333", "201")).isEmpty();
    }

    @Test
    void should_be_empty_when_parsed_given_iban() {
        assertThat(SenderAccount.parse("DE89370400440532013000", null)).isEmpty();
        assertThat(SenderAccount.parse("DE89370400440532013000", "2010")).isEmpty();
    }

    @Test
    void should_be_empty_when_parsed_given_all_zero_number() {
        assertThat(SenderAccount.parse("123-0000000000", "0100")).isEmpty();
    }

    @Test
    void should_be_empty_when_parsed_given_too_long_parts() {
        assertThat(SenderAccount.parse("12345678901", "0100")).isEmpty();
        assertThat(SenderAccount.parse("1234567-2900233333", "0100")).isEmpty();
    }

    @Test
    void should_be_equal_when_compared_given_same_canonical_form() {
        assertThat(SenderAccount.parse("0000-0029002333", "2010")).isEqualTo(SenderAccount.parse("29002333", "2010")).isPresent();
    }

    @Test
    void should_display_without_prefix_when_displayed_given_account_without_prefix() {
        assertThat(new SenderAccount("2900233333", "2010").display()).isEqualTo("2900233333/2010");
    }

    @Test
    void should_reject_when_created_given_non_canonical_values() {
        assertThatIllegalArgumentException().isThrownBy(() -> new SenderAccount("0029", "2010"));
        assertThatIllegalArgumentException().isThrownBy(() -> new SenderAccount("0-29", "2010"));
        assertThatIllegalArgumentException().isThrownBy(() -> new SenderAccount("29", "201"));
        assertThatIllegalArgumentException().isThrownBy(() -> new SenderAccount(null, "2010"));
        assertThatIllegalArgumentException().isThrownBy(() -> new SenderAccount("29 33", "2010"));
    }
}
