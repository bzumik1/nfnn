package cz.novanadeje.app.architecture;

import com.tngtech.archunit.base.DescribedPredicate;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;
import cz.novanadeje.app.AppApplication;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.slf4j.Logger;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Repository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.io.IOException;
import java.nio.file.Path;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.classes;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.fields;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.methods;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noFields;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noMethods;
import static cz.novanadeje.app.architecture.MethodAccesses.callsOrReferences;
import static org.assertj.core.api.Assertions.assertThat;

@AnalyzeClasses(
        packagesOf = AppApplication.class,
        importOptions = ImportOption.DoNotIncludeTests.class
)
class StereotypeRulesTest {

    private static final String LAYERS = "backend.md, Contexts and layers";
    private static final String SETUP_CODE_ANNOUNCER = "cz.novanadeje.app.operations.infrastructure.settings.ConsoleSetupCodeAnnouncer";

    private static JavaClasses planted;

    @ArchTest
    static final ArchRule rest_controllers_live_in_the_rest_interfaces_and_are_named_controllers = classes()
            .that().areAnnotatedWith(RestController.class)
            .should().resideInAPackage("..interfaces.rest..")
            .andShould().haveSimpleNameEndingWith("Controller")
            .because("backend.md, REST");

    @ArchTest
    static final ArchRule problem_handlers_live_in_the_rest_interfaces = classes()
            .that().areAnnotatedWith(RestControllerAdvice.class)
            .or().areAnnotatedWith(ControllerAdvice.class)
            .should().resideInAPackage("..interfaces.rest..")
            .because("backend.md, REST: a failure outside the DomainException kinds gets a handler in the context's interfaces/rest");

    @ArchTest
    static final ArchRule services_are_application_services = classes()
            .that().areAnnotatedWith(Service.class)
            .should().resideInAPackage("..application..")
            .because(LAYERS);

    @ArchTest
    static final ArchRule repositories_are_adapters = classes()
            .that().areAnnotatedWith(Repository.class)
            .should().resideInAPackage("..infrastructure..")
            .because(LAYERS);

    @ArchTest
    static final ArchRule scheduled_work_is_started_by_adapters = methods()
            .that().areAnnotatedWith(Scheduled.class)
            .should().beDeclaredInClassesThat().resideInAPackage("..infrastructure..")
            .because("backend.md, Configuration and operations: a cron job is a driving adapter with a property that turns it off");

    @ArchTest
    static final ArchRule controllers_and_the_domain_set_no_transaction = noClasses()
            .that().resideInAnyPackage("..interfaces..", "..domain..")
            .should().beAnnotatedWith(Transactional.class)
            .because("backend.md, Application: @Transactional on application services, never on controllers");

    @ArchTest
    static final ArchRule controller_and_domain_methods_set_no_transaction = noMethods()
            .that().areDeclaredInClassesThat().resideInAnyPackage("..interfaces..", "..domain..")
            .should().beAnnotatedWith(Transactional.class)
            .because("backend.md, Application: @Transactional on application services, never on controllers");

    @ArchTest
    static final ArchRule dependencies_are_injected_through_constructors = noFields()
            .should().beAnnotatedWith(Autowired.class)
            .because("CLAUDE.md, Non-negotiable: constructor injection");

    @ArchTest
    static final ArchRule configuration_properties_are_records = classes()
            .that().areAnnotatedWith(ConfigurationProperties.class)
            .should().beRecords()
            .because("CLAUDE.md, Non-negotiable: record for values, DTOs and config");

    @ArchTest
    static final ArchRule requests_and_responses_are_records = classes()
            .that().resideInAPackage("..interfaces.rest..")
            .and().areTopLevelClasses()
            .and(DescribedPredicate.describe("are named a request or a response",
                    type -> type.getSimpleName().endsWith("Request") || type.getSimpleName().endsWith("Response")))
            .should().beRecords()
            .because("backend.md, REST: request and response records only");

    @ArchTest
    static final ArchRule events_are_records = classes()
            .that().resideInAPackage("..application.event..")
            .and().areTopLevelClasses()
            .and().areNotEnums()
            .should().beRecords()
            .because("backend.md, Contexts and layers: an event record in application/event");

    @ArchTest
    static final ArchRule loggers_are_private_static_final_fields_named_log = fields()
            .that().haveRawType(Logger.class)
            .should().haveName("log")
            .andShould().bePrivate()
            .andShould().beStatic()
            .andShould().beFinal()
            .because("backend.md, Configuration and operations: SLF4J log field");

    @ArchTest
    static final ArchRule only_the_setup_code_goes_to_the_console = noClasses()
            .that().doNotHaveFullyQualifiedName(SETUP_CODE_ANNOUNCER)
            .should().accessField(System.class, "out")
            .orShould().accessField(System.class, "err")
            .orShould().accessTargetWhere(callsOrReferences("a stack trace printed to the console", Throwable.class, "printStackTrace"::equals))
            .because("security.md, First setup: the setup code goes to standard output only, and nothing else does, so the logs keep their shape");

    @BeforeAll
    static void plantMisplacedStereotypes(@TempDir Path folder) throws IOException {
        planted = PlantedClasses.compiled(folder, plantedClasses().collect(Collectors.toMap(PlantedClass::className, PlantedClass::source)));
    }

    @ParameterizedTest(name = "{0} reports {1}")
    @MethodSource("plantedClasses")
    @DisplayName("Given a planted class that breaks a placement rule, when the rule checks it, then exactly that class is reported")
    void should_report_the_planted_class_when_checked_given_a_misplaced_stereotype(String rule, String className) throws ReflectiveOperationException {
        ArchRule checked = (ArchRule) StereotypeRulesTest.class.getDeclaredField(rule).get(null);
        JavaClasses plantedClass = planted.that(DescribedPredicate.describe("the planted class", type -> type.getName().equals(className)));

        assertThat(checked.evaluate(plantedClass).getFailureReport().getDetails())
                .isNotEmpty().allSatisfy(detail -> assertThat(detail).contains(className.substring(className.lastIndexOf('.') + 1)));
    }

    static Stream<PlantedClass> plantedClasses() {
        return Stream.of(
                planted("rest_controllers_live_in_the_rest_interfaces_and_are_named_controllers", "donors.application.PlantedController",
                        "@org.springframework.web.bind.annotation.RestController public class PlantedController {}"),
                planted("rest_controllers_live_in_the_rest_interfaces_and_are_named_controllers", "donors.interfaces.rest.PlantedEndpoints",
                        "@org.springframework.web.bind.annotation.RestController public class PlantedEndpoints {}"),
                planted("problem_handlers_live_in_the_rest_interfaces", "donors.infrastructure.mail.PlantedProblemHandler",
                        "@org.springframework.web.bind.annotation.RestControllerAdvice public class PlantedProblemHandler {}"),
                planted("services_are_application_services", "donors.infrastructure.mail.PlantedService",
                        "@org.springframework.stereotype.Service public class PlantedService {}"),
                planted("repositories_are_adapters", "donors.application.PlantedRepository",
                        "@org.springframework.stereotype.Repository public class PlantedRepository {}"),
                planted("scheduled_work_is_started_by_adapters", "donors.application.PlantedJob",
                        "public class PlantedJob { @org.springframework.scheduling.annotation.Scheduled(cron = \"-\") void run() {} }"),
                planted("controllers_and_the_domain_set_no_transaction", "donors.interfaces.rest.PlantedTransactionalController",
                        "@org.springframework.transaction.annotation.Transactional public class PlantedTransactionalController {}"),
                planted("controller_and_domain_methods_set_no_transaction", "donors.domain.PlantedTransactionalDonor",
                        "public class PlantedTransactionalDonor { @org.springframework.transaction.annotation.Transactional void change() {} }"),
                planted("dependencies_are_injected_through_constructors", "donors.application.PlantedFieldInjection",
                        "public class PlantedFieldInjection { @org.springframework.beans.factory.annotation.Autowired Object collaborator; }"),
                planted("configuration_properties_are_records", "donors.application.PlantedProperties",
                        "@org.springframework.boot.context.properties.ConfigurationProperties(\"app.planted\") public class PlantedProperties {}"),
                planted("requests_and_responses_are_records", "donors.interfaces.rest.PlantedResponse", "public class PlantedResponse {}"),
                planted("events_are_records", "donors.application.event.PlantedEvent", "public class PlantedEvent {}"),
                planted("loggers_are_private_static_final_fields_named_log", "donors.application.PlantedLogger",
                        "public class PlantedLogger { static final org.slf4j.Logger LOG = org.slf4j.LoggerFactory.getLogger(PlantedLogger.class); }"),
                planted("only_the_setup_code_goes_to_the_console", "donors.application.PlantedConsole",
                        "public class PlantedConsole { void print() { System.out.println(\"planted\"); } }"),
                planted("only_the_setup_code_goes_to_the_console", "donors.application.PlantedStackTrace",
                        "public class PlantedStackTrace { void print(RuntimeException failure) { failure.printStackTrace(); } }"));
    }

    private static PlantedClass planted(String rule, String relativeName, String body) {
        String className = "cz.novanadeje.app." + relativeName;
        return new PlantedClass(rule, className, "package " + className.substring(0, className.lastIndexOf('.')) + ";\n" + body + "\n");
    }

    record PlantedClass(String rule, String className, String source) implements Arguments {

        @Override
        public Object[] get() {
            return new Object[]{rule, className};
        }
    }
}
