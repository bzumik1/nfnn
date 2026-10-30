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
import cz.novanadeje.app.donations.application.signing.ReceiptSigningKeys;
import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKey;
import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKeyRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyFactory;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.PrivateKey;
import java.security.Signature;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.stream.Stream;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static org.assertj.core.api.Assertions.assertThat;

@AnalyzeClasses(
        packagesOf = AppApplication.class,
        importOptions = ImportOption.DoNotIncludeTests.class
)
class ReceiptSigningKeyRulesTest {

    private static final String READ = "findAll";
    private static final String PERSISTENCE = "cz.novanadeje.app.donations.infrastructure.persistence.";
    private static final String KEY_ADAPTER = PERSISTENCE + "JpaReceiptSigningKeyRepository";
    private static final Set<String> KEY_PERSISTENCE = Set.of(
            "cz.novanadeje.app.donations.infrastructure.persistence.ReceiptSigningKeyJpaEntity",
            "cz.novanadeje.app.donations.infrastructure.persistence.ReceiptSigningKeyJpaRepository",
            "cz.novanadeje.app.donations.infrastructure.persistence.ReceiptSigningKeyAdoptionJpaEntity",
            "cz.novanadeje.app.donations.infrastructure.persistence.ReceiptSigningKeyAdoptionJpaRepository");
    private static final String KEY_TABLE = "receipt_signing_key";
    private static final Set<String> FILES_NAMING_THE_KEY_TABLES = Set.of(
            "ReceiptSigningKeyJpaEntity.java", "ReceiptSigningKeyAdoptionJpaEntity.java", "ReceiptSigningKeyAdoptionJpaRepository.java",
            "021_register_receipt_signing_keys.xml", "022_issue_receipts_as_frozen_data.xml");

    private static final DescribedPredicate<JavaClass> SIGNING_CRYPTOGRAPHY = JavaClass.Predicates
            .belongToAnyOf(Signature.class, KeyFactory.class, KeyPairGenerator.class, KeyPair.class, PrivateKey.class)
            .or(JavaClass.Predicates.resideInAnyPackage("java.security..").and(JavaClass.Predicates.simpleNameStartingWith("EdEC")))
            .as("the JDK's signing classes");

    private static final DescribedPredicate<JavaMethodCall> A_WRITE_OF_THE_KEY_REPOSITORY = DescribedPredicate.describe(
            "a method of " + ReceiptSigningKeyRepository.class.getSimpleName() + " other than " + READ,
            call -> !call.getTarget().getName().equals(READ) && call.getTargetOwner().isAssignableTo(ReceiptSigningKeyRepository.class));

    private static final DescribedPredicate<JavaClass> THE_KEY_PERSISTENCE = DescribedPredicate.describe(
            "the JPA entities and Spring Data repositories of the receipt signing keys", javaClass -> KEY_PERSISTENCE.contains(javaClass.getName()));

    @ArchTest
    static final ArchRule receipt_signing_cryptography_is_used_only_by_infrastructure_adapters = noClasses()
            .that().resideOutsideOfPackage("..infrastructure..")
            .should().dependOnClassesThat(SIGNING_CRYPTOGRAPHY);

    @ArchTest
    static final ArchRule receipt_signing_keys_are_written_only_by_the_startup_registrar = noClasses()
            .that().doNotHaveFullyQualifiedName(ReceiptSigningKeyRegistration.class.getName())
            .should().callMethodWhere(A_WRITE_OF_THE_KEY_REPOSITORY);

    @ArchTest
    static final ArchRule receipt_signing_key_persistence_is_used_only_by_its_adapter = noClasses()
            .that().doNotHaveFullyQualifiedName(KEY_ADAPTER)
            .and(DescribedPredicate.not(THE_KEY_PERSISTENCE))
            .should().dependOnClassesThat(THE_KEY_PERSISTENCE);

    @Test
    @DisplayName("Given the main sources and changelogs, when they are searched for the key tables, then only the key entities, the adoption repository, changelog 021 and the foreign key of changelog 022 name them")
    void should_name_the_key_tables_only_in_their_adapter_when_searched_given_the_main_sources() throws IOException {
        assertThat(filesNamingTheKeyTables(Path.of("src", "main"))).containsExactlyInAnyOrderElementsOf(FILES_NAMING_THE_KEY_TABLES);
    }

    @Test
    @DisplayName("Given a planted class that updates the key table through SQL, when the sources are searched, then it is reported")
    void should_report_planted_sql_when_searched_given_a_class_naming_the_key_table(@TempDir Path sources) throws IOException {
        Files.writeString(sources.resolve("PlantedSql.java"), "class PlantedSql { String sql = \"update receipt_signing_key set status = 'active'\"; }");
        Files.writeString(sources.resolve("Unrelated.java"), "class Unrelated { String sql = \"select 1\"; }");

        assertThat(filesNamingTheKeyTables(sources)).containsExactly("PlantedSql.java");
    }

    @Test
    @DisplayName("Given a class outside the registrar that records a restore adoption, when the writer rule checks it, then it is reported")
    void should_report_writer_when_rule_checks_given_class_outside_registrar_recording_an_adoption() {
        JavaClasses classes = new ClassFileImporter().importClasses(PlantedAdoptionRecorder.class, ReceiptSigningKeyRegistration.class,
                ReceiptSigningKeys.class, ReceiptSigningKeyRepository.class);

        var result = receipt_signing_keys_are_written_only_by_the_startup_registrar.evaluate(classes);

        assertThat(result.getFailureReport().getDetails()).singleElement().asString().contains(PlantedAdoptionRecorder.class.getSimpleName());
    }

    @Test
    @DisplayName("Given a class beside the key adapter that deletes through the Spring Data repository, when the persistence rule checks it, then it is reported and the adapter is not")
    void should_report_jpa_writer_when_rule_checks_given_class_beside_the_adapter() throws ClassNotFoundException {
        JavaClasses classes = new ClassFileImporter().importClasses(Class.forName(PERSISTENCE + "PlantedJpaKeyDeleter"), Class.forName(KEY_ADAPTER),
                Class.forName(PERSISTENCE + "ReceiptSigningKeyJpaEntity"), Class.forName(PERSISTENCE + "ReceiptSigningKeyJpaRepository"));

        var result = receipt_signing_key_persistence_is_used_only_by_its_adapter.evaluate(classes);

        assertThat(result.getFailureReport().getDetails()).isNotEmpty()
                .allSatisfy(detail -> assertThat(detail).contains("PlantedJpaKeyDeleter"));
    }

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

    static final class PlantedAdoptionRecorder {

        private final ReceiptSigningKeyRepository keys;

        PlantedAdoptionRecorder(ReceiptSigningKeyRepository keys) {
            this.keys = keys;
        }

        boolean adopt(String restoreId) {
            return keys.recordRestoreAdoption(restoreId, Instant.EPOCH);
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

    private static List<String> filesNamingTheKeyTables(Path root) throws IOException {
        try (Stream<Path> files = Files.walk(root)) {
            return files.filter(Files::isRegularFile).filter(file -> {
                try {
                    return new String(Files.readAllBytes(file), StandardCharsets.ISO_8859_1).contains(KEY_TABLE);
                } catch (IOException unreadable) {
                    throw new UncheckedIOException(unreadable);
                }
            }).map(file -> file.getFileName().toString()).toList();
        }
    }
}
