package cz.novanadeje.app.operations.domain.backup;

import java.time.Duration;
import java.time.Instant;
import java.util.Optional;

public record BackupKeyWordChallenge(BackupKeyWordPositions positions, Instant validUntil, int attemptsLeft) {

    private static final Duration VALID_FOR = Duration.ofMinutes(30);
    private static final int ATTEMPTS = 5;

    public BackupKeyWordChallenge {
        if (positions == null || validUntil == null || attemptsLeft < 1) {
            throw new IllegalArgumentException("A backup key word challenge needs its positions, its expiry and an attempt left");
        }
    }

    public static BackupKeyWordChallenge issue(BackupKeyWordPositions positions, Instant now) {
        return new BackupKeyWordChallenge(positions, now.plus(VALID_FOR), ATTEMPTS);
    }

    public boolean expiredAt(Instant now) {
        return now.isAfter(validUntil);
    }

    public Optional<BackupKeyWordChallenge> afterRefusal() {
        return attemptsLeft == 1 ? Optional.empty() : Optional.of(new BackupKeyWordChallenge(positions, validUntil, attemptsLeft - 1));
    }
}
