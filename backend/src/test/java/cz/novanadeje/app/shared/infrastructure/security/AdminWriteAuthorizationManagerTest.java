package cz.novanadeje.app.shared.infrastructure.security;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.security.web.access.intercept.RequestAuthorizationContext;
import org.springframework.mock.web.MockHttpServletRequest;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class AdminWriteAuthorizationManagerTest {

    private final AdminWriteAuthorizationManager manager = new AdminWriteAuthorizationManager();
    private final RequestAuthorizationContext context = new RequestAuthorizationContext(new MockHttpServletRequest("DELETE", "/api/admin/donors/x"));

    @Test
    @DisplayName("Given an administrator's browser token without a scope claim, when a write is checked, then it is allowed")
    void should_allow_when_checked_given_browser_token_of_administrator() {
        assertThat(manager.authorize(() -> jwt(Map.of(), "ROLE_ADMIN", "ROLE_DONOR"), context).isGranted()).isTrue();
    }

    @Test
    @DisplayName("Given an API token exchanged from a connection with the writing permission, when a write is checked, then it is allowed")
    void should_allow_when_checked_given_token_with_write_scope() {
        assertThat(manager.authorize(() -> jwt(Map.of("scope", "admin:read admin:write"), "ROLE_ADMIN"), context).isGranted()).isTrue();
    }

    @Test
    @DisplayName("Given an API token with the reading permission only, when a write is checked, then it is refused")
    void should_refuse_when_checked_given_token_with_read_scope_only() {
        assertThat(manager.authorize(() -> jwt(Map.of("scope", "admin:read"), "ROLE_ADMIN"), context).isGranted()).isFalse();
    }

    @Test
    @DisplayName("Given a donor without the administrator role, when a write is checked, then it is refused whatever the scope")
    void should_refuse_when_checked_given_no_administrator_role() {
        assertThat(manager.authorize(() -> jwt(Map.of("scope", "admin:read admin:write"), "ROLE_DONOR"), context).isGranted()).isFalse();
    }

    @Test
    @DisplayName("Given no authentication, when a write is checked, then it is refused")
    void should_refuse_when_checked_given_nobody() {
        TestingAuthenticationToken anonymous = new TestingAuthenticationToken("anonymous", null);
        anonymous.setAuthenticated(false);
        assertThat(manager.authorize(() -> anonymous, context).isGranted()).isFalse();
    }

    private static Authentication jwt(Map<String, Object> extraClaims, String... authorities) {
        Jwt.Builder jwt = Jwt.withTokenValue("token").header("alg", "HS256").subject("donor").issuedAt(Instant.EPOCH)
                .expiresAt(Instant.EPOCH.plusSeconds(900));
        extraClaims.forEach(jwt::claim);
        return new JwtAuthenticationToken(jwt.build(), List.of(authorities).stream().map(SimpleGrantedAuthority::new).toList());
    }
}
