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
import org.springframework.context.Lifecycle;
import org.springframework.context.event.ApplicationContextEvent;

import java.io.IOException;
import java.nio.file.Path;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import static com.tngtech.archunit.core.domain.JavaClass.Predicates.assignableTo;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static org.assertj.core.api.Assertions.assertThat;

@AnalyzeClasses(
        packagesOf = AppApplication.class,
        importOptions = ImportOption.DoNotIncludeTests.class
)
class FrameworkBindingRulesTest {

    private static final String DRIVING_ADAPTERS = "backend.md, Configuration and operations: binding configuration and reacting to the "
            + "framework's start are driving adapters in infrastructure, which hand plain records and calls to the application";

    private static JavaClasses planted;

    @ArchTest
    static final ArchRule the_application_and_the_domain_do_not_depend_on_spring_boot = noClasses()
            .that().resideInAnyPackage("..application..", "..domain..")
            .should().dependOnClassesThat().resideInAPackage("org.springframework.boot..")
            .because(DRIVING_ADAPTERS);

    @ArchTest
    static final ArchRule the_application_and_the_domain_do_not_react_to_the_framework_lifecycle = noClasses()
            .that().resideInAnyPackage("..application..", "..domain..")
            .should().dependOnClassesThat(assignableTo(ApplicationContextEvent.class).or(assignableTo(Lifecycle.class))
                    .as("framework lifecycle events or callbacks"))
            .because(DRIVING_ADAPTERS);

    @BeforeAll
    static void plantFrameworkBindings(@TempDir Path folder) throws IOException {
        planted = PlantedClasses.compiled(folder, Stream.concat(plantedClasses(), allowedClasses())
                .collect(Collectors.toMap(PlantedClass::className, PlantedClass::source)));
    }

    @ParameterizedTest(name = "{0} reports {1}")
    @MethodSource("plantedClasses")
    @DisplayName("Given a planted class that binds the framework in the core, when the rule checks it, then exactly that class is reported")
    void should_report_the_planted_class_when_checked_given_a_framework_binding_in_the_core(String rule, String className)
            throws ReflectiveOperationException {
        ArchRule checked = (ArchRule) FrameworkBindingRulesTest.class.getDeclaredField(rule).get(null);
        JavaClasses plantedClass = planted.that(DescribedPredicate.describe("the planted class", type -> type.getName().equals(className)));

        assertThat(checked.evaluate(plantedClass).getFailureReport().getDetails())
                .isNotEmpty().allSatisfy(detail -> assertThat(detail).contains(className.substring(className.lastIndexOf('.') + 1)));
    }

    @ParameterizedTest(name = "{0} leaves {1} alone")
    @MethodSource("allowedClasses")
    @DisplayName("Given a planted adapter or an application listener of the site's own events, when the rule checks every planted class, then that class is not reported")
    void should_report_nothing_when_checked_given_an_allowed_class(String rule, String className) throws ReflectiveOperationException {
        ArchRule checked = (ArchRule) FrameworkBindingRulesTest.class.getDeclaredField(rule).get(null);

        assertThat(checked.evaluate(planted).getFailureReport().getDetails())
                .isNotEmpty().noneSatisfy(detail -> assertThat(detail).contains(className.substring(className.lastIndexOf('.') + 1)));
    }

    static Stream<PlantedClass> plantedClasses() {
        return Stream.of(
                planted("the_application_and_the_domain_do_not_depend_on_spring_boot", "donors.application.PlantedProperties",
                        "@org.springframework.boot.context.properties.ConfigurationProperties(\"app.planted\") public record PlantedProperties(int limit) {}"),
                planted("the_application_and_the_domain_do_not_depend_on_spring_boot", "donors.application.PlantedReadyListener",
                        "public class PlantedReadyListener { @org.springframework.context.event.EventListener("
                                + "org.springframework.boot.context.event.ApplicationReadyEvent.class) void start() {} }"),
                planted("the_application_and_the_domain_do_not_depend_on_spring_boot", "donors.domain.PlantedRunner",
                        "public class PlantedRunner implements org.springframework.boot.ApplicationRunner { "
                                + "public void run(org.springframework.boot.ApplicationArguments arguments) {} }"),
                planted("the_application_and_the_domain_do_not_react_to_the_framework_lifecycle", "donors.application.PlantedRefreshListener",
                        "public class PlantedRefreshListener { @org.springframework.context.event.EventListener("
                                + "org.springframework.context.event.ContextRefreshedEvent.class) void start() {} }"),
                planted("the_application_and_the_domain_do_not_react_to_the_framework_lifecycle", "shared.application.PlantedClosedListener",
                        "public class PlantedClosedListener { @org.springframework.context.event.EventListener "
                                + "void stop(org.springframework.context.event.ContextClosedEvent closed) {} }"),
                planted("the_application_and_the_domain_do_not_react_to_the_framework_lifecycle", "operations.application.PlantedLifecycle",
                        "public class PlantedLifecycle implements org.springframework.context.SmartLifecycle { "
                                + "public void start() {} public void stop() {} public boolean isRunning() { return false; } }"));
    }

    static Stream<PlantedClass> allowedClasses() {
        return Stream.of(
                planted("the_application_and_the_domain_do_not_depend_on_spring_boot", "donors.infrastructure.startup.PlantedStartup",
                        "public class PlantedStartup { @org.springframework.context.event.EventListener("
                                + "org.springframework.boot.context.event.ApplicationReadyEvent.class) void start() {} }"),
                planted("the_application_and_the_domain_do_not_react_to_the_framework_lifecycle", "donors.application.PlantedOwnEventListener",
                        "public class PlantedOwnEventListener { @org.springframework.context.event.EventListener "
                                + "void on(cz.novanadeje.app.shared.application.event.DonorRegistered registered) {} }"));
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
