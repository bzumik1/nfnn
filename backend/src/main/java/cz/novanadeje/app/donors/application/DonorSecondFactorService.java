package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.DonorNotFound;
import cz.novanadeje.app.donors.domain.DonorRepository;
import cz.novanadeje.app.donors.domain.PasswordHasher;
import cz.novanadeje.app.donors.domain.RawPassword;
import cz.novanadeje.app.donors.domain.RefreshTokenRepository;
import cz.novanadeje.app.donors.domain.SecondFactor;
import cz.novanadeje.app.donors.domain.SecondFactorAlreadyEnabled;
import cz.novanadeje.app.donors.domain.SecondFactorCodeRejected;
import cz.novanadeje.app.donors.domain.SecondFactorNotEnabled;
import cz.novanadeje.app.donors.domain.SecondFactorNotPending;
import cz.novanadeje.app.donors.domain.SecondFactorRepository;
import cz.novanadeje.app.donors.domain.TotpSecret;
import cz.novanadeje.app.donors.domain.WrongPassword;
import cz.novanadeje.app.shared.application.qr.QrCodeRenderer;
import cz.novanadeje.app.shared.domain.error.RuleViolation;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;

@Service
public class DonorSecondFactorService {

    static final int QR_SIZE_PX = 240;

    private static final Logger log = LoggerFactory.getLogger(DonorSecondFactorService.class);

    private final DonorRepository donors;
    private final SecondFactorRepository secondFactors;
    private final RefreshTokenRepository refreshTokens;
    private final PasswordHasher passwordHasher;
    private final DonorSessionService sessions;
    private final DonorViews views;
    private final QrCodeRenderer qrCodes;
    private final DonorSecondFactorProperties properties;
    private final Clock clock;

    public DonorSecondFactorService(DonorRepository donors, SecondFactorRepository secondFactors, RefreshTokenRepository refreshTokens,
                                    PasswordHasher passwordHasher, DonorSessionService sessions, DonorViews views, QrCodeRenderer qrCodes,
                                    DonorSecondFactorProperties properties, Clock clock) {
        this.donors = donors;
        this.secondFactors = secondFactors;
        this.refreshTokens = refreshTokens;
        this.passwordHasher = passwordHasher;
        this.sessions = sessions;
        this.views = views;
        this.qrCodes = qrCodes;
        this.properties = properties;
        this.clock = clock;
    }

    @Transactional
    public SecondFactorEnrolment begin(DonorId donorId, String password) {
        Donor donor = load(donorId);
        requireMatching(donor, password);
        if (secondFactors.findByDonor(donorId).filter(SecondFactor::isEnabled).isPresent()) {
            throw new SecondFactorAlreadyEnabled();
        }
        TotpSecret secret = TotpSecret.generate();
        secondFactors.save(SecondFactor.enrol(donorId, secret, clock.instant()));
        String otpauthUri = secret.otpauthUri(properties.issuer(), donor.email().value());
        log.info("Second factor set-up started for donor {}", donorId);
        return new SecondFactorEnrolment(secret.value(), otpauthUri, qrCodes.renderPng(otpauthUri, QR_SIZE_PX));
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
        log.info("Second factor enabled for donor {}, every session revoked", donorId);
        return views.authenticated(donor, sessions.open(donor, true));
    }

    @Transactional(noRollbackFor = SecondFactorCodeRejected.class)
    public AuthenticatedDonor disable(DonorId donorId, String password, String code) {
        Donor donor = load(donorId);
        requireMatching(donor, password);
        SecondFactor factor = secondFactors.findByDonor(donorId).filter(SecondFactor::isEnabled).orElseThrow(SecondFactorNotEnabled::new);
        Instant now = clock.instant();
        factor.check(code, now);
        secondFactors.delete(donorId);
        refreshTokens.revokeAllOf(donorId, now);
        log.info("Second factor disabled for donor {}, every session revoked", donorId);
        return views.authenticated(donor, sessions.open(donor, false));
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
