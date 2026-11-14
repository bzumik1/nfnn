package cz.novanadeje.app.architecture;

import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;
import com.tngtech.archunit.base.DescribedPredicate;
import com.tngtech.archunit.core.domain.JavaAccess;
import cz.novanadeje.app.AppApplication;
import cz.novanadeje.app.donors.application.AdministratorService;
import cz.novanadeje.app.donors.domain.AdministratorRoster;
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

    private static final String STARTUP_GRANT = "grantAtStartup";

    private static final DescribedPredicate<JavaAccess<?>> A_FIRST_GRANT =
            callsOrReferences("", Donor.class, "grantFirstAdministration"::equals)
                    .or(callsOrReferences("", AdministratorRoster.class, "grantFirst"::equals))
                    .as("the grant of the role without a second factor");

    private static final DescribedPredicate<JavaAccess<?>> FROM_THE_STARTUP_GRANT = DescribedPredicate.describe("from the startup grant",
            access -> access.getOrigin().getOwner().getName().equals(AdministratorService.class.getName())
                    && access.getOrigin().getName().equals(STARTUP_GRANT));

    @ArchTest
    static final ArchRule the_first_administrator_is_granted_only_at_startup = noClasses()
            .that().doNotHaveFullyQualifiedName(AdministratorRoster.class.getName())
            .should().accessTargetWhere(A_FIRST_GRANT.and(DescribedPredicate.not(FROM_THE_STARTUP_GRANT)).as(A_FIRST_GRANT.getDescription()))
            .because("security.md, Administration: the role needs a second factor, except the first administrator from ADMIN_EMAILS while the "
                    + "site has none, which only AdministratorRoster.grantFirst checks and grants, called only by AdministratorService.grantAtStartup");

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

    @Test
    @DisplayName("Given a planted administrator service whose startup grant and another method grant the first administration, when the rule checks it, then only the other method is reported, by the roster and by the donor")
    void should_report_only_the_other_method_when_checked_given_a_planted_administrator_service(@TempDir Path folder) throws IOException {
        JavaClasses planted = PlantedClasses.compiled(folder, Map.of(AdministratorService.class.getName(), """
                package cz.novanadeje.app.donors.application;

                import cz.novanadeje.app.donors.domain.AdministratorRoster;
                import cz.novanadeje.app.donors.domain.Donor;
                import java.util.List;

                public class AdministratorService {

                    void grantAtStartup(Donor donor) {
                        AdministratorRoster.grantFirst(donor, List.of());
                    }

                    void promote(Donor donor) {
                        AdministratorRoster.grantFirst(donor, List.of());
                    }

                    void promoteDirectly(Donor donor) {
                        donor.grantFirstAdministration();
                    }
                }
                """));

        assertThat(the_first_administrator_is_granted_only_at_startup.evaluate(planted).getFailureReport().getDetails())
                .hasSize(2)
                .anySatisfy(detail -> assertThat(detail).contains("AdministratorService.promote(").contains("AdministratorRoster.grantFirst("))
                .anySatisfy(detail -> assertThat(detail).contains("AdministratorService.promoteDirectly(").contains("Donor.grantFirstAdministration("))
                .noneSatisfy(detail -> assertThat(detail).contains(STARTUP_GRANT));
    }

    @Test
    @DisplayName("Given the administrator service the rule exempts one method of, when its startup grant is looked up by name, then it is there, so the rule exempts no method that is gone")
    void should_find_the_exempted_method_when_looked_up_given_its_name() {
        assertThat(AdministratorService.class.getDeclaredMethods()).anySatisfy(method -> assertThat(method.getName()).isEqualTo(STARTUP_GRANT));
    }
}
