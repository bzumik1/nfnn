package cz.novanadeje.app.architecture;

import com.tngtech.archunit.base.DescribedPredicate;
import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.domain.JavaField;
import com.tngtech.archunit.core.domain.JavaGenericArrayType;
import com.tngtech.archunit.core.domain.JavaMember;
import com.tngtech.archunit.core.domain.JavaModifier;
import com.tngtech.archunit.core.domain.JavaParameterizedType;
import com.tngtech.archunit.core.domain.JavaType;
import com.tngtech.archunit.core.domain.JavaTypeVariable;
import com.tngtech.archunit.core.domain.JavaWildcardType;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchCondition;
import com.tngtech.archunit.lang.ArchRule;
import com.tngtech.archunit.lang.ConditionEvents;
import com.tngtech.archunit.lang.SimpleConditionEvent;
import cz.novanadeje.app.AppApplication;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Path;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.classes;
import static java.util.Map.entry;
import static org.assertj.core.api.Assertions.assertThat;

@AnalyzeClasses(
        packagesOf = AppApplication.class,
        importOptions = ImportOption.DoNotIncludeTests.class
)
class DomainIdRulesTest {

    private static final String UUID_TYPE = UUID.class.getName();

    private static final String DONORS_CREDENTIAL_IDS = "pending #980: the id of a donors credential becomes a donors id record";
    private static final String OPERATIONS_REFERENCES = "pending #981: the id of a donor's account or device becomes an operations reference record";

    private static final Map<String, String> RAW_UUID_HOLDERS = Map.ofEntries(
            entry("cz.novanadeje.app.shared.domain.UuidV7", "the generator every id record wraps answers the UUID the record holds"),
            entry("cz.novanadeje.app.shared.domain.ErasedPersonalData",
                    "pending #980: emailFor serves only donors and moves there, taking a DonorId, since the shared kernel names no context's id"),
            entry("cz.novanadeje.app.donors.domain.AuthorizationCode", DONORS_CREDENTIAL_IDS),
            entry("cz.novanadeje.app.donors.domain.AuthorizationCodeRepository", DONORS_CREDENTIAL_IDS),
            entry("cz.novanadeje.app.donors.domain.ConnectedAppNotFound", DONORS_CREDENTIAL_IDS),
            entry("cz.novanadeje.app.donors.domain.EmailVerificationToken", DONORS_CREDENTIAL_IDS),
            entry("cz.novanadeje.app.donors.domain.EmailVerificationTokenRepository", DONORS_CREDENTIAL_IDS),
            entry("cz.novanadeje.app.donors.domain.PasskeyChallenge", DONORS_CREDENTIAL_IDS),
            entry("cz.novanadeje.app.donors.domain.PasskeyChallengeRepository", DONORS_CREDENTIAL_IDS),
            entry("cz.novanadeje.app.donors.domain.PasswordResetToken", DONORS_CREDENTIAL_IDS),
            entry("cz.novanadeje.app.donors.domain.PasswordResetTokenRepository", DONORS_CREDENTIAL_IDS),
            entry("cz.novanadeje.app.donors.domain.RefreshToken", DONORS_CREDENTIAL_IDS),
            entry("cz.novanadeje.app.donors.domain.RefreshTokenRepository", DONORS_CREDENTIAL_IDS),
            entry("cz.novanadeje.app.donors.domain.SecondFactorChallenge", DONORS_CREDENTIAL_IDS),
            entry("cz.novanadeje.app.donors.domain.SecondFactorChallengeRepository", DONORS_CREDENTIAL_IDS),
            entry("cz.novanadeje.app.donors.domain.SecondFactorRecovery", DONORS_CREDENTIAL_IDS),
            entry("cz.novanadeje.app.donors.domain.SecondFactorRecoveryRepository", DONORS_CREDENTIAL_IDS),
            entry("cz.novanadeje.app.operations.domain.backup.BackupKeyConfirmation", OPERATIONS_REFERENCES),
            entry("cz.novanadeje.app.operations.domain.backup.BackupRun", OPERATIONS_REFERENCES),
            entry("cz.novanadeje.app.operations.domain.loggers.LogLevelOverride", OPERATIONS_REFERENCES),
            entry("cz.novanadeje.app.operations.domain.push.DonorPushSubscription", OPERATIONS_REFERENCES),
            entry("cz.novanadeje.app.operations.domain.push.DonorPushSubscriptionRepository", OPERATIONS_REFERENCES),
            entry("cz.novanadeje.app.operations.domain.push.PushSubscription", OPERATIONS_REFERENCES),
            entry("cz.novanadeje.app.operations.domain.push.PushSubscriptionRepository", OPERATIONS_REFERENCES));

    private static final DescribedPredicate<JavaClass> LISTED_HOLDERS_APART = DescribedPredicate.describe(
            "are not one of the reviewed raw UUID holders", type -> !RAW_UUID_HOLDERS.containsKey(type.getName()));

    private static final DescribedPredicate<JavaClass> NOT_AN_ID_RECORD = DescribedPredicate.describe(
            "are not an id record (a record whose only component is a UUID)", type -> !isIdRecord(type));

    @ArchTest
    static final ArchRule domain_classes_hold_ids_as_id_records = domainClassesHoldIdsAsIdRecords(LISTED_HOLDERS_APART);

    private static ArchRule domainClassesHoldIdsAsIdRecords(DescribedPredicate<JavaClass> holdersApart) {
        return classes()
                .that().resideInAPackage("..domain..")
                .and(NOT_AN_ID_RECORD)
                .and(holdersApart)
                .should(declareNoRawUuid())
                .because("backend.md, Domain: ids are records over UUID, generated by UuidV7, so an id of one entity is never passed where "
                        + "another's is expected; an entity of another context is held as this context's own reference record (DonorReference), "
                        + "and application services and adapters convert at the boundary");
    }

    private static boolean isIdRecord(JavaClass type) {
        if (!type.isRecord()) {
            return false;
        }
        List<JavaField> components = type.getFields().stream().filter(field -> !field.getModifiers().contains(JavaModifier.STATIC)).toList();
        return components.size() == 1 && components.getFirst().getRawType().getName().equals(UUID_TYPE);
    }

    private static ArchCondition<JavaClass> declareNoRawUuid() {
        return new ArchCondition<>("declare no field, parameter or return type holding a raw java.util.UUID") {
            @Override
            public void check(JavaClass type, ConditionEvents events) {
                type.getFields().stream()
                        .filter(DomainIdRulesTest::writtenInSource)
                        .filter(field -> mentionsUuid(field.getType()))
                        .forEach(field -> events.add(SimpleConditionEvent.violated(type, field.getFullName() + " holds a raw UUID")));
                type.getCodeUnits().stream()
                        .filter(DomainIdRulesTest::writtenInSource)
                        .forEach(unit -> {
                            unit.getParameterTypes().stream().filter(DomainIdRulesTest::mentionsUuid).findFirst()
                                    .ifPresent(parameter -> events.add(SimpleConditionEvent.violated(type,
                                            unit.getFullName() + " takes a raw UUID in " + parameter.getName())));
                            if (unit.isMethod() && mentionsUuid(unit.getReturnType())) {
                                events.add(SimpleConditionEvent.violated(type,
                                        unit.getFullName() + " answers a raw UUID in " + unit.getReturnType().getName()));
                            }
                        });
            }
        };
    }

    private static boolean writtenInSource(JavaMember member) {
        return !member.getModifiers().contains(JavaModifier.SYNTHETIC);
    }

    private static boolean mentionsUuid(JavaType type) {
        return mentionsUuid(type, new HashSet<>());
    }

    private static boolean mentionsUuid(JavaType type, Set<String> lookedVariables) {
        return switch (type) {
            case JavaClass raw -> raw.getBaseComponentType().getName().equals(UUID_TYPE);
            case JavaParameterizedType parameterized -> mentionsUuid(parameterized.toErasure(), lookedVariables)
                    || parameterized.getActualTypeArguments().stream().anyMatch(argument -> mentionsUuid(argument, lookedVariables));
            case JavaWildcardType wildcard -> wildcard.getUpperBounds().stream().anyMatch(bound -> mentionsUuid(bound, lookedVariables))
                    || wildcard.getLowerBounds().stream().anyMatch(bound -> mentionsUuid(bound, lookedVariables));
            case JavaTypeVariable<?> variable -> lookedVariables.add(variable.getName())
                    && variable.getUpperBounds().stream().anyMatch(bound -> mentionsUuid(bound, lookedVariables));
            case JavaGenericArrayType array -> mentionsUuid(array.getComponentType(), lookedVariables);
            default -> false;
        };
    }

    @Test
    @DisplayName("Given the reviewed raw UUID holders, when the rule checks the site without them apart, then each is still reported, so the list names no holder that is gone or no longer needs it")
    void should_report_every_listed_holder_when_checked_without_the_list_given_the_site() {
        JavaClasses site = new ClassFileImporter().withImportOption(new ImportOption.DoNotIncludeTests()).importPackagesOf(AppApplication.class);

        List<String> details = domainClassesHoldIdsAsIdRecords(DescribedPredicate.alwaysTrue()).evaluate(site).getFailureReport().getDetails();

        assertThat(RAW_UUID_HOLDERS.keySet()).allSatisfy(holder -> assertThat(details).anySatisfy(detail -> assertThat(detail).startsWith(holder + ".")));
    }

    @Test
    @DisplayName("Given planted domain classes holding a UUID in a field, a record component, a constructor and a method parameter, a return type, a generic type, an optional, an array, a generic array, a wildcard and a type variable's bound, beside id records, a local UUID, a lambda and the same shapes outside the domain, when the rule checks them, then exactly the declarations written in the domain are reported and no id record")
    void should_report_every_raw_uuid_declared_in_the_domain_when_checked_given_planted_classes(@TempDir Path folder) throws IOException {
        JavaClasses planted = PlantedClasses.compiled(folder, Map.of(
                "cz.novanadeje.app.plantedu.domain.PlantedHolder", """
                        package cz.novanadeje.app.plantedu.domain;

                        import java.util.Collection;
                        import java.util.Comparator;
                        import java.util.List;
                        import java.util.Map;
                        import java.util.Optional;
                        import java.util.UUID;
                        import java.util.function.Supplier;

                        public class PlantedHolder {

                            private UUID field;
                            private Map<String, List<UUID>> nested;
                            private UUID[][] grid;
                            private final PlantedId id;

                            public PlantedHolder(UUID constructed, PlantedId id) {
                                this.id = id;
                            }

                            public void take(UUID parameter) {
                            }

                            public UUID answer() {
                                return null;
                            }

                            public Optional<UUID> maybe() {
                                return Optional.empty();
                            }

                            public void spread(List<UUID>[] lists) {
                            }

                            public void bounded(Collection<? extends UUID> upper, Comparator<? super UUID> lower) {
                            }

                            public <T extends UUID> T first(List<T> values) {
                                return values.getFirst();
                            }

                            public String text() {
                                UUID local = id.value();
                                Supplier<String> later = () -> local.toString();
                                return later.get();
                            }

                            public PlantedId id() {
                                return id;
                            }
                        }
                        """,
                "cz.novanadeje.app.plantedu.domain.PlantedId", """
                        package cz.novanadeje.app.plantedu.domain;

                        import java.util.UUID;

                        public record PlantedId(UUID value) {

                            static final UUID NONE = new UUID(0, 0);

                            public static PlantedId of(String value) {
                                return new PlantedId(UUID.fromString(value));
                            }
                        }
                        """,
                "cz.novanadeje.app.plantedu.domain.PlantedPair", """
                        package cz.novanadeje.app.plantedu.domain;

                        import java.util.UUID;

                        public record PlantedPair(UUID first, PlantedId second) {
                        }
                        """,
                "cz.novanadeje.app.plantedu.domain.PlantedPort", """
                        package cz.novanadeje.app.plantedu.domain;

                        import java.util.UUID;

                        public interface PlantedPort {

                            boolean markUsed(UUID tokenId);

                            boolean markUsed(PlantedId tokenId);
                        }
                        """,
                "cz.novanadeje.app.plantedu.application.PlantedView", """
                        package cz.novanadeje.app.plantedu.application;

                        import java.util.UUID;

                        public record PlantedView(UUID id, String name) {
                        }
                        """,
                "cz.novanadeje.app.plantedu.infrastructure.PlantedColumn", """
                        package cz.novanadeje.app.plantedu.infrastructure;

                        import java.util.UUID;

                        class PlantedColumn {

                            private UUID id;

                            UUID id() {
                                return id;
                            }
                        }
                        """));

        List<String> details = domainClassesHoldIdsAsIdRecords(DescribedPredicate.alwaysTrue()).evaluate(planted).getFailureReport().getDetails();

        assertThat(details)
                .hasSize(15)
                .anySatisfy(detail -> assertThat(detail).startsWith("cz.novanadeje.app.plantedu.domain.PlantedHolder.field holds"))
                .anySatisfy(detail -> assertThat(detail).startsWith("cz.novanadeje.app.plantedu.domain.PlantedHolder.nested holds"))
                .anySatisfy(detail -> assertThat(detail).startsWith("cz.novanadeje.app.plantedu.domain.PlantedHolder.grid holds"))
                .anySatisfy(detail -> assertThat(detail).startsWith("cz.novanadeje.app.plantedu.domain.PlantedHolder.<init>(java.util.UUID, "))
                .anySatisfy(detail -> assertThat(detail).startsWith("cz.novanadeje.app.plantedu.domain.PlantedHolder.take(java.util.UUID) takes"))
                .anySatisfy(detail -> assertThat(detail).startsWith("cz.novanadeje.app.plantedu.domain.PlantedHolder.answer() answers"))
                .anySatisfy(detail -> assertThat(detail).startsWith("cz.novanadeje.app.plantedu.domain.PlantedHolder.maybe() answers"))
                .anySatisfy(detail -> assertThat(detail).startsWith("cz.novanadeje.app.plantedu.domain.PlantedHolder.spread([Ljava.util.List;) takes"))
                .anySatisfy(detail -> assertThat(detail).startsWith("cz.novanadeje.app.plantedu.domain.PlantedHolder.bounded("))
                .anySatisfy(detail -> assertThat(detail).startsWith("cz.novanadeje.app.plantedu.domain.PlantedHolder.first(java.util.List) takes"))
                .anySatisfy(detail -> assertThat(detail).startsWith("cz.novanadeje.app.plantedu.domain.PlantedHolder.first(java.util.List) answers"))
                .anySatisfy(detail -> assertThat(detail).startsWith("cz.novanadeje.app.plantedu.domain.PlantedPair.first holds"))
                .anySatisfy(detail -> assertThat(detail).startsWith("cz.novanadeje.app.plantedu.domain.PlantedPair.<init>(java.util.UUID, "))
                .anySatisfy(detail -> assertThat(detail).startsWith("cz.novanadeje.app.plantedu.domain.PlantedPair.first() answers"))
                .anySatisfy(detail -> assertThat(detail).startsWith("cz.novanadeje.app.plantedu.domain.PlantedPort.markUsed(java.util.UUID) takes"))
                .noneSatisfy(detail -> assertThat(detail).startsWith("cz.novanadeje.app.plantedu.domain.PlantedId."))
                .noneSatisfy(detail -> assertThat(detail).contains("text()"))
                .noneSatisfy(detail -> assertThat(detail).contains("lambda$"))
                .noneSatisfy(detail -> assertThat(detail).contains("plantedu.application"))
                .noneSatisfy(detail -> assertThat(detail).contains("plantedu.infrastructure"));
    }
}
