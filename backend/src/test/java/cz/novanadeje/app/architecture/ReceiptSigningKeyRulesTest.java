package cz.novanadeje.app.architecture;

import com.tngtech.archunit.base.DescribedPredicate;
import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.domain.JavaMethodCall;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;
import cz.novanadeje.app.AppApplication;
import cz.novanadeje.app.donations.application.signing.ReceiptSigningKeyRegistration;
import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKey;
import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKeyRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.security.KeyFactory;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.PrivateKey;
import java.security.Signature;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static org.assertj.core.api.Assertions.assertThat;

@AnalyzeClasses(
        packagesOf = AppApplication.class,
        importOptions = ImportOption.DoNotIncludeTests.class
)
class ReceiptSigningKeyRulesTest {

    private static final String WRITE = "save";

    private static final DescribedPredicate<JavaClass> SIGNING_CRYPTOGRAPHY = JavaClass.Predicates
            .belongToAnyOf(Signature.class, KeyFactory.class, KeyPairGenerator.class, KeyPair.class, PrivateKey.class)
            .or(JavaClass.Predicates.resideInAnyPackage("java.security..").and(JavaClass.Predicates.simpleNameStartingWith("EdEC")))
            .as("the JDK's signing classes");

    private static final DescribedPredicate<JavaMethodCall> A_WRITE_OF_THE_KEY_REPOSITORY = DescribedPredicate.describe(
            "a write to " + ReceiptSigningKeyRepository.class.getSimpleName(),
            call -> call.getTarget().getName().equals(WRITE) && call.getTargetOwner().isAssignableTo(ReceiptSigningKeyRepository.class));

    @ArchTest
    static final ArchRule receipt_signing_cryptography_is_used_only_by_infrastructure_adapters = noClasses()
            .that().resideOutsideOfPackage("..infrastructure..")
            .should().dependOnClassesThat(SIGNING_CRYPTOGRAPHY);

    @ArchTest
    static final ArchRule receipt_signing_keys_are_written_only_by_the_startup_registrar = noClasses()
            .that().doNotHaveFullyQualifiedName(ReceiptSigningKeyRegistration.class.getName())
            .should().callMethodWhere(A_WRITE_OF_THE_KEY_REPOSITORY);

    @Test
    @DisplayName("Given a class outside the registrar that saves a receipt signing key, when the writer rule checks it, then it is reported")
    void should_report_writer_when_rule_checks_given_class_outside_registrar_saving_a_key() {
        JavaClasses classes = new ClassFileImporter().importClasses(PlantedKeyWriter.class, ReceiptSigningKeyRegistration.class,
                ReceiptSigningKeyRepository.class);

        var result = receipt_signing_keys_are_written_only_by_the_startup_registrar.evaluate(classes);

        assertThat(result.hasViolation()).isTrue();
        assertThat(result.getFailureReport().getDetails()).singleElement().asString().contains(PlantedKeyWriter.class.getSimpleName());
    }

    @Test
    @DisplayName("Given a class outside infrastructure that signs with the JDK, when the cryptography rule checks it, then it is reported")
    void should_report_signer_when_rule_checks_given_class_outside_infrastructure_using_jdk_signing() {
        JavaClasses classes = new ClassFileImporter().importClasses(PlantedSigner.class);

        assertThat(receipt_signing_cryptography_is_used_only_by_infrastructure_adapters.evaluate(classes).hasViolation()).isTrue();
    }

    static final class PlantedKeyWriter {

        private final ReceiptSigningKeyRepository keys;

        PlantedKeyWriter(ReceiptSigningKeyRepository keys) {
            this.keys = keys;
        }

        void write(ReceiptSigningKey key) {
            keys.save(key);
        }
    }

    static final class PlantedSigner {

        byte[] sign(PrivateKey key, byte[] message) throws java.security.GeneralSecurityException {
            Signature signature = Signature.getInstance("Ed25519");
            signature.initSign(key);
            signature.update(message);
            return signature.sign();
        }
    }
}
