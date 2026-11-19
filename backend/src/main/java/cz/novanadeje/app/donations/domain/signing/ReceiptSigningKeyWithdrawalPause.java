package cz.novanadeje.app.donations.domain.signing;

import java.time.Duration;
import java.time.Instant;

public final class ReceiptSigningKeyWithdrawalPause {

    public static final int REFUSALS = 5;
    private static final Duration WINDOW = Duration.ofMinutes(15);

    private ReceiptSigningKeyWithdrawalPause() {
    }

    public static Instant refusalsCountedSince(Instant now) {
        return now.minus(WINDOW);
    }

    public static boolean pausedAfter(long refusalsInTheWindow) {
        return refusalsInTheWindow >= REFUSALS;
    }
}
