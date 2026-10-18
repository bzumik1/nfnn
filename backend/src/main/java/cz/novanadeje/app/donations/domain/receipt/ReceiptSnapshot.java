package cz.novanadeje.app.donations.domain.receipt;

import java.util.Optional;

public record ReceiptSnapshot(ContentDigest template, String data, ContentDigest logo, Optional<ContentDigest> signature, int renderProfile) {

    public ReceiptSnapshot {
        if (template == null || logo == null || signature == null) {
            throw new IllegalArgumentException("A receipt snapshot names its template and logo, and its signature or none");
        }
        if (data == null || data.isBlank()) {
            throw new IllegalArgumentException("A receipt snapshot holds the data filled into its template");
        }
        if (renderProfile < 1) {
            throw new IllegalArgumentException("A render profile is a positive number: " + renderProfile);
        }
    }
}
