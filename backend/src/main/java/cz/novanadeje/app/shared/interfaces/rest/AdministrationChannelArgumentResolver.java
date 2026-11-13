package cz.novanadeje.app.shared.interfaces.rest;

import cz.novanadeje.app.shared.application.administration.AdministrationChannel;
import cz.novanadeje.app.shared.infrastructure.security.JwtProperties;
import org.springframework.core.MethodParameter;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.bind.support.WebDataBinderFactory;
import org.springframework.web.context.request.NativeWebRequest;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.method.support.ModelAndViewContainer;

final class AdministrationChannelArgumentResolver implements HandlerMethodArgumentResolver {

    @Override
    public boolean supportsParameter(MethodParameter parameter) {
        return AdministrationChannel.class.equals(parameter.getParameterType());
    }

    @Override
    public AdministrationChannel resolveArgument(MethodParameter parameter, ModelAndViewContainer container, NativeWebRequest request,
                                                 WebDataBinderFactory binders) {
        return channelOf(SecurityContextHolder.getContext().getAuthentication());
    }

    static AdministrationChannel channelOf(Authentication authentication) {
        boolean connected = authentication instanceof JwtAuthenticationToken token && token.getToken().getClaimAsString(JwtProperties.SCOPE_CLAIM) != null;
        return connected ? AdministrationChannel.CONNECTED_APPLICATION : AdministrationChannel.BROWSER;
    }
}
