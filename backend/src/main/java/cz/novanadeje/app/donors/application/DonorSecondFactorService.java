package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.application.event.DonorSecondFactorDisabled;
import cz.novanadeje.app.donors.application.event.DonorSecondFactorEnabled;
import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.DonorNotFound;
import cz.novanadeje.app.donors.domain.DonorRepository;
import cz.novanadeje.app.donors.domain.PasskeyConfirmationRejected;
import cz.novanadeje.app.donors.domain.RefreshTokenRepository;
import cz.novanadeje.app.donors.domain.SecondFactor;
import cz.novanadeje.app.donors.domain.SecondFactorAlreadyEnabled;
import cz.novanadeje.app.donors.domain.SecondFactorCodeRejected;
import cz.novanadeje.app.donors.domain.SecondFactorNotEnabled;
import cz.novanadeje.app.donors.domain.SecondFactorNotPending;
import cz.novanadeje.app.donors.domain.SecondFactorRepository;
import cz.novanadeje.app.donors.domain.TotpSecret;
import cz.novanadeje.app.shared.application.qr.QrCodeEncoder;
import cz.novanadeje.app.shared.application.qr.QrErrorCorrection;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;

@Service
public class DonorSecondFactorService {

    private static final Logger log = LoggerFactory.getLogger(DonorSecondFactorService.class);

    private final DonorRepository donors;
    private final SecondFactorRepository secondFactors;
    private final RefreshTokenRepository refreshTokens;
    private final DonorConfirmations confirmations;
    private final DonorSessionService sessions;
    private final DonorViews views;
    private final QrCodeEncoder qrCodes;
    private final SecondFactorSessionGuard sessionGuard;
    private final DonorSecondFactorProperties properties;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    public DonorSecondFactorService(DonorRepository donors, SecondFactorRepository secondFactors, RefreshTokenRepository refreshTokens,
                                    DonorConfirmations confirmations, DonorSessionService sessions, DonorViews views, QrCodeEncoder qrCodes,
                                    SecondFactorSessionGuard sessionGuard, DonorSecondFactorProperties properties, ApplicationEventPublisher events,
                                    Clock clock) {
        this.donors = donors;
        this.secondFactors = secondFactors;
        this.refreshTokens = refreshTokens;
        this.confirmations = confirmations;
        this.sessions = sessions;
        this.views = views;
        this.qrCodes = qrCodes;
        this.sessionGuard = sessionGuard;
        this.properties = properties;
        this.events = events;
        this.clock = clock;
    }

    @Transactional(noRollbackFor = PasskeyConfirmationRejected.class)
    public SecondFactorEnrolment begin(DonorId donorId, boolean secondFactorVerified, Confirmation confirmation) {
        Donor donor = load(donorId);
        confirmations.confirm(donor, confirmation);
        sessionGuard.requireForFactorChange(donor, secondFactorVerified);
        if (secondFactors.findByDonor(donorId).filter(SecondFactor::isEnabled).isPresent()) {
            throw new SecondFactorAlreadyEnabled();
        }
        TotpSecret secret = TotpSecret.generate();
        secondFactors.save(SecondFactor.enrol(donorId, secret, clock.instant()));
        String otpauthUri = secret.otpauthUri(properties.issuer(), donor.email().value());
        log.info("Second factor set-up started for donor {}", donorId);
        return new SecondFactorEnrolment(secret.value(), otpauthUri, qrCodes.encode(otpauthUri, QrErrorCorrection.MEDIUM));
    }

    @Transactional
    public AuthenticatedDonor confirm(DonorId donorId, String code) {
        Donor donor = load(donorId);
        SecondFactor factor = secondFactors.findByDonor(donorId).orElseThrow(SecondFactorNotPending::new);
        if (factor.isEnabled()) {
            throw new SecondFactorAlreadyEnabled();
        }
        Instant now = clock.instant();
        factor.confirm(code, now);
        secondFactors.save(factor);
        refreshTokens.revokeAllOf(donorId, now);
        events.publishEvent(new DonorSecondFactorEnabled(donorId.value(), donor.email(), donor.preferredLocale()));
        log.info("Second factor enabled for donor {}, every session revoked", donorId);
        return views.authenticated(donor, sessions.open(donor, true));
    }

    @Transactional(noRollbackFor = {SecondFactorCodeRejected.class, PasskeyConfirmationRejected.class})
    public AuthenticatedDonor disable(DonorId donorId, Confirmation confirmation, String code) {
        Donor donor = load(donorId);
        confirmations.confirm(donor, confirmation);
        SecondFactor factor = secondFactors.findByDonor(donorId).filter(SecondFactor::isEnabled).orElseThrow(SecondFactorNotEnabled::new);
        Instant now = clock.instant();
        factor.check(code, now);
        secondFactors.delete(donorId);
        refreshTokens.revokeAllOf(donorId, now);
        events.publishEvent(new DonorSecondFactorDisabled(donorId.value(), donor.email(), donor.preferredLocale()));
        log.info("Second factor disabled for donor {}, every session revoked", donorId);
        return views.authenticated(donor, sessions.open(donor, false));
    }

    private Donor load(DonorId donorId) {
        return donors.findById(donorId).orElseThrow(() -> new DonorNotFound(donorId));
    }
}
