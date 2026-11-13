package cz.novanadeje.app.shared.interfaces.rest;

import tools.jackson.databind.json.JsonMapper;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Set;
import java.util.SortedMap;
import java.util.TreeMap;
import java.util.function.Predicate;
import java.util.function.Supplier;

public final class SyncChunkRows {

    private final Predicate<String> wanted;
    private final SortedMap<String, List<Object>> rowsById = new TreeMap<>();

    private SyncChunkRows(Predicate<String> wanted) {
        this.wanted = wanted;
    }

    public static SyncChunkRows every() {
        return new SyncChunkRows(id -> true);
    }

    public static SyncChunkRows only(Collection<String> ids) {
        return new SyncChunkRows(Set.copyOf(ids)::contains);
    }

    public void add(String chunkId, Supplier<?> row) {
        if (wanted.test(chunkId)) {
            rowsById.computeIfAbsent(chunkId, ignored -> new ArrayList<>()).add(row.get());
        }
    }

    public List<SyncChunk> chunks(JsonMapper json) {
        return SyncChunk.allOf(rowsById, json);
    }

    public List<SyncChunkEntry> entries(JsonMapper json) {
        return rowsById.entrySet().stream()
                .map(chunk -> SyncChunkEntry.of(SyncChunk.of(chunk.getKey(), json.valueToTree(chunk.getValue()))))
                .toList();
    }
}
