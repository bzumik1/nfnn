package cz.novanadeje.app.operations.domain.diagnostics;

import java.time.Instant;

public record JvmDiagnostics(String javaVersion, Instant startedAt, long heapUsedBytes, long heapMaxBytes, long nonHeapUsedBytes,
                             int liveThreads, int peakThreads, int daemonThreads, long gcCount, long gcTimeMillis, int availableProcessors,
                             double systemLoadAverage) {
}
