package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.Donor;
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
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;

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
    private final Clock clock;

    public DonorAuthenticationService(DonorRepository donors, PasswordHasher passwordHasher, DonorSessionService sessions, DonorViews views,
                                      SecondFactorRepository secondFactors, SecondFactorChallengeRepository challenges,
                                      DonorSecondFactorProperties secondFactorProperties, Clock clock) {
        this.donors = donors;
        this.passwordHasher = passwordHasher;
        this.sessions = sessions;
        this.views = views;
        this.secondFactors = secondFactors;
        this.challenges = challenges;
        this.secondFactorProperties = secondFactorProperties;
        this.clock = clock;
    }

    @Transactional(noRollbackFor = SecondFactorRequired.class)
    public AuthenticatedDonor login(String email, String password) {
        if (!EmailAddress.isValid(email)) {
            throw new InvalidCredentials();
        }
        RawPassword rawPassword;
        try {
            rawPassword = new RawPassword(password);
        } catch (RuleViolation weak) {
            throw new InvalidCredentials();
        }
        Donor donor = donors.findByEmail(new EmailAddress(email)).filter(found -> !found.isErased()).orElse(null);
        PasswordHash hash = donor == null ? UNKNOWN_DONOR_HASH : donor.passwordHash().orElse(UNKNOWN_DONOR_HASH);
        if (!passwordHasher.matches(rawPassword, hash) || donor == null || !donor.hasPassword()) {
            throw new InvalidCredentials();
        }
        if (!donor.isEmailVerified()) {
            throw new EmailNotVerified();
        }
        if (secondFactors.findByDonor(donor.id()).filter(SecondFactor::isEnabled).isPresent()) {
            Instant now = clock.instant();
            LinkSecret secret = LinkSecret.generate();
            SecondFactorChallenge challenge = SecondFactorChallenge.issue(secret, donor.id(), now, secondFactorProperties.challengeTtl());
            challenges.save(challenge);
            log.info("Sign-in of donor {} waits for the second factor", donor.id());
            throw new SecondFactorRequired(secret.value(), challenge.expiresAt());
        }
        return views.authenticated(donor, sessions.open(donor, false));
    }

    @Transactional(noRollbackFor = InvalidSecondFactorCode.class)
    public AuthenticatedDonor completeSecondFactor(String challenge, String code) {
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
            factor.verify(code, now);
        } catch (InvalidSecondFactorCode wrong) {
            log.info("Second factor of donor {} refused, attempt {} of {}", donor.id(), found.failedAttempts() + 1, secondFactorProperties.challengeAttempts());
            throw wrong;
        }
        if (!challenges.markUsed(found.id(), now)) {
            throw new InvalidSecondFactorChallenge();
        }
        secondFactors.save(factor);
        return views.authenticated(donor, sessions.open(donor, true));
    }

    @Transactional(noRollbackFor = InvalidRefreshToken.class)
    public AuthenticatedDonor refresh(String refreshToken) {
        RefreshedSession session = sessions.refresh(refreshToken);
        return views.authenticated(session.donor(), session.tokens());
    }

    @Transactional
    public void logout(String refreshToken) {
        sessions.close(refreshToken);
    }
}
