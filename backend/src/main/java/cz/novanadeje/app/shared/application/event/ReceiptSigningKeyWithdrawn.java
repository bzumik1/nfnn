package cz.novanadeje.app.shared.application.event;

import java.time.Instant;
import java.util.UUID;
import java.util.regex.Pattern;

public record ReceiptSigningKeyWithdrawn(UUID adminId, String keyId, boolean current, Instant withdrawnAt) {

    private static final Pattern KEY_ID = Pattern.compile("[0-9a-f]{8}");

    public ReceiptSigningKeyWithdrawn {
        if (adminId == null || keyId == null || !KEY_ID.matcher(keyId).matches() || withdrawnAt == null) {
            throw new IllegalArgumentException("A withdrawn receipt signing key names the administrator, the key id of 8 hex digits and the time");
        }
    }
}
