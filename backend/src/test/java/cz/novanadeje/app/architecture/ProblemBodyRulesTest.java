package cz.novanadeje.app.architecture;

import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;
import com.tngtech.archunit.base.DescribedPredicate;
import com.tngtech.archunit.core.domain.JavaAnnotation;
import cz.novanadeje.app.AppApplication;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.web.bind.annotation.ControllerAdvice;

import static com.tngtech.archunit.core.domain.JavaAccess.Predicates.target;
import static com.tngtech.archunit.core.domain.JavaClass.Predicates.assignableTo;
import static com.tngtech.archunit.core.domain.properties.HasName.Predicates.nameMatching;
import static com.tngtech.archunit.core.domain.properties.HasOwner.Predicates.With.owner;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.classes;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

@AnalyzeClasses(
        packagesOf = AppApplication.class,
        importOptions = ImportOption.DoNotIncludeTests.class
)
class ProblemBodyRulesTest {

    private static final String CATCH_ALL = "cz.novanadeje.app.shared.interfaces.rest.UnhandledExceptionHandler";

    @ArchTest
    static final ArchRule answers_must_not_carry_an_exception_message = noClasses()
            .that().resideInAnyPackage("..interfaces..", "cz.novanadeje.app.shared.infrastructure.security..")
            .should().accessTargetWhere(target(nameMatching("getMessage|getLocalizedMessage|toString"))
                    .and(target(owner(assignableTo(Throwable.class)))))
            .because("an answer takes its texts from the message bundles, never from an exception, whose message and string form may carry a value the client sent (security.md, Output)");

    @ArchTest
    static final ArchRule every_other_controller_advice_must_be_ordered_before_the_catch_all = classes()
            .that().areMetaAnnotatedWith(ControllerAdvice.class)
            .and().doNotHaveFullyQualifiedName(CATCH_ALL)
            .should().beAnnotatedWith(orderedBefore(Ordered.LOWEST_PRECEDENCE))
            .because("Spring asks the advices in their order and the first one with a matching handler answers, so an advice ordered with or after the catch-all would lose its exceptions to a 500 (docs/system-overview.md, shared, Problem answers)");

    @ArchTest
    static final ArchRule the_catch_all_must_be_ordered_last = classes()
            .that().haveFullyQualifiedName(CATCH_ALL)
            .should().beMetaAnnotatedWith(ControllerAdvice.class)
            .andShould().beAnnotatedWith(orderedAt(Ordered.LOWEST_PRECEDENCE))
            .because("the catch-all answers only what no other advice, by the exception or by one of its causes, answers");

    private static DescribedPredicate<JavaAnnotation<?>> orderedBefore(int order) {
        return DescribedPredicate.describe("@Order before " + order, annotation -> isOrder(annotation) && orderOf(annotation) < order);
    }

    private static DescribedPredicate<JavaAnnotation<?>> orderedAt(int order) {
        return DescribedPredicate.describe("@Order(" + order + ")", annotation -> isOrder(annotation) && orderOf(annotation) == order);
    }

    private static boolean isOrder(JavaAnnotation<?> annotation) {
        return annotation.getRawType().isEquivalentTo(Order.class);
    }

    private static int orderOf(JavaAnnotation<?> annotation) {
        return annotation.get("value").map(Integer.class::cast).orElse(Ordered.LOWEST_PRECEDENCE);
    }
}
