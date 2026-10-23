package cz.novanadeje.app.operations.domain.loggers;

import java.util.List;

public final class ProtectedLoggers {

    public static final List<String> NAMES = List.of(
            "org.hibernate.orm.jdbc.bind",
            "org.hibernate.orm.jdbc.extract",
            "org.hibernate.internal.util.EntityPrinter",
            "org.springframework.web.servlet.mvc.method.annotation",
            "org.springframework.web.client",
            "org.apache.coyote",
            "org.apache.tomcat.util.http",
            "org.postgresql",
            "jakarta.mail");

    private ProtectedLoggers() {
    }

    public static boolean covers(LoggerName logger) {
        return NAMES.stream().anyMatch(name -> logger.value().equals(name) || logger.value().startsWith(name + "."));
    }
}
