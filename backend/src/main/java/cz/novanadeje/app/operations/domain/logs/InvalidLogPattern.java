package cz.novanadeje.app.operations.domain.logs;

import cz.novanadeje.app.shared.domain.error.RuleViolation;

public class InvalidLogPattern extends RuleViolation {

    public static final String CODE = "operations/invalid-log-pattern";

    public InvalidLogPattern() {
        super(CODE, "The search pattern is not a valid regular expression");
    }
}
