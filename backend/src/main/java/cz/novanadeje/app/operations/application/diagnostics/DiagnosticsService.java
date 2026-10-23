package cz.novanadeje.app.operations.application.diagnostics;

import cz.novanadeje.app.operations.application.loggers.LogLevelService;
import cz.novanadeje.app.operations.application.loggers.LoggerView;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.util.Optional;

@Service
public class DiagnosticsService {

    private final DiagnosticsSource source;
    private final DatabaseDiagnosticsSource database;
    private final LogLevelService logLevels;
    private final Clock clock;

    public DiagnosticsService(DiagnosticsSource source, DatabaseDiagnosticsSource database, LogLevelService logLevels, Clock clock) {
        this.source = source;
        this.database = database;
        this.logLevels = logLevels;
        this.clock = clock;
    }

    public DiagnosticsView view() {
        return new DiagnosticsView(clock.instant(), source.jvm(), database.database(), source.disks(),
                logLevels.view().loggers().stream().map(LoggerView::override).flatMap(Optional::stream).toList());
    }

    public String threadDump() {
        return source.threadDump();
    }
}
