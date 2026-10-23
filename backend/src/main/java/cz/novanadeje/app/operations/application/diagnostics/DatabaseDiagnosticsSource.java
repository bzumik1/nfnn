package cz.novanadeje.app.operations.application.diagnostics;

import cz.novanadeje.app.operations.domain.diagnostics.DatabaseDiagnostics;

public interface DatabaseDiagnosticsSource {

    DatabaseDiagnostics database();
}
