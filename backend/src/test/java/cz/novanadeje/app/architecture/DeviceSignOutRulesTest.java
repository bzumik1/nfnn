package cz.novanadeje.app.architecture;

import com.tngtech.archunit.base.DescribedPredicate;
import com.tngtech.archunit.core.domain.JavaMethodCall;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;
import cz.novanadeje.app.AppApplication;
import cz.novanadeje.app.donors.application.DeviceSignOuts;
import cz.novanadeje.app.donors.domain.RefreshTokenRepository;

import java.util.Set;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

@AnalyzeClasses(
        packagesOf = AppApplication.class,
        importOptions = ImportOption.DoNotIncludeTests.class
)
class DeviceSignOutRulesTest {

    private static final Set<String> SIGN_OUTS = Set.of("revokeAllOf", "revokeAllOfDevice", "revokeDevicelessBrowserTokensOf");

    private static final DescribedPredicate<JavaMethodCall> A_SIGN_OUT_OF_THE_TOKEN_REPOSITORY = DescribedPredicate.describe(
            "a revocation of every token of a donor or a device in " + RefreshTokenRepository.class.getSimpleName(),
            call -> SIGN_OUTS.contains(call.getTarget().getName()) && call.getTargetOwner().isAssignableTo(RefreshTokenRepository.class));

    @ArchTest
    static final ArchRule every_session_of_a_donor_or_a_device_ends_only_through_the_device_sign_outs = noClasses()
            .that().doNotHaveFullyQualifiedName(DeviceSignOuts.class.getName())
            .and().resideOutsideOfPackage("..infrastructure.persistence..")
            .should().callMethodWhere(A_SIGN_OUT_OF_THE_TOKEN_REPOSITORY)
            .because("ending sessions must also end the devices and tell the access token check at once (plan v3, slice 2.9)");
}
