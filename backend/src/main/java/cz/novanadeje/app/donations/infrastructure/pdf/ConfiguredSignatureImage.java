package cz.novanadeje.app.donations.infrastructure.pdf;

import java.util.Optional;

public record ConfiguredSignatureImage(Optional<ReceiptImage> image) {

    public ConfiguredSignatureImage {
        if (image == null) {
            throw new IllegalArgumentException("The configured signature image is present or empty, never null");
        }
    }
}
