package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.PasskeyRepository;
import cz.novanadeje.app.donors.domain.SecondFactor;
import cz.novanadeje.app.donors.domain.SecondFactorRepository;
import org.springframework.stereotype.Component;

@Component
public class SecondFactorHoldings {

    private final SecondFactorRepository secondFactors;
    private final PasskeyRepository passkeys;

    public SecondFactorHoldings(SecondFactorRepository secondFactors, PasskeyRepository passkeys) {
        this.secondFactors = secondFactors;
        this.passkeys = passkeys;
    }

    public boolean holdsAny(DonorId donorId) {
        return secondFactors.findByDonor(donorId).filter(SecondFactor::isEnabled).isPresent() || passkeys.countByDonor(donorId) > 0;
    }
}
