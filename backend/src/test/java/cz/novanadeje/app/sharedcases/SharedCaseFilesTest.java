package cz.novanadeje.app.sharedcases;

import cz.novanadeje.app.regression.GoldenFiles;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestFactory;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

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
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;

class SharedCaseFilesTest {

    static final List<String> SEARCHED_FOLDERS = List.of(".github", "backend/src", "deploy", "docs", "frontend/e2e", "frontend/scripts", "frontend/src",
            "mcp/src", "mcp/test", "scripts", "test-cases");
    static final Set<String> SKIPPED_FOLDERS = Set.of("node_modules", "build", "dist", ".angular", "test-results", "playwright-report");
    static final List<String> QR_CASE_FILES = List.of("qr/payment.json", "qr/totp.json");
    static final String PAYMENT_CASES = "qr/payment.json";
    static final Pattern MATRIX_NOISE = Pattern.compile("[\\s\"'`,+\\[\\]]");

    private final SharedCaseSchemas schemas = new SharedCaseSchemas();

    @TestFactory
    @DisplayName("Given every shared case file, when it is checked against its JSON Schema, then it is valid and names each case once")
    Stream<DynamicTest> should_be_valid_and_name_each_case_once_when_every_shared_case_file_is_checked_against_its_schema() {
        assertThat(SharedCases.caseFiles()).as("shared case files").isNotEmpty();
        return SharedCases.caseFiles().stream().map(caseFile -> DynamicTest.dynamicTest(
                "Given " + caseFile + ", when it is checked against " + SharedCases.schemaOf(caseFile) + ", then it is valid and names each case once", () -> {
                    assertThat(schemas.violations(caseFile, SharedCases.tree(caseFile))).as("violations of %s", caseFile).isEmpty();
                    Set<String> names = new HashSet<>();
                    SharedCases.read(caseFile).cases().forEach(sharedCase -> assertThat(names.add(sharedCase.name()))
                            .as("%s names %s once", caseFile, sharedCase.name()).isTrue());
                }));
    }

    @Test
    @DisplayName("Given the shared case files and the topic schemas, when they are paired, then every case file has its schema and every schema its case file")
    void should_pair_every_case_file_with_its_schema_when_the_case_files_and_the_topic_schemas_are_paired() {
        assertThat(SharedCases.caseFiles().stream().map(SharedCases::schemaOf).toList()).containsExactlyInAnyOrderElementsOf(SharedCases.topicSchemas());
        assertThat(SharedCases.topicSchemas().stream().map(SharedCases::caseFileOf).toList()).containsExactlyInAnyOrderElementsOf(SharedCases.caseFiles());
    }

    @Test
    @DisplayName("Given a payment case whose matrix holds a module other than 0 and 1, when it is checked against its schema, then it is refused")
    void should_refuse_the_case_when_it_is_checked_against_its_schema_given_a_matrix_module_other_than_0_and_1() {
        JsonNode file = SharedCases.tree(PAYMENT_CASES);
        ArrayNode matrix = (ArrayNode) file.get("cases").get(0).get("expected").get("matrix");
        matrix.set(0, matrix.get(0).asString().replaceFirst("1", "2"));

        assertThat(schemas.violations(PAYMENT_CASES, file)).anyMatch(violation -> violation.startsWith("/cases/0/expected/matrix/0 "));
    }

    @Test
    @DisplayName("Given a payment case with a field its schema does not know, when it is checked against its schema, then it is refused")
    void should_refuse_the_case_when_it_is_checked_against_its_schema_given_a_field_the_schema_does_not_know() {
        JsonNode file = SharedCases.tree(PAYMENT_CASES);
        ((ObjectNode) file.get("cases").get(0).get("expected")).put("spaydText", "SPD*1.0");

        assertThat(schemas.violations(PAYMENT_CASES, file)).anyMatch(violation -> violation.startsWith("/cases/0/expected ") && violation.contains("spaydText"));
    }

    @Test
    @DisplayName("Given a payment case without its expected value, when it is checked against its schema, then it is refused")
    void should_refuse_the_case_when_it_is_checked_against_its_schema_given_no_expected_value() {
        JsonNode file = SharedCases.tree(PAYMENT_CASES);
        ((ObjectNode) file.get("cases").get(0)).remove("expected");

        assertThat(schemas.violations(PAYMENT_CASES, file)).anyMatch(violation -> violation.startsWith("/cases/0 ") && violation.contains("expected"));
    }

    @Test
    @DisplayName("Given the shared case files, when the repository's sources, tests and scripts are searched, then none holds a copy of a case file or of a case's QR matrix")
    void should_hold_no_copy_of_a_case_file_or_a_qr_matrix_when_the_repository_is_searched() {
        Map<String, String> caseFiles = new TreeMap<>();
        SharedCases.caseFiles().forEach(caseFile -> caseFiles.put(caseFile, SharedCases.text(caseFile).strip()));
        Set<String> matrices = new TreeSet<>();
        QR_CASE_FILES.forEach(caseFile -> SharedCases.read(caseFile).cases().stream()
                .filter(sharedCase -> sharedCase.expected().has("matrix"))
                .forEach(sharedCase -> matrices.add(sharedCase.expected().get("matrix").valueStream().map(JsonNode::asString).collect(Collectors.joining()))));
        assertThat(matrices).as("matrices of the QR cases").isNotEmpty();

        List<String> copies = new ArrayList<>();
        for (Path file : searchedFiles()) {
            String relative = GoldenFiles.repositoryRoot().relativize(file).toString().replace('\\', '/');
            Optional<String> readable = textOf(file);
            if (readable.isEmpty()) {
                continue;
            }
            String text = readable.get();
            caseFiles.forEach((caseFile, content) -> {
                if (text.strip().equals(content)) {
                    copies.add(relative + " is a copy of " + SharedCases.FOLDER + "/" + caseFile);
                }
            });
            String modules = MATRIX_NOISE.matcher(text).replaceAll("");
            if (matrices.stream().anyMatch(modules::contains)) {
                copies.add(relative + " holds the matrix of a QR case from " + SharedCases.FOLDER + "/qr");
            }
        }

        assertThat(copies).as("copies of shared cases; read the case file instead").isEmpty();
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
