package cz.novanadeje.app.shared.interfaces.rest;

import cz.novanadeje.app.shared.application.version.ExpectedVersion;
import cz.novanadeje.app.shared.infrastructure.security.JwtProperties;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.context.request.ServletWebRequest;

import java.time.Instant;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ExpectedVersionArgumentResolverTest {

    private final ExpectedVersionArgumentResolver resolver = new ExpectedVersionArgumentResolver();

    @AfterEach
    void forgetTheSession() {
        SecurityContextHolder.clearContext();
    }

    @Test
    @DisplayName("Given a browser session, when a write names no version, then it is refused as needing one")
    void should_require_a_version_when_resolved_given_a_browser_session_without_one() {
        signedIn(false);

        assertThatThrownBy(() -> resolve(null)).isInstanceOf(VersionRequiredException.class);
        assertThatThrownBy(() -> resolve("  ")).isInstanceOf(VersionRequiredException.class);
    }

    @Test
    @DisplayName("Given a connected application, when a write names no version, then it expects none")
    void should_expect_none_when_resolved_given_a_connection_without_one() {
        signedIn(true);

        assertThat(resolve(null)).isEqualTo(ExpectedVersion.none());
    }

    @Test
    @DisplayName("Given a quoted or bare version, when a write names it, then the version is expected without its quotes")
    void should_expect_the_version_when_resolved_given_a_quoted_or_bare_one() {
        signedIn(false);

        assertThat(resolve("\"0123456789abcdef\"").value()).isEqualTo(Optional.of("0123456789abcdef"));
        assertThat(resolve(" 0123456789abcdef ").value()).isEqualTo(Optional.of("0123456789abcdef"));
    }

    @Test
    @DisplayName("Given empty quotes or an over-long version, when a write names it, then it expects a version nothing matches")
    void should_expect_an_unmatchable_version_when_resolved_given_an_empty_or_long_one() {
        signedIn(true);

        assertThat(resolve("\"\"")).isEqualTo(ExpectedVersion.of(ExpectedVersion.UNMATCHABLE));
        assertThat(resolve("a".repeat(ExpectedVersion.MAX_LENGTH + 1))).isEqualTo(ExpectedVersion.of(ExpectedVersion.UNMATCHABLE));
    }

    private ExpectedVersion resolve(String ifMatch) {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/admin/donations/payments/x/unpair");
        if (ifMatch != null) {
            request.addHeader(HttpHeaders.IF_MATCH, ifMatch);
        }
        return resolver.resolveArgument(null, null, new ServletWebRequest(request), null);
    }

    private static void signedIn(boolean connection) {
        Jwt.Builder jwt = Jwt.withTokenValue("token").header("alg", "HS256").subject("admin").issuedAt(Instant.EPOCH).expiresAt(Instant.EPOCH.plusSeconds(60));
        if (connection) {
            jwt.claim(JwtProperties.SCOPE_CLAIM, "admin:write");
        }
        SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(jwt.build()));
    }
}
