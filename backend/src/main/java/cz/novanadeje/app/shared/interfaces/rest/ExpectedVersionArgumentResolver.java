package cz.novanadeje.app.shared.interfaces.rest;

import cz.novanadeje.app.shared.application.version.ExpectedVersion;
import org.springframework.core.MethodParameter;
import org.springframework.http.HttpHeaders;
import org.springframework.web.bind.support.WebDataBinderFactory;
import org.springframework.web.context.request.NativeWebRequest;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.method.support.ModelAndViewContainer;

final class ExpectedVersionArgumentResolver implements HandlerMethodArgumentResolver {

    @Override
    public boolean supportsParameter(MethodParameter parameter) {
        return ExpectedVersion.class.equals(parameter.getParameterType());
    }

    @Override
    public ExpectedVersion resolveArgument(MethodParameter parameter, ModelAndViewContainer container, NativeWebRequest request,
                                           WebDataBinderFactory binders) {
        return PreconditionHeaders.sent(request, HttpHeaders.IF_MATCH).map(PreconditionHeaders::expected).orElseGet(ExpectedVersionArgumentResolver::noneSent);
    }

    private static ExpectedVersion noneSent() {
        if (PreconditionHeaders.fromConnectedApplication()) {
            return ExpectedVersion.none();
        }
        throw new VersionRequiredException();
    }
}
