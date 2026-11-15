package cz.novanadeje.app.shared.infrastructure.security;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.security.oauth2.jwt.Jwt;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

class ClientClaimTest {

    @Test
    @DisplayName("Given a token that names its client, when the client claim is read, then it is that client")
    void should_read_the_named_client_when_read_given_a_token_naming_it() {
        Jwt token = token().claim(JwtProperties.CLIENT_CLAIM, "claude.ai").build();

        assertThat(ClientClaim.of(token)).contains("claude.ai");
    }

    @Test
    @DisplayName("Given a token without a client claim, when the client claim is read, then there is none")
    void should_read_no_client_when_read_given_a_token_without_the_claim() {
        assertThat(ClientClaim.of(token().build())).isEmpty();
    }

    @ParameterizedTest
    @ValueSource(strings = {"", " ", "\t"})
    @DisplayName("Given a token whose client claim is blank, when the client claim is read, then there is none")
    void should_read_no_client_when_read_given_a_blank_claim(String client) {
        Jwt token = token().claim(JwtProperties.CLIENT_CLAIM, client).build();

        assertThat(ClientClaim.of(token)).isEmpty();
    }

    private static Jwt.Builder token() {
        return Jwt.withTokenValue("token").header("alg", "HS256").subject("admin").issuedAt(Instant.EPOCH).expiresAt(Instant.EPOCH.plusSeconds(60));
    }
}
