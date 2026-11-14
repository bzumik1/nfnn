package cz.novanadeje.app.architecture;

import com.tngtech.archunit.base.DescribedPredicate;
import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.domain.JavaField;
import com.tngtech.archunit.core.domain.JavaModifier;
import com.tngtech.archunit.core.domain.JavaParameterizedType;
import com.tngtech.archunit.core.domain.JavaType;
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

import java.io.IOException;
import java.lang.reflect.RecordComponent;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

import static com.tngtech.archunit.base.DescribedPredicate.describe;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.classes;
import static org.assertj.core.api.Assertions.assertThat;

@AnalyzeClasses(
        packagesOf = AppApplication.class,
        importOptions = ImportOption.DoNotIncludeTests.class
)
class SecretMaskingRulesTest {

    private static final Pattern SECRET_NAME = Pattern.compile("(?i)code|.*(password|secret|token|seed|privatekey|apikey|encryptionkey|challenge|verifier|clientdatajson)");
    private static final String BANK_CODE_REASON = "a four-digit bank code of the Czech National Bank's public list";
    private static final String PKCE_CHALLENGE_REASON = "a PKCE code_challenge, the SHA-256 of the client's verifier, which the client sends "
            + "in the clear in the authorization address (RFC 7636) and which redeems nothing without the verifier";
    private static final Map<String, Map<String, String>> PUBLIC_COMPONENTS = Map.of(
            "code", Map.of(
                    "cz.novanadeje.app.donations.application.banklogo.BankLogoAdminRow", BANK_CODE_REASON,
                    "cz.novanadeje.app.donations.application.banklogo.BankLogoVersions$VersionedFields", BANK_CODE_REASON,
                    "cz.novanadeje.app.donations.application.banklogo.PublishedBankLogo", BANK_CODE_REASON,
                    "cz.novanadeje.app.donations.infrastructure.persistence.BankLogoRow", BANK_CODE_REASON,
                    "cz.novanadeje.app.donations.interfaces.rest.AdminBankLogoResponse", BANK_CODE_REASON,
                    "cz.novanadeje.app.donations.interfaces.rest.BankCodesResponse$Item", BANK_CODE_REASON,
                    "cz.novanadeje.app.donations.interfaces.rest.BankLogosResponse$Item", BANK_CODE_REASON),
            "codeChallenge", Map.of(
                    "cz.novanadeje.app.donors.application.AuthorizationDecision", PKCE_CHALLENGE_REASON));
    private static final Set<String> SETTING_NAMES = Set.of("name", "setting");
    private static final Set<String> PLAIN_TYPES = Set.of(String.class.getName(), char[].class.getName(), byte[].class.getName());

    @ArchTest
    static final ArchRule records_holding_a_plain_secret_mask_it_in_to_string = recordsHoldingAPlainSecretMaskIt(PUBLIC_COMPONENTS);

    @Test
    @DisplayName("Given the records listed as holding a public code or code challenge, when they are read, then each exists and holds that component, so the list names no record that is gone")
    void should_find_every_public_component_when_read_given_the_listed_records() throws ClassNotFoundException {
        for (Map.Entry<String, Map<String, String>> component : PUBLIC_COMPONENTS.entrySet()) {
            for (String record : component.getValue().keySet()) {
                assertThat(Arrays.stream(Class.forName(record).getRecordComponents()).map(RecordComponent::getName)).as(record)
                        .contains(component.getKey());
            }
        }
    }

    @Test
    @DisplayName("Given planted records holding secrets as text, inside an Optional, as bytes, as a setting's value, masked, final, typed or public, when the rule checks them, then exactly the unmasked ones, a setting's value and the final toString are reported")
    void should_report_every_unmasked_secret_when_checked_given_planted_records(@TempDir Path folder) throws IOException {
        JavaClasses planted = PlantedClasses.compiled(folder, Map.of("cz.novanadeje.app.planteda.application.PlantedRecords", """
                package cz.novanadeje.app.planteda.application;

                import cz.novanadeje.app.donors.domain.RawPassword;
                import java.util.Optional;

                class PlantedRecords {

                    record PlantedSignIn(String email, String password) {
                    }

                    record PlantedResetLink(Optional<String> resetToken) {
                    }

                    record PlantedKeys(byte[] privateKey, String publicKey) {
                    }

                    record PlantedSetup(String code) {
                    }

                    record PlantedFinalMask(String password) {

                        @Override
                        public final String toString() {
                            return "PlantedFinalMask[password=***]";
                        }
                    }

                    record PlantedMasked(String password) {

                        @Override
                        public String toString() {
                            return "PlantedMasked[password=***]";
                        }
                    }

                    record PlantedTyped(RawPassword password) {
                    }

                    record PlantedPublic(String bankCode, String publicKey, String summaryKey) {
                    }

                    record PlantedSettingValue(String name, String value) {
                    }

                    record PlantedAmount(long value) {
                    }

                    record PlantedRecovery(String challenge) {
                    }

                    record PlantedExchange(String codeVerifier) {
                    }

                    record PlantedAssertion(String clientDataJSON, String credentialId) {
                    }
                }
                """));

        assertThat(records_holding_a_plain_secret_mask_it_in_to_string.evaluate(planted).getFailureReport().getDetails())
                .hasSize(9)
                .anySatisfy(detail -> assertThat(detail).contains("PlantedSignIn holds [password]"))
                .anySatisfy(detail -> assertThat(detail).contains("PlantedResetLink holds [resetToken]"))
                .anySatisfy(detail -> assertThat(detail).contains("PlantedKeys holds [privateKey]"))
                .anySatisfy(detail -> assertThat(detail).contains("PlantedSetup holds [code]"))
                .anySatisfy(detail -> assertThat(detail).contains("PlantedFinalMask holds [password]"))
                .anySatisfy(detail -> assertThat(detail).contains("PlantedSettingValue holds [value]"))
                .anySatisfy(detail -> assertThat(detail).contains("PlantedRecovery holds [challenge]"))
                .anySatisfy(detail -> assertThat(detail).contains("PlantedExchange holds [codeVerifier]"))
                .anySatisfy(detail -> assertThat(detail).contains("PlantedAssertion holds [clientDataJSON]"));
    }

    @Test
    @DisplayName("Given planted records holding a code challenge, one listed as public, one not and one listed that also holds a challenge, when the rule checks them with that list, then the listed component alone is left out")
    void should_leave_out_only_the_listed_component_when_checked_given_a_planted_public_list(@TempDir Path folder) throws IOException {
        JavaClasses planted = PlantedClasses.compiled(folder, Map.of("cz.novanadeje.app.plantedb.application.PlantedChallenges", """
                package cz.novanadeje.app.plantedb.application;

                class PlantedChallenges {

                    record PlantedListed(String codeChallenge) {
                    }

                    record PlantedUnlisted(String codeChallenge) {
                    }

                    record PlantedListedWithChallenge(String codeChallenge, String challenge) {
                    }
                }
                """));
        Map<String, Map<String, String>> publicComponents = Map.of("codeChallenge", Map.of(
                "cz.novanadeje.app.plantedb.application.PlantedChallenges$PlantedListed", "planted",
                "cz.novanadeje.app.plantedb.application.PlantedChallenges$PlantedListedWithChallenge", "planted"));

        assertThat(recordsHoldingAPlainSecretMaskIt(publicComponents).evaluate(planted).getFailureReport().getDetails())
                .hasSize(2)
                .anySatisfy(detail -> assertThat(detail).contains("PlantedUnlisted holds [codeChallenge]"))
                .anySatisfy(detail -> assertThat(detail).contains("PlantedListedWithChallenge holds [challenge]"));
    }

    private static ArchRule recordsHoldingAPlainSecretMaskIt(Map<String, Map<String, String>> publicComponents) {
        DescribedPredicate<JavaClass> holdingAPlainSecret = describe(
                "hold a password, secret, token, seed, key, code, challenge, verifier, client data or a setting's value (a value beside a name or a setting) as a plain String, char[] or byte[], also inside an Optional or a List",
                type -> type.isRecord() && !secretComponentsOf(type, publicComponents).isEmpty());
        return classes()
                .that(holdingAPlainSecret)
                .should(declareTheirOwnToString(publicComponents))
                .because("a record's generated toString prints every component, so a log line, an exception or a debugger "
                        + "that prints the record would show the secret (security.md, Secrets: RawPassword, FioImportProperties)");
    }

    private static List<JavaField> secretComponentsOf(JavaClass type, Map<String, Map<String, String>> publicComponents) {
        return type.getFields().stream()
                .filter(field -> !field.getModifiers().contains(JavaModifier.STATIC))
                .filter(field -> SECRET_NAME.matcher(field.getName()).matches() || isASettingValue(type, field))
                .filter(field -> !publicComponents.getOrDefault(field.getName(), Map.of()).containsKey(type.getName()))
                .filter(field -> holdsPlainText(field.getType()))
                .toList();
    }

    private static boolean isASettingValue(JavaClass type, JavaField field) {
        return field.getName().equals("value") && type.getFields().stream().map(JavaField::getName).anyMatch(SETTING_NAMES::contains);
    }

    private static boolean holdsPlainText(JavaType type) {
        if (PLAIN_TYPES.contains(type.toErasure().getName())) {
            return true;
        }
        return type instanceof JavaParameterizedType parameterized
                && Set.of(java.util.Optional.class.getName(), List.class.getName()).contains(parameterized.toErasure().getName())
                && parameterized.getActualTypeArguments().stream().anyMatch(SecretMaskingRulesTest::holdsPlainText);
    }

    private static ArchCondition<JavaClass> declareTheirOwnToString(Map<String, Map<String, String>> publicComponents) {
        return new ArchCondition<>("declare their own toString that leaves the secret out (the one the compiler generates is final)") {
            @Override
            public void check(JavaClass type, ConditionEvents events) {
                boolean declared = type.getMethods().stream()
                        .anyMatch(method -> method.getName().equals("toString") && method.getRawParameterTypes().isEmpty()
                                && !method.getModifiers().contains(JavaModifier.FINAL));
                if (!declared) {
                    events.add(SimpleConditionEvent.violated(type, type.getName() + " holds " + secretComponentsOf(type, publicComponents).stream()
                            .map(JavaField::getName).toList() + " in the generated toString"));
                }
            }
        };
    }
}
