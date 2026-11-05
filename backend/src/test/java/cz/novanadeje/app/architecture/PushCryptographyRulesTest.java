package cz.novanadeje.app.architecture;

import com.tngtech.archunit.base.DescribedPredicate;
import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;
import cz.novanadeje.app.AppApplication;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import javax.crypto.KeyAgreement;
import java.security.GeneralSecurityException;
import java.security.PrivateKey;
import java.security.PublicKey;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static org.assertj.core.api.Assertions.assertThat;

@AnalyzeClasses(
        packagesOf = AppApplication.class,
        importOptions = ImportOption.DoNotIncludeTests.class
)
class PushCryptographyRulesTest {

    private static final DescribedPredicate<JavaClass> ELLIPTIC_CURVE_CRYPTOGRAPHY = JavaClass.Predicates.belongToAnyOf(KeyAgreement.class)
            .or(JavaClass.Predicates.resideInAnyPackage("java.security.interfaces..", "java.security.spec..")
                    .and(JavaClass.Predicates.simpleNameStartingWith("EC")))
            .as("the JDK's elliptic-curve key agreement and key classes");

    @ArchTest
    static final ArchRule elliptic_curve_cryptography_is_used_only_by_the_operations_push_adapter = noClasses()
            .that().resideOutsideOfPackage("cz.novanadeje.app.operations.infrastructure.push..")
            .should().dependOnClassesThat(ELLIPTIC_CURVE_CRYPTOGRAPHY);

    @Test
    @DisplayName("Given a class outside the push adapter that agrees on a key with the JDK, when the elliptic-curve rule checks it, then it is reported")
    void should_report_key_agreement_when_rule_checks_given_class_outside_push_adapter() {
        var result = elliptic_curve_cryptography_is_used_only_by_the_operations_push_adapter.evaluate(new ClassFileImporter().importClasses(PlantedAgreement.class));

        assertThat(result.getFailureReport().getDetails()).isNotEmpty().allSatisfy(detail -> assertThat(detail).contains(PlantedAgreement.class.getSimpleName()));
    }

    static final class PlantedAgreement {

        byte[] agree(PrivateKey own, PublicKey other) throws GeneralSecurityException {
            KeyAgreement agreement = KeyAgreement.getInstance("ECDH");
            agreement.init(own);
            agreement.doPhase(other, true);
            return agreement.generateSecret();
        }
    }
}
