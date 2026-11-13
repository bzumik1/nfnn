package cz.novanadeje.app.architecture;

import com.tngtech.archunit.base.DescribedPredicate;
import com.tngtech.archunit.core.domain.JavaAccess;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;
import cz.novanadeje.app.AppApplication;
import cz.novanadeje.app.shared.domain.Sha256;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.Map;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static org.assertj.core.api.Assertions.assertThat;

@AnalyzeClasses(
        packagesOf = AppApplication.class,
        importOptions = ImportOption.DoNotIncludeTests.class
)
class DigestRulesTest {

    private static final DescribedPredicate<JavaAccess<?>> A_DIGEST_INSTANCE = MethodAccesses.callsOrReferences(
            "MessageDigest.getInstance", MessageDigest.class, "getInstance"::equals);

    @ArchTest
    static final ArchRule digests_come_only_from_the_shared_sha256 = noClasses()
            .that().doNotBelongToAnyOf(Sha256.class)
            .should().accessTargetWhere(A_DIGEST_INSTANCE)
            .because("one Sha256 of the shared kernel gives every digest the site stores or compares, so a copy cannot drift in its encoding");

    @Test
    @DisplayName("Given a planted class that takes a digest from the JDK, by a call and by a method reference, when the rule checks it, then both are reported and a comparison with isEqual is not")
    void should_report_every_digest_instance_when_checked_given_a_planted_class(@TempDir Path folder) throws IOException {
        JavaClasses planted = PlantedClasses.compiled(folder, Map.of("cz.novanadeje.app.planteda.domain.PlantedSecret", """
                package cz.novanadeje.app.planteda.domain;

                import java.security.MessageDigest;
                import java.security.NoSuchAlgorithmException;
                import java.util.concurrent.Callable;

                class PlantedSecret {

                    byte[] hash(byte[] value) throws NoSuchAlgorithmException {
                        return MessageDigest.getInstance("SHA-256").digest(value);
                    }

                    Callable<MessageDigest> digests() {
                        return () -> MessageDigest.getInstance("SHA-512");
                    }

                    boolean same(byte[] first, byte[] second) {
                        return MessageDigest.isEqual(first, second);
                    }
                }
                """));

        assertThat(digests_come_only_from_the_shared_sha256.evaluate(planted).getFailureReport().getDetails())
                .hasSize(2)
                .anySatisfy(detail -> assertThat(detail).contains("hash"))
                .anySatisfy(detail -> assertThat(detail).contains("digests"))
                .noneSatisfy(detail -> assertThat(detail).contains("same"));
    }
}
