package cz.novanadeje.app.donations.domain.signing;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface ReceiptSigningKeyRepository {

    List<ReceiptSigningKey> findAll();

    Optional<ReceiptSigningKey> lockForWithdrawal(ReceiptSigningKeyId id);

    Optional<ReceiptSigningKey> lockForIssuing(ReceiptSigningKeyId id);

    void save(ReceiptSigningKey key);

    boolean recordRestoreAdoption(String restoreId, Instant adoptedAt);
}
