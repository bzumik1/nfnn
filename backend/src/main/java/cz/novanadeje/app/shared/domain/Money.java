package cz.novanadeje.app.shared.domain;

import java.math.BigDecimal;
import java.math.RoundingMode;

public record Money(long amountMinor, Currency currency) {

    private static final int MINOR_UNITS_SCALE = 2;

    public Money {
        if (currency == null) {
            throw new IllegalArgumentException("Currency is required");
        }
    }

    public static Money czk(long amountMinor) {
        return new Money(amountMinor, Currency.CZK);
    }

    public static Money of(BigDecimal amount, Currency currency) {
        if (amount == null) {
            throw new IllegalArgumentException("Amount is required");
        }
        BigDecimal minor = amount.setScale(MINOR_UNITS_SCALE, RoundingMode.UNNECESSARY).movePointRight(MINOR_UNITS_SCALE);
        return new Money(minor.longValueExact(), currency);
    }

    public static Money zero(Currency currency) {
        return new Money(0, currency);
    }

    public BigDecimal toDecimal() {
        return BigDecimal.valueOf(amountMinor, MINOR_UNITS_SCALE);
    }

    public Money plus(Money other) {
        requireSameCurrency(other);
        return new Money(Math.addExact(amountMinor, other.amountMinor), currency);
    }

    public Money negated() {
        return new Money(Math.negateExact(amountMinor), currency);
    }

    public boolean isPositive() {
        return amountMinor > 0;
    }

    public boolean isNegative() {
        return amountMinor < 0;
    }

    private void requireSameCurrency(Money other) {
        if (other.currency != currency) {
            throw new IllegalArgumentException("Cannot combine " + currency + " with " + other.currency);
        }
    }
}
