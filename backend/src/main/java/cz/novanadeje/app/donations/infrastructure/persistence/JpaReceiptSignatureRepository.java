package cz.novanadeje.app.donations.infrastructure.persistence;

import cz.novanadeje.app.donations.domain.receipt.CurrentSignature;
import cz.novanadeje.app.donations.domain.receipt.ReceiptSignatureRepository;
import cz.novanadeje.app.donations.domain.receipt.SignatureArtwork;
import cz.novanadeje.app.donations.domain.receipt.SignatureImage;
import cz.novanadeje.app.donations.domain.receipt.SignatureVector;
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
            ReceiptImageJpaEntity image = image(stored);
            return new CurrentSignature(artwork(image, stored), stored.uploadedAt());
        });
    }

    @Override
    public Optional<SignatureImage> currentScan() {
        return signatures.findById(ReceiptSignatureJpaEntity.SINGLETON_ID)
                .map(stored -> new StoredSignature(stored, image(stored)))
                .filter(signature -> PNG.equals(signature.image().mediaType()))
                .map(signature -> new SignatureImage(signature.image().content(), signature.stored().width(), signature.stored().height()));
    }

    @Override
    public void replace(SignatureArtwork artwork, Instant uploadedAt) {
        String digest = artwork.digest().value();
        switch (artwork) {
            case SignatureImage image -> images.insertIfAbsent(digest, PNG, image.png(), uploadedAt);
            case SignatureVector vector -> images.insertIfAbsent(digest, CanonicalSignatureVectors.MEDIA_TYPE, vector.canonicalBytes(), uploadedAt);
        }
        signatures.save(ReceiptSignatureJpaEntity.of(digest, artwork.width(), artwork.height(), uploadedAt));
    }

    private ReceiptImageJpaEntity image(ReceiptSignatureJpaEntity stored) {
        return images.findById(stored.imageSha256())
                .orElseThrow(() -> new IllegalStateException("The signature image " + stored.imageSha256() + " is not stored"));
    }

    private static SignatureArtwork artwork(ReceiptImageJpaEntity image, ReceiptSignatureJpaEntity stored) {
        if (CanonicalSignatureVectors.MEDIA_TYPE.equals(image.mediaType())) {
            return CanonicalSignatureVectors.read(stored.imageSha256(), image.content());
        }
        return new SignatureImage(image.content(), stored.width(), stored.height());
    }

    private record StoredSignature(ReceiptSignatureJpaEntity stored, ReceiptImageJpaEntity image) {
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
