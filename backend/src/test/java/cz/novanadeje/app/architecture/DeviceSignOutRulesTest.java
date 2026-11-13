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

import static cz.novanadeje.app.architecture.MethodAccesses.callsOrReferences;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static org.assertj.core.api.Assertions.assertThat;

@AnalyzeClasses(
        packagesOf = AppApplication.class,
        importOptions = ImportOption.DoNotIncludeTests.class
)
class DeviceSignOutRulesTest {

    private static final Set<String> SIGN_OUTS = Set.of("revokeAllOf", "revokeAllOfDevice", "revokeDevicelessBrowserTokensOf");

    private static final String LOCK_ALL = "lockAllOf";

    private static final Set<String> DEVICE_ENDINGS = Set.of("endIfActive", "directWipe", "directWipeOfDonor", "reduceErasedOf");

    private static final DescribedPredicate<JavaAccess<?>> AN_END_OR_A_WIPE_ORDER_OF_THE_DEVICE_REPOSITORY = callsOrReferences(
            "an end of a device or an order to delete its copy in " + DonorDeviceRepository.class.getSimpleName(), DonorDeviceRepository.class, DEVICE_ENDINGS::contains);

    private static final DescribedPredicate<JavaAccess<?>> A_SIGN_OUT_OF_THE_TOKEN_REPOSITORY = callsOrReferences(
            "a revocation of every token of a donor or a device in " + RefreshTokenRepository.class.getSimpleName(), RefreshTokenRepository.class, SIGN_OUTS::contains);

    @ArchTest
    static final ArchRule every_session_of_a_donor_or_a_device_ends_only_through_the_device_sign_outs = noClasses()
            .that().doNotHaveFullyQualifiedName(DeviceSignOuts.class.getName())
            .and().areNotAssignableTo(RefreshTokenRepository.class)
            .and().areNotAssignableTo(DonorDeviceRepository.class)
            .should().accessTargetWhere(A_SIGN_OUT_OF_THE_TOKEN_REPOSITORY)
            .because("ending sessions must also end the devices and tell the access token check at once (plan v3, slice 2.9)");

    private static final DescribedPredicate<JavaAccess<?>> A_LOCK_OF_EVERY_TOKEN_OF_A_DONOR = callsOrReferences(
            "a lock of every token of a donor in " + RefreshTokenRepository.class.getSimpleName(), RefreshTokenRepository.class, LOCK_ALL::equals);

    @ArchTest
    static final ArchRule every_token_of_a_donor_is_locked_only_through_the_device_sign_outs = noClasses()
            .that().doNotHaveFullyQualifiedName(DeviceSignOuts.class.getName())
            .and().areNotAssignableTo(RefreshTokenRepository.class)
            .and().areNotAssignableTo(DonorDeviceRepository.class)
            .should().accessTargetWhere(A_LOCK_OF_EVERY_TOKEN_OF_A_DONOR)
            .because("the device sign-outs take the donor's sessions lock before they lock the donor's tokens, so two of them never deadlock (database audit #453)");

    @ArchTest
    static final ArchRule devices_end_and_get_orders_to_delete_only_through_the_device_sign_outs = noClasses()
            .that().doNotHaveFullyQualifiedName(DeviceSignOuts.class.getName())
            .and().areNotAssignableTo(RefreshTokenRepository.class)
            .and().areNotAssignableTo(DonorDeviceRepository.class)
            .should().accessTargetWhere(AN_END_OR_A_WIPE_ORDER_OF_THE_DEVICE_REPOSITORY)
            .because("only a sign-out from another device, an erasure or a role removal may order a device to delete its copy, never a replay (plan v3, slice 2.11, D28)");

    @Test
    @DisplayName("Given the guarded method names, when the repositories are read, then each name is a method there, so no rule watches a name that is gone")
    void should_find_every_guarded_name_when_read_given_the_repositories() {
        assertThat(methodNamesOf(RefreshTokenRepository.class)).containsAll(SIGN_OUTS).contains(LOCK_ALL);
        assertThat(methodNamesOf(DonorDeviceRepository.class)).containsAll(DEVICE_ENDINGS);
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
        @DisplayName("when the rules check a persistence class that is not the token or device adapter, then its sign-out is reported")
        void should_report_sign_out_when_checked_given_another_persistence_class(@TempDir Path folder) throws IOException {
            JavaClasses planted = PlantedClasses.compiled(folder, Map.of("cz.novanadeje.app.donors.infrastructure.persistence.PlantedDonorRows", """
                    package cz.novanadeje.app.donors.infrastructure.persistence;

                    import cz.novanadeje.app.donors.domain.DonorId;
                    import cz.novanadeje.app.donors.domain.RefreshTokenRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
                    import java.time.Instant;

                    class PlantedDonorRows {

                        void signOut(RefreshTokenRepository tokens, DonorId donor) {
                            tokens.revokeAllOf(donor, Instant.EPOCH);
                        }
                    }
                    """));

            assertThat(every_session_of_a_donor_or_a_device_ends_only_through_the_device_sign_outs.evaluate(planted).getFailureReport().getDetails())
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
}
