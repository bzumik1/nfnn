package cz.novanadeje.app.architecture;

import com.tngtech.archunit.base.DescribedPredicate;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.domain.JavaMethod;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchCondition;
import com.tngtech.archunit.lang.ArchRule;
import com.tngtech.archunit.lang.ConditionEvents;
import com.tngtech.archunit.lang.SimpleConditionEvent;
import cz.novanadeje.app.AppApplication;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Named;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.slf4j.Logger;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.scheduling.annotation.Schedules;
import org.springframework.stereotype.Controller;
import org.springframework.stereotype.Repository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.bind.annotation.RequestBody;

import java.io.FileDescriptor;
import java.io.IOException;
import java.nio.file.Path;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import static com.tngtech.archunit.lang.conditions.ArchConditions.beMetaAnnotatedWith;
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
    private static final String APPLICATION = "backend.md, Application";
    private static final String SETUP_CODE_ANNOUNCER = "cz.novanadeje.app.operations.infrastructure.settings.ConsoleSetupCodeAnnouncer";
    private static final String DEFERRED_LOG_USER = "cz.novanadeje.app.operations.infrastructure.settings.DatabaseSettingsEnvironmentPostProcessor";

    private static JavaClasses planted;

    @ArchTest
    static final ArchRule controllers_live_in_the_rest_interfaces_and_are_named_controllers = classes()
            .that().areMetaAnnotatedWith(Controller.class)
            .should().resideInAPackage("..interfaces.rest..")
            .andShould().haveSimpleNameEndingWith("Controller")
            .because("backend.md, REST");

    @ArchTest
    static final ArchRule problem_handlers_live_in_the_rest_interfaces = classes()
            .that().areMetaAnnotatedWith(ControllerAdvice.class)
            .should().resideInAPackage("..interfaces.rest..")
            .because("backend.md, REST: a failure outside the DomainException kinds gets a handler in the context's interfaces/rest");

    @ArchTest
    static final ArchRule services_are_application_services = classes()
            .that().areMetaAnnotatedWith(Service.class)
            .should().resideInAPackage("..application..")
            .because(APPLICATION);

    @ArchTest
    static final ArchRule repositories_are_adapters = classes()
            .that().areMetaAnnotatedWith(Repository.class)
            .should().resideInAPackage("..infrastructure..")
            .because(LAYERS);

    @ArchTest
    static final ArchRule configurations_are_adapters = classes()
            .that().areMetaAnnotatedWith(Configuration.class)
            .and().doNotHaveFullyQualifiedName("cz.novanadeje.app.AppApplication")
            .should().resideInAnyPackage("..infrastructure..", "..interfaces.rest..")
            .because(LAYERS);

    @ArchTest
    static final ArchRule scheduled_work_is_started_by_adapters = methods()
            .that().areMetaAnnotatedWith(Scheduled.class)
            .or().areMetaAnnotatedWith(Schedules.class)
            .should().beDeclaredInClassesThat().resideInAPackage("..infrastructure..")
            .because("backend.md, Configuration and operations: a cron job is a driving adapter with a property that turns it off");

    @ArchTest
    static final ArchRule controllers_and_the_domain_set_no_transaction = noClasses()
            .that().resideInAnyPackage("..interfaces..", "..domain..")
            .should(beMetaAnnotatedWith(Transactional.class))
            .because("backend.md, Application: @Transactional on application services, never on controllers");

    @ArchTest
    static final ArchRule controller_and_domain_methods_set_no_transaction = noMethods()
            .that().areDeclaredInClassesThat().resideInAnyPackage("..interfaces..", "..domain..")
            .should(beMetaAnnotatedWith(Transactional.class))
            .because("backend.md, Application: @Transactional on application services, never on controllers");

    @ArchTest
    static final ArchRule no_field_is_injected = noFields()
            .should().beAnnotatedWith(Autowired.class)
            .orShould().beAnnotatedWith(Value.class)
            .orShould().beAnnotatedWith("jakarta.inject.Inject")
            .orShould().beAnnotatedWith("jakarta.annotation.Resource")
            .because("CLAUDE.md, Non-negotiable: constructor injection");

    @ArchTest
    static final ArchRule no_setter_is_injected = noMethods()
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
            .and(DescribedPredicate.describe("are named a request or a response",
                    type -> type.getSimpleName().endsWith("Request") || type.getSimpleName().endsWith("Response")))
            .should().beRecords()
            .because("backend.md, REST: request and response records only");

    @ArchTest
    static final ArchRule request_bodies_are_records = methods()
            .that().areDeclaredInClassesThat().areMetaAnnotatedWith(Controller.class)
            .should(takeOnlyRecordsAsRequestBodies())
            .because("backend.md, REST: request and response records only");

    @ArchTest
    static final ArchRule events_are_records = classes()
            .that().resideInAPackage("..application.event..")
            .and().areTopLevelClasses()
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
    static final ArchRule logging_goes_through_slf4j = noClasses()
            .that().doNotHaveFullyQualifiedName(DEFERRED_LOG_USER)
            .should().dependOnClassesThat().resideInAnyPackage("java.util.logging..", "org.apache.commons.logging..", "org.apache.logging.log4j..")
            .orShould().callMethod(System.class, "getLogger", String.class)
            .because("backend.md, Configuration and operations: SLF4J; only the environment post-processor logs through Spring's deferred log, before logging starts");

    @ArchTest
    static final ArchRule only_the_setup_code_goes_to_the_console = noClasses()
            .that().doNotHaveFullyQualifiedName(SETUP_CODE_ANNOUNCER)
            .should().accessField(System.class, "out")
            .orShould().accessField(System.class, "err")
            .orShould().accessField(FileDescriptor.class, "out")
            .orShould().accessField(FileDescriptor.class, "err")
            .orShould().callMethod(System.class, "console")
            .orShould().callMethod(Thread.class, "dumpStack")
            .orShould().accessTargetWhere(callsOrReferences("a stack trace printed to the console", Throwable.class, "printStackTrace"::equals))
            .because("security.md, First setup: the setup code goes to standard output only, never to backend.log or the log API");

    @BeforeAll
    static void plantMisplacedStereotypes(@TempDir Path folder) throws IOException {
        planted = PlantedClasses.compiled(folder, plantedClasses().collect(Collectors.toMap(PlantedClass::className, PlantedClass::source)));
    }

    @ParameterizedTest(name = "{0} reports {1}")
    @MethodSource("plantedClasses")
    @DisplayName("Given a planted class that breaks a placement rule, when the rule checks it, then exactly that class is reported")
    void should_report_the_planted_class_when_checked_given_a_misplaced_stereotype(ArchRule rule, String className) {
        JavaClasses plantedClass = planted.that(DescribedPredicate.describe("the planted class", type -> type.getName().equals(className)));

        assertThat(rule.evaluate(plantedClass).getFailureReport().getDetails())
                .isNotEmpty().allSatisfy(detail -> assertThat(detail).contains(className));
    }

    static Stream<PlantedClass> plantedClasses() {
        return Stream.of(
                planted("controllers", controllers_live_in_the_rest_interfaces_and_are_named_controllers, "donors.application.PlantedController",
                        "@org.springframework.web.bind.annotation.RestController public class PlantedController {}"),
                planted("controllers", controllers_live_in_the_rest_interfaces_and_are_named_controllers, "donors.interfaces.rest.PlantedEndpoints",
                        "@org.springframework.web.bind.annotation.RestController public class PlantedEndpoints {}"),
                planted("controllers", controllers_live_in_the_rest_interfaces_and_are_named_controllers, "donors.application.PlantedPlainController",
                        "@org.springframework.stereotype.Controller public class PlantedPlainController {}"),
                planted("problem handlers", problem_handlers_live_in_the_rest_interfaces, "donors.infrastructure.mail.PlantedProblemHandler",
                        "@org.springframework.web.bind.annotation.RestControllerAdvice public class PlantedProblemHandler {}"),
                planted("services", services_are_application_services, "donors.infrastructure.mail.PlantedService",
                        "@org.springframework.stereotype.Service public class PlantedService {}"),
                planted("repositories", repositories_are_adapters, "donors.application.PlantedRepository",
                        "@org.springframework.stereotype.Repository public class PlantedRepository {}"),
                planted("configurations", configurations_are_adapters, "donors.application.PlantedConfiguration",
                        "@org.springframework.context.annotation.Configuration public class PlantedConfiguration {}"),
                planted("configurations", configurations_are_adapters, "donors.application.PlantedComposedConfiguration",
                        "@PlantedComposedConfiguration.Settings public class PlantedComposedConfiguration {"
                                + " @org.springframework.context.annotation.Configuration"
                                + " @java.lang.annotation.Retention(java.lang.annotation.RetentionPolicy.RUNTIME) @interface Settings {} }"),
                planted("scheduled work", scheduled_work_is_started_by_adapters, "donors.application.PlantedComposedJob",
                        "public class PlantedComposedJob { @org.springframework.scheduling.annotation.Scheduled(cron = \"-\")"
                                + " @java.lang.annotation.Retention(java.lang.annotation.RetentionPolicy.RUNTIME)"
                                + " @java.lang.annotation.Target(java.lang.annotation.ElementType.METHOD) @interface Nightly {}"
                                + " @Nightly void run() {} }"),
                planted("scheduled work", scheduled_work_is_started_by_adapters, "donors.application.PlantedJob",
                        "public class PlantedJob { @org.springframework.scheduling.annotation.Scheduled(cron = \"-\") void run() {} }"),
                planted("scheduled work", scheduled_work_is_started_by_adapters, "donors.application.PlantedTwiceScheduledJob",
                        "public class PlantedTwiceScheduledJob { @org.springframework.scheduling.annotation.Scheduled(cron = \"-\")"
                                + " @org.springframework.scheduling.annotation.Scheduled(fixedDelay = 1) void run() {} }"),
                planted("class transactions", controllers_and_the_domain_set_no_transaction, "donors.interfaces.rest.PlantedTransactionalController",
                        "@org.springframework.transaction.annotation.Transactional public class PlantedTransactionalController {}"),
                planted("method transactions", controller_and_domain_methods_set_no_transaction, "donors.domain.PlantedTransactionalDonor",
                        "public class PlantedTransactionalDonor { @org.springframework.transaction.annotation.Transactional void change() {} }"),
                planted("field injection", no_field_is_injected, "donors.application.PlantedAutowiredField",
                        "public class PlantedAutowiredField { @org.springframework.beans.factory.annotation.Autowired Object collaborator; }"),
                planted("field injection", no_field_is_injected, "donors.application.PlantedValueField",
                        "public class PlantedValueField { @org.springframework.beans.factory.annotation.Value(\"${app.planted}\") String setting; }"),
                planted("setter injection", no_setter_is_injected, "donors.application.PlantedAutowiredSetter",
                        "public class PlantedAutowiredSetter { @org.springframework.beans.factory.annotation.Autowired void use(Object collaborator) {} }"),
                planted("configuration properties", configuration_properties_are_records, "donors.application.PlantedProperties",
                        "@org.springframework.boot.context.properties.ConfigurationProperties(\"app.planted\") public class PlantedProperties {}"),
                planted("responses", requests_and_responses_are_records, "donors.interfaces.rest.PlantedResponse", "public class PlantedResponse {}"),
                planted("request bodies", request_bodies_are_records, "donors.interfaces.rest.PlantedBodyController",
                        "@org.springframework.web.bind.annotation.RestController public class PlantedBodyController {"
                                + " public static class Confirmation {}"
                                + " public void confirm(@org.springframework.web.bind.annotation.RequestBody Confirmation confirmation) {} }"),
                planted("events", events_are_records, "donors.application.event.PlantedEvent", "public class PlantedEvent {}"),
                planted("events", events_are_records, "donors.application.event.PlantedEventKind", "public enum PlantedEventKind { ONE }"),
                planted("logger name", loggers_are_private_static_final_fields_named_log, "donors.application.PlantedLoggerName",
                        "public class PlantedLoggerName { private static final org.slf4j.Logger LOG = org.slf4j.LoggerFactory.getLogger(\"x\"); }"),
                planted("logger visibility", loggers_are_private_static_final_fields_named_log, "donors.application.PlantedLoggerVisibility",
                        "public class PlantedLoggerVisibility { static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(\"x\"); }"),
                planted("logger per instance", loggers_are_private_static_final_fields_named_log, "donors.application.PlantedLoggerInstance",
                        "public class PlantedLoggerInstance { private final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(\"x\"); }"),
                planted("logger reassignable", loggers_are_private_static_final_fields_named_log, "donors.application.PlantedLoggerReassignable",
                        "public class PlantedLoggerReassignable { private static org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(\"x\"); }"),
                planted("other logging", logging_goes_through_slf4j, "donors.application.PlantedJulLogger",
                        "public class PlantedJulLogger { java.util.logging.Logger logger; }"),
                planted("other logging", logging_goes_through_slf4j, "donors.application.PlantedSystemLogger",
                        "public class PlantedSystemLogger { Object logger() { return System.getLogger(\"x\"); } }"),
                planted("console", only_the_setup_code_goes_to_the_console, "donors.application.PlantedConsole",
                        "public class PlantedConsole { void print() { System.out.println(\"planted\"); } }"),
                planted("console", only_the_setup_code_goes_to_the_console, "donors.application.PlantedErrorConsole",
                        "public class PlantedErrorConsole { void print() { System.err.println(\"planted\"); } }"),
                planted("console", only_the_setup_code_goes_to_the_console, "donors.application.PlantedDescriptor",
                        "public class PlantedDescriptor { Object out() { return java.io.FileDescriptor.out; } }"),
                planted("console", only_the_setup_code_goes_to_the_console, "donors.application.PlantedSystemConsole",
                        "public class PlantedSystemConsole { Object console() { return System.console(); } }"),
                planted("console", only_the_setup_code_goes_to_the_console, "donors.application.PlantedDumpStack",
                        "public class PlantedDumpStack { void dump() { Thread.dumpStack(); } }"),
                planted("console", only_the_setup_code_goes_to_the_console, "donors.application.PlantedStackTrace",
                        "public class PlantedStackTrace { void print(RuntimeException failure) { failure.printStackTrace(); } }"));
    }

    private static ArchCondition<JavaMethod> takeOnlyRecordsAsRequestBodies() {
        return new ArchCondition<>("take only records as request bodies") {
            @Override
            public void check(JavaMethod method, ConditionEvents events) {
                method.getParameters().stream()
                        .filter(parameter -> parameter.isAnnotatedWith(RequestBody.class))
                        .filter(parameter -> !parameter.getRawType().isRecord())
                        .forEach(parameter -> events.add(SimpleConditionEvent.violated(method,
                                method.getFullName() + " takes " + parameter.getRawType().getName() + " as its request body, which is not a record")));
            }
        };
    }

    private static PlantedClass planted(String label, ArchRule rule, String relativeName, String body) {
        String className = "cz.novanadeje.app." + relativeName;
        return new PlantedClass(Named.of(label, rule), className, "package " + className.substring(0, className.lastIndexOf('.')) + ";\n" + body + "\n");
    }

    record PlantedClass(Named<ArchRule> rule, String className, String source) implements Arguments {

        @Override
        public Object[] get() {
            return new Object[]{rule, className};
        }
    }
}
