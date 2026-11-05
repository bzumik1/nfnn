package cz.novanadeje.app.shared.interfaces.rest;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class SyncChunkTest {

    private static final JsonMapper JSON = JsonMapper.builder().build();

    @Test
    @DisplayName("Given served chunks, when ids are asked for twice, out of order and unknown, then each served one comes once in the asked order and the others are named missing")
    void should_answer_asked_chunks_in_asked_order_when_asked_given_repeated_and_unknown_ids() {
        SyncChunk first = SyncChunk.of("a:2026-01", JSON.valueToTree(List.of(1)));
        SyncChunk second = SyncChunk.of("a:2026-02", JSON.valueToTree(List.of(2)));

        SyncChunk.Asked asked = SyncChunk.asked(List.of(first, second), List.of("a:2026-02", "b", "a:2026-01", "a:2026-02", "b"));

        assertThat(asked.chunks()).containsExactly(second, first);
        assertThat(asked.missing()).containsExactly("b");
    }
}
