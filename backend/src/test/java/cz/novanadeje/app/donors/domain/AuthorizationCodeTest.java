package cz.novanadeje.app.donors.domain;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.net.URI;
import java.time.Duration;
import java.time.Instant;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

class AuthorizationCodeTest {

    private static final Instant NOW = Instant.parse("2026-10-23T10:00:00Z");
    private static final DonorId DONOR = DonorId.newId(NOW);
    private static final ClientId CLIENT = new ClientId("https://claude.ai/.well-known/oauth-client");
    private static final URI REDIRECT = URI.create("https://claude.ai/api/mcp/auth_callback");
    private static final CodeChallenge CHALLENGE = new CodeChallenge("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM", "S256");

    @Test
    @DisplayName("Given an authorization request, when a code is issued, then it stores only the hash and the request")
    void should_store_only_the_hash_and_the_request_when_issued() {
        LinkSecret secret = LinkSecret.generate();

        AuthorizationCode code = issue(secret);

        assertThat(code.secretHash()).isEqualTo(secret.hash()).isNotEqualTo(secret.value());
        assertThat(code.donorId()).isEqualTo(DONOR);
        assertThat(code.clientId()).isEqualTo(CLIENT);
        assertThat(code.redirectUri()).isEqualTo(REDIRECT);
        assertThat(code.scopes()).containsExactly(OAuthScope.ADMIN_READ);
        assertThat(code.resource()).isEqualTo("http://localhost:4200/mcp");
        assertThat(code.expiresAt()).isEqualTo(NOW.plus(Duration.ofMinutes(5)));
        assertThat(code.usedAt()).isEmpty();
    }

    @Test
    @DisplayName("Given an issued code, when it is used, then it works once and only before it expires")
    void should_be_usable_once_and_only_before_it_expires() {
        AuthorizationCode code = issue(LinkSecret.generate());

        assertThat(code.isUsableAt(NOW.plus(Duration.ofMinutes(4)))).isTrue();
        assertThat(code.isUsableAt(NOW.plus(Duration.ofMinutes(5)))).isFalse();

        code.markUsed(NOW.plusSeconds(30));

        assertThat(code.usedAt()).contains(NOW.plusSeconds(30));
        assertThat(code.isUsableAt(NOW.plusSeconds(31))).isFalse();
    }

    @Test
    @DisplayName("Given an issued code, when it is exchanged, then only its client, redirect and verifier are accepted")
    void should_accept_the_exchange_only_with_its_client_redirect_and_verifier() {
        AuthorizationCode code = issue(LinkSecret.generate());

        assertThat(code.belongsTo(CLIENT, REDIRECT)).isTrue();
        assertThat(code.belongsTo(new ClientId("https://claude.ai/oauth/claude-code-client-metadata"), REDIRECT)).isFalse();
        assertThat(code.belongsTo(CLIENT, URI.create("https://claude.ai/other"))).isFalse();
        assertThat(code.verifies("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).isTrue();
        assertThat(code.verifies("wrong")).isFalse();
    }

    private static AuthorizationCode issue(LinkSecret secret) {
        return AuthorizationCode.issue(secret, DONOR, CLIENT, REDIRECT, CHALLENGE, Set.of(OAuthScope.ADMIN_READ), "http://localhost:4200/mcp",
                true, NOW, Duration.ofMinutes(5));
    }
}
