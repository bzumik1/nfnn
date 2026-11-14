package cz.novanadeje.app.operations.application.diagnostics;

public record DiskSpace(String path, boolean mounted, long freeBytes, long totalBytes) {
}
