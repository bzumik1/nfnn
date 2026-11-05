package cz.novanadeje.app.shared.interfaces.rest;

import cz.novanadeje.app.shared.domain.FoundationZone;
import cz.novanadeje.app.shared.infrastructure.json.CanonicalRows;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.time.Instant;
import java.time.YearMonth;
import java.util.List;
import java.util.Map;
import java.util.SortedMap;
import java.util.function.Function;
import java.util.stream.Collectors;

public record SyncChunk(String id, String rowsSha256, int count, JsonNode rows) {

    public static SyncChunk of(String id, JsonNode rows) {
        return new SyncChunk(id, CanonicalRows.sha256(rows), rows.size(), rows);
    }

    public static List<SyncChunk> allOf(SortedMap<String, ? extends List<?>> rowsById, JsonMapper json) {
        return rowsById.entrySet().stream().map(chunk -> of(chunk.getKey(), json.valueToTree(chunk.getValue()))).toList();
    }

    public static Asked asked(List<SyncChunk> served, List<String> ids) {
        Map<String, SyncChunk> byId = served.stream().collect(Collectors.toMap(SyncChunk::id, Function.identity()));
        List<String> distinct = ids.stream().distinct().toList();
        return new Asked(distinct.stream().filter(byId::containsKey).map(byId::get).toList(), distinct.stream().filter(id -> !byId.containsKey(id)).toList());
    }

    public static YearMonth monthOf(Instant at) {
        return YearMonth.from(at.atZone(FoundationZone.ZONE));
    }

    public record Asked(List<SyncChunk> chunks, List<String> missing) {

        public Asked {
            chunks = List.copyOf(chunks);
            missing = List.copyOf(missing);
        }
    }
}
