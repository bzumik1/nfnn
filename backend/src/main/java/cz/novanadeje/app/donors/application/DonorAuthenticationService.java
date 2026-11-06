package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.SecondFactorCodesPaused;
import cz.novanadeje.app.donors.domain.SessionKind;
import cz.novanadeje.app.donors.domain.DeviceDescription;
import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.DonorRepository;
import cz.novanadeje.app.donors.domain.EmailNotVerified;
import cz.novanadeje.app.donors.domain.InvalidCredentials;
import cz.novanadeje.app.donors.domain.InvalidRefreshToken;
import cz.novanadeje.app.donors.domain.InvalidSecondFactorChallenge;
import cz.novanadeje.app.donors.domain.InvalidSecondFactorCode;
import cz.novanadeje.app.donors.domain.LinkSecret;
import cz.novanadeje.app.donors.domain.PasswordHash;
import cz.novanadeje.app.donors.domain.PasswordHasher;
import cz.novanadeje.app.donors.domain.RawPassword;
import cz.novanadeje.app.donors.domain.SecondFactor;
import cz.novanadeje.app.donors.domain.SecondFactorChallenge;
import cz.novanadeje.app.donors.domain.SecondFactorChallengeRepository;
import cz.novanadeje.app.donors.domain.SecondFactorRepository;
import cz.novanadeje.app.donors.domain.SecondFactorRequired;
import cz.novanadeje.app.shared.domain.EmailAddress;
import cz.novanadeje.app.shared.domain.error.RuleViolation;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Clock;
import java.time.Instant;
import java.util.Optional;

@Service
public class DonorAuthenticationService {

    private static final Logger log = LoggerFactory.getLogger(DonorAuthenticationService.class);
    private static final PasswordHash UNKNOWN_DONOR_HASH = new PasswordHash("$2a$12$nHaJvjs2DmAUxce8R89JQenUJ3uPyNxk7wzoV6M5duitBKTlu9VvG");

    private final DonorRepository donors;
    private final PasswordHasher passwordHasher;
    private final DonorSessionService sessions;
    private final DonorViews views;
    private final SecondFactorRepository secondFactors;
    private final SecondFactorChallengeRepository challenges;
    private final DonorSecondFactorProperties secondFactorProperties;
    private final SecondFactorCodes codes;
    private final TransactionTemplate reads;
    private final TransactionTemplate writes;
    private final Clock clock;

    public DonorAuthenticationService(DonorRepository donors, PasswordHasher passwordHasher, DonorSessionService sessions, DonorViews views,
                                      SecondFactorRepository secondFactors, SecondFactorChallengeRepository challenges,
                                      DonorSecondFactorProperties secondFactorProperties, SecondFactorCodes codes,
                                      PlatformTransactionManager transactions, Clock clock) {
        this.donors = donors;
        this.passwordHasher = passwordHasher;
        this.sessions = sessions;
        this.views = views;
        this.secondFactors = secondFactors;
        this.challenges = challenges;
        this.secondFactorProperties = secondFactorProperties;
        this.codes = codes;
        this.reads = new TransactionTemplate(transactions);
        this.reads.setReadOnly(true);
        this.writes = new TransactionTemplate(transactions);
        this.clock = clock;
    }

    public AuthenticatedDonor login(String email, String password, DeviceDescription device, SessionKind kind) {
        if (!EmailAddress.isValid(email)) {
            throw new InvalidCredentials();
        }
        RawPassword rawPassword;
        try {
            rawPassword = new RawPassword(password);
        } catch (RuleViolation weak) {
            throw new InvalidCredentials();
        }
        EmailAddress address = new EmailAddress(email);
        Optional<Donor> found = reads.execute(status -> activeDonorWith(address));
        PasswordHash hash = found.flatMap(Donor::passwordHash).orElse(UNKNOWN_DONOR_HASH);
        if (!passwordHasher.matches(rawPassword, hash) || found.isEmpty() || !found.get().hasPassword()) {
            throw new InvalidCredentials();
        }
        PasswordSignIn outcome = writes.execute(status -> signInWithChecked(address, found.get().id(), hash, device, kind));
        return switch (outcome) {
            case PasswordSignIn.SignedIn(AuthenticatedDonor donor) -> donor;
            case PasswordSignIn.SecondFactorAsked(SecondFactorRequired required) -> throw required;
        };
    }

    @Transactional(noRollbackFor = {InvalidSecondFactorCode.class, SecondFactorCodesPaused.class})
    public AuthenticatedDonor completeSecondFactor(String challenge, String code, DeviceDescription device, SessionKind kind) {
        Instant now = clock.instant();
        LinkSecret secret;
        try {
            secret = new LinkSecret(challenge);
        } catch (IllegalArgumentException malformed) {
            throw new InvalidSecondFactorChallenge();
        }
        SecondFactorChallenge found = challenges.findBySecretHash(secret.hash())
                .filter(candidate -> candidate.isUsableAt(now, secondFactorProperties.challengeAttempts()))
                .orElseThrow(InvalidSecondFactorChallenge::new);
        Donor donor = donors.findById(found.donorId()).orElseThrow(InvalidSecondFactorChallenge::new);
        SecondFactor factor = secondFactors.findByDonor(donor.id()).filter(SecondFactor::isEnabled).orElseThrow(InvalidSecondFactorChallenge::new);
        if (!challenges.reserveAttempt(found.id(), now, secondFactorProperties.challengeAttempts())) {
            throw new InvalidSecondFactorChallenge();
        }
        try {
            codes.verify(factor, code, now);
        } catch (InvalidSecondFactorCode wrong) {
            log.info("Second factor of donor {} refused, attempt {} of {}", donor.id(), found.failedAttempts() + 1, secondFactorProperties.challengeAttempts());
            throw wrong;
        }
        if (!challenges.markUsed(found.id(), now)) {
            throw new InvalidSecondFactorChallenge();
        }
        return views.authenticated(donor, sessions.signIn(donor, true, device, kind));
    }

    @Transactional(noRollbackFor = InvalidRefreshToken.class)
    public AuthenticatedDonor refresh(String refreshToken, SessionCookie presentedIn, DeviceDescription device) {
        RefreshedSession session = sessions.refresh(refreshToken, presentedIn, device);
        return views.authenticated(session.donor(), session.tokens());
    }

    @Transactional
    public void logout(String refreshToken) {
        sessions.close(refreshToken);
    }

    private Optional<Donor> activeDonorWith(EmailAddress email) {
        return donors.findByEmail(email).filter(found -> !found.isErased());
    }

    private PasswordSignIn signInWithChecked(EmailAddress email, DonorId checked, PasswordHash comparedWith, DeviceDescription device,
                                             SessionKind kind) {
        Donor donor = activeDonorWith(email)
                .filter(current -> current.id().equals(checked) && current.passwordHash().filter(comparedWith::equals).isPresent())
                .orElseThrow(InvalidCredentials::new);
        if (!donor.isEmailVerified()) {
            throw new EmailNotVerified();
        }
        if (secondFactors.findByDonor(donor.id()).filter(SecondFactor::isEnabled).isPresent()) {
            Instant now = clock.instant();
            LinkSecret secret = LinkSecret.generate();
            SecondFactorChallenge challenge = SecondFactorChallenge.issue(secret, donor.id(), now, secondFactorProperties.challengeTtl());
            challenges.save(challenge);
            log.info("Sign-in of donor {} waits for the second factor", donor.id());
            return new PasswordSignIn.SecondFactorAsked(new SecondFactorRequired(secret.value(), challenge.expiresAt()));
        }
        return new PasswordSignIn.SignedIn(views.authenticated(donor, sessions.signIn(donor, false, device, kind)));
    }

    private sealed interface PasswordSignIn {

        record SignedIn(AuthenticatedDonor donor) implements PasswordSignIn {
        }

        record SecondFactorAsked(SecondFactorRequired required) implements PasswordSignIn {
        }
    }
}
