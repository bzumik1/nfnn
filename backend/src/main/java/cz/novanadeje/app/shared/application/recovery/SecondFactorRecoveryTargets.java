package cz.novanadeje.app.shared.application.recovery;

import cz.novanadeje.app.shared.domain.SecondFactorRecoveryCode;

import java.util.Optional;
import java.util.UUID;

public interface SecondFactorRecoveryTargets {

    Optional<SecondFactorRecoveryTarget> targetFor(UUID donorId);

    SecondFactorRecoveryPaymentQr paymentQrFor(SecondFactorRecoveryCode code);
}
