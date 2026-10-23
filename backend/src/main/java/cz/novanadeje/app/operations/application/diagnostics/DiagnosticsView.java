package cz.novanadeje.app.operations.application.diagnostics;

import cz.novanadeje.app.operations.domain.diagnostics.DatabaseDiagnostics;
import cz.novanadeje.app.operations.domain.diagnostics.DiskSpace;
import cz.novanadeje.app.operations.domain.diagnostics.JvmDiagnostics;
import cz.novanadeje.app.operations.domain.loggers.LogLevelOverride;

import java.time.Instant;
import java.util.List;

public record DiagnosticsView(Instant now, JvmDiagnostics jvm, DatabaseDiagnostics database, List<DiskSpace> disks,
                              List<LogLevelOverride> logLevelOverrides) {
}
