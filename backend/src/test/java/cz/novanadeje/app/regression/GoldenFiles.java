package cz.novanadeje.app.regression;

import cz.novanadeje.app.support.CanonicalJson;
import tools.jackson.databind.JsonNode;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static cz.novanadeje.app.sharedcases.SharedCases.repositoryRoot;
import static org.assertj.core.api.Assertions.assertThat;

public final class GoldenFiles {

    private static final String MODE = "golden.files";
    private static final String WRITE = "write";

    private GoldenFiles() {
    }

    public static String canonical(JsonNode node) {
        return CanonicalJson.write(node);
    }

    public static void assertMatches(String relativePath, JsonNode actual) {
        assertMatches(repositoryRoot().resolve(relativePath), relativePath, actual, WRITE.equals(System.getProperty(MODE)));
    }

    static void assertMatches(Path file, JsonNode actual, boolean writing) {
        assertMatches(file, file.toString(), actual, writing);
    }

    private static void assertMatches(Path file, String relativePath, JsonNode actual, boolean writing) {
        String expected = canonical(actual);
        try {
            if (writing) {
                assertThat(file).as("%s is part of the v2 baseline and is never rewritten: record a new sample from the commit in regression/v2/BASELINE_COMMIT, "
                        + "or declare the difference in regression/v2/changes/", relativePath).doesNotExist();
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

    private static String callerTestClass() {
        return StackWalker.getInstance().walk(frames -> frames.map(StackWalker.StackFrame::getClassName)
                .filter(name -> !name.equals(GoldenFiles.class.getName()))
                .findFirst()
                .map(name -> "*" + name.substring(name.lastIndexOf('.') + 1))
                .orElse("*regression*"));
    }
}
