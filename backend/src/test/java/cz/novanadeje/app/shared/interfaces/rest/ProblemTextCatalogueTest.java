package cz.novanadeje.app.shared.interfaces.rest;

import cz.novanadeje.app.support.CompiledSources;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.context.support.ReloadableResourceBundleMessageSource;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Properties;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

class ProblemTextCatalogueTest {

    private static final String PLANTED = "cz.novanadeje.app.planted.";
    private static final String UNAVAILABLE = PLANTED + "interfaces.rest.PlantedUnavailable";
    private static final String NO_RESOURCE = NoResourceFoundException.class.getName();
    private static final String CZECH = """
            problem.operations/backup-v2/too-old.title=Záloha je stará
            problem.operations/backup-v2/too-old.detail=Nahrajte prosím novější.
            problem.shared/planted-refusal.title : Odmítnuto
            problem.shared/planted-refusal.detail   Odmítnuto \\
                na dvou řádcích
            problem.donors/planted-stale.title=Změněno
            problem.donors/planted-stale.detail=Změněno mezitím
            problem.donors/planted-joined.title=Nenalezeno
            problem.donors/planted-joined.detail=Nenalezeno vůbec
            problem.donors/planted-joined.detail.word=Slovo
            problem.planted.handler-only.title=Jen v obsluze
            problem.donors/planted-gone.title=Už nic
            problem.donors/with\\ space.title=Klíč s mezerou
            problem.donations/kept-vector.detail.too-large=Ponecháno
            problem.donations/kept-vector.detail.no-paths=Jen česky
            problem.donors/planted-nested.title=Vnořený
            problem.donors/planted-nested.detail=Vnořený kód
            problem.donors/planted-own.title=Vlastní
            problem.donors/planted-own.detail=Vlastní kód
            problem.donors/planted-weak.title=Slabé
            problem.donors/planted-weak.detail=Slabé heslo
            problem.donors/planted-stripped.title=Oříznuté
            problem.donors/planted-stripped.detail=Oříznutý kód
            problem.donors/planted-checked.title=Ověřené
            problem.donors/planted-checked.detail=Ověřený kód
            problem.donors/planted-factory.title=Z továrny
            problem.donors/planted-factory.detail=Kód z továrny
            problemDetail.title.org.springframework.web.servlet.resource.NoResourceFoundException=Nenalezeno
            problemDetail.org.springframework.web.servlet.resource.NoResourceFoundException=Na této adrese nic není.
            problemDetail.title.cz.novanadeje.app.planted.GoneException=Pryč
            """;
    private static final String ENGLISH = """
            problem.operations/backup-v2/too-old.title=The backup is old
            problem.operations/backup-v2/too-old.detail=Please upload a newer one.
            problem.shared/planted-refusal.title:Refused
            problem.shared/planted-refusal.detail=Refused \\
                on two lines
            problem.donors/planted-stale.title=Changed
            problem.donors/planted-joined.title=Not found
            problem.donors/planted-joined.detail=Not found at all
            problem.donations/kept-vector.detail.too-large=Kept
            problem.donors/planted-nested.title=Nested
            problem.donors/planted-nested.detail=Nested code
            problem.donors/planted-own.title=Own
            problem.donors/planted-own.detail=Own code
            problem.donors/planted-weak.title=Weak
            problem.donors/planted-weak.detail=Weak password
            problem.donors/planted-stripped.title=Stripped
            problem.donors/planted-stripped.detail=Stripped code
            problem.donors/planted-checked.title=Checked
            problem.donors/planted-checked.detail=Checked code
            problem.donors/planted-factory.title=Factory
            problem.donors/planted-factory.detail=Factory code
            problemDetail.title.org.springframework.web.servlet.resource.NoResourceFoundException=Not found
            problemDetail.org.springframework.web.servlet.resource.NoResourceFoundException=There is nothing at this address.
            problemDetail.title.cz.novanadeje.app.planted.interfaces.rest.PlantedUnavailable=Unavailable
            problemDetail.cz.novanadeje.app.planted.interfaces.rest.PlantedUnavailable=Try again later.
            """;
    private static final String BASE = """
            problem.donors/planted-stale.detail=Změněno mezitím
            problemDetail.title.cz.novanadeje.app.planted.interfaces.rest.PlantedUnavailable=Nedostupné
            problemDetail.cz.novanadeje.app.planted.interfaces.rest.PlantedUnavailable=Zkuste to později.
            problem.donors/planted-base-only.title=Jen v základu
            """;

    @Nested
    @DisplayName("Given planted failures, handlers and bundles")
    class GivenPlantedFailuresHandlersAndBundles {

        private static ProblemTextCatalogue catalogue;
        private static Path bundles;

        @BeforeAll
        static void plant(@TempDir Path folder) throws IOException {
            Path classes = CompiledSources.compiledInto(folder, Map.ofEntries(
                    planted("domain.NestedCodeRefused", """
                            public class NestedCodeRefused extends cz.novanadeje.app.shared.domain.error.RuleViolation {
                                static final String EXTENSION = "challenge";
                                public NestedCodeRefused() { super("operations/backup-v2/too-old", "The backup is too old"); }
                            }
                            """),
                    planted("domain.BareCode", """
                            public class BareCode extends cz.novanadeje.app.shared.domain.error.RuleViolation {
                                public BareCode() { super("password-too-predictable", "Refused"); }
                            }
                            """),
                    planted("domain.NestedReasons", """
                            public class NestedReasons extends cz.novanadeje.app.shared.domain.error.Conflict {
                                enum Reason {
                                    PLANTED("donors/planted-nested");
                                    private final String code;
                                    Reason(String code) { this.code = code; }
                                }
                                NestedReasons(Reason reason) { super(reason.code, "Refused"); }
                            }
                            """),
                    planted("domain.OwnCodeForwarded", """
                            public class OwnCodeForwarded extends cz.novanadeje.app.shared.domain.error.NotFound {
                                public static final String CODE = "donors/planted-own";
                                public OwnCodeForwarded() { this(CODE); }
                                public OwnCodeForwarded(String code) { super(code, "Not found"); }
                            }
                            """),
                    planted("domain.WeakWord", """
                            public class WeakWord extends cz.novanadeje.app.shared.domain.error.RuleViolation {
                                private WeakWord(String code, String message) { super(code, message); }
                                public static WeakWord tooShort() { return new WeakWord("donors/planted-weak", "Too short"); }
                                public static WeakWord weak() { return new WeakWord("weak", "Too weak"); }
                                public static WeakWord spaced() { return new WeakWord("donors/planted-weak ", "Too weak"); }
                            }
                            """),
                    planted("domain.StrippedCode", """
                            public class StrippedCode extends cz.novanadeje.app.shared.domain.error.Conflict {
                                public static final String CODE = "donors/planted-stripped";
                                public StrippedCode() { this(CODE); }
                                public StrippedCode(String code) { super(code.strip(), "Refused"); }
                            }
                            """),
                    planted("domain.CheckedCode", """
                            public class CheckedCode extends cz.novanadeje.app.shared.domain.error.Conflict {
                                public static final String CODE = "donors/planted-checked";
                                public CheckedCode() { this(CODE); }
                                public CheckedCode(String code) { super(java.util.Objects.requireNonNull(code), "Refused"); }
                            }
                            """),
                    planted("domain.FactoryForwarded", """
                            public class FactoryForwarded extends cz.novanadeje.app.shared.domain.error.NotFound {
                                public static final String CODE = "donors/planted-factory";
                                private FactoryForwarded(String code) { super(code, "Not found"); }
                                public static FactoryForwarded of(String code) { return new FactoryForwarded(code); }
                                public static FactoryForwarded planted() { return of(CODE); }
                            }
                            """),
                    planted("interfaces.rest.PlantedUnavailable", """
                            public class PlantedUnavailable extends org.springframework.web.ErrorResponseException {
                                public PlantedUnavailable() { super(org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE); }
                            }
                            """),
                    planted("interfaces.rest.AbstractUnavailable", """
                            public abstract class AbstractUnavailable extends org.springframework.web.ErrorResponseException {
                                protected AbstractUnavailable() { super(org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE); }
                            }
                            """),
                    planted("domain.SharedRefusal", """
                            public class SharedRefusal extends cz.novanadeje.app.shared.domain.error.Conflict {
                                public SharedRefusal() { super("shared/planted-refusal", "Refused"); }
                            }
                            """),
                    planted("domain.PlantedStaleWrite", """
                            public class PlantedStaleWrite extends cz.novanadeje.app.shared.domain.error.StaleWrite {
                                public static final String CODE = "donors/planted-stale";
                                public PlantedStaleWrite(String version) { super(CODE, "Changed meanwhile", version); }
                            }
                            """),
                    planted("domain.JoinedCode", """
                            public class JoinedCode extends cz.novanadeje.app.shared.domain.error.NotFound {
                                static final String CONTEXT = "donors/";
                                public static final String CODE = CONTEXT + "planted-joined";
                                public JoinedCode() { super(CODE, "Not found"); }
                            }
                            """),
                    planted("domain.RunTimeCode", """
                            public class RunTimeCode extends cz.novanadeje.app.shared.domain.error.AccessDenied {
                                public RunTimeCode(String kind) { super("donors/" + kind, "Refused"); }
                            }
                            """),
                    planted("domain.UppercaseCode", """
                            public class UppercaseCode extends cz.novanadeje.app.shared.domain.error.RuleViolation {
                                public UppercaseCode() { super("donors/Planted_Code", "Refused"); }
                            }
                            """),
                    planted("domain.ForwardedCode", """
                            public class ForwardedCode extends cz.novanadeje.app.shared.domain.error.AuthenticationFailure {
                                public ForwardedCode(String code) { super(code, "Refused"); }
                            }
                            """),
                    planted("domain.AbstractRefusal", """
                            public abstract class AbstractRefusal extends cz.novanadeje.app.shared.domain.error.RuleViolation {
                                protected AbstractRefusal(String code) { super(code, "Refused"); }
                            }
                            """),
                    planted("application.ForwardingService", """
                            public class ForwardingService {
                                Object refuse() { return new cz.novanadeje.app.planted.domain.ForwardedCode("donors/forwarded-elsewhere"); }
                            }
                            """),
                    planted("interfaces.rest.PlantedHandler", """
                            public class PlantedHandler {
                                String title() { return "problem.planted.handler-only.title"; }
                                String detail(String word) { return "problem." + cz.novanadeje.app.planted.domain.JoinedCode.CODE + ".detail." + word; }
                                String domainTitle(String code) { return "problem." + code + ".title"; }
                                String empty(String word) { return "problem.donors/planted-empty.detail." + word; }
                            }
                            """),
                    planted("infrastructure.PlantedMailer", """
                            public class PlantedMailer {
                                String key() { return "problem.intro"; }
                            }
                            """)));
            catalogue = ProblemTextCatalogue.of(List.of(classes), List.of(NoResourceFoundException.class));
            bundles = Files.createDirectories(folder.resolve("bundles"));
            Files.writeString(bundles.resolve("messages_cs.properties"), CZECH);
            Files.writeString(bundles.resolve("messages_en.properties"), ENGLISH);
            Files.writeString(bundles.resolve("messages.properties"), BASE);
        }

        @Test
        @DisplayName("when the codes are read from the class files, then a code with digits and nested slashes, one of a namespace that is no context, a stale write's and one joined from constants are found")
        void should_find_every_constant_code_when_read_given_codes_the_source_pattern_missed() {
            assertThat(catalogue.codes())
                    .containsExactlyInAnyOrder("operations/backup-v2/too-old", "shared/planted-refusal", "donors/planted-stale", "donors/planted-joined",
                            "donors/planted-nested", "donors/planted-own", "donors/planted-weak", "donors/planted-stripped", "donors/planted-checked",
                            "donors/planted-factory");
        }

        @Test
        @DisplayName("when the codes are read from the class files, then a code held by an enum nested in a failure is found and the failure counts as holding its own code")
        void should_find_a_code_of_a_nested_enum_when_read_given_a_failure_whose_codes_live_in_its_enum() {
            assertThat(catalogue.codes()).contains("donors/planted-nested");
            assertThat(catalogue.failuresWithoutCode()).doesNotContain(PLANTED + "domain.NestedReasons");
        }

        @Test
        @DisplayName("when the answers of the site's own error responses are collected, then every concrete one and each framework answer named are found, and an abstract one is not")
        void should_find_concrete_error_responses_when_collected_given_planted_and_framework_ones() {
            assertThat(catalogue.errorResponses()).containsExactlyInAnyOrder(UNAVAILABLE, NO_RESOURCE);
        }

        @Test
        @DisplayName("when the codes are read from the class files, then a code built at run time, one of other characters and a bare word without its context are reported, and a bare word without a dash is not, so no code is skipped in silence")
        void should_report_irregular_codes_when_read_given_a_code_built_at_run_time_and_one_with_uppercase() {
            assertThat(catalogue.irregularCodes())
                    .containsExactlyInAnyOrder(PLANTED + "domain.RunTimeCode: donors/…", PLANTED + "domain.UppercaseCode: donors/Planted_Code",
                            PLANTED + "domain.BareCode: password-too-predictable", PLANTED + "domain.WeakWord: weak",
                            PLANTED + "domain.WeakWord: donors/planted-weak ", PLANTED + "domain.RunTimeCode: a code a method call returns",
                            PLANTED + "domain.StrippedCode: a code a method call returns");
        }

        @Test
        @DisplayName("when the codes are read from the class files, then a concrete failure that takes its code from its caller is reported and an abstract one is not")
        void should_report_a_failure_without_its_own_code_when_read_given_a_code_handed_in_by_a_caller() {
            assertThat(catalogue.failuresWithoutCode()).containsExactly(PLANTED + "domain.ForwardedCode");
            assertThat(catalogue.codes()).doesNotContain("donors/forwarded-elsewhere");
        }

        @Test
        @DisplayName("when the constructors are read, then a concrete failure whose open constructor passes its own parameter as the code is reported, even beside a code of its own, and an abstract one is not")
        void should_report_a_constructor_forwarding_its_parameter_as_the_code_when_read_given_open_constructors() {
            assertThat(catalogue.failuresForwardingACode()).containsExactlyInAnyOrder(PLANTED + "domain.ForwardedCode", PLANTED + "domain.OwnCodeForwarded",
                    PLANTED + "domain.CheckedCode", PLANTED + "domain.FactoryForwarded");
        }

        @Test
        @DisplayName("when the code arguments are read where each failure is built, then a bare word and a code with a stray space passed to a private constructor are reported, and the private constructor that forwards them is not")
        void should_report_a_code_argument_that_is_no_code_when_read_given_factories_of_a_private_forwarding_constructor() {
            assertThat(catalogue.irregularCodes()).contains(PLANTED + "domain.WeakWord: weak", PLANTED + "domain.WeakWord: donors/planted-weak ");
            assertThat(catalogue.failuresForwardingACode()).doesNotContain(PLANTED + "domain.WeakWord");
        }

        @Test
        @DisplayName("when the code arguments are read, then a code a method call changes on the way (code.strip()) is reported, as any code a method call returns could come from the client")
        void should_report_a_code_changed_by_a_method_call_when_read_given_a_constructor_that_strips_it() {
            assertThat(catalogue.irregularCodes()).contains(PLANTED + "domain.StrippedCode: a code a method call returns");
        }

        @Test
        @DisplayName("when the keys a handler reads are collected, then a literal key and a key prefix joined at run time are found, the domain's own lookup and a mail text key are not")
        void should_find_the_keys_handlers_read_when_collected_given_literal_and_joined_keys() {
            assertThat(catalogue.keysRead()).containsExactly("problem.planted.handler-only.title");
            assertThat(catalogue.keyPrefixesRead()).containsExactlyInAnyOrder("problem.donors/planted-joined.detail.", "problem.donors/planted-empty.detail.");
        }

        @Test
        @DisplayName("when the texts are checked, then a text only the base bundle holds, a key a handler reads, a text under a prefix it reads or under a kept prefix, an error response's texts and a prefix without any text are missing where a bundle lacks them, and texts split over lines or written with a colon or a space are found")
        void should_report_each_missing_text_when_checked_given_bundles_parsed_as_properties() throws IOException {
            List<String> missing = catalogue.missingTexts(Map.of("cs", bundle("messages_cs.properties"), "en", bundle("messages_en.properties")),
                    Set.of("problem.donations/kept-vector.detail."));

            assertThat(missing).containsExactlyInAnyOrder(
                    "problem.donors/planted-stale.detail (en)",
                    "problem.donors/planted-joined.detail.word (en)",
                    "problem.planted.handler-only.title (en)",
                    "problem.donations/kept-vector.detail.no-paths (en)",
                    "problem.donors/planted-empty.detail.… (cs)",
                    "problem.donors/planted-empty.detail.… (en)",
                    "problem.donors/planted-joined.detail.… (en)",
                    "problemDetail.title." + UNAVAILABLE + " (cs)",
                    "problemDetail." + UNAVAILABLE + " (cs)");
            assertThat(bundle("messages_cs.properties").getProperty("problem.shared/planted-refusal.detail")).isEqualTo("Odmítnuto na dvou řádcích");
        }

        @Test
        @DisplayName("when the base bundle is checked for the texts read without the Czech fallback, then an answer of Spring's with site texts whose texts it lacks is reported, and a key it holds is not")
        void should_report_texts_the_base_lacks_when_checked_given_texts_read_without_the_czech_fallback() throws IOException {
            List<String> missing = ProblemTextCatalogue.missingWithoutTheCzechFallback(bundle("messages.properties"), List.of(NoResourceFoundException.class),
                    List.of("problem.donors/planted-stale.detail"));

            assertThat(missing).containsExactlyInAnyOrder("problemDetail.title." + NO_RESOURCE, "problemDetail." + NO_RESOURCE);
        }

        @Test
        @DisplayName("when the English text is looked up as the old check did, then the base bundle answers for it, which the bundle-by-bundle check no longer accepts")
        void should_find_a_text_through_the_base_bundle_when_looked_up_given_the_message_source_the_old_check_used() {
            ReloadableResourceBundleMessageSource messages = new ReloadableResourceBundleMessageSource();
            messages.setBasename(bundles.resolve("messages").toUri().toString());
            messages.setDefaultEncoding("UTF-8");
            messages.setFallbackToSystemLocale(false);

            assertThat(messages.getMessage("problem.donors/planted-stale.detail", null, null, Locale.ENGLISH)).isEqualTo("Změněno mezitím");
        }

        @Test
        @DisplayName("when the orphans are listed, then a text no code or handler names, a key with a space, an error response text of no such class and a text only the base bundle holds are orphans, and texts of codes, of keys read, of error responses and under a kept prefix are not")
        void should_list_orphan_texts_when_listed_given_texts_nothing_reads() throws IOException {
            List<String> orphans = catalogue.orphanTexts(
                    List.of(bundle("messages_cs.properties"), bundle("messages_en.properties"), bundle("messages.properties")),
                    Set.of("problem.donations/kept-vector.detail."));

            assertThat(orphans).containsExactly("problem.donors/planted-base-only.title", "problem.donors/planted-gone.title",
                    "problem.donors/with space.title", "problemDetail.title.cz.novanadeje.app.planted.GoneException");
        }

        private static Properties bundle(String file) throws IOException {
            return ProblemTextCatalogue.bundle(new ByteArrayInputStream(Files.readString(bundles.resolve(file)).getBytes(StandardCharsets.UTF_8)));
        }
    }

    private static Map.Entry<String, String> planted(String relativeName, String body) {
        String className = PLANTED + relativeName;
        return Map.entry(className, "package " + className.substring(0, className.lastIndexOf('.')) + ";\n" + body);
    }
}
