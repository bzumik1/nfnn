package cz.novanadeje.app.architecture;

import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;
import cz.novanadeje.app.AppApplication;
import jakarta.persistence.Embeddable;
import jakarta.persistence.Entity;
import jakarta.persistence.MappedSuperclass;
import org.springframework.context.MessageSource;
import org.springframework.data.repository.Repository;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZonedDateTime;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.classes;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static com.tngtech.archunit.library.Architectures.layeredArchitecture;
import static com.tngtech.archunit.library.dependencies.SlicesRuleDefinition.slices;

@AnalyzeClasses(
        packagesOf = AppApplication.class,
        importOptions = ImportOption.DoNotIncludeTests.class
)
class DddLayeringRulesTest {

    @ArchTest
    static final ArchRule layers_must_respect_ddd_dependency_rule = layeredArchitecture()
            .consideringAllDependencies()
            .layer("Domain").definedBy("..domain..")
            .layer("Application").definedBy("..application..")
            .layer("Infrastructure").definedBy("..infrastructure..")
            .layer("Interfaces").definedBy("..interfaces..")
            .whereLayer("Interfaces").mayNotBeAccessedByAnyLayer()
            .whereLayer("Infrastructure").mayOnlyBeAccessedByLayers("Interfaces")
            .whereLayer("Application").mayOnlyBeAccessedByLayers("Interfaces", "Infrastructure")
            .whereLayer("Domain").mayOnlyBeAccessedByLayers("Application", "Infrastructure", "Interfaces");

    @ArchTest
    static final ArchRule bounded_contexts_must_not_depend_on_each_other = slices()
            .matching("cz.novanadeje.app.(content|donors|donations|contact|operations)..")
            .namingSlices("Bounded context: $1")
            .should().notDependOnEachOther();

    @ArchTest
    static final ArchRule domain_must_not_depend_on_frameworks = noClasses()
            .that().resideInAPackage("..domain..")
            .should().dependOnClassesThat()
            .resideInAnyPackage("org.springframework..", "jakarta.persistence..", "jakarta.validation..");

    @ArchTest
    static final ArchRule application_must_not_depend_on_web = noClasses()
            .that().resideInAPackage("..application..")
            .should().dependOnClassesThat()
            .resideInAnyPackage("org.springframework.web..", "org.springframework.http..", "jakarta.servlet..");

    @ArchTest
    static final ArchRule message_bundles_must_be_read_only_by_adapters = noClasses()
            .that().resideInAnyPackage("..domain..", "..application..")
            .should().dependOnClassesThat()
            .areAssignableTo(MessageSource.class);

    @ArchTest
    static final ArchRule rest_controllers_must_not_expose_infrastructure_types = noClasses()
            .that().resideInAPackage("..interfaces.rest..")
            .should().dependOnClassesThat()
            .resideInAPackage("..infrastructure.persistence..");

    @ArchTest
    static final ArchRule shared_kernel_must_not_depend_on_any_context = noClasses()
            .that().resideInAPackage("cz.novanadeje.app.shared..")
            .should().dependOnClassesThat()
            .resideInAnyPackage(
                    "cz.novanadeje.app.content..",
                    "cz.novanadeje.app.donors..",
                    "cz.novanadeje.app.donations..",
                    "cz.novanadeje.app.contact..",
                    "cz.novanadeje.app.operations..");

    @ArchTest
    static final ArchRule jpa_entities_and_spring_data_repositories_are_package_private_adapter_details = classes()
            .that().areAnnotatedWith(Entity.class)
            .or().areAnnotatedWith(Embeddable.class)
            .or().areAnnotatedWith(MappedSuperclass.class)
            .or().areAssignableTo(Repository.class)
            .should().notBePublic()
            .andShould().resideInAPackage("..infrastructure..");

    @ArchTest
    static final ArchRule time_comes_from_the_injected_clock = noClasses()
            .should().callMethod(Instant.class, "now")
            .orShould().callMethod(LocalDate.class, "now")
            .orShould().callMethod(LocalDateTime.class, "now")
            .orShould().callMethod(OffsetDateTime.class, "now")
            .orShould().callMethod(ZonedDateTime.class, "now")
            .orShould().callMethod(System.class, "currentTimeMillis");
}
