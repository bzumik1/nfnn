package cz.novanadeje.app.architecture;

import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaMethod;
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
import org.junit.jupiter.api.RepeatedTest;
import org.junit.jupiter.api.TestFactory;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.regex.Pattern;

import javax.tools.ToolProvider;

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
            }
            """;

    @ArchTest
    static final ArchRule every_test_reads_as_given_when_then = methods()
            .that().areAnnotatedWith(Test.class)
            .or().areAnnotatedWith(ParameterizedTest.class)
            .or().areAnnotatedWith(RepeatedTest.class)
            .or().areAnnotatedWith(TestFactory.class)
            .should().beAnnotatedWith(DisplayName.class)
            .andShould().haveNameMatching(SHOULD_WHEN)
            .andShould(haveADisplayNameThatReadsAsGivenWhenThen());

    @Test
    @DisplayName("Given planted tests named and displayed in other shapes, when the naming rule checks them, then each is reported and the given/when/then ones are not")
    void should_report_every_other_shape_when_rule_checks_given_planted_tests(@TempDir Path classes) throws IOException {
        var details = every_test_reads_as_given_when_then.evaluate(new ClassFileImporter().importPath(compiled(PLANTED_TESTS, classes)))
                .getFailureReport().getDetails();

        assertThat(details).hasSize(3)
                .anySatisfy(detail -> assertThat(detail).contains("verifiesSomething").contains("does not have name matching"))
                .anySatisfy(detail -> assertThat(detail).contains("is displayed as \"Checks the total\""))
                .anySatisfy(detail -> assertThat(detail).contains("is displayed as \"when it is checked, then it is fine\""))
                .noneSatisfy(detail -> assertThat(detail).contains("GivenAState.should"));
    }

    private static ArchCondition<JavaMethod> haveADisplayNameThatReadsAsGivenWhenThen() {
        return new ArchCondition<>("have a display name that reads as given, when, then") {
            @Override
            public void check(JavaMethod method, ConditionEvents events) {
                method.tryGetAnnotationOfType(DisplayName.class).map(DisplayName::value)
                        .filter(name -> !readsAsGivenWhenThen(name, method.getOwner()))
                        .ifPresent(name -> events.add(SimpleConditionEvent.violated(method, method.getFullName() + " is displayed as \"" + name + "\"")));
            }
        };
    }

    private static boolean readsAsGivenWhenThen(String name, JavaClass owner) {
        return GIVEN_WHEN_THEN.matcher(name).matches() || owner.isAnnotatedWith(Nested.class) && WHEN_THEN.matcher(name).matches();
    }

    private static Path compiled(String source, Path classes) throws IOException {
        Path file = classes.resolve("PlantedTests.java");
        Files.writeString(file, source);
        int status = ToolProvider.getSystemJavaCompiler().run(null, null, null,
                "-classpath", System.getProperty("java.class.path"), "-d", classes.toString(), file.toString());
        assertThat(status).isZero();
        return classes;
    }
}
