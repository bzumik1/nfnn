package cz.novanadeje.app.architecture;

import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;
import cz.novanadeje.app.AppApplication;
import cz.novanadeje.app.donors.application.AdministratorService;
import cz.novanadeje.app.donors.domain.Donor;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Path;
import java.util.Map;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static cz.novanadeje.app.architecture.MethodAccesses.callsOrReferences;
import static org.assertj.core.api.Assertions.assertThat;

@AnalyzeClasses(
        packagesOf = AppApplication.class,
        importOptions = ImportOption.DoNotIncludeTests.class
)
class AdministratorGrantRulesTest {

    private static final String FIRST_GRANT = "grantFirstAdministration";

    @ArchTest
    static final ArchRule the_first_administrator_is_granted_only_at_startup = noClasses()
            .that().doNotHaveFullyQualifiedName(AdministratorService.class.getName())
            .and().doNotHaveFullyQualifiedName(Donor.class.getName())
            .should().accessTargetWhere(callsOrReferences("the grant of the role without a second factor", Donor.class, FIRST_GRANT::equals))
            .because("security.md, Administration: the role needs a second factor, except the first administrator from ADMIN_EMAILS while the "
                    + "site has none, which only AdministratorService.grantAtStartup checks and grants");

    @Test
    @DisplayName("Given a planted service that grants the first administration itself, when the rule checks it, then it is reported")
    void should_report_another_first_grant_when_checked_given_a_planted_service(@TempDir Path folder) throws IOException {
        JavaClasses planted = PlantedClasses.compiled(folder, Map.of("cz.novanadeje.app.donors.application.PlantedPromotion", """
                package cz.novanadeje.app.donors.application;

                import cz.novanadeje.app.donors.domain.Donor;

                class PlantedPromotion {

                    void promote(Donor donor) {
                        donor.grantFirstAdministration();
                    }
                }
                """));

        assertThat(the_first_administrator_is_granted_only_at_startup.evaluate(planted).getFailureReport().getDetails())
                .singleElement().satisfies(detail -> assertThat(detail).contains("PlantedPromotion"));
    }
}
