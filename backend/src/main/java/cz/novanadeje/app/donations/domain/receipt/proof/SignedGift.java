package cz.novanadeje.app.donations.domain.receipt.proof;

import java.time.LocalDate;

public record SignedGift(LocalDate receivedOn, long amountMinor) {

    public SignedGift {
        if (receivedOn == null) {
            throw new IllegalArgumentException("A signed gift names the day it was received");
        }
        if (amountMinor < 1) {
            throw new IllegalArgumentException("A signed gift has a positive amount: " + amountMinor);
        }
    }
}
