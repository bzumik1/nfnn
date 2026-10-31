package cz.novanadeje.app.donations.application.signing;

import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKeyId;

public interface PublicTestKeyPolicy {

    boolean refuses(ReceiptSigningKeyId id);
}
