package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.DeviceSignOutReason;
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
    private final DonorSessionService sessions;
    private final DonorEmailVerificationService emailVerification;
    private final DonorViews views;
    private final ApplicationEventPublisher events;
    private final Clock clock;
    private final DeviceSignOuts signOuts;

    public DonorCredentialsService(DonorRepository donors, PasswordHasher passwordHasher, DonorConfirmations confirmations, PasskeyRepository passkeys,
                                   DonorSessionService sessions, DonorViews views, DonorEmailVerificationService emailVerification,
                                   ApplicationEventPublisher events, Clock clock, DeviceSignOuts signOuts) {
        this.signOuts = signOuts;
        this.donors = donors;
        this.passwordHasher = passwordHasher;
        this.confirmations = confirmations;
        this.passkeys = passkeys;
        this.sessions = sessions;
        this.views = views;
        this.emailVerification = emailVerification;
        this.events = events;
        this.clock = clock;
    }

    @Transactional(noRollbackFor = PasskeyConfirmationRejected.class)
    public AuthenticatedDonor changePassword(DonorId donorId, boolean secondFactorVerified, Confirmation confirmation, String newPassword,
                                             RequestingDevice device) {
        Donor donor = lock(donorId);
        confirmations.confirm(donor, confirmation);
        RawPassword rawPassword = new RawPassword(newPassword);
        sessions.requireLasting(donor, device);
        Instant now = clock.instant();
        donor.changePassword(passwordHasher.hash(rawPassword));
        donors.save(donor);
        signOuts.endAllOf(donor.id(), device.session(), DeviceSignOutReason.CREDENTIALS_CHANGED, now);
        events.publishEvent(new DonorPasswordChanged(donor.id().value(), donor.email(), donor.preferredLocale()));
        log.info("Password of donor {} changed, every session revoked", donor.id());
        return views.authenticated(donor, sessions.continueOn(donor, secondFactorVerified, device));
    }

    @Transactional(noRollbackFor = PasskeyConfirmationRejected.class)
    public AuthenticatedDonor removePassword(DonorId donorId, boolean secondFactorVerified, Confirmation confirmation, RequestingDevice device) {
        Donor donor = lock(donorId);
        confirmations.confirm(donor, confirmation);
        if (passkeys.countByDonor(donorId) == 0) {
            throw new LastSignInMethod(donorId);
        }
        sessions.requireLasting(donor, device);
        Instant now = clock.instant();
        donor.removePassword();
        donors.save(donor);
        signOuts.endAllOf(donor.id(), device.session(), DeviceSignOutReason.CREDENTIALS_CHANGED, now);
        log.info("Password of donor {} removed, every session revoked", donor.id());
        return views.authenticated(donor, sessions.continueOn(donor, secondFactorVerified, device));
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

    private Donor lock(DonorId donorId) {
        return donors.findByIdForUpdate(donorId).orElseThrow(() -> new DonorNotFound(donorId));
    }
}
