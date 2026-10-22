package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorRepository;
import cz.novanadeje.app.donors.domain.EmailNotVerified;
import cz.novanadeje.app.donors.domain.InvalidCredentials;
import cz.novanadeje.app.donors.domain.PasswordHash;
import cz.novanadeje.app.donors.domain.PasswordHasher;
import cz.novanadeje.app.donors.domain.RawPassword;
import cz.novanadeje.app.shared.domain.EmailAddress;
import cz.novanadeje.app.shared.domain.error.RuleViolation;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class DonorAuthenticationService {

    private static final PasswordHash UNKNOWN_DONOR_HASH = new PasswordHash("$2a$12$nHaJvjs2DmAUxce8R89JQenUJ3uPyNxk7wzoV6M5duitBKTlu9VvG");

    private final DonorRepository donors;
    private final PasswordHasher passwordHasher;
    private final DonorSessionService sessions;

    public DonorAuthenticationService(DonorRepository donors, PasswordHasher passwordHasher, DonorSessionService sessions) {
        this.donors = donors;
        this.passwordHasher = passwordHasher;
        this.sessions = sessions;
    }

    @Transactional
    public AuthenticatedDonor login(String email, String password) {
        if (!EmailAddress.isValid(email)) {
            throw new InvalidCredentials();
        }
        RawPassword rawPassword;
        try {
            rawPassword = new RawPassword(password);
        } catch (RuleViolation weak) {
            throw new InvalidCredentials();
        }
        Donor donor = donors.findByEmail(new EmailAddress(email)).orElse(null);
        PasswordHash hash = donor == null ? UNKNOWN_DONOR_HASH : donor.passwordHash();
        if (!passwordHasher.matches(rawPassword, hash) || donor == null) {
            throw new InvalidCredentials();
        }
        if (!donor.isEmailVerified()) {
            throw new EmailNotVerified();
        }
        return new AuthenticatedDonor(DonorView.of(donor), sessions.open(donor.id(), donor.roles()));
    }

    @Transactional
    public AuthenticatedDonor refresh(String refreshToken) {
        RefreshedSession session = sessions.refresh(refreshToken);
        return new AuthenticatedDonor(DonorView.of(session.donor()), session.tokens());
    }

    @Transactional
    public void logout(String refreshToken) {
        sessions.close(refreshToken);
    }
}
