package cz.novanadeje.app.architecture;

import com.tngtech.archunit.base.DescribedPredicate;
import com.tngtech.archunit.core.domain.AccessTarget;
import com.tngtech.archunit.core.domain.JavaAccess;
import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;
import cz.novanadeje.app.AppApplication;
import cz.novanadeje.app.shared.domain.error.DomainException;
import jakarta.persistence.Converter;
import jakarta.persistence.Embeddable;
import jakarta.persistence.Entity;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Named;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Repository;

import java.io.IOException;
import java.nio.file.Path;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import static com.tngtech.archunit.core.domain.JavaClass.Predicates.resideInAnyPackage;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.classes;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static org.assertj.core.api.Assertions.assertThat;

@AnalyzeClasses(
        packagesOf = AppApplication.class,
        importOptions = ImportOption.DoNotIncludeTests.class
)
class DomainFailureRulesTest {

    private static final String FAILURES = "backend.md, Domain: failures are named classes with a code, declared in a domain package, of the sealed DomainException's abstract kinds";

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
                    + "generically around library calls; a failure of its own is a DomainException when the client caused it, and when the server did a named RuntimeException subclass "
                    + "or, for a broken invariant, a plain IllegalStateException");

    private static final DescribedPredicate<JavaClass> PERSISTENCE_ADAPTER = DescribedPredicate.describe(
            "a class of the persistence adapter packages AdapterLibraryRulesTest confines JPA and Spring Data to, other than a configuration record, "
                    + "or a JPA entity, embeddable or converter, a @Repository or a Spring Data repository wherever it lives",
            type -> resideInAnyPackage(AdapterLibraryRulesTest.PERSISTENCE_ADAPTERS).test(type) && !type.isAnnotatedWith(ConfigurationProperties.class)
                    || type.isAnnotatedWith(Entity.class) || type.isAnnotatedWith(Embeddable.class) || type.isAnnotatedWith(Converter.class)
                    || type.isAnnotatedWith(Repository.class) || type.isAssignableTo(org.springframework.data.repository.Repository.class));

    private static final DescribedPredicate<AccessTarget> AN_ARGUMENT_ASSERTION = DescribedPredicate.describe(
            "a method of Spring's Assert other than state, which throws IllegalArgumentException",
            target -> target.getOwner().getName().equals("org.springframework.util.Assert") && !target.getName().equals("state"));

    @ArchTest
    static final ArchRule persistence_adapters_never_answer_a_broken_invariant_as_the_clients_error = noClasses()
            .that(PERSISTENCE_ADAPTER)
            .should().accessTargetWhere(JavaAccess.Predicates.target(constructorOf(IllegalArgumentException.class)))
            .orShould().accessTargetWhere(JavaAccess.Predicates.target(AN_ARGUMENT_ASSERTION))
            .because("a client's input is refused before it reaches persistence, so a check there guards the server's own data or code, "
                    + "and an IllegalArgumentException would answer that server fault with 400 and log it as the client's error; "
                    + "throw IllegalStateException, which answers 500. The rule sees what such a class constructs, a lambda's body "
                    + "included, and Spring's Assert, not an IllegalArgumentException another call throws (valueOf, fromString, a value object's check; #939)");

    private static DescribedPredicate<AccessTarget> constructorOf(Class<? extends RuntimeException> failure) {
        return DescribedPredicate.describe("a constructor of " + failure.getSimpleName() + " or of a subclass",
                target -> target.getName().equals("<init>") && target.getOwner().isAssignableTo(failure));
    }

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

    @Test
    @DisplayName("Given a planted configuration record of a persistence package that refuses its value as an argument and a row class that asserts a server fault with Assert.state, when the persistence rule checks them, then neither is reported, because a configuration record is bound at startup and never answers a request")
    void should_report_neither_when_checked_given_a_configuration_record_and_a_server_fault_in_a_persistence_package(@TempDir Path folder) throws IOException {
        JavaClasses settings = PlantedClasses.compiled(folder, java.util.Map.of("cz.novanadeje.app.shared.infrastructure.persistence.PlantedSessionProperties", """
                package cz.novanadeje.app.shared.infrastructure.persistence;

                @org.springframework.boot.context.properties.ConfigurationProperties("app.planted")
                public record PlantedSessionProperties(java.time.Duration timeout) {
                    public PlantedSessionProperties {
                        if (timeout == null) {
                            throw new IllegalArgumentException("planted");
                        }
                    }
                }
                """, "cz.novanadeje.app.shared.infrastructure.persistence.PlantedRow", """
                package cz.novanadeje.app.shared.infrastructure.persistence;

                public class PlantedRow {
                    void check(String id) {
                        org.springframework.util.Assert.state(id != null, "planted");
                    }
                }
                """));

        assertThat(persistence_adapters_never_answer_a_broken_invariant_as_the_clients_error.evaluate(settings).hasViolation()).isFalse();
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
                        "public class PlantedStateFailure extends IllegalStateException {}"),
                planted("persistence argument", persistence_adapters_never_answer_a_broken_invariant_as_the_clients_error,
                        "donations.infrastructure.persistence.PlantedRepository",
                        "public class PlantedRepository { void save(int offset) { if (offset < 0) { throw new IllegalArgumentException(\"planted\"); } } }"),
                planted("persistence argument reference", persistence_adapters_never_answer_a_broken_invariant_as_the_clients_error,
                        "shared.infrastructure.persistence.PlantedEntity",
                        "public class PlantedEntity { java.util.function.Supplier<RuntimeException> refusal() { return NumberFormatException::new; } }"),
                planted("persistence argument in a lambda", persistence_adapters_never_answer_a_broken_invariant_as_the_clients_error,
                        "donors.infrastructure.persistence.PlantedLookup",
                        "public class PlantedLookup { Object find(java.util.Optional<Object> row) { "
                                + "return row.orElseThrow(() -> new IllegalArgumentException(\"planted\")); } }"),
                planted("audit entity", persistence_adapters_never_answer_a_broken_invariant_as_the_clients_error,
                        "shared.infrastructure.audit.PlantedAuditEntity",
                        "@jakarta.persistence.Entity public class PlantedAuditEntity { void check(String action) { "
                                + "if (action == null) { throw new IllegalArgumentException(\"planted\"); } } }"),
                planted("audit row", persistence_adapters_never_answer_a_broken_invariant_as_the_clients_error,
                        "shared.infrastructure.audit.PlantedAuditRow",
                        "public record PlantedAuditRow(String action) { public PlantedAuditRow { "
                                + "if (action == null) { throw new IllegalArgumentException(\"planted\"); } } }"),
                planted("argument assertion", persistence_adapters_never_answer_a_broken_invariant_as_the_clients_error,
                        "donations.infrastructure.persistence.PlantedAssertingRepository",
                        "public class PlantedAssertingRepository { void read(int offset) { org.springframework.util.Assert.isTrue(offset >= 0, \"planted\"); } }"),
                planted("audit trail over a Spring Data repository", persistence_adapters_never_answer_a_broken_invariant_as_the_clients_error,
                        "shared.infrastructure.audit.PlantedAuditTrail",
                        "public class PlantedAuditTrail { private final org.springframework.data.repository.Repository<Object, java.util.UUID> rows; "
                                + "PlantedAuditTrail(org.springframework.data.repository.Repository<Object, java.util.UUID> rows) { this.rows = rows; } "
                                + "void record(String action) { if (action == null) { throw new IllegalArgumentException(\"planted\"); } } }"));
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
