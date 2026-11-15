package cz.novanadeje.app.donors.infrastructure.security;

import cz.novanadeje.app.shared.infrastructure.security.AccessTokenDecoder;
import cz.novanadeje.app.shared.infrastructure.security.JwtProperties;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.security.oauth2.jwt.Jwt;

import java.time.Instant;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class JwtAccessTokenVerifierTest {

    private static final String SUBJECT = "0192f0f1-0000-7000-8000-000000000001";

    private final AccessTokenDecoder decoder = mock(AccessTokenDecoder.class);
    private final JwtAccessTokenVerifier verifier = new JwtAccessTokenVerifier(decoder);

    @Test
    @DisplayName("Given a connection's token that names its client, when it is verified, then the verified token carries that client")
    void should_carry_the_named_client_when_verified_given_a_connection_token() {
        when(decoder.decode("connector")).thenReturn(token().claim(JwtProperties.CLIENT_CLAIM, "claude.ai").build());

        assertThat(verifier.verify("connector").connectedClient()).contains("claude.ai");
    }

    @ParameterizedTest
    @ValueSource(strings = {"", " ", "\t"})
    @DisplayName("Given a token whose client claim is blank, when it is verified, then the verified token carries no client, as the audit and the connected client read it")
    void should_carry_no_client_when_verified_given_a_blank_client(String client) {
        when(decoder.decode("connector")).thenReturn(token().claim(JwtProperties.CLIENT_CLAIM, client).build());

        assertThat(verifier.verify("connector").connectedClient()).isEmpty();
    }

    private static Jwt.Builder token() {
        return Jwt.withTokenValue("token").header("alg", "HS256").subject(SUBJECT).audience(List.of("http://localhost:4200/mcp"))
                .claim(JwtProperties.ROLES_CLAIM, List.of("DONOR", "ADMIN")).claim(JwtProperties.SCOPE_CLAIM, "admin:write")
                .issuedAt(Instant.EPOCH).expiresAt(Instant.EPOCH.plusSeconds(60));
    }
}
