package cz.novanadeje.app.regression;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;

class BaselineDataSetsTest {

    static final List<String> SHARED_CASE_TOPICS = List.of("shared-cases/admin-overview", "shared-cases/donor-summary", "shared-cases/monthly-report",
            "shared-cases/receipts");
    static final List<String> REAL_LOOKING_VALUES = List.of("smtp-brevo.com", "znamenáčková", "znamenáček", "ucetni@stavby.cz");
    private static final JsonMapper JSON = JsonMapper.builder().build();

    @ParameterizedTest
    @ValueSource(strings = {"shared-cases/admin-overview", "shared-cases/donor-summary", "shared-cases/monthly-report", "shared-cases/receipts"})
    @DisplayName("Given a topic of shared cases, when its files are read, then each holds the source, the logic and named cases with an input and an expected value")
    void should_hold_source_logic_and_named_cases_when_the_files_of_a_shared_case_topic_are_read(String topic) throws IOException {
        List<Path> files = jsonFiles(topic);
        assertThat(files).as("case files in %s", topic).isNotEmpty();

        for (Path file : files) {
            JsonNode cases = JSON.readTree(Files.readString(file, StandardCharsets.UTF_8));
            assertThat(cases.properties().stream().map(java.util.Map.Entry::getKey).toList()).as("%s", file).containsExactly("source", "logic", "cases");
            assertThat(cases.get("source").asString()).as("%s", file).isEqualTo(Baseline.SOURCE);
            assertThat(cases.get("logic").asString()).as("%s", file).isNotBlank();
            assertThat(cases.get("cases").isArray() && !cases.get("cases").isEmpty()).as("%s has cases", file).isTrue();
            Set<String> names = new HashSet<>();
            for (JsonNode entry : cases.get("cases")) {
                assertThat(entry.properties().stream().map(java.util.Map.Entry::getKey).toList()).as("%s", file).containsExactly("name", "input", "expected");
                assertThat(names.add(entry.get("name").asString())).as("%s names %s once", file, entry.get("name").asString()).isTrue();
            }
        }
    }

    @Test
    @DisplayName("Given the receipt corpus, the data sets and the screens manifest, when they are read, then none carries a real-looking fixture value")
    void should_carry_no_real_looking_fixture_value_when_the_new_baseline_files_are_read() throws IOException {
        List<Path> files = Stream.concat(SHARED_CASE_TOPICS.stream(), Stream.of("regression/v2/receipts", "regression/v2/screens"))
                .flatMap(folder -> jsonFiles(folder).stream()).toList();
        assertThat(files).isNotEmpty();

        for (Path file : files) {
            String text = Files.readString(file, StandardCharsets.UTF_8).toLowerCase(Locale.ROOT);
            assertThat(REAL_LOOKING_VALUES).as("real-looking values in %s", file).noneMatch(text::contains);
        }
    }

    @Test
    @DisplayName("Given the screens manifest, when it is read, then every route and state has a shot at 390 and at 1280 px with its digest")
    void should_list_every_state_at_both_widths_when_the_screens_manifest_is_read() throws IOException {
        JsonNode manifest = JSON.readTree(Files.readString(GoldenFiles.repositoryRoot().resolve("regression/v2/screens/manifest.json"), StandardCharsets.UTF_8));

        assertThat(manifest.get("source").asString()).isEqualTo(Baseline.SOURCE);
        JsonNode shots = manifest.get("shots");
        assertThat(shots.size()).as("shots").isGreaterThanOrEqualTo(60);
        Set<String> states = new HashSet<>();
        Set<String> files = new HashSet<>();
        for (JsonNode shot : shots) {
            states.add(shot.get("state").asString());
            assertThat(files.add(shot.get("file").asString())).as("%s is listed once", shot.get("file").asString()).isTrue();
            assertThat(shot.get("sha256").asString()).matches("[0-9a-f]{64}");
            assertThat(shot.get("width").asInt()).isIn(390, 1280);
        }
        for (String state : states) {
            assertThat(shots.valueStream().filter(shot -> shot.get("state").asString().equals(state)).map(shot -> shot.get("width").asInt()).toList())
                    .as("widths of %s", state).containsExactlyInAnyOrder(390, 1280);
        }
    }

    private static List<Path> jsonFiles(String folder) {
        Path root = GoldenFiles.repositoryRoot().resolve(folder);
        if (!Files.isDirectory(root)) {
            return List.of();
        }
        try (Stream<Path> files = Files.walk(root)) {
            return files.filter(Files::isRegularFile).filter(file -> file.toString().endsWith(".json")).sorted().toList();
        } catch (IOException unreadable) {
            throw new UncheckedIOException(unreadable);
        }
    }
}
