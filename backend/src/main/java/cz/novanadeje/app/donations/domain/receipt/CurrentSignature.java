package cz.novanadeje.app.donations.domain.receipt;

import java.time.Instant;

public record CurrentSignature(SignatureImage image, Instant uploadedAt) {

    public CurrentSignature {
        if (image == null || uploadedAt == null) {
            throw new IllegalArgumentException("The current signature has an image and the time of its upload");
        }
    }
}
