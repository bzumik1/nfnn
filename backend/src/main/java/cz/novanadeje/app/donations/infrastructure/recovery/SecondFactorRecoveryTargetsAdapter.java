package cz.novanadeje.app.donations.infrastructure.recovery;

import cz.novanadeje.app.donations.application.recovery.SecondFactorRecoveryPayments;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.shared.application.recovery.SecondFactorRecoveryTarget;
import cz.novanadeje.app.shared.application.recovery.SecondFactorRecoveryTargets;
import org.springframework.stereotype.Component;

import java.util.Optional;
import java.util.UUID;

@Component
class SecondFactorRecoveryTargetsAdapter implements SecondFactorRecoveryTargets {

    private final SecondFactorRecoveryPayments recoveries;

    SecondFactorRecoveryTargetsAdapter(SecondFactorRecoveryPayments recoveries) {
        this.recoveries = recoveries;
    }

    @Override
    public Optional<SecondFactorRecoveryTarget> targetFor(UUID donorId) {
        return recoveries.targetFor(new DonorReference(donorId));
    }
}
