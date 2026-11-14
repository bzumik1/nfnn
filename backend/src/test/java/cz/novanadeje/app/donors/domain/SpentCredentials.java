package cz.novanadeje.app.donors.domain;

import java.time.Instant;

public final class SpentCredentials {

    private SpentCredentials() {
    }

    public static RefreshToken used(RefreshToken token, Instant at) {
        return stored(token, token.usedAt().orElse(at), token.revokedAt().orElse(null), token.supersededAt().orElse(null));
    }

    public static RefreshToken revoked(RefreshToken token, Instant at) {
        return stored(token, token.usedAt().orElse(null), token.revokedAt().orElse(at), token.supersededAt().orElse(null));
    }

    public static RefreshToken superseded(RefreshToken token, Instant at) {
        return stored(token, token.usedAt().orElse(null), token.revokedAt().orElse(at), token.supersededAt().orElse(at));
    }

    public static PasswordResetToken used(PasswordResetToken token, Instant at) {
        return PasswordResetToken.reconstitute(token.id(), token.donorId(), token.secretHash(), token.issuedAt(), token.expiresAt(), at);
    }

    public static EmailVerificationToken used(EmailVerificationToken token, Instant at) {
        return EmailVerificationToken.reconstitute(token.id(), token.donorId(), token.secretHash(), token.issuedAt(), token.expiresAt(),
                token.newEmail().orElse(null), at);
    }

    public static SecondFactorChallenge used(SecondFactorChallenge challenge, Instant at) {
        return SecondFactorChallenge.reconstitute(challenge.id(), challenge.donorId(), challenge.secretHash(), challenge.issuedAt(),
                challenge.expiresAt(), challenge.failedAttempts(), at);
    }

    public static SecondFactorChallenge withFailedAttempts(SecondFactorChallenge challenge, int failedAttempts) {
        return SecondFactorChallenge.reconstitute(challenge.id(), challenge.donorId(), challenge.secretHash(), challenge.issuedAt(),
                challenge.expiresAt(), failedAttempts, challenge.usedAt().orElse(null));
    }

    public static PasskeyChallenge used(PasskeyChallenge challenge, Instant at) {
        return PasskeyChallenge.reconstitute(challenge.id(), challenge.ceremony(), challenge.donorId().orElse(null), challenge.challengeHash(),
                challenge.issuedAt(), challenge.expiresAt(), at);
    }

    private static RefreshToken stored(RefreshToken token, Instant usedAt, Instant revokedAt, Instant supersededAt) {
        return RefreshToken.reconstitute(token.id(), token.donorId(), token.secretHash(), token.issuedAt(), token.expiresAt(),
                token.secondFactorVerified(), token.clientId().orElse(null), token.scopes(), token.grantedAt(), usedAt, revokedAt,
                token.successorId().orElse(null), supersededAt, token.deviceId().orElse(null));
    }
}
