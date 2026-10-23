package cz.novanadeje.app.operations.domain.logs;

import cz.novanadeje.app.shared.domain.error.Conflict;

public class LogsUnavailable extends Conflict {

    public static final String CODE = "operations/logs-unavailable";

    public LogsUnavailable() {
        super(CODE, "The log folder is not connected");
    }
}
