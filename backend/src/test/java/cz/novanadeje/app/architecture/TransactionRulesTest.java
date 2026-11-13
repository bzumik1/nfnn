package cz.novanadeje.app.architecture;

import com.tngtech.archunit.base.DescribedPredicate;
import com.tngtech.archunit.core.domain.JavaAnnotation;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.domain.JavaEnumConstant;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;
import cz.novanadeje.app.AppApplication;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.nio.file.Path;
import java.util.Map;

import static com.tngtech.archunit.base.DescribedPredicate.describe;
import static com.tngtech.archunit.lang.conditions.ArchConditions.beMetaAnnotatedWith;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noCodeUnits;
import static org.assertj.core.api.Assertions.assertThat;

@AnalyzeClasses(
        packagesOf = AppApplication.class,
        importOptions = ImportOption.DoNotIncludeTests.class
)
class TransactionRulesTest {

    private static final String JAKARTA_TRANSACTIONAL = "jakarta.transaction.Transactional";
    private static final String ADAPTERS = "cz.novanadeje.app.*.infrastructure..";
    private static final String BOUNDARY = "backend.md, Application: the application service sets the transaction boundary and an adapter only joins it";
    private static final DescribedPredicate<JavaAnnotation<?>> OWN_TRANSACTION = describe("@Transactional that does not require a running transaction",
            annotation -> annotation.getRawType().isEquivalentTo(Transactional.class) && !joinsARunningTransaction(annotation));

    @ArchTest
    static final ArchRule adapters_join_the_transaction_of_the_use_case = noCodeUnits()
            .that().areDeclaredInClassesThat().resideInAPackage(ADAPTERS)
            .should(beMetaAnnotatedWith(OWN_TRANSACTION))
            .because(BOUNDARY);

    @ArchTest
    static final ArchRule adapter_classes_join_the_transaction_of_the_use_case = noClasses()
            .that().resideInAPackage(ADAPTERS)
            .should(beMetaAnnotatedWith(OWN_TRANSACTION))
            .because(BOUNDARY);

    @ArchTest
    static final ArchRule transactions_are_springs = noClasses()
            .should().dependOnClassesThat().haveFullyQualifiedName(JAKARTA_TRANSACTIONAL)
            .because("Spring's @Transactional carries the propagation the adapter rules check; jakarta.transaction.Transactional defaults to opening one");

    @Test
    @DisplayName("Given an adapter whose class and writes open their own transaction, directly, through an annotation or the Jakarta way, when the transaction rules check it, then each is reported and a joining write is not")
    void should_report_every_own_transaction_when_checked_given_a_planted_adapter(@TempDir Path folder) throws IOException {
        JavaClasses planted = PlantedClasses.compiled(folder, Map.of("cz.novanadeje.app.planteda.infrastructure.persistence.PlantedRows", """
                package cz.novanadeje.app.planteda.infrastructure.persistence;

                import org.springframework.transaction.annotation.Propagation;
                import org.springframework.transaction.annotation.Transactional;

                @Transactional
                class PlantedRows {

                    @Writes
                    void opensOneThroughItsAnnotation() {
                    }

                    @jakarta.transaction.Transactional
                    void opensOneTheJakartaWay() {
                    }

                    @Transactional
                    void opensItsOwn() {
                    }

                    @Transactional(propagation = Propagation.REQUIRES_NEW)
                    void opensANewOne() {
                    }

                    @Transactional(propagation = Propagation.MANDATORY)
                    void joins() {
                    }
                }
                """, "cz.novanadeje.app.planteda.infrastructure.persistence.Writes", """
                package cz.novanadeje.app.planteda.infrastructure.persistence;

                import java.lang.annotation.Retention;
                import java.lang.annotation.RetentionPolicy;
                import org.springframework.transaction.annotation.Transactional;

                @Retention(RetentionPolicy.RUNTIME)
                @Transactional
                @interface Writes {
                }
                """));

        assertThat(adapters_join_the_transaction_of_the_use_case.evaluate(planted).getFailureReport().getDetails())
                .hasSize(3)
                .anySatisfy(detail -> assertThat(detail).contains("opensItsOwn"))
                .anySatisfy(detail -> assertThat(detail).contains("opensANewOne"))
                .anySatisfy(detail -> assertThat(detail).contains("opensOneThroughItsAnnotation"));
        assertThat(adapter_classes_join_the_transaction_of_the_use_case.evaluate(planted).getFailureReport().getDetails())
                .hasSize(2)
                .anySatisfy(detail -> assertThat(detail).contains("PlantedRows"))
                .anySatisfy(detail -> assertThat(detail).contains("persistence.Writes"));
        assertThat(transactions_are_springs.evaluate(planted).getFailureReport().getDetails())
                .singleElement().satisfies(detail -> assertThat(detail).contains("opensOneTheJakartaWay"));
    }

    private static boolean joinsARunningTransaction(JavaAnnotation<?> transactional) {
        return transactional.get("propagation").filter(JavaEnumConstant.class::isInstance).map(JavaEnumConstant.class::cast)
                .map(propagation -> propagation.name().equals(Propagation.MANDATORY.name())).orElse(false);
    }
}
