package cz.novanadeje.app.shared.infrastructure.security;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.mock.web.MockHttpServletRequest;

import static org.assertj.core.api.Assertions.assertThat;

class SignInBearerTokenResolverTest {

    @ParameterizedTest(name = "{0} {1}")
    @CsvSource(textBlock = """
            POST, /api/donors/auth/refresh, false
            POST, /api/donors/auth/logout, false
            POST, /api/donors/auth/password-reset/request, false
            GET, /api/donors/auth/refresh, true
            POST, /api/donors/me/password, true
            GET, /api/donors/me/devices, true
            POST, /api/donors/oauth/token, true
            """)
    @DisplayName("Given a request carrying a bearer token, when its token is resolved, then a sign-in endpoint ignores it and every other endpoint reads it")
    void should_ignore_bearer_only_on_sign_in_endpoints_when_resolved_given_bearer(String method, String path, boolean read) {
        MockHttpServletRequest request = new MockHttpServletRequest(method, path);
        request.addHeader("Authorization", "Bearer header.payload.signature");

        assertThat(new SignInBearerTokenResolver().resolve(request)).isEqualTo(read ? "header.payload.signature" : null);
    }
}
