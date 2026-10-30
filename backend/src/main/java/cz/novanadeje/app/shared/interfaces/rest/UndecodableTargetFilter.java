package cz.novanadeje.app.shared.interfaces.rest;

import jakarta.servlet.DispatcherType;
import jakarta.servlet.FilterChain;
import jakarta.servlet.RequestDispatcher;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.context.MessageSource;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.servlet.LocaleResolver;
import org.springframework.web.util.UriUtils;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.stream.Stream;

@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
class UndecodableTargetFilter extends OncePerRequestFilter {

    private final MessageSource messages;
    private final LocaleResolver localeResolver;
    private final JsonMapper json = JsonMapper.builder().build();

    UndecodableTargetFilter(MessageSource messages, LocaleResolver localeResolver) {
        this.messages = messages;
        this.localeResolver = localeResolver;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return request.getDispatcherType() != DispatcherType.ERROR;
    }

    @Override
    protected boolean shouldNotFilterErrorDispatch() {
        return false;
    }

    @Override
    protected void doFilterNestedErrorDispatch(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        doFilterInternal(request, response, chain);
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        if (Stream.of(RequestDispatcher.FORWARD_REQUEST_URI, RequestDispatcher.ERROR_REQUEST_URI)
                .map(request::getAttribute)
                .allMatch(target -> !(target instanceof String text) || isDecodable(text))) {
            chain.doFilter(request, response);
            return;
        }
        answerValidationProblem(request, response);
    }

    private static boolean isDecodable(String target) {
        try {
            UriUtils.decode(target, StandardCharsets.UTF_8);
            return true;
        } catch (IllegalArgumentException undecodable) {
            return false;
        }
    }

    private void answerValidationProblem(HttpServletRequest request, HttpServletResponse response) throws IOException {
        Locale locale = localeResolver.resolveLocale(request);
        int status = request.getAttribute(RequestDispatcher.ERROR_STATUS_CODE) instanceof Integer code ? code : HttpStatus.BAD_REQUEST.value();
        Map<String, Object> problem = new LinkedHashMap<>();
        problem.put("type", ProblemTypes.VALIDATION.toString());
        problem.put("title", messages.getMessage("problem.validation.title", null, locale));
        problem.put("status", status);
        problem.put("detail", messages.getMessage("problem.validation.detail", null, locale));
        problem.put("errors", List.of());
        response.setStatus(status);
        response.setHeader(HttpHeaders.CACHE_CONTROL, "no-store");
        response.setHeader("X-Content-Type-Options", "nosniff");
        response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
        response.getOutputStream().write(json.writeValueAsBytes(problem));
    }
}
