package cz.novanadeje.app.architecture;

import com.tngtech.archunit.base.DescribedPredicate;
import com.tngtech.archunit.core.domain.JavaAccess;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;
import cz.novanadeje.app.AppApplication;
import cz.novanadeje.app.donors.application.SecondFactorCodes;
import cz.novanadeje.app.donors.domain.SecondFactor;
import cz.novanadeje.app.donors.domain.Totp;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Method;
import java.time.Instant;
import java.util.Arrays;
import java.util.List;
import java.util.Set;
import java.util.function.BiConsumer;

import static cz.novanadeje.app.architecture.MethodAccesses.callsOrReferences;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static org.assertj.core.api.Assertions.assertThat;

@AnalyzeClasses(
        packagesOf = AppApplication.class,
        importOptions = ImportOption.DoNotIncludeTests.class
)
class SecondFactorCodeRulesTest {

    private static final Set<String> CODE_CHECKS = Set.of("verify", "check", "confirm");

    private static final Set<String> CODE_COMPUTATIONS = Set.of("matchingStep", "codeAt");

    private static final DescribedPredicate<JavaAccess<?>> A_CODE_CHECK_OF_THE_FACTOR = callsOrReferences("", SecondFactor.class, CODE_CHECKS::contains)
            .or(callsOrReferences("", Totp.class, CODE_COMPUTATIONS::contains))
            .as("a check of a code from the authenticator app in " + SecondFactor.class.getSimpleName() + " or " + Totp.class.getSimpleName());

    @ArchTest
    static final ArchRule every_code_from_the_app_is_checked_through_the_count_of_wrong_codes = noClasses()
            .that().doNotHaveFullyQualifiedName(SecondFactorCodes.class.getName())
            .and().doNotHaveFullyQualifiedName(SecondFactor.class.getName())
            .and().doNotHaveFullyQualifiedName(Totp.class.getName())
            .should().accessTargetWhere(A_CODE_CHECK_OF_THE_FACTOR)
            .because("every code check counts against the donor's wrong codes and spends a right code atomically (security.md, Abuse)");

    @Test
    @DisplayName("Given the guarded method names, when the factor and Totp are read, then each name is a method there, so no rule watches a name that is gone")
    void should_find_every_guarded_name_when_read_given_the_factor_and_totp() {
        assertThat(Arrays.stream(SecondFactor.class.getMethods()).map(Method::getName)).containsAll(CODE_CHECKS);
        assertThat(Arrays.stream(Totp.class.getMethods()).map(Method::getName)).containsAll(CODE_COMPUTATIONS);
    }

    @Test
    @DisplayName("Given a class that checks a code of the factor itself, when the code rule checks it, then it is reported")
    void should_report_direct_check_when_rule_checks_given_class_bypassing_the_count() {
        var result = every_code_from_the_app_is_checked_through_the_count_of_wrong_codes.evaluate(new ClassFileImporter().importClasses(PlantedCheck.class));

        assertThat(result.getFailureReport().getDetails()).isNotEmpty().allSatisfy(detail -> assertThat(detail).contains(PlantedCheck.class.getSimpleName()));
    }

    @Test
    @DisplayName("Given a class that checks a code through a method reference or through Totp, when the code rule checks it, then each is reported")
    void should_report_reference_and_totp_check_when_rule_checks_given_classes_bypassing_the_count() {
        var result = every_code_from_the_app_is_checked_through_the_count_of_wrong_codes.evaluate(new ClassFileImporter().importClasses(PlantedBypasses.class));

        assertThat(result.getFailureReport().getDetails()).hasSize(2)
                .anySatisfy(detail -> assertThat(detail).contains("SecondFactor.check"))
                .anySatisfy(detail -> assertThat(detail).contains("Totp.matchingStep"));
    }

    static final class PlantedBypasses {

        Object bypass(SecondFactor factor, String code) {
            BiConsumer<String, Instant> check = factor::check;
            return List.of(check, Totp.matchingStep(factor.secret(), code, Instant.EPOCH));
        }
    }

    static final class PlantedCheck {

        void check(SecondFactor factor, String code) {
            factor.check(code, Instant.EPOCH);
        }
    }
}
