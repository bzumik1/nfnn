package cz.novanadeje.app.architecture;

import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;
import cz.novanadeje.app.AppApplication;
import cz.novanadeje.app.IntegrationTest;
import cz.novanadeje.app.ScheduledWorkOff;
import cz.novanadeje.app.cucumber.CucumberSpringConfiguration;
import org.springframework.boot.test.context.SpringBootTest;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.classes;

@AnalyzeClasses(
        packagesOf = AppApplication.class,
        importOptions = ImportOption.OnlyIncludeTests.class
)
class TestContextRulesTest {

    @ArchTest
    static final ArchRule every_spring_boot_test_switches_off_the_scheduled_work = classes()
            .that().areMetaAnnotatedWith(SpringBootTest.class)
            .should().beMetaAnnotatedWith(ScheduledWorkOff.class);

    @ArchTest
    static final ArchRule spring_boot_tests_share_the_integration_test_configuration = classes()
            .that().areAnnotatedWith(SpringBootTest.class)
            .should().be(IntegrationTest.class)
            .orShould().be(CucumberSpringConfiguration.class);
}
