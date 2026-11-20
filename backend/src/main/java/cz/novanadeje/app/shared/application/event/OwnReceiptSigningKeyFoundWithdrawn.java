package cz.novanadeje.app.shared.application.event;

import java.util.regex.Pattern;

public record OwnReceiptSigningKeyFoundWithdrawn(String keyId) {

    private static final Pattern KEY_ID = Pattern.compile("[0-9a-f]{8}");

    public OwnReceiptSigningKeyFoundWithdrawn {
        if (keyId == null || !KEY_ID.matcher(keyId).matches()) {
            throw new IllegalArgumentException("The server's withdrawn receipt signing key is named by its key id of 8 hex digits");
        }
    }
}
