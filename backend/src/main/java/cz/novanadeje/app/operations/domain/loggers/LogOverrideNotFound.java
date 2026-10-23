package cz.novanadeje.app.operations.domain.loggers;

import cz.novanadeje.app.shared.domain.error.NotFound;

public class LogOverrideNotFound extends NotFound {

    public static final String CODE = "operations/log-override-not-found";

    public LogOverrideNotFound() {
        super(CODE, "This logger has no temporary level");
    }
}
