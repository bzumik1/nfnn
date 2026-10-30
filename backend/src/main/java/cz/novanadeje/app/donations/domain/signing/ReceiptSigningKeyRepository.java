package cz.novanadeje.app.donations.domain.signing;

import java.util.List;

public interface ReceiptSigningKeyRepository {

    List<ReceiptSigningKey> findAll();

    void save(ReceiptSigningKey key);
}
