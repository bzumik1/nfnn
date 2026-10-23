package cz.novanadeje.app.shared.infrastructure.security;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.security.web.access.intercept.RequestAuthorizationContext;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class BrowserSessionAuthorizationManagerTest {

    private final BrowserSessionAuthorizationManager manager = new BrowserSessionAuthorizationManager();
    private final RequestAuthorizationContext context = new RequestAuthorizationContext(new MockHttpServletRequest("POST", "/api/donors/oauth/authorize"));

    @Test
    @DisplayName("Given a browser session's token without a scope claim, when a request is checked, then it is allowed")
    void should_allow_when_checked_given_browser_token() {
        assertThat(manager.authorize(() -> jwt(Map.of(), "ROLE_ADMIN", "ROLE_DONOR"), context).isGranted()).isTrue();
    }

    @Test
    @DisplayName("Given an API token exchanged for a connected application, when a request is checked, then it is refused whatever the scope")
    void should_refuse_when_checked_given_token_with_scope_claim() {
        assertThat(manager.authorize(() -> jwt(Map.of("scope", "admin:read admin:write"), "ROLE_ADMIN"), context).isGranted()).isFalse();
    }

    @Test
    @DisplayName("Given an authentication that is no JWT, when a request is checked, then it is allowed")
    void should_allow_when_checked_given_authentication_without_jwt() {
        TestingAuthenticationToken authenticated = new TestingAuthenticationToken("donor", null, "ROLE_DONOR");
        assertThat(manager.authorize(() -> authenticated, context).isGranted()).isTrue();
    }

    @Test
    @DisplayName("Given no authentication, when a request is checked, then it is refused")
    void should_refuse_when_checked_given_nobody() {
        TestingAuthenticationToken anonymous = new TestingAuthenticationToken("anonymous", null);
        anonymous.setAuthenticated(false);
        assertThat(manager.authorize(() -> anonymous, context).isGranted()).isFalse();
    }

    @Test
    @DisplayName("Given an anonymous visitor, when a request is checked, then it is refused")
    void should_refuse_when_checked_given_anonymous_visitor() {
        Authentication anonymous = new AnonymousAuthenticationToken("key", "anonymousUser", List.of(new SimpleGrantedAuthority("ROLE_ANONYMOUS")));
        assertThat(manager.authorize(() -> anonymous, context).isGranted()).isFalse();
    }

    private static Authentication jwt(Map<String, Object> extraClaims, String... authorities) {
        Jwt.Builder jwt = Jwt.withTokenValue("token").header("alg", "HS256").subject("donor").issuedAt(Instant.EPOCH)
                .expiresAt(Instant.EPOCH.plusSeconds(900));
        extraClaims.forEach(jwt::claim);
        return new JwtAuthenticationToken(jwt.build(), List.of(authorities).stream().map(SimpleGrantedAuthority::new).toList());
    }
}
