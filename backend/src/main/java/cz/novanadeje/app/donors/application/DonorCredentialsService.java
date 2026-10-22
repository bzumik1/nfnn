package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.application.event.DonorEmailAddressInUse;
import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.DonorNotFound;
import cz.novanadeje.app.donors.domain.DonorRepository;
import cz.novanadeje.app.donors.domain.EmailUnchanged;
import cz.novanadeje.app.donors.domain.PasswordHasher;
import cz.novanadeje.app.donors.domain.RawPassword;
import cz.novanadeje.app.donors.domain.RefreshTokenRepository;
import cz.novanadeje.app.donors.domain.WrongPassword;
import cz.novanadeje.app.shared.domain.EmailAddress;
import cz.novanadeje.app.shared.domain.error.RuleViolation;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;

@Service
public class DonorCredentialsService {

    private static final Logger log = LoggerFactory.getLogger(DonorCredentialsService.class);

    private final DonorRepository donors;
    private final PasswordHasher passwordHasher;
    private final RefreshTokenRepository refreshTokens;
    private final DonorSessionService sessions;
    private final DonorEmailVerificationService emailVerification;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    public DonorCredentialsService(DonorRepository donors, PasswordHasher passwordHasher, RefreshTokenRepository refreshTokens,
                                   DonorSessionService sessions, DonorEmailVerificationService emailVerification,
                                   ApplicationEventPublisher events, Clock clock) {
        this.donors = donors;
        this.passwordHasher = passwordHasher;
        this.refreshTokens = refreshTokens;
        this.sessions = sessions;
        this.emailVerification = emailVerification;
        this.events = events;
        this.clock = clock;
    }

    @Transactional
    public AuthenticatedDonor changePassword(DonorId donorId, String currentPassword, String newPassword) {
        Donor donor = load(donorId);
        requireMatching(donor, currentPassword);
        RawPassword rawPassword = new RawPassword(newPassword);
        Instant now = clock.instant();
        donor.changePassword(passwordHasher.hash(rawPassword));
        donors.save(donor);
        refreshTokens.revokeAllOf(donor.id(), now);
        log.info("Password of donor {} changed, every session revoked", donor.id());
        return new AuthenticatedDonor(DonorView.of(donor), sessions.open(donor.id(), donor.roles()));
    }

    @Transactional
    public void requestEmailChange(DonorId donorId, String password, EmailAddress newEmail) {
        Donor donor = load(donorId);
        requireMatching(donor, password);
        if (newEmail.equals(donor.email())) {
            throw new EmailUnchanged();
        }
        Donor owner = donors.findByEmail(newEmail).orElse(null);
        if (owner != null) {
            events.publishEvent(new DonorEmailAddressInUse(owner.id().value(), newEmail, owner.preferredLocale()));
            log.info("E-mail change for donor {} not started: the new address belongs to donor {}", donor.id(), owner.id());
            return;
        }
        emailVerification.issueChangeLink(donor, newEmail);
    }

    private void requireMatching(Donor donor, String password) {
        RawPassword rawPassword;
        try {
            rawPassword = new RawPassword(password);
        } catch (RuleViolation weak) {
            throw new WrongPassword();
        }
        if (!passwordHasher.matches(rawPassword, donor.passwordHash())) {
            throw new WrongPassword();
        }
    }

    private Donor load(DonorId donorId) {
        return donors.findById(donorId).orElseThrow(() -> new DonorNotFound(donorId));
    }
}
