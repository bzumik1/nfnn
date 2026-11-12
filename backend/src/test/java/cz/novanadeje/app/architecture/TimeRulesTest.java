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
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.MonthDay;
import java.time.OffsetDateTime;
import java.time.Year;
import java.time.YearMonth;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.Calendar;
import java.util.Date;
import java.util.List;
import java.util.function.Supplier;
import java.util.stream.Stream;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static org.assertj.core.api.Assertions.assertThat;

@AnalyzeClasses(
        packagesOf = AppApplication.class,
        importOptions = ImportOption.DoNotIncludeTests.class
)
class TimeRulesTest {

    private static final String FOUNDATION_ZONE_ID = "Europe/Prague";
    private static final Path FOUNDATION_ZONE = Path.of("cz", "novanadeje", "app", "shared", "domain", "FoundationZone.java");

    private static final String CLOCK_BEAN_PACKAGE = "cz.novanadeje.app.shared.infrastructure.time";

    private static final DescribedPredicate<JavaAccess<?>> READING_THE_SYSTEM_CLOCK = DescribedPredicate.describe(
            "a read of the system clock", TimeRulesTest::readsTheSystemClock);

    @ArchTest
    static final ArchRule time_comes_from_the_injected_clock = noClasses()
            .should().accessTargetWhere(READING_THE_SYSTEM_CLOCK)
            .because("business time comes from the injected Clock, so tests move it with MutableClock");

    @Test
    @DisplayName("Given a class that reads the system clock in every way Java offers, when the time rule checks it, then each read is reported")
    void should_report_every_system_clock_read_when_rule_checks_given_a_planted_class() {
        var details = time_comes_from_the_injected_clock.evaluate(new ClassFileImporter().importClasses(PlantedClockReads.class))
                .getFailureReport().getDetails();

        assertThat(details).hasSize(15).allSatisfy(detail -> assertThat(detail).contains(PlantedClockReads.class.getSimpleName()))
                .anySatisfy(detail -> assertThat(detail).contains("references method <java.time.Instant.now()>"))
                .noneSatisfy(detail -> assertThat(detail).contains("java.time.Clock)>"));
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
        JavaClass owner = access.getTargetOwner();
        String name = access.getTarget().getName();
        if (owner.getPackageName().equals("java.time") && name.equals("now")) {
            return !takesAClock(access.getTarget());
        }
        if (owner.isEquivalentTo(Clock.class) && name.startsWith("system")) {
            return !access.getOriginOwner().getPackageName().equals(CLOCK_BEAN_PACKAGE);
        }
        return owner.isEquivalentTo(System.class) && name.equals("currentTimeMillis")
                || owner.isEquivalentTo(Date.class) && name.equals(JavaConstructor.CONSTRUCTOR_NAME) && !takesAnyArgument(access.getTarget())
                || owner.isEquivalentTo(Calendar.class) && name.equals("getInstance");
    }

    private static boolean takesAClock(AccessTarget target) {
        return target instanceof CodeUnitAccessTarget codeUnit && codeUnit.getRawParameterTypes().stream().anyMatch(type -> type.isEquivalentTo(Clock.class));
    }

    private static boolean takesAnyArgument(AccessTarget target) {
        return target instanceof CodeUnitAccessTarget codeUnit && !codeUnit.getRawParameterTypes().isEmpty();
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
            return List.of(reference, Instant.now(), LocalDate.now(), LocalDateTime.now(), LocalTime.now(zone), OffsetDateTime.now(), ZonedDateTime.now(zone),
                    Year.now(), YearMonth.now(), MonthDay.now(), Clock.systemUTC(), Clock.systemDefaultZone(), System.currentTimeMillis(), new Date(),
                    Calendar.getInstance());
        }

        List<Object> readsTheGivenClock(Clock clock) {
            return List.of(Instant.now(clock), LocalDate.now(clock), Year.now(clock));
        }
    }
}
