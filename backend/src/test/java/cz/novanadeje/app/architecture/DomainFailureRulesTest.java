package cz.novanadeje.app.architecture;

import com.tngtech.archunit.base.DescribedPredicate;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;
import cz.novanadeje.app.AppApplication;
import cz.novanadeje.app.shared.domain.error.DomainException;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Named;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

import java.io.IOException;
import java.nio.file.Path;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.classes;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static org.assertj.core.api.Assertions.assertThat;

@AnalyzeClasses(
        packagesOf = AppApplication.class,
        importOptions = ImportOption.DoNotIncludeTests.class
)
class DomainFailureRulesTest {

    private static final String FAILURES = "backend.md, Domain: failures are sealed DomainException subtypes with a code";

    private static JavaClasses planted;

    @ArchTest
    static final ArchRule domain_failures_live_in_the_domain = classes()
            .that().areAssignableTo(DomainException.class)
            .should().resideInAPackage("..domain..")
            .because(FAILURES);

    @ArchTest
    static final ArchRule domain_failures_are_named_classes = classes()
            .that().areAssignableTo(DomainException.class)
            .should().notBeAnonymousClasses()
            .andShould().notBeLocalClasses()
            .because(FAILURES + ": a failure is a named class of its own, so its code and texts are found by its name, never thrown as a kind made up on the spot");

    @ArchTest
    static final ArchRule no_class_extends_the_argument_or_state_exceptions = noClasses()
            .should().beAssignableTo(IllegalArgumentException.class)
            .orShould().beAssignableTo(IllegalStateException.class)
            .because("the API answers every IllegalArgumentException with 400 as the client's error, and adapters catch IllegalStateException "
                    + "generically around library calls; a failure of its own is a DomainException when the client caused it and a plain RuntimeException when the server did");

    @BeforeAll
    static void plantMisplacedFailures(@TempDir Path folder) throws IOException {
        planted = PlantedClasses.compiled(folder, plantedClasses().collect(Collectors.toMap(PlantedClass::sourceName, PlantedClass::source)));
    }

    @ParameterizedTest(name = "{0} reports {1}")
    @MethodSource("plantedClasses")
    @DisplayName("Given a planted failure in the wrong place or of the wrong kind, when the rule checks it, then exactly that class is reported")
    void should_report_the_planted_failure_when_checked_given_a_misplaced_failure(ArchRule rule, String className) {
        JavaClasses plantedClass = planted.that(DescribedPredicate.describe("the planted class", type -> type.getName().equals(className)));

        assertThat(rule.evaluate(plantedClass).getFailureReport().getDetails())
                .isNotEmpty().allSatisfy(detail -> assertThat(detail).contains(className));
    }

    static Stream<PlantedClass> plantedClasses() {
        return Stream.of(
                planted("placement", domain_failures_live_in_the_domain, "donors.interfaces.rest.PlantedFailure",
                        "public class PlantedFailure extends cz.novanadeje.app.shared.domain.error.Conflict { "
                                + "PlantedFailure() { super(\"donors/planted\", \"planted\"); } }"),
                planted("nested placement", domain_failures_live_in_the_domain, "donors.interfaces.rest.PlantedController",
                        "public class PlantedController { static final class Ended extends cz.novanadeje.app.shared.domain.error.AuthenticationFailure { "
                                + "Ended() { super(\"auth/planted\", \"planted\"); } } }", "cz.novanadeje.app.donors.interfaces.rest.PlantedController$Ended"),
                planted("anonymous", domain_failures_are_named_classes, "donors.domain.PlantedAggregate",
                        "public class PlantedAggregate { RuntimeException refusal() { return new cz.novanadeje.app.shared.domain.error.Conflict("
                                + "\"donors/planted\", \"planted\") { }; } }", "cz.novanadeje.app.donors.domain.PlantedAggregate$1"),
                planted("local", domain_failures_are_named_classes, "donors.domain.PlantedPolicy",
                        "public class PlantedPolicy { RuntimeException refusal() { class Refused extends cz.novanadeje.app.shared.domain.error.RuleViolation { "
                                + "Refused() { super(\"donors/planted\", \"planted\"); } } return new Refused(); } }",
                        "cz.novanadeje.app.donors.domain.PlantedPolicy$1Refused"),
                planted("argument", no_class_extends_the_argument_or_state_exceptions, "donations.domain.PlantedArgumentFailure",
                        "public class PlantedArgumentFailure extends IllegalArgumentException {}"),
                planted("state", no_class_extends_the_argument_or_state_exceptions, "donations.application.PlantedStateFailure",
                        "public class PlantedStateFailure extends IllegalStateException {}"));
    }

    private static PlantedClass planted(String label, ArchRule rule, String relativeName, String body) {
        return planted(label, rule, relativeName, body, "cz.novanadeje.app." + relativeName);
    }

    private static PlantedClass planted(String label, ArchRule rule, String relativeName, String body, String reportedClass) {
        String sourceName = "cz.novanadeje.app." + relativeName;
        return new PlantedClass(Named.of(label, rule), sourceName, reportedClass,
                "package " + sourceName.substring(0, sourceName.lastIndexOf('.')) + ";\n" + body + "\n");
    }

    record PlantedClass(Named<ArchRule> rule, String sourceName, String className, String source) implements Arguments {

        @Override
        public Object[] get() {
            return new Object[]{rule, className};
        }
    }
}
