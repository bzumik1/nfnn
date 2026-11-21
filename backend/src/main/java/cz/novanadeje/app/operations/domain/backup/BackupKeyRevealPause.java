package cz.novanadeje.app.operations.domain.backup;

import java.time.Duration;
import java.time.Instant;

public final class BackupKeyRevealPause {

    private static final int REFUSALS = 5;
    private static final Duration WINDOW = Duration.ofMinutes(15);

    private BackupKeyRevealPause() {
    }

    public static Instant refusalsCountedSince(Instant now) {
        return now.minus(WINDOW);
    }

    public static boolean pausedAfter(long refusalsInTheWindow) {
        return refusalsInTheWindow >= REFUSALS;
    }
}
