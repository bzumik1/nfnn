package cz.novanadeje.app.operations.domain.loggers;

import java.util.Map;

import static java.util.Map.entry;

public final class ProtectedLoggers {

    public static final Map<String, LogLevel> PINS = Map.ofEntries(
            entry("org.hibernate.orm.jdbc.bind", LogLevel.INFO),
            entry("org.hibernate.orm.jdbc.extract", LogLevel.INFO),
            entry("org.hibernate.internal.util.EntityPrinter", LogLevel.INFO),
            entry("org.springframework.web.method", LogLevel.INFO),
            entry("org.springframework.web.servlet.mvc.method.annotation", LogLevel.INFO),
            entry("org.springframework.web.client", LogLevel.INFO),
            entry("org.springframework.web.servlet.DispatcherServlet", LogLevel.INFO),
            entry("org.springframework.web.filter.ForwardedHeaderFilter", LogLevel.INFO),
            entry("org.springframework.security.web.FilterChainProxy", LogLevel.INFO),
            entry("org.springframework.security.web.firewall", LogLevel.INFO),
            entry("org.springframework.security.oauth2.server.resource.web.authentication.BearerTokenAuthenticationFilter", LogLevel.INFO),
            entry("org.apache.coyote", LogLevel.INFO),
            entry("org.apache.coyote.http11.Http11Processor", LogLevel.WARN),
            entry("org.apache.tomcat.util.http", LogLevel.INFO),
            entry("org.apache.tomcat.util.http.parser.Cookie", LogLevel.WARN),
            entry("org.postgresql", LogLevel.INFO),
            entry("jakarta.mail", LogLevel.INFO));

    private ProtectedLoggers() {
    }

    public static final String OWN_CODE = "cz.novanadeje.app";

    public static boolean refuses(LoggerName logger, LogLevel level) {
        return covers(logger) || level == LogLevel.TRACE && !isOwnCode(logger);
    }

    public static boolean covers(LoggerName logger) {
        return PINS.keySet().stream().anyMatch(name -> isAtOrBelow(logger, name));
    }

    private static boolean isOwnCode(LoggerName logger) {
        return isAtOrBelow(logger, OWN_CODE);
    }

    private static boolean isAtOrBelow(LoggerName logger, String name) {
        return logger.value().equals(name) || logger.value().startsWith(name + ".");
    }
}
