package cz.novanadeje.app.shared.infrastructure.security;

import cz.novanadeje.app.shared.application.session.SessionLiveness;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jwt.Jwt;

import java.time.Instant;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.tuple;

class LiveSessionValidatorTest {

    private static final UUID LIVE = UUID.fromString("019a5a3c-0000-7000-8000-000000000001");
    private static final UUID ENDED = UUID.fromString("019a5a3c-0000-7000-8000-000000000002");
    private static final OAuth2TokenValidator<Jwt> CLAIMS_PASS = token -> OAuth2TokenValidatorResult.success();

    private final Set<UUID> asked = new HashSet<>();
    private final SessionLiveness liveness = session -> {
        asked.add(session);
        return LIVE.equals(session);
    };

    private static Jwt.Builder token() {
        return Jwt.withTokenValue("t").header("alg", "HS256").subject("donor").issuedAt(Instant.EPOCH).expiresAt(Instant.EPOCH.plusSeconds(900));
    }

    private OAuth2TokenValidatorResult validate(Jwt jwt) {
        return new LiveSessionValidator(CLAIMS_PASS, liveness).validate(jwt);
    }

    @Test
    @DisplayName("Given a token of a signed-in device, when it is validated, then it passes")
    void should_pass_when_validated_given_live_session() {
        assertThat(validate(token().claim(JwtProperties.SESSION_CLAIM, LIVE.toString()).build()).hasErrors()).isFalse();
    }

    @Test
    @DisplayName("Given a token of a signed-out device, when it is validated, then it fails as an ended session")
    void should_fail_as_ended_session_when_validated_given_ended_session() {
        OAuth2TokenValidatorResult result = validate(token().claim(JwtProperties.SESSION_CLAIM, ENDED.toString()).build());

        assertThat(result.getErrors()).extracting(OAuth2Error::getErrorCode, OAuth2Error::getDescription)
                .containsExactly(tuple("invalid_token", JwtProperties.SESSION_ENDED));
    }

    @Test
    @DisplayName("Given a session claim that is no device id, when it is validated, then it fails as an ended session without asking")
    void should_fail_without_asking_when_validated_given_malformed_session() {
        OAuth2TokenValidatorResult result = validate(token().claim(JwtProperties.SESSION_CLAIM, "not-a-device").build());

        assertThat(result.getErrors()).extracting(OAuth2Error::getDescription).containsExactly(JwtProperties.SESSION_ENDED);
        assertThat(asked).isEmpty();
    }

    @Test
    @DisplayName("Given a browser token issued before devices existed, when it is validated, then it passes without asking")
    void should_pass_without_asking_when_validated_given_token_without_session() {
        assertThat(validate(token().build()).hasErrors()).isFalse();
        assertThat(asked).isEmpty();
    }

    @Test
    @DisplayName("Given a connected application's token, when it is validated, then it passes without asking about any device")
    void should_pass_without_asking_when_validated_given_connected_application_token() {
        Jwt connector = token().claim(JwtProperties.SCOPE_CLAIM, "admin:read").claim(JwtProperties.SESSION_CLAIM, ENDED.toString()).build();

        assertThat(validate(connector).hasErrors()).isFalse();
        assertThat(asked).isEmpty();
    }

    @Test
    @DisplayName("Given a token the claim validators refuse, when it is validated, then their errors stand and no device is asked")
    void should_keep_claim_errors_without_asking_when_validated_given_refused_claims() {
        OAuth2Error expired = new OAuth2Error("invalid_token", "Jwt expired", null);
        LiveSessionValidator validator = new LiveSessionValidator(jwt -> OAuth2TokenValidatorResult.failure(expired), liveness);

        OAuth2TokenValidatorResult result = validator.validate(token().claim(JwtProperties.SESSION_CLAIM, LIVE.toString()).build());

        assertThat(result.getErrors()).containsExactly(expired);
        assertThat(asked).isEmpty();
    }
}
