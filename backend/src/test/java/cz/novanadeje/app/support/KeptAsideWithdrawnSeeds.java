package cz.novanadeje.app.support;

import cz.novanadeje.app.donations.application.signing.WithdrawnSeeds;
import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKeyId;

import java.util.Set;
import java.util.concurrent.CopyOnWriteArraySet;

public class KeptAsideWithdrawnSeeds implements WithdrawnSeeds {

    private final Set<ReceiptSigningKeyId> keyIds = new CopyOnWriteArraySet<>();

    @Override
    public Set<ReceiptSigningKeyId> keyIds() {
        return Set.copyOf(keyIds);
    }

    public void keepAside(ReceiptSigningKeyId keyId) {
        keyIds.add(keyId);
    }

    public void reset() {
        keyIds.clear();
    }
}
