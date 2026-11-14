package cz.novanadeje.app.cucumber;

import io.cucumber.gherkin.GherkinParser;
import io.cucumber.messages.types.Envelope;
import io.cucumber.messages.types.Pickle;
import io.cucumber.messages.types.PickleTag;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.platform.suite.api.ExcludeTags;
import org.junit.platform.suite.api.IncludeTags;
import org.junit.platform.suite.api.Suite;

import java.io.IOException;
import java.net.URISyntaxException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;

class AcceptanceSuitesPartitionTest {

    private static final String SUITE_CLASS_SUFFIX = "AcceptanceTests.class";
    private static final Pattern PLAIN_TAG = Pattern.compile("[a-z][a-z-]*");
    private static final Map<Class<?>, Set<String>> CONTEXTS_PER_SUITE = Map.of(
            DonorsOperationsContactAcceptanceTests.class, Set.of("donors", "operations", "contact"),
            DonationsContentAcceptanceTests.class, Set.of("donations", "content"));

    private static Path features;
    private static List<Scenario> scenarios;
    private static List<Class<?>> suites;

    @BeforeAll
    static void readTheFeaturesAndTheSuites() throws IOException, URISyntaxException, ClassNotFoundException {
        features = Path.of(Objects.requireNonNull(AcceptanceSuitesPartitionTest.class.getResource("/features")).toURI());
        scenarios = scenarios(features);
        suites = suites();
    }

    @Test
    @DisplayName("Given the acceptance features and the suites the acceptance task runs, when each scenario's tags are matched against each suite's tags, then every scenario is selected by exactly one suite, so none is lost and none runs twice")
    void should_select_every_scenario_by_exactly_one_suite_when_tags_are_matched_given_the_acceptance_suites() {
        assertThat(scenarios).isNotEmpty();
        assertThat(suites).hasSizeGreaterThanOrEqualTo(2);

        List<String> notSelectedOnce = scenarios.stream()
                .map(scenario -> scenario.name() + " selected by " + suites.stream().filter(suite -> selects(suite, scenario.tags())).map(Class::getSimpleName).toList())
                .filter(selection -> !selection.matches(".* selected by \\[[A-Za-z]+\\]"))
                .toList();

        assertThat(notSelectedOnce).isEmpty();
    }

    @Test
    @DisplayName("Given the acceptance suites, when the scenarios each selects are grouped by their context folder, then each suite runs whole contexts, donors with operations and contact in one fork against donations with content in the other, the split of the measured scenario time that balances the two forks best")
    void should_run_the_balanced_contexts_in_each_suite_when_grouped_by_context_given_the_acceptance_suites() {
        assertThat(suites).containsExactlyInAnyOrderElementsOf(CONTEXTS_PER_SUITE.keySet());

        CONTEXTS_PER_SUITE.forEach((suite, contexts) -> {
            Set<String> selected = scenarios.stream().filter(scenario -> selects(suite, scenario.tags())).map(Scenario::context)
                    .collect(Collectors.toCollection(TreeSet::new));
            assertThat(selected).as(suite.getSimpleName()).containsExactlyInAnyOrderElementsOf(contexts);
        });
    }

    private static boolean selects(Class<?> suite, Set<String> tags) {
        List<String> included = tagsOf(suite, Optional.ofNullable(suite.getAnnotation(IncludeTags.class)).map(IncludeTags::value).orElse(new String[0]));
        List<String> excluded = tagsOf(suite, Optional.ofNullable(suite.getAnnotation(ExcludeTags.class)).map(ExcludeTags::value).orElse(new String[0]));
        return (included.isEmpty() || included.stream().anyMatch(tags::contains)) && excluded.stream().noneMatch(tags::contains);
    }

    private static List<String> tagsOf(Class<?> suite, String[] expressions) {
        assertThat(expressions).as("tags of %s are plain tag names, the only expressions this check evaluates", suite.getSimpleName())
                .allMatch(expression -> PLAIN_TAG.matcher(expression).matches());
        return Arrays.asList(expressions);
    }

    private static List<Scenario> scenarios(Path features) throws IOException {
        GherkinParser parser = GherkinParser.builder().includeSource(false).includeGherkinDocument(false).build();
        List<Path> files;
        try (Stream<Path> walk = Files.walk(features)) {
            files = walk.filter(file -> file.toString().endsWith(".feature")).sorted().toList();
        }
        List<Scenario> found = new ArrayList<>();
        for (Path file : files) {
            String relative = features.relativize(file).toString();
            String context = features.relativize(file).getName(0).toString();
            try (Stream<Envelope> envelopes = parser.parse(file)) {
                envelopes.map(Envelope::getPickle).flatMap(Optional::stream).forEach(pickle -> found.add(scenario(relative, context, pickle)));
            }
        }
        return found;
    }

    private static Scenario scenario(String file, String context, Pickle pickle) {
        Set<String> tags = pickle.getTags().stream().map(PickleTag::getName).map(tag -> tag.substring(1)).collect(Collectors.toUnmodifiableSet());
        return new Scenario(file + " > " + pickle.getName(), context, tags);
    }

    private static List<Class<?>> suites() throws IOException, URISyntaxException, ClassNotFoundException {
        Path classes = Path.of(AcceptanceSuitesPartitionTest.class.getProtectionDomain().getCodeSource().getLocation().toURI());
        List<Path> files;
        try (Stream<Path> walk = Files.walk(classes)) {
            files = walk.filter(file -> file.getFileName().toString().endsWith(SUITE_CLASS_SUFFIX)).sorted().toList();
        }
        List<Class<?>> found = new ArrayList<>();
        for (Path file : files) {
            String name = classes.relativize(file).toString().replace(file.getFileSystem().getSeparator(), ".");
            Class<?> type = Class.forName(name.substring(0, name.length() - ".class".length()));
            assertThat(type.isAnnotationPresent(Suite.class)).as("%s is a suite", type.getSimpleName()).isTrue();
            found.add(type);
        }
        return found;
    }

    private record Scenario(String name, String context, Set<String> tags) {
    }
}
