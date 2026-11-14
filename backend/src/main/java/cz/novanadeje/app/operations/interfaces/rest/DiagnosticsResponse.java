package cz.novanadeje.app.operations.interfaces.rest;

import cz.novanadeje.app.operations.application.diagnostics.DatabaseDiagnostics;
import cz.novanadeje.app.operations.application.diagnostics.DiagnosticsView;
import cz.novanadeje.app.operations.application.diagnostics.DiskSpace;
import cz.novanadeje.app.operations.application.diagnostics.JvmDiagnostics;

import java.time.Instant;
import java.util.List;

record DiagnosticsResponse(Instant now, Jvm jvm, Database database, List<Disk> disks, List<LogLevelsResponse.Override> logLevelOverrides) {

    static DiagnosticsResponse from(DiagnosticsView view) {
        return new DiagnosticsResponse(view.now(), Jvm.from(view.jvm()), Database.from(view.database()), view.disks().stream().map(Disk::from).toList(),
                view.logLevelOverrides().stream().map(LogLevelsResponse.Override::from).toList());
    }

    record Jvm(String javaVersion, Instant startedAt, long heapUsedBytes, long heapMaxBytes, long nonHeapUsedBytes, int liveThreads, int peakThreads,
               int daemonThreads, long gcCount, long gcTimeMillis, int availableProcessors, double systemLoadAverage) {

        static Jvm from(JvmDiagnostics jvm) {
            return new Jvm(jvm.javaVersion(), jvm.startedAt(), jvm.heapUsedBytes(), jvm.heapMaxBytes(), jvm.nonHeapUsedBytes(), jvm.liveThreads(),
                    jvm.peakThreads(), jvm.daemonThreads(), jvm.gcCount(), jvm.gcTimeMillis(), jvm.availableProcessors(), jvm.systemLoadAverage());
        }
    }

    record Database(boolean reachable, long pingMillis, int activeConnections, int idleConnections, int waitingThreads, int maxConnections) {

        static Database from(DatabaseDiagnostics database) {
            return new Database(database.reachable(), database.pingMillis(), database.activeConnections(), database.idleConnections(),
                    database.waitingThreads(), database.maxConnections());
        }
    }

    record Disk(String path, boolean mounted, long freeBytes, long totalBytes) {

        static Disk from(DiskSpace disk) {
            return new Disk(disk.path(), disk.mounted(), disk.freeBytes(), disk.totalBytes());
        }
    }
}
