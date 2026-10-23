package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.AdministratorRecoveryRefused;
import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorRepository;
import cz.novanadeje.app.donors.domain.InvalidPasswordResetToken;
import cz.novanadeje.app.donors.domain.LinkSecret;
import cz.novanadeje.app.donors.domain.PasskeyRejected;
import cz.novanadeje.app.donors.domain.PasswordResetToken;
import cz.novanadeje.app.donors.domain.PasswordResetTokenRepository;
import cz.novanadeje.app.donors.domain.RefreshTokenRepository;
import cz.novanadeje.app.donors.domain.SecondFactor;
import cz.novanadeje.app.donors.domain.SecondFactorCodeRejected;
import cz.novanadeje.app.donors.domain.SecondFactorCodeRequired;
import cz.novanadeje.app.donors.domain.SecondFactorRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.Optional;

@Service
public class DonorPasskeyRecoveryService {

    private static final Logger log = LoggerFactory.getLogger(DonorPasskeyRecoveryService.class);

    private final PasswordResetTokenRepository tokens;
    private final DonorRepository donors;
    private final SecondFactorRepository secondFactors;
    private final RefreshTokenRepository refreshTokens;
    private final DonorPasskeyService passkeys;
    private final Clock clock;

    public DonorPasskeyRecoveryService(PasswordResetTokenRepository tokens, DonorRepository donors, SecondFactorRepository secondFactors,
                                       RefreshTokenRepository refreshTokens, DonorPasskeyService passkeys, Clock clock) {
        this.tokens = tokens;
        this.donors = donors;
        this.secondFactors = secondFactors;
        this.refreshTokens = refreshTokens;
        this.passkeys = passkeys;
        this.clock = clock;
    }

    @Transactional(noRollbackFor = SecondFactorCodeRejected.class)
    public PasskeyCreationOptions options(String token, String code) {
        Instant now = clock.instant();
        Donor donor = recoverableDonor(usableToken(token, now));
        Optional<SecondFactor> factor = secondFactors.findByDonor(donor.id()).filter(SecondFactor::isEnabled);
        if (factor.isPresent()) {
            if (code == null || code.isBlank()) {
                throw new SecondFactorCodeRequired();
            }
            factor.get().check(code, now);
            secondFactors.save(factor.get());
        }
        log.info("Passkey recovery started for donor {}", donor.id());
        return passkeys.optionsFor(donor);
    }

    @Transactional(noRollbackFor = PasskeyRejected.class)
    public PasskeyView recover(String token, String challenge, String name, PasskeyAttestation attestation) {
        Instant now = clock.instant();
        PasswordResetToken found = usableToken(token, now);
        Donor donor = recoverableDonor(found);
        if (!tokens.markUsed(found.id(), now)) {
            throw new InvalidPasswordResetToken();
        }
        PasskeyView added = passkeys.registerFor(donor, challenge, name, attestation);
        tokens.deleteOthersOf(donor.id(), found.id());
        refreshTokens.revokeAllOf(donor.id(), now);
        log.info("Passkey recovery completed for donor {}, every session revoked", donor.id());
        return added;
    }

    private PasswordResetToken usableToken(String token, Instant now) {
        LinkSecret secret = new LinkSecret(token);
        return tokens.findBySecretHash(secret.hash())
                .filter(candidate -> candidate.isUsableAt(now))
                .orElseThrow(InvalidPasswordResetToken::new);
    }

    private Donor recoverableDonor(PasswordResetToken found) {
        Donor donor = donors.findById(found.donorId())
                .filter(candidate -> !candidate.isErased() && candidate.isEmailVerified())
                .orElseThrow(InvalidPasswordResetToken::new);
        if (donor.isAdministrator()) {
            log.warn("Passkey recovery by e-mail refused for administrator {}", donor.id());
            throw new AdministratorRecoveryRefused(donor.id());
        }
        return donor;
    }
}
