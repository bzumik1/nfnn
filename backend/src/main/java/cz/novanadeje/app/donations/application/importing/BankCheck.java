package cz.novanadeje.app.donations.application.importing;

import java.time.Instant;
import java.util.Optional;

public record BankCheck(Optional<Instant> bankDataAsOf, boolean checking) {

    public BankCheck {
        if (bankDataAsOf == null) {
            throw new IllegalArgumentException("The bank data time is optional, never null");
        }
    }
}
