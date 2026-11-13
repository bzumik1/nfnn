package cz.novanadeje.app.architecture;

import com.tngtech.archunit.base.DescribedPredicate;
import com.tngtech.archunit.core.domain.AccessTarget;
import com.tngtech.archunit.core.domain.AccessTarget.CodeUnitAccessTarget;
import com.tngtech.archunit.core.domain.JavaAccess;
import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaConstructor;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;
import cz.novanadeje.app.AppApplication;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.InstantSource;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.MonthDay;
import java.time.OffsetDateTime;
import java.time.Year;
import java.time.YearMonth;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.chrono.HijrahDate;
import java.time.chrono.IsoChronology;
import java.util.Calendar;
import java.util.Date;
import java.util.GregorianCalendar;
import java.util.List;
import java.util.Set;
import java.util.function.Supplier;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static org.assertj.core.api.Assertions.assertThat;

@AnalyzeClasses(
        packagesOf = AppApplication.class,
        importOptions = ImportOption.DoNotIncludeTests.class
)
class TimeRulesTest {

    private static final String CLOCK_BEAN = "cz.novanadeje.app.shared.infrastructure.time.ClockConfiguration";
    private static final Set<String> SYSTEM_CLOCK_FACTORIES = Set.of("system", "systemUTC", "systemDefaultZone", "tickSeconds", "tickMinutes", "tickMillis");
    private static final Set<String> TODAY_IN_JAVA_TIME = Set.of("now", "dateNow");
    private static final String FOUNDATION_ZONE_ID = "Europe/Prague";
    private static final Path FOUNDATION_ZONE = Path.of("cz", "novanadeje", "app", "shared", "domain", "FoundationZone.java");
    private static final Pattern REPORTED_TARGET = Pattern.compile("(?:calls|references) (?:method|constructor) <(.+)> in \\(");

    private static final DescribedPredicate<JavaAccess<?>> READING_THE_SYSTEM_CLOCK = DescribedPredicate.describe(
            "a read of the system clock", TimeRulesTest::readsTheSystemClock);

    @ArchTest
    static final ArchRule time_comes_from_the_injected_clock = noClasses()
            .should().accessTargetWhere(READING_THE_SYSTEM_CLOCK)
            .because("business time comes from the injected Clock, so tests move it with MutableClock");

    @Test
    @DisplayName("Given a class that reads the system clock in every way Java offers, when the time rule checks it, then each read is reported and no read of a given clock is")
    void should_report_every_system_clock_read_when_rule_checks_given_a_planted_class() {
        var details = time_comes_from_the_injected_clock.evaluate(new ClassFileImporter().importClasses(PlantedClockReads.class))
                .getFailureReport().getDetails();

        assertThat(details.stream().map(TimeRulesTest::reportedTarget)).containsExactlyInAnyOrder(
                "java.time.Instant.now()",
                "java.time.Instant.now()",
                "java.time.LocalDate.now()",
                "java.time.LocalDateTime.now()",
                "java.time.LocalTime.now(java.time.ZoneId)",
                "java.time.OffsetDateTime.now()",
                "java.time.ZonedDateTime.now(java.time.ZoneId)",
                "java.time.Year.now()",
                "java.time.YearMonth.now()",
                "java.time.MonthDay.now()",
                "java.time.chrono.HijrahDate.now()",
                "java.time.chrono.IsoChronology.dateNow()",
                "java.time.Clock.systemUTC()",
                "java.time.Clock.systemDefaultZone()",
                "java.time.Clock.tickMillis(java.time.ZoneId)",
                "java.time.InstantSource.system()",
                "java.lang.System.currentTimeMillis()",
                "java.util.Date.<init>()",
                "java.util.Calendar.getInstance()",
                "java.util.GregorianCalendar.<init>()");
    }

    @Test
    @DisplayName("Given the main sources, when they are searched for the foundation's zone id, then only FoundationZone names it")
    void should_name_the_zone_only_in_foundation_zone_when_searched_given_the_main_sources() throws IOException {
        Path main = Path.of("src", "main", "java");

        assertThat(filesNamingTheZone(main)).containsExactly(main.resolve(FOUNDATION_ZONE));
    }

    @Test
    @DisplayName("Given a planted scheduler that names the zone itself, when the sources are searched, then it is reported")
    void should_report_planted_zone_when_searched_given_a_scheduler_with_its_own_literal(@TempDir Path sources) throws IOException {
        Files.writeString(sources.resolve("PlantedScheduler.java"), "class PlantedScheduler { String zone = \"Europe/Prague\"; }");
        Files.writeString(sources.resolve("Unrelated.java"), "class Unrelated { String zone = \"UTC\"; }");

        assertThat(filesNamingTheZone(sources)).containsExactly(sources.resolve("PlantedScheduler.java"));
    }

    private static boolean readsTheSystemClock(JavaAccess<?> access) {
        return asksJavaTimeForToday(access)
                || buildsASystemClock(access)
                || readsCurrentTimeMillis(access)
                || buildsTodaysDateOrCalendar(access)
                || asksForACalendar(access);
    }

    private static boolean asksJavaTimeForToday(JavaAccess<?> access) {
        return access.getTargetOwner().getPackageName().startsWith("java.time")
                && TODAY_IN_JAVA_TIME.contains(access.getTarget().getName())
                && !takesAClock(access.getTarget());
    }

    private static boolean buildsASystemClock(JavaAccess<?> access) {
        JavaClass owner = access.getTargetOwner();
        return (owner.isEquivalentTo(Clock.class) || owner.isEquivalentTo(InstantSource.class))
                && SYSTEM_CLOCK_FACTORIES.contains(access.getTarget().getName())
                && !access.getOriginOwner().getName().equals(CLOCK_BEAN);
    }

    private static boolean readsCurrentTimeMillis(JavaAccess<?> access) {
        return access.getTargetOwner().isEquivalentTo(System.class) && access.getTarget().getName().equals("currentTimeMillis");
    }

    private static boolean buildsTodaysDateOrCalendar(JavaAccess<?> access) {
        JavaClass owner = access.getTargetOwner();
        return (owner.isAssignableTo(Date.class) || owner.isAssignableTo(Calendar.class))
                && access.getTarget().getName().equals(JavaConstructor.CONSTRUCTOR_NAME)
                && !takesAnyArgument(access.getTarget());
    }

    private static boolean asksForACalendar(JavaAccess<?> access) {
        return access.getTargetOwner().isAssignableTo(Calendar.class) && access.getTarget().getName().equals("getInstance");
    }

    private static boolean takesAClock(AccessTarget target) {
        return target instanceof CodeUnitAccessTarget codeUnit && codeUnit.getRawParameterTypes().stream().anyMatch(type -> type.isEquivalentTo(Clock.class));
    }

    private static boolean takesAnyArgument(AccessTarget target) {
        return target instanceof CodeUnitAccessTarget codeUnit && !codeUnit.getRawParameterTypes().isEmpty();
    }

    private static String reportedTarget(String detail) {
        Matcher target = REPORTED_TARGET.matcher(detail);
        return target.find() ? target.group(1) : detail;
    }

    private static List<Path> filesNamingTheZone(Path root) throws IOException {
        try (Stream<Path> files = Files.walk(root)) {
            return files.filter(Files::isRegularFile).filter(TimeRulesTest::namesTheZone).sorted().toList();
        }
    }

    private static boolean namesTheZone(Path file) {
        try {
            return Files.readString(file).contains(FOUNDATION_ZONE_ID);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    static final class PlantedClockReads {

        List<Object> reads(ZoneId zone) {
            Supplier<Instant> reference = Instant::now;
            return List.of(
                    reference,
                    Instant.now(),
                    LocalDate.now(),
                    LocalDateTime.now(),
                    LocalTime.now(zone),
                    OffsetDateTime.now(),
                    ZonedDateTime.now(zone),
                    Year.now(),
                    YearMonth.now(),
                    MonthDay.now(),
                    HijrahDate.now(),
                    IsoChronology.INSTANCE.dateNow(),
                    Clock.systemUTC(),
                    Clock.systemDefaultZone(),
                    Clock.tickMillis(zone),
                    InstantSource.system(),
                    System.currentTimeMillis(),
                    new Date(),
                    Calendar.getInstance(),
                    new GregorianCalendar());
        }

        List<Object> readsTheGivenClock(Clock clock, ZoneId zone) {
            return List.of(
                    Instant.now(clock),
                    LocalDate.now(clock),
                    Year.now(clock),
                    Clock.tick(clock, Duration.ofSeconds(1)),
                    Clock.fixed(Instant.EPOCH, zone),
                    new Date(0L),
                    new GregorianCalendar(2026, Calendar.NOVEMBER, 13));
        }
    }
}
