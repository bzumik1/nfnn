package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.EmailVerificationTokenRepository;
import cz.novanadeje.app.donors.domain.Role;
import cz.novanadeje.app.donors.domain.SecondFactor;
import cz.novanadeje.app.donors.domain.SecondFactorRepository;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.util.Optional;
import java.util.Set;

@Component
public class DonorViews {

    private final SecondFactorRepository secondFactors;
    private final EmailVerificationTokenRepository verificationTokens;
    private final Clock clock;

    public DonorViews(SecondFactorRepository secondFactors, EmailVerificationTokenRepository verificationTokens, Clock clock) {
        this.secondFactors = secondFactors;
        this.verificationTokens = verificationTokens;
        this.clock = clock;
    }

    public DonorView forSession(Donor donor, Set<Role> sessionRoles) {
        boolean enabled = secondFactors.findByDonor(donor.id()).filter(SecondFactor::isEnabled).isPresent();
        return DonorView.of(donor, sessionRoles, new SecondFactorView(enabled, donor.isAdministrator() && !sessionRoles.contains(Role.ADMIN)),
                pendingEmailChange(donor));
    }

    private Optional<PendingEmailChangeView> pendingEmailChange(Donor donor) {
        return verificationTokens.findPendingChangeOf(donor.id(), clock.instant())
                .flatMap(token -> token.newEmail().map(newEmail -> new PendingEmailChangeView(newEmail.value(), token.expiresAt())));
    }

    public AuthenticatedDonor authenticated(Donor donor, IssuedTokens tokens) {
        return new AuthenticatedDonor(forSession(donor, tokens.roles()), tokens);
    }
}
