package cz.novanadeje.app.shared.infrastructure.security;

import org.springframework.security.authorization.AuthorizationDecision;
import org.springframework.security.authorization.AuthorizationManager;
import org.springframework.security.authentication.AuthenticationTrustResolver;
import org.springframework.security.authentication.AuthenticationTrustResolverImpl;
import org.springframework.security.authorization.AuthorizationResult;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.security.web.access.intercept.RequestAuthorizationContext;

import java.util.function.Supplier;

final class BrowserSessionAuthorizationManager implements AuthorizationManager<RequestAuthorizationContext> {

    private final AuthenticationTrustResolver trustResolver = new AuthenticationTrustResolverImpl();

    @Override
    public AuthorizationResult authorize(Supplier<? extends Authentication> authentication, RequestAuthorizationContext context) {
        Authentication authenticated = authentication.get();
        if (!trustResolver.isAuthenticated(authenticated)) {
            return new AuthorizationDecision(false);
        }
        return new AuthorizationDecision(isBrowserSession(authenticated));
    }

    static boolean isBrowserSession(Authentication authentication) {
        if (!(authentication instanceof JwtAuthenticationToken token)) {
            return true;
        }
        return token.getToken().getClaimAsString(JwtProperties.SCOPE_CLAIM) == null;
    }
}
