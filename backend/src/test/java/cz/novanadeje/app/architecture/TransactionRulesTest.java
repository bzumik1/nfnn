package cz.novanadeje.app.architecture;

import com.tngtech.archunit.base.DescribedPredicate;
import com.tngtech.archunit.core.domain.JavaAccess;
import com.tngtech.archunit.core.domain.JavaConstructorCall;
import com.tngtech.archunit.core.domain.JavaFieldAccess;
import com.tngtech.archunit.core.domain.JavaMethodCall;
import com.tngtech.archunit.core.domain.JavaAnnotation;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.domain.JavaCodeUnit;
import com.tngtech.archunit.core.domain.JavaEnumConstant;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchCondition;
import com.tngtech.archunit.lang.ArchRule;
import com.tngtech.archunit.lang.ConditionEvents;
import com.tngtech.archunit.lang.SimpleConditionEvent;
import cz.novanadeje.app.AppApplication;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.DefaultTransactionDefinition;
import org.springframework.transaction.support.TransactionOperations;
import org.springframework.transaction.support.TransactionTemplate;

import java.io.IOException;
import java.nio.file.Path;
import java.util.Map;
import java.util.Optional;

import static com.tngtech.archunit.base.DescribedPredicate.describe;
import static com.tngtech.archunit.lang.conditions.ArchConditions.beMetaAnnotatedWith;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noCodeUnits;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

@AnalyzeClasses(
        packagesOf = AppApplication.class,
        importOptions = ImportOption.DoNotIncludeTests.class
)
class TransactionRulesTest {

    private static final String JAKARTA_TRANSACTIONAL = "jakarta.transaction.Transactional";
    private static final String ADAPTERS = "cz.novanadeje.app.*.infrastructure..";
    private static final String BOUNDARY = "backend.md, Application: the application service sets the transaction boundary and an adapter only joins it";
    private static final Map<String, String> SEPARATE_TRANSACTIONS = Map.of(
            "cz.novanadeje.app.donations.application.receipt.DonationReceiptIssuer", "one transaction per issue",
            "cz.novanadeje.app.donations.application.pairing.PaymentPairingService", "pairing called from an AFTER_COMMIT listener",
            "cz.novanadeje.app.donations.application.report.MonthlyReportFigures", "a REPEATABLE READ snapshot inside the sending transaction");
    private static final DescribedPredicate<JavaAnnotation<?>> A_NEW_TRANSACTION = describe("@Transactional(propagation = REQUIRES_NEW)",
            annotation -> annotation.getRawType().isEquivalentTo(Transactional.class) && propagationOf(annotation).filter(Propagation.REQUIRES_NEW.name()::equals).isPresent());
    private static final DescribedPredicate<JavaAccess<?>> A_PROPAGATION_CHOICE = describe(
            "a choice of propagation in code (Propagation.REQUIRES_NEW, setPropagationBehavior, a DefaultTransactionDefinition with a propagation)",
            access -> isRequiresNewConstant(access) || isPropagationSetter(access) || isDefinitionWithAPropagation(access));
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

    @ArchTest
    static final ArchRule new_transactions_are_opened_only_where_backend_md_names_them = noCodeUnits()
            .that().areDeclaredInClassesThat(describe("are not named in backend.md as opening a transaction of their own",
                    type -> !SEPARATE_TRANSACTIONS.containsKey(type.getName())))
            .should(beMetaAnnotatedWith(A_NEW_TRANSACTION))
            .orShould(chooseAPropagationInCode())
            .because("backend.md, Application: REQUIRES_NEW only where a separate transaction is the point, each one more connection (database.md)");

    @ArchTest
    static final ArchRule programmatic_transactions_belong_to_the_application = noClasses()
            .that().resideOutsideOfPackage("..application..")
            .should().dependOnClassesThat().haveFullyQualifiedName(TransactionOperations.class.getName())
            .orShould().dependOnClassesThat().haveFullyQualifiedName(TransactionTemplate.class.getName())
            .orShould().dependOnClassesThat().haveFullyQualifiedName(PlatformTransactionManager.class.getName())
            .orShould().dependOnClassesThat().haveFullyQualifiedName(DefaultTransactionDefinition.class.getName())
            .because(BOUNDARY + ", so an adapter or a controller never opens a transaction the MANDATORY rule cannot see");

    @Test
    @DisplayName("Given the classes named as opening a transaction of their own, when they are read, then each exists, so the list names no class that is gone")
    void should_find_every_named_class_when_read_given_the_separate_transactions() {
        assertThat(SEPARATE_TRANSACTIONS.keySet()).allSatisfy(name -> assertThatCode(() -> Class.forName(name)).doesNotThrowAnyException());
    }

    @Test
    @DisplayName("Given a planted service that opens a new transaction by annotation, by its enum and by a programmatic template, and an adapter with a template, when the rules check them, then each is reported and a plain service is not")
    void should_report_every_new_transaction_when_checked_given_planted_classes(@TempDir Path folder) throws IOException {
        JavaClasses planted = PlantedClasses.compiled(folder, Map.of("cz.novanadeje.app.planteda.application.PlantedSeparately", """
                package cz.novanadeje.app.planteda.application;

                import org.springframework.transaction.PlatformTransactionManager;
                import org.springframework.transaction.TransactionDefinition;
                import org.springframework.transaction.annotation.Propagation;
                import org.springframework.transaction.annotation.Transactional;
                import org.springframework.transaction.support.DefaultTransactionDefinition;
                import org.springframework.transaction.support.TransactionTemplate;

                class PlantedSeparately {

                    @Transactional(propagation = Propagation.REQUIRES_NEW)
                    void byAnnotation() {
                    }

                    Propagation byEnum() {
                        return Propagation.REQUIRES_NEW;
                    }

                    TransactionTemplate byTemplate(PlatformTransactionManager transactions) {
                        TransactionTemplate template = new TransactionTemplate(transactions);
                        template.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
                        return template;
                    }

                    DefaultTransactionDefinition byDefinition() {
                        return new DefaultTransactionDefinition(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
                    }

                    @Transactional
                    void joins() {
                    }
                }
                """, "cz.novanadeje.app.planteda.infrastructure.persistence.PlantedTemplateRows", """
                package cz.novanadeje.app.planteda.infrastructure.persistence;

                import org.springframework.transaction.support.TransactionOperations;

                class PlantedTemplateRows {

                    void write(TransactionOperations transactions) {
                        transactions.executeWithoutResult(status -> {
                        });
                    }
                }
                """));

        assertThat(new_transactions_are_opened_only_where_backend_md_names_them.evaluate(planted).getFailureReport().getDetails())
                .hasSize(4)
                .anySatisfy(detail -> assertThat(detail).contains("byAnnotation"))
                .anySatisfy(detail -> assertThat(detail).contains("byEnum"))
                .anySatisfy(detail -> assertThat(detail).contains("byTemplate"))
                .anySatisfy(detail -> assertThat(detail).contains("byDefinition"));
        assertThat(programmatic_transactions_belong_to_the_application.evaluate(planted).getFailureReport().getDetails())
                .isNotEmpty()
                .allSatisfy(detail -> assertThat(detail).contains("PlantedTemplateRows"));
    }

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

    private static ArchCondition<JavaCodeUnit> chooseAPropagationInCode() {
        return new ArchCondition<>("make " + A_PROPAGATION_CHOICE.getDescription()) {
            @Override
            public void check(JavaCodeUnit codeUnit, ConditionEvents events) {
                codeUnit.getAccessesFromSelf().stream()
                        .filter(A_PROPAGATION_CHOICE)
                        .forEach(access -> events.add(SimpleConditionEvent.satisfied(codeUnit, codeUnit.getFullName() + " " + access.getDescription())));
            }
        };
    }

    private static boolean joinsARunningTransaction(JavaAnnotation<?> transactional) {
        return propagationOf(transactional).filter(Propagation.MANDATORY.name()::equals).isPresent();
    }

    private static Optional<String> propagationOf(JavaAnnotation<?> transactional) {
        return transactional.get("propagation").filter(JavaEnumConstant.class::isInstance).map(JavaEnumConstant.class::cast).map(JavaEnumConstant::name);
    }

    private static boolean isRequiresNewConstant(JavaAccess<?> access) {
        return access instanceof JavaFieldAccess field && field.getTargetOwner().isEquivalentTo(Propagation.class)
                && field.getTarget().getName().equals(Propagation.REQUIRES_NEW.name());
    }

    private static boolean isPropagationSetter(JavaAccess<?> access) {
        return access instanceof JavaMethodCall call && call.getTarget().getName().equals("setPropagationBehavior")
                && call.getTargetOwner().isAssignableTo(DefaultTransactionDefinition.class);
    }

    private static boolean isDefinitionWithAPropagation(JavaAccess<?> access) {
        return access instanceof JavaConstructorCall call && call.getTargetOwner().isAssignableTo(DefaultTransactionDefinition.class)
                && call.getTarget().getRawParameterTypes().stream().anyMatch(type -> type.isEquivalentTo(int.class));
    }
}
