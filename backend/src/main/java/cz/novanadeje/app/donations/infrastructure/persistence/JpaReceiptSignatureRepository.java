package cz.novanadeje.app.donations.infrastructure.persistence;

import cz.novanadeje.app.donations.application.receipt.SignatureVectorParser;
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
    private static final String SVG = "image/svg+xml";

    private final ReceiptSignatureJpaRepository signatures;
    private final ReceiptImageJpaRepository images;
    private final SignatureVectorParser vectors;

    JpaReceiptSignatureRepository(ReceiptSignatureJpaRepository signatures, ReceiptImageJpaRepository images, SignatureVectorParser vectors) {
        this.signatures = signatures;
        this.images = images;
        this.vectors = vectors;
    }

    @Override
    public Optional<CurrentSignature> current() {
        return signatures.findById(ReceiptSignatureJpaEntity.SINGLETON_ID).map(stored -> {
            ReceiptImageJpaEntity image = images.findById(stored.imageSha256())
                    .orElseThrow(() -> new IllegalStateException("The signature image " + stored.imageSha256() + " is not stored"));
            return new CurrentSignature(artwork(image, stored), stored.uploadedAt());
        });
    }

    @Override
    public void replace(SignatureArtwork artwork, Instant uploadedAt) {
        String digest = artwork.digest().value();
        switch (artwork) {
            case SignatureImage image -> images.insertIfAbsent(digest, PNG, image.png(), uploadedAt);
            case SignatureVector vector -> images.insertIfAbsent(digest, SVG, vector.canonicalBytes(), uploadedAt);
        }
        signatures.save(ReceiptSignatureJpaEntity.of(digest, artwork.width(), artwork.height(), uploadedAt));
    }

    private SignatureArtwork artwork(ReceiptImageJpaEntity image, ReceiptSignatureJpaEntity stored) {
        if (!SVG.equals(image.mediaType())) {
            return new SignatureImage(image.content(), stored.width(), stored.height());
        }
        SignatureVector vector = vectors.parse(image.content());
        if (!vector.digest().value().equals(stored.imageSha256())) {
            throw new IllegalStateException("The stored signature vector " + stored.imageSha256() + " does not match its digest");
        }
        return vector;
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
