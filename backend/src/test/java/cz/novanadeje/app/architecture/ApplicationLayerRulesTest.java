package cz.novanadeje.app.architecture;

import com.tngtech.archunit.base.DescribedPredicate;
import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.domain.JavaCodeUnit;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchCondition;
import com.tngtech.archunit.lang.ArchRule;
import com.tngtech.archunit.lang.ConditionEvents;
import com.tngtech.archunit.lang.SimpleConditionEvent;
import cz.novanadeje.app.AppApplication;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.stereotype.Component;
import org.springframework.stereotype.Repository;

import java.io.IOException;
import java.nio.file.Path;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.classes;
import static cz.novanadeje.app.architecture.MethodAccesses.callsOrReferences;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noCodeUnits;
import static org.assertj.core.api.Assertions.assertThat;

@AnalyzeClasses(
        packagesOf = AppApplication.class,
        importOptions = ImportOption.DoNotIncludeTests.class
)
class ApplicationLayerRulesTest {

    private static final String REPOSITORY_PARAMETER = "application_and_domain_code_takes_no_repository_parameter";

    private static final String AFTER_COMMIT_HELPER_UNTIL_PR_612 = "cz.novanadeje.app.donations.application.receipt.AfterCommit";

    private static final Set<String> HELPER_USERS_UNTIL_PR_612 = Set.of(
            "cz.novanadeje.app.donations.application.receipt.ReceiptSignatoryService",
            "cz.novanadeje.app.donations.application.receipt.ReceiptSignatureService");

    private static final Set<String> EXCEPTION_MESSAGES = Set.of("getMessage", "getLocalizedMessage");

    private static final List<String> PERSISTENCE_TECHNOLOGY = List.of(
            "org.springframework.data", "jakarta.persistence", "org.springframework.jdbc", "org.springframework.orm", "org.hibernate", "java.sql");

    private static final DescribedPredicate<JavaClass> PERSISTENCE_PORT = DescribedPredicate.describe(
            "a type of the site named …Repository, or a persistence adapter (annotated @Repository or on Spring Data, JPA or JDBC) or a port one implements",
            type -> type.getPackageName().startsWith("cz.novanadeje.app")
                    && (type.getSimpleName().endsWith("Repository") || isPersistenceAdapter(type)
                    || type.getAllSubclasses().stream().anyMatch(ApplicationLayerRulesTest::isPersistenceAdapter)));

    private static final DescribedPredicate<JavaClass> REPOSITORY = DescribedPredicate.describe("a repository of the site",
            type -> type.isAssignableTo(PERSISTENCE_PORT));

    private static JavaClasses planted;

    @ArchTest
    static final ArchRule application_must_not_depend_on_adapter_technology = noClasses()
            .that().resideInAPackage("..application..")
            .and(DescribedPredicate.describe("are not the after-commit helper of the receipt signatory and signature services, which move to AfterCommitWork after PR #612",
                    type -> !type.getName().equals(AFTER_COMMIT_HELPER_UNTIL_PR_612)
                            && !type.getName().startsWith(AFTER_COMMIT_HELPER_UNTIL_PR_612 + "$")))
            .should().dependOnClassesThat().resideInAnyPackage(
                    "org.springframework.dao..", "org.springframework.jdbc..", "org.springframework.orm..", "org.springframework.data..",
                    "jakarta.persistence..", "org.hibernate..", "java.sql..", "java.nio.file..",
                    "jakarta.mail..", "org.springframework.mail..", "org.thymeleaf..")
            .orShould().dependOnClassesThat().haveNameMatching("org\\.springframework\\.transaction\\.support\\.TransactionSynchronization.*")
            .because("backend.md, Application: the layer knows no HTTP, JPA entity or template; ports are interfaces implemented in infrastructure");

    @ArchTest
    static final ArchRule the_after_commit_helper_serves_only_the_receipt_signatory_and_signature_services_until_pr_612 = classes()
            .that().haveFullyQualifiedName(AFTER_COMMIT_HELPER_UNTIL_PR_612)
            .should().onlyHaveDependentClassesThat(DescribedPredicate.describe("are the helper itself or the receipt signatory and signature services",
                    type -> type.getName().startsWith(AFTER_COMMIT_HELPER_UNTIL_PR_612) || HELPER_USERS_UNTIL_PR_612.contains(type.getName())))
            .because("new work after commit goes through the AfterCommitWork port; this rule fails once the helper is gone, so its exception goes with it");

    @ArchTest
    static final ArchRule application_must_not_read_exception_messages = noClasses()
            .that().resideInAPackage("..application..")
            .should().accessTargetWhere(callsOrReferences("a read of an exception's message", Throwable.class, EXCEPTION_MESSAGES::contains))
            .because("security.md, Logs: an exception's message may quote a refused value, a bank's answer or SQL; the application logs and stores "
                    + "only closed values (an id, a kind, an outcome its port names), and adapters translate their failures into those");

    @ArchTest
    static final ArchRule application_and_domain_code_takes_no_repository_parameter = noCodeUnits()
            .that().areDeclaredInClassesThat().resideInAnyPackage("cz.novanadeje.app..application..", "cz.novanadeje.app..domain..")
            .and().areDeclaredInClassesThat(DescribedPredicate.describe("are not a repository of the site", type -> !REPOSITORY.test(type)))
            .and(DescribedPredicate.describe("are methods, or constructors of a record or of a class Spring does not inject",
                    codeUnit -> codeUnit.isMethod() || codeUnit.getOwner().isRecord() || !isSpringBean(codeUnit.getOwner())))
            .should(takeARepository())
            .because("backend.md, Application: a method that reads or writes through a repository it is handed hides a dependency and keeps a rule "
                    + "outside the aggregate or a domain service; a rule over loaded data goes to the domain or the view, a read or write to an injected collaborator");

    private static ArchCondition<JavaCodeUnit> takeARepository() {
        return new ArchCondition<>("take a repository as a parameter") {
            @Override
            public void check(JavaCodeUnit codeUnit, ConditionEvents events) {
                codeUnit.getParameters().stream()
                        .filter(parameter -> parameter.getType().getAllInvolvedRawTypes().stream().anyMatch(REPOSITORY))
                        .forEach(parameter -> events.add(SimpleConditionEvent.satisfied(codeUnit,
                                codeUnit.getDescription() + " takes the repository " + parameter.getType().getName() + " in " + codeUnit.getSourceCodeLocation())));
            }
        };
    }

    private static boolean isSpringBean(JavaClass type) {
        return type.isAnnotatedWith(Component.class) || type.isMetaAnnotatedWith(Component.class);
    }

    private static boolean isPersistenceAdapter(JavaClass type) {
        return type.isAnnotatedWith(Repository.class) || type.getDirectDependenciesFromSelf().stream()
                .map(dependency -> dependency.getTargetClass().getPackageName())
                .anyMatch(target -> PERSISTENCE_TECHNOLOGY.stream().anyMatch(target::startsWith));
    }

    @BeforeAll
    static void plantApplicationClassesOnAdapterTechnology(@TempDir Path folder) throws IOException {
        planted = PlantedClasses.compiled(folder, Stream.of(plantedClasses(), allowedClasses(), supportingClasses()).flatMap(classes -> classes)
                .collect(Collectors.toMap(PlantedClass::className, PlantedClass::source)));
    }

    @ParameterizedTest(name = "{0} reports {1}")
    @MethodSource("plantedClasses")
    @DisplayName("Given a planted application class on adapter technology, when the rule checks it, then exactly that class is reported")
    void should_report_the_planted_class_when_checked_given_an_application_class_on_adapter_technology(String rule, String className)
            throws ReflectiveOperationException {
        ArchRule checked = (ArchRule) ApplicationLayerRulesTest.class.getDeclaredField(rule).get(null);
        JavaClasses plantedClass = planted.that(DescribedPredicate.describe("the planted class", type -> type.getName().equals(className)));

        assertThat(checked.evaluate(plantedClass).getFailureReport().getDetails())
                .isNotEmpty().allSatisfy(detail -> assertThat(detail).contains(className.substring(className.lastIndexOf('.') + 1)));
    }

    @ParameterizedTest(name = "{0} leaves {1} alone")
    @MethodSource("allowedClasses")
    @DisplayName("Given a planted bean that uses its injected repository or a static method on plain values, when the rule checks every planted class, then that class is not reported")
    void should_report_nothing_when_checked_given_an_allowed_class(String rule, String className) throws ReflectiveOperationException {
        ArchRule checked = (ArchRule) ApplicationLayerRulesTest.class.getDeclaredField(rule).get(null);

        assertThat(checked.evaluate(planted).getFailureReport().getDetails())
                .isNotEmpty().noneSatisfy(detail -> assertThat(detail).contains(className.substring(className.lastIndexOf('.') + 1)));
    }

    static Stream<PlantedClass> plantedClasses() {
        String rule = "application_must_not_depend_on_adapter_technology";
        return Stream.of(
                planted(rule, "donations.application.PlantedDataAccessCatch",
                        "public class PlantedDataAccessCatch { void pair(Runnable work) { try { work.run(); } "
                                + "catch (org.springframework.dao.DataIntegrityViolationException lost) { } } }"),
                planted(rule, "donations.application.PlantedJdbc",
                        "public class PlantedJdbc { org.springframework.jdbc.core.simple.JdbcClient client() { return null; } }"),
                planted(rule, "donations.application.PlantedOrm",
                        "public class PlantedOrm { Class<?> failure() { return org.springframework.orm.ObjectOptimisticLockingFailureException.class; } }"),
                planted(rule, "donations.application.PlantedSpringData",
                        "public class PlantedSpringData { org.springframework.data.domain.Pageable page() { return null; } }"),
                planted(rule, "donations.application.PlantedEntity", "@jakarta.persistence.Entity public class PlantedEntity { }"),
                planted(rule, "donations.application.PlantedHibernate",
                        "public class PlantedHibernate { Class<?> failure() { return org.hibernate.HibernateException.class; } }"),
                planted(rule, "donations.application.receipt.AfterCommitLater",
                        "public class AfterCommitLater { boolean active() { "
                                + "return org.springframework.transaction.support.TransactionSynchronizationManager.isSynchronizationActive(); } }"),
                planted(rule, "donations.application.PlantedSql", "public class PlantedSql { java.sql.Connection connection() { return null; } }"),
                planted(rule, "operations.application.PlantedPath",
                        "public record PlantedPath(java.nio.file.Path path) { }"),
                planted(rule, "donors.application.PlantedMail",
                        "public class PlantedMail { jakarta.mail.internet.MimeMessage message() { return null; } }"),
                planted(rule, "donors.application.PlantedSpringMail",
                        "public class PlantedSpringMail { org.springframework.mail.javamail.JavaMailSender sender() { return null; } }"),
                planted(rule, "donors.application.PlantedTemplate",
                        "public class PlantedTemplate { org.thymeleaf.TemplateEngine engine() { return null; } }"),
                planted(rule, "donations.application.PlantedSynchronization",
                        "public class PlantedSynchronization { boolean active() { "
                                + "return org.springframework.transaction.support.TransactionSynchronizationManager.isSynchronizationActive(); } }"),
                planted(rule, "donations.application.PlantedSynchronizationCallback",
                        "public class PlantedSynchronizationCallback implements org.springframework.transaction.support.TransactionSynchronization { }"),
                planted("application_must_not_read_exception_messages", "donations.application.PlantedMessageRead",
                        "public class PlantedMessageRead { String outcome(IllegalStateException failure) { return failure.getMessage(); } }"),
                planted("application_must_not_read_exception_messages", "donors.application.PlantedLocalizedMessageRead",
                        "public class PlantedLocalizedMessageRead { String outcome(Exception failure) { return failure.getLocalizedMessage(); } }"),
                planted("application_must_not_read_exception_messages", "shared.application.PlantedMessageReference",
                        "public class PlantedMessageReference { java.util.function.Function<RuntimeException, String> outcome() { "
                                + "return RuntimeException::getMessage; } }"),
                planted(REPOSITORY_PARAMETER, "donations.application.admin.PlantedStaticCoverage",
                        "final class PlantedStaticCoverage { static boolean covers("
                                + "cz.novanadeje.app.donations.domain.receipt.DonationReceiptRepository receipts, java.util.List<String> ids) { "
                                + "return !ids.isEmpty(); } }"),
                planted(REPOSITORY_PARAMETER, "donors.domain.PlantedStaticDomainRead",
                        "public final class PlantedStaticDomainRead { public static int count(int limit, "
                                + "cz.novanadeje.app.donors.domain.DonorRepository donors) { return limit; } }"),
                planted(REPOSITORY_PARAMETER, "donations.application.banklogo.PlantedStaticOnImplementation",
                        "final class PlantedStaticOnImplementation { "
                                + "abstract static class Logos implements cz.novanadeje.app.donations.domain.banklogo.BankLogoRepository { } "
                                + "static void forget(Logos logos) { } }"),
                planted(REPOSITORY_PARAMETER, "donations.application.admin.PlantedInstanceRead",
                        "@org.springframework.stereotype.Service public class PlantedInstanceRead { boolean covers("
                                + "cz.novanadeje.app.donations.domain.receipt.DonationReceiptRepository receipts, java.util.List<String> ids) { "
                                + "return !ids.isEmpty(); } }"),
                planted(REPOSITORY_PARAMETER, "donors.application.PlantedOptionalRead",
                        "public class PlantedOptionalRead { int count(java.util.Optional<cz.novanadeje.app.donors.domain.DonorRepository> donors) { "
                                + "return donors.isPresent() ? 1 : 0; } }"),
                planted(REPOSITORY_PARAMETER, "donations.application.PlantedLedgerEntry",
                        "public class PlantedLedgerEntry { void record(cz.novanadeje.app.donations.domain.PlantedLedger ledger) { } }"),
                planted(REPOSITORY_PARAMETER, "content.application.PlantedViewOnMedia",
                        "public record PlantedViewOnMedia(cz.novanadeje.app.content.domain.media.MediaImageRepository media) { }"),
                planted(REPOSITORY_PARAMETER, "content.application.PlantedComponentRecord",
                        "@org.springframework.stereotype.Component public record PlantedComponentRecord("
                                + "cz.novanadeje.app.content.domain.media.MediaImageRepository media) { }"),
                planted(REPOSITORY_PARAMETER, "shared.application.PlantedTrailRead",
                        "public final class PlantedTrailRead { static boolean withdrawn(cz.novanadeje.app.shared.application.PlantedTrail trail) { "
                                + "return false; } }"));
    }

    static Stream<PlantedClass> allowedClasses() {
        return Stream.of(
                planted(REPOSITORY_PARAMETER, "donations.application.admin.PlantedInstanceCoverage",
                        "@org.springframework.stereotype.Component final class PlantedInstanceCoverage { "
                                + "private final cz.novanadeje.app.donations.domain.receipt.DonationReceiptRepository receipts; "
                                + "PlantedInstanceCoverage(cz.novanadeje.app.donations.domain.receipt.DonationReceiptRepository receipts) { "
                                + "this.receipts = receipts; } "
                                + "boolean covers(java.util.List<String> ids) { return ids.stream().anyMatch(id -> receipts.equals(id)); } }"),
                planted(REPOSITORY_PARAMETER, "donations.domain.PlantedStaticOnValues",
                        "public final class PlantedStaticOnValues { public static boolean covers(java.util.List<String> ids, java.time.Instant at) { "
                                + "return ids.stream().anyMatch(id -> at != null); } }"));
    }

    static Stream<PlantedClass> supportingClasses() {
        return Stream.of(
                planted(REPOSITORY_PARAMETER, "donations.domain.PlantedLedger", "public interface PlantedLedger { }"),
                planted(REPOSITORY_PARAMETER, "donations.infrastructure.persistence.PlantedJpaLedger",
                        "@org.springframework.stereotype.Repository class PlantedJpaLedger implements cz.novanadeje.app.donations.domain.PlantedLedger { }"),
                planted(REPOSITORY_PARAMETER, "shared.application.PlantedTrail", "public interface PlantedTrail { }"),
                planted(REPOSITORY_PARAMETER, "shared.infrastructure.audit.PlantedJpaTrail",
                        "@org.springframework.stereotype.Component class PlantedJpaTrail implements cz.novanadeje.app.shared.application.PlantedTrail { "
                                + "org.springframework.data.domain.Limit limit() { return org.springframework.data.domain.Limit.of(1); } }"));
    }

    private static PlantedClass planted(String rule, String relativeName, String body) {
        String className = "cz.novanadeje.app." + relativeName;
        return new PlantedClass(rule, className, "package " + className.substring(0, className.lastIndexOf('.')) + ";\n" + body + "\n");
    }

    record PlantedClass(String rule, String className, String source) implements Arguments {

        @Override
        public Object[] get() {
            return new Object[]{rule, className};
        }
    }
}
