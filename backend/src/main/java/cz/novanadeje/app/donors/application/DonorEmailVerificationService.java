package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.application.event.DonorEmailChangeRequested;
import cz.novanadeje.app.donors.application.event.DonorEmailChanged;
import cz.novanadeje.app.donors.application.event.DonorEmailVerificationRequested;
import cz.novanadeje.app.donors.domain.CompanyIdentifier;
import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorRepository;
import cz.novanadeje.app.donors.domain.EmailVerificationToken;
import cz.novanadeje.app.donors.domain.EmailVerificationTokenRepository;
import cz.novanadeje.app.donors.domain.InvalidEmailVerificationToken;
import cz.novanadeje.app.donors.domain.LinkSecret;
import cz.novanadeje.app.donors.domain.RefreshTokenRepository;
import cz.novanadeje.app.shared.application.event.DonorRegistered;
import cz.novanadeje.app.shared.domain.EmailAddress;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;

@Service
public class DonorEmailVerificationService {

    private static final Logger log = LoggerFactory.getLogger(DonorEmailVerificationService.class);

    private final DonorRepository donors;
    private final EmailVerificationTokenRepository tokens;
    private final RefreshTokenRepository refreshTokens;
    private final DonorSessionService sessions;
    private final DonorEmailVerificationProperties properties;
    private final Clock clock;
    private final ApplicationEventPublisher events;

    public DonorEmailVerificationService(DonorRepository donors, EmailVerificationTokenRepository tokens, RefreshTokenRepository refreshTokens,
                                         DonorSessionService sessions, DonorEmailVerificationProperties properties, Clock clock,
                                         ApplicationEventPublisher events) {
        this.donors = donors;
        this.tokens = tokens;
        this.refreshTokens = refreshTokens;
        this.sessions = sessions;
        this.properties = properties;
        this.clock = clock;
        this.events = events;
    }

    @Transactional
    public void requestVerification(EmailAddress email) {
        Donor donor = donors.findByEmail(email).orElse(null);
        if (donor == null) {
            log.debug("E-mail verification requested for an address without a donor");
            return;
        }
        if (donor.isEmailVerified()) {
            log.info("E-mail verification requested for donor {}, whose address is already verified", donor.id());
            return;
        }
        issueLink(donor);
    }

    @Transactional
    public AuthenticatedDonor confirm(String token) {
        LinkSecret secret = new LinkSecret(token);
        Instant now = clock.instant();
        EmailVerificationToken found = tokens.findBySecretHash(secret.hash())
                .filter(candidate -> candidate.isUsableAt(now))
                .orElseThrow(InvalidEmailVerificationToken::new);
        if (!tokens.markUsed(found.id(), now)) {
            throw new InvalidEmailVerificationToken();
        }
        Donor donor = found.newEmail()
                .map(newEmail -> changeEmail(found, newEmail, now))
                .orElseGet(() -> verifyRegistration(found, now));
        return new AuthenticatedDonor(DonorView.of(donor), sessions.open(donor.id(), donor.roles()));
    }

    private Donor verifyRegistration(EmailVerificationToken found, Instant now) {
        Donor donor = donors.findById(found.donorId())
                .filter(candidate -> !candidate.isEmailVerified())
                .orElseThrow(InvalidEmailVerificationToken::new);
        donor.verifyEmail(now);
        donors.save(donor);
        tokens.deleteAllOf(donor.id());
        events.publishEvent(new DonorRegistered(
                donor.id().value(), donor.type(), donor.name(), donor.companyIdentifier().map(CompanyIdentifier::value),
                donor.address(), donor.email(), donor.variableSymbol(), donor.preferredLocale(), donor.registeredAt()
        ));
        log.info("E-mail of donor {} verified", donor.id());
        return donor;
    }

    private Donor changeEmail(EmailVerificationToken found, EmailAddress newEmail, Instant now) {
        Donor donor = donors.findById(found.donorId())
                .filter(Donor::isEmailVerified)
                .filter(candidate -> !donors.existsByEmail(newEmail))
                .orElseThrow(InvalidEmailVerificationToken::new);
        EmailAddress previousEmail = donor.email();
        donor.changeEmail(newEmail);
        donors.save(donor);
        tokens.deleteAllOf(donor.id());
        refreshTokens.revokeAllOf(donor.id(), now);
        events.publishEvent(new DonorEmailChanged(donor.id().value(), previousEmail, newEmail, donor.preferredLocale()));
        log.info("E-mail of donor {} changed", donor.id());
        return donor;
    }

    void issueChangeLink(Donor donor, EmailAddress newEmail) {
        Instant now = clock.instant();
        tokens.deleteUnusableOf(donor.id(), now);
        int liveLinks = tokens.countOf(donor.id());
        if (liveLinks >= properties.maxLiveLinks()) {
            log.info("E-mail change for donor {} not sent: {} live links", donor.id(), liveLinks);
            return;
        }
        LinkSecret secret = LinkSecret.generate();
        EmailVerificationToken token = EmailVerificationToken.issueForChange(secret, donor.id(), newEmail, now, properties.tokenTtl());
        tokens.save(token);
        events.publishEvent(new DonorEmailChangeRequested(donor.id().value(), newEmail, donor.preferredLocale(), secret, token.expiresAt()));
        log.info("E-mail change link issued for donor {}", donor.id());
    }

    void issueLink(Donor donor) {
        Instant now = clock.instant();
        tokens.deleteUnusableOf(donor.id(), now);
        int liveLinks = tokens.countOf(donor.id());
        if (liveLinks >= properties.maxLiveLinks()) {
            log.info("E-mail verification for donor {} not sent: {} live links", donor.id(), liveLinks);
            return;
        }
        LinkSecret secret = LinkSecret.generate();
        EmailVerificationToken token = EmailVerificationToken.issue(secret, donor.id(), now, properties.tokenTtl());
        tokens.save(token);
        events.publishEvent(new DonorEmailVerificationRequested(donor.id().value(), donor.email(), donor.preferredLocale(), secret, token.expiresAt()));
        log.info("E-mail verification link issued for donor {}", donor.id());
    }
}
