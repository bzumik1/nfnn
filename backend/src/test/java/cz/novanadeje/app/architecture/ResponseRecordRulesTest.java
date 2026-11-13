package cz.novanadeje.app.architecture;

import com.tngtech.archunit.base.DescribedPredicate;
import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.domain.JavaField;
import com.tngtech.archunit.core.domain.JavaMethod;
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
import org.springframework.core.io.Resource;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Stream;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.classes;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.methods;
import static org.assertj.core.api.Assertions.assertThat;

@AnalyzeClasses(packagesOf = AppApplication.class, importOptions = ImportOption.DoNotIncludeTests.class)
class ResponseRecordRulesTest {

    private static final String RESPONSE = "Response";
    private static final String INTERFACES = ".interfaces.rest";
    private static final Set<String> WRAPPERS = Set.of(ResponseEntity.class.getName(), List.class.getName(), Optional.class.getName());
    private static final Set<String> ANSWERS = Set.of(Void.class.getName(), String.class.getName(), Resource.class.getName(), SseEmitter.class.getName());

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

    @ArchTest
    static final ArchRule handlers_answer_with_response_records = methods()
            .that().areDeclaredInClassesThat().areMetaAnnotatedWith(Controller.class)
            .and().areMetaAnnotatedWith(RequestMapping.class)
            .should(new ArchCondition<>("answer with a response record of interfaces/rest, nothing, bytes, a text, a resource or an event stream") {
                @Override
                public void check(JavaMethod handler, ConditionEvents events) {
                    answeredTypes(handler.getReturnType()).filter(type -> !isAnAnswer(type))
                            .forEach(type -> events.add(SimpleConditionEvent.violated(handler, handler.getFullName() + " answers with " + type.getName())));
                }
            })
            .because("backend.md, REST: request and response records only, so a record named otherwise cannot carry an application or domain type to the wire");

    @Test
    @DisplayName("Given planted responses holding an application record, a domain value inside a list, an array, a map value and an optional list, a JDK type, an enum and another response, when the rule checks them, then only the application and domain types are reported")
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

                        record PlantedResponse(PlantedRow row, List<PlantedValue> values, Instant at, PlantedKind kind, Optional<Item> item,
                                               PlantedValue[] valueArray, java.util.Map<String, PlantedRow> rowsByName, Optional<List<PlantedValue>> maybeValues) {

                            record Item(String text, PlantedRow nestedRow) {
                            }
                        }
                        """));

        assertThat(response_records_hold_only_interface_types_jdk_types_and_enums.evaluate(planted).getFailureReport().getDetails())
                .hasSize(6)
                .anySatisfy(detail -> assertThat(detail).contains("PlantedResponse.valueArray").contains("PlantedValue"))
                .anySatisfy(detail -> assertThat(detail).contains("PlantedResponse.rowsByName").contains("PlantedRow"))
                .anySatisfy(detail -> assertThat(detail).contains("PlantedResponse.maybeValues").contains("PlantedValue"))
                .anySatisfy(detail -> assertThat(detail).contains("PlantedResponse.row ").contains("PlantedRow"))
                .anySatisfy(detail -> assertThat(detail).contains("PlantedResponse.values").contains("PlantedValue"))
                .anySatisfy(detail -> assertThat(detail).contains("Item.nestedRow").contains("PlantedRow"));
    }

    @Test
    @DisplayName("Given a planted controller answering with an application record, a record named otherwise and an untyped entity, and with a response record, bytes and nothing, when the rule checks it, then only the first three are reported")
    void should_report_answers_that_are_no_response_records_when_checked_given_a_planted_controller(@TempDir Path folder) throws IOException {
        JavaClasses planted = PlantedClasses.compiled(folder, Map.of(
                "cz.novanadeje.app.planteda.application.PlantedRow", """
                        package cz.novanadeje.app.planteda.application;

                        public record PlantedRow(String text) {
                        }
                        """,
                "cz.novanadeje.app.planteda.interfaces.rest.PlantedController", """
                        package cz.novanadeje.app.planteda.interfaces.rest;

                        import cz.novanadeje.app.planteda.application.PlantedRow;
                        import org.springframework.http.ResponseEntity;
                        import org.springframework.web.bind.annotation.GetMapping;
                        import org.springframework.web.bind.annotation.RestController;

                        @RestController
                        class PlantedController {

                            record PlantedMetadata(String issuer) {
                            }

                            record PlantedAnswerResponse(String text) {
                            }

                            @GetMapping("/row")
                            PlantedRow row() {
                                return null;
                            }

                            @GetMapping("/metadata")
                            PlantedMetadata metadata() {
                                return null;
                            }

                            @GetMapping("/anything")
                            ResponseEntity<?> anything() {
                                return null;
                            }

                            @GetMapping("/answer")
                            ResponseEntity<PlantedAnswerResponse> answer() {
                                return null;
                            }

                            @GetMapping("/bytes")
                            byte[] bytes() {
                                return null;
                            }

                            @GetMapping("/nothing")
                            void nothing() {
                            }
                        }
                        """));

        assertThat(handlers_answer_with_response_records.evaluate(planted).getFailureReport().getDetails())
                .hasSize(3)
                .anySatisfy(detail -> assertThat(detail).contains(".row()"))
                .anySatisfy(detail -> assertThat(detail).contains(".metadata()"))
                .anySatisfy(detail -> assertThat(detail).contains(".anything()"));
    }

    private static Stream<JavaClass> answeredTypes(JavaType type) {
        JavaClass raw = type.toErasure();
        if (WRAPPERS.contains(raw.getName()) && type instanceof JavaParameterizedType parameterized) {
            return parameterized.getActualTypeArguments().stream().flatMap(ResponseRecordRulesTest::answeredTypes);
        }
        return Stream.of(raw);
    }

    private static boolean isAnAnswer(JavaClass type) {
        return type.isPrimitive() || ANSWERS.contains(type.getName()) || type.isArray() && type.getComponentType().isPrimitive()
                || isAResponseRecord(type) || isAnInterfaceOfResponseRecords(type);
    }

    private static boolean isAResponseRecord(JavaClass type) {
        return type.getPackageName().contains(INTERFACES) && isOrSitsInAResponse(type);
    }

    private static boolean isAnInterfaceOfResponseRecords(JavaClass type) {
        return type.isInterface() && type.getPackageName().contains(INTERFACES) && !type.getAllSubclasses().isEmpty()
                && type.getAllSubclasses().stream().allMatch(ResponseRecordRulesTest::isAResponseRecord);
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
