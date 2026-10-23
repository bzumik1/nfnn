package cz.novanadeje.app.operations.application.loggers;

import java.util.List;

public record LogLevelsView(List<LoggerView> loggers) {

    public LogLevelsView {
        loggers = List.copyOf(loggers);
    }
}
