package cz.novanadeje.app.donations.domain.report;

import cz.novanadeje.app.donations.domain.importing.ImportFailureKind;

import java.time.Instant;

public record ImportFailure(ImportFailureKind kind, Instant attemptedAt) {

    public ImportFailure {
        if (kind == null || attemptedAt == null) {
            throw new IllegalArgumentException("An import failure has its kind and the time of the attempt");
        }
    }
}
