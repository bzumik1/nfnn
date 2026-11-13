package cz.novanadeje.app.shared.interfaces.rest;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Supplier;

import static org.assertj.core.api.Assertions.assertThat;

class SyncChunkRowsTest {

    private final JsonMapper json = JsonMapper.builder().build();

    @Test
    @DisplayName("Given rows of several chunks, when only one chunk is asked for, then only that chunk's rows are built and it equals the same chunk of the whole build")
    void should_build_only_the_asked_chunks_rows_when_one_chunk_is_asked_given_rows_of_several_chunks() {
        AtomicInteger built = new AtomicInteger();
        SyncChunkRows asked = SyncChunkRows.only(List.of("payments:2026-02"));
        SyncChunkRows every = SyncChunkRows.every();

        for (SyncChunkRows rows : List.of(asked, every)) {
            rows.add("payments:2026-01", counted(built, Map.of("id", 1)));
            rows.add("payments:2026-02", counted(built, Map.of("id", 2)));
            rows.add("payments:2026-02", counted(built, Map.of("id", 3)));
            rows.add("donations:2026-02", counted(built, Map.of("id", 4)));
        }

        assertThat(built).as("rows built: two for the asked chunk, four for the whole build").hasValue(6);
        assertThat(asked.chunks(json)).containsExactly(every.chunks(json).stream().filter(chunk -> chunk.id().equals("payments:2026-02")).findFirst().orElseThrow());
    }

    @Test
    @DisplayName("Given rows of several chunks, when the manifest entries are built, then they equal the entries of the whole chunks in the order of their ids")
    void should_equal_the_entries_of_the_chunks_when_entries_are_built_given_rows_of_several_chunks() {
        SyncChunkRows rows = SyncChunkRows.every();
        rows.add("receipts:2026", () -> Map.of("number", "000002"));
        rows.add("audit:2026-10", () -> Map.of("action", "GRANT_ADMIN"));
        rows.add("receipts:2026", () -> new TreeMap<>(Map.of("number", "000001", "year", 2026)));

        assertThat(rows.entries(json)).containsExactlyElementsOf(rows.chunks(json).stream().map(SyncChunkEntry::of).toList());
        assertThat(rows.entries(json)).extracting(SyncChunkEntry::id).containsExactly("audit:2026-10", "receipts:2026");
    }

    private static Supplier<Object> counted(AtomicInteger built, Object row) {
        return () -> {
            built.incrementAndGet();
            return row;
        };
    }
}
