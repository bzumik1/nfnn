package cz.novanadeje.app.shared.interfaces.rest;

import cz.novanadeje.app.shared.application.session.CurrentDevice;
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
import java.util.UUID;
import java.util.regex.Pattern;

final class CurrentDeviceArgumentResolver implements HandlerMethodArgumentResolver {

    private static final Pattern DEVICE_ID = Pattern.compile("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}");

    @Override
    public boolean supportsParameter(MethodParameter parameter) {
        return CurrentDevice.class.equals(parameter.getParameterType());
    }

    @Override
    public CurrentDevice resolveArgument(MethodParameter parameter, ModelAndViewContainer container, NativeWebRequest request,
                                         WebDataBinderFactory binders) {
        return new CurrentDevice(sessionOf(SecurityContextHolder.getContext().getAuthentication()));
    }

    private static Optional<UUID> sessionOf(Authentication authentication) {
        if (!(authentication instanceof JwtAuthenticationToken token)) {
            return Optional.empty();
        }
        return Optional.ofNullable(token.getToken().getClaimAsString(JwtProperties.SESSION_CLAIM))
                .filter(session -> DEVICE_ID.matcher(session).matches())
                .map(UUID::fromString);
    }
}
