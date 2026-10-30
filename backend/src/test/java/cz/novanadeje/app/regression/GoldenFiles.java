package cz.novanadeje.app.regression;

import cz.novanadeje.app.cucumber.transcript.ApiTranscripts;
import cz.novanadeje.app.support.CanonicalJson;
import org.junit.jupiter.api.Assumptions;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

public final class GoldenFiles {

    private static final String MODE = "golden.files";
    private static final String WRITE = "write";
    private static final JsonMapper JSON = JsonMapper.builder().build();

    private GoldenFiles() {
    }

    public static Path repositoryRoot() {
        Path directory = Path.of("").toAbsolutePath();
        while (directory != null && !(Files.isDirectory(directory.resolve("backend")) && Files.isDirectory(directory.resolve("frontend")))) {
            directory = directory.getParent();
        }
        if (directory == null) {
            throw new IllegalStateException("The repository root is not above " + Path.of("").toAbsolutePath());
        }
        return directory;
    }

    public static String canonical(JsonNode node) {
        return CanonicalJson.write(node);
    }

    public static void assertMatches(String relativePath, JsonNode actual) {
        Path file = repositoryRoot().resolve(relativePath);
        String expected = canonical(actual);
        try {
            if (WRITE.equals(System.getProperty(MODE))) {
                Files.createDirectories(file.getParent());
                Files.writeString(file, expected, StandardCharsets.UTF_8);
                return;
            }
            assertThat(file).as("%s is missing: run GOLDEN_FILES=write ./gradlew test --tests \"%s\" -PnoCucumber and review the new file",
                    relativePath, callerTestClass()).exists();
            List<String> recorded = Files.readString(file, StandardCharsets.UTF_8).lines().toList();
            assertThat(expected.lines().toList()).as("%s no longer matches what v2 produced", relativePath).containsExactlyElementsOf(recorded);
        } catch (IOException unreadable) {
            throw new UncheckedIOException(unreadable);
        }
    }

    public static void generateSharedCases(String relativePath, JsonNode generated) {
        generateSharedCases(repositoryRoot().resolve(relativePath), generated, WRITE.equals(System.getProperty(MODE)));
    }

    static void generateSharedCases(Path file, JsonNode generated, boolean writing) {
        Assumptions.assumeTrue(writing, () -> file.getFileName() + " is the specification of its computation, changed by hand and checked by its runner; "
                + "its v2 generator runs only under GOLDEN_FILES=write");
        try {
            if (Files.exists(file)) {
                String source = JSON.readTree(Files.readString(file, StandardCharsets.UTF_8)).path("source").asString();
                assertThat(source).as("%s was edited by hand since the v2 baseline, and generating it again would undo the edit", file)
                        .isEqualTo(ApiTranscripts.SOURCE);
            }
            Files.createDirectories(file.getParent());
            Files.writeString(file, canonical(generated), StandardCharsets.UTF_8);
        } catch (IOException unreadable) {
            throw new UncheckedIOException(unreadable);
        }
    }

    private static String callerTestClass() {
        return StackWalker.getInstance().walk(frames -> frames.map(StackWalker.StackFrame::getClassName)
                .filter(name -> !name.equals(GoldenFiles.class.getName()))
                .findFirst()
                .map(name -> "*" + name.substring(name.lastIndexOf('.') + 1))
                .orElse("*regression*"));
    }
}
