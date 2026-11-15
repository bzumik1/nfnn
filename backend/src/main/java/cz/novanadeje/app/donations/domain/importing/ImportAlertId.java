package cz.novanadeje.app.donations.domain.importing;

import cz.novanadeje.app.shared.domain.UuidV7;

import java.time.Instant;
import java.util.UUID;

public record ImportAlertId(UUID value) {

    public ImportAlertId {
        if (value == null) {
            throw new IllegalArgumentException("Import alert id is required");
        }
    }

    public static ImportAlertId newId(Instant at) {
        return new ImportAlertId(UuidV7.generate(at));
    }

    @Override
    public String toString() {
        return value.toString();
    }
}
