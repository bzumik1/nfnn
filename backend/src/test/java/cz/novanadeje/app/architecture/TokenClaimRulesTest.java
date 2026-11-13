package cz.novanadeje.app.architecture;

import com.tngtech.archunit.base.DescribedPredicate;
import com.tngtech.archunit.core.domain.JavaAccess;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;
import cz.novanadeje.app.AppApplication;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.security.oauth2.core.ClaimAccessor;

import java.io.IOException;
import java.nio.file.Path;
import java.util.Map;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static cz.novanadeje.app.architecture.MethodAccesses.callsOrReferences;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

@AnalyzeClasses(
        packagesOf = AppApplication.class,
        importOptions = ImportOption.DoNotIncludeTests.class
)
class TokenClaimRulesTest {

    private static final Map<String, String> CLAIM_READERS = Map.of(
            "cz.novanadeje.app.donors.interfaces.rest.SessionDevices", "reads the session id of a browser token for the device sign-outs",
            "cz.novanadeje.app.operations.interfaces.rest.SessionDevices", "reads the session id of a browser token for the push devices",
            "cz.novanadeje.app.donors.interfaces.rest.SessionRoles", "reads the roles a session was opened with",
            "cz.novanadeje.app.content.interfaces.rest.AdminPeopleController", "until #612, which changes the controller, merges");

    private static final DescribedPredicate<JavaAccess<?>> A_CLAIM_READ = callsOrReferences("a read of a token's claims", ClaimAccessor.class,
            name -> name.equals("hasClaim") || name.startsWith("getClaim"));

    @ArchTest
    static final ArchRule controllers_take_the_channel_and_never_read_a_claim = noClasses()
            .that().resideInAPackage("..interfaces..")
            .and().resideOutsideOfPackage("cz.novanadeje.app.shared.interfaces..")
            .and(DescribedPredicate.describe("are not named as reading a claim", type -> !CLAIM_READERS.containsKey(type.getName())))
            .should().accessTargetWhere(A_CLAIM_READ)
            .because("whether a request comes from a browser session or a connected application is read once, by the shared resolver of "
                    + "AdministrationChannel, so no controller spells the scope claim or decides it on its own (security.md, Connected applications)");

    @Test
    @DisplayName("Given the classes allowed to read a claim, when they are read, then each exists, so the list names no class that is gone")
    void should_find_every_allowed_reader_when_read_given_the_list() {
        assertThat(CLAIM_READERS.keySet()).allSatisfy(name -> assertThatCode(() -> Class.forName(name)).doesNotThrowAnyException());
    }

    @Test
    @DisplayName("Given a planted controller that checks the scope claim and reads a claim by reference, when the rule checks it, then both are reported and the subject is not")
    void should_report_every_claim_read_when_checked_given_a_planted_controller(@TempDir Path folder) throws IOException {
        JavaClasses planted = PlantedClasses.compiled(folder, Map.of("cz.novanadeje.app.planteda.interfaces.rest.PlantedChannelController", """
                package cz.novanadeje.app.planteda.interfaces.rest;

                import java.util.function.Function;
                import org.springframework.security.oauth2.jwt.Jwt;

                class PlantedChannelController {

                    boolean connected(Jwt jwt) {
                        return jwt.hasClaim("scope");
                    }

                    Function<String, String> claims(Jwt jwt) {
                        return jwt::getClaimAsString;
                    }

                    String admin(Jwt jwt) {
                        return jwt.getSubject();
                    }
                }
                """));

        assertThat(controllers_take_the_channel_and_never_read_a_claim.evaluate(planted).getFailureReport().getDetails())
                .hasSize(2)
                .anySatisfy(detail -> assertThat(detail).contains("connected"))
                .anySatisfy(detail -> assertThat(detail).contains("claims"));
    }
}
