package cz.novanadeje.app.architecture;

import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;
import cz.novanadeje.app.AppApplication;

import static com.tngtech.archunit.core.domain.JavaAccess.Predicates.target;
import static com.tngtech.archunit.core.domain.JavaClass.Predicates.assignableTo;
import static com.tngtech.archunit.core.domain.properties.HasName.Predicates.nameMatching;
import static com.tngtech.archunit.core.domain.properties.HasOwner.Predicates.With.owner;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

@AnalyzeClasses(
        packagesOf = AppApplication.class,
        importOptions = ImportOption.DoNotIncludeTests.class
)
class ProblemBodyRulesTest {

    @ArchTest
    static final ArchRule answers_must_not_carry_an_exception_message = noClasses()
            .that().resideInAnyPackage("..interfaces..", "cz.novanadeje.app.shared.infrastructure.security..")
            .should().accessTargetWhere(target(nameMatching("getMessage|getLocalizedMessage|toString"))
                    .and(target(owner(assignableTo(Throwable.class)))))
            .because("an answer takes its texts from the message bundles, never from an exception, whose message and string form may carry a value the client sent (security.md, Output)");
}
