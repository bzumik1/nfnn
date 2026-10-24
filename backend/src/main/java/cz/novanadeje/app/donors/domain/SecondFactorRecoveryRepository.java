package cz.novanadeje.app.donors.domain;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

public interface SecondFactorRecoveryRepository {

    void replaceOpenOf(DonorId donorId, SecondFactorRecovery recovery);

    Optional<SecondFactorRecovery> findByCodeHash(String codeHash);

    boolean markUsed(UUID recoveryId, Instant at);
}
