package cz.novanadeje.app.donations.infrastructure.persistence;

import cz.novanadeje.app.donations.domain.receipt.ContentDigest;
import cz.novanadeje.app.donations.domain.receipt.CurrentSignature;
import cz.novanadeje.app.donations.domain.receipt.PersonReference;
import cz.novanadeje.app.donations.domain.receipt.ReceiptSignatureRepository;
import cz.novanadeje.app.donations.domain.receipt.SignatureArtwork;
import cz.novanadeje.app.donations.domain.receipt.SignatureImage;
import cz.novanadeje.app.donations.domain.receipt.SignatureKind;
import cz.novanadeje.app.donations.domain.receipt.SignatureSummary;
import cz.novanadeje.app.donations.domain.receipt.SignatureVector;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
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
    public Optional<CurrentSignature> currentOf(PersonReference person) {
        return signatures.findById(person.value()).map(stored -> new CurrentSignature(artwork(image(stored), stored), stored.uploadedAt()));
    }

    @Override
    public Optional<ContentDigest> digestOf(PersonReference person) {
        return signatures.findById(person.value()).map(stored -> new ContentDigest(stored.imageSha256()));
    }

    @Override
    public List<SignatureSummary> summaries() {
        return signatures.summaries().stream()
                .map(row -> new SignatureSummary(new PersonReference(row.getPersonId()), kindOf(row.getMediaType()), row.getWidth(), row.getHeight(),
                        row.getUploadedAt()))
                .toList();
    }

    @Override
    public void replace(PersonReference person, SignatureArtwork artwork, Instant uploadedAt) {
        String digest = artwork.digest().value();
        switch (artwork) {
            case SignatureImage image -> images.insertIfAbsent(digest, PNG, image.png(), uploadedAt);
            case SignatureVector vector -> images.insertIfAbsent(digest, CanonicalSignatureVectors.MEDIA_TYPE, vector.canonicalBytes(), uploadedAt);
        }
        signatures.save(ReceiptSignatureJpaEntity.of(person.value(), digest, artwork.width(), artwork.height(), uploadedAt));
    }

    @Override
    public boolean remove(PersonReference person) {
        if (!signatures.existsById(person.value())) {
            return false;
        }
        signatures.deleteById(person.value());
        return true;
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

    private static SignatureKind kindOf(String mediaType) {
        return CanonicalSignatureVectors.MEDIA_TYPE.equals(mediaType) ? SignatureKind.VECTOR : SignatureKind.RASTER;
    }
}
