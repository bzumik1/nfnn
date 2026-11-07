package cz.novanadeje.app.donations.domain.bankcode;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.stream.IntStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class BankCodeListTest {

    @Test
    @DisplayName("Given banks out of order, when a list is made, then it holds them sorted by code and cannot be changed")
    void should_sort_by_code_when_made_given_banks_out_of_order() {
        List<CzechBank> banks = new ArrayList<>(banks(BankCodeList.MIN_SIZE));
        Collections.reverse(banks);

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
