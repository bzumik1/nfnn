package cz.novanadeje.app.architecture;

import com.tngtech.archunit.base.DescribedPredicate;
import com.tngtech.archunit.core.domain.AccessTarget.CodeUnitAccessTarget;
import com.tngtech.archunit.core.domain.JavaAccess;
import com.tngtech.archunit.core.domain.JavaAnnotation;
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
import org.springframework.scheduling.support.CronTrigger;

import java.io.IOException;
import java.nio.file.Path;
import java.util.Arrays;
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
            "a CronTrigger built from its expression alone",
            access -> access.getTarget() instanceof CodeUnitAccessTarget target
                    && access.getTargetOwner().isEquivalentTo(CronTrigger.class) && target.getName().equals("<init>")
                    && target.getRawParameterTypes().size() == 1);

    @ArchTest
    static final ArchRule every_cron_runs_on_the_foundation_calendar = methods()
            .that().areMetaAnnotatedWith(Scheduled.class).or().areAnnotatedWith(Schedules.class)
            .should(runEveryCronInTheFoundationZone())
            .because("backend.md, Domain: the foundation's calendar is Prague's and the server's zone is no contract, so a cron names"
                    + " zone = FoundationZone.ID (#1095)");

    @ArchTest
    static final ArchRule no_cron_is_built_without_its_zone = noClasses()
            .should().accessTargetWhere(A_ZONELESS_CRON)
            .because("a CronTrigger without its zone reads the JVM's zone (#1095); CronExpression.next of a LocalDateTime does too, but its"
                    + " generic signature hides the argument's type from a bytecode rule, so review keeps it out");

    @Test
    @DisplayName("Given planted scheduled methods with and without the foundation's zone, in a container and composed, and cron triggers with and without the zone, when the rules check them, then each zone-less, other-zone or composed cron is reported and the zoned ones and a fixed delay are not")
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
                        }
                        """));

        assertThat(every_cron_runs_on_the_foundation_calendar.evaluate(planted).getFailureReport().getDetails())
                .hasSize(4)
                .anySatisfy(detail -> assertThat(detail).contains("zoneless()"))
                .anySatisfy(detail -> assertThat(detail).contains("utc()"))
                .anySatisfy(detail -> assertThat(detail).contains("twice()"))
                .anySatisfy(detail -> assertThat(detail).contains("composed()"));
        assertThat(no_cron_is_built_without_its_zone.evaluate(planted).getFailureReport().getDetails())
                .singleElement().satisfies(detail -> assertThat(detail).contains("trigger()"));
    }

    private static ArchCondition<JavaMethod> runEveryCronInTheFoundationZone() {
        return new ArchCondition<>("name zone = FoundationZone.ID on every cron, and be annotated with @Scheduled itself rather than a composed annotation") {
            @Override
            public void check(JavaMethod method, ConditionEvents events) {
                boolean direct = method.isAnnotatedWith(Scheduled.class) || method.isAnnotatedWith(Schedules.class);
                if (!direct) {
                    events.add(SimpleConditionEvent.violated(method, method.getFullName() + " is scheduled through a composed annotation, whose zone no rule checks"));
                    return;
                }
                schedulesOf(method)
                        .filter(scheduled -> !scheduled.get("cron").map(String.class::cast).orElse("").isEmpty())
                        .filter(scheduled -> !FoundationZone.ID.equals(scheduled.get("zone").map(String.class::cast).orElse("")))
                        .findFirst()
                        .ifPresent(scheduled -> events.add(SimpleConditionEvent.violated(method,
                                method.getFullName() + " runs a cron outside the foundation's zone")));
            }
        };
    }

    private static Stream<JavaAnnotation<?>> schedulesOf(JavaMethod method) {
        Stream<JavaAnnotation<?>> single = method.tryGetAnnotationOfType(Scheduled.class.getName()).stream().map(annotation -> (JavaAnnotation<?>) annotation);
        Stream<JavaAnnotation<?>> repeated = method.tryGetAnnotationOfType(Schedules.class.getName()).stream()
                .flatMap(container -> Arrays.stream((Object[]) container.get("value").orElse(new Object[0])))
                .map(annotation -> (JavaAnnotation<?>) annotation);
        return Stream.concat(single, repeated);
    }
}
