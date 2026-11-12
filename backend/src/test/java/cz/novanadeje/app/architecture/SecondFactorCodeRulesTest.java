package cz.novanadeje.app.architecture;

import com.tngtech.archunit.base.DescribedPredicate;
import com.tngtech.archunit.core.domain.JavaMethodCall;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;
import cz.novanadeje.app.AppApplication;
import cz.novanadeje.app.donors.application.SecondFactorCodes;
import cz.novanadeje.app.donors.domain.SecondFactor;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.Set;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static org.assertj.core.api.Assertions.assertThat;

@AnalyzeClasses(
        packagesOf = AppApplication.class,
        importOptions = ImportOption.DoNotIncludeTests.class
)
class SecondFactorCodeRulesTest {

    private static final Set<String> CODE_CHECKS = Set.of("verify", "check", "confirm");

    private static final DescribedPredicate<JavaMethodCall> A_CODE_CHECK_OF_THE_FACTOR = DescribedPredicate.describe(
            "a check of a code from the authenticator app in " + SecondFactor.class.getSimpleName(),
            call -> CODE_CHECKS.contains(call.getTarget().getName()) && call.getTargetOwner().isEquivalentTo(SecondFactor.class));

    @ArchTest
    static final ArchRule every_code_from_the_app_is_checked_through_the_count_of_wrong_codes = noClasses()
            .that().doNotHaveFullyQualifiedName(SecondFactorCodes.class.getName())
            .and().doNotHaveFullyQualifiedName(SecondFactor.class.getName())
            .should().callMethodWhere(A_CODE_CHECK_OF_THE_FACTOR)
            .because("every code check counts against the donor's wrong codes and spends a right code atomically (security.md, Abuse)");

    @Test
    @DisplayName("Given a class that checks a code of the factor itself, when the code rule checks it, then it is reported")
    void should_report_direct_check_when_rule_checks_given_class_bypassing_the_count() {
        var result = every_code_from_the_app_is_checked_through_the_count_of_wrong_codes.evaluate(new ClassFileImporter().importClasses(PlantedCheck.class));

        assertThat(result.getFailureReport().getDetails()).isNotEmpty().allSatisfy(detail -> assertThat(detail).contains(PlantedCheck.class.getSimpleName()));
    }

    static final class PlantedCheck {

        void check(SecondFactor factor, String code) {
            factor.check(code, Instant.EPOCH);
        }
    }
}
