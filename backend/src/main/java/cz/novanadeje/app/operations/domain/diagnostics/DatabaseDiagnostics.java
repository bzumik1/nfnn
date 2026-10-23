package cz.novanadeje.app.operations.domain.diagnostics;

public record DatabaseDiagnostics(boolean reachable, long pingMillis, int activeConnections, int idleConnections, int waitingThreads,
                                  int maxConnections) {
}
