package cz.novanadeje.app.shared.infrastructure.security;

import cz.novanadeje.app.IntegrationTest;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.server.PathContainer;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.authorization.AuthorizationManager;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.access.intercept.AuthorizationFilter;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.mvc.method.RequestMappingInfo;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;
import org.springframework.web.util.pattern.PathPattern;
import org.springframework.web.util.pattern.PathPatternParser;

import jakarta.servlet.http.HttpServletRequest;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.function.Function;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;

@IntegrationTest
class AdminHandlerClassificationTest {

    private static final String ADMIN_PREFIX = "/api/admin/";
    private static final String OUTLINE = "Scenario Outline: A dangerous or irreversible change is refused to a connected application";
    private static final Pattern PATH_VARIABLE = Pattern.compile("\\{[^}/]+}");
    private static final String SAMPLE_SEGMENT = "0192f0f1-0000-7000-8000-000000000000";

    @Autowired
    @Qualifier("requestMappingHandlerMapping")
    private RequestMappingHandlerMapping handlerMapping;

    @Autowired
    @Qualifier("apiSecurityFilterChain")
    private SecurityFilterChain apiChain;

    @Test
    @DisplayName("Given the running application, when its handlers under /api/admin are listed, then each one is classified and each classification names a handler")
    void should_classify_every_admin_handler_when_listed_given_running_application() {
        Set<String> handlers = adminHandlers();

        assertThat(AdminHandlerReach.unclassified(handlers, AdminHandlerReach.CLASSIFIED))
                .withFailMessage(() -> "Classify these handlers in AdminHandlerReach as connector-reachable or browser-only, and give a browser-only one"
                        + " its guard in ApiSecurityConfiguration and its row in the outline of connected_apps.feature: "
                        + AdminHandlerReach.unclassified(handlers, AdminHandlerReach.CLASSIFIED))
                .isEmpty();
        assertThat(AdminHandlerReach.stale(handlers, AdminHandlerReach.CLASSIFIED)).withFailMessage("No handler answers these classified requests: %s",
                AdminHandlerReach.stale(handlers, AdminHandlerReach.CLASSIFIED)).isEmpty();
    }

    @Test
    @DisplayName("Given the classification, when the security chain decides for a browser administrator and for connected applications, then a browser-only handler refuses every connected application, a connector-reachable one admits the writing permission, and a change needs it")
    void should_decide_as_classified_when_asked_given_browser_and_connected_tokens() {
        AuthorizationManager<HttpServletRequest> decisions = apiChain.getFilters().stream()
                .filter(AuthorizationFilter.class::isInstance)
                .map(AuthorizationFilter.class::cast)
                .findFirst()
                .orElseThrow()
                .getAuthorizationManager();
        List<String> wrong = new ArrayList<>();
        AdminHandlerReach.CLASSIFIED.forEach((handler, reach) -> {
            String method = handler.substring(0, handler.indexOf(' '));
            String path = PATH_VARIABLE.matcher(handler.substring(handler.indexOf(' ') + 1)).replaceAll(SAMPLE_SEGMENT);
            for (TokenKind kind : TokenKind.values()) {
                boolean granted = decisions.authorize(kind::authentication, new MockHttpServletRequest(method, path)).isGranted();
                if (granted != reach.reachedBy(kind == TokenKind.BROWSER, kind == TokenKind.CONNECTED_WRITING, method)) {
                    wrong.add(handler + " (" + reach + ") is " + (granted ? "granted" : "refused") + " to " + kind);
                }
            }
        });

        assertThat(wrong).isEmpty();
    }

    @Test
    @DisplayName("Given the outline of connected_apps.feature, when its rows are matched to handlers, then they are exactly the browser-only handlers of the classification")
    void should_list_every_browser_only_handler_when_matched_given_connected_apps_outline() throws IOException {
        Set<String> browserOnly = AdminHandlerReach.CLASSIFIED.entrySet().stream()
                .filter(entry -> entry.getValue() == AdminHandlerReach.BROWSER_ONLY)
                .map(Map.Entry::getKey)
                .collect(Collectors.toCollection(TreeSet::new));

        Set<String> outlined = outlineRows().stream().map(AdminHandlerClassificationTest::handlerFor).collect(Collectors.toCollection(TreeSet::new));

        assertThat(outlined).isEqualTo(browserOnly);
    }

    @Test
    @DisplayName("Given a handler the classification does not name, when the handlers are checked, then it is reported as unclassified and a classification without a handler as stale")
    void should_report_unclassified_handler_when_checked_given_handler_missing_from_table() {
        Map<String, AdminHandlerReach> table = Map.of("GET /api/admin/donations/receipts", AdminHandlerReach.CONNECTOR,
                "GET /api/admin/donations/gone", AdminHandlerReach.CONNECTOR);
        List<String> handlers = List.of("GET /api/admin/donations/receipts", "POST /api/admin/donations/receipts/export");

        assertThat(AdminHandlerReach.unclassified(handlers, table)).containsExactly("POST /api/admin/donations/receipts/export");
        assertThat(AdminHandlerReach.stale(handlers, table)).containsExactly("GET /api/admin/donations/gone");
    }

    private Set<String> adminHandlers() {
        Set<String> handlers = new TreeSet<>();
        for (Map.Entry<RequestMappingInfo, HandlerMethod> entry : handlerMapping.getHandlerMethods().entrySet()) {
            RequestMappingInfo info = entry.getKey();
            Set<String> methods = info.getMethodsCondition().getMethods().stream().map(Enum::name).collect(Collectors.toSet());
            for (String pattern : info.getPatternValues()) {
                if (pattern.startsWith(ADMIN_PREFIX)) {
                    (methods.isEmpty() ? Set.of("ANY") : methods).forEach(method -> handlers.add(method + " " + pattern));
                }
            }
        }
        return handlers;
    }

    private static List<String> outlineRows() throws IOException {
        String feature = new ClassPathResource("features/donors/connected_apps.feature").getContentAsString(StandardCharsets.UTF_8);
        int start = feature.indexOf(OUTLINE);
        assertThat(start).withFailMessage("connected_apps.feature has no outline \"%s\"", OUTLINE).isNotNegative();
        List<String> rows = new ArrayList<>();
        boolean examples = false;
        for (String line : feature.substring(start).lines().skip(1).toList()) {
            String trimmed = line.trim();
            if (trimmed.startsWith("Scenario")) {
                break;
            }
            if (trimmed.startsWith("Examples:")) {
                examples = true;
            } else if (examples && trimmed.startsWith("|")) {
                String[] cells = trimmed.substring(1, trimmed.length() - 1).split("\\|");
                String method = cells[0].trim();
                if (!"method".equals(method)) {
                    rows.add(method + " " + cells[1].trim());
                }
            }
        }
        return rows;
    }

    private static String handlerFor(String row) {
        String method = row.substring(0, row.indexOf(' '));
        PathContainer path = PathContainer.parsePath(row.substring(row.indexOf(' ') + 1).replace("{id}", SAMPLE_SEGMENT));
        Function<String, PathPattern> parse = handler -> PathPatternParser.defaultInstance.parse(handler.substring(handler.indexOf(' ') + 1));
        return AdminHandlerReach.CLASSIFIED.keySet().stream()
                .filter(handler -> handler.startsWith(method + " "))
                .filter(handler -> parse.apply(handler).matches(path))
                .min(Comparator.comparing(parse, PathPattern.SPECIFICITY_COMPARATOR))
                .orElse("no handler for " + row);
    }

    private enum TokenKind {
        BROWSER(Map.of()),
        CONNECTED_WRITING(Map.of(JwtProperties.SCOPE_CLAIM, "admin:read admin:write", JwtProperties.CLIENT_CLAIM, "claude.ai")),
        CONNECTED_READING(Map.of(JwtProperties.SCOPE_CLAIM, "admin:read", JwtProperties.CLIENT_CLAIM, "claude.ai"));

        private final Map<String, Object> claims;

        TokenKind(Map<String, Object> claims) {
            this.claims = claims;
        }

        JwtAuthenticationToken authentication() {
            Jwt.Builder jwt = Jwt.withTokenValue("token").header("alg", "HS256").subject(SAMPLE_SEGMENT).issuedAt(Instant.EPOCH)
                    .expiresAt(Instant.EPOCH.plusSeconds(900));
            claims.forEach(jwt::claim);
            return new JwtAuthenticationToken(jwt.build(), List.of(new SimpleGrantedAuthority("ROLE_DONOR"), new SimpleGrantedAuthority("ROLE_ADMIN")));
        }
    }
}
