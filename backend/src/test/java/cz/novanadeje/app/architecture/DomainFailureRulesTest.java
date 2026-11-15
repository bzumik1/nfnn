package cz.novanadeje.app.architecture;

import com.tngtech.archunit.base.DescribedPredicate;
import com.tngtech.archunit.core.domain.AccessTarget;
import com.tngtech.archunit.core.domain.JavaAccess;
import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.domain.JavaCodeUnit;
import com.tngtech.archunit.core.domain.JavaField;
import com.tngtech.archunit.core.domain.JavaGenericArrayType;
import com.tngtech.archunit.core.domain.JavaModifier;
import com.tngtech.archunit.core.domain.JavaParameterizedType;
import com.tngtech.archunit.core.domain.JavaType;
import com.tngtech.archunit.core.domain.JavaTypeVariable;
import com.tngtech.archunit.core.domain.JavaWildcardType;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchCondition;
import com.tngtech.archunit.lang.ArchRule;
import com.tngtech.archunit.lang.ConditionEvents;
import com.tngtech.archunit.lang.SimpleConditionEvent;
import cz.novanadeje.app.AppApplication;
import cz.novanadeje.app.shared.application.version.StaleWriteRefusal;
import cz.novanadeje.app.shared.application.version.StoredRecord;
import cz.novanadeje.app.shared.domain.error.DomainException;
import cz.novanadeje.app.shared.domain.error.StaleWrite;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Named;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Repository;

import java.io.IOException;
import java.math.BigDecimal;
import java.math.BigInteger;
import java.nio.file.Path;
import java.time.DayOfWeek;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.Month;
import java.time.MonthDay;
import java.time.OffsetDateTime;
import java.time.Period;
import java.time.Year;
import java.time.YearMonth;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.util.Collection;
import java.util.Currency;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.SortedMap;
import java.util.SortedSet;
import java.util.TreeSet;
import java.util.UUID;
import java.util.stream.Collectors;
import java.util.stream.IntStream;
import java.util.stream.Stream;

import static com.tngtech.archunit.core.domain.JavaClass.Predicates.resideInAnyPackage;
import static com.tngtech.archunit.core.domain.properties.CanBeAnnotated.Predicates.annotatedWith;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.classes;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static org.assertj.core.api.Assertions.assertThat;

@AnalyzeClasses(
        packagesOf = AppApplication.class,
        importOptions = ImportOption.DoNotIncludeTests.class
)
class DomainFailureRulesTest {

    private static final String FAILURES = "backend.md, Domain: failures are named classes with a code, declared in a domain package, of the sealed DomainException's abstract kinds";

    private static final DescribedPredicate<JavaClass> DOMAIN = JavaClass.Predicates.resideInAPackage("..domain..");

    private static final DescribedPredicate<JavaClass> APPLICATION = JavaClass.Predicates.resideInAPackage("..application..");

    private static final Set<String> PLAIN_JAVA_VALUES = Stream.of(String.class, Boolean.class, Character.class, Byte.class, Short.class,
            Integer.class, Long.class, Float.class, Double.class, BigDecimal.class, BigInteger.class, UUID.class, Optional.class, Locale.class,
            Currency.class, Collection.class, List.class, Set.class, SortedSet.class, Map.class, SortedMap.class, Instant.class, LocalDate.class,
            LocalDateTime.class, LocalTime.class, OffsetDateTime.class, ZonedDateTime.class, Year.class, YearMonth.class, MonthDay.class,
            Duration.class, Period.class, ZoneId.class, ZoneOffset.class, DayOfWeek.class, Month.class).map(Class::getName).collect(Collectors.toUnmodifiableSet());

    private static final String VERSIONED_STALE_WRITE = StaleWrite.class.getName() + ".<init>(java.lang.String, java.lang.String, java.lang.String)";

    private static final Set<String> OPEN_TYPES = Set.of(Object.class.getName(), Record.class.getName(), java.io.Serializable.class.getName());

    private static JavaClasses planted;

    @ArchTest
    static final ArchRule domain_failures_live_in_the_domain = classes()
            .that().areAssignableTo(DomainException.class)
            .should().resideInAPackage("..domain..")
            .because(FAILURES);

    @ArchTest
    static final ArchRule domain_failures_are_named_classes = classes()
            .that().areAssignableTo(DomainException.class)
            .should().notBeAnonymousClasses()
            .andShould().notBeLocalClasses()
            .because(FAILURES + ": a failure is a named class of its own, so its code and texts are found by its name, never thrown as a kind made up on the spot");

    @ArchTest
    static final ArchRule no_class_extends_the_argument_or_state_exceptions = noClasses()
            .should().beAssignableTo(IllegalArgumentException.class)
            .orShould().beAssignableTo(IllegalStateException.class)
            .because("the API answers every IllegalArgumentException with 400 as the client's error, and adapters catch IllegalStateException "
                    + "generically around library calls; a failure of its own is a DomainException when the client caused it, and when the server did a named RuntimeException subclass "
                    + "or, for a broken invariant, a plain IllegalStateException");

    private static final DescribedPredicate<JavaClass> PERSISTENCE_ADAPTER = resideInAnyPackage(AdapterLibraryRulesTest.persistenceAdapters())
            .and(DescribedPredicate.not(annotatedWith(ConfigurationProperties.class)))
            .or(annotatedWith(Repository.class))
            .as("a class of the persistence adapter packages AdapterLibraryRulesTest confines JPA and Spring Data to, other than a configuration record, "
                    + "or a @Repository wherever it lives");

    private static final DescribedPredicate<AccessTarget> AN_ARGUMENT_ASSERTION = DescribedPredicate.describe(
            "a method of Spring's Assert other than state, which throws IllegalArgumentException",
            target -> target.getOwner().isAssignableTo("org.springframework.util.Assert") && !target.getName().equals("state"));

    @ArchTest
    static final ArchRule persistence_adapters_never_answer_a_broken_invariant_as_the_clients_error = noClasses()
            .that(PERSISTENCE_ADAPTER)
            .should().accessTargetWhere(JavaAccess.Predicates.target(constructorOf(IllegalArgumentException.class)))
            .orShould().accessTargetWhere(JavaAccess.Predicates.target(AN_ARGUMENT_ASSERTION))
            .because("a client's input is refused before it reaches persistence, so a check there guards the server's own data or code, "
                    + "and an IllegalArgumentException would answer that server fault with 400 and log it as the client's error; "
                    + "throw IllegalStateException, which answers 500. The rule sees what such a class constructs, a lambda's body "
                    + "included, and Spring's Assert, not an IllegalArgumentException another call throws (valueOf, fromString, a value object's check; #939)");

    private static DescribedPredicate<AccessTarget> constructorOf(Class<? extends RuntimeException> failure) {
        return DescribedPredicate.describe("a constructor of " + failure.getSimpleName() + " or of a subclass",
                target -> target.getName().equals("<init>") && target.getOwner().isAssignableTo(failure));
    }

    @ArchTest
    static final ArchRule domain_failures_hold_only_typed_values = classes()
            .that().areAssignableTo(DomainException.class)
            .should(holdNoValueOfAnOpenType())
            .because(FAILURES + ": a failure carries domain values and plain data (a version, an id), never a value typed Object, Record or Serializable, "
                    + "through which an application view slips past the layering rules into the problem body; the REST layer builds the body the contract promises");

    @ArchTest
    static final ArchRule only_application_records_travel_as_the_stored_record = classes()
            .that().implement(StoredRecord.class)
            .should().beRecords().andShould().resideInAPackage("..application..").andShould(holdOnlyPlainDataEnumsAndApplicationRecords())
            .because("a stale write's 409 body carries the record as stored now; only an application view says what the contract promises, "
                    + "while an aggregate or an entity, itself or held by the view, would put every field it holds into the answer");

    @ArchTest
    static final ArchRule a_stale_write_naming_a_version_travels_with_the_stored_record = classes()
            .should(buildAVersionedStaleWriteOnlyWithItsRefusal())
            .because("the contract's stale-write answer carries version and current, so a stale write naming the version stored now is built only "
                    + "where the StaleWriteRefusal carrying the record is; only ChangedMeanwhile.andRemovedSince(), which names no version, stands alone");

    @Test
    @DisplayName("Given a planted failure that holds only typed values and generic values of typed arguments, one through a domain implementation, overrides equals and is comparable to itself through a bridge method, when the rule checks it, then nothing is reported")
    void should_report_nothing_when_checked_given_a_failure_of_typed_values() {
        JavaClasses plantedClass = planted.that(DescribedPredicate.describe("the planted class",
                type -> type.getName().equals("cz.novanadeje.app.donations.domain.PlantedTypedFailure")));

        assertThat(domain_failures_hold_only_typed_values.evaluate(plantedClass).getFailureReport().isEmpty()).isTrue();
    }

    @Test
    @DisplayName("Given a planted caller of the stale write of a bank logo removed before its lock, which names no version, when the pairing rule checks it, then nothing is reported")
    void should_report_nothing_when_checked_given_a_stale_write_naming_no_version() {
        JavaClasses caller = planted.that(DescribedPredicate.describe("the planted caller",
                type -> type.getName().equals("cz.novanadeje.app.donations.application.PlantedRemovedCaller")));

        assertThat(a_stale_write_naming_a_version_travels_with_the_stored_record.evaluate(caller).getFailureReport().isEmpty()).isTrue();
    }

    @Test
    @DisplayName("Given a planted stored record holding a generic application page of its rows, instants, an optional id and an amount, when the stored-record rule checks it, then nothing is reported")
    void should_report_nothing_when_checked_given_a_stored_record_of_plain_values_and_a_generic_page() {
        JavaClasses stored = planted.that(DescribedPredicate.describe("the planted stored record",
                type -> type.getName().equals("cz.novanadeje.app.donations.application.PlantedStoredRowsPage")));

        assertThat(only_application_records_travel_as_the_stored_record.evaluate(stored).getFailureReport().isEmpty()).isTrue();
    }

    @BeforeAll
    static void plantMisplacedFailures(@TempDir Path folder) throws IOException {
        planted = PlantedClasses.compiled(folder, Stream.of(plantedClasses(), Stream.of(typedFailure()), heldTypes()).flatMap(classes -> classes)
                .collect(Collectors.toMap(PlantedClass::sourceName, PlantedClass::source)), List.of(StaleWrite.class,
                cz.novanadeje.app.content.domain.ChangedMeanwhile.class, cz.novanadeje.app.donations.domain.ChangedMeanwhile.class));
    }

    private static Stream<PlantedClass> heldTypes() {
        return Stream.of(
                held("content.domain.PlantedCurrentRow", "public interface PlantedCurrentRow { }"),
                held("content.application.PlantedStoredRow", "public record PlantedStoredRow(String title) implements cz.novanadeje.app.content.domain.PlantedCurrentRow { }"),
                held("content.domain.PlantedBaseValue", "public abstract class PlantedBaseValue { protected final Object row; protected PlantedBaseValue(Object row) { this.row = row; } }"),
                held("content.domain.PlantedHeldValue", "public final class PlantedHeldValue extends PlantedBaseValue { public PlantedHeldValue(String row) { super(row); } }"),
                held("donations.domain.PlantedPair", "public record PlantedPair<A, B>(A first, B second) { }"),
                held("donations.domain.PlantedAggregateRoot", "public class PlantedAggregateRoot { private String payer; }"),
                held("donations.domain.PlantedRecordAggregate", "public record PlantedRecordAggregate(String payer) { }"),
                held("donations.application.PlantedInnerRow", "public record PlantedInnerRow(cz.novanadeje.app.donations.domain.PlantedRecordAggregate payment) { }"),
                held("content.domain.PlantedArtwork", "public interface PlantedArtwork { }"),
                held("content.domain.PlantedSvgArtwork", "public record PlantedSvgArtwork(Object row) implements PlantedArtwork { }"),
                held("donations.domain.PlantedOutcome", "public interface PlantedOutcome<T> { }"),
                held("donations.domain.PlantedOk", "public record PlantedOk<T>(T value) implements PlantedOutcome<T> { }"),
                held("donations.domain.PlantedFixedStaleWrite", "public class PlantedFixedStaleWrite extends cz.novanadeje.app.shared.domain.error.StaleWrite { "
                        + "private PlantedFixedStaleWrite() { super(\"donations/planted\", \"planted\", \"fixed\"); } "
                        + "public static PlantedFixedStaleWrite fixed() { return new PlantedFixedStaleWrite(); } }"),
                held("donations.application.PlantedRemovedCaller", "public class PlantedRemovedCaller { RuntimeException refuse() { "
                        + "return cz.novanadeje.app.donations.domain.ChangedMeanwhile.andRemovedSince(); } }"),
                held("donations.application.PlantedPlainRow", "public class PlantedPlainRow { String title; }"),
                held("donations.application.PlantedPage", "public record PlantedPage<T>(java.util.List<T> items, int number) { }"),
                held("donations.application.PlantedStoredRowsPage", "public record PlantedStoredRowsPage(PlantedPage<PlantedPageRow> page, java.time.Instant at, "
                        + "java.util.Optional<java.util.UUID> id, java.math.BigDecimal amount) implements cz.novanadeje.app.shared.application.version.StoredRecord { }"),
                held("donations.application.PlantedPageRow", "public record PlantedPageRow(String title, cz.novanadeje.app.donations.domain.donation.DonationSource source) { }"));
    }

    private static PlantedClass held(String relativeName, String body) {
        return planted("held type", domain_failures_hold_only_typed_values, relativeName, body);
    }

    @ParameterizedTest(name = "{0} reports {1}")
    @MethodSource("plantedClasses")
    @DisplayName("Given a planted failure in the wrong place or of the wrong kind, when the rule checks it, then exactly that class is reported, for the reason planted")
    void should_report_the_planted_failure_when_checked_given_a_misplaced_failure(ArchRule rule, String className, String reason) {
        JavaClasses plantedClass = planted.that(DescribedPredicate.describe("the planted class", type -> type.getName().equals(className)));

        assertThat(rule.evaluate(plantedClass).getFailureReport().getDetails())
                .isNotEmpty().allSatisfy(detail -> assertThat(detail).contains(className).contains(reason));
    }

    @Test
    @DisplayName("Given a planted configuration record of a persistence package that refuses its value as an argument and a row class that asserts a server fault with Assert.state, when the persistence rule checks them, then neither is reported, because a configuration record is bound at startup and never answers a request")
    void should_report_neither_when_checked_given_a_configuration_record_and_a_server_fault_in_a_persistence_package(@TempDir Path folder) throws IOException {
        JavaClasses settings = PlantedClasses.compiled(folder, java.util.Map.of("cz.novanadeje.app.shared.infrastructure.persistence.PlantedSessionProperties", """
                package cz.novanadeje.app.shared.infrastructure.persistence;

                @org.springframework.boot.context.properties.ConfigurationProperties("app.planted")
                public record PlantedSessionProperties(java.time.Duration timeout) {
                    public PlantedSessionProperties {
                        if (timeout == null) {
                            throw new IllegalArgumentException("planted");
                        }
                    }
                }
                """, "cz.novanadeje.app.shared.infrastructure.persistence.PlantedRow", """
                package cz.novanadeje.app.shared.infrastructure.persistence;

                public class PlantedRow {
                    void check(String id) {
                        org.springframework.util.Assert.state(id != null, "planted");
                    }
                }
                """));

        assertThat(persistence_adapters_never_answer_a_broken_invariant_as_the_clients_error.evaluate(settings).hasViolation()).isFalse();
    }

    static Stream<PlantedClass> plantedClasses() {
        return Stream.of(
                planted("placement", domain_failures_live_in_the_domain, "donors.interfaces.rest.PlantedFailure",
                        "public class PlantedFailure extends cz.novanadeje.app.shared.domain.error.Conflict { "
                                + "PlantedFailure() { super(\"donors/planted\", \"planted\"); } }"),
                planted("nested placement", domain_failures_live_in_the_domain, "donors.interfaces.rest.PlantedController",
                        "public class PlantedController { static final class Ended extends cz.novanadeje.app.shared.domain.error.AuthenticationFailure { "
                                + "Ended() { super(\"auth/planted\", \"planted\"); } } }", "cz.novanadeje.app.donors.interfaces.rest.PlantedController$Ended"),
                planted("anonymous", domain_failures_are_named_classes, "donors.domain.PlantedAggregate",
                        "public class PlantedAggregate { RuntimeException refusal() { return new cz.novanadeje.app.shared.domain.error.Conflict("
                                + "\"donors/planted\", \"planted\") { }; } }", "cz.novanadeje.app.donors.domain.PlantedAggregate$1"),
                planted("local", domain_failures_are_named_classes, "donors.domain.PlantedPolicy",
                        "public class PlantedPolicy { RuntimeException refusal() { class Refused extends cz.novanadeje.app.shared.domain.error.RuleViolation { "
                                + "Refused() { super(\"donors/planted\", \"planted\"); } } return new Refused(); } }",
                        "cz.novanadeje.app.donors.domain.PlantedPolicy$1Refused"),
                planted("argument", no_class_extends_the_argument_or_state_exceptions, "donations.domain.PlantedArgumentFailure",
                        "public class PlantedArgumentFailure extends IllegalArgumentException {}"),
                planted("state", no_class_extends_the_argument_or_state_exceptions, "donations.application.PlantedStateFailure",
                        "public class PlantedStateFailure extends IllegalStateException {}"),
                planted("persistence argument", persistence_adapters_never_answer_a_broken_invariant_as_the_clients_error,
                        "donations.infrastructure.persistence.PlantedRepository",
                        "public class PlantedRepository { void save(int offset) { if (offset < 0) { throw new IllegalArgumentException(\"planted\"); } } }"),
                planted("persistence argument reference", persistence_adapters_never_answer_a_broken_invariant_as_the_clients_error,
                        "shared.infrastructure.persistence.PlantedEntity",
                        "public class PlantedEntity { java.util.function.Supplier<RuntimeException> refusal() { return NumberFormatException::new; } }"),
                planted("persistence argument in a lambda", persistence_adapters_never_answer_a_broken_invariant_as_the_clients_error,
                        "donors.infrastructure.persistence.PlantedLookup",
                        "public class PlantedLookup { Object find(java.util.Optional<Object> row) { "
                                + "return row.orElseThrow(() -> new IllegalArgumentException(\"planted\")); } }"),
                planted("audit entity", persistence_adapters_never_answer_a_broken_invariant_as_the_clients_error,
                        "shared.infrastructure.audit.PlantedAuditEntity",
                        "@jakarta.persistence.Entity public class PlantedAuditEntity { void check(String action) { "
                                + "if (action == null) { throw new IllegalArgumentException(\"planted\"); } } }"),
                planted("audit row", persistence_adapters_never_answer_a_broken_invariant_as_the_clients_error,
                        "shared.infrastructure.audit.PlantedAuditRow",
                        "public record PlantedAuditRow(String action) { public PlantedAuditRow { "
                                + "if (action == null) { throw new IllegalArgumentException(\"planted\"); } } }"),
                planted("argument assertion", persistence_adapters_never_answer_a_broken_invariant_as_the_clients_error,
                        "donations.infrastructure.persistence.PlantedAssertingRepository",
                        "public class PlantedAssertingRepository { void read(int offset) { org.springframework.util.Assert.isTrue(offset >= 0, \"planted\"); } }"),
                planted("repository bean outside the adapter packages", persistence_adapters_never_answer_a_broken_invariant_as_the_clients_error,
                        "donations.infrastructure.importing.PlantedRepositoryBean",
                        "@org.springframework.stereotype.Repository public class PlantedRepositoryBean { void read(int offset) { "
                                + "if (offset < 0) { throw new IllegalArgumentException(\"planted\"); } } }"),
                planted("assertion through a subclass", persistence_adapters_never_answer_a_broken_invariant_as_the_clients_error,
                        "shared.infrastructure.lock.PlantedLockAssertions",
                        "public class PlantedLockAssertions { static abstract class Checks extends org.springframework.util.Assert { } "
                                + "void take(long key) { Checks.isTrue(key > 0, \"planted\"); } }"),
                planted("audit trail over a Spring Data repository", persistence_adapters_never_answer_a_broken_invariant_as_the_clients_error,
                        "shared.infrastructure.audit.PlantedAuditTrail",
                        "public class PlantedAuditTrail { private final org.springframework.data.repository.Repository<Object, java.util.UUID> rows; "
                                + "PlantedAuditTrail(org.springframework.data.repository.Repository<Object, java.util.UUID> rows) { this.rows = rows; } "
                                + "void record(String action) { if (action == null) { throw new IllegalArgumentException(\"planted\"); } } }"),
                openValue("object field", "content.domain.PlantedRowFailure",
                        "public class PlantedRowFailure extends cz.novanadeje.app.shared.domain.error.Conflict { private final Object current; "
                                + "public PlantedRowFailure(String version) { super(\"content/planted\", \"planted\"); this.current = version; } }",
                        "holds field current whose type reaches the open type java.lang.Object"),
                openValue("map of objects", "donations.domain.PlantedMapFailure",
                        "public class PlantedMapFailure extends cz.novanadeje.app.shared.domain.error.Conflict { private final java.util.Map<String, Object> extensions; "
                                + "public PlantedMapFailure(String version, java.time.Instant at) { super(\"donations/planted\", \"planted\"); "
                                + "this.extensions = java.util.Map.of(\"version\", version, \"at\", at); } }",
                        "holds field extensions"),
                openValue("wrapper of an object", "content.domain.PlantedWrappedFailure",
                        "public class PlantedWrappedFailure extends cz.novanadeje.app.shared.domain.error.Conflict { public record Current(Object row) { } "
                                + "private final Current current; "
                                + "public PlantedWrappedFailure(String version) { super(\"content/planted\", \"planted\"); this.current = new Current(version); } }",
                        "holds field current whose type reaches Current.row: the open type java.lang.Object"),
                planted("bare stale write", a_stale_write_naming_a_version_travels_with_the_stored_record, "donations.application.PlantedBareStaleWrite",
                        "public class PlantedBareStaleWrite { RuntimeException refuse(String version) { "
                                + "return new cz.novanadeje.app.content.domain.ChangedMeanwhile(version); } }"),
                planted("stale write constructor reference", a_stale_write_naming_a_version_travels_with_the_stored_record,
                        "donations.application.PlantedStaleWriteFactory",
                        "public class PlantedStaleWriteFactory { java.util.function.Function<String, RuntimeException> refusal() { "
                                + "return cz.novanadeje.app.donations.domain.ChangedMeanwhile::new; } }"),
                planted("stale write from a factory", a_stale_write_naming_a_version_travels_with_the_stored_record,
                        "donations.application.PlantedFactoryCaller",
                        "public class PlantedFactoryCaller { RuntimeException refuse() { return cz.novanadeje.app.donations.domain.PlantedFixedStaleWrite.fixed(); } }"),
                storedRecord("stored domain record", "donations.application.PlantedStoredAggregate",
                        "public record PlantedStoredAggregate(cz.novanadeje.app.donations.domain.PlantedRecordAggregate payment) "
                                + "implements cz.novanadeje.app.shared.application.version.StoredRecord { }",
                        "PlantedStoredAggregate.payment: the type of the site cz.novanadeje.app.donations.domain.PlantedRecordAggregate"),
                storedRecord("stored map of objects", "donations.application.PlantedStoredMap",
                        "public record PlantedStoredMap(java.util.Map<String, Object> row) implements cz.novanadeje.app.shared.application.version.StoredRecord { }",
                        "PlantedStoredMap.row: the open type java.lang.Object"),
                storedRecord("stored row of a row of an aggregate", "donations.application.PlantedOuterRow",
                        "public record PlantedOuterRow(PlantedInnerRow inner) implements cz.novanadeje.app.shared.application.version.StoredRecord { }",
                        "PlantedOuterRow.inner: PlantedInnerRow.payment: the type of the site cz.novanadeje.app.donations.domain.PlantedRecordAggregate"),
                storedRecord("stored view of an aggregate", "donations.application.PlantedStoredPayment",
                        "public record PlantedStoredPayment(String version, java.util.List<cz.novanadeje.app.donations.domain.PlantedAggregateRoot> payments) "
                                + "implements cz.novanadeje.app.shared.application.version.StoredRecord { }",
                        "PlantedStoredPayment.payments: the type of the site cz.novanadeje.app.donations.domain.PlantedAggregateRoot"),
                storedRecord("stored library type", "donations.application.PlantedStoredLibrary",
                        "public record PlantedStoredLibrary(org.springframework.util.MultiValueMap<String, String> row) "
                                + "implements cz.novanadeje.app.shared.application.version.StoredRecord { }",
                        "PlantedStoredLibrary.row: the foreign type org.springframework.util.MultiValueMap"),
                storedRecord("stored application class", "donations.application.PlantedStoredPlainRow",
                        "public record PlantedStoredPlainRow(PlantedPlainRow row) implements cz.novanadeje.app.shared.application.version.StoredRecord { }",
                        "PlantedStoredPlainRow.row: the type of the site cz.novanadeje.app.donations.application.PlantedPlainRow"),
                storedRecord("stored failure", "donations.application.PlantedStoredFailure",
                        "public record PlantedStoredFailure(IllegalStateException failure) implements cz.novanadeje.app.shared.application.version.StoredRecord { }",
                        "PlantedStoredFailure.failure: the foreign type java.lang.IllegalStateException"),
                storedRecord("stored raw list", "donations.application.PlantedStoredRawList",
                        "public record PlantedStoredRawList(java.util.List rows) "
                                + "implements cz.novanadeje.app.shared.application.version.StoredRecord { }",
                        "PlantedStoredRawList.rows: the raw type java.util.List"),
                storedRecord("stored properties", "donations.application.PlantedStoredProperties",
                        "public record PlantedStoredProperties(java.util.Properties settings) implements cz.novanadeje.app.shared.application.version.StoredRecord { }",
                        "PlantedStoredProperties.settings: the foreign type java.util.Properties"),
                storedRecord("stored comparator", "donations.application.PlantedStoredComparator",
                        "public record PlantedStoredComparator(java.util.Comparator<String> order) implements cz.novanadeje.app.shared.application.version.StoredRecord { }",
                        "PlantedStoredComparator.order: the foreign type java.util.Comparator"),
                storedRecord("stored generic page of an object", "donations.application.PlantedStoredObjectPage",
                        "public record PlantedStoredObjectPage(PlantedPage<Object> page) implements cz.novanadeje.app.shared.application.version.StoredRecord { }",
                        "PlantedStoredObjectPage.page: the open type java.lang.Object"),
                planted("stored entity", only_application_records_travel_as_the_stored_record, "donations.infrastructure.persistence.PlantedStoredEntity",
                        "public class PlantedStoredEntity implements cz.novanadeje.app.shared.application.version.StoredRecord { }"),
                planted("stored domain record", only_application_records_travel_as_the_stored_record, "content.domain.PlantedStoredValue",
                        "public record PlantedStoredValue(String title) implements cz.novanadeje.app.shared.application.version.StoredRecord { }"),
                planted("stored application class", only_application_records_travel_as_the_stored_record, "operations.application.PlantedStoredView",
                        "public class PlantedStoredView implements cz.novanadeje.app.shared.application.version.StoredRecord { }"),
                openValue("interface implemented outside the domain", "content.domain.PlantedInterfaceFailure",
                        "public class PlantedInterfaceFailure extends cz.novanadeje.app.shared.domain.error.Conflict { private final PlantedCurrentRow current; "
                                + "public PlantedInterfaceFailure(String version) { super(\"content/planted\", \"planted\"); this.current = null; } }",
                        "holds field current whose type reaches the implementation cz.novanadeje.app.content.application.PlantedStoredRow outside a domain package"),
                openValue("inherited field of a held value", "content.domain.PlantedInheritedFailure",
                        "public class PlantedInheritedFailure extends cz.novanadeje.app.shared.domain.error.Conflict { private final PlantedHeldValue held; "
                                + "public PlantedInheritedFailure(String version) { super(\"content/planted\", \"planted\"); this.held = new PlantedHeldValue(version); } }",
                        "holds field held whose type reaches PlantedBaseValue.row: the open type java.lang.Object"),
                openValue("domain implementation holding an object", "content.domain.PlantedArtworkFailure",
                        "public class PlantedArtworkFailure extends cz.novanadeje.app.shared.domain.error.Conflict { private final PlantedArtwork artwork; "
                                + "public PlantedArtworkFailure(String version) { super(\"content/planted\", \"planted\"); this.artwork = null; } }",
                        "holds field artwork whose type reaches PlantedSvgArtwork.row: the open type java.lang.Object"),
                openValue("raw generic value", "donations.domain.PlantedRawFailure",
                        "public class PlantedRawFailure extends cz.novanadeje.app.shared.domain.error.Conflict { private final PlantedPair stamp; "
                                + "public PlantedRawFailure(String version) { super(\"donations/planted\", \"planted\"); this.stamp = null; } }",
                        "holds field stamp whose type reaches the raw type cz.novanadeje.app.donations.domain.PlantedPair"),
                openValue("record parameter", "donors.domain.PlantedRecordFailure",
                        "public class PlantedRecordFailure extends cz.novanadeje.app.shared.domain.error.Conflict { "
                                + "public PlantedRecordFailure(java.util.List<? extends Record> current) { super(\"donors/planted\", \"planted\"); } }",
                        "takes a parameter whose type reaches the open type"),
                openValue("generic parameter", "operations.domain.PlantedGenericFailure",
                        "public class PlantedGenericFailure extends cz.novanadeje.app.shared.domain.error.Conflict { "
                                + "public <T> PlantedGenericFailure(T current) { super(\"operations/planted\", \"planted\"); } }",
                        "takes a parameter whose type reaches the open type"),
                openValue("serializable array", "operations.domain.PlantedArrayFailure",
                        "public class PlantedArrayFailure extends cz.novanadeje.app.shared.domain.error.Conflict { "
                                + "public PlantedArrayFailure() { super(\"operations/planted\", \"planted\"); } "
                                + "public PlantedArrayFailure with(java.io.Serializable[] current) { return this; } }",
                        "takes a parameter whose type reaches the open type"));
    }

    private static PlantedClass typedFailure() {
        return planted("typed values", domain_failures_hold_only_typed_values, "donations.domain.PlantedTypedFailure",
                "public class PlantedTypedFailure extends cz.novanadeje.app.shared.domain.error.Conflict implements Comparable<PlantedTypedFailure> { "
                        + "private final String version; "
                        + "private final java.time.Instant at; private final java.util.List<java.util.UUID> ids; "
                        + "private final PlantedPair<String, java.time.Instant> stamp; private final PlantedOutcome<String> outcome; "
                        + "public PlantedTypedFailure(String version, java.time.Instant at, java.util.List<java.util.UUID> ids) { "
                        + "super(\"donations/planted\", \"planted\"); this.version = version; this.at = at; this.ids = ids; "
                        + "this.stamp = new PlantedPair<>(version, at); this.outcome = new PlantedOk<>(version); } "
                        + "public java.util.Map<String, Object> extensions() { return java.util.Map.of(\"version\", version, \"at\", at, \"ids\", ids); } "
                        + "public boolean equals(Object other) { return this == other; } public int hashCode() { return version.hashCode(); } "
                        + "public int compareTo(PlantedTypedFailure other) { return version.compareTo(other.version); } }");
    }

    private static ArchCondition<JavaClass> holdNoValueOfAnOpenType() {
        return new ArchCondition<>("hold no field and take no parameter typed Object, Record or Serializable, or of a type of the site that reaches one") {
            @Override
            public void check(JavaClass failure, ConditionEvents events) {
                failure.getFields().forEach(field -> openPath(field.getType()).ifPresent(path -> events.add(SimpleConditionEvent.violated(failure,
                        failure.getName() + " holds field " + field.getName() + " whose type reaches " + path))));
                failure.getCodeUnits().stream()
                        .filter(DomainFailureRulesTest::isWritten)
                        .forEach(unit -> unit.getParameterTypes().forEach(type -> openPath(type).ifPresent(path -> events.add(SimpleConditionEvent.violated(failure,
                                failure.getName() + "." + unit.getName() + " takes a parameter whose type reaches " + path)))));
            }
        };
    }

    private static boolean isWritten(JavaCodeUnit unit) {
        return !unit.getModifiers().contains(JavaModifier.SYNTHETIC) && !isEqualsOverride(unit);
    }

    private static boolean isEqualsOverride(JavaCodeUnit unit) {
        return unit.getName().equals("equals") && unit.getRawParameterTypes().size() == 1
                && unit.getRawParameterTypes().getFirst().getName().equals(Object.class.getName());
    }

    private static Optional<String> openPath(JavaType type) {
        return openPath(type, new HashSet<>(), Set.of());
    }

    private static Optional<String> openPath(JavaType type, Set<String> looked, Set<String> checkedVariables) {
        return switch (type) {
            case JavaParameterizedType parameterized -> heldOpenValue(parameterized.toErasure(), looked, variableNames(parameterized.toErasure()))
                    .or(() -> firstOpen(parameterized.getActualTypeArguments(), looked, checkedVariables));
            case JavaWildcardType wildcard -> wildcard.getUpperBounds().isEmpty() ? Optional.of("the open type ?")
                    : firstOpen(wildcard.getUpperBounds(), looked, checkedVariables);
            case JavaTypeVariable<?> variable -> checkedVariables.contains(variable.getName()) ? Optional.empty()
                    : openPath(variable.toErasure(), looked, checkedVariables);
            case JavaGenericArrayType array -> openPath(array.getComponentType(), looked, checkedVariables);
            case JavaClass raw when raw.isArray() -> openPath(raw.getComponentType(), looked, checkedVariables);
            case JavaClass raw when !raw.getTypeParameters().isEmpty() -> Optional.of("the raw type " + raw.getName());
            case JavaClass raw -> heldOpenValue(raw, looked, Set.of());
            default -> Optional.empty();
        };
    }

    private static Optional<String> firstOpen(List<? extends JavaType> types, Set<String> looked, Set<String> checkedVariables) {
        return types.stream().map(type -> openPath(type, looked, checkedVariables)).flatMap(Optional::stream).findFirst();
    }

    private static Optional<String> heldOpenValue(JavaClass type, Set<String> looked, Set<String> checkedVariables) {
        if (OPEN_TYPES.contains(type.getName())) {
            return Optional.of("the open type " + type.getName());
        }
        if (!isOfTheSite(type) || type.isEnum() || !looked.add(lookKey(type, checkedVariables))) {
            return Optional.empty();
        }
        return fieldPath(type, looked, checkedVariables).or(() -> subclassPath(type, looked, checkedVariables));
    }

    private static Optional<String> fieldPath(JavaClass type, Set<String> looked, Set<String> checkedVariables) {
        return instanceFieldsOfTheSite(type)
                .flatMap(field -> openPath(field.getType(), looked, checkedVariables).map(path -> pathThrough(field, path)).stream())
                .findFirst();
    }

    private static Optional<String> subclassPath(JavaClass type, Set<String> looked, Set<String> checkedVariables) {
        return type.getAllSubclasses().stream()
                .flatMap(subclass -> (DOMAIN.test(subclass)
                        ? heldOpenValue(subclass, looked, variablesPassedThrough(subclass, type, checkedVariables))
                        : Optional.of("the implementation " + subclass.getName() + " outside a domain package")).stream())
                .findFirst();
    }

    private static Set<String> variablesPassedThrough(JavaClass subclass, JavaClass type, Set<String> checkedVariables) {
        return Stream.concat(subclass.getSuperclass().stream(), subclass.getInterfaces().stream())
                .filter(supertype -> supertype instanceof JavaParameterizedType parameterized && parameterized.toErasure().equals(type))
                .flatMap(supertype -> {
                    List<JavaType> arguments = ((JavaParameterizedType) supertype).getActualTypeArguments();
                    return IntStream.range(0, arguments.size())
                            .filter(index -> arguments.get(index) instanceof JavaTypeVariable<?>
                                    && checkedVariables.contains(type.getTypeParameters().get(index).getName()))
                            .mapToObj(index -> ((JavaTypeVariable<?>) arguments.get(index)).getName());
                })
                .collect(Collectors.toUnmodifiableSet());
    }

    private static String lookKey(JavaClass type, Set<String> checkedVariables) {
        return type.getName() + new TreeSet<>(checkedVariables);
    }

    private static Set<String> variableNames(JavaClass type) {
        return type.getTypeParameters().stream().map(JavaTypeVariable::getName).collect(Collectors.toUnmodifiableSet());
    }

    private static Stream<JavaField> instanceFieldsOfTheSite(JavaClass type) {
        return type.getAllFields().stream().filter(field -> !field.getModifiers().contains(JavaModifier.STATIC) && isOfTheSite(field.getOwner()));
    }

    private static String pathThrough(JavaField field, String path) {
        return field.getOwner().getSimpleName() + "." + field.getName() + ": " + path;
    }

    private static ArchCondition<JavaClass> holdOnlyPlainDataEnumsAndApplicationRecords() {
        return new ArchCondition<>("hold only primitives, boxed primitives, strings, numbers of java.math, the value types of java.time, UUID, Optional, Locale, "
                + "Currency and the collections and maps of java.util, enums of the site and records of an application package that hold the same, "
                + "so no aggregate, entity, other type of the site, Object or Throwable enters the answer") {
            @Override
            public void check(JavaClass stored, ConditionEvents events) {
                foreignPath(stored, new HashSet<>()).ifPresent(path -> events.add(SimpleConditionEvent.violated(stored,
                        stored.getName() + " holds " + path)));
            }
        };
    }

    private static Optional<String> foreignPath(JavaClass record, Set<String> looked) {
        return foreignPath(record, looked, Set.of());
    }

    private static Optional<String> foreignPath(JavaClass record, Set<String> looked, Set<String> checkedVariables) {
        if (!looked.add(lookKey(record, checkedVariables))) {
            return Optional.empty();
        }
        return instanceFieldsOfTheSite(record)
                .flatMap(field -> foreignTypePath(field.getType(), looked, checkedVariables).map(path -> pathThrough(field, path)).stream())
                .findFirst();
    }

    private static Optional<String> foreignTypePath(JavaType type, Set<String> looked, Set<String> checkedVariables) {
        return switch (type) {
            case JavaParameterizedType parameterized -> heldForeignValue(parameterized.toErasure(), looked, variableNames(parameterized.toErasure()))
                    .or(() -> firstForeign(parameterized.getActualTypeArguments(), looked, checkedVariables));
            case JavaWildcardType wildcard -> wildcard.getUpperBounds().isEmpty() ? Optional.of("the open type ?")
                    : firstForeign(wildcard.getUpperBounds(), looked, checkedVariables);
            case JavaTypeVariable<?> variable -> checkedVariables.contains(variable.getName()) ? Optional.empty()
                    : Optional.of("the type variable " + variable.getName());
            case JavaGenericArrayType array -> foreignTypePath(array.getComponentType(), looked, checkedVariables);
            case JavaClass raw when raw.isArray() -> foreignTypePath(raw.getComponentType(), looked, checkedVariables);
            case JavaClass raw when !raw.getTypeParameters().isEmpty() -> Optional.of("the raw type " + raw.getName());
            case JavaClass raw -> heldForeignValue(raw, looked, Set.of());
            default -> Optional.empty();
        };
    }

    private static Optional<String> firstForeign(List<? extends JavaType> types, Set<String> looked, Set<String> checkedVariables) {
        return types.stream().map(type -> foreignTypePath(type, looked, checkedVariables)).flatMap(Optional::stream).findFirst();
    }

    private static Optional<String> heldForeignValue(JavaClass held, Set<String> looked, Set<String> checkedVariables) {
        if (OPEN_TYPES.contains(held.getName())) {
            return Optional.of("the open type " + held.getName());
        }
        if (!isOfTheSite(held)) {
            return isPlainJavaValue(held) ? Optional.empty() : Optional.of("the foreign type " + held.getName());
        }
        if (held.isEnum()) {
            return Optional.empty();
        }
        return held.isRecord() && APPLICATION.test(held) ? foreignPath(held, looked, checkedVariables)
                : Optional.of("the type of the site " + held.getName());
    }

    private static boolean isPlainJavaValue(JavaClass type) {
        return type.isPrimitive() || PLAIN_JAVA_VALUES.contains(type.getName());
    }

    private static ArchCondition<JavaClass> buildAVersionedStaleWriteOnlyWithItsRefusal() {
        return new ArchCondition<>("build a stale write naming a version only in a code unit that also constructs the StaleWriteRefusal carrying the record") {
            @Override
            public void check(JavaClass type, ConditionEvents events) {
                if (type.isAssignableTo(StaleWrite.class)) {
                    return;
                }
                type.getCodeUnits().stream()
                        .filter(unit -> staleWriteTargets(unit).anyMatch(DomainFailureRulesTest::buildsAVersionedStaleWrite))
                        .filter(unit -> unit.getConstructorCallsFromSelf().stream()
                                .noneMatch(call -> call.getTargetOwner().getName().equals(StaleWriteRefusal.class.getName())))
                        .forEach(unit -> events.add(SimpleConditionEvent.violated(type, unit.getFullName()
                                + " builds a stale write naming a version without the StaleWriteRefusal that carries the record; "
                                + "build the StaleWriteRefusal in the same method as the stale write")));
            }
        };
    }

    private static Stream<JavaCodeUnit> staleWriteTargets(JavaCodeUnit unit) {
        return Stream.of(unit.getConstructorCallsFromSelf(), unit.getMethodCallsFromSelf(), unit.getConstructorReferencesFromSelf(),
                        unit.getMethodReferencesFromSelf())
                .flatMap(Set::stream)
                .map(access -> (AccessTarget.CodeUnitAccessTarget) access.getTarget())
                .filter(target -> target.getOwner().isAssignableTo(StaleWrite.class))
                .flatMap(target -> target.resolveMember().stream());
    }

    private static boolean buildsAVersionedStaleWrite(JavaCodeUnit unit) {
        return buildsAVersionedStaleWrite(unit, new HashSet<>());
    }

    private static boolean buildsAVersionedStaleWrite(JavaCodeUnit unit, Set<JavaCodeUnit> looked) {
        if (!looked.add(unit) || unit.getOwner().getName().equals(StaleWrite.class.getName())) {
            return false;
        }
        return unit.getConstructorCallsFromSelf().stream().anyMatch(call -> call.getTarget().getFullName().equals(VERSIONED_STALE_WRITE))
                || staleWriteTargets(unit).anyMatch(target -> buildsAVersionedStaleWrite(target, looked));
    }

    private static boolean isOfTheSite(JavaClass type) {
        return type.getPackageName().startsWith(AppApplication.class.getPackageName());
    }

    private static PlantedClass planted(String label, ArchRule rule, String relativeName, String body) {
        return planted(label, rule, relativeName, body, "cz.novanadeje.app." + relativeName);
    }

    private static PlantedClass planted(String label, ArchRule rule, String relativeName, String body, String reportedClass) {
        String sourceName = "cz.novanadeje.app." + relativeName;
        return new PlantedClass(Named.of(label, rule), sourceName, reportedClass,
                "package " + sourceName.substring(0, sourceName.lastIndexOf('.')) + ";\n" + body + "\n");
    }

    private static PlantedClass storedRecord(String label, String relativeName, String body, String reason) {
        PlantedClass planted = planted(label, only_application_records_travel_as_the_stored_record, relativeName, body);
        return new PlantedClass(planted.rule(), planted.sourceName(), planted.className(), planted.source(), reason);
    }

    private static PlantedClass openValue(String label, String relativeName, String body, String reason) {
        PlantedClass planted = planted(label, domain_failures_hold_only_typed_values, relativeName, body);
        return new PlantedClass(planted.rule(), planted.sourceName(), planted.className(), planted.source(), reason);
    }

    record PlantedClass(Named<ArchRule> rule, String sourceName, String className, String source, String reason) implements Arguments {

        PlantedClass(Named<ArchRule> rule, String sourceName, String className, String source) {
            this(rule, sourceName, className, source, className);
        }

        @Override
        public Object[] get() {
            return new Object[]{rule, className, reason};
        }
    }
}
