package cz.novanadeje.app.shared.application.event;

import java.util.regex.Pattern;

public record ReceiptSigningKeyWithdrawalAnnounced(String keyId, boolean current) {

    private static final Pattern KEY_ID = Pattern.compile("[0-9a-f]{8}");

    public ReceiptSigningKeyWithdrawalAnnounced {
        if (keyId == null || !KEY_ID.matcher(keyId).matches()) {
            throw new IllegalArgumentException("An announced withdrawal names the key id of 8 hex digits");
        }
    }
}
