package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.PasskeyRepository;
import cz.novanadeje.app.donors.domain.SecondFactorRepository;
import cz.novanadeje.app.donors.domain.SecondFactorSessionRequired;
import org.springframework.stereotype.Component;

@Component
public class SecondFactorSessionGuard {

    private final SecondFactorHoldings holdings;

    public SecondFactorSessionGuard(SecondFactorRepository secondFactors, PasskeyRepository passkeys) {
        this.holdings = new SecondFactorHoldings(secondFactors, passkeys);
    }

    public void requireForFactorChange(Donor donor, boolean secondFactorVerified) {
        if (secondFactorVerified || !donor.isAdministrator()) {
            return;
        }
        if (holdings.holdsAny(donor.id())) {
            throw new SecondFactorSessionRequired(donor.id());
        }
    }
}
