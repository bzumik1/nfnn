package cz.novanadeje.app.architecture;

import com.tngtech.archunit.base.DescribedPredicate;
import com.tngtech.archunit.core.domain.JavaAccess;
import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.domain.JavaField;
import com.tngtech.archunit.core.domain.JavaModifier;
import com.tngtech.archunit.core.domain.JavaStaticInitializer;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchCondition;
import com.tngtech.archunit.lang.ArchRule;
import cz.novanadeje.app.AppApplication;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Period;
import java.time.temporal.ChronoUnit;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noFields;
import static org.assertj.core.api.Assertions.assertThat;

@AnalyzeClasses(
        packagesOf = AppApplication.class,
        importOptions = ImportOption.DoNotIncludeTests.class
)
class ApplicationDurationRulesTest {

    private static final String RELEASE_CHECK = "cz.novanadeje.app.operations.application.release.ReleaseCheckService";

    private static final Map<String, String> TECHNICAL_BOUNDS = Map.of(
            "cz.novanadeje.app.donations.application.importing.ImportBankPaymentsService.FOLLOW_UP_MARGIN",
            "the margin after the bank's refusal window before a follow-up import, a pacing of an outside call",
            "cz.novanadeje.app.operations.application.clienterrors.ClientErrorCap.WINDOW",
            "the hour over which browser error reports are capped bounds the log's volume, like a rate-limit window; it moves together with "
                    + "ClientErrorBucket.perHour, whose name says the hour",
            RELEASE_CHECK + ".PUBLICATION_TOLERANCE",
            "the clock skew allowed in GitHub's answer about the latest release",
            "cz.novanadeje.app.operations.application.push.PushAlertDispatcher.RETRY_DELAYS",
            "the retries of an outside call (Web Push) for the devices that failed, which DonorPushDispatcher reads too");

    private static final Set<String> BOUND_OWNERS = TECHNICAL_BOUNDS.keySet().stream()
            .map(bound -> bound.substring(0, bound.lastIndexOf('.')))
            .collect(Collectors.toUnmodifiableSet());
    private static final Set<String> FACTORIES_BESIDE_OF = Set.of("parse", "from");

    private static final DescribedPredicate<JavaField> HOLDING_A_LENGTH_OF_TIME = DescribedPredicate.describe(
            "hold a Duration or a Period, inside a generic type or an array too",
            field -> field.getType().getAllInvolvedRawTypes().stream().anyMatch(ApplicationDurationRulesTest::isALengthOfTime));

    @ArchTest
    static final ArchRule a_length_of_time_of_a_rule_lives_in_the_domain = noFields()
            .that().areDeclaredInClassesThat().resideInAPackage("..application..")
            .and().areStatic()
            .and(DescribedPredicate.describe("are not a reviewed technical bound", field -> !TECHNICAL_BOUNDS.containsKey(field.getFullName())))
            .should(ArchCondition.from(HOLDING_A_LENGTH_OF_TIME))
            .because("backend.md, Application: a value of a business rule (a lifetime, a window, a pause) lives in the domain, where its tests"
                    + " pin its boundaries; an application class keeps a length of time only as a reviewed technical bound of an outside call or"
                    + " of the log's volume, named with its reason (#621, round 5)");

    @ArchTest
    static final ArchRule a_length_of_time_is_not_written_into_the_application = noClasses()
            .that().resideInAPackage("..application..")
            .should().accessTargetWhere(DescribedPredicate.describe(
                    "create a Duration or a Period (of…, parse, from), by a call or a method reference, outside the static initializer of a class"
                            + " holding a reviewed technical bound, or use a ChronoUnit or TimeUnit",
                    ApplicationDurationRulesTest::writesALengthOfTime))
            .because("a length of time written inline in a method, an enum constant or an instance field, or counted in a unit, is the same"
                    + " rule value the static field rule refuses, only out of its sight (#621, round 5)");

    @Test
    @DisplayName("Given the reviewed technical bounds, when the site is read, then each is still a static length of time of an application class, so the list names no field that is gone or no longer needs it")
    void should_find_every_technical_bound_when_read_given_the_list() {
        JavaClasses site = new ClassFileImporter().withImportOption(new ImportOption.DoNotIncludeTests()).importPackagesOf(AppApplication.class);

        assertThat(TECHNICAL_BOUNDS.keySet()).allSatisfy(bound -> {
            JavaClass owner = site.get(bound.substring(0, bound.lastIndexOf('.')));
            JavaField field = owner.getField(bound.substring(bound.lastIndexOf('.') + 1));
            assertThat(field.getModifiers()).as(bound).contains(JavaModifier.STATIC);
            assertThat(HOLDING_A_LENGTH_OF_TIME.test(field)).as(bound).isTrue();
        });
    }

    @Test
    @DisplayName("Given planted static lengths of time in application, domain and infrastructure classes, when the rule checks them, then exactly the application ones that are no reviewed bound are reported")
    void should_report_every_static_length_of_time_of_the_application_when_checked_given_planted_classes(@TempDir Path folder) throws IOException {
        JavaClasses planted = PlantedClasses.compiled(folder, Map.of(
                "cz.novanadeje.app.planteda.application.PlantedRules", """
                        package cz.novanadeje.app.planteda.application;

                        import java.time.Duration;
                        import java.time.Period;
                        import java.util.List;
                        import java.util.Optional;

                        public class PlantedRules {

                            static final Duration LIFETIME = Duration.ofDays(30);
                            static final Period NOTICE = Period.ofMonths(1);
                            static final List<Duration> STEPS = List.of(Duration.ofMinutes(1));
                            static final Duration[] PAUSES = {Duration.ofMinutes(15)};
                            static final Optional<Period> GRACE = Optional.empty();
                            static final int ATTEMPTS = 5;
                            static final Duration WINDOW = Duration.ofHours(1);

                            private final Duration configured;

                            public PlantedRules(Duration configured) {
                                this.configured = configured;
                            }
                        }
                        """,
                RELEASE_CHECK, """
                        package cz.novanadeje.app.operations.application.release;

                        import java.time.Duration;

                        public class ReleaseCheckService {

                            static final Duration PUBLICATION_TOLERANCE = Duration.ofDays(1);
                            static final Duration OFFER_FOR = Duration.ofDays(7);
                        }
                        """,
                "cz.novanadeje.app.planteda.domain.PlantedPolicy", """
                        package cz.novanadeje.app.planteda.domain;

                        import java.time.Duration;

                        public final class PlantedPolicy {

                            static final Duration LIFETIME = Duration.ofDays(30);
                        }
                        """,
                "cz.novanadeje.app.planteda.infrastructure.PlantedClient", """
                        package cz.novanadeje.app.planteda.infrastructure;

                        import java.time.Duration;

                        public final class PlantedClient {

                            static final Duration TIMEOUT = Duration.ofSeconds(10);
                        }
                        """));

        assertThat(a_length_of_time_of_a_rule_lives_in_the_domain.evaluate(planted).getFailureReport().getDetails())
                .hasSize(7)
                .anySatisfy(detail -> assertThat(detail).contains("PlantedRules.LIFETIME"))
                .anySatisfy(detail -> assertThat(detail).contains("PlantedRules.WINDOW"))
                .anySatisfy(detail -> assertThat(detail).contains("PlantedRules.NOTICE"))
                .anySatisfy(detail -> assertThat(detail).contains("PlantedRules.STEPS"))
                .anySatisfy(detail -> assertThat(detail).contains("PlantedRules.PAUSES"))
                .anySatisfy(detail -> assertThat(detail).contains("PlantedRules.GRACE"))
                .anySatisfy(detail -> assertThat(detail).contains("ReleaseCheckService.OFFER_FOR"))
                .noneSatisfy(detail -> assertThat(detail).containsAnyOf("ATTEMPTS", "configured", "PUBLICATION_TOLERANCE", "PlantedPolicy", "PlantedClient"));
    }

    @Test
    @DisplayName("Given planted application code writing a length of time in a method, a lambda, a method reference, an enum constant, an instance field and in units, and a reviewed bound's own initializer, when the inline rule checks it, then each is reported but the bound's initializer and a zero")
    void should_report_every_inline_length_of_time_when_checked_given_planted_application_code(@TempDir Path folder) throws IOException {
        JavaClasses planted = PlantedClasses.compiled(folder, Map.of(
                "cz.novanadeje.app.planteda.application.PlantedInline", """
                        package cz.novanadeje.app.planteda.application;

                        import java.time.Duration;
                        import java.time.Instant;
                        import java.time.Period;
                        import java.util.function.Supplier;

                        public class PlantedInline {

                            enum Kind {
                                SHORT(Duration.ofMinutes(5));

                                private final Duration lasts;

                                Kind(Duration lasts) {
                                    this.lasts = lasts;
                                }
                            }

                            private final Duration grace = Duration.parse("PT1H");

                            Instant cutoff(Instant now) {
                                return now.minus(Duration.ofDays(30));
                            }

                            Supplier<Period> notice() {
                                return () -> Period.ofMonths(1);
                            }

                            Duration between(Instant from, Instant to) {
                                return Duration.between(from, to).plusSeconds(1);
                            }

                            java.util.List<Duration> steps() {
                                return java.util.stream.Stream.of(1L, 5L).map(Duration::ofMinutes).toList();
                            }

                            Supplier<java.util.function.IntFunction<Period>> months() {
                                return () -> Period::ofMonths;
                            }

                            Instant counted(Instant now) {
                                return now.minus(30, java.time.temporal.ChronoUnit.DAYS);
                            }

                            long waited() {
                                return java.util.concurrent.TimeUnit.MINUTES.toSeconds(5);
                            }

                            Duration zero() {
                                return Duration.ZERO;
                            }
                        }
                        """,
                RELEASE_CHECK, """
                        package cz.novanadeje.app.operations.application.release;

                        import java.time.Duration;
                        import java.time.Instant;

                        public class ReleaseCheckService {

                            static final Duration PUBLICATION_TOLERANCE = Duration.ofDays(1);

                            Instant offeredUntil(Instant at) {
                                return at.plus(Duration.ofDays(7));
                            }
                        }
                        """,
                "cz.novanadeje.app.planteda.infrastructure.PlantedTimeouts", """
                        package cz.novanadeje.app.planteda.infrastructure;

                        import java.time.Duration;

                        final class PlantedTimeouts {

                            Duration connect() {
                                return Duration.ofSeconds(10);
                            }
                        }
                        """));

        assertThat(a_length_of_time_is_not_written_into_the_application.evaluate(planted).getFailureReport().getDetails())
                .hasSize(10)
                .anySatisfy(detail -> assertThat(detail).contains("PlantedInline$Kind.<clinit>()").contains("Duration.ofMinutes"))
                .anySatisfy(detail -> assertThat(detail).contains("PlantedInline.steps()").contains("Duration.ofMinutes"))
                .anySatisfy(detail -> assertThat(detail).contains("PlantedInline.months()").contains("Period.ofMonths"))
                .anySatisfy(detail -> assertThat(detail).contains("PlantedInline.counted(").contains("ChronoUnit.DAYS"))
                .anySatisfy(detail -> assertThat(detail).contains("PlantedInline.waited()").contains("TimeUnit.MINUTES"))
                .anySatisfy(detail -> assertThat(detail).contains("PlantedInline.waited()").contains("TimeUnit.toSeconds"))
                .anySatisfy(detail -> assertThat(detail).contains("PlantedInline.<init>()").contains("Duration.parse"))
                .anySatisfy(detail -> assertThat(detail).contains("PlantedInline.cutoff(").contains("Duration.ofDays"))
                .anySatisfy(detail -> assertThat(detail).contains("PlantedInline.notice()").contains("Period.ofMonths"))
                .anySatisfy(detail -> assertThat(detail).contains("ReleaseCheckService.offeredUntil(").contains("Duration.ofDays"))
                .noneSatisfy(detail -> assertThat(detail).containsAnyOf("between(", "zero()", "ReleaseCheckService.<clinit>", "PlantedTimeouts"));
    }

    private static boolean writesALengthOfTime(JavaAccess<?> access) {
        boolean unit = access.getTargetOwner().isEquivalentTo(ChronoUnit.class) || access.getTargetOwner().isEquivalentTo(TimeUnit.class);
        boolean factory = isALengthOfTime(access.getTargetOwner())
                && (access.getName().startsWith("of") || FACTORIES_BESIDE_OF.contains(access.getName()));
        boolean inABoundsInitializer = access.getOrigin() instanceof JavaStaticInitializer && BOUND_OWNERS.contains(access.getOriginOwner().getName());
        return unit || factory && !inABoundsInitializer;
    }

    private static boolean isALengthOfTime(JavaClass type) {
        return type.isEquivalentTo(Duration.class) || type.isEquivalentTo(Period.class);
    }
}
