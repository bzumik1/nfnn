package cz.novanadeje.app.architecture;

import com.tngtech.archunit.base.DescribedPredicate;
import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;
import cz.novanadeje.app.AppApplication;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Path;
import java.util.Map;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.classes;
import static org.assertj.core.api.Assertions.assertThat;

@AnalyzeClasses(
        packagesOf = AppApplication.class,
        importOptions = ImportOption.DoNotIncludeTests.class
)
class SingleUseCredentialRulesTest {

    private static final String CONDITIONAL_SPEND = "markUsed";
    private static final String REPOSITORY_SUFFIX = "Repository";

    private static final DescribedPredicate<JavaClass> SPENT_BY_A_CONDITIONAL_UPDATE = DescribedPredicate.describe(
            "are domain credentials whose repository spends them by a conditional " + CONDITIONAL_SPEND,
            SingleUseCredentialRulesTest::isSpentByAConditionalUpdate);

    @ArchTest
    static final ArchRule single_use_credentials_never_change_their_own_spend_state = classes()
            .that(SPENT_BY_A_CONDITIONAL_UPDATE)
            .should().haveOnlyFinalFields()
            .because("a single-use secret is spent only by its repository's conditional update, never by load, change and save,"
                    + " so the domain object offers nothing a save could write back (database.md, architecture audit #621)");

    @Test
    @DisplayName("Given the donors' domain, when the credentials spent by a conditional update are picked, then all seven are among them, so none leaves the rule unnoticed")
    void should_pick_every_known_credential_when_picked_given_the_donors_domain() {
        JavaClasses domain = new ClassFileImporter()
                .withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
                .importPackages("cz.novanadeje.app.donors.domain");

        assertThat(domain.stream().filter(SPENT_BY_A_CONDITIONAL_UPDATE).map(JavaClass::getSimpleName))
                .contains("RefreshToken", "SecondFactorRecovery", "PasswordResetToken", "EmailVerificationToken", "AuthorizationCode",
                        "SecondFactorChallenge", "PasskeyChallenge");
    }

    private static boolean isSpentByAConditionalUpdate(JavaClass candidate) {
        return candidate.getPackageName().contains(".domain") && !candidate.isInterface()
                && candidate.getPackage().getClasses().stream()
                .filter(JavaClass::isInterface)
                .filter(repository -> repository.getSimpleName().equals(candidate.getSimpleName() + REPOSITORY_SUFFIX))
                .flatMap(repository -> repository.getMethods().stream())
                .anyMatch(method -> method.getName().equals(CONDITIONAL_SPEND) && method.getRawReturnType().isEquivalentTo(boolean.class));
    }

    @Nested
    @DisplayName("Given planted credentials beside their repositories")
    class GivenPlantedCredentials {

        @Test
        @DisplayName("when the rule checks a credential that marks itself used, one that holds only final fields and one whose repository spends nothing conditionally, then only the first is reported")
        void should_report_only_the_self_spending_credential_when_checked_given_planted_credentials(@TempDir Path folder) throws IOException {
            JavaClasses planted = PlantedClasses.compiled(folder, Map.of(
                    "cz.novanadeje.app.planted.domain.PlantedToken", """
                            package cz.novanadeje.app.planted.domain;

                            import java.time.Instant;

                            public final class PlantedToken {

                                private Instant usedAt;

                                public void markUsed(Instant at) {
                                    usedAt = at;
                                }
                            }
                            """,
                    "cz.novanadeje.app.planted.domain.PlantedTokenRepository", """
                            package cz.novanadeje.app.planted.domain;

                            import java.time.Instant;
                            import java.util.UUID;

                            public interface PlantedTokenRepository {

                                boolean markUsed(UUID tokenId, Instant at);
                            }
                            """,
                    "cz.novanadeje.app.planted.domain.PlantedCode", """
                            package cz.novanadeje.app.planted.domain;

                            import java.time.Instant;

                            public final class PlantedCode {

                                private final Instant usedAt;

                                public PlantedCode(Instant usedAt) {
                                    this.usedAt = usedAt;
                                }
                            }
                            """,
                    "cz.novanadeje.app.planted.domain.PlantedCodeRepository", """
                            package cz.novanadeje.app.planted.domain;

                            import java.time.Instant;
                            import java.util.UUID;

                            public interface PlantedCodeRepository {

                                boolean markUsed(UUID codeId, Instant at);
                            }
                            """,
                    "cz.novanadeje.app.planted.domain.PlantedNote", """
                            package cz.novanadeje.app.planted.domain;

                            public final class PlantedNote {

                                private String text;

                                public void rewrite(String text) {
                                    this.text = text;
                                }
                            }
                            """,
                    "cz.novanadeje.app.planted.domain.PlantedNoteRepository", """
                            package cz.novanadeje.app.planted.domain;

                            public interface PlantedNoteRepository {

                                void save(PlantedNote note);
                            }
                            """));

            assertThat(single_use_credentials_never_change_their_own_spend_state.evaluate(planted).getFailureReport().getDetails())
                    .singleElement().asString().contains("PlantedToken").contains("usedAt");
        }
    }
}
