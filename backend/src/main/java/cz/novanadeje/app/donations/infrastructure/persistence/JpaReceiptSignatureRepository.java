package cz.novanadeje.app.donations.infrastructure.persistence;

import cz.novanadeje.app.donations.domain.receipt.CurrentSignature;
import cz.novanadeje.app.donations.domain.receipt.ReceiptSignatureRepository;
import cz.novanadeje.app.donations.domain.receipt.SignatureImage;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.Optional;

@Repository
class JpaReceiptSignatureRepository implements ReceiptSignatureRepository {

    private static final String PNG = "image/png";

    private final ReceiptSignatureJpaRepository signatures;
    private final ReceiptImageJpaRepository images;

    JpaReceiptSignatureRepository(ReceiptSignatureJpaRepository signatures, ReceiptImageJpaRepository images) {
        this.signatures = signatures;
        this.images = images;
    }

    @Override
    public Optional<CurrentSignature> current() {
        return signatures.findById(ReceiptSignatureJpaEntity.SINGLETON_ID).map(stored -> {
            ReceiptImageJpaEntity image = images.findById(stored.imageSha256())
                    .orElseThrow(() -> new IllegalStateException("The signature image " + stored.imageSha256() + " is not stored"));
            return new CurrentSignature(new SignatureImage(image.content(), stored.width(), stored.height()), stored.uploadedAt());
        });
    }

    @Override
    public void replace(SignatureImage image, Instant uploadedAt) {
        String digest = image.digest().value();
        images.insertIfAbsent(digest, PNG, image.png(), uploadedAt);
        signatures.save(ReceiptSignatureJpaEntity.of(digest, image.width(), image.height(), uploadedAt));
    }

    @Override
    public boolean remove() {
        if (!signatures.existsById(ReceiptSignatureJpaEntity.SINGLETON_ID)) {
            return false;
        }
        signatures.deleteById(ReceiptSignatureJpaEntity.SINGLETON_ID);
        return true;
    }
}
