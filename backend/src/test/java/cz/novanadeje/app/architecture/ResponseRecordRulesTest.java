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
import java.nio.file.Path;
import java.util.Map;
import java.util.stream.Stream;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.classes;
import static org.assertj.core.api.Assertions.assertThat;

@AnalyzeClasses(packagesOf = AppApplication.class, importOptions = ImportOption.DoNotIncludeTests.class)
class ResponseRecordRulesTest {

    private static final String RESPONSE = "Response";
    private static final String INTERFACES = ".interfaces.rest";

    private static final DescribedPredicate<JavaClass> RESPONSE_RECORDS = DescribedPredicate.describe(
            "are response records of interfaces/rest or records nested in one",
            type -> type.isRecord() && type.getPackageName().contains(INTERFACES) && isOrSitsInAResponse(type));

    @ArchTest
    static final ArchRule response_records_hold_only_interface_types_jdk_types_and_enums = classes()
            .that(RESPONSE_RECORDS)
            .should(new ArchCondition<>("hold only types of interfaces/rest, JDK types and enums, so an application or domain record never becomes the answer's shape") {
                @Override
                public void check(JavaClass response, ConditionEvents events) {
                    response.getFields().stream().filter(field -> !field.getModifiers().contains(JavaModifier.STATIC))
                            .forEach(field -> heldTypes(field.getType()).filter(type -> !isAdmitted(type))
                                    .forEach(type -> events.add(SimpleConditionEvent.violated(field, describe(field, type)))));
                }
            })
            .because("backend.md, REST: request and response records only");

    @Test
    @DisplayName("Given planted responses holding an application record, a domain value inside a list, a JDK type, an enum and another response, when the rule checks them, then only the application and domain types are reported")
    void should_report_application_and_domain_types_when_checked_given_planted_responses(@TempDir Path folder) throws IOException {
        JavaClasses planted = PlantedClasses.compiled(folder, Map.of(
                "cz.novanadeje.app.planteda.application.PlantedRow", """
                        package cz.novanadeje.app.planteda.application;

                        public record PlantedRow(String text) {
                        }
                        """,
                "cz.novanadeje.app.planteda.domain.PlantedKind", """
                        package cz.novanadeje.app.planteda.domain;

                        public enum PlantedKind { ONE }
                        """,
                "cz.novanadeje.app.planteda.domain.PlantedValue", """
                        package cz.novanadeje.app.planteda.domain;

                        public record PlantedValue(String text) {
                        }
                        """,
                "cz.novanadeje.app.planteda.interfaces.rest.PlantedResponse", """
                        package cz.novanadeje.app.planteda.interfaces.rest;

                        import cz.novanadeje.app.planteda.application.PlantedRow;
                        import cz.novanadeje.app.planteda.domain.PlantedKind;
                        import cz.novanadeje.app.planteda.domain.PlantedValue;
                        import java.time.Instant;
                        import java.util.List;
                        import java.util.Optional;

                        record PlantedResponse(PlantedRow row, List<PlantedValue> values, Instant at, PlantedKind kind, Optional<Item> item) {

                            record Item(String text, PlantedRow nestedRow) {
                            }
                        }
                        """));

        assertThat(response_records_hold_only_interface_types_jdk_types_and_enums.evaluate(planted).getFailureReport().getDetails())
                .hasSize(3)
                .anySatisfy(detail -> assertThat(detail).contains("PlantedResponse.row").contains("PlantedRow"))
                .anySatisfy(detail -> assertThat(detail).contains("PlantedResponse.values").contains("PlantedValue"))
                .anySatisfy(detail -> assertThat(detail).contains("Item.nestedRow").contains("PlantedRow"));
    }

    private static boolean isOrSitsInAResponse(JavaClass type) {
        return type.getSimpleName().endsWith(RESPONSE) || type.getEnclosingClass().map(ResponseRecordRulesTest::isOrSitsInAResponse).orElse(false);
    }

    private static Stream<JavaClass> heldTypes(JavaType type) {
        Stream<JavaClass> arguments = type instanceof JavaParameterizedType parameterized
                ? parameterized.getActualTypeArguments().stream().flatMap(ResponseRecordRulesTest::heldTypes)
                : Stream.empty();
        JavaClass raw = type.toErasure();
        return Stream.concat(Stream.of(raw.isArray() ? raw.getBaseComponentType() : raw), arguments);
    }

    private static boolean isAdmitted(JavaClass type) {
        return type.isPrimitive() || type.isEnum() || type.getPackageName().startsWith("java.") || type.getPackageName().contains(INTERFACES);
    }

    private static String describe(JavaField field, JavaClass type) {
        return field.getFullName() + " holds " + type.getName() + ", which is neither a type of interfaces/rest, a JDK type nor an enum";
    }
}
