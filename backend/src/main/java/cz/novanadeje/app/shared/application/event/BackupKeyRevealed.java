package cz.novanadeje.app.shared.application.event;

import java.time.Instant;
import java.util.UUID;

public record BackupKeyRevealed(UUID adminId, Instant revealedAt) {

    public BackupKeyRevealed {
        if (adminId == null || revealedAt == null) {
            throw new IllegalArgumentException("A shown backup key names the administrator and the time");
        }
    }
}
