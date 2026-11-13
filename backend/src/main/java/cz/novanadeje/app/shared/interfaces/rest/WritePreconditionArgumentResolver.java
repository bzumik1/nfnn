package cz.novanadeje.app.shared.interfaces.rest;

import cz.novanadeje.app.shared.application.version.WritePrecondition;
import org.springframework.core.MethodParameter;
import org.springframework.http.HttpHeaders;
import org.springframework.web.bind.support.WebDataBinderFactory;
import org.springframework.web.context.request.NativeWebRequest;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.method.support.ModelAndViewContainer;

import java.util.Optional;

final class WritePreconditionArgumentResolver implements HandlerMethodArgumentResolver {

    private static final String ANY = "*";

    @Override
    public boolean supportsParameter(MethodParameter parameter) {
        return WritePrecondition.class.equals(parameter.getParameterType());
    }

    @Override
    public WritePrecondition resolveArgument(MethodParameter parameter, ModelAndViewContainer container, NativeWebRequest request,
                                             WebDataBinderFactory binders) {
        Optional<String> ifMatch = PreconditionHeaders.sent(request, HttpHeaders.IF_MATCH);
        if (ifMatch.isPresent()) {
            return WritePrecondition.matching(PreconditionHeaders.expected(ifMatch.get()));
        }
        Optional<String> ifNoneMatch = PreconditionHeaders.sent(request, HttpHeaders.IF_NONE_MATCH);
        if (ifNoneMatch.isPresent()) {
            return absentOnly(ifNoneMatch.get());
        }
        if (PreconditionHeaders.fromConnectedApplication()) {
            return WritePrecondition.anything();
        }
        throw new VersionRequiredException();
    }

    private static WritePrecondition absentOnly(String ifNoneMatch) {
        if (ANY.equals(ifNoneMatch)) {
            return WritePrecondition.absent();
        }
        throw new VersionRequiredException();
    }
}
