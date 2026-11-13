package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.DeviceSignOutReason;
import cz.novanadeje.app.donors.application.event.DonorPasswordChanged;
import cz.novanadeje.app.donors.application.event.DonorPasswordResetRequested;
import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorRepository;
import cz.novanadeje.app.donors.domain.InvalidPasswordResetToken;
import cz.novanadeje.app.donors.domain.PasswordHash;
import cz.novanadeje.app.donors.domain.PasswordHasher;
import cz.novanadeje.app.donors.domain.LinkSecret;
import cz.novanadeje.app.donors.domain.PasswordResetToken;
import cz.novanadeje.app.donors.domain.PasswordResetTokenRepository;
import cz.novanadeje.app.donors.domain.RawPassword;
import cz.novanadeje.app.shared.domain.EmailAddress;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Clock;
import java.time.Instant;
import java.util.Optional;

@Service
public class DonorPasswordResetService {

    private static final Logger log = LoggerFactory.getLogger(DonorPasswordResetService.class);

    private final DonorRepository donors;
    private final PasswordResetTokenRepository tokens;
    private final PasswordHasher passwordHasher;
    private final DonorPasswordResetProperties properties;
    private final Clock clock;
    private final ApplicationEventPublisher events;
    private final DeviceSignOuts signOuts;
    private final SecondFactorHoldings holdings;
    private final TransactionTemplate reads;
    private final TransactionTemplate writes;

    public DonorPasswordResetService(DonorRepository donors, PasswordResetTokenRepository tokens, PasswordHasher passwordHasher, DonorPasswordResetProperties properties, Clock clock,
                                     ApplicationEventPublisher events, DeviceSignOuts signOuts, SecondFactorHoldings holdings,
                                     PlatformTransactionManager transactions) {
        this.signOuts = signOuts;
        this.holdings = holdings;
        this.donors = donors;
        this.tokens = tokens;
        this.passwordHasher = passwordHasher;
        this.properties = properties;
        this.clock = clock;
        this.events = events;
        this.reads = new TransactionTemplate(transactions);
        this.reads.setReadOnly(true);
        this.writes = new TransactionTemplate(transactions);
    }

    @Transactional
    public void requestReset(EmailAddress email) {
        Donor donor = donors.findByEmail(email).orElse(null);
        if (donor == null) {
            log.debug("Password reset requested for an address without a donor");
            return;
        }
        if (!donor.isEmailVerified()) {
            log.info("Password reset for donor {} not sent: the e-mail is not verified", donor.id());
            return;
        }
        if (isAdministratorWithoutSecondFactor(donor)) {
            return;
        }
        Instant now = clock.instant();
        tokens.deleteUnusableOf(donor.id(), now);
        int liveLinks = tokens.countOf(donor.id());
        if (liveLinks >= properties.maxLiveLinks()) {
            log.info("Password reset for donor {} not sent: {} live links", donor.id(), liveLinks);
            return;
        }
        LinkSecret secret = LinkSecret.generate();
        PasswordResetToken token = PasswordResetToken.issue(secret, donor.id(), now, properties.tokenTtl());
        tokens.save(token);
        events.publishEvent(new DonorPasswordResetRequested(donor.id().value(), donor.email(), donor.preferredLocale(), secret, token.expiresAt()));
        log.info("Password reset requested for donor {}", donor.id());
    }

    public void confirmReset(String token, String password) {
        RawPassword rawPassword = new RawPassword(password);
        LinkSecret secret = new LinkSecret(token);
        Instant now = clock.instant();
        reads.executeWithoutResult(status -> resettableDonor(donors.findById(usableToken(secret, now).donorId())));
        PasswordHash newHash = passwordHasher.hash(rawPassword);
        writes.executeWithoutResult(status -> reset(secret, newHash, now));
    }

    private void reset(LinkSecret secret, PasswordHash newHash, Instant now) {
        PasswordResetToken found = usableToken(secret, now);
        Donor donor = donors.findByIdForUpdate(found.donorId()).orElseThrow(InvalidPasswordResetToken::new);
        if (!tokens.markUsed(found.id(), now)) {
            throw new InvalidPasswordResetToken();
        }
        resettableDonor(Optional.of(donor));
        donor.changePassword(newHash);
        donors.save(donor);
        tokens.deleteOthersOf(donor.id(), found.id());
        signOuts.endAllOf(donor.id(), DeviceSignOutReason.CREDENTIALS_CHANGED, now);
        events.publishEvent(new DonorPasswordChanged(donor.id().value(), donor.email(), donor.preferredLocale()));
        log.info("Password reset completed for donor {}", donor.id());
    }

    private PasswordResetToken usableToken(LinkSecret secret, Instant now) {
        return tokens.findBySecretHash(secret.hash())
                .filter(candidate -> candidate.isUsableAt(now))
                .orElseThrow(InvalidPasswordResetToken::new);
    }

    private Donor resettableDonor(Optional<Donor> found) {
        return found.filter(donor -> !isAdministratorWithoutSecondFactor(donor)).orElseThrow(InvalidPasswordResetToken::new);
    }

    private boolean isAdministratorWithoutSecondFactor(Donor donor) {
        return donor.isAdministrator() && !holdings.holdsAny(donor.id());
    }
}
