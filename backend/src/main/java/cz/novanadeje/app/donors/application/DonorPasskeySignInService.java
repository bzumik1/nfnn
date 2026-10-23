package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorRepository;
import cz.novanadeje.app.donors.domain.InvalidPasskey;
import cz.novanadeje.app.donors.domain.LinkSecret;
import cz.novanadeje.app.donors.domain.Passkey;
import cz.novanadeje.app.donors.domain.PasskeyChallenge;
import cz.novanadeje.app.donors.domain.PasskeyChallengeRepository;
import cz.novanadeje.app.donors.domain.PasskeyRepository;
import cz.novanadeje.app.donors.domain.PasskeyUserHandle;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;

@Service
public class DonorPasskeySignInService {

    private static final Logger log = LoggerFactory.getLogger(DonorPasskeySignInService.class);

    private final DonorRepository donors;
    private final PasskeyRepository passkeys;
    private final PasskeyChallengeRepository challenges;
    private final PasskeyCeremonies ceremonies;
    private final PasskeyProperties properties;
    private final DonorSessionService sessions;
    private final DonorViews views;
    private final Clock clock;

    public DonorPasskeySignInService(DonorRepository donors, PasskeyRepository passkeys, PasskeyChallengeRepository challenges,
                                     PasskeyCeremonies ceremonies, PasskeyProperties properties, DonorSessionService sessions, DonorViews views,
                                     Clock clock) {
        this.donors = donors;
        this.passkeys = passkeys;
        this.challenges = challenges;
        this.ceremonies = ceremonies;
        this.properties = properties;
        this.sessions = sessions;
        this.views = views;
        this.clock = clock;
    }

    @Transactional
    public PasskeySignInOptions options() {
        Instant now = clock.instant();
        challenges.deleteExpiredAt(now);
        LinkSecret challenge = LinkSecret.generate();
        challenges.save(PasskeyChallenge.forSignIn(challenge, now, properties.challengeTtl()));
        return new PasskeySignInOptions(challenge.value(), ceremonies.relyingPartyId(), properties.challengeTtl());
    }

    @Transactional(noRollbackFor = InvalidPasskey.class)
    public AuthenticatedDonor signIn(String challenge, PasskeyAssertion assertion) {
        Instant now = clock.instant();
        LinkSecret secret = parse(challenge);
        PasskeyChallenge issued = challenges.findByChallengeHash(secret.hash())
                .filter(candidate -> candidate.isUsableForSignInAt(now))
                .orElseThrow(InvalidPasskey::new);
        issued.markUsed(now);
        challenges.save(issued);
        Passkey passkey = passkeys.findByCredentialId(assertion.credentialId()).orElseThrow(InvalidPasskey::new);
        if (!PasskeyUserHandle.of(passkey.donorId()).matches(assertion.userHandle())) {
            throw new InvalidPasskey();
        }
        Donor donor = donors.findById(passkey.donorId())
                .filter(found -> !found.isErased() && found.isEmailVerified())
                .orElseThrow(InvalidPasskey::new);
        long signCount = ceremonies.verifySignIn(assertion, secret, passkey);
        passkey.recordSignIn(signCount, now);
        passkeys.save(passkey);
        log.info("Donor {} signed in with passkey {}", donor.id(), passkey.id());
        return views.authenticated(donor, sessions.open(donor, true));
    }

    private static LinkSecret parse(String challenge) {
        try {
            return new LinkSecret(challenge);
        } catch (IllegalArgumentException malformed) {
            throw new InvalidPasskey();
        }
    }
}
