package cz.novanadeje.app.donations.domain.receipt;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface ReceiptSignatureRepository {

    Optional<CurrentSignature> currentOf(PersonReference person);

    Optional<ContentDigest> digestOf(PersonReference person);

    List<SignatureSummary> summaries();

    void replace(PersonReference person, SignatureArtwork artwork, Instant uploadedAt);

    boolean remove(PersonReference person);
}
