package cz.novanadeje.app.donations.infrastructure.persistence;

import cz.novanadeje.app.donations.domain.receipt.ContentDigest;
import cz.novanadeje.app.donations.domain.receipt.ReceiptImageRepository;
import cz.novanadeje.app.donations.domain.receipt.StoredReceiptImage;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
class JpaReceiptImageRepository implements ReceiptImageRepository {

    private final ReceiptImageJpaRepository images;

    JpaReceiptImageRepository(ReceiptImageJpaRepository images) {
        this.images = images;
    }

    @Override
    public Optional<StoredReceiptImage> find(ContentDigest digest) {
        return images.findById(digest.value()).map(stored -> new StoredReceiptImage(stored.content(), stored.mediaType()));
    }
}
