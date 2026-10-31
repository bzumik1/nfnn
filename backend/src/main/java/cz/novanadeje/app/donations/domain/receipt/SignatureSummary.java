package cz.novanadeje.app.donations.domain.receipt;

import java.time.Instant;

public record SignatureSummary(PersonReference person, SignatureKind kind, int width, int height, Instant uploadedAt) {

    public SignatureSummary {
        if (person == null || kind == null || uploadedAt == null) {
            throw new IllegalArgumentException("A signature summary names its person, kind and upload time");
        }
    }
}
