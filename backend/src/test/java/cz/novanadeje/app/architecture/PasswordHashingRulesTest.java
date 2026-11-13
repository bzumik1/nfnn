package cz.novanadeje.app.architecture;

import com.tngtech.archunit.base.DescribedPredicate;
import com.tngtech.archunit.core.domain.JavaAccess;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.domain.JavaCodeUnit;
import com.tngtech.archunit.core.domain.AccessTarget.CodeUnitAccessTarget;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchCondition;
import com.tngtech.archunit.lang.ArchRule;
import com.tngtech.archunit.lang.ConditionEvents;
import com.tngtech.archunit.lang.SimpleConditionEvent;
import cz.novanadeje.app.AppApplication;
import cz.novanadeje.app.donors.domain.PasswordHasher;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionOperations;

import java.io.IOException;
import java.lang.reflect.Method;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Stream;

import static com.tngtech.archunit.base.DescribedPredicate.describe;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noCodeUnits;
import static cz.novanadeje.app.architecture.MethodAccesses.callsOrReferences;
import static org.assertj.core.api.Assertions.assertThat;

@AnalyzeClasses(
        packagesOf = AppApplication.class,
        importOptions = ImportOption.DoNotIncludeTests.class
)
class PasswordHashingRulesTest {

    private static final String CONFIRMATIONS = "cz.novanadeje.app.donors.application.DonorConfirmations";
    private static final Set<String> HASHING = Set.of("hash", "matches");
    private static final String CONFIRMING = "confirm";
    private static final String COMMITTED_REFUSALS = "cz.novanadeje.app.donors.application.CommittedRefusals";
    private static final Set<String> TEMPLATE_RUNS = Set.of("execute", "executeWithoutResult");
    private static final Set<String> COMMITTED_REFUSAL_RUNS = Set.of("execute", "run");
    private static final String APPLICATION_CODE = "cz.novanadeje.app.";

    private static final DescribedPredicate<JavaAccess<?>> A_PASSWORD_HASHING = callsOrReferences("", PasswordHasher.class, HASHING::contains)
            .or(callsOrReferences("", CONFIRMATIONS, CONFIRMING::equals))
            .as("a BCrypt hash or compare (PasswordHasher, DonorConfirmations.confirm)");

    private static final DescribedPredicate<JavaAccess<?>> A_TRANSACTION_TEMPLATE_RUN = callsOrReferences("", TransactionOperations.class, TEMPLATE_RUNS::contains)
            .or(callsOrReferences("", COMMITTED_REFUSALS, COMMITTED_REFUSAL_RUNS::contains))
            .as("a run of a transaction template (TransactionOperations, CommittedRefusals)");

    private static final DescribedPredicate<JavaCodeUnit> IN_A_TRANSACTION = describe("run in a transaction (@Transactional on them or their class)",
            codeUnit -> codeUnit.isMetaAnnotatedWith(Transactional.class) || codeUnit.getOwner().isMetaAnnotatedWith(Transactional.class));

    @ArchTest
    static final ArchRule no_password_is_hashed_inside_a_transaction = noCodeUnits()
            .should(hashAPasswordInATransaction())
            .because("a BCrypt hash at cost 12 takes about 0.3 s of CPU and must not hold a pooled connection or a row lock "
                    + "(database.md, Connections and waits; backend.md, Application)");

    @Test
    @DisplayName("Given the guarded names, when the hasher and the confirmations are read, then each is a method there, so the rule watches no name that is gone")
    void should_find_every_guarded_name_when_read_given_hasher_and_confirmations() throws ClassNotFoundException {
        assertThat(Arrays.stream(PasswordHasher.class.getMethods()).map(Method::getName)).containsAll(HASHING);
        assertThat(Arrays.stream(Class.forName(CONFIRMATIONS).getDeclaredMethods()).map(Method::getName)).contains(CONFIRMING);
    }

    @Test
    @DisplayName("Given methods that hash, compare or confirm a password in a transaction, directly, through a method reference, a meta-annotation, their class, a transaction template's callback, a private helper or a collaborator, when the rule checks them, then each is reported and the ones outside a transaction or confirming only a passkey are not")
    void should_report_every_hashing_in_a_transaction_when_checked_given_planted_services(@TempDir Path folder) throws IOException {
        JavaClasses planted = PlantedClasses.compiled(folder, Map.of(
                "cz.novanadeje.app.donors.application.PlantedPasswordService", """
                        package cz.novanadeje.app.donors.application;

                        import cz.novanadeje.app.donors.domain.Donor;
                        import cz.novanadeje.app.donors.domain.PasswordHash;
                        import cz.novanadeje.app.donors.domain.PasswordHasher;
                        import cz.novanadeje.app.donors.domain.RawPassword;
                        import java.util.function.Function;
                        import org.springframework.transaction.annotation.Transactional;
                        import org.springframework.transaction.support.TransactionOperations;

                        class PlantedPasswordService {

                            private PasswordHasher hasher;
                            private DonorConfirmations confirmations;
                            private TransactionOperations writes;
                            private PlantedHashingCollaborator collaborator;

                            PasswordHash hashesInATransactionTemplate(RawPassword password) {
                                return writes.execute(status -> hasher.hash(password));
                            }

                            PasswordHash hashesBeforeATransactionTemplate(RawPassword password) {
                                PasswordHash hash = hasher.hash(password);
                                writes.executeWithoutResult(status -> keep(hash));
                                return hash;
                            }

                            @Transactional
                            PasswordHash hashesThroughAPrivateHelper(RawPassword password) {
                                return helper(password);
                            }

                            @Transactional
                            PasswordHash hashesThroughACollaborator(RawPassword password) {
                                return collaborator.hashFor(password);
                            }

                            private PasswordHash helper(RawPassword password) {
                                return hasher.hash(password);
                            }

                            private void keep(PasswordHash hash) {
                            }

                            @Transactional
                            boolean comparesInside(RawPassword password, PasswordHash hash) {
                                return hasher.matches(password, hash);
                            }

                            @Writes
                            Function<RawPassword, PasswordHash> referencesInside() {
                                return hasher::hash;
                            }

                            @Transactional
                            void confirmsInside(Donor donor, Confirmation confirmation) {
                                confirmations.confirm(donor, confirmation);
                            }

                            @Transactional
                            void confirmsAPasskeyInside(Donor donor, Confirmation confirmation) {
                                confirmations.confirmPasskey(donor, confirmation);
                            }

                            PasswordHash hashesOutside(RawPassword password) {
                                return hasher.hash(password);
                            }
                        }
                        """,
                "cz.novanadeje.app.donors.application.PlantedTransactionalService", """
                        package cz.novanadeje.app.donors.application;

                        import cz.novanadeje.app.donors.domain.PasswordHash;
                        import cz.novanadeje.app.donors.domain.PasswordHasher;
                        import cz.novanadeje.app.donors.domain.RawPassword;
                        import org.springframework.transaction.annotation.Transactional;

                        @Transactional
                        class PlantedTransactionalService {

                            private PasswordHasher hasher;

                            PasswordHash hashesInItsClassTransaction(RawPassword password) {
                                return hasher.hash(password);
                            }
                        }
                        """,
                "cz.novanadeje.app.donors.application.PlantedHashingCollaborator", """
                        package cz.novanadeje.app.donors.application;

                        import cz.novanadeje.app.donors.domain.PasswordHash;
                        import cz.novanadeje.app.donors.domain.PasswordHasher;
                        import cz.novanadeje.app.donors.domain.RawPassword;

                        class PlantedHashingCollaborator {

                            private PasswordHasher hasher;

                            PasswordHash hashFor(RawPassword password) {
                                return hasher.hash(password);
                            }
                        }
                        """,
                "cz.novanadeje.app.donors.application.Writes", """
                        package cz.novanadeje.app.donors.application;

                        import java.lang.annotation.Retention;
                        import java.lang.annotation.RetentionPolicy;
                        import org.springframework.transaction.annotation.Transactional;

                        @Retention(RetentionPolicy.RUNTIME)
                        @Transactional
                        @interface Writes {
                        }
                        """));

        assertThat(no_password_is_hashed_inside_a_transaction.evaluate(planted).getFailureReport().getDetails())
                .hasSize(7)
                .anySatisfy(detail -> assertThat(detail).contains("comparesInside"))
                .anySatisfy(detail -> assertThat(detail).contains("hashesInATransactionTemplate"))
                .anySatisfy(detail -> assertThat(detail).contains("hashesThroughAPrivateHelper"))
                .anySatisfy(detail -> assertThat(detail).contains("hashesThroughACollaborator"))
                .noneSatisfy(detail -> assertThat(detail).contains("hashesBeforeATransactionTemplate"))
                .anySatisfy(detail -> assertThat(detail).contains("referencesInside"))
                .anySatisfy(detail -> assertThat(detail).contains("confirmsInside"))
                .anySatisfy(detail -> assertThat(detail).contains("hashesInItsClassTransaction"))
                .noneSatisfy(detail -> assertThat(detail).contains("confirmsAPasskeyInside"))
                .noneSatisfy(detail -> assertThat(detail).contains("hashesOutside"));
    }

    private static ArchCondition<JavaCodeUnit> hashAPasswordInATransaction() {
        return new ArchCondition<>("call or reference " + A_PASSWORD_HASHING.getDescription() + " in a transaction: in a code unit that "
                + IN_A_TRANSACTION.getDescription() + " or in a lambda beside " + A_TRANSACTION_TEMPLATE_RUN.getDescription()
                + ", directly or through the methods of the application they call") {
            @Override
            public void check(JavaCodeUnit codeUnit, ConditionEvents events) {
                Set<JavaCodeUnit> visited = new HashSet<>();
                accessesInATransactionOf(codeUnit)
                        .flatMap(access -> hashingReachedThrough(access, visited).stream())
                        .forEach(path -> events.add(SimpleConditionEvent.satisfied(codeUnit, codeUnit.getFullName() + " " + path)));
            }
        };
    }

    private static Stream<JavaAccess<?>> accessesInATransactionOf(JavaCodeUnit codeUnit) {
        Stream<JavaAccess<?>> accesses = codeUnit.getAccessesFromSelf().stream().map(access -> access);
        if (IN_A_TRANSACTION.test(codeUnit)) {
            return accesses;
        }
        if (codeUnit.getAccessesFromSelf().stream().anyMatch(A_TRANSACTION_TEMPLATE_RUN)) {
            return accesses.filter(JavaAccess::isDeclaredInLambda);
        }
        return Stream.empty();
    }

    private static Optional<String> hashingReachedThrough(JavaAccess<?> access, Set<JavaCodeUnit> visited) {
        if (A_PASSWORD_HASHING.test(access)) {
            return Optional.of(access.getDescription());
        }
        return applicationCodeUnitCalledBy(access)
                .filter(visited::add)
                .flatMap(callee -> callee.getAccessesFromSelf().stream()
                        .flatMap(next -> hashingReachedThrough(next, visited).stream())
                        .findFirst())
                .map(path -> access.getDescription() + ", where " + path);
    }

    private static Optional<JavaCodeUnit> applicationCodeUnitCalledBy(JavaAccess<?> access) {
        if (!(access.getTarget() instanceof CodeUnitAccessTarget target) || !access.getTargetOwner().getName().startsWith(APPLICATION_CODE)) {
            return Optional.empty();
        }
        return target.resolveMember().map(JavaCodeUnit.class::cast);
    }
}
