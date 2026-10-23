package cz.novanadeje.app.operations.infrastructure.diagnostics;

import cz.novanadeje.app.operations.application.diagnostics.DiagnosticsSource;
import cz.novanadeje.app.operations.domain.diagnostics.DiskSpace;
import cz.novanadeje.app.operations.domain.diagnostics.JvmDiagnostics;
import cz.novanadeje.app.operations.infrastructure.backup.BackupProperties;
import cz.novanadeje.app.operations.infrastructure.logs.LogProperties;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.lang.management.GarbageCollectorMXBean;
import java.lang.management.ManagementFactory;
import java.lang.management.MemoryMXBean;
import java.lang.management.MonitorInfo;
import java.lang.management.OperatingSystemMXBean;
import java.lang.management.RuntimeMXBean;
import java.lang.management.ThreadInfo;
import java.lang.management.ThreadMXBean;
import java.nio.file.FileStore;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.List;

@Component
class JvmDiagnosticsSource implements DiagnosticsSource {

    private final List<Path> watchedPaths;

    JvmDiagnosticsSource(LogProperties logs, BackupProperties backups) {
        this.watchedPaths = List.of(logs.directory(), backups.directory(), backups.restoreDirectory());
    }

    @Override
    public JvmDiagnostics jvm() {
        RuntimeMXBean runtime = ManagementFactory.getRuntimeMXBean();
        MemoryMXBean memory = ManagementFactory.getMemoryMXBean();
        ThreadMXBean threads = ManagementFactory.getThreadMXBean();
        OperatingSystemMXBean os = ManagementFactory.getOperatingSystemMXBean();
        long gcCount = 0;
        long gcTime = 0;
        for (GarbageCollectorMXBean collector : ManagementFactory.getGarbageCollectorMXBeans()) {
            gcCount += Math.max(0, collector.getCollectionCount());
            gcTime += Math.max(0, collector.getCollectionTime());
        }
        return new JvmDiagnostics(Runtime.version().toString(), Instant.ofEpochMilli(runtime.getStartTime()),
                memory.getHeapMemoryUsage().getUsed(), memory.getHeapMemoryUsage().getMax(), memory.getNonHeapMemoryUsage().getUsed(),
                threads.getThreadCount(), threads.getPeakThreadCount(), threads.getDaemonThreadCount(), gcCount, gcTime,
                os.getAvailableProcessors(), os.getSystemLoadAverage());
    }

    @Override
    public List<DiskSpace> disks() {
        return watchedPaths.stream().map(JvmDiagnosticsSource::diskOf).toList();
    }

    @Override
    public String threadDump() {
        StringBuilder dump = new StringBuilder();
        for (ThreadInfo thread : ManagementFactory.getThreadMXBean().dumpAllThreads(true, true)) {
            dump.append('"').append(thread.getThreadName()).append("\" #").append(thread.getThreadId())
                    .append(thread.isDaemon() ? " daemon" : "").append(" state=").append(thread.getThreadState());
            if (thread.getLockName() != null) {
                dump.append(" waiting on ").append(thread.getLockName());
                if (thread.getLockOwnerName() != null) {
                    dump.append(" owned by \"").append(thread.getLockOwnerName()).append('"');
                }
            }
            dump.append('\n');
            MonitorInfo[] monitors = thread.getLockedMonitors();
            for (StackTraceElement frame : thread.getStackTrace()) {
                dump.append("    at ").append(frame).append('\n');
                for (MonitorInfo monitor : monitors) {
                    if (frame.equals(monitor.getLockedStackFrame())) {
                        dump.append("    - locked ").append(monitor).append('\n');
                    }
                }
            }
            dump.append('\n');
        }
        return dump.toString();
    }

    private static DiskSpace diskOf(Path path) {
        if (!Files.exists(path)) {
            return new DiskSpace(path.toString(), false, 0, 0);
        }
        try {
            FileStore store = Files.getFileStore(path);
            return new DiskSpace(path.toString(), true, store.getUsableSpace(), store.getTotalSpace());
        } catch (IOException e) {
            return new DiskSpace(path.toString(), false, 0, 0);
        }
    }
}
