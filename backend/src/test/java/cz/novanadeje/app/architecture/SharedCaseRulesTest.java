package cz.novanadeje.app.architecture;

import com.tngtech.archunit.base.DescribedPredicate;
import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;
import cz.novanadeje.app.AppApplication;
import cz.novanadeje.app.sharedcases.SharedCaseRunner;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.net.URISyntaxException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import static com.tngtech.archunit.lang.conditions.ArchConditions.be;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.classes;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static org.assertj.core.api.Assertions.assertThat;

@AnalyzeClasses(
        packagesOf = AppApplication.class,
        importOptions = ImportOption.OnlyIncludeTests.class
)
class SharedCaseRulesTest {

    private static final String ROOT = "cz.novanadeje.app.";
    private static final Set<String> LAYERS = Set.of("domain", "application", "infrastructure", "interfaces");

    private static final DescribedPredicate<JavaClass> IN_A_CONTEXT_OF_THE_MAIN_CODE = DescribedPredicate.describe(
            "reside in a context or the kernel of the main code (a package under " + ROOT + " whose main classes have a layer)",
            type -> type.getPackageName().startsWith(ROOT) && contextsOfTheMainCode().contains(topPackageOf(type)));

    @ArchTest
    static final ArchRule shared_case_runners_live_beside_the_code_they_call = classes()
            .that().areAssignableTo(SharedCaseRunner.class)
            .and().doNotHaveFullyQualifiedName(SharedCaseRunner.class.getName())
            .should(be(IN_A_CONTEXT_OF_THE_MAIN_CODE));

    @ArchTest
    static final ArchRule shared_case_infrastructure_does_not_depend_on_the_v2_baseline = noClasses()
            .that().resideInAPackage("cz.novanadeje.app.sharedcases..")
            .should().dependOnClassesThat()
            .resideInAPackage("cz.novanadeje.app.regression..");

    @Test
    @DisplayName("Given the main code, when its contexts are derived, then they are the five contexts and the kernel, so no list of contexts needs a change for a new one")
    void should_derive_the_contexts_and_the_kernel_when_read_given_the_main_code() {
        assertThat(contextsOfTheMainCode()).contains("content", "donors", "donations", "contact", "operations", "shared")
                .doesNotContain("sharedcases", "regression", "architecture", "cucumber");
    }

    @Test
    @DisplayName("Given planted runners in the shared-case infrastructure, in a package without main code and beside a context's code, and shared-case code on the baseline, when the rules check them, then each misplaced one is reported and the one beside the context is not")
    void should_report_misplaced_runners_when_checked_given_planted_runners(@TempDir Path folder) throws IOException {
        JavaClasses planted = PlantedClasses.compiled(folder, Map.of(
                "cz.novanadeje.app.sharedcases.PlantedRunner", runner("cz.novanadeje.app.sharedcases", "PlantedRunner"),
                "cz.novanadeje.app.planteda.PlantedOrphanRunner", runner("cz.novanadeje.app.planteda", "PlantedOrphanRunner"),
                "cz.novanadeje.app.donations.application.PlantedBesideRunner", runner("cz.novanadeje.app.donations.application", "PlantedBesideRunner"),
                "cz.novanadeje.app.sharedcases.PlantedBaselineReader", """
                        package cz.novanadeje.app.sharedcases;

                        class PlantedBaselineReader {
                            cz.novanadeje.app.regression.PlantedBaseline baseline;
                        }
                        """,
                "cz.novanadeje.app.regression.PlantedBaseline", """
                        package cz.novanadeje.app.regression;

                        public class PlantedBaseline {
                        }
                        """));

        assertThat(shared_case_runners_live_beside_the_code_they_call.evaluate(planted).getFailureReport().getDetails())
                .hasSize(2)
                .anySatisfy(detail -> assertThat(detail).contains("PlantedRunner"))
                .anySatisfy(detail -> assertThat(detail).contains("PlantedOrphanRunner"))
                .noneSatisfy(detail -> assertThat(detail).contains("PlantedBesideRunner"));
        assertThat(shared_case_infrastructure_does_not_depend_on_the_v2_baseline.evaluate(planted).getFailureReport().getDetails())
                .isNotEmpty().allSatisfy(detail -> assertThat(detail).contains("PlantedBaselineReader"));
    }

    private static String runner(String packageName, String name) {
        return "package " + packageName + ";\n\npublic abstract class " + name + " extends cz.novanadeje.app.sharedcases.SharedCaseRunner {\n}\n";
    }

    private static String topPackageOf(JavaClass type) {
        String below = type.getPackageName().substring(ROOT.length());
        int dot = below.indexOf('.');
        return dot < 0 ? below : below.substring(0, dot);
    }

    private static Set<String> contextsOfTheMainCode() {
        Path main = mainClasses().resolve(ROOT.replace('.', '/'));
        try (Stream<Path> packages = Files.list(main)) {
            return packages.filter(Files::isDirectory)
                    .filter(candidate -> LAYERS.stream().anyMatch(layer -> Files.isDirectory(candidate.resolve(layer))))
                    .map(candidate -> candidate.getFileName().toString())
                    .collect(Collectors.toSet());
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private static Path mainClasses() {
        try {
            return Path.of(AppApplication.class.getProtectionDomain().getCodeSource().getLocation().toURI());
        } catch (URISyntaxException e) {
            throw new IllegalStateException(e);
        }
    }
}
