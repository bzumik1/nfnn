package cz.novanadeje.app.architecture;

import com.tngtech.archunit.base.DescribedPredicate;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaFieldAccess;
import com.tngtech.archunit.core.domain.JavaMethodCall;
import com.tngtech.archunit.core.domain.JavaModifier;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;
import cz.novanadeje.app.AppApplication;
import cz.novanadeje.app.support.AttributedSources;
import cz.novanadeje.app.support.PlantedSources;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Named;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

import java.io.IOException;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static org.assertj.core.api.Assertions.assertThat;

@AnalyzeClasses(
        packagesOf = AppApplication.class,
        importOptions = ImportOption.DoNotIncludeTests.class
)
class ApplicationValueRulesTest {

    private static final DescribedPredicate<JavaClass> OF_THE_APPLICATION = JavaClass.Predicates.resideInAPackage("..application..");

    private static final DescribedPredicate<JavaFieldAccess> A_STATIC_VALUE_OF_THE_APPLICATION = DescribedPredicate.describe(
            "a static field of a class of an application package other than an enum constant",
            access -> OF_THE_APPLICATION.test(access.getTargetOwner())
                    && access.getTarget().resolveMember().map(field -> field.getModifiers().contains(JavaModifier.STATIC)
                    && !field.getModifiers().contains(JavaModifier.ENUM)).orElse(false));

    private static final Set<String> ENUM_LOOKUPS = Set.of("values", "valueOf");

    private static final DescribedPredicate<JavaMethodCall> A_STATIC_VALUE_GETTER_OF_THE_APPLICATION = DescribedPredicate.describe(
            "a static method of a class of an application package that takes nothing and returns a value other than its own type, an enum's values() apart",
            call -> OF_THE_APPLICATION.test(call.getTargetOwner())
                    && call.getTarget().getRawParameterTypes().isEmpty()
                    && !call.getTarget().getRawReturnType().getName().equals("void")
                    && !call.getTarget().getRawReturnType().equals(call.getTargetOwner())
                    && !(call.getTargetOwner().isEnum() && ENUM_LOOKUPS.contains(call.getName()))
                    && call.getTarget().resolveMember().map(method -> method.getModifiers().contains(JavaModifier.STATIC)).orElse(false));

    private static final String PORT_VALUE = "a bound the value record of a port checks in its own constructor; the adapter that implements the "
            + "port produces or accepts values within it, so the bound is the port's contract, not a rule the adapter keeps";

    private static final String EVENT_COLUMN = "a column sized to the bound the value's own constructor checks, so the table holds every value the "
            + "constructor admits";

    private static final Map<String, String> REVIEWED_CONSTANT_READS = Map.ofEntries(
            Map.entry("cz.novanadeje.app.content.infrastructure.media.PrintPortraits reads cz.novanadeje.app.shared.application.people.PrintPortrait.SIDE",
                    PORT_VALUE + " (FoundationPeople.printPortraitOf: the content adapter draws the square to the side PrintPortrait accepts)"),
            Map.entry("cz.novanadeje.app.content.infrastructure.media.PrintSignatures reads cz.novanadeje.app.shared.application.people.PrintSignature.MAX_HEIGHT",
                    PORT_VALUE + " (FoundationPeople.printSignatureOf: the content adapter scales the signature into the box PrintSignature accepts)"),
            Map.entry("cz.novanadeje.app.content.infrastructure.media.PrintSignatures reads cz.novanadeje.app.shared.application.people.PrintSignature.MAX_WIDTH",
                    PORT_VALUE + " (FoundationPeople.printSignatureOf: the content adapter scales the signature into the box PrintSignature accepts)"),
            Map.entry("cz.novanadeje.app.donations.infrastructure.banklogo.BankLogoPictures reads "
                            + "cz.novanadeje.app.donations.application.banklogo.FetchedBankLogo.MAX_BYTES",
                    PORT_VALUE + " (BankLogoSource: the converted WebP is checked against the size FetchedBankLogo accepts, to fail as the adapter's "
                            + "own undecodable picture)"),
            Map.entry("cz.novanadeje.app.operations.infrastructure.backup.BackupStoreFinishedRestores reads "
                            + "cz.novanadeje.app.shared.application.restore.FinishedRestore.MAX_ID_LENGTH",
                    PORT_VALUE + " (FinishedRestores: a status file naming a longer request id confirms no restore instead of failing the start)"),
            Map.entry("cz.novanadeje.app.donations.infrastructure.persistence.ReceiptSigningKeyAdoptionJpaEntity reads "
                            + "cz.novanadeje.app.shared.application.restore.FinishedRestore.MAX_ID_LENGTH",
                    EVENT_COLUMN + " (receipt_signing_key_adoption.restore_id holds a FinishedRestore id)"),
            Map.entry("cz.novanadeje.app.donations.infrastructure.persistence.JpaReceiptSigningKeyRepository reads "
                            + "cz.novanadeje.app.shared.application.restore.FinishedRestore.MAX_ID_LENGTH",
                    EVENT_COLUMN + " (receipt_signing_key_adoption.restore_id: the adapter refuses a longer id as a broken invariant before the "
                            + "write, since FinishedRestore admits none)"),
            Map.entry("cz.novanadeje.app.shared.infrastructure.audit.AdminActionJpaEntity reads "
                            + "cz.novanadeje.app.shared.application.event.AdminActionPerformed.MAX_ACTION_LENGTH",
                    EVENT_COLUMN + " (admin_action.action holds the action of the shared event AdminActionPerformed)"),
            Map.entry("cz.novanadeje.app.shared.infrastructure.audit.AdminActionJpaEntity reads "
                            + "cz.novanadeje.app.shared.application.event.AdminActionPerformed.MAX_DETAILS_LENGTH",
                    EVENT_COLUMN + " (admin_action.details holds the details of the shared event AdminActionPerformed)"),
            Map.entry("cz.novanadeje.app.shared.infrastructure.json.CanonicalRowVersions reads cz.novanadeje.app.shared.application.version.RowVersions.VERSION_FIELD",
                    "the contract of the RowVersions port itself: the name of the field its implementation leaves out of the form it hashes"),
            Map.entry("cz.novanadeje.app.donors.interfaces.rest.AdminActionSummaries reads cz.novanadeje.app.donors.application.AdminActionFacts.DONOR",
                    "the key of a fact AdminActionFacts reads from the audit details, which the summaries fill with the donor's name; one spelling "
                            + "of one key on both sides, not a value of a rule"));

    private static JavaClasses planted;

    private static Set<String> plantedReads;

    private static Set<String> mainReads;

    @ArchTest
    static final ArchRule adapters_read_no_static_value_of_the_application = noClasses()
            .that().resideInAnyPackage("..infrastructure..", "..interfaces..")
            .should().accessFieldWhere(A_STATIC_VALUE_OF_THE_APPLICATION)
            .orShould().callMethodWhere(A_STATIC_VALUE_GETTER_OF_THE_APPLICATION)
            .because("backend.md, Application: a value of a business rule (a lifetime, a limit, a set of kinds) belongs to the domain, and an adapter gets it "
                    + "from the event, command or result of the use case; read from an application class's static field, the rule spreads over the "
                    + "scheduler and the mail adapter (#621 R4-A6). javac inlines a compile-time constant (a String or a primitive), which this rule "
                    + "cannot see, so the source scan below reads those (#961)");

    @BeforeAll
    static void plantAdaptersReadingApplicationValues(@TempDir Path folder) throws IOException {
        planted = PlantedClasses.compiled(folder, Stream.of(plantedClasses(), allowedClasses(), supportingClasses()).flatMap(classes -> classes)
                .collect(Collectors.toMap(PlantedClass::sourceName, PlantedClass::source)));
    }

    @ParameterizedTest(name = "{0} reports {1}")
    @MethodSource("plantedClasses")
    @DisplayName("Given a planted adapter or REST class that reads, writes or gets a static value of an application class, when the rule checks it, then exactly that class is reported")
    void should_report_the_planted_adapter_when_checked_given_a_read_of_an_application_value(ArchRule rule, String className) {
        JavaClasses plantedClass = planted.that(DescribedPredicate.describe("the planted class", type -> type.getName().equals(className)));

        assertThat(rule.evaluate(plantedClass).getFailureReport().getDetails())
                .isNotEmpty().allSatisfy(detail -> assertThat(detail).contains(className));
    }

    @ParameterizedTest(name = "{0} leaves {1} alone")
    @MethodSource("allowedClasses")
    @DisplayName("Given a planted class that reads an enum constant, an enum lookup, an event's value, an instance field or a factory of its own value of the application, a domain constant, a package merely named like the application, or an application value from the application, when the rule checks every planted class, then that class is not reported")
    void should_report_nothing_when_checked_given_an_allowed_read(ArchRule rule, String className) {
        assertThat(rule.evaluate(planted).getFailureReport().getDetails())
                .isNotEmpty().noneSatisfy(detail -> assertThat(detail).contains(className + "."));
    }

    @Test
    @DisplayName("Given the main sources, when the adapters and REST classes are read for compile-time constants of application classes, then each read is a reviewed one")
    void should_read_only_reviewed_constants_when_read_given_the_main_sources() {
        assertThat(mainSourceReads()).as("compile-time constants of application classes that adapters and REST classes read, which javac inlines; "
                        + "move the value to the domain, the event, command or result, or review it in REVIEWED_CONSTANT_READS with its reason")
                .isSubsetOf(REVIEWED_CONSTANT_READS.keySet());
    }

    @Test
    @DisplayName("Given the reviewed constant reads, when the main sources are read, then every one still happens")
    void should_still_happen_when_read_given_every_reviewed_constant_read() {
        assertThat(REVIEWED_CONSTANT_READS.keySet()).as("reviewed reads the main sources no longer make; remove them from REVIEWED_CONSTANT_READS")
                .isSubsetOf(mainSourceReads());
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("plantedConstantReads")
    @DisplayName("Given a planted adapter or REST class that reads a compile-time constant of an application class, when the sources are read, then exactly that read is reported")
    void should_report_the_planted_read_when_read_given_an_inlined_constant_of_the_application(String label, String read) {
        assertThat(plantedReads).contains(read);
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("allowedConstantReads")
    @DisplayName("Given a planted class that reads a domain constant, its own constant, a static value that is no compile-time constant, an enum constant, a package merely named like the application or an adapter, an application constant from the application or a package below it, a constant of an application package below an adapter, or only imports one, when the sources are read, then nothing of it is reported")
    void should_report_nothing_when_read_given_an_allowed_constant_read(String label, String reader) {
        assertThat(plantedReads).noneSatisfy(read -> assertThat(read).startsWith(reader + " "));
    }

    @Test
    @DisplayName("Given the planted sources, when they are read, then exactly the planted reads are reported")
    void should_report_exactly_the_planted_reads_when_read_given_the_planted_sources() {
        assertThat(plantedReads).containsExactlyInAnyOrderElementsOf(plantedConstantReads().map(arguments -> (String) arguments.get()[1]).toList());
    }

    private static Set<String> mainSourceReads() {
        if (mainReads == null) {
            mainReads = InlinedApplicationConstants.readsIn(AttributedSources.ofMainSources());
        }
        return mainReads;
    }

    static Stream<Arguments> plantedConstantReads() {
        return Stream.of(
                Arguments.of("qualified read in a scheduler", "cz.novanadeje.app.donors.infrastructure.reminder.PlantedConstantScheduler reads "
                        + "cz.novanadeje.app.donors.application.PlantedLifetimes.LIFETIME_DAYS"),
                Arguments.of("static import in a mail adapter", "cz.novanadeje.app.donors.infrastructure.mail.PlantedStaticImportSender reads "
                        + "cz.novanadeje.app.donors.application.PlantedLifetimes.REMINDER_DAYS"),
                Arguments.of("annotation attribute of a column", "cz.novanadeje.app.donors.infrastructure.persistence.PlantedSizedEntity reads "
                        + "cz.novanadeje.app.donors.application.PlantedLimits.MAX_NAME_LENGTH"),
                Arguments.of("string constant in a REST parameter default", "cz.novanadeje.app.donors.interfaces.rest.PlantedPagedController reads "
                        + "cz.novanadeje.app.donors.application.PlantedLimits.DEFAULT_PAGE"),
                Arguments.of("switch label in a REST class", "cz.novanadeje.app.donors.interfaces.rest.PlantedKeyedRenderer reads "
                        + "cz.novanadeje.app.donors.application.PlantedLimits.KEY"),
                Arguments.of("nested and anonymous classes of an adapter", "cz.novanadeje.app.donors.infrastructure.mail.PlantedNestedSender reads "
                        + "cz.novanadeje.app.donors.application.PlantedLifetimes.LIFETIME_DAYS"),
                Arguments.of("constant of an interface of the application", "cz.novanadeje.app.donors.infrastructure.json.PlantedPortImplementation reads "
                        + "cz.novanadeje.app.donors.application.PlantedPort.FIELD"),
                Arguments.of("constant of the shared application", "cz.novanadeje.app.shared.infrastructure.audit.PlantedSharedReader reads "
                        + "cz.novanadeje.app.shared.application.event.PlantedSharedEvent.MAX_LENGTH"),
                Arguments.of("constant passed on, read where it is passed on", "cz.novanadeje.app.donors.infrastructure.persistence.PlantedPassingEntity reads "
                        + "cz.novanadeje.app.donors.application.PlantedLimits.PASSED_ON"),
                Arguments.of("constant passed on through an adapter's constant", "cz.novanadeje.app.donors.infrastructure.persistence.PlantedPassedOnRepository reads "
                        + "cz.novanadeje.app.donors.application.PlantedLimits.PASSED_ON"),
                Arguments.of("constant passed on twice through constants outside every layer", "cz.novanadeje.app.donors.interfaces.rest.PlantedPassedOnController reads "
                        + "cz.novanadeje.app.donors.application.PlantedLimits.PASSED_OUTSIDE"),
                Arguments.of("annotation of a package", "cz.novanadeje.app.donors.infrastructure.packaged.package-info reads "
                        + "cz.novanadeje.app.donors.application.PlantedLimits.PACKAGE_LIMIT"),
                Arguments.of("annotation of a record component", "cz.novanadeje.app.donors.interfaces.rest.PlantedSizedRequest reads "
                        + "cz.novanadeje.app.donors.application.PlantedLimits.COMPONENT_LIMIT"),
                Arguments.of("constant instance field", "cz.novanadeje.app.donors.infrastructure.mail.PlantedInstanceLimitSender reads "
                        + "cz.novanadeje.app.donors.application.PlantedInstanceLimits.MAX"));
    }

    static Stream<Arguments> allowedConstantReads() {
        return Stream.of(
                Arguments.of("domain constant", "cz.novanadeje.app.donors.infrastructure.reminder.PlantedDomainConstantScheduler"),
                Arguments.of("the adapter's own constant", "cz.novanadeje.app.donors.infrastructure.mail.PlantedOwnConstantSender"),
                Arguments.of("static final value that is no compile-time constant", "cz.novanadeje.app.donors.infrastructure.mail.PlantedComputedSender"),
                Arguments.of("enum constant", "cz.novanadeje.app.donors.interfaces.rest.PlantedEnumController"),
                Arguments.of("package merely named like the application", "cz.novanadeje.app.donors.infrastructure.mail.PlantedLookalikeConstantSender"),
                Arguments.of("application reading the application", "cz.novanadeje.app.donors.application.PlantedReminderPolicy"),
                Arguments.of("unused static import", "cz.novanadeje.app.donors.infrastructure.mail.PlantedUnusedImportSender"),
                Arguments.of("package merely named like an adapter", "cz.novanadeje.app.donors.infrastructures.mail.PlantedLookalikeLayerSender"),
                Arguments.of("adapter package below the application", "cz.novanadeje.app.donors.application.infrastructure.PlantedNestedLayerReader"),
                Arguments.of("constant of an application package below an adapter", "cz.novanadeje.app.donors.infrastructure.mail.PlantedNestedSettingsSender"));
    }

    private static final List<String> PLANTED_SOURCES = List.of(
            """
            package cz.novanadeje.app.donors.application;
            public final class PlantedLifetimes {
                public static final long LIFETIME_DAYS = 30;
                public static final int REMINDER_DAYS = 7;
                public static final java.time.Duration COMPUTED = java.time.Duration.ofDays(LIFETIME_DAYS);
                private PlantedLifetimes() { }
            }
            """,
            """
            package cz.novanadeje.app.donors.application;
            public record PlantedLimits(String name) {
                public static final int MAX_NAME_LENGTH = 120;
                public static final int DEFAULT_PAGE = 20;
                public static final String KEY = "donor";
                public static final int PASSED_ON = 40;
                public static final int PASSED_OUTSIDE = 41;
                public static final int PACKAGE_LIMIT = 42;
                public static final int COMPONENT_LIMIT = 43;
            }
            """,
            """
            package cz.novanadeje.app.donors.application;
            public final class PlantedInstanceLimits {
                public final int MAX = 44;
            }
            """,
            """
            package cz.novanadeje.app.donors.application;
            public interface PlantedPort {
                String FIELD = "version";
            }
            """,
            """
            package cz.novanadeje.app.donors.application;
            public enum PlantedKind { FIRST }
            """,
            """
            package cz.novanadeje.app.donors.application;
            public final class PlantedReminderPolicy {
                private PlantedReminderPolicy() { }
                public static boolean fits(long days) { return days < PlantedLifetimes.LIFETIME_DAYS; }
            }
            """,
            """
            package cz.novanadeje.app.donors.applications;
            public final class PlantedRetention {
                public static final long DAYS = 30;
                private PlantedRetention() { }
            }
            """,
            """
            package cz.novanadeje.app.donors.domain;
            public final class PlantedLifetime {
                public static final long DAYS = 30;
                private PlantedLifetime() { }
            }
            """,
            """
            package cz.novanadeje.app.shared.application.event;
            public record PlantedSharedEvent(String action) {
                public static final int MAX_LENGTH = 64;
            }
            """,
            """
            package cz.novanadeje.app.donors.infrastructure.reminder;
            class PlantedConstantScheduler {
                long days() { return cz.novanadeje.app.donors.application.PlantedLifetimes.LIFETIME_DAYS; }
            }
            """,
            """
            package cz.novanadeje.app.donors.infrastructure.mail;
            import static cz.novanadeje.app.donors.application.PlantedLifetimes.REMINDER_DAYS;
            class PlantedStaticImportSender {
                int days() { return REMINDER_DAYS; }
            }
            """,
            """
            package cz.novanadeje.app.donors.infrastructure.persistence;
            import cz.novanadeje.app.donors.application.PlantedLimits;
            class PlantedSizedEntity {
                @PlantedColumn(length = PlantedLimits.MAX_NAME_LENGTH)
                String name;
            }
            """,
            """
            package cz.novanadeje.app.donors.infrastructure.persistence;
            @interface PlantedColumn { int length(); }
            """,
            """
            package cz.novanadeje.app.donors.interfaces.rest;
            import cz.novanadeje.app.donors.application.PlantedLimits;
            class PlantedPagedController {
                @PlantedParameter(defaultValue = "" + PlantedLimits.DEFAULT_PAGE)
                void list(int page) { }
            }
            """,
            """
            package cz.novanadeje.app.donors.interfaces.rest;
            @interface PlantedParameter { String defaultValue(); }
            """,
            """
            package cz.novanadeje.app.donors.interfaces.rest;
            import cz.novanadeje.app.donors.application.PlantedLimits;
            class PlantedKeyedRenderer {
                String render(String name) {
                    return switch (name) {
                        case PlantedLimits.KEY -> "someone";
                        default -> name;
                    };
                }
            }
            """,
            """
            package cz.novanadeje.app.donors.infrastructure.mail;
            import cz.novanadeje.app.donors.application.PlantedLifetimes;
            class PlantedNestedSender {
                static final class Body {
                    Runnable later() {
                        return new Runnable() {
                            public void run() { System.out.println(PlantedLifetimes.LIFETIME_DAYS); }
                        };
                    }
                }
            }
            """,
            """
            package cz.novanadeje.app.donors.infrastructure.json;
            class PlantedPortImplementation implements cz.novanadeje.app.donors.application.PlantedPort {
                String left() { return FIELD; }
            }
            """,
            """
            package cz.novanadeje.app.shared.infrastructure.audit;
            class PlantedSharedReader {
                int length() { return cz.novanadeje.app.shared.application.event.PlantedSharedEvent.MAX_LENGTH; }
            }
            """,
            """
            package cz.novanadeje.app.donors.infrastructure.persistence;
            class PlantedPassingEntity {
                static final int RESTORE_ID_LENGTH = cz.novanadeje.app.donors.application.PlantedLimits.PASSED_ON;
            }
            """,
            """
            package cz.novanadeje.app.donors.infrastructure.persistence;
            class PlantedPassedOnRepository {
                boolean fits(String id) { return id.length() <= PlantedPassingEntity.RESTORE_ID_LENGTH; }
            }
            """,
            """
            package cz.novanadeje.app.config;
            public final class PlantedPassedOnLimits {
                public static final int OUTSIDE = cz.novanadeje.app.donors.application.PlantedLimits.PASSED_OUTSIDE;
                public static final int TWICE = OUTSIDE * 2;
                private PlantedPassedOnLimits() { }
            }
            """,
            """
            package cz.novanadeje.app.donors.interfaces.rest;
            class PlantedPassedOnController {
                int twice() { return cz.novanadeje.app.config.PlantedPassedOnLimits.TWICE; }
            }
            """,
            """
            @PlantedPackageLimit(cz.novanadeje.app.donors.application.PlantedLimits.PACKAGE_LIMIT)
            package cz.novanadeje.app.donors.infrastructure.packaged;
            """,
            """
            package cz.novanadeje.app.donors.infrastructure.packaged;
            @java.lang.annotation.Target(java.lang.annotation.ElementType.PACKAGE)
            @interface PlantedPackageLimit { int value(); }
            """,
            """
            package cz.novanadeje.app.donors.interfaces.rest;
            import cz.novanadeje.app.donors.application.PlantedLimits;
            record PlantedSizedRequest(@PlantedSize(max = PlantedLimits.COMPONENT_LIMIT) String name) { }
            """,
            """
            package cz.novanadeje.app.donors.interfaces.rest;
            @interface PlantedSize { int max(); }
            """,
            """
            package cz.novanadeje.app.donors.infrastructure.mail;
            class PlantedInstanceLimitSender {
                int max(cz.novanadeje.app.donors.application.PlantedInstanceLimits limits) { return limits.MAX; }
            }
            """,
            """
            package cz.novanadeje.app.donors.infrastructure.mail;
            import static cz.novanadeje.app.donors.application.PlantedLifetimes.REMINDER_DAYS;
            class PlantedUnusedImportSender {
                int days() { return 7; }
            }
            """,
            """
            package cz.novanadeje.app.donors.infrastructures.mail;
            class PlantedLookalikeLayerSender {
                long days() { return cz.novanadeje.app.donors.application.PlantedLifetimes.LIFETIME_DAYS; }
            }
            """,
            """
            package cz.novanadeje.app.donors.application.infrastructure;
            class PlantedNestedLayerReader {
                long days() { return cz.novanadeje.app.donors.application.PlantedLifetimes.LIFETIME_DAYS; }
            }
            """,
            """
            package cz.novanadeje.app.donors.infrastructure.application;
            public final class PlantedAdapterSettings {
                public static final int DAYS = 3;
                private PlantedAdapterSettings() { }
            }
            """,
            """
            package cz.novanadeje.app.donors.infrastructure.mail;
            class PlantedNestedSettingsSender {
                int days() { return cz.novanadeje.app.donors.infrastructure.application.PlantedAdapterSettings.DAYS; }
            }
            """,
            """
            package cz.novanadeje.app.donors.infrastructure.reminder;
            class PlantedDomainConstantScheduler {
                long days() { return cz.novanadeje.app.donors.domain.PlantedLifetime.DAYS; }
            }
            """,
            """
            package cz.novanadeje.app.donors.infrastructure.mail;
            class PlantedOwnConstantSender {
                static final int WINDOW_DAYS = 7;
                int days() { return WINDOW_DAYS; }
            }
            """,
            """
            package cz.novanadeje.app.donors.infrastructure.mail;
            class PlantedComputedSender {
                long days() { return cz.novanadeje.app.donors.application.PlantedLifetimes.COMPUTED.toDays(); }
            }
            """,
            """
            package cz.novanadeje.app.donors.interfaces.rest;
            class PlantedEnumController {
                Object kind() { return cz.novanadeje.app.donors.application.PlantedKind.FIRST; }
            }
            """,
            """
            package cz.novanadeje.app.donors.infrastructure.mail;
            class PlantedLookalikeConstantSender {
                long days() { return cz.novanadeje.app.donors.applications.PlantedRetention.DAYS; }
            }
            """);

    @BeforeAll
    static void readPlantedConstantReads(@TempDir Path folder) {
        plantedReads = InlinedApplicationConstants.readsIn(PlantedSources.written(folder, PLANTED_SOURCES));
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
                        "cz.novanadeje.app.donations.infrastructure.mail.PlantedReportSender$Body"),
                planted("REST adapter", "donors.interfaces.rest.PlantedSummaries",
                        "class PlantedSummaries { boolean hidden(String placeholder) { "
                                + "return cz.novanadeje.app.donors.application.PlantedFacts.HIDDEN.contains(placeholder); } }"),
                planted("write", "donors.infrastructure.reminder.PlantedRetentionOverride",
                        "class PlantedRetentionOverride { void shorten() { "
                                + "cz.novanadeje.app.donors.application.PlantedMutableSettings.window = java.time.Duration.ZERO; } }"),
                planted("static set of an enum", "operations.infrastructure.push.PlantedKindFilter",
                        "class PlantedKindFilter { int count() { return cz.novanadeje.app.operations.application.PlantedAlertKind.LOUD.size(); } }"),
                planted("static getter", "donors.infrastructure.mail.PlantedLifetimeSender",
                        "class PlantedLifetimeSender { long days() { "
                                + "return cz.novanadeje.app.donors.application.PlantedLifetimes.lifetime().toDays(); } }"));
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
                planted("instance field of an application value", "donors.infrastructure.mail.PlantedSlotSender",
                        "class PlantedSlotSender { java.time.Duration slot(cz.novanadeje.app.donors.application.PlantedSlot slot) { return slot.length; } }"),
                planted("enum lookups", "operations.infrastructure.push.PlantedKindNames",
                        "class PlantedKindNames { int count() { return cz.novanadeje.app.operations.application.PlantedAlertKind.values().length "
                                + "+ cz.novanadeje.app.operations.application.PlantedAlertKind.valueOf(\"QUIET\").ordinal(); } }"),
                planted("factory of the application's own value", "donors.interfaces.rest.PlantedVersionResolver",
                        "class PlantedVersionResolver { Object none() { return cz.novanadeje.app.donors.application.PlantedVersion.none(); } }"),
                planted("package merely named like the application", "donors.infrastructure.mail.PlantedLookalikeSender",
                        "class PlantedLookalikeSender { long days() { return cz.novanadeje.app.donors.applications.PlantedRetention.DAYS.toDays(); } }"),
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
                planted("supporting", "donors.application.PlantedFacts",
                        "public final class PlantedFacts { public static final java.util.Set<String> HIDDEN = java.util.Set.of(\"account\"); "
                                + "private PlantedFacts() { } }"),
                planted("supporting", "donors.application.PlantedMutableSettings",
                        "public final class PlantedMutableSettings { public static java.time.Duration window = java.time.Duration.ofDays(1); "
                                + "private PlantedMutableSettings() { } }"),
                planted("supporting", "operations.application.PlantedAlertKind",
                        "public enum PlantedAlertKind { LOUD_ONE, QUIET; public static final java.util.Set<PlantedAlertKind> LOUD = java.util.Set.of(LOUD_ONE); }"),
                planted("supporting", "donors.application.PlantedLifetimes",
                        "public final class PlantedLifetimes { public static java.time.Duration lifetime() { return java.time.Duration.ofDays(30); } "
                                + "private PlantedLifetimes() { } }"),
                planted("supporting", "donors.application.PlantedSlot",
                        "public final class PlantedSlot { public final java.time.Duration length = java.time.Duration.ofMinutes(Math.abs(System.identityHashCode(this) % 5) + 1); }"),
                planted("supporting", "donors.applications.PlantedRetention",
                        "public final class PlantedRetention { public static final java.time.Duration DAYS = java.time.Duration.ofDays(30); "
                                + "private PlantedRetention() { } }"),
                planted("supporting", "donors.application.PlantedVersion",
                        "public record PlantedVersion(String value) { public static PlantedVersion none() { return new PlantedVersion(\"\"); } }"),
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
