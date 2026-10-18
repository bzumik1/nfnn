package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.application.event.DonorPasswordResetRequested;
import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorRepository;
import cz.novanadeje.app.donors.domain.InvalidPasswordResetToken;
import cz.novanadeje.app.donors.domain.PasswordHasher;
import cz.novanadeje.app.donors.domain.PasswordResetSecret;
import cz.novanadeje.app.donors.domain.PasswordResetToken;
import cz.novanadeje.app.donors.domain.PasswordResetTokenRepository;
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
public class DonorPasswordResetService {

    private static final Logger log = LoggerFactory.getLogger(DonorPasswordResetService.class);

    private final DonorRepository donors;
    private final PasswordResetTokenRepository tokens;
    private final RefreshTokenRepository refreshTokens;
    private final PasswordHasher passwordHasher;
    private final DonorPasswordResetProperties properties;
    private final Clock clock;
    private final ApplicationEventPublisher events;

    public DonorPasswordResetService(DonorRepository donors, PasswordResetTokenRepository tokens, RefreshTokenRepository refreshTokens,
                                     PasswordHasher passwordHasher, DonorPasswordResetProperties properties, Clock clock,
                                     ApplicationEventPublisher events) {
        this.donors = donors;
        this.tokens = tokens;
        this.refreshTokens = refreshTokens;
        this.passwordHasher = passwordHasher;
        this.properties = properties;
        this.clock = clock;
        this.events = events;
    }

    @Transactional
    public void requestReset(EmailAddress email) {
        Donor donor = donors.findByEmail(email).orElse(null);
        if (donor == null) {
            log.debug("Password reset requested for an address without a donor");
            return;
        }
        Instant now = clock.instant();
        tokens.deleteUnusableOf(donor.id(), now);
        int liveLinks = tokens.countOf(donor.id());
        if (liveLinks >= properties.maxLiveLinks()) {
            log.info("Password reset for donor {} not sent: {} live links", donor.id(), liveLinks);
            return;
        }
        PasswordResetSecret secret = PasswordResetSecret.generate();
        PasswordResetToken token = PasswordResetToken.issue(secret, donor.id(), now, properties.tokenTtl());
        tokens.save(token);
        events.publishEvent(new DonorPasswordResetRequested(donor.id().value(), donor.email(), donor.preferredLocale(), secret, token.expiresAt()));
        log.info("Password reset requested for donor {}", donor.id());
    }

    @Transactional
    public void confirmReset(String token, String password) {
        RawPassword rawPassword = new RawPassword(password);
        PasswordResetSecret secret = new PasswordResetSecret(token);
        Instant now = clock.instant();
        PasswordResetToken found = tokens.findBySecretHash(secret.hash())
                .filter(candidate -> candidate.isUsableAt(now))
                .orElseThrow(InvalidPasswordResetToken::new);
        if (!tokens.markUsed(found.id(), now)) {
            throw new InvalidPasswordResetToken();
        }
        Donor donor = donors.findById(found.donorId()).orElseThrow(InvalidPasswordResetToken::new);
        donor.changePassword(passwordHasher.hash(rawPassword));
        donors.save(donor);
        tokens.deleteOthersOf(donor.id(), found.id());
        refreshTokens.revokeAllOf(donor.id(), now);
        log.info("Password reset completed for donor {}", donor.id());
    }
}
