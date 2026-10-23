package cz.novanadeje.app.operations.domain.diagnostics;

public record DiskSpace(String path, boolean mounted, long freeBytes, long totalBytes) {
}
