package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.application.event.DonorAccountErased;
import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.DonorNotFound;
import cz.novanadeje.app.donors.domain.DonorRepository;
import cz.novanadeje.app.donors.domain.EmailVerificationTokenRepository;
import cz.novanadeje.app.donors.domain.PasskeyRepository;
import cz.novanadeje.app.donors.domain.PasswordResetTokenRepository;
import cz.novanadeje.app.donors.domain.RefreshTokenRepository;
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
    private final RefreshTokenRepository refreshTokens;
    private final PasswordResetTokenRepository passwordResetTokens;
    private final EmailVerificationTokenRepository emailVerificationTokens;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    public DonorErasureService(DonorRepository donors, SecondFactorRepository secondFactors, PasskeyRepository passkeys,
                               RefreshTokenRepository refreshTokens, PasswordResetTokenRepository passwordResetTokens,
                               EmailVerificationTokenRepository emailVerificationTokens, ApplicationEventPublisher events, Clock clock) {
        this.donors = donors;
        this.secondFactors = secondFactors;
        this.passkeys = passkeys;
        this.refreshTokens = refreshTokens;
        this.passwordResetTokens = passwordResetTokens;
        this.emailVerificationTokens = emailVerificationTokens;
        this.events = events;
        this.clock = clock;
    }

    @Transactional
    public void erase(DonorId adminId, DonorId donorId) {
        Donor donor = donors.findById(donorId).orElseThrow(() -> new DonorNotFound(donorId));
        EmailAddress formerEmail = donor.email();
        LocaleCode locale = donor.preferredLocale();
        Instant now = clock.instant();
        donor.erase(now);
        donors.save(donor);
        secondFactors.delete(donorId);
        passkeys.deleteAllOf(donorId);
        refreshTokens.revokeAllOf(donorId, now);
        passwordResetTokens.deleteAllOf(donorId);
        emailVerificationTokens.deleteAllOf(donorId);
        events.publishEvent(new DonorErased(donorId.value(), now));
        events.publishEvent(new AdminActionPerformed(adminId.value(), ERASE_ACTION, Optional.of(donorId.value()),
                "Personal data of donor " + donorId + " erased: account anonymized, every session ended, bank accounts and older-symbol answers"
                        + " deleted; donations and receipts kept", now));
        events.publishEvent(new DonorAccountErased(donorId.value(), formerEmail, locale));
        log.info("Administrator {} erased the personal data of donor {}", adminId, donorId);
    }
}
