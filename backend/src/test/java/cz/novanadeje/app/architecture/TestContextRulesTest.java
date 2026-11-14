package cz.novanadeje.app.architecture;

import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;
import cz.novanadeje.app.AppApplication;
import cz.novanadeje.app.IntegrationTest;
import cz.novanadeje.app.ScheduledWorkOff;
import cz.novanadeje.app.cucumber.CucumberSpringConfiguration;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.env.StandardEnvironment;
import org.springframework.test.context.BootstrapUtils;
import org.springframework.test.context.support.TestPropertySourceUtils;

import java.io.IOException;
import java.nio.file.Path;
import java.util.Map;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.classes;
import static org.assertj.core.api.Assertions.assertThat;

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

    @Test
    @DisplayName("Given a planted test that starts its own Spring Boot context, when the rules check it, then it is reported for leaving the scheduled work on and for not using the integration test configuration")
    void should_report_an_own_context_when_checked_given_a_planted_spring_boot_test(@TempDir Path folder) throws IOException {
        JavaClasses planted = PlantedClasses.compiled(folder, Map.of("cz.novanadeje.app.planteda.PlantedContextTest", """
                package cz.novanadeje.app.planteda;

                import org.springframework.boot.test.context.SpringBootTest;

                @SpringBootTest
                class PlantedContextTest {
                }
                """));

        assertThat(every_spring_boot_test_switches_off_the_scheduled_work.evaluate(planted).getFailureReport().getDetails())
                .singleElement().satisfies(detail -> assertThat(detail).contains("PlantedContextTest"));
        assertThat(spring_boot_tests_share_the_integration_test_configuration.evaluate(planted).getFailureReport().getDetails())
                .isNotEmpty().allSatisfy(detail -> assertThat(detail).contains("PlantedContextTest"));
    }

    @ParameterizedTest
    @ValueSource(classes = {CucumberSpringConfiguration.class, IntegrationTest.class})
    @DisplayName("Given a Spring Boot test context, when its test properties are resolved, then Hibernate neither echoes SQL to standard output nor spreads a statement over several lines, so the SQL logger alone writes each statement once")
    void should_echo_no_sql_and_keep_each_statement_on_one_line_when_resolved_given_a_spring_boot_test_context(Class<?> testClass) {
        StandardEnvironment environment = new StandardEnvironment();
        TestPropertySourceUtils.addInlinedPropertiesToEnvironment(environment,
                BootstrapUtils.resolveTestContextBootstrapper(testClass).buildMergedContextConfiguration().getPropertySourceProperties());

        assertThat(environment.getProperty("spring.jpa.show-sql")).as("spring.jpa.show-sql of %s", testClass.getSimpleName()).isEqualTo("false");
        assertThat(environment.getProperty("spring.jpa.properties.hibernate.format_sql")).as("hibernate.format_sql of %s", testClass.getSimpleName()).isEqualTo("false");
    }
}
