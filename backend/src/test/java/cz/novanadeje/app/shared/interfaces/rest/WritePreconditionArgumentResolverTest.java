package cz.novanadeje.app.shared.interfaces.rest;

import cz.novanadeje.app.shared.application.version.ExpectedVersion;
import cz.novanadeje.app.shared.application.version.WritePrecondition;
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

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class WritePreconditionArgumentResolverTest {

    private final WritePreconditionArgumentResolver resolver = new WritePreconditionArgumentResolver();

    @AfterEach
    void forgetTheSession() {
        SecurityContextHolder.clearContext();
    }

    @Test
    @DisplayName("Given a browser session, when a write names neither header, then it is refused as needing a version")
    void should_require_a_version_when_resolved_given_a_browser_session_without_either_header() {
        signedIn(false);

        assertThatThrownBy(() -> resolve(null, null)).isInstanceOf(VersionRequiredException.class);
        assertThatThrownBy(() -> resolve("  ", " ")).isInstanceOf(VersionRequiredException.class);
    }

    @Test
    @DisplayName("Given a connected application, when a write names neither header, then it admits anything")
    void should_admit_anything_when_resolved_given_a_connection_without_either_header() {
        signedIn(true);

        assertThat(resolve(null, null)).isEqualTo(WritePrecondition.anything());
    }

    @Test
    @DisplayName("Given a quoted or bare If-Match, when a write names it, then the version is matched without its quotes, whatever If-None-Match says")
    void should_match_the_version_when_resolved_given_an_if_match() {
        signedIn(false);

        assertThat(resolve("\"0123456789abcdef\"", null)).isEqualTo(WritePrecondition.matching(ExpectedVersion.of("0123456789abcdef")));
        assertThat(resolve(" 0123456789abcdef ", "*")).isEqualTo(WritePrecondition.matching(ExpectedVersion.of("0123456789abcdef")));
    }

    @Test
    @DisplayName("Given empty quotes or an over-long If-Match, when a write names it, then it matches a version nothing matches")
    void should_match_an_unmatchable_version_when_resolved_given_an_empty_or_long_if_match() {
        signedIn(true);

        assertThat(resolve("\"\"", null)).isEqualTo(WritePrecondition.matching(ExpectedVersion.of(ExpectedVersion.UNMATCHABLE)));
        assertThat(resolve("a".repeat(ExpectedVersion.MAX_LENGTH + 1), null))
                .isEqualTo(WritePrecondition.matching(ExpectedVersion.of(ExpectedVersion.UNMATCHABLE)));
    }

    @Test
    @DisplayName("Given If-None-Match with an asterisk, when a write names it, then the record must be absent")
    void should_require_absence_when_resolved_given_if_none_match_any() {
        signedIn(false);

        assertThat(resolve(null, " * ")).isEqualTo(WritePrecondition.absent());
    }

    @Test
    @DisplayName("Given If-None-Match with a version, when a browser or a connection names it, then it is refused as needing a version")
    void should_require_a_version_when_resolved_given_if_none_match_with_a_version() {
        signedIn(false);
        assertThatThrownBy(() -> resolve(null, "0123456789abcdef")).isInstanceOf(VersionRequiredException.class);

        signedIn(true);
        assertThatThrownBy(() -> resolve(null, "\"0123456789abcdef\"")).isInstanceOf(VersionRequiredException.class);
    }

    private WritePrecondition resolve(String ifMatch, String ifNoneMatch) {
        MockHttpServletRequest request = new MockHttpServletRequest("PUT", "/api/admin/donations/bank-logos/0800");
        if (ifMatch != null) {
            request.addHeader(HttpHeaders.IF_MATCH, ifMatch);
        }
        if (ifNoneMatch != null) {
            request.addHeader(HttpHeaders.IF_NONE_MATCH, ifNoneMatch);
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
