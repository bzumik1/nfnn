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
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.shared.domain.EmailAddress;
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
    private static final String STARTUP_GRANT_METHOD = AdministratorService.class.getName() + "." + STARTUP_GRANT + "(" + EmailAddress.class.getName() + ")";
    private static final String REVOCATION_METHOD = AdministratorService.class.getName() + ".revoke(" + DonorId.class.getName() + ", "
            + DonorId.class.getName() + ")";

    private static final DescribedPredicate<JavaAccess<?>> A_FIRST_GRANT =
            callsOrReferences("", Donor.class, "grantFirstAdministration"::equals)
                    .or(callsOrReferences("", AdministratorRoster.class, "grantFirst"::equals))
                    .as("the grant of the role without a second factor");

    private static final DescribedPredicate<JavaAccess<?>> FROM_THE_STARTUP_GRANT = DescribedPredicate.describe("from the startup grant",
            access -> access.getOrigin().getFullName().equals(STARTUP_GRANT_METHOD));

    private static final DescribedPredicate<JavaAccess<?>> A_ROLE_REMOVAL =
            callsOrReferences("", Donor.class, "revokeAdministration"::equals).as("the removal of the administrator role");

    private static final DescribedPredicate<JavaAccess<?>> A_ROSTER_REVOCATION =
            callsOrReferences("", AdministratorRoster.class, "revoke"::equals).as("the roster's revocation");

    private static final DescribedPredicate<JavaAccess<?>> FROM_THE_REVOCATION = DescribedPredicate.describe("from the administrator service's revocation",
            access -> access.getOrigin().getFullName().equals(REVOCATION_METHOD));

    @ArchTest
    static final ArchRule the_first_administrator_is_granted_only_at_startup = noClasses()
            .that().doNotHaveFullyQualifiedName(AdministratorRoster.class.getName())
            .should().accessTargetWhere(A_FIRST_GRANT.and(DescribedPredicate.not(FROM_THE_STARTUP_GRANT)).as(A_FIRST_GRANT.getDescription()))
            .because("security.md, Administration: the role needs a second factor, except the first administrator from ADMIN_EMAILS while the "
                    + "site has none, which only AdministratorRoster.grantFirst checks and grants, called only by AdministratorService.grantAtStartup");

    @ArchTest
    static final ArchRule the_role_is_removed_only_through_the_roster = noClasses()
            .that().doNotHaveFullyQualifiedName(AdministratorRoster.class.getName())
            .should().accessTargetWhere(A_ROLE_REMOVAL)
            .orShould().accessTargetWhere(A_ROSTER_REVOCATION.and(DescribedPredicate.not(FROM_THE_REVOCATION)).as(A_ROSTER_REVOCATION.getDescription()))
            .because("security.md, Administration: never one's own role and never the last administrator; AdministratorRoster.revoke checks both over "
                    + "the administrators AdministratorService.revoke reads under the ADMINISTRATORS lock, and nothing else removes the role");

    @Test
    @DisplayName("Given a planted service that removes the role itself, another that asks the roster directly and the administrator service's revocation, when the rule checks them, then the first two are reported")
    void should_report_a_role_removal_outside_the_roster_when_checked_given_planted_services(@TempDir Path folder) throws IOException {
        JavaClasses planted = PlantedClasses.compiled(folder, Map.of(
                "cz.novanadeje.app.donors.application.PlantedDemotion", """
                        package cz.novanadeje.app.donors.application;

                        import cz.novanadeje.app.donors.domain.AdministratorRoster;
                        import cz.novanadeje.app.donors.domain.Donor;
                        import java.util.List;

                        class PlantedDemotion {

                            void demote(Donor donor) {
                                donor.revokeAdministration();
                            }

                            void demoteThroughTheRoster(Donor donor) {
                                AdministratorRoster.revoke(donor, List.of(), donor.id());
                            }
                        }
                        """,
                AdministratorService.class.getName(), """
                        package cz.novanadeje.app.donors.application;

                        import cz.novanadeje.app.donors.domain.AdministratorRoster;
                        import cz.novanadeje.app.donors.domain.Donor;
                        import cz.novanadeje.app.donors.domain.DonorId;
                        import java.util.List;

                        public class AdministratorService {

                            public void revoke(DonorId adminId, DonorId donorId) {
                                Donor donor = null;
                                AdministratorRoster.revoke(donor, List.of(), adminId);
                            }
                        }
                        """));

        assertThat(the_role_is_removed_only_through_the_roster.evaluate(planted).getFailureReport().getDetails())
                .hasSize(2)
                .anySatisfy(detail -> assertThat(detail).contains("PlantedDemotion.demote(").contains("Donor.revokeAdministration("))
                .anySatisfy(detail -> assertThat(detail).contains("PlantedDemotion.demoteThroughTheRoster(").contains("AdministratorRoster.revoke("))
                .noneSatisfy(detail -> assertThat(detail).contains("AdministratorService.revoke("));
    }

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
    @DisplayName("Given a planted administrator service whose startup grant, an overload of it, another method and a method reference grant the first administration, when the rule checks it, then all but the startup grant are reported")
    void should_report_only_the_other_method_when_checked_given_a_planted_administrator_service(@TempDir Path folder) throws IOException {
        JavaClasses planted = PlantedClasses.compiled(folder, Map.of(AdministratorService.class.getName(), """
                package cz.novanadeje.app.donors.application;

                import cz.novanadeje.app.donors.domain.AdministratorRoster;
                import cz.novanadeje.app.donors.domain.Donor;
                import cz.novanadeje.app.shared.domain.EmailAddress;
                import java.util.List;

                public class AdministratorService {

                    void grantAtStartup(EmailAddress email) {
                        Donor donor = null;
                        AdministratorRoster.grantFirst(donor, List.of());
                    }

                    void grantAtStartup(EmailAddress email, int attempt) {
                        Donor donor = null;
                        AdministratorRoster.grantFirst(donor, List.of());
                    }

                    void promoteAll(List<Donor> donors) {
                        donors.forEach(Donor::grantFirstAdministration);
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
                .hasSize(4)
                .anySatisfy(detail -> assertThat(detail).contains("AdministratorService.grantAtStartup(" + EmailAddress.class.getName() + ", int)"))
                .anySatisfy(detail -> assertThat(detail).contains("AdministratorService.promoteAll(").contains("Donor.grantFirstAdministration"))
                .anySatisfy(detail -> assertThat(detail).contains("AdministratorService.promote(").contains("AdministratorRoster.grantFirst("))
                .anySatisfy(detail -> assertThat(detail).contains("AdministratorService.promoteDirectly(").contains("Donor.grantFirstAdministration("))
                .noneSatisfy(detail -> assertThat(detail).contains("AdministratorService.grantAtStartup(" + EmailAddress.class.getName() + ")"));
    }

    @Test
    @DisplayName("Given the administrator service the rules exempt two methods of, when its startup grant and its revocation are looked up by signature, then both are there, so the rules exempt no method that is gone")
    void should_find_the_exempted_methods_when_looked_up_given_their_signatures() throws NoSuchMethodException {
        assertThat(AdministratorService.class.getDeclaredMethod(STARTUP_GRANT, EmailAddress.class)).isNotNull();
        assertThat(AdministratorService.class.getDeclaredMethod("revoke", DonorId.class, DonorId.class)).isNotNull();
    }
}
