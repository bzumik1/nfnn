package cz.novanadeje.app.regression;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class GoldenFilesTest {

    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final JsonNode PRODUCED = JSON.readTree("{\"source\":\"v2-baseline\",\"pages\":2}");

    @TempDir
    private Path folder;

    @Test
    @DisplayName("Given GOLDEN_FILES=write and a corpus file of the baseline, when a corpus test writes it, then it refuses and the file stays as it is")
    void should_refuse_and_keep_the_file_when_a_corpus_test_writes_it_given_golden_files_write_and_a_corpus_file_of_the_baseline() throws IOException {
        Path file = folder.resolve("receipts").resolve("single-person-cs.json");
        Files.createDirectories(file.getParent());
        Files.writeString(file, "{\"source\":\"v2-baseline\",\"pages\":1}", StandardCharsets.UTF_8);

        assertThatThrownBy(() -> GoldenFiles.assertMatches(file, PRODUCED, true)).isInstanceOf(AssertionError.class)
                .hasMessageContaining("never rewritten");
        assertThat(file).hasContent("{\"source\":\"v2-baseline\",\"pages\":1}");
    }

    @Test
    @DisplayName("Given GOLDEN_FILES=write and no corpus file yet, when a corpus test writes it, then the file holds what the test produced")
    void should_hold_what_the_test_produced_when_a_corpus_test_writes_it_given_golden_files_write_and_no_corpus_file_yet() {
        Path file = folder.resolve("receipts").resolve("yearly-500-gifts-cs.json");

        GoldenFiles.assertMatches(file, PRODUCED, true);

        assertThat(file).hasContent(GoldenFiles.canonical(PRODUCED));
    }
}
