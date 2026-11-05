package cz.novanadeje.app.donations.domain.receipt;

import java.time.Instant;

public record ReceiptWithdrawal(Instant at, ReceiptWithdrawalReason reason) {

    public ReceiptWithdrawal {
        if (at == null || reason == null) {
            throw new IllegalArgumentException("A withdrawal has its time and its reason");
        }
    }
}
