package cz.novanadeje.app.donors.domain;

import cz.novanadeje.app.shared.domain.error.AuthenticationFailure;

import java.time.Instant;
import java.util.Map;

public class SecondFactorRequired extends AuthenticationFailure {

    private final String challenge;
    private final Instant challengeExpiresAt;

    public SecondFactorRequired(String challenge, Instant challengeExpiresAt) {
        super("auth/second-factor-required", "The sign-in needs the code from the authenticator app");
        this.challenge = challenge;
        this.challengeExpiresAt = challengeExpiresAt;
    }

    public String challenge() {
        return challenge;
    }

    public Instant challengeExpiresAt() {
        return challengeExpiresAt;
    }

    @Override
    public Map<String, Object> extensions() {
        return Map.of("challenge", challenge, "challengeExpiresAt", challengeExpiresAt);
    }
}
