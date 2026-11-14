package cz.novanadeje.app.architecture;

import com.tngtech.archunit.base.DescribedPredicate;
import com.tngtech.archunit.core.domain.JavaField;
import com.tngtech.archunit.core.domain.JavaModifier;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchCondition;
import com.tngtech.archunit.lang.ArchRule;
import cz.novanadeje.app.AppApplication;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Path;
import java.util.Map;
import java.util.Optional;
import java.util.OptionalDouble;
import java.util.OptionalInt;
import java.util.OptionalLong;
import java.util.Set;

import static com.tngtech.archunit.base.DescribedPredicate.describe;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noFields;
import static org.assertj.core.api.Assertions.assertThat;

@AnalyzeClasses(
        packagesOf = AppApplication.class,
        importOptions = ImportOption.DoNotIncludeTests.class
)
class OptionalFieldRulesTest {

    private static final Set<String> OPTIONAL_TYPES = Set.of(Optional.class.getName(), OptionalInt.class.getName(), OptionalLong.class.getName(),
            OptionalDouble.class.getName());

    private static final DescribedPredicate<JavaField> HOLDING_AN_OPTIONAL = describe("be an Optional, an OptionalInt, -Long or -Double, or an array of one",
            field -> OPTIONAL_TYPES.contains(field.getRawType().getBaseComponentType().getName()));

    @ArchTest
    static final ArchRule classes_hold_no_optional_field = noFields()
            .that(describe("are declared in a class that is not a record, or are static", (JavaField field) ->
                    !field.getOwner().isRecord() || field.getModifiers().contains(JavaModifier.STATIC)))
            .and().doNotHaveModifier(JavaModifier.SYNTHETIC)
            .should(ArchCondition.from(HOLDING_AN_OPTIONAL))
            .because("backend.md, Domain: Optional is for return values and for record components that may be absent, never a field in a class; "
                    + "a class keeps a nullable field and answers an Optional from its accessor, or holds a value that names the absence");

    @Test
    @DisplayName("Given planted classes, enums and records holding Optional or nullable fields, a primitive Optional, an array of Optional, a cache of Optional values, a record's static Optional and an anonymous class capturing an Optional, when the rule checks them, then exactly the Optional fields written in source are reported, and neither the cache nor the captured one")
    void should_report_every_optional_field_of_a_class_when_checked_given_planted_classes(@TempDir Path folder) throws IOException {
        JavaClasses planted = PlantedClasses.compiled(folder, Map.of(
                "cz.novanadeje.app.plantedo.domain.PlantedHolder", """
                        package cz.novanadeje.app.plantedo.domain;

                        import java.util.Optional;

                        public class PlantedHolder {

                            private final Optional<String> name;

                            public PlantedHolder(Optional<String> name) {
                                this.name = name;
                            }

                            public Optional<String> name() {
                                return name;
                            }
                        }
                        """,
                "cz.novanadeje.app.plantedo.domain.PlantedKind", """
                        package cz.novanadeje.app.plantedo.domain;

                        import java.util.Optional;

                        public enum PlantedKind {
                            FIRST(Optional.of("area")),
                            SECOND(Optional.empty());

                            private final Optional<String> area;

                            PlantedKind(Optional<String> area) {
                                this.area = area;
                            }

                            public Optional<String> area() {
                                return area;
                            }
                        }
                        """,
                "cz.novanadeje.app.plantedo.domain.PlantedValue", """
                        package cz.novanadeje.app.plantedo.domain;

                        import java.util.Optional;

                        public record PlantedValue(String id, Optional<String> note) {
                        }
                        """,
                "cz.novanadeje.app.plantedo.domain.PlantedShapes", """
                        package cz.novanadeje.app.plantedo.domain;

                        import java.util.Map;
                        import java.util.Optional;
                        import java.util.OptionalInt;

                        public class PlantedShapes {

                            private OptionalInt count;
                            private Map<String, Optional<String>> knownAbsent;
                            private Optional<String>[] slots;

                            public Runnable capturing(Optional<String> captured) {
                                return new Runnable() {
                                    @Override
                                    public void run() {
                                        captured.isPresent();
                                    }
                                };
                            }
                        }
                        """,
                "cz.novanadeje.app.plantedo.domain.PlantedRecordConstant", """
                        package cz.novanadeje.app.plantedo.domain;

                        import java.util.Optional;

                        public record PlantedRecordConstant(String id) {

                            static final Optional<String> NONE = Optional.empty();
                        }
                        """,
                "cz.novanadeje.app.plantedo.infrastructure.PlantedSource", """
                        package cz.novanadeje.app.plantedo.infrastructure;

                        import java.util.Optional;

                        class PlantedSource {

                            private final String key;

                            PlantedSource(String key) {
                                this.key = key;
                            }

                            Optional<String> key() {
                                return Optional.ofNullable(key);
                            }
                        }
                        """));

        assertThat(classes_hold_no_optional_field.evaluate(planted).getFailureReport().getDetails())
                .hasSize(5)
                .anySatisfy(detail -> assertThat(detail).contains("PlantedShapes.count"))
                .noneSatisfy(detail -> assertThat(detail).contains("knownAbsent"))
                .anySatisfy(detail -> assertThat(detail).contains("PlantedShapes.slots"))
                .anySatisfy(detail -> assertThat(detail).contains("PlantedRecordConstant.NONE"))
                .noneSatisfy(detail -> assertThat(detail).contains("val$captured"))
                .anySatisfy(detail -> assertThat(detail).contains("PlantedHolder.name"))
                .anySatisfy(detail -> assertThat(detail).contains("PlantedKind.area"));
    }
}
