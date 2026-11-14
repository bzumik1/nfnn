package cz.novanadeje.app.architecture;

import com.tngtech.archunit.base.DescribedPredicate;
import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.domain.JavaCodeUnit;
import com.tngtech.archunit.core.domain.JavaConstructor;
import com.tngtech.archunit.core.domain.JavaField;
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
import java.util.Optional;

import static com.tngtech.archunit.base.DescribedPredicate.describe;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.classes;
import static org.assertj.core.api.Assertions.assertThat;

@AnalyzeClasses(
        packagesOf = AppApplication.class,
        importOptions = ImportOption.DoNotIncludeTests.class
)
class ArrayRecordRulesTest {


    private static final DescribedPredicate<JavaClass> DOMAIN_OR_APPLICATION_RECORDS_HOLDING_AN_ARRAY = describe(
            "are records of a domain or application package holding an array",
            type -> type.isRecord() && type.getPackageName().matches(".*\\.(domain|application)(\\..*)?") && !arrayComponentsOf(type).isEmpty());

    @ArchTest
    static final ArchRule records_holding_an_array_compare_by_content_and_copy_it = classes()
            .that(DOMAIN_OR_APPLICATION_RECORDS_HOLDING_AN_ARRAY)
            .should(compareByContentAndCopyTheirArrays())
            .because("backend.md, Domain: a record's generated equals and hashCode compare an array by identity and its toString prints a reference, "
                    + "and a generated accessor hands out the array itself (SignatureImage, ReceiptProof, ReceiptSigningKey)");

    @Test
    @DisplayName("Given planted records holding arrays in domain, application and infrastructure packages, when the rule checks them, then exactly the domain and application ones with a generated, final, overloaded or copy-less method, an accessor copying another array or a constructor keeping the caller's array are reported")
    void should_report_every_identity_compared_array_when_checked_given_planted_records(@TempDir Path folder) throws IOException {
        JavaClasses planted = PlantedClasses.compiled(folder, Map.of(
                "cz.novanadeje.app.planteda.domain.PlantedRecords", """
                        package cz.novanadeje.app.planteda.domain;

                        import java.util.Arrays;

                        class PlantedRecords {

                            record PlantedGenerated(byte[] png, int width) {
                            }

                            record PlantedFinalToString(byte[] png) {

                                PlantedFinalToString {
                                    png = png.clone();
                                }

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

                                PlantedHandedOut {
                                    png = png.clone();
                                }

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

                                PlantedByContent {
                                    body = body.clone();
                                    names = Arrays.copyOf(names, names.length);
                                }

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

                            record PlantedCopiedOutOnly(byte[] png) {

                                @Override
                                public boolean equals(Object other) {
                                    return other instanceof PlantedCopiedOutOnly image && Arrays.equals(png, image.png);
                                }

                                @Override
                                public int hashCode() {
                                    return Arrays.hashCode(png);
                                }

                                @Override
                                public String toString() {
                                    return "PlantedCopiedOutOnly[" + png.length + " bytes]";
                                }

                                @Override
                                public byte[] png() {
                                    return png.clone();
                                }
                            }

                            record PlantedClonesAnother(byte[] png, byte[] other) {

                                PlantedClonesAnother {
                                    png = png.clone();
                                    other = other.clone();
                                }

                                @Override
                                public boolean equals(Object that) {
                                    return that instanceof PlantedClonesAnother image && Arrays.equals(png, image.png) && Arrays.equals(other, image.other);
                                }

                                @Override
                                public int hashCode() {
                                    return Arrays.hashCode(png);
                                }

                                @Override
                                public String toString() {
                                    return "PlantedClonesAnother[" + png.length + " bytes]";
                                }

                                @Override
                                public byte[] png() {
                                    other.clone();
                                    return png;
                                }

                                @Override
                                public byte[] other() {
                                    return other.clone();
                                }
                            }

                            record PlantedOverloadedEquals(byte[] png) {

                                PlantedOverloadedEquals {
                                    png = png.clone();
                                }

                                public boolean equals(PlantedOverloadedEquals other) {
                                    return Arrays.equals(png, other.png);
                                }

                                @Override
                                public int hashCode() {
                                    return Arrays.hashCode(png);
                                }

                                @Override
                                public String toString() {
                                    return "PlantedOverloadedEquals[" + png.length + " bytes]";
                                }

                                @Override
                                public byte[] png() {
                                    return png.clone();
                                }
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
                .hasSize(7)
                .anySatisfy(detail -> assertThat(detail).contains("PlantedGenerated lacks its own [equals, hashCode, toString, png, png copied in]"))
                .anySatisfy(detail -> assertThat(detail).contains("PlantedCopiedOutOnly lacks its own [png copied in]"))
                .anySatisfy(detail -> assertThat(detail).contains("PlantedClonesAnother lacks its own [png]"))
                .anySatisfy(detail -> assertThat(detail).contains("PlantedOverloadedEquals lacks its own [equals]"))
                .anySatisfy(detail -> assertThat(detail).contains("PlantedFinalToString lacks its own [toString]"))
                .anySatisfy(detail -> assertThat(detail).contains("PlantedHandedOut lacks its own [png]"))
                .anySatisfy(detail -> assertThat(detail).contains("PlantedView lacks its own [equals, hashCode, toString, publicKey, publicKey copied in]"));
    }

    private static List<JavaField> arrayComponentsOf(JavaClass type) {
        return type.getFields().stream()
                .filter(field -> !field.getModifiers().contains(JavaModifier.STATIC))
                .filter(field -> field.getRawType().isArray())
                .toList();
    }

    private static List<String> missingOwnMethodsOf(JavaClass type) {
        List<String> missing = new ArrayList<>();
        if (!declaresItsOwn(type, "equals", Object.class)) {
            missing.add("equals");
        }
        if (!declaresItsOwn(type, "hashCode")) {
            missing.add("hashCode");
        }
        if (!declaresItsOwn(type, "toString")) {
            missing.add("toString");
        }
        return missing;
    }

    private static boolean declaresItsOwn(JavaClass type, String name, Class<?>... parameters) {
        return type.tryGetMethod(name, parameters).filter(method -> method.getOwner().equals(type))
                .filter(method -> !method.getModifiers().contains(JavaModifier.FINAL)).isPresent();
    }

    private static List<String> accessorsHandingOutTheArrayOf(JavaClass type) {
        return arrayComponentsOf(type).stream()
                .filter(component -> type.tryGetMethod(component.getName()).filter(method -> method.getOwner().equals(type))
                        .filter(accessor -> copiesTheComponentWhereItReadsIt(accessor, component)).isEmpty())
                .map(JavaField::getName)
                .toList();
    }

    private static List<String> componentsKeptAsGivenBy(JavaClass type) {
        List<JavaField> components = arrayComponentsOf(type);
        Optional<JavaConstructor> canonical = type.getConstructors().stream()
                .filter(constructor -> typeNames(constructor.getRawParameterTypes()).equals(typeNames(recordComponentTypesOf(type))))
                .findFirst();
        return components.stream()
                .filter(component -> canonical.filter(constructor -> copiesAnArrayOf(constructor, component)).isEmpty())
                .map(component -> component.getName() + " copied in")
                .toList();
    }

    private static List<String> typeNames(List<JavaClass> types) {
        return types.stream().map(JavaClass::getName).sorted().toList();
    }

    private static List<JavaClass> recordComponentTypesOf(JavaClass type) {
        return type.getFields().stream().filter(field -> !field.getModifiers().contains(JavaModifier.STATIC)).map(JavaField::getRawType).toList();
    }

    private static boolean copiesTheComponentWhereItReadsIt(JavaCodeUnit accessor, JavaField component) {
        return accessor.getFieldAccesses().stream()
                .filter(access -> access.getTarget().getName().equals(component.getName()) && access.getTargetOwner().equals(component.getOwner()))
                .anyMatch(read -> accessor.getMethodCallsFromSelf().stream()
                        .anyMatch(call -> call.getLineNumber() == read.getLineNumber() && copiesAnArrayOf(call, component.getRawType())));
    }

    private static boolean copiesAnArrayOf(JavaCodeUnit codeUnit, JavaField component) {
        return codeUnit.getMethodCallsFromSelf().stream().anyMatch(call -> copiesAnArrayOf(call, component.getRawType()));
    }

    private static boolean copiesAnArrayOf(JavaMethodCall call, JavaClass arrayType) {
        boolean arrayClone = call.getTargetOwner().getName().equals(arrayType.getName()) && call.getName().equals("clone");
        boolean arraysCopy = call.getTargetOwner().isEquivalentTo(Arrays.class) && call.getName().startsWith("copyOf")
                && !call.getTarget().getRawParameterTypes().isEmpty()
                && (call.getTarget().getRawParameterTypes().getFirst().getName().equals(arrayType.getName())
                    || call.getTarget().getRawParameterTypes().getFirst().isEquivalentTo(Object[].class) && !arrayType.getComponentType().isPrimitive());
        return arrayClone || arraysCopy;
    }

    private static ArchCondition<JavaClass> compareByContentAndCopyTheirArrays() {
        return describedAs("declare their own equals(Object), hashCode() and toString() (the ones the compiler generates are final), copy each array "
                        + "in their canonical constructor and hand out a copy of it from its accessor",
                (type, events) -> {
                    List<String> missing = new ArrayList<>(missingOwnMethodsOf(type));
                    missing.addAll(accessorsHandingOutTheArrayOf(type));
                    missing.addAll(componentsKeptAsGivenBy(type));
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
