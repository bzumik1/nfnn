package cz.novanadeje.app.operations.application.diagnostics;

import cz.novanadeje.app.operations.domain.diagnostics.DiskSpace;
import cz.novanadeje.app.operations.domain.diagnostics.JvmDiagnostics;

import java.util.List;

public interface DiagnosticsSource {

    JvmDiagnostics jvm();

    List<DiskSpace> disks();

    String threadDump();
}
