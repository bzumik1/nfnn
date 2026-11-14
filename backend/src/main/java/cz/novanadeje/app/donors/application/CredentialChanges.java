package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.DeviceId;
import cz.novanadeje.app.donors.domain.DeviceSignOutReason;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.EmailVerificationTokenRepository;
import cz.novanadeje.app.donors.domain.PasswordResetTokenRepository;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

@Component
public class CredentialChanges {

    private final DeviceSignOuts signOuts;
    private final EmailVerificationTokenRepository verificationLinks;
    private final PasswordResetTokenRepository resetLinks;

    public CredentialChanges(DeviceSignOuts signOuts, EmailVerificationTokenRepository verificationLinks, PasswordResetTokenRepository resetLinks) {
        this.signOuts = signOuts;
        this.verificationLinks = verificationLinks;
        this.resetLinks = resetLinks;
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void endEverySessionAndLinkOf(DonorId donorId, Instant at) {
        verificationLinks.deleteChangeLinksOf(donorId);
        resetLinks.deleteAllOf(donorId);
        signOuts.endAllOf(donorId, DeviceSignOutReason.CREDENTIALS_CHANGED, at);
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void endEveryOtherSessionAndLinkOf(DonorId donorId, Optional<DeviceId> continuing, Instant at) {
        verificationLinks.deleteChangeLinksOf(donorId);
        resetLinks.deleteAllOf(donorId);
        signOuts.endAllOf(donorId, continuing, DeviceSignOutReason.CREDENTIALS_CHANGED, at);
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void endEverySessionAndOtherLinkOf(DonorId donorId, UUID usedResetLink, Instant at) {
        verificationLinks.deleteChangeLinksOf(donorId);
        resetLinks.deleteOthersOf(donorId, usedResetLink);
        signOuts.endAllOf(donorId, DeviceSignOutReason.CREDENTIALS_CHANGED, at);
    }
}
