package cz.novanadeje.app.architecture;

import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;
import cz.novanadeje.app.AppApplication;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.RepeatedTest;
import org.junit.jupiter.api.TestFactory;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.methods;

@AnalyzeClasses(
        packagesOf = AppApplication.class,
        importOptions = ImportOption.OnlyIncludeTests.class
)
class TestNamingRulesTest {

    @ArchTest
    static final ArchRule every_test_reads_as_given_when_then = methods()
            .that().areAnnotatedWith(Test.class)
            .or().areAnnotatedWith(ParameterizedTest.class)
            .or().areAnnotatedWith(RepeatedTest.class)
            .or().areAnnotatedWith(TestFactory.class)
            .should().beAnnotatedWith(DisplayName.class);
}
