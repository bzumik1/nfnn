package cz.novanadeje.app.donations.infrastructure.persistence;

import cz.novanadeje.app.donations.domain.receipt.ContentDigest;
import cz.novanadeje.app.donations.infrastructure.pdf.ReceiptImage;
import cz.novanadeje.app.donations.infrastructure.pdf.ReceiptResources;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.Optional;

@Repository
class JpaReceiptResources implements ReceiptResources {

    private final ReceiptTemplateJpaRepository templates;
    private final ReceiptImageJpaRepository images;

    JpaReceiptResources(ReceiptTemplateJpaRepository templates, ReceiptImageJpaRepository images) {
        this.templates = templates;
        this.images = images;
    }

    @Override
    public void storeTemplate(ContentDigest digest, String content, Instant firstUsedAt) {
        templates.insertIfAbsent(digest.value(), content, firstUsedAt);
    }

    @Override
    public Optional<String> template(ContentDigest digest) {
        return templates.findById(digest.value()).map(ReceiptTemplateJpaEntity::content);
    }

    @Override
    public void storeImage(ContentDigest digest, ReceiptImage image, Instant firstUsedAt) {
        images.insertIfAbsent(digest.value(), image.mediaType(), image.bytes(), firstUsedAt);
    }

    @Override
    public Optional<ReceiptImage> image(ContentDigest digest) {
        return images.findById(digest.value()).map(stored -> new ReceiptImage(stored.content(), stored.mediaType()));
    }
}
