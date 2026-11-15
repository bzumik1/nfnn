package cz.novanadeje.app.shared.interfaces.rest;

import cz.novanadeje.app.architecture.PlantedClasses;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.context.support.ReloadableResourceBundleMessageSource;

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
            """;
    private static final String BASE = """
            problem.donors/planted-stale.detail=Změněno mezitím
            """;

    @Nested
    @DisplayName("Given planted failures, handlers and bundles")
    class GivenPlantedFailuresHandlersAndBundles {

        private static ProblemTextCatalogue catalogue;
        private static Path bundles;

        @BeforeAll
        static void plant(@TempDir Path folder) throws IOException {
            Path classes = PlantedClasses.compiledInto(folder, Map.ofEntries(
                    planted("domain.NestedCodeRefused", """
                            public class NestedCodeRefused extends cz.novanadeje.app.shared.domain.error.RuleViolation {
                                public NestedCodeRefused() { super("operations/backup-v2/too-old", "The backup is too old"); }
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
                            }
                            """),
                    planted("infrastructure.PlantedMailer", """
                            public class PlantedMailer {
                                String key() { return "problem.intro"; }
                            }
                            """)));
            catalogue = ProblemTextCatalogue.of(List.of(classes));
            bundles = Files.createDirectories(folder.resolve("bundles"));
            Files.writeString(bundles.resolve("messages_cs.properties"), CZECH);
            Files.writeString(bundles.resolve("messages_en.properties"), ENGLISH);
            Files.writeString(bundles.resolve("messages.properties"), BASE);
        }

        @Test
        @DisplayName("when the codes are read from the class files, then a code with digits and nested slashes, one of a namespace that is no context, a stale write's and one joined from constants are found")
        void should_find_every_constant_code_when_read_given_codes_the_source_pattern_missed() {
            assertThat(catalogue.codes())
                    .containsExactlyInAnyOrder("operations/backup-v2/too-old", "shared/planted-refusal", "donors/planted-stale", "donors/planted-joined");
        }

        @Test
        @DisplayName("when the codes are read from the class files, then a code built at run time and one of other characters are reported, so no code is skipped in silence")
        void should_report_irregular_codes_when_read_given_a_code_built_at_run_time_and_one_with_uppercase() {
            assertThat(catalogue.irregularCodes())
                    .containsExactlyInAnyOrder(PLANTED + "domain.RunTimeCode: donors/…", PLANTED + "domain.UppercaseCode: donors/Planted_Code");
        }

        @Test
        @DisplayName("when the codes are read from the class files, then a concrete failure that takes its code from its caller is reported and an abstract one is not")
        void should_report_a_failure_without_its_own_code_when_read_given_a_code_handed_in_by_a_caller() {
            assertThat(catalogue.failuresWithoutCode()).containsExactly(PLANTED + "domain.ForwardedCode");
            assertThat(catalogue.codes()).doesNotContain("donors/forwarded-elsewhere");
        }

        @Test
        @DisplayName("when the keys a handler reads are collected, then a literal key and a key prefix joined at run time are found, the domain's own lookup and a mail text key are not")
        void should_find_the_keys_handlers_read_when_collected_given_literal_and_joined_keys() {
            assertThat(catalogue.keysRead()).containsExactly("problem.planted.handler-only.title");
            assertThat(catalogue.keyPrefixesRead()).containsExactly("problem.donors/planted-joined.detail.");
        }

        @Test
        @DisplayName("when the texts are checked, then a text only the base bundle holds, a key a handler reads and a text under a prefix it reads are missing in English, and texts split over lines or written with a colon or a space are found")
        void should_report_each_missing_text_when_checked_given_bundles_parsed_as_properties() throws IOException {
            List<String> missing = catalogue.missingTexts(Map.of("cs", bundle("messages_cs.properties"), "en", bundle("messages_en.properties")));

            assertThat(missing).containsExactlyInAnyOrder(
                    "problem.donors/planted-stale.detail (en)",
                    "problem.donors/planted-joined.detail.word (en)",
                    "problem.planted.handler-only.title (en)");
            assertThat(bundle("messages_cs.properties").getProperty("problem.shared/planted-refusal.detail")).isEqualTo("Odmítnuto na dvou řádcích");
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
        @DisplayName("when the orphans are listed, then a text no code or handler names and a key with a space are orphans, and texts of codes, of keys read and under a kept prefix are not")
        void should_list_orphan_texts_when_listed_given_texts_nothing_reads() throws IOException {
            List<String> orphans = catalogue.orphanTexts(List.of(bundle("messages_cs.properties"), bundle("messages_en.properties")),
                    Set.of("problem.donations/kept-vector.detail."));

            assertThat(orphans).containsExactly("problem.donors/planted-gone.title", "problem.donors/with space.title");
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
