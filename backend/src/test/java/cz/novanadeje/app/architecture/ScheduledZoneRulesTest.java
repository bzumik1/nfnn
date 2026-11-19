package cz.novanadeje.app.architecture;

import com.tngtech.archunit.base.DescribedPredicate;
import com.tngtech.archunit.core.domain.AccessTarget.CodeUnitAccessTarget;
import com.tngtech.archunit.core.domain.JavaAccess;
import com.tngtech.archunit.core.domain.JavaAnnotation;
import com.tngtech.archunit.core.domain.JavaClass;
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
import cz.novanadeje.app.shared.domain.FoundationZone;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.scheduling.annotation.Schedules;
import org.springframework.scheduling.config.CronTask;
import org.springframework.scheduling.config.ScheduledTaskRegistrar;
import org.springframework.scheduling.support.CronExpression;
import org.springframework.scheduling.support.CronTrigger;

import java.io.IOException;
import java.nio.file.Path;
import java.time.ZoneId;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.methods;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static org.assertj.core.api.Assertions.assertThat;

@AnalyzeClasses(
        packagesOf = AppApplication.class,
        importOptions = ImportOption.DoNotIncludeTests.class
)
class ScheduledZoneRulesTest {

    private static final DescribedPredicate<JavaAccess<?>> A_ZONELESS_CRON = DescribedPredicate.describe(
            "a CronTrigger built or resumed from an expression without a zone, a CronTask or a registrar's cron task from an expression,"
                    + " or CronExpression.next",
            ScheduledZoneRulesTest::schedulesACronWithoutItsZone);

    @ArchTest
    static final ArchRule every_cron_runs_on_the_foundation_calendar = methods()
            .that().areMetaAnnotatedWith(Scheduled.class).or().areMetaAnnotatedWith(Schedules.class)
            .should(runEveryCronInTheFoundationZone())
            .because("backend.md, Domain: the foundation's calendar is Prague's and the server's zone is no contract, so a cron names"
                    + " zone = FoundationZone.ID (#1095)");

    @ArchTest
    static final ArchRule no_cron_is_built_without_its_zone = noClasses()
            .should().accessTargetWhere(A_ZONELESS_CRON)
            .because("a cron built from its expression alone runs on the JVM's zone, and CronExpression.next of a LocalDateTime does too,"
                    + " which its erased signature hides, so the site calls next nowhere (#1095); a zone given to CronTrigger must be"
                    + " FoundationZone.ZONE, which a bytecode rule cannot read and review keeps");

    @Test
    @DisplayName("Given planted scheduled methods with and without the foundation's zone, in a container and composed, and cron triggers, tasks and registrations with and without the zone, when the rules check them, then each zone-less, other-zone or composed cron and CronExpression.next are reported and the zoned ones and a fixed delay are not")
    void should_report_every_cron_outside_the_foundation_zone_when_checked_given_planted_schedules(@TempDir Path folder) throws IOException {
        JavaClasses planted = PlantedClasses.compiled(folder, Map.of(
                "cz.novanadeje.app.planteda.infrastructure.PlantedSchedules", """
                        package cz.novanadeje.app.planteda.infrastructure;

                        import cz.novanadeje.app.shared.domain.FoundationZone;
                        import java.lang.annotation.ElementType;
                        import java.lang.annotation.Retention;
                        import java.lang.annotation.RetentionPolicy;
                        import java.lang.annotation.Target;
                        import org.springframework.scheduling.annotation.Scheduled;
                        import org.springframework.scheduling.support.CronTrigger;

                        class PlantedSchedules {

                            @Target(ElementType.METHOD)
                            @Retention(RetentionPolicy.RUNTIME)
                            @Scheduled(cron = "0 0 3 * * *", zone = FoundationZone.ID)
                            @interface Nightly {
                            }

                            @Scheduled(cron = "0 0 3 * * *", zone = FoundationZone.ID)
                            void zoned() {
                            }

                            @Scheduled(cron = "0 0 3 * * *")
                            void zoneless() {
                            }

                            @Scheduled(cron = "0 0 3 * * *", zone = "UTC")
                            void utc() {
                            }

                            @Scheduled(cron = "0 0 3 * * *", zone = FoundationZone.ID)
                            @Scheduled(cron = "0 0 4 * * *")
                            void twice() {
                            }

                            @Nightly
                            void composed() {
                            }

                            @Scheduled(fixedDelayString = "PT1M")
                            void delayed() {
                            }

                            CronTrigger trigger() {
                                return new CronTrigger("0 0 3 * * *");
                            }

                            CronTrigger zonedTrigger() {
                                return new CronTrigger("0 0 3 * * *", FoundationZone.ZONE);
                            }

                            CronTrigger resumed(java.time.Instant last) {
                                return CronTrigger.resumeFixedExecution("0 0 3 * * *", last);
                            }

                            CronTrigger lenient() {
                                return CronTrigger.forLenientExecution("0 0 3 * * *");
                            }

                            org.springframework.scheduling.config.CronTask task(Runnable work) {
                                return new org.springframework.scheduling.config.CronTask(work, "0 0 3 * * *");
                            }

                            org.springframework.scheduling.config.CronTask zonedTask(Runnable work) {
                                return new org.springframework.scheduling.config.CronTask(work, new CronTrigger("0 0 3 * * *", FoundationZone.ZONE));
                            }

                            void registered(org.springframework.scheduling.config.ScheduledTaskRegistrar registrar, Runnable work) {
                                registrar.addCronTask(work, "0 0 3 * * *");
                            }

                            void registeredMap(org.springframework.scheduling.config.ScheduledTaskRegistrar registrar, Runnable work) {
                                registrar.setCronTasks(java.util.Map.of(work, "0 0 3 * * *"));
                            }

                            void registeredList(org.springframework.scheduling.config.ScheduledTaskRegistrar registrar,
                                                org.springframework.scheduling.config.CronTask task) {
                                registrar.setCronTasksList(java.util.List.of(task));
                            }

                            CronTrigger inUtc() {
                                return new CronTrigger("0 0 3 * * *", java.util.TimeZone.getTimeZone("UTC"));
                            }

                            static final class FoundationTrigger extends CronTrigger {

                                FoundationTrigger(String expression) {
                                    super(expression, FoundationZone.ZONE);
                                }
                            }

                            CronTrigger throughASubclass() {
                                return FoundationTrigger.forFixedExecution("0 0 3 * * *");
                            }

                            CronTrigger zonedSubclass() {
                                return new FoundationTrigger("0 0 3 * * *");
                            }

                            void registeredTask(org.springframework.scheduling.config.ScheduledTaskRegistrar registrar,
                                                org.springframework.scheduling.config.CronTask task) {
                                registrar.addCronTask(task);
                            }

                            java.time.ZonedDateTime next(org.springframework.scheduling.support.CronExpression cron, java.time.ZonedDateTime after) {
                                return cron.next(after);
                            }

                            @Target(ElementType.METHOD)
                            @Retention(RetentionPolicy.RUNTIME)
                            @Scheduled(cron = "0 0 3 * * *", zone = FoundationZone.ID)
                            @Scheduled(cron = "0 0 4 * * *", zone = FoundationZone.ID)
                            @interface TwiceNightly {
                            }

                            @TwiceNightly
                            void composedTwice() {
                            }

                            @Scheduled(cron = "0 0 3 * * *", zone = FoundationZone.ID)
                            @Nightly
                            void directAndComposed() {
                            }
                        }
                        """));

        assertThat(every_cron_runs_on_the_foundation_calendar.evaluate(planted).getFailureReport().getDetails())
                .hasSize(6)
                .anySatisfy(detail -> assertThat(detail).contains("composedTwice()").contains("TwiceNightly"))
                .anySatisfy(detail -> assertThat(detail).contains("directAndComposed()").contains("Nightly"))
                .anySatisfy(detail -> assertThat(detail).contains("zoneless()").contains("zone ''"))
                .anySatisfy(detail -> assertThat(detail).contains("utc()").contains("zone 'UTC'"))
                .anySatisfy(detail -> assertThat(detail).contains("twice()"))
                .anySatisfy(detail -> assertThat(detail).contains("composed()"));
        assertThat(no_cron_is_built_without_its_zone.evaluate(planted).getFailureReport().getDetails())
                .hasSize(9)
                .anySatisfy(detail -> assertThat(detail).contains("PlantedSchedules.registeredMap("))
                .anySatisfy(detail -> assertThat(detail).contains("PlantedSchedules.inUtc()"))
                .anySatisfy(detail -> assertThat(detail).contains("PlantedSchedules.throughASubclass()"))
                .anySatisfy(detail -> assertThat(detail).contains("PlantedSchedules.trigger()"))
                .anySatisfy(detail -> assertThat(detail).contains("PlantedSchedules.resumed("))
                .anySatisfy(detail -> assertThat(detail).contains("PlantedSchedules.lenient()"))
                .anySatisfy(detail -> assertThat(detail).contains("PlantedSchedules.task("))
                .anySatisfy(detail -> assertThat(detail).contains("PlantedSchedules.registered("))
                .anySatisfy(detail -> assertThat(detail).contains("PlantedSchedules.next("))
                .noneSatisfy(detail -> assertThat(detail).containsAnyOf("zonedTrigger()", "zonedTask(", "registeredTask(", "registeredList(", "zonedSubclass()",
                        "FoundationTrigger.<init>"));
    }

    private static ArchCondition<JavaMethod> runEveryCronInTheFoundationZone() {
        return new ArchCondition<>("name zone = FoundationZone.ID on every cron, and be annotated with @Scheduled itself rather than a composed annotation") {
            @Override
            public void check(JavaMethod method, ConditionEvents events) {
                method.getAnnotations().stream()
                        .filter(annotation -> !annotation.getRawType().isEquivalentTo(Scheduled.class) && !annotation.getRawType().isEquivalentTo(Schedules.class))
                        .filter(annotation -> annotation.getRawType().isMetaAnnotatedWith(Scheduled.class)
                                || annotation.getRawType().isMetaAnnotatedWith(Schedules.class))
                        .forEach(annotation -> events.add(SimpleConditionEvent.violated(method, method.getFullName() + " is scheduled through the composed "
                                + annotation.getRawType().getSimpleName() + ", whose zone no rule checks")));
                schedulesOf(method)
                        .filter(scheduled -> !scheduled.get("cron").map(String.class::cast).orElse("").isEmpty())
                        .filter(scheduled -> !FoundationZone.ID.equals(scheduled.get("zone").map(String.class::cast).orElse("")))
                        .forEach(scheduled -> events.add(SimpleConditionEvent.violated(method, method.getFullName() + " names zone '"
                                + scheduled.get("zone").map(String.class::cast).orElse("") + "' on cron '" + scheduled.get("cron").map(String.class::cast).orElse("")
                                + "', not FoundationZone.ID")));
            }
        };
    }

    private static boolean schedulesACronWithoutItsZone(JavaAccess<?> access) {
        if (!(access.getTarget() instanceof CodeUnitAccessTarget target)) {
            return false;
        }
        List<JavaClass> parameters = target.getRawParameterTypes();
        boolean expression = parameters.stream().anyMatch(type -> type.isEquivalentTo(String.class));
        boolean zone = parameters.stream().anyMatch(type -> type.isEquivalentTo(ZoneId.class));
        boolean construction = target.getName().equals("<init>");
        JavaClass owner = access.getTargetOwner();
        boolean trigger = construction ? owner.isEquivalentTo(CronTrigger.class) : owner.isAssignableTo(CronTrigger.class);
        return trigger && expression && !zone
                || owner.isEquivalentTo(CronTask.class) && construction && expression
                || owner.isAssignableTo(ScheduledTaskRegistrar.class) && (target.getName().equals("addCronTask") && expression
                || target.getName().equals("setCronTasks") && parameters.stream().anyMatch(type -> type.isAssignableTo(Map.class)))
                || owner.isEquivalentTo(CronExpression.class) && target.getName().equals("next");
    }

    private static Stream<JavaAnnotation<?>> schedulesOf(JavaMethod method) {
        Stream<JavaAnnotation<?>> single = method.tryGetAnnotationOfType(Scheduled.class.getName()).stream().map(annotation -> (JavaAnnotation<?>) annotation);
        Stream<JavaAnnotation<?>> repeated = method.tryGetAnnotationOfType(Schedules.class.getName()).stream()
                .flatMap(container -> Arrays.stream((Object[]) container.get("value").orElse(new Object[0])))
                .map(annotation -> (JavaAnnotation<?>) annotation);
        return Stream.concat(single, repeated);
    }
}
