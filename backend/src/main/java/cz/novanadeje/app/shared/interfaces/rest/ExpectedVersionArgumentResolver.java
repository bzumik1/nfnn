package cz.novanadeje.app.shared.interfaces.rest;

import cz.novanadeje.app.shared.application.version.ExpectedVersion;
import org.springframework.core.MethodParameter;
import org.springframework.http.HttpHeaders;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.support.WebDataBinderFactory;
import org.springframework.web.context.request.NativeWebRequest;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.method.support.ModelAndViewContainer;

import java.util.Optional;

final class ExpectedVersionArgumentResolver implements HandlerMethodArgumentResolver {

    private static final char QUOTE = '"';

    @Override
    public boolean supportsParameter(MethodParameter parameter) {
        return ExpectedVersion.class.equals(parameter.getParameterType());
    }

    @Override
    public ExpectedVersion resolveArgument(MethodParameter parameter, ModelAndViewContainer container, NativeWebRequest request,
                                           WebDataBinderFactory binders) {
        Optional<String> sent = Optional.ofNullable(request.getHeader(HttpHeaders.IF_MATCH)).map(String::strip).filter(value -> !value.isEmpty())
                .map(ExpectedVersionArgumentResolver::unquoted);
        if (sent.isEmpty()) {
            if (AdministrationChannels.of(SecurityContextHolder.getContext().getAuthentication()).isConnectedApplication()) {
                return ExpectedVersion.none();
            }
            throw new VersionRequiredException();
        }
        return sent.filter(value -> !value.isEmpty() && value.length() <= ExpectedVersion.MAX_LENGTH).map(ExpectedVersion::of)
                .orElseGet(() -> ExpectedVersion.of(ExpectedVersion.UNMATCHABLE));
    }

    private static String unquoted(String value) {
        boolean quoted = value.length() >= 2 && value.charAt(0) == QUOTE && value.charAt(value.length() - 1) == QUOTE;
        return quoted ? value.substring(1, value.length() - 1) : value;
    }
}
