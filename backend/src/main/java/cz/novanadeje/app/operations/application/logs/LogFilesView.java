package cz.novanadeje.app.operations.application.logs;

import cz.novanadeje.app.operations.domain.logs.LogFile;

import java.util.List;

public record LogFilesView(boolean available, List<LogFile> files) {

    public static LogFilesView unavailable() {
        return new LogFilesView(false, List.of());
    }
}
