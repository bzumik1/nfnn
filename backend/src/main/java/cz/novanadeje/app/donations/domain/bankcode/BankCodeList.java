package cz.novanadeje.app.donations.domain.bankcode;

import java.util.Comparator;
import java.util.List;

public record BankCodeList(List<CzechBank> banks) {

    public static final int MIN_SIZE = 20;
    public static final int MAX_SIZE = 500;

    public BankCodeList {
        if (banks == null || banks.size() < MIN_SIZE || banks.size() > MAX_SIZE) {
            throw new IllegalArgumentException("A bank code list has " + MIN_SIZE + " to " + MAX_SIZE + " banks");
        }
        if (banks.stream().map(CzechBank::code).distinct().count() != banks.size()) {
            throw new IllegalArgumentException("A bank code list names each code once");
        }
        banks = banks.stream().sorted(Comparator.comparing(bank -> bank.code().value())).toList();
    }
}
