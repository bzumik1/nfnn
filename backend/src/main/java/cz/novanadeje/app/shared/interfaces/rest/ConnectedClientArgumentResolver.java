package cz.novanadeje.app.shared.interfaces.rest;

import cz.novanadeje.app.shared.application.administration.ConnectedClient;
import cz.novanadeje.app.shared.infrastructure.security.JwtProperties;
import org.springframework.core.MethodParameter;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.bind.support.WebDataBinderFactory;
import org.springframework.web.context.request.NativeWebRequest;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.method.support.ModelAndViewContainer;

import java.util.Optional;

final class ConnectedClientArgumentResolver implements HandlerMethodArgumentResolver {

    @Override
    public boolean supportsParameter(MethodParameter parameter) {
        return ConnectedClient.class.equals(parameter.getParameterType());
    }

    @Override
    public ConnectedClient resolveArgument(MethodParameter parameter, ModelAndViewContainer container, NativeWebRequest request,
                                           WebDataBinderFactory binders) {
        return new ConnectedClient(clientOf(SecurityContextHolder.getContext().getAuthentication()));
    }

    private static Optional<String> clientOf(Authentication authentication) {
        if (!(authentication instanceof JwtAuthenticationToken token)) {
            return Optional.empty();
        }
        return Optional.ofNullable(token.getToken().getClaimAsString(JwtProperties.CLIENT_CLAIM)).filter(client -> !client.isBlank());
    }
}
