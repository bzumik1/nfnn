package cz.novanadeje.app.architecture;

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

import static com.tngtech.archunit.library.dependencies.SlicesRuleDefinition.slices;
import static org.assertj.core.api.Assertions.assertThat;

@AnalyzeClasses(
        packagesOf = AppApplication.class,
        importOptions = ImportOption.DoNotIncludeTests.class
)
class PackageCycleRulesTest {

    @ArchTest
    static final ArchRule no_package_depends_on_itself_through_others = slices()
            .matching("cz.novanadeje.app.(**)")
            .namingSlices("$1")
            .should().beFreeOfCycles()
            .because("a package that needs another which needs it back is not a module of its own (architecture audit #621)");

    @Test
    @DisplayName("Given two planted packages of one layer that import each other, when the cycle rule checks them, then the cycle is reported")
    void should_report_the_cycle_when_checked_given_two_packages_importing_each_other(@TempDir Path folder) throws IOException {
        JavaClasses planted = PlantedClasses.compiled(folder, Map.of(
                "cz.novanadeje.app.planteda.domain.gift.Gift", """
                        package cz.novanadeje.app.planteda.domain.gift;
                        public class Gift { cz.novanadeje.app.planteda.domain.donor.Donor donor; }
                        """,
                "cz.novanadeje.app.planteda.domain.donor.Donor", """
                        package cz.novanadeje.app.planteda.domain.donor;
                        public class Donor { cz.novanadeje.app.planteda.domain.gift.Gift gift; }
                        """,
                "cz.novanadeje.app.planteda.domain.receipt.Receipt", """
                        package cz.novanadeje.app.planteda.domain.receipt;
                        public class Receipt { cz.novanadeje.app.planteda.domain.gift.Gift gift; }
                        """));

        assertThat(no_package_depends_on_itself_through_others.evaluate(planted).getFailureReport().getDetails())
                .singleElement().asString().contains("planteda.domain.gift").contains("planteda.domain.donor").doesNotContain("planteda.domain.receipt");
    }
}
