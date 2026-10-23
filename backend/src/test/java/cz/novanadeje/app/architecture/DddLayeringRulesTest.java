package cz.novanadeje.app.architecture;

import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;
import cz.novanadeje.app.AppApplication;
import org.springframework.context.MessageSource;

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
}
