package cz.novanadeje.app.donations.domain.receipt;

import java.time.Instant;

public record ReceiptSignatory(PersonReference person, String receiptRole, Instant chosenAt) {

    public static final int MAX_ROLE_LENGTH = 120;

    public ReceiptSignatory {
        if (person == null || receiptRole == null || chosenAt == null) {
            throw new IllegalArgumentException("A receipt signatory names a person, the role printed on receipts and when they were chosen");
        }
        receiptRole = receiptRole.strip();
        if (receiptRole.isEmpty() || receiptRole.length() > MAX_ROLE_LENGTH) {
            throw new IllegalArgumentException("The role printed on receipts has 1 to " + MAX_ROLE_LENGTH + " characters");
        }
    }
}
