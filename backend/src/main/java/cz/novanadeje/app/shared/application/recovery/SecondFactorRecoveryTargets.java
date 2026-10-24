package cz.novanadeje.app.shared.application.recovery;

import java.util.Optional;
import java.util.UUID;

public interface SecondFactorRecoveryTargets {

    Optional<SecondFactorRecoveryTarget> targetFor(UUID donorId);
}
