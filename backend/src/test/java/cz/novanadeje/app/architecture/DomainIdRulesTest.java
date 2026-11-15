package cz.novanadeje.app.architecture;

import com.tngtech.archunit.base.DescribedPredicate;
import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.domain.JavaCodeUnit;
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
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.classes;
import static java.util.Map.entry;
import static org.assertj.core.api.Assertions.assertThat;

@AnalyzeClasses(
        packagesOf = AppApplication.class,
        importOptions = ImportOption.DoNotIncludeTests.class
)
class DomainIdRulesTest {

    private static final String UUID_TYPE = UUID.class.getName();
    private static final String ID_COMPONENT = "value";

    private static final String DONORS_CREDENTIAL_IDS = "pending #980: the id of a donors credential becomes a donors id record";
    private static final String OPERATIONS_REFERENCES = "pending #981: the id of a donor's account or device becomes an operations reference record";
    private static final String UUID_V7 = "the generator every id record wraps answers the UUID the record holds";
    private static final String ERASED = "pending #980: emailFor serves only donors and moves there, taking a DonorId, since the shared kernel names no context's id";

    private static final Map<String, String> RAW_UUID_DECLARATIONS = Stream.of(
            declarations(UUID_V7,
                    "cz.novanadeje.app.shared.domain.UuidV7.generate(java.time.Instant) returns"),
            declarations(ERASED,
                    "cz.novanadeje.app.shared.domain.ErasedPersonalData.emailFor(java.util.UUID)"),
            declarations(DONORS_CREDENTIAL_IDS,
                    "cz.novanadeje.app.donors.domain.AuthorizationCode.<init>(java.util.UUID, java.lang.String, cz.novanadeje.app.donors.domain.DonorId, cz.novanadeje.app.donors.domain.ClientId, java.net.URI, cz.novanadeje.app.donors.domain.CodeChallenge, java.util.Set, java.lang.String, boolean, java.time.Instant, java.time.Instant, java.time.Instant)",
                    "cz.novanadeje.app.donors.domain.AuthorizationCode.id",
                    "cz.novanadeje.app.donors.domain.AuthorizationCode.id() returns",
                    "cz.novanadeje.app.donors.domain.AuthorizationCode.reconstitute(java.util.UUID, java.lang.String, cz.novanadeje.app.donors.domain.DonorId, cz.novanadeje.app.donors.domain.ClientId, java.net.URI, cz.novanadeje.app.donors.domain.CodeChallenge, java.util.Set, java.lang.String, boolean, java.time.Instant, java.time.Instant, java.time.Instant)",
                    "cz.novanadeje.app.donors.domain.AuthorizationCodeRepository.markUsed(java.util.UUID, java.time.Instant)",
                    "cz.novanadeje.app.donors.domain.ConnectedAppNotFound.<init>(java.util.UUID)",
                    "cz.novanadeje.app.donors.domain.EmailVerificationToken.<init>(java.util.UUID, cz.novanadeje.app.donors.domain.DonorId, java.lang.String, java.time.Instant, java.time.Instant, cz.novanadeje.app.shared.domain.EmailAddress, java.time.Instant)",
                    "cz.novanadeje.app.donors.domain.EmailVerificationToken.id",
                    "cz.novanadeje.app.donors.domain.EmailVerificationToken.id() returns",
                    "cz.novanadeje.app.donors.domain.EmailVerificationToken.reconstitute(java.util.UUID, cz.novanadeje.app.donors.domain.DonorId, java.lang.String, java.time.Instant, java.time.Instant, cz.novanadeje.app.shared.domain.EmailAddress, java.time.Instant)",
                    "cz.novanadeje.app.donors.domain.EmailVerificationTokenRepository.markUsed(java.util.UUID, java.time.Instant)",
                    "cz.novanadeje.app.donors.domain.PasskeyChallenge.<init>(java.util.UUID, cz.novanadeje.app.donors.domain.PasskeyCeremony, cz.novanadeje.app.donors.domain.DonorId, java.lang.String, java.time.Instant, java.time.Instant, java.time.Instant)",
                    "cz.novanadeje.app.donors.domain.PasskeyChallenge.id",
                    "cz.novanadeje.app.donors.domain.PasskeyChallenge.id() returns",
                    "cz.novanadeje.app.donors.domain.PasskeyChallenge.reconstitute(java.util.UUID, cz.novanadeje.app.donors.domain.PasskeyCeremony, cz.novanadeje.app.donors.domain.DonorId, java.lang.String, java.time.Instant, java.time.Instant, java.time.Instant)",
                    "cz.novanadeje.app.donors.domain.PasskeyChallengeRepository.markUsed(java.util.UUID, java.time.Instant)",
                    "cz.novanadeje.app.donors.domain.PasswordResetToken.<init>(java.util.UUID, cz.novanadeje.app.donors.domain.DonorId, java.lang.String, java.time.Instant, java.time.Instant, java.time.Instant)",
                    "cz.novanadeje.app.donors.domain.PasswordResetToken.id",
                    "cz.novanadeje.app.donors.domain.PasswordResetToken.id() returns",
                    "cz.novanadeje.app.donors.domain.PasswordResetToken.reconstitute(java.util.UUID, cz.novanadeje.app.donors.domain.DonorId, java.lang.String, java.time.Instant, java.time.Instant, java.time.Instant)",
                    "cz.novanadeje.app.donors.domain.PasswordResetTokenRepository.deleteOthersOf(cz.novanadeje.app.donors.domain.DonorId, java.util.UUID)",
                    "cz.novanadeje.app.donors.domain.PasswordResetTokenRepository.markUsed(java.util.UUID, java.time.Instant)",
                    "cz.novanadeje.app.donors.domain.RefreshToken.<init>(java.util.UUID, cz.novanadeje.app.donors.domain.DonorId, java.lang.String, java.time.Instant, java.time.Instant, boolean, cz.novanadeje.app.donors.domain.ClientId, java.util.Set, java.time.Instant, java.time.Instant, java.time.Instant, java.util.UUID, java.time.Instant, cz.novanadeje.app.donors.domain.DeviceId)",
                    "cz.novanadeje.app.donors.domain.RefreshToken.id",
                    "cz.novanadeje.app.donors.domain.RefreshToken.id() returns",
                    "cz.novanadeje.app.donors.domain.RefreshToken.reconstitute(java.util.UUID, cz.novanadeje.app.donors.domain.DonorId, java.lang.String, java.time.Instant, java.time.Instant, boolean, cz.novanadeje.app.donors.domain.ClientId, java.util.Set, java.time.Instant, java.time.Instant, java.time.Instant, java.util.UUID, java.time.Instant, cz.novanadeje.app.donors.domain.DeviceId)",
                    "cz.novanadeje.app.donors.domain.RefreshToken.successorId",
                    "cz.novanadeje.app.donors.domain.RefreshToken.successorId() returns",
                    "cz.novanadeje.app.donors.domain.RefreshTokenRepository.findById(java.util.UUID)",
                    "cz.novanadeje.app.donors.domain.RefreshTokenRepository.markUsed(java.util.UUID, java.time.Instant)",
                    "cz.novanadeje.app.donors.domain.RefreshTokenRepository.recordSuccessor(java.util.UUID, java.util.UUID)",
                    "cz.novanadeje.app.donors.domain.RefreshTokenRepository.revokeIfUnused(java.util.UUID, java.time.Instant)",
                    "cz.novanadeje.app.donors.domain.RefreshTokenRepository.supersedeIfUnused(java.util.UUID, java.time.Instant)",
                    "cz.novanadeje.app.donors.domain.SecondFactorChallenge.<init>(java.util.UUID, cz.novanadeje.app.donors.domain.DonorId, java.lang.String, java.time.Instant, java.time.Instant, int, java.time.Instant)",
                    "cz.novanadeje.app.donors.domain.SecondFactorChallenge.id",
                    "cz.novanadeje.app.donors.domain.SecondFactorChallenge.id() returns",
                    "cz.novanadeje.app.donors.domain.SecondFactorChallenge.reconstitute(java.util.UUID, cz.novanadeje.app.donors.domain.DonorId, java.lang.String, java.time.Instant, java.time.Instant, int, java.time.Instant)",
                    "cz.novanadeje.app.donors.domain.SecondFactorChallengeRepository.markUsed(java.util.UUID, java.time.Instant)",
                    "cz.novanadeje.app.donors.domain.SecondFactorChallengeRepository.reserveAttempt(java.util.UUID, java.time.Instant, int)",
                    "cz.novanadeje.app.donors.domain.SecondFactorRecovery.<init>(java.util.UUID, cz.novanadeje.app.donors.domain.DonorId, java.lang.String, cz.novanadeje.app.shared.domain.SecondFactorRecoveryCode, java.time.Instant, java.time.Instant, java.time.Instant)",
                    "cz.novanadeje.app.donors.domain.SecondFactorRecovery.id",
                    "cz.novanadeje.app.donors.domain.SecondFactorRecovery.id() returns",
                    "cz.novanadeje.app.donors.domain.SecondFactorRecovery.reconstitute(java.util.UUID, cz.novanadeje.app.donors.domain.DonorId, java.lang.String, cz.novanadeje.app.shared.domain.SecondFactorRecoveryCode, java.time.Instant, java.time.Instant, java.time.Instant)",
                    "cz.novanadeje.app.donors.domain.SecondFactorRecoveryRepository.markUsed(java.util.UUID, java.time.Instant)"),
            declarations(OPERATIONS_REFERENCES,
                    "cz.novanadeje.app.operations.domain.backup.BackupKeyConfirmation.<init>(java.lang.String, java.time.Instant, java.util.Optional)",
                    "cz.novanadeje.app.operations.domain.backup.BackupKeyConfirmation.confirmedBy",
                    "cz.novanadeje.app.operations.domain.backup.BackupKeyConfirmation.confirmedBy() returns",
                    "cz.novanadeje.app.operations.domain.backup.BackupKeyConfirmation.of(cz.novanadeje.app.operations.domain.backup.BackupKey, java.time.Instant, java.util.Optional)",
                    "cz.novanadeje.app.operations.domain.backup.BackupRun.<init>(cz.novanadeje.app.operations.domain.backup.RunOutcome, java.time.Instant, java.time.Instant, java.util.Optional, java.util.Optional, java.util.Optional, java.util.Optional, java.util.Optional, java.util.Optional, java.util.Optional, java.util.Optional)",
                    "cz.novanadeje.app.operations.domain.backup.BackupRun.requestedBy",
                    "cz.novanadeje.app.operations.domain.backup.BackupRun.requestedBy() returns",
                    "cz.novanadeje.app.operations.domain.loggers.LogLevelOverride.<init>(cz.novanadeje.app.operations.domain.loggers.LoggerName, cz.novanadeje.app.operations.domain.loggers.LogLevel, java.util.Optional, java.time.Instant, java.time.Instant, java.util.UUID)",
                    "cz.novanadeje.app.operations.domain.loggers.LogLevelOverride.adminId",
                    "cz.novanadeje.app.operations.domain.loggers.LogLevelOverride.adminId() returns",
                    "cz.novanadeje.app.operations.domain.loggers.LogLevelOverride.forMinutes(cz.novanadeje.app.operations.domain.loggers.LoggerName, cz.novanadeje.app.operations.domain.loggers.LogLevel, java.util.Optional, java.time.Instant, int, java.util.UUID)",
                    "cz.novanadeje.app.operations.domain.push.DonorPushSubscription.<init>(cz.novanadeje.app.operations.domain.push.PushSubscriptionId, java.util.UUID, java.util.UUID, cz.novanadeje.app.operations.domain.push.PushEndpoint, cz.novanadeje.app.operations.domain.push.PushClientKeys, cz.novanadeje.app.operations.domain.push.DonorNotifications, java.time.Instant, java.util.Optional, int)",
                    "cz.novanadeje.app.operations.domain.push.DonorPushSubscription.belongsTo(java.util.UUID)",
                    "cz.novanadeje.app.operations.domain.push.DonorPushSubscription.deviceId",
                    "cz.novanadeje.app.operations.domain.push.DonorPushSubscription.deviceId() returns",
                    "cz.novanadeje.app.operations.domain.push.DonorPushSubscription.donorId",
                    "cz.novanadeje.app.operations.domain.push.DonorPushSubscription.donorId() returns",
                    "cz.novanadeje.app.operations.domain.push.DonorPushSubscription.subscribe(java.util.UUID, java.util.UUID, cz.novanadeje.app.operations.domain.push.PushEndpoint, cz.novanadeje.app.operations.domain.push.PushClientKeys, cz.novanadeje.app.operations.domain.push.DonorNotifications, java.time.Instant)",
                    "cz.novanadeje.app.operations.domain.push.DonorPushSubscriptionRepository.changeNotifications(java.util.UUID, java.util.UUID, cz.novanadeje.app.operations.domain.push.DonorNotifications)",
                    "cz.novanadeje.app.operations.domain.push.DonorPushSubscriptionRepository.deleteAllOf(java.util.UUID)",
                    "cz.novanadeje.app.operations.domain.push.DonorPushSubscriptionRepository.deleteAllOfDevice(java.util.UUID)",
                    "cz.novanadeje.app.operations.domain.push.DonorPushSubscriptionRepository.deleteByEndpointOrDevice(cz.novanadeje.app.operations.domain.push.PushEndpoint, java.util.UUID)",
                    "cz.novanadeje.app.operations.domain.push.DonorPushSubscriptionRepository.findAllOf(java.util.UUID)",
                    "cz.novanadeje.app.operations.domain.push.DonorPushSubscriptionRepository.findOfDevice(java.util.UUID, java.util.UUID)",
                    "cz.novanadeje.app.operations.domain.push.DonorPushSubscriptionRepository.findWithGiftNotificationsOf(java.util.Collection)",
                    "cz.novanadeje.app.operations.domain.push.DonorPushSubscriptionRepository.findWithYearlyReceiptNotificationsOf(java.util.Collection)",
                    "cz.novanadeje.app.operations.domain.push.PushSubscription.<init>(cz.novanadeje.app.operations.domain.push.PushSubscriptionId, java.util.UUID, java.util.UUID, cz.novanadeje.app.operations.domain.push.PushEndpoint, cz.novanadeje.app.operations.domain.push.PushClientKeys, cz.novanadeje.app.operations.domain.push.PushAlerts, java.time.Instant, java.util.Optional, int)",
                    "cz.novanadeje.app.operations.domain.push.PushSubscription.administratorId",
                    "cz.novanadeje.app.operations.domain.push.PushSubscription.administratorId() returns",
                    "cz.novanadeje.app.operations.domain.push.PushSubscription.belongsTo(java.util.UUID)",
                    "cz.novanadeje.app.operations.domain.push.PushSubscription.deviceId",
                    "cz.novanadeje.app.operations.domain.push.PushSubscription.deviceId() returns",
                    "cz.novanadeje.app.operations.domain.push.PushSubscription.subscribe(java.util.UUID, java.util.UUID, cz.novanadeje.app.operations.domain.push.PushEndpoint, cz.novanadeje.app.operations.domain.push.PushClientKeys, cz.novanadeje.app.operations.domain.push.PushAlerts, java.time.Instant)",
                    "cz.novanadeje.app.operations.domain.push.PushSubscriptionRepository.changeAlerts(cz.novanadeje.app.operations.domain.push.PushSubscriptionId, java.util.UUID, cz.novanadeje.app.operations.domain.push.PushAlerts)",
                    "cz.novanadeje.app.operations.domain.push.PushSubscriptionRepository.deleteAllOf(java.util.UUID)",
                    "cz.novanadeje.app.operations.domain.push.PushSubscriptionRepository.deleteAllOfDevice(java.util.UUID)",
                    "cz.novanadeje.app.operations.domain.push.PushSubscriptionRepository.deleteByEndpointOrDevice(cz.novanadeje.app.operations.domain.push.PushEndpoint, java.util.UUID)",
                    "cz.novanadeje.app.operations.domain.push.PushSubscriptionRepository.findAllOf(java.util.UUID)",
                    "cz.novanadeje.app.operations.domain.push.PushSubscriptionRepository.findByEndpointOrDevice(cz.novanadeje.app.operations.domain.push.PushEndpoint, java.util.UUID)")
    ).flatMap(Function.identity()).collect(Collectors.toUnmodifiableMap(Map.Entry::getKey, Map.Entry::getValue));

    private static Stream<Map.Entry<String, String>> declarations(String reason, String... subjects) {
        return Stream.of(subjects).map(subject -> entry(subject, reason));
    }

    @ArchTest
    static final ArchRule domain_classes_hold_ids_as_id_records = domainClassesHoldIdsAsIdRecords(RAW_UUID_DECLARATIONS.keySet());

    private static ArchRule domainClassesHoldIdsAsIdRecords(Set<String> declarationsApart) {
        return classes()
                .that().resideInAPackage("..domain..")
                .should(declareNoRawUuid(declarationsApart))
                .because("backend.md, Domain: ids are records over UUID, generated by UuidV7, so an id of one entity is never passed where "
                        + "another's is expected; an entity of another context is held as this context's own reference record (DonorReference), "
                        + "and application services and adapters convert at the boundary");
    }

    private static boolean isIdRecord(JavaClass type) {
        if (!type.isRecord() || !(type.getSimpleName().endsWith("Id") || type.getSimpleName().endsWith("Reference"))) {
            return false;
        }
        List<JavaField> components = type.getFields().stream().filter(field -> !field.getModifiers().contains(JavaModifier.STATIC)).toList();
        return components.size() == 1 && components.getFirst().getName().equals(ID_COMPONENT)
                && components.getFirst().getRawType().getName().equals(UUID_TYPE);
    }

    private static boolean isTheIdItself(JavaClass type, JavaMember member) {
        return isIdRecord(type) && switch (member) {
            case JavaField field -> field.getName().equals(ID_COMPONENT);
            case JavaCodeUnit unit -> unit.isMethod() && unit.getName().equals(ID_COMPONENT) && unit.getRawParameterTypes().isEmpty()
                    || unit.isConstructor() && unit.getRawParameterTypes().size() == 1
                    && unit.getRawParameterTypes().getFirst().getName().equals(UUID_TYPE);
            default -> false;
        };
    }

    private static ArchCondition<JavaClass> declareNoRawUuid(Set<String> declarationsApart) {
        return new ArchCondition<>("declare no supertype, type parameter, field, parameter or return type holding a raw java.util.UUID") {
            @Override
            public void check(JavaClass type, ConditionEvents events) {
                rawUuidDeclarations(type).stream()
                        .filter(declaration -> !declarationsApart.contains(declaration.subject()))
                        .forEach(declaration -> events.add(SimpleConditionEvent.violated(type, declaration.subject() + " " + declaration.what())));
            }
        };
    }

    record RawUuidDeclaration(String subject, String what) {
    }

    static List<RawUuidDeclaration> rawUuidDeclarations(JavaClass type) {
        List<RawUuidDeclaration> found = new ArrayList<>();
        Stream.concat(type.getSuperclass().stream(), type.getInterfaces().stream())
                .filter(DomainIdRulesTest::mentionsUuid)
                .forEach(supertype -> found.add(new RawUuidDeclaration(type.getName() + " extends " + supertype.getName(), "names a raw UUID")));
        type.getTypeParameters().stream()
                .filter(variable -> variable.getUpperBounds().stream().anyMatch(DomainIdRulesTest::mentionsUuid))
                .forEach(variable -> found.add(new RawUuidDeclaration(type.getName() + "<" + variable.getName() + ">", "is bounded by a raw UUID")));
        type.getFields().stream()
                .filter(DomainIdRulesTest::writtenInSource)
                .filter(field -> !isTheIdItself(type, field))
                .filter(field -> mentionsUuid(field.getType()))
                .forEach(field -> found.add(new RawUuidDeclaration(field.getFullName(), "holds a raw UUID")));
        type.getCodeUnits().stream()
                .filter(DomainIdRulesTest::writtenInSource)
                .filter(unit -> !(unit.isConstructor() && type.isAnonymousClass()))
                .filter(unit -> !isTheIdItself(type, unit))
                .forEach(unit -> {
                    unit.getTypeParameters().stream()
                            .filter(variable -> variable.getUpperBounds().stream().anyMatch(DomainIdRulesTest::mentionsUuid))
                            .forEach(variable -> found.add(new RawUuidDeclaration(unit.getFullName(), "is bounded by a raw UUID in " + variable.getName())));
                    unit.getParameterTypes().stream().filter(DomainIdRulesTest::mentionsUuid).findFirst()
                            .ifPresent(parameter -> found.add(new RawUuidDeclaration(unit.getFullName(), "takes a raw UUID in " + parameter.getName())));
                    if (unit.isMethod() && mentionsUuid(unit.getReturnType())) {
                        found.add(new RawUuidDeclaration(unit.getFullName() + " returns", "answers a raw UUID in " + unit.getReturnType().getName()));
                    }
                });
        return found;
    }

    private static boolean writtenInSource(JavaMember member) {
        return !member.getModifiers().contains(JavaModifier.SYNTHETIC);
    }

    private static boolean mentionsUuid(JavaType type) {
        return mentionsUuid(type, new HashSet<>());
    }

    private static boolean mentionsUuid(JavaType type, Set<JavaTypeVariable<?>> lookedVariables) {
        return switch (type) {
            case JavaClass raw -> raw.getBaseComponentType().getName().equals(UUID_TYPE);
            case JavaParameterizedType parameterized -> parameterized.getActualTypeArguments().stream().anyMatch(argument -> mentionsUuid(argument, lookedVariables));
            case JavaWildcardType wildcard -> wildcard.getUpperBounds().stream().anyMatch(bound -> mentionsUuid(bound, lookedVariables))
                    || wildcard.getLowerBounds().stream().anyMatch(bound -> mentionsUuid(bound, lookedVariables));
            case JavaTypeVariable<?> variable -> lookedVariables.add(variable)
                    && variable.getUpperBounds().stream().anyMatch(bound -> mentionsUuid(bound, lookedVariables));
            case JavaGenericArrayType array -> mentionsUuid(array.getComponentType(), lookedVariables);
            default -> false;
        };
    }

    static Set<String> staleOrMissingDeclarations(JavaClasses classes, Set<String> listed) {
        Set<String> reported = classes.stream().filter(type -> type.getPackageName().contains(".domain"))
                .flatMap(type -> rawUuidDeclarations(type).stream()).map(RawUuidDeclaration::subject).collect(Collectors.toSet());
        Set<String> difference = new TreeSet<>(listed);
        difference.removeAll(reported);
        return difference;
    }

    @Test
    @DisplayName("Given the listed raw UUID declarations, when the site is read, then each is still declared there, so the list names no declaration that is gone or fixed")
    void should_find_every_listed_declaration_when_read_given_the_site() {
        JavaClasses site = new ClassFileImporter().withImportOption(new ImportOption.DoNotIncludeTests()).importPackagesOf(AppApplication.class);

        assertThat(staleOrMissingDeclarations(site, RAW_UUID_DECLARATIONS.keySet())).isEmpty();
    }

    @Test
    @DisplayName("Given a listed declaration that a planted class no longer has, when the list is checked against the planted class, then that declaration is named and one still declared is not")
    void should_name_a_listed_declaration_that_is_gone_when_checked_given_a_planted_class(@TempDir Path folder) throws IOException {
        JavaClasses planted = PlantedClasses.compiled(folder, Map.of("cz.novanadeje.app.plantedu.domain.PlantedToken", """
                package cz.novanadeje.app.plantedu.domain;

                import java.util.UUID;
import java.util.function.Function;

                public class PlantedToken {

                    private UUID successor;
                }
                """));

        assertThat(staleOrMissingDeclarations(planted, Set.of("cz.novanadeje.app.plantedu.domain.PlantedToken.successor",
                "cz.novanadeje.app.plantedu.domain.PlantedToken.markUsed(java.util.UUID)")))
                .containsExactly("cz.novanadeje.app.plantedu.domain.PlantedToken.markUsed(java.util.UUID)");
    }

    @Test
    @DisplayName("Given planted domain classes holding a UUID in a field, a record component, a constructor and a method parameter, a return type, a generic type, an optional, an array, a generic array, an upper and a lower wildcard, a type variable's bound, a supertype's type argument and a class's type parameter, a record of one UUID that is no id, one whose component is even called value, members of an id record beside its own value and a single UUID field of a class, beside id records, a local UUID captured by a lambda and an anonymous class, a recursive bound and the same shapes outside the domain, when the rule checks them, then exactly the declarations written in the domain are reported")
    void should_report_every_raw_uuid_declared_in_the_domain_when_checked_given_planted_classes(@TempDir Path folder) throws IOException {
        JavaClasses planted = PlantedClasses.compiled(folder, Map.ofEntries(
                entry("cz.novanadeje.app.plantedu.domain.PlantedHolder", """
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

                            public void upper(Collection<? extends UUID> values) {
                            }

                            public void lower(Comparator<? super UUID> order) {
                            }

                            public <T extends UUID> T first(List<T> values) {
                                return values.getFirst();
                            }

                            public <T extends Comparable<T>> void sort(List<T> values) {
                            }

                            public String text() {
                                UUID local = id.value();
                                Supplier<String> later = () -> local.toString();
                                Supplier<String> anonymous = new Supplier<>() {
                                    @Override
                                    public String get() {
                                        return local.toString();
                                    }
                                };
                                return later.get() + anonymous.get();
                            }

                            public PlantedId id() {
                                return id;
                            }
                        }
                        """),
                entry("cz.novanadeje.app.plantedu.domain.PlantedId", """
                        package cz.novanadeje.app.plantedu.domain;

                        import java.util.UUID;

                        public record PlantedId(UUID value) {

                            static final PlantedId NONE = new PlantedId(new UUID(0, 0));

                            public static PlantedId of(String value) {
                                return new PlantedId(UUID.fromString(value));
                            }
                        }
                        """),
                entry("cz.novanadeje.app.plantedu.domain.PlantedTokenId", """
                        package cz.novanadeje.app.plantedu.domain;

                        import java.util.UUID;

                        public record PlantedTokenId(UUID value) {

                            public UUID successor() {
                                return value;
                            }

                            public boolean sameAs(UUID other) {
                                return value.equals(other);
                            }
                        }
                        """),
                entry("cz.novanadeje.app.plantedu.domain.TokenRevoked", """
                        package cz.novanadeje.app.plantedu.domain;

                        import java.util.UUID;

                        public record TokenRevoked(UUID tokenId) {
                        }
                        """),
                entry("cz.novanadeje.app.plantedu.domain.PlantedRevoked", """
                        package cz.novanadeje.app.plantedu.domain;

                        import java.util.UUID;

                        public record PlantedRevoked(UUID value) {
                        }
                        """),
                entry("cz.novanadeje.app.plantedu.domain.PlantedPair", """
                        package cz.novanadeje.app.plantedu.domain;

                        import java.util.UUID;

                        public record PlantedPair(UUID first, PlantedId second) {
                        }
                        """),
                entry("cz.novanadeje.app.plantedu.domain.PlantedPort", """
                        package cz.novanadeje.app.plantedu.domain;

                        import java.util.UUID;

                        public interface PlantedPort {

                            boolean markUsed(UUID tokenId);

                            boolean markUsed(PlantedId tokenId);
                        }
                        """),
                entry("cz.novanadeje.app.plantedu.domain.PlantedOutbox", """
                        package cz.novanadeje.app.plantedu.domain;

                        public interface PlantedOutbox<I> {

                            void markSent(I id);
                        }
                        """),
                entry("cz.novanadeje.app.plantedu.domain.PlantedAlertOutbox", """
                        package cz.novanadeje.app.plantedu.domain;

                        public interface PlantedAlertOutbox extends PlantedOutbox<java.util.UUID> {
                        }
                        """),
                entry("cz.novanadeje.app.plantedu.domain.PlantedRawSupplier", """
                        package cz.novanadeje.app.plantedu.domain;

                        public interface PlantedRawSupplier extends java.util.function.Supplier<java.util.UUID> {
                        }
                        """),
                entry("cz.novanadeje.app.plantedu.domain.PlantedBounded", """
                        package cz.novanadeje.app.plantedu.domain;

                        public class PlantedBounded<T extends java.util.UUID> {
                        }
                        """),
                entry("cz.novanadeje.app.plantedu.domain.PlantedWrapper", """
                        package cz.novanadeje.app.plantedu.domain;

                        import java.util.UUID;

                        public final class PlantedWrapper {

                            private final UUID value = UUID.randomUUID();
                        }
                        """),
                entry("cz.novanadeje.app.plantedu.application.PlantedView", """
                        package cz.novanadeje.app.plantedu.application;

                        import java.util.UUID;

                        public record PlantedView(UUID id, String name) {
                        }
                        """),
                entry("cz.novanadeje.app.plantedu.infrastructure.PlantedColumn", """
                        package cz.novanadeje.app.plantedu.infrastructure;

                        import java.util.UUID;

                        class PlantedColumn {

                            private UUID id;

                            UUID id() {
                                return id;
                            }
                        }
                        """)));

        List<String> details = domainClassesHoldIdsAsIdRecords(Set.of()).evaluate(planted).getFailureReport().getDetails();

        assertThat(details)
                .hasSize(29)
                .anySatisfy(detail -> assertThat(detail).startsWith("cz.novanadeje.app.plantedu.domain.PlantedHolder.field holds"))
                .anySatisfy(detail -> assertThat(detail).startsWith("cz.novanadeje.app.plantedu.domain.PlantedHolder.nested holds"))
                .anySatisfy(detail -> assertThat(detail).startsWith("cz.novanadeje.app.plantedu.domain.PlantedHolder.grid holds"))
                .anySatisfy(detail -> assertThat(detail).startsWith("cz.novanadeje.app.plantedu.domain.PlantedHolder.<init>(java.util.UUID, "))
                .anySatisfy(detail -> assertThat(detail).startsWith("cz.novanadeje.app.plantedu.domain.PlantedHolder.take(java.util.UUID) takes"))
                .anySatisfy(detail -> assertThat(detail).startsWith("cz.novanadeje.app.plantedu.domain.PlantedHolder.answer() returns"))
                .anySatisfy(detail -> assertThat(detail).startsWith("cz.novanadeje.app.plantedu.domain.PlantedHolder.maybe() returns"))
                .anySatisfy(detail -> assertThat(detail).startsWith("cz.novanadeje.app.plantedu.domain.PlantedHolder.spread([Ljava.util.List;) takes"))
                .anySatisfy(detail -> assertThat(detail).startsWith("cz.novanadeje.app.plantedu.domain.PlantedHolder.upper(java.util.Collection) takes"))
                .anySatisfy(detail -> assertThat(detail).startsWith("cz.novanadeje.app.plantedu.domain.PlantedHolder.lower(java.util.Comparator) takes"))
                .anySatisfy(detail -> assertThat(detail).startsWith("cz.novanadeje.app.plantedu.domain.PlantedHolder.first(java.util.List) takes"))
                .anySatisfy(detail -> assertThat(detail).startsWith("cz.novanadeje.app.plantedu.domain.PlantedHolder.first(java.util.List) returns"))
                .anySatisfy(detail -> assertThat(detail).startsWith("cz.novanadeje.app.plantedu.domain.PlantedHolder.first(java.util.List) is bounded"))
                .anySatisfy(detail -> assertThat(detail).startsWith("cz.novanadeje.app.plantedu.domain.PlantedPair.first holds"))
                .anySatisfy(detail -> assertThat(detail).startsWith("cz.novanadeje.app.plantedu.domain.PlantedPair.<init>(java.util.UUID, "))
                .anySatisfy(detail -> assertThat(detail).startsWith("cz.novanadeje.app.plantedu.domain.PlantedPair.first() returns"))
                .anySatisfy(detail -> assertThat(detail).startsWith("cz.novanadeje.app.plantedu.domain.PlantedPort.markUsed(java.util.UUID) takes"))
                .anySatisfy(detail -> assertThat(detail).startsWith("cz.novanadeje.app.plantedu.domain.TokenRevoked.tokenId holds"))
                .anySatisfy(detail -> assertThat(detail).startsWith("cz.novanadeje.app.plantedu.domain.TokenRevoked.<init>(java.util.UUID) takes"))
                .anySatisfy(detail -> assertThat(detail).startsWith("cz.novanadeje.app.plantedu.domain.TokenRevoked.tokenId() returns"))
                .anySatisfy(detail -> assertThat(detail).startsWith("cz.novanadeje.app.plantedu.domain.PlantedRevoked.value holds"))
                .anySatisfy(detail -> assertThat(detail).startsWith("cz.novanadeje.app.plantedu.domain.PlantedRevoked.<init>(java.util.UUID) takes"))
                .anySatisfy(detail -> assertThat(detail).startsWith("cz.novanadeje.app.plantedu.domain.PlantedRevoked.value() returns"))
                .anySatisfy(detail -> assertThat(detail).startsWith("cz.novanadeje.app.plantedu.domain.PlantedTokenId.successor() returns"))
                .anySatisfy(detail -> assertThat(detail).startsWith("cz.novanadeje.app.plantedu.domain.PlantedTokenId.sameAs(java.util.UUID) takes"))
                .anySatisfy(detail -> assertThat(detail).startsWith("cz.novanadeje.app.plantedu.domain.PlantedAlertOutbox extends"))
                .anySatisfy(detail -> assertThat(detail).startsWith("cz.novanadeje.app.plantedu.domain.PlantedRawSupplier extends"))
                .anySatisfy(detail -> assertThat(detail).startsWith("cz.novanadeje.app.plantedu.domain.PlantedBounded<T> is bounded"))
                .anySatisfy(detail -> assertThat(detail).startsWith("cz.novanadeje.app.plantedu.domain.PlantedWrapper.value holds"))
                .noneSatisfy(detail -> assertThat(detail).startsWith("cz.novanadeje.app.plantedu.domain.PlantedId."))
                .noneSatisfy(detail -> assertThat(detail).contains("PlantedTokenId.value"))
                .noneSatisfy(detail -> assertThat(detail).contains("PlantedTokenId.<init>"))
                .noneSatisfy(detail -> assertThat(detail).contains("text()"))
                .noneSatisfy(detail -> assertThat(detail).contains("sort("))
                .noneSatisfy(detail -> assertThat(detail).contains("$1"))
                .noneSatisfy(detail -> assertThat(detail).contains("lambda$"))
                .noneSatisfy(detail -> assertThat(detail).contains("PlantedOutbox.markSent"))
                .noneSatisfy(detail -> assertThat(detail).contains("plantedu.application"))
                .noneSatisfy(detail -> assertThat(detail).contains("plantedu.infrastructure"));
    }
}
