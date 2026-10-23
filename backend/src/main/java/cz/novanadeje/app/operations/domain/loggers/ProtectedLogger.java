package cz.novanadeje.app.operations.domain.loggers;

import cz.novanadeje.app.shared.domain.error.RuleViolation;

public class ProtectedLogger extends RuleViolation {

    public static final String CODE = "operations/protected-logger";

    public ProtectedLogger(LoggerName logger, LogLevel level) {
        super(CODE, "The logger " + logger.value() + " at " + level + " would write bound values, bodies, raw requests or tokens; TRACE is only for "
                + ProtectedLoggers.OWN_CODE);
    }
}
