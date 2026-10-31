package cz.novanadeje.app.donations.application.signing;

import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKeyId;

import java.util.Set;

public interface WithdrawnSeeds {

    Set<ReceiptSigningKeyId> keyIds();
}
