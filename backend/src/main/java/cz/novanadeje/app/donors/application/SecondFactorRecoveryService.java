package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.application.event.AdministratorSecondFactorRecovered;
import cz.novanadeje.app.donors.application.event.DonorSecondFactorRecovered;
import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.DonorRepository;
import cz.novanadeje.app.donors.domain.InvalidSecondFactorChallenge;
import cz.novanadeje.app.donors.domain.LinkSecret;
import cz.novanadeje.app.donors.domain.RefreshTokenRepository;
import cz.novanadeje.app.donors.domain.SecondFactor;
import cz.novanadeje.app.donors.domain.SecondFactorChallenge;
import cz.novanadeje.app.donors.domain.SecondFactorChallengeRepository;
import cz.novanadeje.app.donors.domain.SecondFactorRecovery;
import cz.novanadeje.app.donors.domain.SecondFactorRecoveryRepository;
import cz.novanadeje.app.donors.domain.SecondFactorRecoveryUnavailable;
import cz.novanadeje.app.donors.domain.SecondFactorRepository;
import cz.novanadeje.app.shared.application.event.AdminActionPerformed;
import cz.novanadeje.app.shared.application.event.SecondFactorRecoveryPaid;
import cz.novanadeje.app.shared.application.recovery.SecondFactorRecoveryTarget;
import cz.novanadeje.app.shared.application.recovery.SecondFactorRecoveryTargets;
import cz.novanadeje.app.shared.domain.FoundationZone;
import cz.novanadeje.app.shared.domain.SecondFactorRecoveryCode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

@Service
public class SecondFactorRecoveryService {

    static final String RECOVER_SECOND_FACTOR_ACTION = "RECOVER_SECOND_FACTOR";

    private static final Logger log = LoggerFactory.getLogger(SecondFactorRecoveryService.class);
    private static final SecureRandom RANDOM = new SecureRandom();

    private final DonorRepository donors;
    private final SecondFactorRepository secondFactors;
    private final SecondFactorChallengeRepository challenges;
    private final SecondFactorRecoveryRepository recoveries;
    private final RefreshTokenRepository refreshTokens;
    private final SecondFactorRecoveryTargets targets;
    private final DonorSecondFactorProperties properties;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    public SecondFactorRecoveryService(DonorRepository donors, SecondFactorRepository secondFactors, SecondFactorChallengeRepository challenges,
                                       SecondFactorRecoveryRepository recoveries, RefreshTokenRepository refreshTokens,
                                       SecondFactorRecoveryTargets targets, DonorSecondFactorProperties properties,
                                       ApplicationEventPublisher events, Clock clock) {
        this.donors = donors;
        this.secondFactors = secondFactors;
        this.challenges = challenges;
        this.recoveries = recoveries;
        this.refreshTokens = refreshTokens;
        this.targets = targets;
        this.properties = properties;
        this.events = events;
        this.clock = clock;
    }

    @Transactional
    public SecondFactorRecoveryInstructions start(String challenge) {
        Instant now = clock.instant();
        SecondFactorChallenge waiting = waitingSignIn(challenge, now);
        Donor donor = donors.findById(waiting.donorId()).orElseThrow(InvalidSecondFactorChallenge::new);
        secondFactors.findByDonor(donor.id()).filter(SecondFactor::isEnabled).orElseThrow(InvalidSecondFactorChallenge::new);
        SecondFactorRecoveryTarget target = targets.targetFor(donor.id().value()).orElseThrow(SecondFactorRecoveryUnavailable::new);
        Optional<SecondFactorRecovery> open = recoveries.findOpenOf(donor.id(), now).filter(found -> found.code().isPresent());
        SecondFactorRecovery recovery = open.orElseGet(() -> openNew(donor, now));
        if (open.isPresent()) {
            log.info("Donor {} returned to the open second-factor recovery {}, open until {}", donor.id(), recovery.id(), recovery.expiresAt());
        }
        SecondFactorRecoveryCode code = recovery.code().orElseThrow();
        LocalDate today = LocalDate.ofInstant(now, FoundationZone.ZONE);
        return new SecondFactorRecoveryInstructions(code.message(), recovery.createdAt(), recovery.expiresAt(), open.isPresent(),
                target.accountNumber(), target.iban(), target.amount(), Optional.of(target.usableFrom()).filter(from -> from.isAfter(today)),
                targets.spaydFor(code));
    }

    private SecondFactorRecovery openNew(Donor donor, Instant now) {
        SecondFactorRecovery recovery = SecondFactorRecovery.open(donor.id(), SecondFactorRecoveryCode.generate(RANDOM), now, properties.recoveryTtl());
        recoveries.replaceOpenOf(donor.id(), recovery);
        log.info("Donor {} started a second-factor recovery by payment, open until {}", donor.id(), recovery.expiresAt());
        return recovery;
    }

    @Transactional
    public void complete(SecondFactorRecoveryPaid payment) {
        Instant now = clock.instant();
        DonorId donorId = new DonorId(payment.donorId());
        Optional<SecondFactorRecovery> recovery = recoveries.findByCodeHash(payment.code().hash())
                .filter(found -> found.donorId().equals(donorId) && found.isOpenAt(now));
        if (recovery.isEmpty() || !recoveries.markUsed(recovery.get().id(), now)) {
            log.info("A second-factor recovery payment of donor {} matches no open recovery", donorId);
            return;
        }
        Optional<Donor> donor = donors.findById(donorId)
                .filter(found -> secondFactors.findByDonor(donorId).filter(SecondFactor::isEnabled).isPresent());
        if (donor.isEmpty()) {
            log.info("Second-factor recovery {} of donor {} was paid, but the second factor is off already", recovery.get().id(), donorId);
            return;
        }
        secondFactors.delete(donorId);
        refreshTokens.revokeAllOf(donorId, now);
        events.publishEvent(new DonorSecondFactorRecovered(donorId.value(), donor.get().email(), donor.get().preferredLocale(),
                payment.senderAccount()));
        if (donor.get().isAdministrator()) {
            tellTheOtherAdministrators(donor.get(), payment.senderAccount(), now);
        }
        log.info("Second factor of donor {} turned off by recovery payment {}; every session ended", donorId, recovery.get().id());
    }

    private SecondFactorChallenge waitingSignIn(String challenge, Instant now) {
        LinkSecret secret;
        try {
            secret = new LinkSecret(challenge);
        } catch (IllegalArgumentException malformed) {
            throw new InvalidSecondFactorChallenge();
        }
        return challenges.findBySecretHash(secret.hash())
                .filter(candidate -> candidate.isUsableAt(now, properties.challengeAttempts()))
                .orElseThrow(InvalidSecondFactorChallenge::new);
    }

    private void tellTheOtherAdministrators(Donor administrator, String senderAccount, Instant now) {
        events.publishEvent(new AdminActionPerformed(administrator.id().value(), RECOVER_SECOND_FACTOR_ACTION, Optional.of(administrator.id().value()),
                "Dvoufaktorové ověření správce " + administrator.id() + " vypnuto platbou 1 Kč z ověřeného účtu " + senderAccount
                        + "; všechna přihlášení ukončena", now));
        List<AdministratorSecondFactorRecovered.Recipient> others = donors.findAdministrators().stream()
                .filter(other -> !other.id().equals(administrator.id()))
                .map(other -> new AdministratorSecondFactorRecovered.Recipient(other.email(), other.preferredLocale()))
                .toList();
        if (!others.isEmpty()) {
            events.publishEvent(new AdministratorSecondFactorRecovered(administrator.id().value(), administrator.name(), administrator.email(),
                    senderAccount, others));
        }
    }
}
