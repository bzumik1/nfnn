package cz.novanadeje.app.donations.infrastructure.pdf;

import cz.novanadeje.app.donations.domain.receipt.ContentDigest;
import cz.novanadeje.app.donations.domain.receipt.CurrentSignature;
import cz.novanadeje.app.donations.domain.receipt.PersonReference;
import cz.novanadeje.app.donations.domain.receipt.ReceiptSignatureRepository;
import cz.novanadeje.app.donations.domain.receipt.SignatureArtwork;
import cz.novanadeje.app.donations.domain.receipt.SignatureImage;
import cz.novanadeje.app.donations.domain.receipt.SignatureSummary;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;

class InMemoryReceiptSignatures implements ReceiptSignatureRepository {

    static final PersonReference SIGNATORY = new PersonReference(UUID.fromString("019a3a00-0000-7000-8000-00000000b001"));
    private static final Instant UPLOADED_AT = Instant.parse("2026-01-01T00:00:00Z");

    private final AtomicReference<CurrentSignature> current = new AtomicReference<>();

    static InMemoryReceiptSignatures holding(Optional<? extends SignatureArtwork> signature) {
        InMemoryReceiptSignatures signatures = new InMemoryReceiptSignatures();
        signature.ifPresent(artwork -> signatures.replace(SIGNATORY, artwork, UPLOADED_AT));
        return signatures;
    }

    @Override
    public Optional<CurrentSignature> currentOf(PersonReference person) {
        return SIGNATORY.equals(person) ? Optional.ofNullable(current.get()) : Optional.empty();
    }

    @Override
    public Optional<ContentDigest> digestOf(PersonReference person) {
        return currentOf(person).map(signature -> signature.artwork().digest());
    }

    @Override
    public List<SignatureSummary> summaries() {
        return List.of();
    }

    @Override
    public Optional<SignatureImage> currentScan() {
        return currentOf(SIGNATORY).map(CurrentSignature::artwork).filter(SignatureImage.class::isInstance).map(SignatureImage.class::cast);
    }

    @Override
    public void replace(PersonReference person, SignatureArtwork artwork, Instant uploadedAt) {
        current.set(new CurrentSignature(artwork, uploadedAt));
    }

    @Override
    public boolean remove(PersonReference person) {
        return current.getAndSet(null) != null;
    }
}
