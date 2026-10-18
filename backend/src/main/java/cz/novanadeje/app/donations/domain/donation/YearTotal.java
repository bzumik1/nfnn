package cz.novanadeje.app.donations.domain.donation;

import cz.novanadeje.app.shared.domain.Money;

import java.time.Year;

public record YearTotal(Year year, int count, Money total) {

    public YearTotal {
        if (year == null || total == null) {
            throw new IllegalArgumentException("A year total needs its year and its total");
        }
        if (count < 0) {
            throw new IllegalArgumentException("A year total cannot count fewer than zero donations: " + count);
        }
    }
}
