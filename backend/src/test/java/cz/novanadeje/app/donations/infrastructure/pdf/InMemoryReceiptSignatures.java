package cz.novanadeje.app.donations.infrastructure.pdf;

import cz.novanadeje.app.donations.domain.receipt.CurrentSignature;
import cz.novanadeje.app.donations.domain.receipt.ReceiptSignatureRepository;
import cz.novanadeje.app.donations.domain.receipt.SignatureImage;

import java.time.Instant;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicReference;

class InMemoryReceiptSignatures implements ReceiptSignatureRepository {

    private static final Instant UPLOADED_AT = Instant.parse("2026-01-01T00:00:00Z");

    private final AtomicReference<CurrentSignature> current = new AtomicReference<>();

    static InMemoryReceiptSignatures holding(Optional<SignatureImage> signature) {
        InMemoryReceiptSignatures signatures = new InMemoryReceiptSignatures();
        signature.ifPresent(image -> signatures.replace(image, UPLOADED_AT));
        return signatures;
    }

    @Override
    public Optional<CurrentSignature> current() {
        return Optional.ofNullable(current.get());
    }

    @Override
    public void replace(SignatureImage image, Instant uploadedAt) {
        current.set(new CurrentSignature(image, uploadedAt));
    }

    @Override
    public boolean remove() {
        return current.getAndSet(null) != null;
    }
}
