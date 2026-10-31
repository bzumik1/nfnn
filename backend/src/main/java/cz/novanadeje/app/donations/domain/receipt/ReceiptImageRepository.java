package cz.novanadeje.app.donations.domain.receipt;

import java.util.Optional;

public interface ReceiptImageRepository {

    Optional<StoredReceiptImage> find(ContentDigest digest);
}
