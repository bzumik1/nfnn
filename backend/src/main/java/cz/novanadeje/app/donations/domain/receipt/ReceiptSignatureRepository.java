package cz.novanadeje.app.donations.domain.receipt;

import java.time.Instant;
import java.util.Optional;

public interface ReceiptSignatureRepository {

    Optional<CurrentSignature> current();

    void replace(SignatureImage image, Instant uploadedAt);

    boolean remove();
}
