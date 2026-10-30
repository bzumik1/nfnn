package cz.novanadeje.app.sharedcases;

import cz.novanadeje.app.cucumber.transcript.ApiTranscripts;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Set;
import java.util.stream.Stream;

public final class SharedCases {

    public static final String FOLDER = "shared-cases";
    public static final String SCHEMAS = "schemas";
    public static final String DEFINITIONS = "defs";
    public static final String EDITED = "edited";
    public static final Set<String> SOURCES = Set.of(ApiTranscripts.SOURCE, EDITED);
    static final String CASE_SUFFIX = ".json";
    static final String SCHEMA_SUFFIX = ".schema.json";
    private static final JsonMapper JSON = JsonMapper.builder().build();

    private SharedCases() {
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

    public static Path root() {
        return repositoryRoot().resolve(FOLDER);
    }

    public static List<String> caseFiles() {
        return relativeFiles(root(), CASE_SUFFIX).stream().filter(file -> !file.startsWith(SCHEMAS + "/")).toList();
    }

    public static List<String> topicSchemas() {
        return relativeFiles(root().resolve(SCHEMAS), SCHEMA_SUFFIX).stream()
                .filter(file -> !file.startsWith(DEFINITIONS + "/"))
                .map(file -> SCHEMAS + "/" + file)
                .toList();
    }

    public static String schemaOf(String caseFile) {
        return SCHEMAS + "/" + caseFile.substring(0, caseFile.length() - CASE_SUFFIX.length()) + SCHEMA_SUFFIX;
    }

    public static String caseFileOf(String topicSchema) {
        return topicSchema.substring(SCHEMAS.length() + 1, topicSchema.length() - SCHEMA_SUFFIX.length()) + CASE_SUFFIX;
    }

    public static SharedCaseFile read(String caseFile) {
        return JSON.treeToValue(tree(caseFile), SharedCaseFile.class);
    }

    public static JsonNode tree(String caseFile) {
        return JSON.readTree(text(caseFile));
    }

    public static String text(String relativePath) {
        try {
            return Files.readString(root().resolve(relativePath), StandardCharsets.UTF_8);
        } catch (IOException unreadable) {
            throw new UncheckedIOException(unreadable);
        }
    }

    private static List<String> relativeFiles(Path folder, String suffix) {
        if (!Files.isDirectory(folder)) {
            return List.of();
        }
        try (Stream<Path> files = Files.walk(folder)) {
            return files.filter(Files::isRegularFile)
                    .map(file -> folder.relativize(file).toString().replace('\\', '/'))
                    .filter(file -> file.endsWith(suffix))
                    .sorted()
                    .toList();
        } catch (IOException unreadable) {
            throw new UncheckedIOException(unreadable);
        }
    }
}
