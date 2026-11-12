package cz.novanadeje.app.operations.application.sync;

import java.util.Optional;
import java.util.UUID;

public record AdminOperationsSyncSnapshot(UUID subject, Optional<AdminOperations> operations) {

    public AdminOperationsSyncSnapshot {
        if (subject == null || operations == null) {
            throw new IllegalArgumentException("An operations sync snapshot names its subject and whether it holds the operations");
        }
    }

    public boolean administrator() {
        return operations.isPresent();
    }
}
