package cz.novanadeje.app.architecture;

import com.tngtech.archunit.base.DescribedPredicate;
import com.tngtech.archunit.core.domain.AccessTarget.CodeUnitAccessTarget;
import com.tngtech.archunit.core.domain.AccessTarget.ConstructorCallTarget;
import com.tngtech.archunit.core.domain.AccessTarget.ConstructorReferenceTarget;
import com.tngtech.archunit.core.domain.JavaAccess;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.domain.JavaConstructor;
import com.tngtech.archunit.core.domain.JavaFieldAccess;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;
import cz.novanadeje.app.AppApplication;
import cz.novanadeje.app.donors.application.CredentialChanges;
import cz.novanadeje.app.donors.application.DeviceSignOuts;
import cz.novanadeje.app.donors.domain.DeviceSignOutReason;
import cz.novanadeje.app.donors.domain.DonorDevice;
import cz.novanadeje.app.donors.domain.DonorDeviceRepository;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.RefreshTokenRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.nio.file.Path;
import java.time.Instant;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.BiConsumer;
import java.util.function.Consumer;
import java.util.stream.Collectors;

import static com.tngtech.archunit.base.DescribedPredicate.not;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static cz.novanadeje.app.architecture.MethodAccesses.callsOrReferences;
import static org.assertj.core.api.Assertions.assertThat;

@AnalyzeClasses(
        packagesOf = AppApplication.class,
        importOptions = ImportOption.DoNotIncludeTests.class
)
class DeviceSignOutRulesTest {

    private static final Set<String> SIGN_OUTS = Set.of("revokeAllOf", "revokeAllOfDevice", "revokeDevicelessBrowserTokensOf");
    private static final String LOCK_ALL = "lockAllOf";
    private static final Set<String> DEVICE_ENDINGS = Set.of("endIfActive", "directWipe", "directWipeOfDonor", "reduceErasedOf");

    private static final Set<String> DEVICE_END_STATE = Set.of("endedAt", "endReason", "wipe");

    private static final String REBUILD = "reconstitute";
    private static final Set<String> DEVICE_FACTORIES = Set.of("signIn", REBUILD);

    private static final String PERSISTENCE = "cz.novanadeje.app.donors.infrastructure.persistence.";
    private static final String DEVICE_ENTITY = PERSISTENCE + "DonorDeviceJpaEntity";
    private static final String DEVICE_ENTITY_MAPPING = "toDomain";
    private static final String TOKEN_ADAPTER = PERSISTENCE + "JpaRefreshTokenRepository";
    private static final String DEVICE_ADAPTER = PERSISTENCE + "JpaDonorDeviceRepository";
    private static final String TOKEN_ROWS = PERSISTENCE + "RefreshTokenJpaRepository";
    private static final String DEVICE_ROWS = PERSISTENCE + "DonorDeviceJpaRepository";
    private static final String LOCK_ALL_ROWS = "lockAllOfInIdOrder";

    private static final DescribedPredicate<JavaAccess<?>> AN_END_OR_A_WIPE_ORDER_OF_THE_DEVICE_REPOSITORY = callsOrReferences(
            "an end of a device or an order to delete its copy in " + DonorDeviceRepository.class.getSimpleName(), DonorDeviceRepository.class, DEVICE_ENDINGS::contains);

    private static final DescribedPredicate<JavaAccess<?>> A_SIGN_OUT_OF_THE_TOKEN_REPOSITORY = callsOrReferences(
            "a revocation of every token of a donor or a device in " + RefreshTokenRepository.class.getSimpleName(), RefreshTokenRepository.class, SIGN_OUTS::contains);

    private static final DescribedPredicate<JavaAccess<?>> A_LOCK_OF_EVERY_TOKEN_OF_A_DONOR = callsOrReferences(
            "a lock of every token of a donor in " + RefreshTokenRepository.class.getSimpleName(), RefreshTokenRepository.class, LOCK_ALL::equals);

    private static final DescribedPredicate<JavaAccess<?>> A_SIGN_OUT_LOCK_OR_END_OF_THE_ROWS = callsOrReferences("", TOKEN_ROWS, SIGN_OUTS::contains)
            .or(callsOrReferences("", TOKEN_ROWS, LOCK_ALL_ROWS::equals))
            .or(callsOrReferences("", DEVICE_ROWS, DEVICE_ENDINGS::contains))
            .as("a revocation, lock or end of the token and device rows through Spring Data");

    private static final DescribedPredicate<JavaAccess<?>> FROM_THE_MATCHING_ADAPTER_METHOD = DescribedPredicate.describe(
            "from the adapter method of the same name", access -> fromTheTokenAdapter(access) || fromTheDeviceAdapter(access));

    private static final DescribedPredicate<JavaFieldAccess> A_WRITE_OF_THE_END_STATE_OF_A_DEVICE_OUTSIDE_ITS_CONSTRUCTION = DescribedPredicate.describe(
            "a write of " + DonorDevice.class.getSimpleName() + "'s " + String.join(", ", DEVICE_END_STATE.stream().sorted().toList())
                    + " outside its own constructor",
            access -> writesTheEndStateOfADevice(access) && !fromTheConstructorOfADevice(access));

    private static final DescribedPredicate<JavaAccess<?>> A_DEVICE_BUILT_OUTSIDE_ITS_FACTORIES_AND_ITS_STORED_ROW = DescribedPredicate.describe(
            "a construction of " + DonorDevice.class.getSimpleName() + " outside its own " + String.join(" and ", DEVICE_FACTORIES.stream().sorted().toList())
                    + ", or its " + REBUILD + " outside " + DEVICE_ENTITY.substring(PERSISTENCE.length()) + "." + DEVICE_ENTITY_MAPPING,
            access -> buildsADevice(access) && !fromAFactoryOfTheDevice(access) && !rebuildsTheStoredRow(access));

    @ArchTest
    static final ArchRule a_device_is_rebuilt_with_its_end_only_from_its_stored_row = noClasses()
            .should().accessTargetWhere(A_DEVICE_BUILT_OUTSIDE_ITS_FACTORIES_AND_ITS_STORED_ROW)
            .because("a device rebuilt with an end it does not have in the database and saved keeps its row active, since the adapter maps the end"
                    + " columns updatable = false: the device stays signed in, no token is revoked and no DeviceSignedOut is published"
                    + " (architecture audit #621)");

    @ArchTest
    static final ArchRule a_device_ends_only_through_its_repository_never_in_memory = noClasses()
            .should().setFieldWhere(A_WRITE_OF_THE_END_STATE_OF_A_DEVICE_OUTSIDE_ITS_CONSTRUCTION)
            .because("the adapter maps these columns updatable = false and ends a device only by a conditional update, so an end set in memory"
                    + " and saved is silently dropped: the device stays signed in, no token is revoked and no DeviceSignedOut is published"
                    + " (architecture audit #621)");

    @ArchTest
    static final ArchRule every_session_of_a_donor_or_a_device_ends_only_through_the_device_sign_outs = noClasses()
            .that().doNotHaveFullyQualifiedName(DeviceSignOuts.class.getName())
            .should().accessTargetWhere(A_SIGN_OUT_OF_THE_TOKEN_REPOSITORY)
            .because("ending sessions must also end the devices and tell the access token check at once (plan v3, slice 2.9)");

    @ArchTest
    static final ArchRule every_token_of_a_donor_is_locked_only_through_the_device_sign_outs = noClasses()
            .that().doNotHaveFullyQualifiedName(DeviceSignOuts.class.getName())
            .should().accessTargetWhere(A_LOCK_OF_EVERY_TOKEN_OF_A_DONOR)
            .because("the device sign-outs take the donor's sessions lock before they lock the donor's tokens, so two of them never deadlock (database audit #453)");

    @ArchTest
    static final ArchRule devices_end_and_get_orders_to_delete_only_through_the_device_sign_outs = noClasses()
            .that().doNotHaveFullyQualifiedName(DeviceSignOuts.class.getName())
            .should().accessTargetWhere(AN_END_OR_A_WIPE_ORDER_OF_THE_DEVICE_REPOSITORY)
            .because("only a sign-out from another device, an erasure or a role removal may order a device to delete its copy, never a replay (plan v3, slice 2.11, D28)");

    @ArchTest
    static final ArchRule the_rows_of_tokens_and_devices_are_signed_out_only_by_their_adapters = noClasses()
            .should().accessTargetWhere(A_SIGN_OUT_LOCK_OR_END_OF_THE_ROWS.and(not(FROM_THE_MATCHING_ADAPTER_METHOD)))
            .because("the adapters' sign-outs are reached only from the device sign-outs, so no other method may reach the same rows through Spring Data");

    @ArchTest
    static final ArchRule sessions_end_for_changed_credentials_only_through_the_credential_changes = noClasses()
            .that().doNotHaveFullyQualifiedName(CredentialChanges.class.getName())
            .and().doNotBelongToAnyOf(DeviceSignOutReason.class)
            .should().accessField(DeviceSignOutReason.class, DeviceSignOutReason.CREDENTIALS_CHANGED.name())
            .because("a change of the credentials also spends the donor's pending e-mail change and password reset links, so a link sent before the change cannot undo it (security audit 2026-11-14)");

    @Test
    @DisplayName("Given the guarded names, when the repositories, the adapters and the Spring Data repositories are read, then each exists, so no rule watches a name that is gone")
    void should_find_every_guarded_name_when_read_given_the_repositories() throws ClassNotFoundException {
        assertThat(methodNamesOf(RefreshTokenRepository.class)).containsAll(SIGN_OUTS).contains(LOCK_ALL);
        assertThat(methodNamesOf(DonorDeviceRepository.class)).containsAll(DEVICE_ENDINGS);
        assertThat(methodNamesOf(Class.forName(TOKEN_ROWS))).containsAll(SIGN_OUTS).contains(LOCK_ALL_ROWS);
        assertThat(methodNamesOf(Class.forName(DEVICE_ROWS))).containsAll(DEVICE_ENDINGS);
        assertThat(Class.forName(TOKEN_ADAPTER)).isAssignableTo(RefreshTokenRepository.class);
        assertThat(Class.forName(DEVICE_ADAPTER)).isAssignableTo(DonorDeviceRepository.class);
    }

    @Test
    @DisplayName("Given the device's end state, when the device is read, then it declares each guarded field, so the rule watches no name that is gone")
    void should_declare_every_guarded_field_when_read_given_the_device() {
        assertThat(Arrays.stream(DonorDevice.class.getDeclaredFields()).map(Field::getName)).containsAll(DEVICE_END_STATE);
    }

    @Test
    @DisplayName("Given the device's factories and its stored row, when they are read, then each named method exists, so the rule exempts no name that is gone")
    void should_find_every_exempted_method_when_read_given_the_device_and_its_row() throws ClassNotFoundException {
        assertThat(Arrays.stream(DonorDevice.class.getDeclaredMethods()).map(Method::getName)).containsAll(DEVICE_FACTORIES);
        assertThat(Arrays.stream(Class.forName(DEVICE_ENTITY).getDeclaredMethods()).map(Method::getName)).contains(DEVICE_ENTITY_MAPPING);
    }

    private static boolean writesTheEndStateOfADevice(JavaFieldAccess access) {
        return access.getTargetOwner().getName().equals(DonorDevice.class.getName()) && DEVICE_END_STATE.contains(access.getTarget().getName());
    }

    private static boolean fromTheConstructorOfADevice(JavaFieldAccess access) {
        return access.getOrigin() instanceof JavaConstructor && access.getOriginOwner().getName().equals(DonorDevice.class.getName());
    }

    private static boolean buildsADevice(JavaAccess<?> access) {
        return access.getTargetOwner().getName().equals(DonorDevice.class.getName())
                && (access.getTarget() instanceof ConstructorCallTarget || access.getTarget() instanceof ConstructorReferenceTarget
                || access.getTarget() instanceof CodeUnitAccessTarget target && REBUILD.equals(target.getName()));
    }

    private static boolean fromAFactoryOfTheDevice(JavaAccess<?> access) {
        return access.getOriginOwner().getName().equals(DonorDevice.class.getName()) && DEVICE_FACTORIES.contains(access.getOrigin().getName())
                && (access.getTarget() instanceof ConstructorCallTarget || access.getTarget() instanceof ConstructorReferenceTarget);
    }

    private static boolean rebuildsTheStoredRow(JavaAccess<?> access) {
        return access.getOriginOwner().getName().equals(DEVICE_ENTITY) && DEVICE_ENTITY_MAPPING.equals(access.getOrigin().getName())
                && REBUILD.equals(access.getTarget().getName());
    }

    private static boolean fromTheTokenAdapter(JavaAccess<?> access) {
        String method = access.getOrigin().getName();
        return access.getOriginOwner().getName().equals(TOKEN_ADAPTER) && (SIGN_OUTS.contains(method) || LOCK_ALL.equals(method));
    }

    private static boolean fromTheDeviceAdapter(JavaAccess<?> access) {
        return access.getOriginOwner().getName().equals(DEVICE_ADAPTER) && DEVICE_ENDINGS.contains(access.getOrigin().getName());
    }

    private static Set<String> methodNamesOf(Class<?> type) {
        return Arrays.stream(type.getMethods()).map(Method::getName).collect(Collectors.toSet());
    }

    @Nested
    @DisplayName("Given planted classes that end sessions or devices themselves")
    class GivenPlantedSignOuts {

        @Test
        @DisplayName("when the rules check method references to the guarded repository methods, then each is reported")
        void should_report_every_method_reference_when_checked_given_a_planted_class() {
            JavaClasses planted = new ClassFileImporter().importClasses(PlantedReferences.class);

            assertThat(every_session_of_a_donor_or_a_device_ends_only_through_the_device_sign_outs.evaluate(planted).getFailureReport().getDetails())
                    .singleElement().asString().contains("revokeAllOf");
            assertThat(every_token_of_a_donor_is_locked_only_through_the_device_sign_outs.evaluate(planted).getFailureReport().getDetails())
                    .singleElement().asString().contains("lockAllOf");
            assertThat(devices_end_and_get_orders_to_delete_only_through_the_device_sign_outs.evaluate(planted).getFailureReport().getDetails())
                    .singleElement().asString().contains("reduceErasedOf");
        }

        @Test
        @DisplayName("when the rules check a class that ends sessions for changed credentials itself, then it is reported")
        void should_report_sign_out_for_changed_credentials_when_checked_given_a_planted_class() {
            JavaClasses planted = new ClassFileImporter().importClasses(PlantedCredentialChange.class);

            assertThat(sessions_end_for_changed_credentials_only_through_the_credential_changes.evaluate(planted).getFailureReport().getDetails())
                    .singleElement().asString().contains("PlantedCredentialChange");
        }

        @Test
        @DisplayName("when the rules check a decorator of the token repository, then its sign-out is reported like any other")
        void should_report_sign_out_when_checked_given_a_decorator_of_the_repository() {
            JavaClasses planted = new ClassFileImporter().importClasses(PlantedDecorator.class);

            assertThat(every_session_of_a_donor_or_a_device_ends_only_through_the_device_sign_outs.evaluate(planted).getFailureReport().getDetails())
                    .singleElement().asString().contains("PlantedDecorator");
        }

        @Test
        @DisplayName("when the rules check a class beside the adapters that uses the Spring Data rows, then its sign-out is reported")
        void should_report_sign_out_when_checked_given_a_class_beside_the_adapters(@TempDir Path folder) throws IOException {
            JavaClasses planted = PlantedClasses.compiled(folder, Map.of(PERSISTENCE + "PlantedDonorRows", """
                    package cz.novanadeje.app.donors.infrastructure.persistence;

                    import java.time.Instant;
                    import java.util.UUID;

                    class PlantedDonorRows {

                        void signOut(RefreshTokenJpaRepository tokens, UUID donor) {
                            tokens.revokeAllOf(donor, Instant.EPOCH);
                        }
                    }
                    """));

            assertThat(the_rows_of_tokens_and_devices_are_signed_out_only_by_their_adapters.evaluate(planted).getFailureReport().getDetails())
                    .singleElement().asString().contains("PlantedDonorRows");
        }
    }

    @Nested
    @DisplayName("Given a planted device that ends itself in memory")
    class GivenAPlantedDeviceThatEndsItself {

        @Test
        @DisplayName("when the rule checks it, then each method writing an end field is reported and neither the constructor nor the recorded use is")
        void should_report_each_end_field_write_and_neither_the_constructor_nor_the_use_when_checked_given_a_planted_device(@TempDir Path folder)
                throws IOException {
            JavaClasses planted = PlantedClasses.compiled(folder, Map.of(DonorDevice.class.getName(), """
                    package cz.novanadeje.app.donors.domain;

                    import java.time.Instant;

                    public final class DonorDevice {

                        private Instant lastUsedAt;
                        private Instant endedAt;
                        private DeviceSignOutReason endReason;
                        private DeviceWipe wipe;

                        public DonorDevice(Instant at, Instant endedAt, DeviceSignOutReason endReason, DeviceWipe wipe) {
                            this.lastUsedAt = at;
                            this.endedAt = endedAt;
                            this.endReason = endReason;
                            this.wipe = wipe;
                        }

                        public void recordUse(Instant at) {
                            lastUsedAt = at;
                        }

                        void endAt(Instant at) {
                            endedAt = at;
                        }

                        void endFor(DeviceSignOutReason reason) {
                            endReason = reason;
                        }

                        void orderWipe(DeviceWipe order) {
                            wipe = order;
                        }

                        static final class Ender {

                            Ender(DonorDevice device, Instant at) {
                                device.endedAt = at;
                            }
                        }
                    }
                    """));

            assertThat(a_device_ends_only_through_its_repository_never_in_memory.evaluate(planted).getFailureReport().getDetails())
                    .hasSize(4)
                    .anySatisfy(line -> assertThat(line).contains("endAt(").contains("endedAt"))
                    .anySatisfy(line -> assertThat(line).contains("endFor(").contains("endReason"))
                    .anySatisfy(line -> assertThat(line).contains("orderWipe(").contains("wipe"))
                    .anySatisfy(line -> assertThat(line).contains("DonorDevice$Ender.<init>(").contains("endedAt"))
                    .noneSatisfy(line -> assertThat(line).contains("lastUsedAt"))
                    .noneSatisfy(line -> assertThat(line).contains("DonorDevice.<init>("));
        }
    }

    @Nested
    @DisplayName("Given planted classes that build a device outside its factories and its stored row")
    class GivenPlantedDeviceBuilders {

        @Test
        @DisplayName("when the rule checks them, then each construction and rebuild outside the factories and the row's mapping is reported and those are not")
        void should_report_each_build_outside_the_factories_and_the_mapping_when_checked_given_planted_builders(@TempDir Path folder) throws IOException {
            JavaClasses planted = PlantedClasses.compiled(folder, Map.of(
                    DonorDevice.class.getName(), """
                            package cz.novanadeje.app.donors.domain;

                            import java.time.Instant;
                            import java.util.function.Function;

                            public final class DonorDevice {

                                private final Instant endedAt;

                                public DonorDevice(Instant endedAt) {
                                    this.endedAt = endedAt;
                                }

                                public static DonorDevice signIn(Instant at) {
                                    return new DonorDevice(null);
                                }

                                public static DonorDevice reconstitute(Instant endedAt) {
                                    return new DonorDevice(endedAt);
                                }

                                static DonorDevice signIn(Instant at, boolean ended) {
                                    return reconstitute(at);
                                }

                                DonorDevice copy() {
                                    return new DonorDevice(endedAt);
                                }

                                static Function<Instant, DonorDevice> maker() {
                                    return DonorDevice::new;
                                }

                                static final class Copier {

                                    static DonorDevice signIn(Instant at) {
                                        return new DonorDevice(at);
                                    }
                                }
                            }
                            """,
                    "cz.novanadeje.app.donors.application.PlantedDeviceEnding", """
                            package cz.novanadeje.app.donors.application;

                            import cz.novanadeje.app.donors.domain.DonorDevice;

                            import java.time.Instant;
                            import java.util.function.Function;

                            class PlantedDeviceEnding {

                                DonorDevice toDomain(Instant at) {
                                    return DonorDevice.reconstitute(at);
                                }

                                Function<Instant, DonorDevice> ender() {
                                    return DonorDevice::reconstitute;
                                }
                            }
                            """,
                    DEVICE_ENTITY, """
                            package cz.novanadeje.app.donors.infrastructure.persistence;

                            import cz.novanadeje.app.donors.domain.DonorDevice;

                            import java.time.Instant;

                            class DonorDeviceJpaEntity {

                                private Instant endedAt;

                                DonorDevice toDomain() {
                                    return DonorDevice.reconstitute(endedAt);
                                }

                                DonorDevice endedCopy(Instant at) {
                                    return DonorDevice.reconstitute(at);
                                }

                                DonorDevice toDomain(Instant at) {
                                    DonorDevice built = new DonorDevice(at);
                                    return built;
                                }
                            }
                            """));

            assertThat(a_device_is_rebuilt_with_its_end_only_from_its_stored_row.evaluate(planted).getFailureReport().getDetails())
                    .hasSize(8)
                    .anySatisfy(line -> assertThat(line).contains("DonorDevice.signIn(java.time.Instant, boolean)").contains("reconstitute"))
                    .anySatisfy(line -> assertThat(line).contains("DonorDevice.copy()").contains("<init>"))
                    .anySatisfy(line -> assertThat(line).contains("DonorDevice.maker()").contains("<init>"))
                    .anySatisfy(line -> assertThat(line).contains("DonorDevice$Copier.signIn(").contains("<init>"))
                    .anySatisfy(line -> assertThat(line).contains("PlantedDeviceEnding.toDomain(").contains("reconstitute"))
                    .anySatisfy(line -> assertThat(line).contains("PlantedDeviceEnding.ender(").contains("reconstitute"))
                    .anySatisfy(line -> assertThat(line).contains("DonorDeviceJpaEntity.endedCopy(").contains("reconstitute"))
                    .anySatisfy(line -> assertThat(line).contains("DonorDeviceJpaEntity.toDomain(java.time.Instant)").contains("<init>"))
                    .noneSatisfy(line -> assertThat(line).startsWith("Method <cz.novanadeje.app.donors.domain.DonorDevice.signIn(java.time.Instant)>"))
                    .noneSatisfy(line -> assertThat(line).startsWith("Method <cz.novanadeje.app.donors.domain.DonorDevice.reconstitute("))
                    .noneSatisfy(line -> assertThat(line).contains("DonorDeviceJpaEntity.toDomain()"));
        }
    }

    static final class PlantedReferences {

        List<Object> references(RefreshTokenRepository tokens, DonorDeviceRepository devices) {
            BiConsumer<DonorId, Instant> revoke = tokens::revokeAllOf;
            Consumer<DonorId> lock = tokens::lockAllOf;
            BiConsumer<DonorId, Instant> reduce = devices::reduceErasedOf;
            return List.of(revoke, lock, reduce);
        }
    }

    static final class PlantedCredentialChange {

        void changed(DeviceSignOuts signOuts, DonorId donor) {
            signOuts.endAllOf(donor, DeviceSignOutReason.CREDENTIALS_CHANGED, Instant.EPOCH);
        }
    }

    abstract static class PlantedDecorator implements RefreshTokenRepository {

        private final RefreshTokenRepository delegate;

        PlantedDecorator(RefreshTokenRepository delegate) {
            this.delegate = delegate;
        }

        @Override
        public void revokeAllOf(DonorId donorId, Instant at) {
            delegate.revokeAllOf(donorId, at);
        }
    }
}
