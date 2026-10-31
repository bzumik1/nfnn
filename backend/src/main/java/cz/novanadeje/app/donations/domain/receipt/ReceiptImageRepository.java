package cz.novanadeje.app.donations.domain.receipt;

import java.time.Instant;
import java.util.Optional;

public interface ReceiptImageRepository {

    Optional<StoredReceiptImage> find(ContentDigest digest);

    void storeIfAbsent(StoredReceiptImage image, Instant firstUsedAt);
}
