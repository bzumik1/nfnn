package cz.novanadeje.app.shared.application.secondfactor;

import java.util.UUID;

public interface FreshSecondFactor {

    void require(UUID accountId, FreshSecondFactorProof proof);
}
