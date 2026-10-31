package cz.novanadeje.app.donations.domain.receipt;

import java.util.Optional;

public interface ReceiptSignatoryRepository {

    Optional<ReceiptSignatory> current();

    void choose(ReceiptSignatory signatory);
}
