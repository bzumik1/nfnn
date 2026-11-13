package cz.novanadeje.app.content.application.event;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

public record ReceiptSignatureChanged(UUID adminId, Optional<String> client, UUID personId, String personName, boolean removed, Instant changedAt) {

    public ReceiptSignatureChanged {
        if (adminId == null || client == null || personId == null || personName == null || personName.isBlank() || changedAt == null) {
            throw new IllegalArgumentException("A changed receipt signature names the admin, the client (even when absent), the person and the time");
        }
    }

    @Override
    public String toString() {
        return "ReceiptSignatureChanged[admin " + adminId + ", person " + personId + (removed ? ", removed" : ", set") + "]";
    }
}
