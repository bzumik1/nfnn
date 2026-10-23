package cz.novanadeje.app.operations.interfaces.rest;

import cz.novanadeje.app.operations.application.diagnostics.DiagnosticsView;
import cz.novanadeje.app.operations.domain.diagnostics.DatabaseDiagnostics;
import cz.novanadeje.app.operations.domain.diagnostics.DiskSpace;
import cz.novanadeje.app.operations.domain.diagnostics.JvmDiagnostics;

import java.time.Instant;
import java.util.List;

record DiagnosticsResponse(Instant now, JvmDiagnostics jvm, DatabaseDiagnostics database, List<DiskSpace> disks,
                           List<LogLevelsResponse.Override> logLevelOverrides) {

    static DiagnosticsResponse from(DiagnosticsView view) {
        return new DiagnosticsResponse(view.now(), view.jvm(), view.database(), view.disks(),
                view.logLevelOverrides().stream().map(LogLevelsResponse.Override::from).toList());
    }
}
