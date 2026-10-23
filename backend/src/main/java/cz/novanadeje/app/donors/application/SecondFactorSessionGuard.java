package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.PasskeyRepository;
import cz.novanadeje.app.donors.domain.SecondFactor;
import cz.novanadeje.app.donors.domain.SecondFactorRepository;
import cz.novanadeje.app.donors.domain.SecondFactorSessionRequired;
import org.springframework.stereotype.Component;

@Component
public class SecondFactorSessionGuard {

    private final SecondFactorRepository secondFactors;
    private final PasskeyRepository passkeys;

    public SecondFactorSessionGuard(SecondFactorRepository secondFactors, PasskeyRepository passkeys) {
        this.secondFactors = secondFactors;
        this.passkeys = passkeys;
    }

    public void requireForFactorChange(Donor donor, boolean secondFactorVerified) {
        if (secondFactorVerified || !donor.isAdministrator()) {
            return;
        }
        if (holdsSecondFactor(donor)) {
            throw new SecondFactorSessionRequired(donor.id());
        }
    }

    private boolean holdsSecondFactor(Donor donor) {
        return secondFactors.findByDonor(donor.id()).filter(SecondFactor::isEnabled).isPresent() || passkeys.countByDonor(donor.id()) > 0;
    }
}
