package cz.novanadeje.app.architecture;

import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;
import cz.novanadeje.app.AppApplication;
import cz.novanadeje.app.donors.domain.RefreshToken;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Path;
import java.util.Map;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static org.assertj.core.api.Assertions.assertThat;

@AnalyzeClasses(
        packagesOf = AppApplication.class,
        importOptions = ImportOption.DoNotIncludeTests.class
)
class RefreshTokenReuseGraceRulesTest {

    @ArchTest
    static final ArchRule only_the_refresh_token_reads_its_reuse_grace = noClasses()
            .that().doNotHaveFullyQualifiedName(RefreshToken.class.getName())
            .should().accessField(RefreshToken.class, "REUSE_GRACE")
            .because("security.md, Credentials (D28): the 60 s reuse grace is the refresh token's own rule (RefreshToken.wasUsedWithinReuseGraceAt), "
                    + "so no service decides it again from the window");

    @Test
    @DisplayName("Given a planted session service that reads the reuse grace itself, when the rule checks it, then it is reported")
    void should_report_a_service_reading_the_reuse_grace_when_checked_given_a_planted_service(@TempDir Path folder) throws IOException {
        JavaClasses planted = PlantedClasses.compiled(folder, Map.of("cz.novanadeje.app.donors.application.PlantedSessions", """
                package cz.novanadeje.app.donors.application;

                import cz.novanadeje.app.donors.domain.RefreshToken;
                import java.time.Instant;

                class PlantedSessions {

                    boolean withinGrace(Instant usedAt, Instant now) {
                        return now.isBefore(usedAt.plus(RefreshToken.REUSE_GRACE));
                    }
                }
                """));

        assertThat(only_the_refresh_token_reads_its_reuse_grace.evaluate(planted).getFailureReport().getDetails())
                .singleElement().satisfies(detail -> assertThat(detail).contains("PlantedSessions.withinGrace").contains("REUSE_GRACE"));
    }
}
