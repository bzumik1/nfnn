package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.Role;
import cz.novanadeje.app.donors.domain.SecondFactor;
import cz.novanadeje.app.donors.domain.SecondFactorRepository;
import org.springframework.stereotype.Component;

import java.util.Set;

@Component
public class DonorViews {

    private final SecondFactorRepository secondFactors;

    public DonorViews(SecondFactorRepository secondFactors) {
        this.secondFactors = secondFactors;
    }

    public DonorView forSession(Donor donor, Set<Role> sessionRoles) {
        boolean enabled = secondFactors.findByDonor(donor.id()).filter(SecondFactor::isEnabled).isPresent();
        return DonorView.of(donor, sessionRoles, new SecondFactorView(enabled, donor.isAdministrator() && !sessionRoles.contains(Role.ADMIN)));
    }

    public AuthenticatedDonor authenticated(Donor donor, IssuedTokens tokens) {
        return new AuthenticatedDonor(forSession(donor, tokens.roles()), tokens);
    }
}
