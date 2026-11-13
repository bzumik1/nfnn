package cz.novanadeje.app.operations.application.diagnostics;

import java.util.List;

public interface DiagnosticsSource {

    JvmDiagnostics jvm();

    List<DiskSpace> disks();

    String threadDump();
}
