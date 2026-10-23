package cz.novanadeje.app.operations.domain.logs;

import cz.novanadeje.app.shared.domain.error.RuleViolation;

public class LogSearchTooSlow extends RuleViolation {

    public static final String CODE = "operations/log-search-too-slow";

    public LogSearchTooSlow() {
        super(CODE, "The search pattern took too long; a simpler pattern finds the lines");
    }
}
