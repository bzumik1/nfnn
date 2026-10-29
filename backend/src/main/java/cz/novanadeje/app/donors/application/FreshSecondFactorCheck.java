package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.DonorNotFound;
import cz.novanadeje.app.donors.domain.DonorRepository;
import cz.novanadeje.app.donors.domain.FreshSecondFactorRequired;
import cz.novanadeje.app.donors.domain.SecondFactor;
import cz.novanadeje.app.donors.domain.SecondFactorCodeRejected;
import cz.novanadeje.app.donors.domain.SecondFactorRepository;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.util.Optional;

@Component
public class FreshSecondFactorCheck {

    private final DonorRepository donors;
    private final SecondFactorRepository secondFactors;
    private final DonorConfirmations confirmations;
    private final Clock clock;

    public FreshSecondFactorCheck(DonorRepository donors, SecondFactorRepository secondFactors, DonorConfirmations confirmations, Clock clock) {
        this.donors = donors;
        this.secondFactors = secondFactors;
        this.confirmations = confirmations;
        this.clock = clock;
    }

    @Transactional
    public void require(DonorId donorId, SecondFactorProof proof) {
        Optional<PasskeyProof> passkey = proof.givenPasskey();
        if (passkey.isPresent()) {
            Donor donor = donors.findById(donorId).orElseThrow(() -> new DonorNotFound(donorId));
            confirmations.confirm(donor, Confirmation.withPasskey(passkey.get()));
            return;
        }
        String code = proof.givenCode().orElseThrow(FreshSecondFactorRequired::new);
        SecondFactor factor = secondFactors.findByDonor(donorId).filter(SecondFactor::isEnabled).orElseThrow(SecondFactorCodeRejected::new);
        factor.check(code, clock.instant());
        if (!secondFactors.recordUse(factor)) {
            throw new SecondFactorCodeRejected();
        }
    }
}
