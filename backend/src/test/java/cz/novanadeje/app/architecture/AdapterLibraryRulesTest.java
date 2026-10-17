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
    static final ArchRule qr_code_library_is_used_only_by_infrastructure_adapters = noClasses()
            .that().resideOutsideOfPackage("..infrastructure..")
            .should().dependOnClassesThat().resideInAPackage("com.google.zxing..");
}
