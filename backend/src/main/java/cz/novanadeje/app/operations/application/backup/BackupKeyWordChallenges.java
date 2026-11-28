package cz.novanadeje.app.operations.application.backup;

import cz.novanadeje.app.operations.domain.backup.BackupKeyConfirmationExpired;
import cz.novanadeje.app.operations.domain.backup.BackupKeyWordChallenge;
import cz.novanadeje.app.operations.domain.backup.BackupKeyWordPositions;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.security.SecureRandom;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.random.RandomGenerator;

@Component
public class BackupKeyWordChallenges {

    private final RandomGenerator random;
    private final Map<UUID, BackupKeyWordChallenge> open = new ConcurrentHashMap<>();

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
        open.put(adminId, BackupKeyWordChallenge.issue(positions, now));
        return positions;
    }

    public BackupKeyWordPositions draw() {
        return BackupKeyWordPositions.draw(random);
    }

    public BackupKeyWordPositions asked(UUID adminId, Instant now) {
        BackupKeyWordChallenge challenge = open.get(adminId);
        if (challenge == null || challenge.expiredAt(now)) {
            open.remove(adminId);
            throw new BackupKeyConfirmationExpired();
        }
        return challenge.positions();
    }

    public void refused(UUID adminId) {
        open.computeIfPresent(adminId, (admin, challenge) -> challenge.afterRefusal().orElse(null));
    }

    public void settled(UUID adminId) {
        open.remove(adminId);
    }
}
