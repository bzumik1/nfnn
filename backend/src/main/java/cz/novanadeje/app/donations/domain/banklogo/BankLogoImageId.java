package cz.novanadeje.app.donations.domain.banklogo;

import java.util.UUID;

public record BankLogoImageId(UUID value) {

    public BankLogoImageId {
        if (value == null) {
            throw new IllegalArgumentException("A bank logo image id needs a value");
        }
    }
}
