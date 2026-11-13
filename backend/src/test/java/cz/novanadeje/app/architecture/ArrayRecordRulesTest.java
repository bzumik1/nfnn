package cz.novanadeje.app.architecture;

import com.tngtech.archunit.base.DescribedPredicate;
import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.domain.JavaField;
import com.tngtech.archunit.core.domain.JavaMethod;
import com.tngtech.archunit.core.domain.JavaMethodCall;
import com.tngtech.archunit.core.domain.JavaModifier;
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
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;

import static com.tngtech.archunit.base.DescribedPredicate.describe;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.classes;
import static org.assertj.core.api.Assertions.assertThat;

@AnalyzeClasses(
        packagesOf = AppApplication.class,
        importOptions = ImportOption.DoNotIncludeTests.class
)
class ArrayRecordRulesTest {

    private static final String IDENTITY_COMPARED_UNTIL_PR_612 = "cz.novanadeje.app.donations.domain.receipt.StoredReceiptImage";
    private static final List<String> OWN_METHODS = List.of("equals", "hashCode", "toString");

    private static final DescribedPredicate<JavaClass> DOMAIN_OR_APPLICATION_RECORDS_HOLDING_AN_ARRAY = describe(
            "are records of a domain or application package holding an array",
            type -> type.isRecord() && type.getPackageName().matches(".*\\.(domain|application)(\\..*)?") && !arrayComponentsOf(type).isEmpty());

    @ArchTest
    static final ArchRule records_holding_an_array_compare_by_content_and_copy_it = classes()
            .that(DOMAIN_OR_APPLICATION_RECORDS_HOLDING_AN_ARRAY)
            .and(describe("are not the stored receipt image, whose classes PR #612 changes", type -> !type.getName().equals(IDENTITY_COMPARED_UNTIL_PR_612)))
            .should(compareByContentAndCopyTheirArrays())
            .because("backend.md, Domain: a record's generated equals and hashCode compare an array by identity and its toString prints a reference, "
                    + "and a generated accessor hands out the array itself (SignatureImage, ReceiptProof, ReceiptSigningKey)");

    @ArchTest
    static final ArchRule the_stored_receipt_image_still_compares_by_identity_until_pr_612 = classes()
            .that().haveFullyQualifiedName(IDENTITY_COMPARED_UNTIL_PR_612)
            .should(describedAs("still lack their own equals, hashCode or toString, so the exception goes once they have them",
                    (type, events) -> {
                        if (missingOwnMethodsOf(type).isEmpty()) {
                            events.add(SimpleConditionEvent.violated(type, type.getName() + " now compares by content, so drop its exception"));
                        }
                    }))
            .because("the exception of records_holding_an_array_compare_by_content_and_copy_it lasts only while PR #612 changes the receipt image's classes");

    @Test
    @DisplayName("Given planted records holding arrays in domain, application and infrastructure packages, when the rule checks them, then exactly the domain and application ones with a generated, final or copy-less method are reported")
    void should_report_every_identity_compared_array_when_checked_given_planted_records(@TempDir Path folder) throws IOException {
        JavaClasses planted = PlantedClasses.compiled(folder, Map.of(
                "cz.novanadeje.app.planteda.domain.PlantedRecords", """
                        package cz.novanadeje.app.planteda.domain;

                        import java.util.Arrays;

                        class PlantedRecords {

                            record PlantedGenerated(byte[] png, int width) {
                            }

                            record PlantedFinalToString(byte[] png) {

                                @Override
                                public boolean equals(Object other) {
                                    return other instanceof PlantedFinalToString image && Arrays.equals(png, image.png);
                                }

                                @Override
                                public int hashCode() {
                                    return Arrays.hashCode(png);
                                }

                                @Override
                                public final String toString() {
                                    return "PlantedFinalToString[" + png.length + " bytes]";
                                }

                                @Override
                                public byte[] png() {
                                    return png.clone();
                                }
                            }

                            record PlantedHandedOut(byte[] png) {

                                @Override
                                public boolean equals(Object other) {
                                    return other instanceof PlantedHandedOut image && Arrays.equals(png, image.png);
                                }

                                @Override
                                public int hashCode() {
                                    return Arrays.hashCode(png);
                                }

                                @Override
                                public String toString() {
                                    return "PlantedHandedOut[" + png.length + " bytes]";
                                }
                            }

                            record PlantedByContent(byte[] body, String[] names) {

                                @Override
                                public boolean equals(Object other) {
                                    return other instanceof PlantedByContent proof && Arrays.equals(body, proof.body) && Arrays.equals(names, proof.names);
                                }

                                @Override
                                public int hashCode() {
                                    return 31 * Arrays.hashCode(body) + Arrays.hashCode(names);
                                }

                                @Override
                                public String toString() {
                                    return "PlantedByContent[" + body.length + " bytes]";
                                }

                                @Override
                                public byte[] body() {
                                    return body.clone();
                                }

                                @Override
                                public String[] names() {
                                    return Arrays.copyOf(names, names.length);
                                }
                            }

                            record PlantedWithoutArray(String name) {
                            }
                        }
                        """,
                "cz.novanadeje.app.planteda.application.PlantedView", """
                        package cz.novanadeje.app.planteda.application;

                        public record PlantedView(String id, byte[] publicKey) {
                        }
                        """,
                "cz.novanadeje.app.planteda.infrastructure.PlantedRow", """
                        package cz.novanadeje.app.planteda.infrastructure;

                        public record PlantedRow(byte[] data) {
                        }
                        """));

        assertThat(records_holding_an_array_compare_by_content_and_copy_it.evaluate(planted).getFailureReport().getDetails())
                .hasSize(4)
                .anySatisfy(detail -> assertThat(detail).contains("PlantedGenerated lacks its own [equals, hashCode, toString, png]"))
                .anySatisfy(detail -> assertThat(detail).contains("PlantedFinalToString lacks its own [toString]"))
                .anySatisfy(detail -> assertThat(detail).contains("PlantedHandedOut lacks its own [png]"))
                .anySatisfy(detail -> assertThat(detail).contains("PlantedView lacks its own [equals, hashCode, toString, publicKey]"));
    }

    private static List<JavaField> arrayComponentsOf(JavaClass type) {
        return type.getFields().stream()
                .filter(field -> !field.getModifiers().contains(JavaModifier.STATIC))
                .filter(field -> field.getRawType().isArray())
                .toList();
    }

    private static List<String> missingOwnMethodsOf(JavaClass type) {
        List<String> missing = new ArrayList<>();
        for (String name : OWN_METHODS) {
            boolean declared = type.getMethods().stream()
                    .anyMatch(method -> method.getName().equals(name) && !method.getModifiers().contains(JavaModifier.FINAL));
            if (!declared) {
                missing.add(name);
            }
        }
        return missing;
    }

    private static List<String> accessorsHandingOutTheArrayOf(JavaClass type) {
        return arrayComponentsOf(type).stream()
                .filter(component -> type.getMethods().stream()
                        .filter(method -> method.getName().equals(component.getName()) && method.getRawParameterTypes().isEmpty())
                        .noneMatch(ArrayRecordRulesTest::returnsACopy))
                .map(JavaField::getName)
                .toList();
    }

    private static boolean returnsACopy(JavaMethod accessor) {
        return accessor.getMethodCallsFromSelf().stream().anyMatch(ArrayRecordRulesTest::copiesAnArray);
    }

    private static boolean copiesAnArray(JavaMethodCall call) {
        boolean arrayClone = call.getTargetOwner().isArray() && call.getName().equals("clone");
        boolean arraysCopy = call.getTargetOwner().isEquivalentTo(Arrays.class) && call.getName().startsWith("copyOf");
        return arrayClone || arraysCopy;
    }

    private static ArchCondition<JavaClass> compareByContentAndCopyTheirArrays() {
        return describedAs("declare their own equals, hashCode and toString (the ones the compiler generates are final) and an accessor that copies each array",
                (type, events) -> {
                    List<String> missing = new ArrayList<>(missingOwnMethodsOf(type));
                    missing.addAll(accessorsHandingOutTheArrayOf(type));
                    if (!missing.isEmpty()) {
                        events.add(SimpleConditionEvent.violated(type, type.getName() + " lacks its own " + missing));
                    }
                });
    }

    private static ArchCondition<JavaClass> describedAs(String description, ClassCheck check) {
        return new ArchCondition<>(description) {
            @Override
            public void check(JavaClass type, ConditionEvents events) {
                check.check(type, events);
            }
        };
    }

    @FunctionalInterface
    private interface ClassCheck {

        void check(JavaClass type, ConditionEvents events);
    }
}
