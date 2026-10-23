package cz.novanadeje.app.content.domain.project;

import cz.novanadeje.app.shared.domain.UuidV7;

import java.time.Instant;
import java.util.UUID;

public record ProjectId(UUID value) {

    public ProjectId {
        if (value == null) {
            throw new IllegalArgumentException("Project id is required");
        }
    }

    public static ProjectId newId(Instant at) {
        return new ProjectId(UuidV7.generate(at));
    }

    public static ProjectId of(String value) {
        return new ProjectId(UUID.fromString(value));
    }

    @Override
    public String toString() {
        return value.toString();
    }
}
