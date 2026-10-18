package cz.novanadeje.app.donations.domain.receipt;

import java.time.LocalDate;

public record ReplacedReceipt(ReceiptNumber number, LocalDate issuedOn) {

    public ReplacedReceipt {
        if (number == null || issuedOn == null) {
            throw new IllegalArgumentException("A replaced receipt needs its number and issue date");
        }
    }
}
