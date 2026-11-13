package cz.novanadeje.app.architecture;

import com.tngtech.archunit.base.DescribedPredicate;
import com.tngtech.archunit.core.domain.AccessTarget.CodeUnitAccessTarget;
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

import java.io.IOException;
import java.nio.file.Path;
import java.util.Map;
import java.util.Set;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static org.assertj.core.api.Assertions.assertThat;

@AnalyzeClasses(
        packagesOf = AppApplication.class,
        importOptions = ImportOption.DoNotIncludeTests.class
)
class LocaleRulesTest {

    private static final Set<String> CASE_CHANGES = Set.of("toLowerCase", "toUpperCase");

    private static final DescribedPredicate<JavaAccess<?>> A_CASE_CHANGE_IN_THE_DEFAULT_LOCALE = DescribedPredicate.describe(
            "String.toLowerCase() or String.toUpperCase() without a Locale",
            access -> access.getTarget() instanceof CodeUnitAccessTarget target
                    && access.getTargetOwner().isEquivalentTo(String.class)
                    && CASE_CHANGES.contains(target.getName())
                    && target.getRawParameterTypes().isEmpty());

    @ArchTest
    static final ArchRule case_changes_name_their_locale = noClasses()
            .should().accessTargetWhere(A_CASE_CHANGE_IN_THE_DEFAULT_LOCALE)
            .because("the default locale changes what a case change gives (a Turkish locale lowers I to a dotless ı), "
                    + "so a header, a key or an address compared after one would differ from machine to machine; name Locale.ROOT");

    @Test
    @DisplayName("Given a planted class that changes case without a locale, by a call and by a method reference, when the rule checks it, then both are reported and a change with Locale.ROOT is not")
    void should_report_every_case_change_without_a_locale_when_checked_given_a_planted_class(@TempDir Path folder) throws IOException {
        JavaClasses planted = PlantedClasses.compiled(folder, Map.of("cz.novanadeje.app.planteda.infrastructure.PlantedHeaders", """
                package cz.novanadeje.app.planteda.infrastructure;

                import java.util.Locale;
                import java.util.function.Function;

                class PlantedHeaders {

                    boolean isJson(String contentType) {
                        return contentType.toLowerCase().startsWith("application/json");
                    }

                    Function<String, String> upper() {
                        return String::toUpperCase;
                    }

                    String named(String header) {
                        return header.toLowerCase(Locale.ROOT);
                    }
                }
                """));

        assertThat(case_changes_name_their_locale.evaluate(planted).getFailureReport().getDetails())
                .hasSize(2)
                .anySatisfy(detail -> assertThat(detail).contains("isJson"))
                .anySatisfy(detail -> assertThat(detail).contains("upper"))
                .noneSatisfy(detail -> assertThat(detail).contains("named"));
    }
}
