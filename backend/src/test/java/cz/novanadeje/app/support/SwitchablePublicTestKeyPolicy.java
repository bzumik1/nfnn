package cz.novanadeje.app.support;

import cz.novanadeje.app.donations.application.signing.PublicTestKeyPolicy;
import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKeyId;

public class SwitchablePublicTestKeyPolicy implements PublicTestKeyPolicy {

    private volatile boolean outsideDevelopment;

    @Override
    public boolean refuses(ReceiptSigningKeyId id) {
        return outsideDevelopment && id.isPublicTestKey();
    }

    public void outsideDevelopment() {
        outsideDevelopment = true;
    }

    public void reset() {
        outsideDevelopment = false;
    }
}
