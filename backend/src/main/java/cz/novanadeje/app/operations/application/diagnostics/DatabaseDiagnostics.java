package cz.novanadeje.app.operations.application.diagnostics;

public record DatabaseDiagnostics(boolean reachable, long pingMillis, int activeConnections, int idleConnections, int waitingThreads,
                                  int maxConnections) {
}
