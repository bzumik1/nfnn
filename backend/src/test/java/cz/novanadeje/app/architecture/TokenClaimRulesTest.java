package cz.novanadeje.app.architecture;

import com.tngtech.archunit.base.DescribedPredicate;
import com.tngtech.archunit.core.domain.JavaAccess;
import com.tngtech.archunit.core.domain.JavaAnnotation;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.domain.JavaMethod;
import com.tngtech.archunit.core.domain.JavaParameter;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchCondition;
import com.tngtech.archunit.lang.ArchRule;
import com.tngtech.archunit.lang.ConditionEvents;
import com.tngtech.archunit.lang.SimpleConditionEvent;
import cz.novanadeje.app.AppApplication;
import cz.novanadeje.app.shared.application.administration.AdministrationChannel;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.annotation.CurrentSecurityContext;
import org.springframework.security.oauth2.core.ClaimAccessor;
import org.springframework.security.oauth2.server.resource.authentication.AbstractOAuth2TokenAuthenticationToken;

import java.io.IOException;
import java.nio.file.Path;
import java.util.Map;
import java.util.Set;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.methods;
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
            name -> name.equals("hasClaim") || name.startsWith("getClaim"))
            .or(callsOrReferences("", AbstractOAuth2TokenAuthenticationToken.class, "getTokenAttributes"::equals))
            .as("a read of a token's claims (ClaimAccessor, getTokenAttributes)");

    private static final Set<Class<?>> PRINCIPAL_ANNOTATIONS = Set.of(AuthenticationPrincipal.class, CurrentSecurityContext.class);

    @ArchTest
    static final ArchRule controllers_take_the_channel_and_never_read_a_claim = noClasses()
            .that().resideInAPackage("..interfaces..")
            .and().resideOutsideOfPackage("cz.novanadeje.app.shared.interfaces..")
            .and(DescribedPredicate.describe("are not named as reading a claim", type -> !CLAIM_READERS.containsKey(type.getName())))
            .should().accessTargetWhere(A_CLAIM_READ)
            .because("whether a request comes from a browser session or a connected application is read once, by the shared resolver of "
                    + "AdministrationChannel, so no controller spells the scope claim or decides it on its own (security.md, Connected applications)");

    @ArchTest
    static final ArchRule handlers_take_no_principal_expression = methods()
            .that().areDeclaredInClassesThat().resideInAPackage("..interfaces..")
            .and().areDeclaredInClassesThat().resideOutsideOfPackage("cz.novanadeje.app.shared.interfaces..")
            .should(takeNoPrincipalExpression())
            .because("an expression of @AuthenticationPrincipal or @CurrentSecurityContext reads a claim without a call the claim rule could see");

    @ArchTest
    static final ArchRule the_channel_is_never_bound_from_the_request = methods()
            .should(takeTheChannelOnlyBare())
            .because("an annotated AdministrationChannel parameter (@RequestParam, @RequestHeader, @PathVariable) would be bound from the request, "
                    + "so the client could name its own channel; a bare one is resolved from the token only");

    @Test
    @DisplayName("Given the classes allowed to read a claim, when they are read, then each exists and still reads one, so the list names no class that is gone or no longer needs it")
    void should_find_every_allowed_reader_reading_a_claim_when_read_given_the_list() {
        for (String reader : CLAIM_READERS.keySet()) {
            JavaClasses imported = new ClassFileImporter().importClasses(classNamed(reader));
            assertThat(imported.get(reader).getAccessesFromSelf().stream().anyMatch(A_CLAIM_READ)).as(reader).isTrue();
        }
    }

    private static Class<?> classNamed(String name) {
        try {
            return Class.forName(name);
        } catch (ClassNotFoundException gone) {
            throw new AssertionError(name + " is listed as a claim reader but no longer exists", gone);
        }
    }

    private static ArchCondition<JavaMethod> takeNoPrincipalExpression() {
        return new ArchCondition<>("take no @AuthenticationPrincipal or @CurrentSecurityContext with an expression") {
            @Override
            public void check(JavaMethod method, ConditionEvents events) {
                method.getParameters().stream()
                        .flatMap(parameter -> parameter.getAnnotations().stream())
                        .filter(annotation -> PRINCIPAL_ANNOTATIONS.stream().anyMatch(type -> annotation.getRawType().isEquivalentTo(type)))
                        .filter(TokenClaimRulesTest::hasAnExpression)
                        .forEach(annotation -> events.add(SimpleConditionEvent.violated(method, method.getFullName() + " reads the principal through an expression")));
            }
        };
    }

    private static boolean hasAnExpression(JavaAnnotation<?> annotation) {
        return annotation.get("expression").map(String.class::cast).filter(expression -> !expression.isBlank()).isPresent();
    }

    private static ArchCondition<JavaMethod> takeTheChannelOnlyBare() {
        return new ArchCondition<>("take an AdministrationChannel only without an annotation") {
            @Override
            public void check(JavaMethod method, ConditionEvents events) {
                method.getParameters().stream()
                        .filter(parameter -> parameter.getRawType().isEquivalentTo(AdministrationChannel.class))
                        .filter(parameter -> !parameter.getAnnotations().isEmpty())
                        .map(JavaParameter::getIndex)
                        .forEach(index -> events.add(SimpleConditionEvent.violated(method, method.getFullName() + " binds the channel from the request")));
            }
        };
    }

    @Test
    @DisplayName("Given a planted controller that checks the scope claim, reads a claim by reference, through the token's attributes and an expression, and binds the channel from the query, when the rules check it, then each is reported and the subject and a bare channel are not")
    void should_report_every_claim_read_when_checked_given_a_planted_controller(@TempDir Path folder) throws IOException {
        JavaClasses planted = PlantedClasses.compiled(folder, Map.of("cz.novanadeje.app.planteda.interfaces.rest.PlantedChannelController", """
                package cz.novanadeje.app.planteda.interfaces.rest;

                import cz.novanadeje.app.shared.application.administration.AdministrationChannel;
                import java.util.function.Function;
                import org.springframework.security.core.annotation.AuthenticationPrincipal;
                import org.springframework.security.oauth2.jwt.Jwt;
                import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
                import org.springframework.web.bind.annotation.RequestParam;

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

                    Object attributes(JwtAuthenticationToken token) {
                        return token.getTokenAttributes().get("scope");
                    }

                    String expressed(@AuthenticationPrincipal(expression = "claims['scope']") String scope) {
                        return scope;
                    }

                    String chosen(@RequestParam AdministrationChannel channel) {
                        return channel.name();
                    }

                    String resolved(AdministrationChannel channel) {
                        return channel.name();
                    }
                }
                """));

        assertThat(controllers_take_the_channel_and_never_read_a_claim.evaluate(planted).getFailureReport().getDetails())
                .hasSize(3)
                .anySatisfy(detail -> assertThat(detail).contains("connected"))
                .anySatisfy(detail -> assertThat(detail).contains("claims"))
                .anySatisfy(detail -> assertThat(detail).contains("attributes"));
        assertThat(handlers_take_no_principal_expression.evaluate(planted).getFailureReport().getDetails())
                .singleElement().satisfies(detail -> assertThat(detail).contains("expressed"));
        assertThat(the_channel_is_never_bound_from_the_request.evaluate(planted).getFailureReport().getDetails())
                .singleElement().satisfies(detail -> assertThat(detail).contains("chosen"));
    }
}
