package cz.novanadeje.app.donations.domain.bankcode;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.util.ArrayList;
import java.util.List;
import java.util.stream.IntStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class BankCodeListTest {

    @Test
    @DisplayName("Given four digits, when a bank code is made, then it keeps them")
    void should_keep_digits_when_made_given_four_digits() {
        assertThat(new BankCode("0800").value()).isEqualTo("0800");
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "800", "08000", "08a0", " 0800", "０８００"})
    @DisplayName("Given anything but exactly four ASCII digits, when a bank code is made, then it is refused")
    void should_refuse_when_made_given_not_four_digits(String value) {
        assertThatThrownBy(() -> new BankCode(value)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("Given no value, when a bank code is made, then it is refused")
    void should_refuse_when_made_given_null_code() {
        assertThatThrownBy(() -> new BankCode(null)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("Given a name with spaces around it, when a bank name is made, then it is trimmed")
    void should_trim_when_made_given_surrounding_spaces() {
        assertThat(new BankName("  Česká spořitelna, a.s. ").value()).isEqualTo("Česká spořitelna, a.s.");
    }

    @Test
    @DisplayName("Given a name of exactly 120 characters, when a bank name is made, then it is accepted")
    void should_accept_when_made_given_longest_name() {
        assertThat(new BankName("x".repeat(BankName.MAX_LENGTH)).value()).hasSize(120);
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "   ", "Banka\u0000", "Banka\nnová", "Banka\u007f", "Banka\u0085"})
    @DisplayName("Given an empty name or one with a control character, when a bank name is made, then it is refused")
    void should_refuse_when_made_given_empty_or_control_character(String value) {
        assertThatThrownBy(() -> new BankName(value)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("Given a name longer than 120 characters or none, when a bank name is made, then it is refused")
    void should_refuse_when_made_given_too_long_or_null_name() {
        assertThatThrownBy(() -> new BankName("x".repeat(121))).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new BankName(null)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("Given banks out of order, when a list is made, then it holds them sorted by code and cannot be changed")
    void should_sort_by_code_when_made_given_banks_out_of_order() {
        List<CzechBank> banks = new ArrayList<>(banks(BankCodeList.MIN_SIZE));
        java.util.Collections.reverse(banks);

        BankCodeList list = new BankCodeList(banks);

        assertThat(list.banks()).extracting(bank -> bank.code().value()).isSorted().hasSize(20);
        assertThatThrownBy(() -> list.banks().clear()).isInstanceOf(UnsupportedOperationException.class);
    }

    @Test
    @DisplayName("Given 20 and 500 banks, when a list is made, then both are accepted")
    void should_accept_when_made_given_size_at_bounds() {
        assertThat(new BankCodeList(banks(BankCodeList.MIN_SIZE)).banks()).hasSize(20);
        assertThat(new BankCodeList(banks(BankCodeList.MAX_SIZE)).banks()).hasSize(500);
    }

    @Test
    @DisplayName("Given fewer than 20 or more than 500 banks, when a list is made, then it is refused")
    void should_refuse_when_made_given_size_out_of_range() {
        assertThatThrownBy(() -> new BankCodeList(banks(19))).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new BankCodeList(banks(501))).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new BankCodeList(null)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("Given one code twice, when a list is made, then it is refused")
    void should_refuse_when_made_given_duplicate_code() {
        List<CzechBank> banks = new ArrayList<>(banks(BankCodeList.MIN_SIZE));
        banks.add(new CzechBank(new BankCode("0000"), new BankName("Jiná banka")));

        assertThatThrownBy(() -> new BankCodeList(banks)).isInstanceOf(IllegalArgumentException.class);
    }

    static List<CzechBank> banks(int count) {
        return IntStream.range(0, count)
                .mapToObj(index -> new CzechBank(new BankCode("%04d".formatted(index)), new BankName("Banka " + index)))
                .toList();
    }
}
