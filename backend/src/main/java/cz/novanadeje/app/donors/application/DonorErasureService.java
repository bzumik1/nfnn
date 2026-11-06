package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.DeviceSignOutReason;
import cz.novanadeje.app.donors.application.event.DonorAccountErased;
import cz.novanadeje.app.donors.domain.AuthorizationCodeRepository;
import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.DonorNotFound;
import cz.novanadeje.app.donors.domain.DonorRepository;
import cz.novanadeje.app.donors.domain.EmailVerificationTokenRepository;
import cz.novanadeje.app.donors.domain.PasskeyRepository;
import cz.novanadeje.app.donors.domain.PasswordResetTokenRepository;
import cz.novanadeje.app.donors.domain.SecondFactorChallengeRepository;
import cz.novanadeje.app.donors.domain.SecondFactorRecoveryRepository;
import cz.novanadeje.app.donors.domain.SecondFactorRepository;
import cz.novanadeje.app.shared.application.event.AdminActionPerformed;
import cz.novanadeje.app.shared.application.event.DonorErased;
import cz.novanadeje.app.shared.domain.EmailAddress;
import cz.novanadeje.app.shared.domain.LocaleCode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.Optional;

@Service
public class DonorErasureService {

    static final String ERASE_ACTION = "ERASE_DONOR";

    private static final Logger log = LoggerFactory.getLogger(DonorErasureService.class);

    private final DonorRepository donors;
    private final SecondFactorRepository secondFactors;
    private final PasskeyRepository passkeys;
    private final PasswordResetTokenRepository passwordResetTokens;
    private final EmailVerificationTokenRepository emailVerificationTokens;
    private final SecondFactorChallengeRepository challenges;
    private final SecondFactorRecoveryRepository recoveries;
    private final AuthorizationCodeRepository authorizationCodes;
    private final ApplicationEventPublisher events;
    private final Clock clock;
    private final DeviceSignOuts signOuts;

    public DonorErasureService(DonorRepository donors, SecondFactorRepository secondFactors, PasskeyRepository passkeys,
                               PasswordResetTokenRepository passwordResetTokens,
                               EmailVerificationTokenRepository emailVerificationTokens, SecondFactorChallengeRepository challenges,
                               SecondFactorRecoveryRepository recoveries, AuthorizationCodeRepository authorizationCodes, ApplicationEventPublisher events,
                               Clock clock, DeviceSignOuts signOuts) {
        this.signOuts = signOuts;
        this.donors = donors;
        this.secondFactors = secondFactors;
        this.passkeys = passkeys;
        this.passwordResetTokens = passwordResetTokens;
        this.emailVerificationTokens = emailVerificationTokens;
        this.challenges = challenges;
        this.recoveries = recoveries;
        this.authorizationCodes = authorizationCodes;
        this.events = events;
        this.clock = clock;
    }

    @Transactional
    public void erase(DonorId adminId, DonorId donorId) {
        Donor donor = donors.findByIdForUpdate(donorId).orElseThrow(() -> new DonorNotFound(donorId));
        EmailAddress formerEmail = donor.email();
        LocaleCode locale = donor.preferredLocale();
        Instant now = clock.instant();
        donor.erase(now);
        donors.save(donor);
        secondFactors.delete(donorId);
        passkeys.deleteAllOf(donorId);
        signOuts.endAllOf(donorId, DeviceSignOutReason.ERASED, now);
        passwordResetTokens.deleteAllOf(donorId);
        emailVerificationTokens.deleteAllOf(donorId);
        challenges.deleteAllOfWithoutWaiting(donorId);
        recoveries.deleteAllOfWithoutWaiting(donorId);
        authorizationCodes.deleteAllOfWithoutWaiting(donorId);
        events.publishEvent(new DonorErased(donorId.value(), now));
        events.publishEvent(new AdminActionPerformed(adminId.value(), ERASE_ACTION, Optional.of(donorId.value()),
                "Osobní údaje dárce " + donorId + " vymazány: účet anonymizován, všechna přihlášení ukončena, bankovní účty a odpovědi o starších symbolech"
                        + " smazány; dary a potvrzení zůstávají", now));
        events.publishEvent(new DonorAccountErased(donorId.value(), formerEmail, locale));
        log.info("Administrator {} erased the personal data of donor {}", adminId, donorId);
    }
}
