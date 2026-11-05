package cz.novanadeje.app.shared.interfaces.rest;

import cz.novanadeje.app.shared.domain.FoundationZone;
import cz.novanadeje.app.shared.infrastructure.json.CanonicalRows;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.time.Instant;
import java.time.YearMonth;
import java.util.List;
import java.util.SortedMap;

public record SyncChunk(String id, String rowsSha256, int count, JsonNode rows) {

    public static SyncChunk of(String id, JsonNode rows) {
        return new SyncChunk(id, CanonicalRows.sha256(rows), rows.size(), rows);
    }

    public static List<SyncChunk> allOf(SortedMap<String, ? extends List<?>> rowsById, JsonMapper json) {
        return rowsById.entrySet().stream().map(chunk -> of(chunk.getKey(), json.valueToTree(chunk.getValue()))).toList();
    }

    public static YearMonth monthOf(Instant at) {
        return YearMonth.from(at.atZone(FoundationZone.ZONE));
    }
}
