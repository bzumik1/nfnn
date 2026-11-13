package cz.novanadeje.app.shared.interfaces.rest;

import cz.novanadeje.app.shared.application.version.ExpectedVersion;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.context.request.NativeWebRequest;

import java.util.Optional;

final class PreconditionHeaders {

    private static final char QUOTE = '"';

    private PreconditionHeaders() {
    }

    static Optional<String> sent(NativeWebRequest request, String header) {
        return Optional.ofNullable(request.getHeader(header)).map(String::strip).filter(value -> !value.isEmpty());
    }

    static ExpectedVersion expected(String ifMatch) {
        String version = unquoted(ifMatch);
        boolean matchable = !version.isEmpty() && version.length() <= ExpectedVersion.MAX_LENGTH;
        return ExpectedVersion.of(matchable ? version : ExpectedVersion.UNMATCHABLE);
    }

    static boolean fromConnectedApplication() {
        return AdministrationChannels.of(SecurityContextHolder.getContext().getAuthentication()).isConnectedApplication();
    }

    private static String unquoted(String value) {
        boolean quoted = value.length() >= 2 && value.charAt(0) == QUOTE && value.charAt(value.length() - 1) == QUOTE;
        return quoted ? value.substring(1, value.length() - 1) : value;
    }
}
