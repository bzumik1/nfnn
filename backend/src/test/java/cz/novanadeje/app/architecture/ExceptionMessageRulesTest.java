package cz.novanadeje.app.architecture;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class ExceptionMessageRulesTest {

    private static final Path MAIN_SOURCES = Path.of("src", "main", "java");

    private static final String PLANTED_FAILURE = """
            package planted.domain;

            public class PlantedFailure extends RuntimeException {

                public PlantedFailure(String message) {
                    super(message);
                }

                public PlantedFailure(String code, String slug) {
                    super("No article " + slug);
                }
            }
            """;

    private static final String PLANTED_NAME = """
            package planted.domain;

            public record PlantedName(String value) {
            }
            """;

    private static final String PLANTED_MESSAGES = """
            package planted.application;

            import planted.domain.PlantedFailure;
            import planted.domain.PlantedName;

            import java.util.List;
            import java.util.Locale;

            class PlantedMessages {

                private final String label = "label".strip();

                void concatenatesAParameter(String symbol) {
                    throw new IllegalArgumentException("Bad symbol " + symbol);
                }

                void concatenatesAField() {
                    throw new IllegalStateException("Bad " + label);
                }

                void concatenatesAValueObject(PlantedName name) {
                    throw new IllegalArgumentException("Bad name " + name);
                }

                void readsAValueObject(PlantedName name) {
                    throw new IllegalArgumentException("Bad name " + name.value());
                }

                void formatsAParameter(String tag) {
                    throw new IllegalArgumentException(String.format(Locale.ROOT, "Bad tag %s", tag));
                }

                void formatsWithFormatted(String code) {
                    throw new IllegalArgumentException("Bad code %s".formatted(code));
                }

                void appendsToABuilder(String account) {
                    throw new IllegalArgumentException(new StringBuilder("Bad account ").append(account).toString());
                }

                void joinsAList(List<String> names) {
                    throw new IllegalArgumentException("Bad names " + String.join(", ", names));
                }

                void passesTheValueAsTheMessage(String email) {
                    throw new IllegalArgumentException(email);
                }

                void passesTheValueToAForwardingFailure(String iban) {
                    throw new PlantedFailure(iban);
                }

                void capturesAValueInALambda(java.util.Optional<String> found, String slug) {
                    found.orElseThrow(() -> new IllegalStateException("Missing " + slug));
                }
            }
            """;

    private static final String PLANTED_CLOSED_MESSAGES = """
            package planted.application;

            import java.time.Duration;
            import java.time.LocalDate;
            import java.util.UUID;

            class PlantedClosedMessages {

                private static final String PREFIX = "app.planted.";
                private static final int MAX_LENGTH = 10;

                enum Kind { ONE, TWO }

                void namesAConstant() {
                    throw new IllegalArgumentException(PREFIX + "ttl must be positive");
                }

                void namesALength(String value) {
                    throw new IllegalArgumentException("A value holds at most " + MAX_LENGTH + " characters, but holds " + value.length());
                }

                void namesClosedValues(Duration ttl, LocalDate day, UUID id, Kind kind, int count) {
                    throw new IllegalStateException("ttl " + ttl + " day " + day + " id " + id + " kind " + kind + " name " + kind.name() + " count " + count);
                }

                void namesAClass(Object value) {
                    throw new IllegalStateException("Unexpected " + value.getClass().getSimpleName());
                }

                void keepsACause(String value, RuntimeException cause) {
                    throw new IllegalStateException("Could not read the value", cause);
                }
            }
            """;

    @Test
    @DisplayName("Given the domain and application sources, when their exception messages are read, then none is built from an open value")
    void should_build_no_exception_message_from_an_open_value_when_read_given_the_domain_and_application_sources() {
        List<Path> sources = ExceptionMessageValues.domainAndApplicationSources(MAIN_SOURCES);

        assertThat(sources).isNotEmpty();
        assertThat(ExceptionMessageValues.foundIn(sources)).isEmpty();
    }

    @Test
    @DisplayName("Given planted messages built from open values in every way, when they are read, then each one is reported")
    void should_report_every_planted_message_when_read_given_messages_built_from_open_values(@TempDir Path root) throws IOException {
        List<Path> sources = planted(root, PLANTED_FAILURE, PLANTED_NAME, PLANTED_MESSAGES);

        assertThat(ExceptionMessageValues.foundIn(sources))
                .extracting(report -> report.substring(0, report.indexOf(' ')))
                .containsExactlyInAnyOrder(
                        "PlantedFailure.java:10",
                        "PlantedMessages.java:14",
                        "PlantedMessages.java:18",
                        "PlantedMessages.java:22",
                        "PlantedMessages.java:26",
                        "PlantedMessages.java:30",
                        "PlantedMessages.java:34",
                        "PlantedMessages.java:38",
                        "PlantedMessages.java:42",
                        "PlantedMessages.java:46",
                        "PlantedMessages.java:50",
                        "PlantedMessages.java:54");
    }

    @Test
    @DisplayName("Given planted messages built from closed values only, when they are read, then none is reported")
    void should_report_nothing_when_read_given_messages_built_from_closed_values(@TempDir Path root) throws IOException {
        List<Path> sources = planted(root, PLANTED_CLOSED_MESSAGES);

        assertThat(ExceptionMessageValues.foundIn(sources)).isEmpty();
    }

    @Test
    @DisplayName("Given planted sources outside a domain or application package, when the sources are listed, then only those of the two layers are read")
    void should_list_only_domain_and_application_files_when_listed_given_sources_of_every_layer(@TempDir Path root) throws IOException {
        List<Path> sources = planted(root, PLANTED_FAILURE, PLANTED_MESSAGES);
        Path adapter = Files.createDirectories(root.resolve("planted/infrastructure")).resolve("PlantedAdapter.java");
        Files.writeString(adapter, "package planted.infrastructure; class PlantedAdapter { }");

        assertThat(ExceptionMessageValues.domainAndApplicationSources(root)).containsExactlyInAnyOrderElementsOf(sources);
    }

    private static List<Path> planted(Path root, String... sources) throws IOException {
        return java.util.Arrays.stream(sources).map(source -> written(root, source)).toList();
    }

    private static Path written(Path root, String source) {
        String packageName = source.lines().findFirst().orElseThrow().replace("package ", "").replace(";", "").strip();
        String className = source.lines()
                .filter(line -> line.startsWith("public class ") || line.startsWith("public record ") || line.startsWith("class "))
                .findFirst().orElseThrow()
                .replaceFirst("^(public )?(class|record) ", "")
                .replaceFirst("[^A-Za-z].*$", "");
        try {
            Path folder = Files.createDirectories(root.resolve(packageName.replace('.', '/')));
            return Files.writeString(folder.resolve(className + ".java"), source);
        } catch (IOException e) {
            throw new java.io.UncheckedIOException(e);
        }
    }
}
