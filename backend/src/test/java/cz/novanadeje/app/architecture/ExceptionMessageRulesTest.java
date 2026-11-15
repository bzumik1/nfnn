package cz.novanadeje.app.architecture;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;

class ExceptionMessageRulesTest {

    private static final Path MAIN_SOURCES = Path.of("src", "main", "java");

    private static final Pattern PACKAGE = Pattern.compile("^package ([a-z.]+);", Pattern.MULTILINE);
    private static final Pattern TYPE = Pattern.compile("^(?:public )?(?:class|record|interface) ([A-Za-z]+)", Pattern.MULTILINE);

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

    private static final String PLANTED_REASON = """
            package planted.domain;

            public class PlantedReason extends RuntimeException {

                public PlantedReason(String reason) {
                    super("Refused: " + reason);
                }
            }
            """;

    private static final String PLANTED_LEAKED_REASON = """
            package planted.domain;

            public class PlantedLeakedReason extends RuntimeException {

                public PlantedLeakedReason(String reason) {
                    super("Refused: " + reason);
                }
            }
            """;

    private static final String PLANTED_NAME = """
            package planted.domain;

            public record PlantedName(String value) {
            }
            """;

    private static final String PLANTED_LABEL = """
            package planted.domain;

            public record PlantedLabel(String label) {

                public PlantedLabel {
                    if (label.isBlank()) {
                        throw new IllegalArgumentException("Blank label " + label);
                    }
                }

                static PlantedLabel named() {
                    return new PlantedLabel("Name");
                }
            }
            """;

    private static final String PLANTED_CHECK = """
            package planted.domain;

            interface PlantedCheck {

                void check(String label);
            }
            """;

    private static final String PLANTED_OVERRIDING_CHECK = """
            package planted.domain;

            class PlantedOverridingCheck implements PlantedCheck {

                @Override
                public void check(String label) {
                    throw new IllegalStateException("Failed " + label);
                }

                void run() {
                    check("Name");
                }
            }
            """;

    private static final String PLANTED_ADAPTER = """
            package planted.infrastructure;

            import planted.domain.PlantedLeakedReason;
            import planted.domain.PlantedReason;

            class PlantedAdapter {

                void refuses(String header) {
                    if (header.isBlank()) {
                        throw new PlantedReason("the header is blank");
                    }
                    if (header.length() > 10) {
                        throw new PlantedReason("the header is longer than " + 10 + " characters, it has " + header.length());
                    }
                    throw new PlantedLeakedReason("the header " + header + " is unknown");
                }

                void namesTheValueOutsideTheTwoLayers(String header) {
                    throw new IllegalArgumentException("Bad header " + header);
                }
            }
            """;

    private static final String PLANTED_MESSAGES = """
            package planted.application;

            import planted.domain.PlantedFailure;
            import planted.domain.PlantedName;

            import java.util.List;
            import java.util.Locale;
            import java.util.Optional;
            import java.util.function.Consumer;

            class PlantedMessages {

                private final String label;
                private String mutableLabel = "Name";

                PlantedMessages(String label) {
                    this.label = label;
                }

                void concatenatesAParameter(String symbol) {
                    throw new IllegalArgumentException("Bad symbol " + symbol);
                }

                void concatenatesAField() {
                    throw new IllegalStateException("Bad " + label);
                }

                void concatenatesAFieldOthersMayChange() {
                    throw new IllegalStateException("Bad " + mutableLabel);
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

                void capturesAValueInALambda(Optional<String> found, String slug) {
                    found.orElseThrow(() -> new IllegalStateException("Missing " + slug));
                }

                void feedsAPrivateHelperAValue(String name) {
                    requireText(name, name);
                }

                private void requireText(String value, String label) {
                    if (value.isBlank()) {
                        throw new IllegalArgumentException(label + " is required");
                    }
                }

                void feedsAHelperAConstantAndAValue(String value) {
                    requireField(value, "Name");
                    requireField(value, value);
                }

                void requireField(String value, String label) {
                    if (value.isBlank()) {
                        throw new IllegalArgumentException(label + " is required");
                    }
                }

                Consumer<String> referencesAHelper() {
                    requireReferenced("Name");
                    return this::requireReferenced;
                }

                private void requireReferenced(String label) {
                    throw new IllegalArgumentException(label + " is required");
                }

                @Deprecated
                void requireAnnotated(String label) {
                    throw new IllegalArgumentException(label + " is required");
                }

                void callsTheAnnotatedHelper() {
                    requireAnnotated("Name");
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

                private final String field;

                enum Kind { ONE, TWO }

                private PlantedClosedMessages(String field) {
                    this.field = field;
                }

                static PlantedClosedMessages named() {
                    return new PlantedClosedMessages("name");
                }

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

                void namesAFieldFedOnlyConstants() {
                    throw new IllegalStateException("The " + field + " is missing");
                }

                void feedsHelpersConstants(String name) {
                    requireLabelled(name, "Name");
                    requireLabelled(name, MAX_LENGTH > 5 ? "Long name" : "Short name");
                    requireNamed(name, "Name");
                }

                private void requireLabelled(String value, String label) {
                    if (value.isBlank()) {
                        throw new IllegalArgumentException(label + " is required");
                    }
                }

                void requireNamed(String value, String label) {
                    if (value.isBlank()) {
                        throw new IllegalArgumentException(label + " is required");
                    }
                }
            }
            """;

    @Test
    @DisplayName("Given the main sources, when the exception messages of domain and application code are read, then none is built from an open value")
    void should_build_no_exception_message_from_an_open_value_when_read_given_the_main_sources() {
        List<Path> sources = ExceptionMessageValues.javaSources(MAIN_SOURCES);

        assertThat(sources).isNotEmpty();
        assertThat(ExceptionMessageValues.foundIn(sources)).isEmpty();
    }

    @Test
    @DisplayName("Given planted messages built from open values in every way, when they are read, then each one is reported")
    void should_report_every_planted_message_when_read_given_messages_built_from_open_values(@TempDir Path root) {
        List<Path> sources = planted(root, PLANTED_FAILURE, PLANTED_REASON, PLANTED_LEAKED_REASON, PLANTED_NAME, PLANTED_LABEL,
                PLANTED_CHECK, PLANTED_OVERRIDING_CHECK, PLANTED_ADAPTER, PLANTED_MESSAGES);

        assertThat(ExceptionMessageValues.foundIn(sources)).extracting(ExceptionMessageRulesTest::siteOf).containsExactlyInAnyOrder(
                "PlantedFailure.<init>",
                "PlantedLeakedReason.<init>",
                "PlantedLabel.<init>",
                "PlantedOverridingCheck.check",
                "PlantedMessages.concatenatesAParameter",
                "PlantedMessages.concatenatesAField",
                "PlantedMessages.concatenatesAFieldOthersMayChange",
                "PlantedMessages.concatenatesAValueObject",
                "PlantedMessages.readsAValueObject",
                "PlantedMessages.formatsAParameter",
                "PlantedMessages.formatsWithFormatted",
                "PlantedMessages.appendsToABuilder",
                "PlantedMessages.joinsAList",
                "PlantedMessages.passesTheValueAsTheMessage",
                "PlantedMessages.passesTheValueToAForwardingFailure",
                "PlantedMessages.capturesAValueInALambda",
                "PlantedMessages.requireText",
                "PlantedMessages.requireField",
                "PlantedMessages.requireReferenced",
                "PlantedMessages.requireAnnotated");
    }

    @Test
    @DisplayName("Given planted messages built from closed values only, when they are read, then none is reported")
    void should_report_nothing_when_read_given_messages_built_from_closed_values(@TempDir Path root) {
        List<Path> sources = planted(root, PLANTED_CLOSED_MESSAGES);

        assertThat(ExceptionMessageValues.foundIn(sources)).isEmpty();
    }

    private static String siteOf(String report) {
        return report.substring(0, report.indexOf(' '));
    }

    private static List<Path> planted(Path root, String... sources) {
        return Arrays.stream(sources).map(source -> written(root, source)).toList();
    }

    private static Path written(Path root, String source) {
        Matcher packageName = PACKAGE.matcher(source);
        Matcher typeName = TYPE.matcher(source);
        assertThat(packageName.find() && typeName.find()).as("a planted source names its package and type").isTrue();
        try {
            Path folder = Files.createDirectories(root.resolve(packageName.group(1).replace('.', '/')));
            return Files.writeString(folder.resolve(typeName.group(1) + ".java"), source);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
