package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.ConfirmationRequired;
import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.InvalidPasskey;
import cz.novanadeje.app.donors.domain.LinkSecret;
import cz.novanadeje.app.donors.domain.Passkey;
import cz.novanadeje.app.donors.domain.PasskeyChallenge;
import cz.novanadeje.app.donors.domain.PasskeyChallengeRepository;
import cz.novanadeje.app.donors.domain.PasskeyConfirmationRejected;
import cz.novanadeje.app.donors.domain.PasskeyRepository;
import cz.novanadeje.app.donors.domain.PasskeyUserHandle;
import cz.novanadeje.app.donors.domain.PasswordHash;
import cz.novanadeje.app.donors.domain.PasswordHasher;
import cz.novanadeje.app.donors.domain.PasswordPolicy;
import cz.novanadeje.app.donors.domain.RawPassword;
import cz.novanadeje.app.donors.domain.WrongPassword;
import cz.novanadeje.app.shared.domain.error.RuleViolation;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

@Component
public class DonorConfirmations {

    private final PasswordHasher passwordHasher;
    private final PasswordPolicy passwordPolicy;
    private final PasskeyRepository passkeys;
    private final PasskeyChallengeRepository challenges;
    private final PasskeyCeremonies ceremonies;
    private final CommittedRefusals passkeyConfirmations;
    private final Clock clock;

    public DonorConfirmations(PasswordHasher passwordHasher, PasswordPolicy passwordPolicy, PasskeyRepository passkeys, PasskeyChallengeRepository challenges,
                              PasskeyCeremonies ceremonies, PlatformTransactionManager transactions, Clock clock) {
        this.passwordHasher = passwordHasher;
        this.passwordPolicy = passwordPolicy;
        this.passkeys = passkeys;
        this.challenges = challenges;
        this.ceremonies = ceremonies;
        this.passkeyConfirmations = new CommittedRefusals(transactions, List.of(PasskeyConfirmationRejected.class));
        this.clock = clock;
    }

    ConfirmedCredentials confirm(Donor donor, Confirmation confirmation) {
        Optional<String> password = confirmation.givenPassword();
        if (password.isPresent()) {
            requireMatching(donor, password.get());
            return ConfirmedCredentials.byPassword(donor);
        }
        PasskeyProof passkey = confirmation.givenPasskey().orElseThrow(ConfirmationRequired::new);
        passkeyConfirmations.run(() -> requirePasskeyOf(donor, passkey));
        return ConfirmedCredentials.byPasskey(donor);
    }

    void confirmPasskey(Donor donor, Confirmation confirmation) {
        requirePasskeyOf(donor, confirmation.givenPasskey().orElseThrow(ConfirmationRequired::new));
    }

    private void requireMatching(Donor donor, String password) {
        PasswordHash hash = donor.passwordHash().orElseThrow(WrongPassword::new);
        RawPassword rawPassword;
        try {
            rawPassword = passwordPolicy.accept(password);
        } catch (RuleViolation weak) {
            throw new WrongPassword();
        }
        if (!passwordHasher.matches(rawPassword, hash)) {
            throw new WrongPassword();
        }
    }

    private void requirePasskeyOf(Donor donor, PasskeyProof proof) {
        Instant now = clock.instant();
        LinkSecret secret = parse(proof.challenge());
        PasskeyChallenge issued = challenges.findByChallengeHash(secret.hash())
                .filter(candidate -> candidate.isUsableForSignInAt(now))
                .orElseThrow(PasskeyConfirmationRejected::new);
        if (!challenges.markUsed(issued.id(), now)) {
            throw new PasskeyConfirmationRejected();
        }
        PasskeyAssertion assertion = proof.assertion();
        Passkey passkey = passkeys.findByCredentialId(assertion.credentialId())
                .filter(found -> found.belongsTo(donor.id()))
                .filter(found -> PasskeyUserHandle.of(donor.id()).matches(assertion.userHandle()))
                .orElseThrow(PasskeyConfirmationRejected::new);
        long signCount;
        try {
            signCount = ceremonies.verifySignIn(assertion, secret, passkey);
        } catch (InvalidPasskey rejected) {
            throw new PasskeyConfirmationRejected();
        }
        passkey.recordSignIn(signCount, now);
        passkeys.save(passkey);
    }

    private static LinkSecret parse(String challenge) {
        try {
            return new LinkSecret(challenge);
        } catch (IllegalArgumentException malformed) {
            throw new PasskeyConfirmationRejected();
        }
    }
}
