package cz.novanadeje.app.shared.interfaces.rest;

import cz.novanadeje.app.shared.infrastructure.config.BuildProperties;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.context.MessageSource;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.servlet.LocaleResolver;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.net.URI;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 1)
class VersionHeadersFilter extends OncePerRequestFilter {

    static final int API_GENERATION = 1;
    static final String REVISION_HEADER = "Nfnn-Revision";
    static final String API_HEADER = "Nfnn-Api";
    static final String APP_API_HEADER = "Nfnn-App-Api";
    static final URI UPDATE_REQUIRED = ProblemTypes.of("app", "update-required");

    private static final String API_PATH = "/api/";
    private static final int UPGRADE_REQUIRED = 426;
    private static final Pattern GENERATION = Pattern.compile("[1-9][0-9]{0,8}");
    private static final Set<String> READING_METHODS = Set.of("GET", "HEAD", "OPTIONS");
    static final Set<String> POSTS_ACROSS_GENERATIONS =
            Set.of("/api/donors/auth/refresh", "/api/donors/auth/logout", "/api/donations/receipts/status");

    private final BuildProperties build;
    private final ProblemMessages texts;
    private final LocaleResolver locales;
    private final JsonMapper json = JsonMapper.builder().build();

    VersionHeadersFilter(BuildProperties build, MessageSource messages, LocaleResolver locales) {
        this.build = build;
        this.texts = new ProblemMessages(messages);
        this.locales = locales;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !request.getRequestURI().startsWith(API_PATH);
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        response.setHeader(REVISION_HEADER, build.revision());
        response.setHeader(API_HEADER, String.valueOf(API_GENERATION));
        if (writesFromAnotherGeneration(request)) {
            answerUpdateRequired(request, response);
            return;
        }
        chain.doFilter(request, response);
    }

    private static boolean writesFromAnotherGeneration(HttpServletRequest request) {
        String generation = request.getHeader(APP_API_HEADER);
        return generation != null
                && GENERATION.matcher(generation).matches()
                && Integer.parseInt(generation) != API_GENERATION
                && !READING_METHODS.contains(request.getMethod())
                && !POSTS_ACROSS_GENERATIONS.contains(request.getRequestURI());
    }

    private void answerUpdateRequired(HttpServletRequest request, HttpServletResponse response) throws IOException {
        Locale locale = locales.resolveLocale(request);
        Map<String, Object> problem = new LinkedHashMap<>();
        problem.put("type", UPDATE_REQUIRED.toString());
        problem.put("title", texts.text("problem.app.update-required.title", locale));
        problem.put("status", UPGRADE_REQUIRED);
        problem.put("detail", texts.text("problem.app.update-required.detail", locale));
        response.setStatus(UPGRADE_REQUIRED);
        response.setHeader(HttpHeaders.CACHE_CONTROL, "no-store");
        response.setHeader("X-Content-Type-Options", "nosniff");
        response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
        json.writeValue(response.getOutputStream(), problem);
    }
}
