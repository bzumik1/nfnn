package cz.novanadeje.app.donations.domain.importing;

import cz.novanadeje.app.shared.domain.Money;

import java.time.Instant;

public record AccountBalance(Money amount, Instant readAt) {

    public AccountBalance {
        if (amount == null || readAt == null) {
            throw new IllegalArgumentException("An account balance needs its amount and the time it was read");
        }
    }
}
