package cz.novanadeje.app.architecture;

import com.tngtech.archunit.base.DescribedPredicate;
import com.tngtech.archunit.core.domain.JavaMethod;
import com.tngtech.archunit.core.domain.JavaParameter;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchCondition;
import com.tngtech.archunit.lang.ArchRule;
import com.tngtech.archunit.lang.ConditionEvents;
import com.tngtech.archunit.lang.SimpleConditionEvent;
import cz.novanadeje.app.AppApplication;
import cz.novanadeje.app.shared.application.version.ExpectedVersion;
import org.springframework.web.bind.annotation.RequestBody;

import java.util.List;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.methods;

@AnalyzeClasses(packagesOf = AppApplication.class, importOptions = ImportOption.DoNotIncludeTests.class)
class ExpectedVersionRulesTest {

    @ArchTest
    static final ArchRule a_versioned_handler_reads_its_body_before_the_version = methods()
            .that(new DescribedPredicate<>("name an expected version") {
                @Override
                public boolean test(JavaMethod method) {
                    return method.getParameters().stream().anyMatch(ExpectedVersionRulesTest::isExpectedVersion);
                }
            })
            .should(new ArchCondition<>("declare every @RequestBody parameter before the expected version, so a body that fails validation answers 400 before a missing version answers 428") {
                @Override
                public void check(JavaMethod method, ConditionEvents events) {
                    List<JavaParameter> parameters = method.getParameters();
                    int version = parameters.stream().filter(ExpectedVersionRulesTest::isExpectedVersion).findFirst().orElseThrow().getIndex();
                    boolean bodyAfter = parameters.stream().anyMatch(parameter -> parameter.getIndex() > version && parameter.isAnnotatedWith(RequestBody.class));
                    events.add(new SimpleConditionEvent(method, !bodyAfter, method.getFullName() + (bodyAfter ? " reads its body after the version" : " reads its body first")));
                }
            });

    private static boolean isExpectedVersion(JavaParameter parameter) {
        return parameter.getRawType().isEquivalentTo(ExpectedVersion.class);
    }
}
