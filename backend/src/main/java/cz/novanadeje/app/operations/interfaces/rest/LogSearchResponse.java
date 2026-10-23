package cz.novanadeje.app.operations.interfaces.rest;

import cz.novanadeje.app.operations.domain.logs.LogMatch;
import cz.novanadeje.app.operations.domain.logs.LogSearchResult;

import java.util.List;

record LogSearchResponse(String name, long sizeBytes, List<Match> matches, boolean moreOlder, long scannedFrom) {

    static LogSearchResponse from(LogSearchResult result) {
        return new LogSearchResponse(result.name(), result.sizeBytes(), result.matches().stream().map(Match::from).toList(),
                result.moreOlder(), result.scannedFrom());
    }

    record Match(long offset, String line) {

        static Match from(LogMatch match) {
            return new Match(match.offset(), match.line());
        }
    }
}
