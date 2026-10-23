package cz.novanadeje.app.shared.infrastructure.security;

import org.springframework.security.authorization.AuthorizationDecision;
import org.springframework.security.authorization.AuthorizationManager;
import org.springframework.security.authorization.AuthorizationResult;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.security.web.access.intercept.RequestAuthorizationContext;

import java.util.Arrays;
import java.util.function.Supplier;

final class AdminWriteAuthorizationManager implements AuthorizationManager<RequestAuthorizationContext> {

    static final String WRITE_SCOPE = "admin:write";
    private static final String ADMIN_AUTHORITY = "ROLE_" + ApiSecurityConfiguration.ADMIN_ROLE;

    @Override
    public AuthorizationResult authorize(Supplier<? extends Authentication> authentication, RequestAuthorizationContext context) {
        Authentication authenticated = authentication.get();
        if (authenticated == null || !authenticated.isAuthenticated()) {
            return new AuthorizationDecision(false);
        }
        boolean administrator = authenticated.getAuthorities().stream().map(GrantedAuthority::getAuthority).anyMatch(ADMIN_AUTHORITY::equals);
        return new AuthorizationDecision(administrator && allowsWriting(authenticated));
    }

    static boolean allowsWriting(Authentication authentication) {
        if (!(authentication instanceof JwtAuthenticationToken token)) {
            return true;
        }
        Jwt jwt = token.getToken();
        String scope = jwt.getClaimAsString(JwtProperties.SCOPE_CLAIM);
        return scope == null || Arrays.asList(scope.trim().split("\\s+")).contains(WRITE_SCOPE);
    }
}
