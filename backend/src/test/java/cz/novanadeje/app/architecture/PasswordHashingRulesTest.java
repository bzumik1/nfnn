package cz.novanadeje.app.architecture;

import com.tngtech.archunit.base.DescribedPredicate;
import com.tngtech.archunit.core.domain.JavaAccess;
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
import cz.novanadeje.app.donors.domain.PasswordHasher;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.lang.reflect.Method;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.Map;
import java.util.Set;

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

    private static final DescribedPredicate<JavaAccess<?>> A_PASSWORD_HASHING = callsOrReferences("", PasswordHasher.class, HASHING::contains)
            .or(callsOrReferences("", CONFIRMATIONS, CONFIRMING::equals))
            .as("a BCrypt hash or compare (PasswordHasher, DonorConfirmations.confirm)");

    private static final DescribedPredicate<JavaCodeUnit> IN_A_TRANSACTION = describe("run in a transaction (@Transactional on them or their class)",
            codeUnit -> codeUnit.isMetaAnnotatedWith(Transactional.class) || codeUnit.getOwner().isMetaAnnotatedWith(Transactional.class));

    @ArchTest
    static final ArchRule no_password_is_hashed_inside_a_transaction = noCodeUnits()
            .that(IN_A_TRANSACTION)
            .should(access(A_PASSWORD_HASHING))
            .because("a BCrypt hash at cost 12 takes about 0.3 s of CPU and must not hold a pooled connection or a row lock "
                    + "(database.md, Connections and waits; backend.md, Application)");

    @Test
    @DisplayName("Given the guarded names, when the hasher and the confirmations are read, then each is a method there, so the rule watches no name that is gone")
    void should_find_every_guarded_name_when_read_given_hasher_and_confirmations() throws ClassNotFoundException {
        assertThat(Arrays.stream(PasswordHasher.class.getMethods()).map(Method::getName)).containsAll(HASHING);
        assertThat(Arrays.stream(Class.forName(CONFIRMATIONS).getDeclaredMethods()).map(Method::getName)).contains(CONFIRMING);
    }

    @Test
    @DisplayName("Given transactional methods that hash, compare or confirm a password, directly, through a method reference, a meta-annotation or their class, when the rule checks them, then each is reported and the ones outside a transaction or confirming only a passkey are not")
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

                        class PlantedPasswordService {

                            private PasswordHasher hasher;
                            private DonorConfirmations confirmations;

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
                .hasSize(4)
                .anySatisfy(detail -> assertThat(detail).contains("comparesInside"))
                .anySatisfy(detail -> assertThat(detail).contains("referencesInside"))
                .anySatisfy(detail -> assertThat(detail).contains("confirmsInside"))
                .anySatisfy(detail -> assertThat(detail).contains("hashesInItsClassTransaction"))
                .noneSatisfy(detail -> assertThat(detail).contains("confirmsAPasskeyInside"))
                .noneSatisfy(detail -> assertThat(detail).contains("hashesOutside"));
    }

    private static ArchCondition<JavaCodeUnit> access(DescribedPredicate<JavaAccess<?>> target) {
        return new ArchCondition<>("call or reference " + target.getDescription()) {
            @Override
            public void check(JavaCodeUnit codeUnit, ConditionEvents events) {
                codeUnit.getAccessesFromSelf().stream()
                        .filter(target)
                        .forEach(access -> events.add(SimpleConditionEvent.satisfied(codeUnit, codeUnit.getFullName() + " " + access.getDescription())));
            }
        };
    }
}
