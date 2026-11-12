package cz.novanadeje.app.content.application.sync;

import java.util.Optional;
import java.util.UUID;

public record AdminContentSyncSnapshot(UUID subject, Optional<AdminContent> content) {

    public AdminContentSyncSnapshot {
        if (subject == null || content == null) {
            throw new IllegalArgumentException("A content sync snapshot names its subject and whether it holds the content");
        }
    }

    public boolean administrator() {
        return content.isPresent();
    }
}
