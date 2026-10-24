package cz.novanadeje.app.donors.domain;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class CodeChallengeTest {

    private static final String VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    private static final String CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";

    @Test
    @DisplayName("Given the SHA-256 of the verifier, when the challenge is verified, then it matches")
    void should_match_when_verified_given_the_sha256_of_the_verifier() {
        assertThat(new CodeChallenge(CHALLENGE, "S256").matches(VERIFIER)).isTrue();
        assertThat(new CodeChallenge(CHALLENGE, "S256").matches(VERIFIER + "x")).isFalse();
        assertThat(new CodeChallenge(CHALLENGE, "S256").matches(null)).isFalse();
    }

    @Test
    @DisplayName("Given another method or a malformed challenge, when the challenge is created, then it is refused")
    void should_refuse_when_created_given_another_method_or_a_malformed_challenge() {
        assertThatThrownBy(() -> new CodeChallenge(CHALLENGE, "plain")).isInstanceOf(InvalidAuthorizationRequest.class);
        assertThatThrownBy(() -> new CodeChallenge(CHALLENGE, null)).isInstanceOf(InvalidAuthorizationRequest.class);
        assertThatThrownBy(() -> new CodeChallenge("short", "S256")).isInstanceOf(InvalidAuthorizationRequest.class);
        assertThatThrownBy(() -> new CodeChallenge(null, "S256")).isInstanceOf(InvalidAuthorizationRequest.class);
    }
}
