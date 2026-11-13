package cz.novanadeje.app.architecture;

import com.tngtech.archunit.base.DescribedPredicate;
import com.tngtech.archunit.core.domain.JavaAccess;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;
import cz.novanadeje.app.AppApplication;
import cz.novanadeje.app.donors.application.DeviceSignOuts;
import cz.novanadeje.app.donors.domain.DonorDeviceRepository;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.RefreshTokenRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
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

    private static final String PERSISTENCE = "cz.novanadeje.app.donors.infrastructure.persistence.";
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
            .that().doNotHaveFullyQualifiedName(TOKEN_ADAPTER)
            .and().doNotHaveFullyQualifiedName(DEVICE_ADAPTER)
            .should().accessTargetWhere(A_SIGN_OUT_LOCK_OR_END_OF_THE_ROWS)
            .because("the adapters are reached only from the device sign-outs, so a class beside them must not reach the same rows through Spring Data");

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

    static final class PlantedReferences {

        List<Object> references(RefreshTokenRepository tokens, DonorDeviceRepository devices) {
            BiConsumer<DonorId, Instant> revoke = tokens::revokeAllOf;
            Consumer<DonorId> lock = tokens::lockAllOf;
            BiConsumer<DonorId, Instant> reduce = devices::reduceErasedOf;
            return List.of(revoke, lock, reduce);
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
