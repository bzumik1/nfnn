package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.AdministratorRequired;
import cz.novanadeje.app.donors.domain.AuthorizationCode;
import cz.novanadeje.app.donors.domain.AuthorizationCodeRepository;
import cz.novanadeje.app.donors.domain.ClientId;
import cz.novanadeje.app.donors.domain.ClientMetadata;
import cz.novanadeje.app.donors.domain.CodeChallenge;
import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.DonorRepository;
import cz.novanadeje.app.donors.domain.InvalidAuthorizationRequest;
import cz.novanadeje.app.donors.domain.InvalidClient;
import cz.novanadeje.app.donors.domain.InvalidGrant;
import cz.novanadeje.app.donors.domain.InvalidTarget;
import cz.novanadeje.app.donors.domain.LinkSecret;
import cz.novanadeje.app.donors.domain.OAuthScope;
import cz.novanadeje.app.donors.domain.PasswordHash;
import cz.novanadeje.app.donors.domain.RefreshToken;
import cz.novanadeje.app.donors.domain.RefreshTokenRepository;
import cz.novanadeje.app.donors.domain.RefreshTokenSecret;
import cz.novanadeje.app.donors.domain.Role;
import cz.novanadeje.app.shared.domain.DonorType;
import cz.novanadeje.app.shared.domain.EmailAddress;
import cz.novanadeje.app.shared.domain.LocaleCode;
import cz.novanadeje.app.shared.domain.PostalAddress;
import cz.novanadeje.app.shared.domain.VariableSymbol;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.net.URI;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AuthorizationServerServiceTest {

    private static final Instant NOW = Instant.parse("2026-10-23T10:00:00Z");
    private static final DonorId DONOR = DonorId.newId(NOW);
    private static final ClientId CLAUDE = new ClientId("https://claude.ai/.well-known/oauth-client");
    private static final URI CALLBACK = URI.create("https://claude.ai/api/mcp/auth_callback");
    private static final String VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    private static final String CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
    private static final String ISSUER = "https://nfnn.cz";
    private static final String MCP = ISSUER + "/mcp";
    private static final String API = ISSUER + "/api";
    private static final Duration REFRESH_TTL = Duration.ofDays(14);

    @Mock
    private ClientMetadataSource clients;
    @Mock
    private AuthorizationCodeRepository codes;
    @Mock
    private RefreshTokenRepository refreshTokens;
    @Mock
    private DonorRepository donors;
    @Mock
    private AccessTokenIssuer accessTokens;
    @Mock
    private AccessTokenVerifier verifier;

    private AuthorizationServerService service;

    @BeforeEach
    void setUp() {
        service = new AuthorizationServerService(clients, codes, refreshTokens, donors, accessTokens, verifier,
                new OAuthProperties(ISSUER, "/pripojeni", Duration.ofMinutes(5), MCP, API), new DonorSessionProperties(REFRESH_TTL),
                Clock.fixed(NOW, ZoneOffset.UTC));
    }

    @Nested
    @DisplayName("Given Claude's metadata document lists its callback")
    class GivenClaudeIsKnown {

        @BeforeEach
        void claudeIsKnown() {
            when(clients.fetch(CLAUDE)).thenReturn(new ClientMetadata(CLAUDE, "Claude", List.of(CALLBACK)));
        }

        @Test
        @DisplayName("when the client is described, then its host, name and remoteness are returned")
        void should_describe_client_when_asked_given_registered_redirect() {
            ClientDescription description = service.describeClient(CLAUDE.value(), CALLBACK.toString());

            assertThat(description).isEqualTo(new ClientDescription("claude.ai", "Claude", false));
        }

        @Test
        @DisplayName("when an unregistered redirect is asked about, then the client is invalid")
        void should_refuse_when_described_given_unregistered_redirect() {
            assertThatThrownBy(() -> service.describeClient(CLAUDE.value(), "https://evil.example/callback")).isInstanceOf(InvalidClient.class);
        }

        @Test
        @DisplayName("when an administrator approves, then a hashed single-use code is stored and the redirect carries code, state and iss")
        void should_store_code_and_redirect_when_approved_given_administrator() {
            URI redirect = service.decide(decision("admin:read admin:write", MCP, CHALLENGE, true), DONOR, Set.of(Role.DONOR, Role.ADMIN));

            ArgumentCaptor<AuthorizationCode> stored = ArgumentCaptor.forClass(AuthorizationCode.class);
            verify(codes).save(stored.capture());
            String code = query(redirect, "code");
            assertThat(redirect.toString()).startsWith(CALLBACK + "?");
            assertThat(query(redirect, "state")).isEqualTo("xyz");
            assertThat(query(redirect, "iss")).isEqualTo(ISSUER);
            assertThat(stored.getValue().secretHash()).isEqualTo(new LinkSecret(code).hash());
            assertThat(stored.getValue().scopes()).containsExactlyInAnyOrder(OAuthScope.ADMIN_READ, OAuthScope.ADMIN_WRITE);
            assertThat(stored.getValue().expiresAt()).isEqualTo(NOW.plus(Duration.ofMinutes(5)));
            assertThat(stored.getValue().resource()).isEqualTo(MCP);
            assertThat(stored.getValue().redirectUri()).isEqualTo(CALLBACK);
        }

        @Test
        @DisplayName("when a plain donor approves, then the administrator role is required and nothing is stored")
        void should_require_administrator_when_approved_given_plain_donor() {
            assertThatThrownBy(() -> service.decide(decision("admin:read", MCP, CHALLENGE, true), DONOR, Set.of(Role.DONOR)))
                    .isInstanceOf(AdministratorRequired.class);
            verify(codes, never()).save(any());
        }

        @Test
        @DisplayName("when the administrator declines, then the redirect carries access_denied and no code is stored")
        void should_redirect_with_access_denied_when_declined() {
            URI redirect = service.decide(decision("admin:read", MCP, CHALLENGE, false), DONOR, Set.of(Role.DONOR));

            assertThat(query(redirect, "error")).isEqualTo("access_denied");
            assertThat(query(redirect, "state")).isEqualTo("xyz");
            assertThat(redirect.getQuery()).doesNotContain("code=");
            verify(codes, never()).save(any());
        }

        @Test
        @DisplayName("when the resource is another server or the challenge is missing, then the request is invalid")
        void should_refuse_when_approved_given_wrong_resource_or_missing_challenge() {
            assertThatThrownBy(() -> service.decide(decision("admin:read", "https://elsewhere.example/mcp", CHALLENGE, true), DONOR, Set.of(Role.ADMIN)))
                    .isInstanceOf(InvalidAuthorizationRequest.class);
            assertThatThrownBy(() -> service.decide(decision("admin:read", MCP, null, true), DONOR, Set.of(Role.ADMIN)))
                    .isInstanceOf(InvalidAuthorizationRequest.class);
        }
    }

    @Nested
    @DisplayName("Given an issued code of an administrator")
    class GivenIssuedCode {

        private final LinkSecret secret = LinkSecret.generate();
        private AuthorizationCode code;

        @BeforeEach
        void codeIsIssued() {
            code = AuthorizationCode.issue(secret, DONOR, CLAUDE, CALLBACK, new CodeChallenge(CHALLENGE, "S256"), Set.of(OAuthScope.ADMIN_READ), MCP,
                    true, NOW.minusSeconds(60), Duration.ofMinutes(5));
            when(codes.findBySecretHash(secret.hash())).thenReturn(Optional.of(code));
            when(codes.markUsed(code.id(), NOW)).thenReturn(true);
        }

        @Test
        @DisplayName("when the code is exchanged with its verifier, then connector tokens are issued and the code is used up")
        void should_issue_tokens_when_exchanged_given_right_verifier() {
            when(donors.findById(DONOR)).thenReturn(Optional.of(administrator()));
            when(accessTokens.issue(any(AccessTokenGrant.class))).thenReturn(new IssuedAccessToken("connector", NOW.plusSeconds(900)));

            OAuthTokens tokens = service.exchangeCode(new CodeExchange(secret.value(), CLAUDE.value(), CALLBACK.toString(), VERIFIER, MCP));

            ArgumentCaptor<AccessTokenGrant> grant = ArgumentCaptor.forClass(AccessTokenGrant.class);
            verify(accessTokens).issue(grant.capture());
            assertThat(grant.getValue().audience()).isEqualTo(MCP);
            assertThat(grant.getValue().roles()).contains(Role.ADMIN);
            assertThat(grant.getValue().scopes()).containsExactly(OAuthScope.ADMIN_READ);
            assertThat(grant.getValue().connectedClient()).contains("claude.ai");
            ArgumentCaptor<RefreshToken> stored = ArgumentCaptor.forClass(RefreshToken.class);
            verify(refreshTokens).save(stored.capture());
            assertThat(stored.getValue().clientId()).contains(CLAUDE);
            assertThat(stored.getValue().secretHash()).isEqualTo(RefreshTokenSecret.fromValue(tokens.refreshToken()).hash());
            assertThat(stored.getValue().grantedAt()).isEqualTo(NOW);
            assertThat(tokens.accessToken()).isEqualTo("connector");
            verify(codes).markUsed(code.id(), NOW);
        }

        @Test
        @DisplayName("when another request spends the code at the same moment, then the grant is invalid and no tokens are issued")
        void should_refuse_when_exchanged_given_code_spent_concurrently() {
            when(codes.markUsed(code.id(), NOW)).thenReturn(false);

            assertThatThrownBy(() -> service.exchangeCode(new CodeExchange(secret.value(), CLAUDE.value(), CALLBACK.toString(), VERIFIER, MCP)))
                    .isInstanceOf(InvalidGrant.class);

            verify(accessTokens, never()).issue(any(AccessTokenGrant.class));
            verify(refreshTokens, never()).save(any());
        }

        @Test
        @DisplayName("when the verifier is wrong, then the grant is invalid and the code is still used up")
        void should_refuse_and_use_up_code_when_exchanged_given_wrong_verifier() {
            assertThatThrownBy(() -> service.exchangeCode(new CodeExchange(secret.value(), CLAUDE.value(), CALLBACK.toString(), "wrong", MCP)))
                    .isInstanceOf(InvalidGrant.class);

            verify(codes).markUsed(code.id(), NOW);
            verify(refreshTokens, never()).save(any());
        }

        @Test
        @DisplayName("when another client or redirect presents the code, then the grant is invalid")
        void should_refuse_when_exchanged_given_other_client_or_redirect() {
            assertThatThrownBy(() -> service.exchangeCode(new CodeExchange(secret.value(), "https://claude.ai/oauth/claude-code-client-metadata",
                    CALLBACK.toString(), VERIFIER, MCP))).isInstanceOf(InvalidGrant.class);
        }

        @Test
        @DisplayName("when the code names another resource, then the target is invalid")
        void should_refuse_when_exchanged_given_other_resource() {
            assertThatThrownBy(() -> service.exchangeCode(new CodeExchange(secret.value(), CLAUDE.value(), CALLBACK.toString(), VERIFIER,
                    "https://elsewhere.example/mcp"))).isInstanceOf(InvalidTarget.class);
        }
    }

    @Nested
    @DisplayName("Given a connector refresh token")
    class GivenConnectorRefreshToken {

        private final RefreshTokenSecret secret = RefreshTokenSecret.generate();
        private RefreshToken token;

        @BeforeEach
        void tokenIsIssued() {
            token = RefreshToken.issueForClient(secret, DONOR, CLAUDE, Set.of(OAuthScope.ADMIN_READ), NOW.minus(Duration.ofDays(2)),
                    NOW.minus(Duration.ofHours(1)), REFRESH_TTL);
            when(refreshTokens.findBySecretHash(secret.hash())).thenReturn(Optional.of(token));
        }

        @Test
        @DisplayName("when the client refreshes, then the token rotates, keeps the grant date and the old one is used up")
        void should_rotate_when_refreshed_given_right_client() {
            when(donors.findById(DONOR)).thenReturn(Optional.of(administrator()));
            when(accessTokens.issue(any(AccessTokenGrant.class))).thenReturn(new IssuedAccessToken("connector", NOW.plusSeconds(900)));
            when(refreshTokens.markUsed(token.id(), NOW)).thenReturn(true);

            OAuthTokens tokens = service.refresh(secret.value(), CLAUDE.value());

            verify(refreshTokens).markUsed(token.id(), NOW);
            verify(refreshTokens, never()).revokeAllOf(any(), any());
            ArgumentCaptor<RefreshToken> saved = ArgumentCaptor.forClass(RefreshToken.class);
            verify(refreshTokens).save(saved.capture());
            RefreshToken rotated = saved.getValue();
            assertThat(rotated.secretHash()).isEqualTo(RefreshTokenSecret.fromValue(tokens.refreshToken()).hash());
            assertThat(rotated.grantedAt()).isEqualTo(NOW.minus(Duration.ofDays(2)));
            assertThat(rotated.clientId()).contains(CLAUDE);
            assertThat(tokens.scopes()).containsExactly(OAuthScope.ADMIN_READ);
        }

        @Test
        @DisplayName("when the same token is presented twice at once, then the second presentation ends every session of the donor")
        void should_end_every_session_when_refreshed_given_token_used_concurrently() {
            when(donors.findById(DONOR)).thenReturn(Optional.of(administrator()));
            when(refreshTokens.markUsed(token.id(), NOW)).thenReturn(false);

            assertThatThrownBy(() -> service.refresh(secret.value(), CLAUDE.value())).isInstanceOf(InvalidGrant.class);

            verify(refreshTokens).revokeAllOf(DONOR, NOW);
            verify(accessTokens, never()).issue(any(AccessTokenGrant.class));
        }

        @Test
        @DisplayName("when another client presents the token, then the grant is invalid")
        void should_refuse_when_refreshed_given_other_client() {
            assertThatThrownBy(() -> service.refresh(secret.value(), "https://claude.ai/oauth/claude-code-client-metadata"))
                    .isInstanceOf(InvalidGrant.class);
        }

        @Test
        @DisplayName("when a used token is replayed, then every session of the donor ends")
        void should_end_every_session_when_refreshed_given_used_token() {
            token.markUsed(NOW.minusSeconds(10));

            assertThatThrownBy(() -> service.refresh(secret.value(), CLAUDE.value())).isInstanceOf(InvalidGrant.class);

            verify(refreshTokens).revokeAllOf(DONOR, NOW);
        }

        @Test
        @DisplayName("when a disconnected token is presented, then the grant is invalid and no other session ends")
        void should_refuse_without_ending_other_sessions_when_refreshed_given_revoked_token() {
            token.revoke(NOW.minusSeconds(10));

            assertThatThrownBy(() -> service.refresh(secret.value(), CLAUDE.value())).isInstanceOf(InvalidGrant.class);

            verify(refreshTokens, never()).revokeAllOf(any(), any());
        }

        @Test
        @DisplayName("when the donor is no administrator any more, then the token is revoked and the grant is invalid")
        void should_end_connection_when_refreshed_given_role_lost() {
            Donor donor = administrator();
            donor.revokeAdministration();
            when(donors.findById(DONOR)).thenReturn(Optional.of(donor));

            assertThatThrownBy(() -> service.refresh(secret.value(), CLAUDE.value())).isInstanceOf(InvalidGrant.class);

            assertThat(token.isRevoked()).isTrue();
            verify(accessTokens, never()).issue(any(AccessTokenGrant.class));
        }
    }

    @Nested
    @DisplayName("Given the connector presents a connector token")
    class GivenConnectorToken {

        @Test
        @DisplayName("when it is exchanged for the API, then an API token with the donor's current roles, the same scopes and the same client expires with the subject")
        void should_issue_api_token_when_exchanged_given_connector_token() {
            Instant subjectExpiry = NOW.plusSeconds(300);
            when(verifier.verify("connector")).thenReturn(new VerifiedAccessToken(DONOR, Set.of(Role.DONOR, Role.ADMIN), Set.of(MCP),
                    Set.of(OAuthScope.ADMIN_READ), subjectExpiry, "claude.ai"));
            when(donors.findById(DONOR)).thenReturn(Optional.of(administrator()));
            when(accessTokens.issue(any(AccessTokenGrant.class))).thenReturn(new IssuedAccessToken("api", subjectExpiry));

            ExchangedAccessToken exchanged = service.exchangeToken("connector", API);

            ArgumentCaptor<AccessTokenGrant> grant = ArgumentCaptor.forClass(AccessTokenGrant.class);
            verify(accessTokens).issue(grant.capture());
            assertThat(grant.getValue()).isEqualTo(new AccessTokenGrant(DONOR, Set.of(Role.DONOR, Role.ADMIN), API, Set.of(OAuthScope.ADMIN_READ), NOW,
                    subjectExpiry, "claude.ai"));
            assertThat(exchanged).isEqualTo(new ExchangedAccessToken("api", subjectExpiry, Set.of(OAuthScope.ADMIN_READ)));
        }

        @Test
        @DisplayName("when a browser or API token is presented as the subject, then the grant is invalid")
        void should_refuse_when_exchanged_given_api_token() {
            when(verifier.verify("browser")).thenReturn(new VerifiedAccessToken(DONOR, Set.of(Role.DONOR, Role.ADMIN), Set.of(API), Set.of(),
                    NOW.plusSeconds(300), null));

            assertThatThrownBy(() -> service.exchangeToken("browser", API)).isInstanceOf(InvalidGrant.class);
        }

        @Test
        @DisplayName("when another resource is asked for, then the target is invalid before the token is looked at")
        void should_refuse_when_exchanged_given_other_resource() {
            assertThatThrownBy(() -> service.exchangeToken("connector", "https://elsewhere.example/api")).isInstanceOf(InvalidTarget.class);
            verify(verifier, never()).verify(any());
        }
    }

    @Test
    @DisplayName("Given no such code, when an unknown or malformed code is exchanged, then the grant is invalid")
    void should_refuse_when_exchanged_given_unknown_code() {
        when(codes.findBySecretHash(any())).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.exchangeCode(new CodeExchange("not-a-code", CLAUDE.value(), CALLBACK.toString(), VERIFIER, MCP)))
                .isInstanceOf(InvalidGrant.class);
        assertThatThrownBy(() -> service.exchangeCode(new CodeExchange(LinkSecret.generate().value(), CLAUDE.value(), CALLBACK.toString(), VERIFIER, MCP)))
                .isInstanceOf(InvalidGrant.class);
        verify(codes, never()).save(any());
    }

    private static AuthorizationDecision decision(String scope, String resource, String challenge, boolean approved) {
        return new AuthorizationDecision(CLAUDE.value(), CALLBACK.toString(), "code", challenge, challenge == null ? null : "S256", scope, resource,
                "xyz", approved);
    }

    private static String query(URI uri, String name) {
        for (String pair : uri.getRawQuery().split("&")) {
            String[] parts = pair.split("=", 2);
            if (parts[0].equals(name)) {
                return java.net.URLDecoder.decode(parts[1], java.nio.charset.StandardCharsets.UTF_8);
            }
        }
        return null;
    }

    private static Donor administrator() {
        Donor donor = Donor.register(DONOR, DonorType.PERSON, "Jana Nováková", null, new PostalAddress("Dlouhá 12", "Ústí nad Labem", "400 01"),
                new EmailAddress("jana@example.cz"), new PasswordHash("$hash"), new VariableSymbol("1234567890"), LocaleCode.CS, NOW);
        donor.grantAdministration();
        return donor;
    }
}
