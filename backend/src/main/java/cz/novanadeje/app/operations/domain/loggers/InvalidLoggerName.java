package cz.novanadeje.app.operations.domain.loggers;

import cz.novanadeje.app.shared.domain.error.RuleViolation;

public class InvalidLoggerName extends RuleViolation {

    public static final String CODE = "operations/invalid-logger-name";

    public InvalidLoggerName() {
        super(CODE, "A logger is ROOT or a dotted Java package or class name");
    }
}
