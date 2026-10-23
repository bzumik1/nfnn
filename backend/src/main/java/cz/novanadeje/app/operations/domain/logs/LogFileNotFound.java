package cz.novanadeje.app.operations.domain.logs;

import cz.novanadeje.app.shared.domain.error.NotFound;

public class LogFileNotFound extends NotFound {

    public static final String CODE = "operations/log-not-found";

    public LogFileNotFound() {
        super(CODE, "There is no such log file");
    }
}
