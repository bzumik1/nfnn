package cz.novanadeje.app.architecture;

import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.domain.JavaMethod;
import com.tngtech.archunit.core.domain.properties.HasAnnotations;
import com.tngtech.archunit.core.domain.properties.HasSourceCodeLocation;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchCondition;
import com.tngtech.archunit.lang.ArchRule;
import com.tngtech.archunit.lang.ConditionEvents;
import com.tngtech.archunit.lang.SimpleConditionEvent;
import cz.novanadeje.app.AppApplication;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.platform.commons.annotation.Testable;

import javax.tools.JavaCompiler;
import javax.tools.ToolProvider;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.function.Predicate;
import java.util.regex.Pattern;
import java.util.stream.Stream;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.classes;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.methods;
import static org.assertj.core.api.Assertions.assertThat;

@AnalyzeClasses(
        packagesOf = AppApplication.class,
        importOptions = ImportOption.OnlyIncludeTests.class
)
class TestNamingRulesTest {

    private static final String SHOULD_WHEN = "should_[a-z0-9]+(?:_[a-z0-9]+)*_when_[a-z0-9]+(?:_[a-z0-9]+)*";
    private static final Pattern GIVEN_WHEN_THEN = Pattern.compile("Given .+, when .+, then .+", Pattern.DOTALL);
    private static final Pattern WHEN_THEN = Pattern.compile("when .+, then .+", Pattern.DOTALL);
    private static final Pattern GIVEN = Pattern.compile("Given .+", Pattern.DOTALL);
    private static final String NAMING = "testing.md, Naming (given/when/then)";
    private static final String PLANTED_TESTS = """
            import org.junit.jupiter.api.DisplayName;
            import org.junit.jupiter.api.Nested;
            import org.junit.jupiter.api.Test;

            class PlantedTests {

                @Test
                @DisplayName("Given a total, when it is checked, then it is fine")
                void verifiesSomething() {
                }

                @Test
                @DisplayName("Given a total, when it is checked, then it is fine")
                void should_be_fine_given_a_total() {
                }

                @Test
                @DisplayName("Checks the total")
                void should_be_fine_when_checked() {
                }

                @Test
                @DisplayName("when it is checked, then it is fine")
                void should_be_fine_when_checked_outside_a_nested_class() {
                }

                @Nested
                @DisplayName("Given a state")
                class GivenAState {

                    @Test
                    @DisplayName("when it is checked, then it is fine")
                    void should_be_fine_when_checked_given_a_state() {
                    }
                }

                @Nested
                @DisplayName("A state")
                class AState {

                    @Test
                    @DisplayName("when it is checked, then it is fine")
                    void should_be_fine_when_checked_given_another_state() {
                    }
                }
            }
            """;

    @ArchTest
    static final ArchRule every_test_reads_as_given_when_then = methods()
            .that().areMetaAnnotatedWith(Testable.class)
            .and().areNotAnnotatedWith(ArchTest.class)
            .should().beAnnotatedWith(DisplayName.class)
            .andShould().haveNameMatching(SHOULD_WHEN)
            .andShould(haveADisplayNameThat("reads as given, when, then", TestNamingRulesTest::readsAsGivenWhenThen))
            .because(NAMING);

    @ArchTest
    static final ArchRule every_nested_test_class_is_displayed_as_a_given = classes()
            .that().areAnnotatedWith(Nested.class)
            .should().beAnnotatedWith(DisplayName.class)
            .andShould(haveADisplayNameThat("starts with Given", (JavaClass nested, String name) -> GIVEN.matcher(name).matches()))
            .because(NAMING);

    @Test
    @DisplayName("Given planted tests named and displayed in other shapes, when the naming rules check them, then each is reported and the given/when/then ones are not")
    void should_report_every_other_shape_when_rules_check_given_planted_tests(@TempDir Path classes) throws IOException {
        JavaClasses planted = new ClassFileImporter().importPath(compiled(PLANTED_TESTS, classes));

        List<String> details = Stream.of(every_test_reads_as_given_when_then, every_nested_test_class_is_displayed_as_a_given)
                .flatMap(rule -> rule.evaluate(planted).getFailureReport().getDetails().stream()).toList();

        assertThat(details).hasSize(5)
                .anySatisfy(detail -> assertThat(detail).contains("verifiesSomething()> does not have name matching"))
                .anySatisfy(detail -> assertThat(detail).contains("should_be_fine_given_a_total()> does not have name matching"))
                .anySatisfy(detail -> assertThat(detail).contains("should_be_fine_when_checked()> is displayed as \"Checks the total\""))
                .anySatisfy(detail -> assertThat(detail).contains("should_be_fine_when_checked_outside_a_nested_class()> is displayed as \"when"))
                .anySatisfy(detail -> assertThat(detail).contains("PlantedTests$AState> is displayed as \"A state\""))
                .noneSatisfy(detail -> assertThat(detail).contains("GivenAState"));
    }

    private static <T extends HasAnnotations<?> & HasSourceCodeLocation> ArchCondition<T> haveADisplayNameThat(
            String description, DisplayNameCheck<T> check) {
        return new ArchCondition<>("have a display name that " + description) {
            @Override
            public void check(T annotated, ConditionEvents events) {
                annotated.tryGetAnnotationOfType(DisplayName.class).map(DisplayName::value)
                        .filter(Predicate.not(name -> check.accepts(annotated, name)))
                        .ifPresent(name -> events.add(SimpleConditionEvent.violated(annotated,
                                annotated.getDescription() + " is displayed as \"" + name + "\" in " + annotated.getSourceCodeLocation())));
            }
        };
    }

    private static boolean readsAsGivenWhenThen(JavaMethod method, String name) {
        return GIVEN_WHEN_THEN.matcher(name).matches() || method.getOwner().isAnnotatedWith(Nested.class) && WHEN_THEN.matcher(name).matches();
    }

    private static Path compiled(String source, Path classes) throws IOException {
        JavaCompiler compiler = ToolProvider.getSystemJavaCompiler();
        assertThat(compiler).as("javac of the JDK toolchain").isNotNull();
        Path file = classes.resolve("PlantedTests.java");
        Files.writeString(file, source);
        int status = compiler.run(null, null, null,
                "-proc:none", "-classpath", System.getProperty("java.class.path"), "-d", classes.toString(), file.toString());
        assertThat(status).isZero();
        return classes;
    }

    @FunctionalInterface
    private interface DisplayNameCheck<T> {

        boolean accepts(T annotated, String name);
    }
}
