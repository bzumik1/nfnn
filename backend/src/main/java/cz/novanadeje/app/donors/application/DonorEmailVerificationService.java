package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.application.event.DonorEmailAddressInUse;
import cz.novanadeje.app.donors.application.event.DonorEmailChangeRequested;
import cz.novanadeje.app.donors.application.event.DonorEmailChanged;
import cz.novanadeje.app.donors.application.event.DonorEmailVerificationRequested;
import cz.novanadeje.app.donors.application.event.DonorRegistrationReminderDue;
import cz.novanadeje.app.donors.domain.CompanyIdentifier;
import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorRepository;
import cz.novanadeje.app.donors.domain.EmailVerificationToken;
import cz.novanadeje.app.donors.domain.EmailVerificationTokenRepository;
import cz.novanadeje.app.donors.domain.InvalidEmailVerificationToken;
import cz.novanadeje.app.donors.domain.LinkSecret;
import cz.novanadeje.app.donors.domain.NoPendingEmailChange;
import cz.novanadeje.app.donors.domain.RefreshTokenRepository;
import cz.novanadeje.app.donors.domain.RegistrationReturn;
import cz.novanadeje.app.shared.application.event.DonorRegistered;
import cz.novanadeje.app.shared.domain.EmailAddress;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.Optional;

@Service
public class DonorEmailVerificationService {

    private static final Logger log = LoggerFactory.getLogger(DonorEmailVerificationService.class);

    private final DonorRepository donors;
    private final EmailVerificationTokenRepository tokens;
    private final RefreshTokenRepository refreshTokens;
    private final DonorSessionService sessions;
    private final DonorViews views;
    private final DonorEmailVerificationProperties properties;
    private final Clock clock;
    private final ApplicationEventPublisher events;

    public DonorEmailVerificationService(DonorRepository donors, EmailVerificationTokenRepository tokens, RefreshTokenRepository refreshTokens,
                                         DonorSessionService sessions, DonorViews views, DonorEmailVerificationProperties properties,
                                         Clock clock, ApplicationEventPublisher events) {
        this.donors = donors;
        this.tokens = tokens;
        this.refreshTokens = refreshTokens;
        this.sessions = sessions;
        this.views = views;
        this.properties = properties;
        this.clock = clock;
        this.events = events;
    }

    @Transactional
    public void requestVerification(EmailAddress email) {
        awaitingVerification(email).ifPresent(this::issueLink);
    }

    @Transactional
    public void requestVerification(EmailAddress email, RegistrationReturn returnTo) {
        awaitingVerification(email).ifPresent(donor -> issueLink(donor, returnTo));
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
        return views.authenticated(donor, sessions.open(donor, false));
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
        tokens.deleteChangeLinksOf(donor.id());
        LinkSecret secret = LinkSecret.generate();
        EmailVerificationToken token = EmailVerificationToken.issueForChange(secret, donor.id(), newEmail, now, properties.tokenTtl());
        tokens.save(token);
        Donor owner = donors.findByEmail(newEmail).orElse(null);
        if (owner != null) {
            events.publishEvent(new DonorEmailAddressInUse(owner.id().value(), newEmail, owner.preferredLocale()));
            log.info("E-mail change for donor {} pending without a link: the new address belongs to donor {}", donor.id(), owner.id());
            return;
        }
        events.publishEvent(new DonorEmailChangeRequested(donor.id().value(), newEmail, donor.preferredLocale(), secret, token.expiresAt()));
        log.info("E-mail change link issued for donor {}", donor.id());
    }

    void resendChangeLink(Donor donor) {
        EmailAddress newEmail = tokens.findPendingChangeOf(donor.id(), clock.instant())
                .flatMap(EmailVerificationToken::newEmail)
                .orElseThrow(() -> new NoPendingEmailChange(donor.id()));
        issueChangeLink(donor, newEmail);
    }

    void cancelChange(Donor donor) {
        tokens.deleteChangeLinksOf(donor.id());
        log.info("E-mail change of donor {} cancelled", donor.id());
    }

    void issueLink(Donor donor) {
        newLink(donor).ifPresent(link -> announceVerification(new DonorEmailVerificationRequested(donor.id().value(), donor.email(),
                donor.preferredLocale(), link.secret(), link.expiresAt(), Optional.empty())));
    }

    void issueLink(Donor donor, RegistrationReturn returnTo) {
        newLink(donor).ifPresent(link -> announceVerification(new DonorEmailVerificationRequested(donor.id().value(), donor.email(),
                donor.preferredLocale(), link.secret(), link.expiresAt(), Optional.of(returnTo))));
    }

    void issueReminderLink(Donor donor) {
        newLink(donor).ifPresent(link -> {
            events.publishEvent(new DonorRegistrationReminderDue(donor.id().value(), donor.email(), donor.preferredLocale(), link.secret(),
                    link.expiresAt()));
            log.info("Registration reminder with a new verification link issued for donor {}", donor.id());
        });
    }

    private Optional<Donor> awaitingVerification(EmailAddress email) {
        Donor donor = donors.findByEmail(email).orElse(null);
        if (donor == null) {
            log.debug("E-mail verification requested for an address without a donor");
            return Optional.empty();
        }
        if (donor.isEmailVerified()) {
            log.info("E-mail verification requested for donor {}, whose address is already verified", donor.id());
            return Optional.empty();
        }
        return Optional.of(donor);
    }

    private void announceVerification(DonorEmailVerificationRequested requested) {
        events.publishEvent(requested);
        log.info("E-mail verification link issued for donor {}", requested.donorId());
    }

    private Optional<IssuedLink> newLink(Donor donor) {
        Instant now = clock.instant();
        tokens.deleteUnusableOf(donor.id(), now);
        int liveLinks = tokens.countOf(donor.id());
        if (liveLinks >= properties.maxLiveLinks()) {
            log.info("E-mail verification for donor {} not sent: {} live links", donor.id(), liveLinks);
            return Optional.empty();
        }
        LinkSecret secret = LinkSecret.generate();
        EmailVerificationToken token = EmailVerificationToken.issue(secret, donor.id(), now, properties.tokenTtl());
        tokens.save(token);
        return Optional.of(new IssuedLink(secret, token.expiresAt()));
    }

    private record IssuedLink(LinkSecret secret, Instant expiresAt) {

        @Override
        public String toString() {
            return "IssuedLink[secret=***, expiresAt=" + expiresAt + "]";
        }
    }
}
