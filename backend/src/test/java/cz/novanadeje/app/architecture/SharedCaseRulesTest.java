package cz.novanadeje.app.architecture;

import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;
import cz.novanadeje.app.AppApplication;
import cz.novanadeje.app.sharedcases.SharedCaseRunner;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.classes;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

@AnalyzeClasses(
        packagesOf = AppApplication.class,
        importOptions = ImportOption.OnlyIncludeTests.class
)
class SharedCaseRulesTest {

    @ArchTest
    static final ArchRule shared_case_runners_live_beside_the_code_they_call = classes()
            .that().areAssignableTo(SharedCaseRunner.class)
            .and().doNotHaveFullyQualifiedName(SharedCaseRunner.class.getName())
            .should().resideInAnyPackage(
                    "cz.novanadeje.app.content..",
                    "cz.novanadeje.app.donors..",
                    "cz.novanadeje.app.donations..",
                    "cz.novanadeje.app.contact..",
                    "cz.novanadeje.app.operations..",
                    "cz.novanadeje.app.shared..");

    @ArchTest
    static final ArchRule shared_case_infrastructure_does_not_depend_on_the_v2_baseline = noClasses()
            .that().resideInAPackage("cz.novanadeje.app.sharedcases..")
            .should().dependOnClassesThat()
            .resideInAPackage("cz.novanadeje.app.regression..");
}
