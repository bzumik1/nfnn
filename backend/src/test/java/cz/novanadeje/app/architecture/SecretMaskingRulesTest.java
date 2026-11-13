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

    private static final Pattern SECRET_NAME = Pattern.compile("(?i)code|.*(password|secret|token|seed|privatekey|apikey|encryptionkey)");
    private static final String BANK_CODE_REASON = "a four-digit bank code of the Czech National Bank's public list";
    private static final Map<String, String> PUBLIC_CODES = Map.of(
            "cz.novanadeje.app.donations.application.banklogo.BankLogoAdminRow", BANK_CODE_REASON,
            "cz.novanadeje.app.donations.application.banklogo.BankLogoVersions$VersionedFields", BANK_CODE_REASON,
            "cz.novanadeje.app.donations.application.banklogo.PublishedBankLogo", BANK_CODE_REASON,
            "cz.novanadeje.app.donations.infrastructure.persistence.BankLogoRow", BANK_CODE_REASON,
            "cz.novanadeje.app.donations.interfaces.rest.BankCodesResponse$Item", BANK_CODE_REASON,
            "cz.novanadeje.app.donations.interfaces.rest.BankLogosResponse$Item", BANK_CODE_REASON);
    private static final Set<String> SETTING_NAMES = Set.of("name", "setting");
    private static final Set<String> PLAIN_TYPES = Set.of(String.class.getName(), char[].class.getName(), byte[].class.getName());

    private static final DescribedPredicate<JavaClass> HOLDING_A_PLAIN_SECRET = describe(
            "hold a password, secret, token, seed, key, code or a setting's value (a value beside a name or a setting) as a plain String, char[] or byte[], also inside an Optional or a List",
            type -> type.isRecord() && !secretComponentsOf(type).isEmpty());

    @ArchTest
    static final ArchRule records_holding_a_plain_secret_mask_it_in_to_string = classes()
            .that(HOLDING_A_PLAIN_SECRET)
            .should(declareTheirOwnToString())
            .because("a record's generated toString prints every component, so a log line, an exception or a debugger "
                    + "that prints the record would show the secret (security.md, Secrets: RawPassword, FioImportProperties)");

    @Test
    @DisplayName("Given the records listed as holding a public code, when they are read, then each exists and holds its code as text, so the list names no record that is gone")
    void should_find_every_public_code_when_read_given_the_listed_records() throws ClassNotFoundException {
        for (String record : PUBLIC_CODES.keySet()) {
            assertThat(Arrays.stream(Class.forName(record).getRecordComponents()).map(RecordComponent::getName)).as(record).contains("code");
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
                }
                """));

        assertThat(records_holding_a_plain_secret_mask_it_in_to_string.evaluate(planted).getFailureReport().getDetails())
                .hasSize(6)
                .anySatisfy(detail -> assertThat(detail).contains("PlantedSignIn holds [password]"))
                .anySatisfy(detail -> assertThat(detail).contains("PlantedResetLink holds [resetToken]"))
                .anySatisfy(detail -> assertThat(detail).contains("PlantedKeys holds [privateKey]"))
                .anySatisfy(detail -> assertThat(detail).contains("PlantedSetup holds [code]"))
                .anySatisfy(detail -> assertThat(detail).contains("PlantedFinalMask holds [password]"))
                .anySatisfy(detail -> assertThat(detail).contains("PlantedSettingValue holds [value]"));
    }

    static List<JavaField> secretComponentsOf(JavaClass type) {
        return type.getFields().stream()
                .filter(field -> !field.getModifiers().contains(JavaModifier.STATIC))
                .filter(field -> SECRET_NAME.matcher(field.getName()).matches() || isASettingValue(type, field))
                .filter(field -> !(field.getName().equals("code") && PUBLIC_CODES.containsKey(type.getName())))
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

    private static ArchCondition<JavaClass> declareTheirOwnToString() {
        return new ArchCondition<>("declare their own toString that leaves the secret out (the one the compiler generates is final)") {
            @Override
            public void check(JavaClass type, ConditionEvents events) {
                boolean declared = type.getMethods().stream()
                        .anyMatch(method -> method.getName().equals("toString") && method.getRawParameterTypes().isEmpty()
                                && !method.getModifiers().contains(JavaModifier.FINAL));
                if (!declared) {
                    events.add(SimpleConditionEvent.violated(type, type.getName() + " holds " + secretComponentsOf(type).stream()
                            .map(JavaField::getName).toList() + " in the generated toString"));
                }
            }
        };
    }
}
