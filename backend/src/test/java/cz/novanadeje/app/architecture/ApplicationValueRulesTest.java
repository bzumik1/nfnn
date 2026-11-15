package cz.novanadeje.app.architecture;

import com.tngtech.archunit.base.DescribedPredicate;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.domain.JavaFieldAccess;
import com.tngtech.archunit.core.domain.JavaModifier;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;
import cz.novanadeje.app.AppApplication;
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

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static org.assertj.core.api.Assertions.assertThat;

@AnalyzeClasses(
        packagesOf = AppApplication.class,
        importOptions = ImportOption.DoNotIncludeTests.class
)
class ApplicationValueRulesTest {

    private static final DescribedPredicate<JavaFieldAccess> A_STATIC_VALUE_OF_THE_APPLICATION = DescribedPredicate.describe(
            "a static field of a class of an application package other than an enum constant",
            access -> access.getTargetOwner().getPackageName().contains(".application")
                    && !access.getTargetOwner().isEnum()
                    && access.getTarget().resolveMember().map(field -> field.getModifiers().contains(JavaModifier.STATIC)).orElse(false));

    private static JavaClasses planted;

    @ArchTest
    static final ArchRule adapters_read_no_static_value_of_the_application = noClasses()
            .that().resideInAPackage("..infrastructure..")
            .should().getFieldWhere(A_STATIC_VALUE_OF_THE_APPLICATION)
            .because("backend.md, Application: a value of a business rule (a lifetime, a limit, a set of kinds) belongs to the domain, and an adapter gets it "
                    + "from the event, command or result of the use case; read from an application class's static field, the rule spreads over the "
                    + "scheduler and the mail adapter (#621 R4-A6). javac inlines a compile-time constant (a String or a primitive), which the rule cannot see");

    @BeforeAll
    static void plantAdaptersReadingApplicationValues(@TempDir Path folder) throws IOException {
        planted = PlantedClasses.compiled(folder, Stream.of(plantedClasses(), allowedClasses(), supportingClasses()).flatMap(classes -> classes)
                .collect(Collectors.toMap(PlantedClass::sourceName, PlantedClass::source)));
    }

    @ParameterizedTest(name = "{0} reports {1}")
    @MethodSource("plantedClasses")
    @DisplayName("Given a planted adapter that reads a static value of an application class, when the rule checks it, then exactly that class is reported")
    void should_report_the_planted_adapter_when_checked_given_a_read_of_an_application_value(ArchRule rule, String className) {
        JavaClasses plantedClass = planted.that(DescribedPredicate.describe("the planted class", type -> type.getName().equals(className)));

        assertThat(rule.evaluate(plantedClass).getFailureReport().getDetails())
                .isNotEmpty().allSatisfy(detail -> assertThat(detail).contains(className));
    }

    @ParameterizedTest(name = "{0} leaves {1} alone")
    @MethodSource("allowedClasses")
    @DisplayName("Given a planted class that reads an enum constant or an event's value of the application, a domain constant, or an application value from the application, when the rule checks every planted class, then that class is not reported")
    void should_report_nothing_when_checked_given_an_allowed_read(ArchRule rule, String className) {
        assertThat(rule.evaluate(planted).getFailureReport().getDetails())
                .isNotEmpty().noneSatisfy(detail -> assertThat(detail).contains(className + "."));
    }

    static Stream<PlantedClass> plantedClasses() {
        return Stream.of(
                planted("scheduler", "donors.infrastructure.reminder.PlantedExpiryScheduler",
                        "class PlantedExpiryScheduler { long days() { "
                                + "return cz.novanadeje.app.donors.application.PlantedExpiryService.RETENTION.toDays(); } }"),
                planted("mail adapter in a lambda", "donors.infrastructure.mail.PlantedReminderSender",
                        "class PlantedReminderSender { java.util.function.Supplier<Long> days() { "
                                + "return () -> cz.novanadeje.app.donors.application.PlantedExpiryService.RETENTION.toDays(); } }"),
                planted("collection of an application record", "operations.infrastructure.push.PlantedRetryTimer",
                        "class PlantedRetryTimer { int attempts() { "
                                + "return cz.novanadeje.app.operations.application.PlantedRetries.DELAYS.size(); } }"),
                planted("nested adapter class", "donations.infrastructure.mail.PlantedReportSender",
                        "class PlantedReportSender { static final class Body { java.time.Duration window() { "
                                + "return cz.novanadeje.app.donations.application.PlantedReportService.WINDOW; } } }",
                        "cz.novanadeje.app.donations.infrastructure.mail.PlantedReportSender$Body"));
    }

    static Stream<PlantedClass> allowedClasses() {
        return Stream.of(
                planted("enum constant", "donors.infrastructure.mail.PlantedKindSender",
                        "class PlantedKindSender { Object kind() { return cz.novanadeje.app.donors.application.PlantedReminderKind.FIRST; } }"),
                planted("domain constant", "donors.infrastructure.reminder.PlantedDomainScheduler",
                        "class PlantedDomainScheduler { long days() { return cz.novanadeje.app.donors.domain.PlantedLifetime.LIFETIME.toDays(); } }"),
                planted("value of the event", "donors.infrastructure.mail.PlantedEventSender",
                        "class PlantedEventSender { long days(cz.novanadeje.app.donors.application.PlantedReminderDue event) { "
                                + "return event.lifetime().toDays(); } }"),
                planted("application reading the application", "donors.application.PlantedReminderProperties",
                        "public record PlantedReminderProperties(java.time.Duration window) { public boolean fits() { "
                                + "return window.compareTo(PlantedExpiryService.RETENTION) < 0; } }"));
    }

    static Stream<PlantedClass> supportingClasses() {
        return Stream.of(
                planted("supporting", "donors.application.PlantedExpiryService",
                        "public class PlantedExpiryService { public static final java.time.Duration RETENTION = java.time.Duration.ofDays(30); }"),
                planted("supporting", "operations.application.PlantedRetries",
                        "public record PlantedRetries(int attempt) { public static final java.util.List<java.time.Duration> DELAYS = "
                                + "java.util.List.of(java.time.Duration.ofMinutes(1)); }"),
                planted("supporting", "donations.application.PlantedReportService",
                        "public class PlantedReportService { public static final java.time.Duration WINDOW = java.time.Duration.ofDays(1); }"),
                planted("supporting", "donors.application.PlantedReminderKind", "public enum PlantedReminderKind { FIRST }"),
                planted("supporting", "donors.application.PlantedReminderDue", "public record PlantedReminderDue(java.time.Duration lifetime) { }"),
                planted("supporting", "donors.domain.PlantedLifetime",
                        "public final class PlantedLifetime { public static final java.time.Duration LIFETIME = java.time.Duration.ofDays(30); "
                                + "private PlantedLifetime() { } }"));
    }

    private static PlantedClass planted(String label, String relativeName, String body) {
        return planted(label, relativeName, body, "cz.novanadeje.app." + relativeName);
    }

    private static PlantedClass planted(String label, String relativeName, String body, String reportedClass) {
        String sourceName = "cz.novanadeje.app." + relativeName;
        return new PlantedClass(Named.of(label, adapters_read_no_static_value_of_the_application), sourceName, reportedClass,
                "package " + sourceName.substring(0, sourceName.lastIndexOf('.')) + ";\n" + body + "\n");
    }

    record PlantedClass(Named<ArchRule> rule, String sourceName, String className, String source) implements Arguments {

        @Override
        public Object[] get() {
            return new Object[]{rule, className};
        }
    }
}
