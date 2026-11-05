package cz.novanadeje.app.donations.domain.receipt;

import java.util.Optional;

public enum ReceiptStanding {
    ACTIVE,
    REPLACED,
    WITHDRAWN,
    OUTDATED;

    public static ReceiptStanding of(ReceiptStatus status, Optional<ReceiptWithdrawalReason> withdrawal) {
        return switch (status) {
            case ACTIVE -> ACTIVE;
            case REPLACED -> REPLACED;
            case WITHDRAWN -> withdrawal.map(reason -> switch (reason) {
                case DONATIONS_CHANGED -> OUTDATED;
            }).orElse(WITHDRAWN);
        };
    }
}
