package cz.novanadeje.app.donations.infrastructure.pdf;

import cz.novanadeje.app.donations.domain.receipt.CurrentSignature;
import cz.novanadeje.app.donations.domain.receipt.ReceiptSignatureRepository;
import cz.novanadeje.app.donations.domain.receipt.SignatureArtwork;
import cz.novanadeje.app.donations.domain.receipt.SignatureImage;

import java.time.Instant;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicReference;

class InMemoryReceiptSignatures implements ReceiptSignatureRepository {

    private static final Instant UPLOADED_AT = Instant.parse("2026-01-01T00:00:00Z");

    private final AtomicReference<CurrentSignature> current = new AtomicReference<>();

    static InMemoryReceiptSignatures holding(Optional<? extends SignatureArtwork> signature) {
        InMemoryReceiptSignatures signatures = new InMemoryReceiptSignatures();
        signature.ifPresent(artwork -> signatures.replace(artwork, UPLOADED_AT));
        return signatures;
    }

    @Override
    public Optional<CurrentSignature> current() {
        return Optional.ofNullable(current.get());
    }

    @Override
    public Optional<SignatureImage> currentScan() {
        return current().map(CurrentSignature::artwork).filter(SignatureImage.class::isInstance).map(SignatureImage.class::cast);
    }

    @Override
    public void replace(SignatureArtwork artwork, Instant uploadedAt) {
        current.set(new CurrentSignature(artwork, uploadedAt));
    }

    @Override
    public boolean remove() {
        return current.getAndSet(null) != null;
    }
}
