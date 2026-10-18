package cz.novanadeje.app.donations.domain.report;

import cz.novanadeje.app.shared.domain.Currency;
import cz.novanadeje.app.shared.domain.Money;

import java.util.List;

public record Tally(int count, Money total) {

    public Tally {
        if (count < 0) {
            throw new IllegalArgumentException("A tally counts zero or more items: " + count);
        }
        if (total == null || total.isNegative()) {
            throw new IllegalArgumentException("A tally has a total of zero or more: " + total);
        }
    }

    public static Tally of(List<Money> amounts) {
        return new Tally(amounts.size(), amounts.stream().reduce(Money.zero(Currency.CZK), Money::plus));
    }
}
