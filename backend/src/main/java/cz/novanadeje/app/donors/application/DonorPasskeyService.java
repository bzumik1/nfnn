package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.application.event.DonorPasskeyAdded;
import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.DonorNotFound;
import cz.novanadeje.app.donors.domain.DonorRepository;
import cz.novanadeje.app.donors.domain.LastSignInMethod;
import cz.novanadeje.app.donors.domain.LinkSecret;
import cz.novanadeje.app.donors.domain.Passkey;
import cz.novanadeje.app.donors.domain.PasskeyChallenge;
import cz.novanadeje.app.donors.domain.PasskeyChallengeRepository;
import cz.novanadeje.app.donors.domain.PasskeyConfirmationRejected;
import cz.novanadeje.app.donors.domain.PasskeyId;
import cz.novanadeje.app.donors.domain.PasskeyLimitReached;
import cz.novanadeje.app.donors.domain.PasskeyNotFound;
import cz.novanadeje.app.donors.domain.PasskeyRejected;
import cz.novanadeje.app.donors.domain.PasskeyRepository;
import cz.novanadeje.app.donors.domain.PasskeyUserHandle;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.List;

@Service
public class DonorPasskeyService {

    private static final Logger log = LoggerFactory.getLogger(DonorPasskeyService.class);

    private final DonorRepository donors;
    private final PasskeyRepository passkeys;
    private final PasskeyChallengeRepository challenges;
    private final DonorConfirmations confirmations;
    private final PasskeyCeremonies ceremonies;
    private final PasskeyProperties properties;
    private final SecondFactorSessionGuard sessionGuard;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    public DonorPasskeyService(DonorRepository donors, PasskeyRepository passkeys, PasskeyChallengeRepository challenges,
                               DonorConfirmations confirmations, PasskeyCeremonies ceremonies, PasskeyProperties properties,
                               SecondFactorSessionGuard sessionGuard, ApplicationEventPublisher events, Clock clock) {
        this.donors = donors;
        this.passkeys = passkeys;
        this.challenges = challenges;
        this.confirmations = confirmations;
        this.ceremonies = ceremonies;
        this.properties = properties;
        this.sessionGuard = sessionGuard;
        this.events = events;
        this.clock = clock;
    }

    @Transactional(noRollbackFor = PasskeyConfirmationRejected.class)
    public PasskeyCreationOptions creationOptions(DonorId donorId, boolean secondFactorVerified, Confirmation confirmation) {
        Donor donor = load(donorId);
        if (!confirmation.isEmpty() || donor.hasPassword() || passkeys.countByDonor(donorId) > 0) {
            confirmations.confirm(donor, confirmation);
        }
        sessionGuard.requireForFactorChange(donor, secondFactorVerified);
        return optionsFor(donor);
    }

    PasskeyCreationOptions optionsFor(Donor donor) {
        DonorId donorId = donor.id();
        Instant now = clock.instant();
        challenges.deleteExpiredAt(now);
        LinkSecret challenge = LinkSecret.generate();
        challenges.save(PasskeyChallenge.forRegistration(challenge, donorId, now, properties.challengeTtl()));
        List<PasskeyDescriptor> excluded = passkeys.findByDonor(donorId).stream()
                .map(passkey -> new PasskeyDescriptor(passkey.credentialId(), passkey.transports()))
                .toList();
        return new PasskeyCreationOptions(challenge.value(), ceremonies.relyingPartyId(), properties.relyingPartyName(),
                PasskeyUserHandle.of(donorId).value(), donor.email().value(), donor.name(), ceremonies.algorithms(), excluded,
                properties.challengeTtl());
    }

    @Transactional(noRollbackFor = PasskeyRejected.class)
    public PasskeyView register(DonorId donorId, String challenge, String name, PasskeyAttestation attestation) {
        return registerFor(load(donorId), challenge, name, attestation);
    }

    PasskeyView registerFor(Donor donor, String challenge, String name, PasskeyAttestation attestation) {
        DonorId donorId = donor.id();
        Instant now = clock.instant();
        LinkSecret secret = parse(challenge);
        PasskeyChallenge issued = challenges.findByChallengeHash(secret.hash())
                .filter(candidate -> candidate.isUsableForRegistrationBy(donorId, now))
                .orElseThrow(PasskeyRejected::new);
        issued.markUsed(now);
        challenges.save(issued);
        if (passkeys.countByDonor(donorId) >= properties.maxPerDonor()) {
            throw new PasskeyLimitReached(properties.maxPerDonor());
        }
        VerifiedPasskey verified = ceremonies.verifyRegistration(attestation, secret);
        if (passkeys.findByCredentialId(verified.credentialId()).isPresent()) {
            throw new PasskeyRejected();
        }
        Passkey passkey = Passkey.register(donorId, verified.credentialId(), verified.credentialData(), verified.signCount(),
                verified.transports(), name, now);
        passkeys.save(passkey);
        events.publishEvent(new DonorPasskeyAdded(donorId.value(), donor.email(), donor.preferredLocale(), passkey.name()));
        log.info("Passkey {} added for donor {}", passkey.id(), donorId);
        return PasskeyView.of(passkey);
    }

    @Transactional(readOnly = true)
    public List<PasskeyView> list(DonorId donorId) {
        return passkeys.findByDonor(donorId).stream().map(PasskeyView::of).toList();
    }

    @Transactional
    public PasskeyView rename(DonorId donorId, PasskeyId passkeyId, String name) {
        Passkey passkey = passkeys.findById(passkeyId)
                .filter(found -> found.belongsTo(donorId))
                .orElseThrow(() -> new PasskeyNotFound(passkeyId));
        passkey.rename(name);
        passkeys.save(passkey);
        log.info("Passkey {} renamed by donor {}", passkeyId, donorId);
        return PasskeyView.of(passkey);
    }

    @Transactional
    public void remove(DonorId donorId, boolean secondFactorVerified, PasskeyId passkeyId) {
        Passkey passkey = passkeys.findById(passkeyId)
                .filter(found -> found.belongsTo(donorId))
                .orElseThrow(() -> new PasskeyNotFound(passkeyId));
        Donor donor = load(donorId);
        sessionGuard.requireForFactorChange(donor, secondFactorVerified);
        if (!donor.hasPassword() && passkeys.countByDonor(donorId) <= 1) {
            throw new LastSignInMethod(donorId);
        }
        passkeys.delete(passkey.id());
        log.info("Passkey {} removed by donor {}", passkeyId, donorId);
    }

    private static LinkSecret parse(String challenge) {
        try {
            return new LinkSecret(challenge);
        } catch (IllegalArgumentException malformed) {
            throw new PasskeyRejected();
        }
    }

    private Donor load(DonorId donorId) {
        return donors.findById(donorId).orElseThrow(() -> new DonorNotFound(donorId));
    }
}
