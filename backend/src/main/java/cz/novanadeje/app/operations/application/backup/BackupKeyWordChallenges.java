package cz.novanadeje.app.operations.application.backup;

import cz.novanadeje.app.operations.domain.backup.BackupKeyConfirmationExpired;
import cz.novanadeje.app.operations.domain.backup.BackupKeyWordPositions;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.random.RandomGenerator;

@Component
public class BackupKeyWordChallenges {

    static final Duration VALID_FOR = Duration.ofMinutes(30);
    static final int ATTEMPTS = 5;

    private final RandomGenerator random;
    private final Map<UUID, Challenge> open = new ConcurrentHashMap<>();

    @Autowired
    public BackupKeyWordChallenges() {
        this(new SecureRandom());
    }

    BackupKeyWordChallenges(RandomGenerator random) {
        this.random = random;
    }

    public BackupKeyWordPositions issue(UUID adminId, Instant now) {
        open.values().removeIf(challenge -> challenge.expiredAt(now));
        BackupKeyWordPositions positions = draw();
        open.put(adminId, new Challenge(positions, now.plus(VALID_FOR), ATTEMPTS));
        return positions;
    }

    public BackupKeyWordPositions draw() {
        return BackupKeyWordPositions.draw(random);
    }

    public BackupKeyWordPositions asked(UUID adminId, Instant now) {
        Challenge challenge = open.get(adminId);
        if (challenge == null || challenge.expiredAt(now)) {
            open.remove(adminId);
            throw new BackupKeyConfirmationExpired();
        }
        return challenge.positions();
    }

    public void refused(UUID adminId) {
        open.computeIfPresent(adminId, (admin, challenge) -> challenge.attemptsLeft() <= 1 ? null : challenge.afterRefusal());
    }

    public void settled(UUID adminId) {
        open.remove(adminId);
    }

    private record Challenge(BackupKeyWordPositions positions, Instant validUntil, int attemptsLeft) {

        boolean expiredAt(Instant now) {
            return now.isAfter(validUntil);
        }

        Challenge afterRefusal() {
            return new Challenge(positions, validUntil, attemptsLeft - 1);
        }
    }
}
