package cz.novanadeje.app.donors.domain;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.net.URI;
import java.time.Duration;
import java.time.Instant;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

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
    void should_work_once_and_only_before_it_expires_when_used_given_an_issued_code() {
        AuthorizationCode code = issue(LinkSecret.generate());

        assertThat(code.isUsableAt(NOW.plus(Duration.ofMinutes(4)))).isTrue();
        assertThat(code.isUsableAt(NOW.plus(Duration.ofMinutes(5)))).isFalse();

        AuthorizationCode used = AuthorizationCode.reconstitute(code.id(), code.secretHash(), DONOR, CLIENT, REDIRECT, CHALLENGE, code.scopes(),
                code.resource(), true, NOW, code.expiresAt(), NOW.plusSeconds(30));

        assertThat(used.usedAt()).contains(NOW.plusSeconds(30));
        assertThat(used.isUsableAt(NOW.plusSeconds(31))).isFalse();
    }

    @Test
    @DisplayName("Given an issued code, when it is exchanged, then only its client, redirect and verifier are accepted")
    void should_accept_only_its_client_redirect_and_verifier_when_exchanged_given_an_issued_code() {
        AuthorizationCode code = issue(LinkSecret.generate());

        assertThat(code.belongsTo(CLIENT, REDIRECT)).isTrue();
        assertThat(code.belongsTo(new ClientId("https://claude.ai/oauth/claude-code-client-metadata"), REDIRECT)).isFalse();
        assertThat(code.belongsTo(CLIENT, URI.create("https://claude.ai/other"))).isFalse();
        assertThat(code.verifies("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).isTrue();
        assertThat(code.verifies("wrong")).isFalse();
    }

    @Nested
    @DisplayName("Given the parts of a stored code")
    class GivenStoredParts {

        private static final UUID ID = UUID.randomUUID();
        private static final String HASH = LinkSecret.generate().hash();
        private static final Set<OAuthScope> SCOPES = Set.of(OAuthScope.ADMIN_READ);
        private static final String RESOURCE = "http://localhost:4200/mcp";
        private static final Instant EXPIRES = NOW.plus(Duration.ofMinutes(5));

        @Test
        @DisplayName("when its id, its donor or its connected application is missing, then it is refused")
        void should_refuse_when_reconstituted_without_id_donor_or_client() {
            assertThatIllegalArgumentException().isThrownBy(() -> code(null, HASH, DONOR, CLIENT, REDIRECT, CHALLENGE, SCOPES, RESOURCE, NOW, EXPIRES));
            assertThatIllegalArgumentException().isThrownBy(() -> code(ID, HASH, null, CLIENT, REDIRECT, CHALLENGE, SCOPES, RESOURCE, NOW, EXPIRES));
            assertThatIllegalArgumentException().isThrownBy(() -> code(ID, HASH, DONOR, null, REDIRECT, CHALLENGE, SCOPES, RESOURCE, NOW, EXPIRES));
        }

        @Test
        @DisplayName("when its secret's hash is missing or blank, then it is refused")
        void should_refuse_when_reconstituted_without_hash() {
            assertThatIllegalArgumentException().isThrownBy(() -> code(ID, null, DONOR, CLIENT, REDIRECT, CHALLENGE, SCOPES, RESOURCE, NOW, EXPIRES));
            assertThatIllegalArgumentException().isThrownBy(() -> code(ID, " ", DONOR, CLIENT, REDIRECT, CHALLENGE, SCOPES, RESOURCE, NOW, EXPIRES));
        }

        @Test
        @DisplayName("when its redirect, challenge or resource is missing, then it is refused")
        void should_refuse_when_reconstituted_without_its_request() {
            assertThatIllegalArgumentException().isThrownBy(() -> code(ID, HASH, DONOR, CLIENT, null, CHALLENGE, SCOPES, RESOURCE, NOW, EXPIRES));
            assertThatIllegalArgumentException().isThrownBy(() -> code(ID, HASH, DONOR, CLIENT, REDIRECT, null, SCOPES, RESOURCE, NOW, EXPIRES));
            assertThatIllegalArgumentException().isThrownBy(() -> code(ID, HASH, DONOR, CLIENT, REDIRECT, CHALLENGE, SCOPES, null, NOW, EXPIRES));
        }

        @Test
        @DisplayName("when its issue or expiry time is missing, then it is refused")
        void should_refuse_when_reconstituted_without_a_time() {
            assertThatIllegalArgumentException().isThrownBy(() -> code(ID, HASH, DONOR, CLIENT, REDIRECT, CHALLENGE, SCOPES, RESOURCE, null, EXPIRES));
            assertThatIllegalArgumentException().isThrownBy(() -> code(ID, HASH, DONOR, CLIENT, REDIRECT, CHALLENGE, SCOPES, RESOURCE, NOW, null));
        }

        @Test
        @DisplayName("when it expires at its issue or before it, then it is refused")
        void should_refuse_when_reconstituted_expiring_at_or_before_its_issue() {
            assertThatIllegalArgumentException().isThrownBy(() -> code(ID, HASH, DONOR, CLIENT, REDIRECT, CHALLENGE, SCOPES, RESOURCE, NOW, NOW));
            assertThatIllegalArgumentException().isThrownBy(() -> code(ID, HASH, DONOR, CLIENT, REDIRECT, CHALLENGE, SCOPES, RESOURCE, NOW,
                    NOW.minusSeconds(1)));
        }

        @Test
        @DisplayName("when it grants no scope, then it is refused")
        void should_refuse_when_reconstituted_without_scope() {
            assertThatIllegalArgumentException().isThrownBy(() -> code(ID, HASH, DONOR, CLIENT, REDIRECT, CHALLENGE, Set.of(), RESOURCE, NOW, EXPIRES));
        }

        private static AuthorizationCode code(UUID id, String hash, DonorId donor, ClientId client, URI redirect, CodeChallenge challenge,
                                              Set<OAuthScope> scopes, String resource, Instant issued, Instant expires) {
            return AuthorizationCode.reconstitute(id, hash, donor, client, redirect, challenge, scopes, resource, true, issued, expires, null);
        }
    }

    private static AuthorizationCode issue(LinkSecret secret) {
        return AuthorizationCode.issue(secret, DONOR, CLIENT, REDIRECT, CHALLENGE, Set.of(OAuthScope.ADMIN_READ), "http://localhost:4200/mcp",
                true, NOW, Duration.ofMinutes(5));
    }
}
