package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.application.event.DonorPasswordChanged;
import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.DonorNotFound;
import cz.novanadeje.app.donors.domain.DonorRepository;
import cz.novanadeje.app.donors.domain.EmailUnchanged;
import cz.novanadeje.app.donors.domain.LastSignInMethod;
import cz.novanadeje.app.donors.domain.PasskeyConfirmationRejected;
import cz.novanadeje.app.donors.domain.PasskeyRepository;
import cz.novanadeje.app.donors.domain.PasswordHasher;
import cz.novanadeje.app.donors.domain.RawPassword;
import cz.novanadeje.app.donors.domain.RefreshTokenRepository;
import cz.novanadeje.app.shared.domain.EmailAddress;
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
    private final DonorConfirmations confirmations;
    private final PasskeyRepository passkeys;
    private final RefreshTokenRepository refreshTokens;
    private final DonorSessionService sessions;
    private final DonorEmailVerificationService emailVerification;
    private final DonorViews views;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    public DonorCredentialsService(DonorRepository donors, PasswordHasher passwordHasher, DonorConfirmations confirmations, PasskeyRepository passkeys,
                                   RefreshTokenRepository refreshTokens,
                                   DonorSessionService sessions, DonorViews views, DonorEmailVerificationService emailVerification,
                                   ApplicationEventPublisher events, Clock clock) {
        this.donors = donors;
        this.passwordHasher = passwordHasher;
        this.confirmations = confirmations;
        this.passkeys = passkeys;
        this.refreshTokens = refreshTokens;
        this.sessions = sessions;
        this.views = views;
        this.emailVerification = emailVerification;
        this.events = events;
        this.clock = clock;
    }

    @Transactional(noRollbackFor = PasskeyConfirmationRejected.class)
    public AuthenticatedDonor changePassword(DonorId donorId, boolean secondFactorVerified, Confirmation confirmation, String newPassword) {
        Donor donor = load(donorId);
        confirmations.confirm(donor, confirmation);
        RawPassword rawPassword = new RawPassword(newPassword);
        Instant now = clock.instant();
        donor.changePassword(passwordHasher.hash(rawPassword));
        donors.save(donor);
        refreshTokens.revokeAllOf(donor.id(), now);
        events.publishEvent(new DonorPasswordChanged(donor.id().value(), donor.email(), donor.preferredLocale()));
        log.info("Password of donor {} changed, every session revoked", donor.id());
        return views.authenticated(donor, sessions.open(donor, secondFactorVerified));
    }

    @Transactional(noRollbackFor = PasskeyConfirmationRejected.class)
    public AuthenticatedDonor removePassword(DonorId donorId, boolean secondFactorVerified, Confirmation confirmation) {
        Donor donor = load(donorId);
        confirmations.confirm(donor, confirmation);
        if (passkeys.countByDonor(donorId) == 0) {
            throw new LastSignInMethod(donorId);
        }
        Instant now = clock.instant();
        donor.removePassword();
        donors.save(donor);
        refreshTokens.revokeAllOf(donor.id(), now);
        log.info("Password of donor {} removed, every session revoked", donor.id());
        return views.authenticated(donor, sessions.open(donor, secondFactorVerified));
    }

    @Transactional(noRollbackFor = PasskeyConfirmationRejected.class)
    public void requestEmailChange(DonorId donorId, Confirmation confirmation, EmailAddress newEmail) {
        Donor donor = load(donorId);
        confirmations.confirm(donor, confirmation);
        if (newEmail.equals(donor.email())) {
            throw new EmailUnchanged();
        }
        emailVerification.issueChangeLink(donor, newEmail);
    }

    @Transactional
    public void resendEmailChange(DonorId donorId) {
        emailVerification.resendChangeLink(load(donorId));
    }

    @Transactional
    public void cancelEmailChange(DonorId donorId) {
        emailVerification.cancelChange(load(donorId));
    }

    private Donor load(DonorId donorId) {
        return donors.findById(donorId).orElseThrow(() -> new DonorNotFound(donorId));
    }
}
