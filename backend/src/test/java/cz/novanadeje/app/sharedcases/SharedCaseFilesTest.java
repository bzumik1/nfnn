package cz.novanadeje.app.sharedcases;

import cz.novanadeje.app.regression.GoldenFiles;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestFactory;
import tools.jackson.databind.JsonNode;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;

class SharedCaseFilesTest {

    static final List<String> SEARCHED_FOLDERS = List.of(".github", "backend/src", "deploy", "docs", "frontend/e2e", "frontend/scripts", "frontend/src",
            "mcp/src", "mcp/test", "scripts", "test-cases");
    static final Set<String> SKIPPED_FOLDERS = Set.of("node_modules", "build", "dist", ".angular", "test-results", "playwright-report");

    private final SharedCaseCopies copies = SharedCaseCopies.ofRepository();

    @TestFactory
    @DisplayName("Given every shared case file, when it is read, then it holds its source, its logic and cases named once, each with an input and an expected value")
    Stream<DynamicTest> should_hold_source_logic_and_cases_named_once_with_input_and_expected_when_every_shared_case_file_is_read() {
        assertThat(SharedCases.caseFiles()).as("shared case files").isNotEmpty();
        return SharedCases.caseFiles().stream().map(caseFile -> DynamicTest.dynamicTest(
                "Given " + caseFile + ", when it is read, then it holds its source, its logic and cases named once, each with an input and an expected value", () -> {
                    JsonNode file = SharedCases.tree(caseFile);
                    assertThat(file.propertyNames()).as("fields of %s", caseFile).containsExactly("source", "logic", "cases");
                    assertThat(file.get("source").asString()).as("source of %s", caseFile).isIn(SharedCases.SOURCES);
                    assertThat(file.get("logic").asString()).as("logic of %s", caseFile).isNotBlank();
                    assertThat(file.get("cases").isArray() && !file.get("cases").isEmpty()).as("%s has cases", caseFile).isTrue();
                    Set<String> names = new HashSet<>();
                    for (JsonNode sharedCase : file.get("cases")) {
                        assertThat(sharedCase.propertyNames()).as("fields of a case in %s", caseFile).containsExactly("name", "input", "expected");
                        assertThat(names.add(sharedCase.get("name").asString())).as("%s names %s once", caseFile, sharedCase.get("name").asString()).isTrue();
                    }
                }));
    }

    @Test
    @DisplayName("Given the shared case files and the topic schemas, when they are paired, then every case file has its schema and every schema its case file")
    void should_pair_every_case_file_with_its_schema_when_the_case_files_and_the_topic_schemas_are_paired() {
        assertThat(SharedCases.caseFiles().stream().map(SharedCases::schemaOf).toList()).containsExactlyInAnyOrderElementsOf(SharedCases.topicSchemas());
        assertThat(SharedCases.topicSchemas().stream().map(SharedCases::caseFileOf).toList()).containsExactlyInAnyOrderElementsOf(SharedCases.caseFiles());
    }

    @Test
    @DisplayName("Given a JSON file that holds a case file with its fields in another order and other spacing, when it is checked for copies, then it is reported")
    void should_report_the_copy_when_a_json_file_is_checked_given_it_holds_a_case_file_reordered() {
        String caseFile = "qr/totp.json";
        JsonNode file = SharedCases.tree(caseFile);
        String reordered = "{\"cases\":" + file.get("cases") + ",\"logic\":" + file.get("logic") + ",\"source\":" + file.get("source") + "}";

        assertThat(copies.in("fixture.json", reordered)).containsExactly("fixture.json holds a copy of shared-cases/" + caseFile);
    }

    @Test
    @DisplayName("Given a JSON file that nests one case's expected value with its fields in another order, when it is checked for copies, then it is reported")
    void should_report_the_copy_when_a_json_file_is_checked_given_it_nests_an_expected_value_reordered() {
        SharedCase sharedCase = SharedCases.read("donor-summary/summary.json").cases().get(1);
        List<String> fields = new ArrayList<>(sharedCase.expected().propertyNames());
        StringBuilder reordered = new StringBuilder("{\"answers\":[{");
        for (int index = fields.size() - 1; index >= 0; index--) {
            reordered.append('"').append(fields.get(index)).append("\":").append(sharedCase.expected().get(fields.get(index))).append(index > 0 ? "," : "");
        }
        reordered.append("}]}");

        assertThat(copies.in("mock.json", reordered.toString()))
                .containsExactly("mock.json holds the expected value of \"" + sharedCase.name() + "\" from shared-cases/donor-summary/summary.json");
    }

    @Test
    @DisplayName("Given a script that holds a case's QR matrix as quoted rows, when it is checked for copies, then it is reported")
    void should_report_the_copy_when_a_script_is_checked_given_it_holds_a_qr_matrix_as_quoted_rows() {
        JsonNode matrix = SharedCases.read("qr/payment.json").cases().getFirst().expected().get("matrix");
        StringBuilder script = new StringBuilder("export const QR = [\n");
        matrix.valueStream().forEach(row -> script.append("  '").append(row.asString()).append("',\n"));
        script.append("];\n");

        assertThat(copies.in("qr.ts", script.toString())).containsExactly("qr.ts holds the matrix of a QR case from shared-cases/qr");
    }

    @Test
    @DisplayName("Given a JSON file whose only shared value is a one-field object, when it is checked for copies, then nothing is reported")
    void should_report_nothing_when_a_json_file_is_checked_given_its_only_shared_value_is_a_one_field_object() {
        JsonNode expected = SharedCases.read("receipts/formatting.json").cases().getFirst().expected();

        assertThat(expected.size()).isEqualTo(1);
        assertThat(copies.in("labels.json", "{\"label\":" + expected + "}")).isEmpty();
    }

    @Test
    @DisplayName("Given the shared case files, when the repository's sources, tests and scripts are searched, then none holds a copy of a case file, an expected value or a QR matrix")
    void should_hold_no_copy_of_a_case_file_an_expected_value_or_a_qr_matrix_when_the_repository_is_searched() {
        List<String> found = new ArrayList<>();
        for (Path file : searchedFiles()) {
            String relative = GoldenFiles.repositoryRoot().relativize(file).toString().replace('\\', '/');
            textOf(file).ifPresent(text -> found.addAll(copies.in(relative, text)));
        }

        assertThat(found).as("copies of shared cases; read the case file instead").isEmpty();
    }

    private static List<Path> searchedFiles() {
        List<Path> files = new ArrayList<>();
        for (String folder : SEARCHED_FOLDERS) {
            Path root = GoldenFiles.repositoryRoot().resolve(folder);
            if (!Files.isDirectory(root)) {
                continue;
            }
            try (Stream<Path> walk = Files.walk(root)) {
                walk.filter(Files::isRegularFile)
                        .filter(file -> Stream.of(root.relativize(file).toString().replace('\\', '/').split("/")).noneMatch(SKIPPED_FOLDERS::contains))
                        .forEach(files::add);
            } catch (IOException unreadable) {
                throw new UncheckedIOException(unreadable);
            }
        }
        return files;
    }

    private static Optional<String> textOf(Path file) {
        try {
            return Optional.of(StandardCharsets.UTF_8.newDecoder().decode(ByteBuffer.wrap(Files.readAllBytes(file))).toString());
        } catch (CharacterCodingException binary) {
            return Optional.empty();
        } catch (IOException unreadable) {
            throw new UncheckedIOException(unreadable);
        }
    }
}
