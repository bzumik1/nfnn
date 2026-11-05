package cz.novanadeje.app.shared.infrastructure.security;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpMethod;
import org.springframework.security.oauth2.server.resource.web.BearerTokenResolver;
import org.springframework.security.oauth2.server.resource.web.DefaultBearerTokenResolver;

final class SignInBearerTokenResolver implements BearerTokenResolver {

    static final String SIGN_IN_PATHS = "/api/donors/auth/";

    private final BearerTokenResolver bearer = new DefaultBearerTokenResolver();

    @Override
    public String resolve(HttpServletRequest request) {
        return bearer.resolve(request);
    }
}
