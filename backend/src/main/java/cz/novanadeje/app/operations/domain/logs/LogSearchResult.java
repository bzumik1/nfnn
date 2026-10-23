package cz.novanadeje.app.operations.domain.logs;

import java.util.List;

public record LogSearchResult(String name, long sizeBytes, long scannedFrom, List<LogMatch> matches, boolean moreOlder) {

    public LogSearchResult {
        matches = List.copyOf(matches);
    }
}
