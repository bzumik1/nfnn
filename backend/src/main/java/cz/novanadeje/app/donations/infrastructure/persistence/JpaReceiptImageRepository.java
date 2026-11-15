package cz.novanadeje.app.donations.infrastructure.persistence;

import cz.novanadeje.app.donations.domain.receipt.ContentDigest;
import cz.novanadeje.app.donations.domain.receipt.ReceiptImageMediaType;
import cz.novanadeje.app.donations.domain.receipt.ReceiptImageRepository;
import cz.novanadeje.app.donations.domain.receipt.StoredReceiptImage;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.Optional;

@Repository
class JpaReceiptImageRepository implements ReceiptImageRepository {

    private final ReceiptImageJpaRepository images;

    JpaReceiptImageRepository(ReceiptImageJpaRepository images) {
        this.images = images;
    }

    @Override
    public Optional<StoredReceiptImage> find(ContentDigest digest) {
        return images.findById(digest.value()).map(stored -> new StoredReceiptImage(stored.content(), mediaTypeOf(stored, digest)));
    }

    @Override
    public void storeIfAbsent(StoredReceiptImage image, Instant firstUsedAt) {
        images.insertIfAbsent(image.digest().value(), image.mediaType().value(), image.content(), firstUsedAt);
    }

    private static ReceiptImageMediaType mediaTypeOf(ReceiptImageJpaEntity stored, ContentDigest digest) {
        return ReceiptImageMediaType.fromValue(stored.mediaType())
                .orElseThrow(() -> new IllegalStateException("The stored receipt image " + digest.value() + " has a media type outside the closed set"));
    }
}
