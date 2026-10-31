package cz.novanadeje.app.shared.application.event;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

public record AdminActionPerformed(UUID adminId, String action, Optional<UUID> subjectId, String details, Instant performedAt) {

    public static final UUID SERVER = new UUID(0, 0);
    public static final int MAX_ACTION_LENGTH = 64;
    public static final int MAX_DETAILS_LENGTH = 2000;

    public AdminActionPerformed {
        if (adminId == null || subjectId == null || performedAt == null) {
            throw new IllegalArgumentException("An admin action names the admin, its subject (even when absent) and its time");
        }
        action = requireText(action, "action", MAX_ACTION_LENGTH);
        details = requireText(details, "details", MAX_DETAILS_LENGTH);
    }

    private static String requireText(String value, String name, int maxLength) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException("An admin action needs " + name);
        }
        String trimmed = value.trim();
        if (trimmed.length() > maxLength) {
            throw new IllegalArgumentException("The " + name + " of an admin action is at most " + maxLength + " characters");
        }
        return trimmed;
    }
}
