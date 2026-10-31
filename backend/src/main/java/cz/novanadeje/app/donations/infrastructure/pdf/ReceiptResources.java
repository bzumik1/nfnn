package cz.novanadeje.app.donations.infrastructure.pdf;

import cz.novanadeje.app.donations.domain.receipt.ContentDigest;

import java.time.Instant;
import java.util.Optional;

public interface ReceiptResources {

    void storeTemplate(ContentDigest digest, String content, Instant firstUsedAt);

    Optional<String> template(ContentDigest digest);

    void storeImage(ContentDigest digest, ReceiptImage image, Instant firstUsedAt);

    Optional<ReceiptImage> image(ContentDigest digest);

    Optional<String> imageMediaType(ContentDigest digest);
}
