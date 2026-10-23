package cz.novanadeje.app.architecture;

import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;
import cz.novanadeje.app.AppApplication;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

@AnalyzeClasses(
        packagesOf = AppApplication.class,
        importOptions = ImportOption.DoNotIncludeTests.class
)
class AdapterLibraryRulesTest {

    @ArchTest
    static final ArchRule qr_code_library_is_used_only_by_the_shared_qr_adapter = noClasses()
            .that().resideOutsideOfPackage("cz.novanadeje.app.shared.infrastructure.qr..")
            .should().dependOnClassesThat().resideInAPackage("com.google.zxing..");

    @ArchTest
    static final ArchRule fio_client_library_is_used_only_by_the_donations_fio_adapter = noClasses()
            .that().resideOutsideOfPackage("cz.novanadeje.app.donations.infrastructure.fio..")
            .should().dependOnClassesThat().resideInAPackage("io.github.bzumik1.fio..");

    @ArchTest
    static final ArchRule pdf_and_template_libraries_are_used_only_by_infrastructure_adapters = noClasses()
            .that().resideOutsideOfPackage("..infrastructure..")
            .should().dependOnClassesThat()
            .resideInAnyPackage("io.github.openhtmltopdf..", "com.openhtmltopdf..", "org.apache.pdfbox..", "org.thymeleaf..");

    @ArchTest
    static final ArchRule image_libraries_are_used_only_by_the_content_media_and_receipt_signature_adapters = noClasses()
            .that().resideOutsideOfPackages("cz.novanadeje.app.content.infrastructure.media..", "cz.novanadeje.app.donations.infrastructure.signature..")
            .should().dependOnClassesThat()
            .resideInAnyPackage("io.github.darkxanter..", "com.luciad.imageio.webp..", "javax.imageio..", "java.awt.image..");

    @ArchTest
    static final ArchRule logging_system_pool_and_jvm_management_are_used_only_by_the_operations_adapters = noClasses()
            .that().resideOutsideOfPackage("cz.novanadeje.app.operations.infrastructure..")
            .should().dependOnClassesThat()
            .resideInAnyPackage("org.springframework.boot.logging..", "com.zaxxer.hikari..", "java.lang.management..");

    @ArchTest
    static final ArchRule webauthn_library_is_used_only_by_the_donors_webauthn_adapter = noClasses()
            .that().resideOutsideOfPackage("cz.novanadeje.app.donors.infrastructure.webauthn..")
            .should().dependOnClassesThat().resideInAPackage("com.webauthn4j..");

    @ArchTest
    static final ArchRule cache_library_is_used_only_by_infrastructure_adapters = noClasses()
            .that().resideOutsideOfPackage("..infrastructure..")
            .should().dependOnClassesThat().resideInAPackage("com.github.benmanes.caffeine..");
}
