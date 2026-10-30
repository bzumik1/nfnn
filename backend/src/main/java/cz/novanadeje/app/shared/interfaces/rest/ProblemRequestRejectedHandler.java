package cz.novanadeje.app.shared.interfaces.rest;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.context.MessageSource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.web.firewall.RequestRejectedException;
import org.springframework.security.web.firewall.RequestRejectedHandler;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.LocaleResolver;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;

@Component
class ProblemRequestRejectedHandler implements RequestRejectedHandler {

    private static final String NO_STORE = "no-cache, no-store, max-age=0, must-revalidate";

    private final MessageSource messages;
    private final LocaleResolver locales;
    private final JsonMapper json = JsonMapper.builder().build();

    ProblemRequestRejectedHandler(MessageSource messages, LocaleResolver locales) {
        this.messages = messages;
        this.locales = locales;
    }

    @Override
    public void handle(HttpServletRequest request, HttpServletResponse response, RequestRejectedException rejected) throws IOException {
        Locale locale = locales.resolveLocale(request);
        Map<String, Object> problem = new LinkedHashMap<>();
        problem.put("type", ProblemTypes.VALIDATION.toString());
        problem.put("title", messages.getMessage("problem.validation.title", null, locale));
        problem.put("status", HttpStatus.BAD_REQUEST.value());
        problem.put("detail", messages.getMessage("problem.validation.rejected-request", null, locale));
        response.resetBuffer();
        response.setStatus(HttpStatus.BAD_REQUEST.value());
        response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
        response.setHeader(HttpHeaders.CACHE_CONTROL, NO_STORE);
        response.setHeader(HttpHeaders.PRAGMA, "no-cache");
        response.setHeader(HttpHeaders.EXPIRES, "0");
        response.setHeader("X-Content-Type-Options", "nosniff");
        json.writeValue(response.getOutputStream(), problem);
    }
}
