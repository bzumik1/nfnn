package cz.novanadeje.app.architecture;

import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.domain.JavaField;
import com.tngtech.archunit.core.domain.JavaMethod;
import com.tngtech.archunit.core.domain.JavaModifier;
import com.tngtech.archunit.core.domain.JavaParameter;
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
import jakarta.validation.constraints.Size;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.web.bind.annotation.RequestBody;

import java.io.IOException;
import java.nio.file.Path;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.methods;
import static org.assertj.core.api.Assertions.assertThat;

@AnalyzeClasses(
        packagesOf = AppApplication.class,
        importOptions = ImportOption.DoNotIncludeTests.class
)
class RequestValidationRulesTest {

    private static final String APPLICATION_CODE = "cz.novanadeje.app.";

    @ArchTest
    static final ArchRule every_text_and_collection_of_a_request_body_has_its_size_limit = methods()
            .that().areDeclaredInClassesThat().resideInAPackage("..interfaces.rest..")
            .should(limitTheSizeOfEveryTextAndCollectionOfTheirRequestBodies())
            .because("security.md, Input: Bean Validation with explicit @Size on every request record, so no field of a request grows without bound");

    @Test
    @DisplayName("Given a planted controller whose request bodies leave texts and collections unbounded, directly, in a nested record, in a list's records and in a record named otherwise, when the rule checks it, then each is reported and the bounded ones, a number and a query parameter are not")
    void should_report_every_unbounded_field_when_checked_given_a_planted_controller(@TempDir Path folder) throws IOException {
        JavaClasses planted = PlantedClasses.compiled(folder, Map.of("cz.novanadeje.app.planteda.interfaces.rest.PlantedController", """
                package cz.novanadeje.app.planteda.interfaces.rest;

                import jakarta.validation.constraints.Pattern;
                import jakarta.validation.constraints.Size;
                import java.util.List;
                import java.util.Map;
                import org.springframework.web.bind.annotation.PostMapping;
                import org.springframework.web.bind.annotation.RequestBody;
                import org.springframework.web.bind.annotation.RequestParam;

                class PlantedController {

                    record PlantedRequest(@Pattern(regexp = "[0-9]{6}") String code, @Size(max = 10) String bounded, Integer count,
                                          Address address, @Size(max = 3) List<Line> lines, Map<String, String> extras) {
                    }

                    record Address(String street) {
                    }

                    record Line(String text) {
                    }

                    record PlantedConfirmation(String token) {
                    }

                    @PostMapping("/planted")
                    void submit(@RequestBody PlantedRequest request, @RequestParam String query) {
                    }

                    @PostMapping("/planted/confirmation")
                    void confirm(@RequestBody PlantedConfirmation confirmation) {
                    }
                }
                """));

        assertThat(every_text_and_collection_of_a_request_body_has_its_size_limit.evaluate(planted).getFailureReport().getDetails())
                .hasSize(5)
                .anySatisfy(detail -> assertThat(detail).contains("PlantedRequest.code "))
                .anySatisfy(detail -> assertThat(detail).contains("Address.street "))
                .anySatisfy(detail -> assertThat(detail).contains("Line.text "))
                .anySatisfy(detail -> assertThat(detail).contains("PlantedRequest.extras "))
                .anySatisfy(detail -> assertThat(detail).contains("PlantedConfirmation.token "))
                .noneSatisfy(detail -> assertThat(detail).contains("bounded"))
                .noneSatisfy(detail -> assertThat(detail).contains("query"));
    }

    private static ArchCondition<JavaMethod> limitTheSizeOfEveryTextAndCollectionOfTheirRequestBodies() {
        return new ArchCondition<>("limit with @Size every String, array, collection and map of their @RequestBody records, nested records and list elements included") {
            @Override
            public void check(JavaMethod method, ConditionEvents events) {
                Set<JavaClass> records = new LinkedHashSet<>();
                method.getParameters().stream()
                        .filter(parameter -> parameter.isAnnotatedWith(RequestBody.class))
                        .map(JavaParameter::getType)
                        .forEach(type -> collectRecords(type, records));
                records.stream()
                        .flatMap(record -> record.getFields().stream())
                        .filter(field -> !field.getModifiers().contains(JavaModifier.STATIC))
                        .filter(RequestValidationRulesTest::isUnbounded)
                        .filter(field -> !field.isAnnotatedWith(Size.class))
                        .forEach(field -> events.add(SimpleConditionEvent.violated(method,
                                field.getFullName() + " of the request body of " + method.getFullName() + " has no @Size")));
            }
        };
    }

    private static void collectRecords(JavaType type, Set<JavaClass> records) {
        JavaClass raw = type.toErasure();
        if (type instanceof JavaParameterizedType parameterized) {
            parameterized.getActualTypeArguments().forEach(argument -> collectRecords(argument, records));
        }
        if (!raw.isRecord() || !raw.getName().startsWith(APPLICATION_CODE) || !records.add(raw)) {
            return;
        }
        raw.getFields().stream()
                .filter(field -> !field.getModifiers().contains(JavaModifier.STATIC))
                .map(JavaField::getType)
                .forEach(component -> collectRecords(component, records));
    }

    private static boolean isUnbounded(JavaField field) {
        JavaClass type = field.getRawType();
        return type.isEquivalentTo(String.class) || type.isArray() || type.isAssignableTo(Collection.class) || type.isAssignableTo(Map.class);
    }
}
