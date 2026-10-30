package cz.novanadeje.app.operations.domain.loggers;

import java.util.List;

public final class ProtectedLoggers {

    public static final List<String> NAMES = List.of(
            "org.hibernate.orm.jdbc.bind",
            "org.hibernate.orm.jdbc.extract",
            "org.hibernate.internal.util.EntityPrinter",
            "org.springframework.web.servlet.mvc.method.annotation",
            "org.springframework.web.method",
            "org.springframework.web.client",
            "org.apache.coyote",
            "org.apache.tomcat.util.http",
            "org.postgresql",
            "jakarta.mail");

    private ProtectedLoggers() {
    }

    public static final String OWN_CODE = "cz.novanadeje.app";

    public static boolean refuses(LoggerName logger, LogLevel level) {
        return covers(logger) || level == LogLevel.TRACE && !isOwnCode(logger);
    }

    public static boolean covers(LoggerName logger) {
        return NAMES.stream().anyMatch(name -> isAtOrBelow(logger, name));
    }

    private static boolean isOwnCode(LoggerName logger) {
        return isAtOrBelow(logger, OWN_CODE);
    }

    private static boolean isAtOrBelow(LoggerName logger, String name) {
        return logger.value().equals(name) || logger.value().startsWith(name + ".");
    }
}
