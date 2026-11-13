package cz.novanadeje.app.architecture;

import com.tngtech.archunit.base.DescribedPredicate;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.domain.JavaMethod;
import com.tngtech.archunit.core.domain.JavaParameter;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchCondition;
import com.tngtech.archunit.lang.ArchRule;
import com.tngtech.archunit.lang.ConditionEvents;
import com.tngtech.archunit.lang.SimpleConditionEvent;
import cz.novanadeje.app.AppApplication;
import cz.novanadeje.app.shared.application.version.ExpectedVersion;
import cz.novanadeje.app.shared.application.version.WritePrecondition;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.http.HttpHeaders;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.stream.Stream;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.methods;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noMethods;
import static org.assertj.core.api.Assertions.assertThat;

@AnalyzeClasses(packagesOf = AppApplication.class, importOptions = ImportOption.DoNotIncludeTests.class)
class ExpectedVersionRulesTest {

    private static final String SHARED_RESOLVERS = "cz.novanadeje.app.shared.interfaces.rest";
    private static final Pattern PRECONDITION_READS = Pattern.compile("(?i)if[_-](none[_-])?match|getIf(None)?Match|checkNotModified");
    private static final Set<String> PRECONDITION_HEADERS = Set.of(HttpHeaders.IF_MATCH.toLowerCase(Locale.ROOT), HttpHeaders.IF_NONE_MATCH.toLowerCase(Locale.ROOT));

    @ArchTest
    static final ArchRule precondition_headers_are_read_only_by_the_shared_resolvers = noMethods()
            .that().areDeclaredInClassesThat().resideOutsideOfPackage(SHARED_RESOLVERS)
            .should(new ArchCondition<>("read If-Match or If-None-Match with @RequestHeader, which ExpectedVersion and WritePrecondition read for every write") {
                @Override
                public void check(JavaMethod method, ConditionEvents events) {
                    method.getParameters().stream().filter(ExpectedVersionRulesTest::readsAPreconditionHeader)
                            .forEach(parameter -> events.add(SimpleConditionEvent.satisfied(method, method.getFullName() + " reads a precondition header itself")));
                }
            });

    @ArchTest
    static final ArchRule a_versioned_handler_reads_its_body_before_the_version = methods()
            .that(new DescribedPredicate<>("name an expected version") {
                @Override
                public boolean test(JavaMethod method) {
                    return method.getParameters().stream().anyMatch(ExpectedVersionRulesTest::isExpectedVersion);
                }
            })
            .should(new ArchCondition<>("declare every @RequestBody parameter before the expected version or write precondition, so a body that fails validation answers 400 before a missing version answers 428") {
                @Override
                public void check(JavaMethod method, ConditionEvents events) {
                    List<JavaParameter> parameters = method.getParameters();
                    int version = parameters.stream().filter(ExpectedVersionRulesTest::isExpectedVersion).findFirst().orElseThrow().getIndex();
                    boolean bodyAfter = parameters.stream().anyMatch(parameter -> parameter.getIndex() > version && parameter.isAnnotatedWith(RequestBody.class));
                    events.add(new SimpleConditionEvent(method, !bodyAfter, method.getFullName() + (bodyAfter ? " reads its body after the version" : " reads its body first")));
                }
            });

    @Test
    @DisplayName("Given a planted controller that reads its body after the expected version and one that reads it first, when the rule checks them, then only the first is reported")
    void should_report_a_body_after_the_version_when_checked_given_planted_handlers(@TempDir Path folder) throws IOException {
        JavaClasses planted = PlantedClasses.compiled(folder, Map.of("cz.novanadeje.app.planteda.interfaces.rest.PlantedVersionedController", """
                package cz.novanadeje.app.planteda.interfaces.rest;

                import cz.novanadeje.app.shared.application.version.ExpectedVersion;
                import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.web.bind.annotation.RequestBody;

import java.io.IOException;
import java.nio.file.Path;

                class PlantedVersionedController {

                    record Change(String text) {
                    }

                    void versionFirst(ExpectedVersion version, @RequestBody Change change) {
                    }

                    void bodyFirst(@RequestBody Change change, ExpectedVersion version) {
                    }
                }
                """));

        assertThat(a_versioned_handler_reads_its_body_before_the_version.evaluate(planted).getFailureReport().getDetails())
                .singleElement().satisfies(detail -> assertThat(detail).contains("versionFirst"));
    }

    @Test
    @DisplayName("Given a planted controller that reads its body after the write precondition and one that reads it first, when the rule checks them, then only the first is reported")
    void should_report_a_body_after_the_precondition_when_checked_given_planted_handlers(@TempDir Path folder) throws IOException {
        JavaClasses planted = PlantedClasses.compiled(folder, Map.of("cz.novanadeje.app.planteda.interfaces.rest.PlantedPreconditionController", """
                package cz.novanadeje.app.planteda.interfaces.rest;

                import cz.novanadeje.app.shared.application.version.WritePrecondition;
                import org.springframework.web.bind.annotation.RequestBody;

                class PlantedPreconditionController {

                    record Change(String text) {
                    }

                    void preconditionFirst(WritePrecondition precondition, @RequestBody Change change) {
                    }

                    void bodyFirst(@RequestBody Change change, WritePrecondition precondition) {
                    }
                }
                """));

        assertThat(a_versioned_handler_reads_its_body_before_the_version.evaluate(planted).getFailureReport().getDetails())
                .singleElement().satisfies(detail -> assertThat(detail).contains("preconditionFirst"));
    }

    @Test
    @DisplayName("Given planted handlers that read If-Match or If-None-Match by any spelling, another header, and a shared resolver's own read, when the rule checks them, then only the context's precondition reads are reported")
    void should_report_a_precondition_header_read_outside_the_shared_resolvers_when_checked_given_planted_handlers(@TempDir Path folder) throws IOException {
        JavaClasses planted = PlantedClasses.compiled(folder, Map.of(
                "cz.novanadeje.app.planteda.interfaces.rest.PlantedHeaderController", """
                        package cz.novanadeje.app.planteda.interfaces.rest;

                        import org.springframework.http.HttpHeaders;
                        import org.springframework.web.bind.annotation.RequestHeader;

                        class PlantedHeaderController {

                            void ifMatchByConstant(@RequestHeader(value = HttpHeaders.IF_MATCH, required = false) String ifMatch) {
                            }

                            void ifNoneMatchByName(@RequestHeader(name = "if-none-match") String ifNoneMatch) {
                            }

                            void language(@RequestHeader(HttpHeaders.ACCEPT_LANGUAGE) String language) {
                            }
                        }
                        """,
                SHARED_RESOLVERS + ".PlantedSharedHeaderReader", """
                        package cz.novanadeje.app.shared.interfaces.rest;

                        import org.springframework.web.bind.annotation.RequestHeader;

                        class PlantedSharedHeaderReader {

                            void ifMatch(@RequestHeader("If-Match") String ifMatch) {
                            }
                        }
                        """));

        assertThat(precondition_headers_are_read_only_by_the_shared_resolvers.evaluate(planted).getFailureReport().getDetails())
                .hasSize(2)
                .anySatisfy(detail -> assertThat(detail).contains("ifMatchByConstant"))
                .anySatisfy(detail -> assertThat(detail).contains("ifNoneMatchByName"));
    }

    @Test
    @DisplayName("Given the main sources, when they are searched for precondition headers, then only the shared resolvers read one, whatever the way")
    void should_read_precondition_headers_only_in_the_shared_resolvers_when_searched_given_the_main_sources() throws IOException {
        Path main = Path.of("src", "main", "java");

        assertThat(filesReadingPreconditionHeaders(main))
                .allSatisfy(file -> assertThat(file.toString().replace('\\', '/')).contains("cz/novanadeje/app/shared/interfaces/rest/"));
    }

    @Test
    @DisplayName("Given planted sources that read If-Match from the request, through HttpHeaders or by checkNotModified, when the sources are searched, then each is reported and an unrelated one is not")
    void should_report_every_way_to_read_a_precondition_when_searched_given_planted_sources(@TempDir Path sources) throws IOException {
        Files.writeString(sources.resolve("PlantedRequestHeader.java"), "class PlantedRequestHeader { String v(jakarta.servlet.http.HttpServletRequest r) { return r.getHeader(org.springframework.http.HttpHeaders.IF_MATCH); } }");
        Files.writeString(sources.resolve("PlantedLiteral.java"), "class PlantedLiteral { String n = \"If-None-Match\"; }");
        Files.writeString(sources.resolve("PlantedHeaders.java"), "class PlantedHeaders { Object v(org.springframework.http.HttpHeaders h) { return h.getIfMatch(); } }");
        Files.writeString(sources.resolve("PlantedNotModified.java"), "class PlantedNotModified { boolean v(org.springframework.web.context.request.WebRequest r) { return r.checkNotModified(\"x\"); } }");
        Files.writeString(sources.resolve("Unrelated.java"), "class Unrelated { String n = \"Content-Type\"; }");

        assertThat(filesReadingPreconditionHeaders(sources)).containsExactlyInAnyOrder(sources.resolve("PlantedRequestHeader.java"),
                sources.resolve("PlantedLiteral.java"), sources.resolve("PlantedHeaders.java"), sources.resolve("PlantedNotModified.java"));
    }

    private static List<Path> filesReadingPreconditionHeaders(Path root) throws IOException {
        try (Stream<Path> files = Files.walk(root)) {
            return files.filter(Files::isRegularFile).filter(ExpectedVersionRulesTest::readsAPrecondition).toList();
        }
    }

    private static boolean readsAPrecondition(Path file) {
        try {
            return PRECONDITION_READS.matcher(Files.readString(file)).find();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private static boolean isExpectedVersion(JavaParameter parameter) {
        return parameter.getRawType().isEquivalentTo(ExpectedVersion.class) || parameter.getRawType().isEquivalentTo(WritePrecondition.class);
    }

    private static boolean readsAPreconditionHeader(JavaParameter parameter) {
        return parameter.tryGetAnnotationOfType(RequestHeader.class)
                .map(header -> Stream.of(header.value(), header.name()).map(name -> name.toLowerCase(Locale.ROOT)).anyMatch(PRECONDITION_HEADERS::contains))
                .orElse(false);
    }
}
