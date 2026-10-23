package cz.novanadeje.app.operations.domain.loggers;

import cz.novanadeje.app.shared.domain.error.RuleViolation;

public class ProtectedLogger extends RuleViolation {

    public static final String CODE = "operations/protected-logger";

    public ProtectedLogger(LoggerName logger) {
        super(CODE, "The logger " + logger.value() + " would write bound values, bodies or raw requests and keeps its level");
    }
}
