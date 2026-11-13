package cz.novanadeje.app.architecture;

import com.tngtech.archunit.base.DescribedPredicate;
import com.tngtech.archunit.core.domain.JavaAccess;
import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;
import cz.novanadeje.app.AppApplication;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

import java.io.IOException;
import java.net.Inet4Address;
import java.net.Inet6Address;
import java.net.InetAddress;
import java.net.URI;
import java.net.URISyntaxException;
import java.net.URLDecoder;
import java.net.URLEncoder;
import java.nio.channels.FileChannel;
import java.nio.file.Path;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import static com.tngtech.archunit.base.DescribedPredicate.not;
import static com.tngtech.archunit.core.domain.JavaClass.Predicates.assignableTo;
import static com.tngtech.archunit.core.domain.JavaClass.Predicates.belongToAnyOf;
import static com.tngtech.archunit.core.domain.JavaClass.Predicates.resideInAPackage;
import static com.tngtech.archunit.core.domain.JavaClass.Predicates.resideInAnyPackage;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static cz.novanadeje.app.architecture.MethodAccesses.callsOrReferences;
import static org.assertj.core.api.Assertions.assertThat;

@AnalyzeClasses(
        packagesOf = AppApplication.class,
        importOptions = ImportOption.DoNotIncludeTests.class
)
class AdapterLibraryRulesTest {

    private static final String[] OUTBOUND_ADAPTERS = {
            "cz.novanadeje.app.donors.infrastructure.ares..", "cz.novanadeje.app.donors.infrastructure.oauth..",
            "cz.novanadeje.app.donations.infrastructure.banklogo..", "cz.novanadeje.app.donations.infrastructure.cnb..",
            "cz.novanadeje.app.operations.infrastructure.push.."};
    private static final String[] MAIL_ADAPTERS = {
            "cz.novanadeje.app.shared.infrastructure.mail..", "cz.novanadeje.app.contact.infrastructure.mail..",
            "cz.novanadeje.app.donors.infrastructure.mail..", "cz.novanadeje.app.donations.infrastructure.report..",
            "cz.novanadeje.app.operations.infrastructure.backup..", "cz.novanadeje.app.operations.infrastructure.settings..",
            "cz.novanadeje.app.donations.infrastructure.signing.."};
    private static final String[] PERSISTENCE_ADAPTERS = {
            "..infrastructure.persistence..", "cz.novanadeje.app.shared.infrastructure.audit..", "cz.novanadeje.app.shared.infrastructure.lock.."};
    private static final String[] JDBC_USERS = {
            "..infrastructure.persistence..", "cz.novanadeje.app.operations.infrastructure.settings..", "cz.novanadeje.app.operations.infrastructure.diagnostics.."};
    private static final Set<String> NAME_LOOKUPS = Set.of("getByName", "getAllByName", "getLocalHost", "isReachable", "getHostName", "getCanonicalHostName");
    private static final String OUTBOUND = "security.md, Outbound requests: each outbound call is one of the reviewed adapters, with its timeout and address checks";

    private static final DescribedPredicate<JavaClass> NETWORK_VALUES = belongToAnyOf(URI.class, URISyntaxException.class, URLEncoder.class, URLDecoder.class,
            InetAddress.class, Inet4Address.class, Inet6Address.class).or(assignableTo(IOException.class));

    private static final DescribedPredicate<JavaClass> NETWORK_CONNECTIONS = resideInAPackage("java.net").and(not(NETWORK_VALUES))
            .or(resideInAnyPackage("java.net.http..", "javax.net..", "javax.naming..", "org.springframework.web.client..", "org.springframework.http.client..",
                    "org.springframework.web.service..", "org.springframework.web.reactive.."))
            .or(resideInAPackage("java.nio.channels..").and(not(belongToAnyOf(FileChannel.class))))
            .as("a network connection, socket, channel or HTTP client");

    private static final DescribedPredicate<JavaAccess<?>> NAME_LOOKUP = callsOrReferences("a name lookup of InetAddress", InetAddress.class, NAME_LOOKUPS::contains);

    private static final DescribedPredicate<JavaAccess<?>> STARTING_A_PROCESS = callsOrReferences("", ProcessBuilder.class, "start"::equals)
            .or(callsOrReferences("", Runtime.class, "exec"::equals))
            .as("a start of an operating system process");

    private static final DescribedPredicate<JavaClass> PERSISTENCE_LIBRARIES = resideInAnyPackage("jakarta.persistence..", "org.springframework.data..",
            "org.springframework.orm..", "org.springframework.jdbc..", "org.hibernate..").and(not(resideInAPackage("org.hibernate.validator..")))
            .as("JPA, Spring Data, Spring ORM, Spring JDBC or Hibernate");

    private static JavaClasses planted;

    @ArchTest
    static final ArchRule no_class_draws_a_pdf_or_a_qr_code_since_the_browser_draws_both = noClasses()
            .should().dependOnClassesThat()
            .resideInAnyPackage("io.github.openhtmltopdf..", "com.openhtmltopdf..", "org.apache.pdfbox..", "com.google.zxing..");

    @ArchTest
    static final ArchRule fio_client_library_is_used_only_by_the_donations_fio_adapter = noClasses()
            .that().resideOutsideOfPackage("cz.novanadeje.app.donations.infrastructure.fio..")
            .should().dependOnClassesThat().resideInAPackage("io.github.bzumik1.fio..");

    @ArchTest
    static final ArchRule template_library_is_used_only_by_the_shared_mail_adapter = noClasses()
            .that().resideOutsideOfPackage("cz.novanadeje.app.shared.infrastructure.mail..")
            .should().dependOnClassesThat().resideInAPackage("org.thymeleaf..");

    @ArchTest
    static final ArchRule image_libraries_are_used_only_by_the_content_media_receipt_signature_and_bank_logo_adapters = noClasses()
            .that().resideOutsideOfPackages("cz.novanadeje.app.content.infrastructure.media..", "cz.novanadeje.app.donations.infrastructure.signature..",
                    "cz.novanadeje.app.donations.infrastructure.banklogo..")
            .should().dependOnClassesThat()
            .resideInAnyPackage("com.luciad.imageio.webp..", "javax.imageio..", "java.awt..");

    @ArchTest
    static final ArchRule xml_parsers_are_used_only_by_the_receipt_signature_adapter = noClasses()
            .that().resideOutsideOfPackage("cz.novanadeje.app.donations.infrastructure.signature..")
            .should().dependOnClassesThat().resideInAnyPackage("javax.xml..", "org.xml.sax..", "org.w3c.dom..");

    @ArchTest
    static final ArchRule logging_system_pool_and_jvm_management_are_used_only_by_the_operations_adapters = noClasses()
            .that().resideOutsideOfPackage("cz.novanadeje.app.operations.infrastructure..")
            .should().dependOnClassesThat()
            .resideInAnyPackage("org.springframework.boot.logging..", "com.zaxxer.hikari..", "java.lang.management..");

    @ArchTest
    static final ArchRule webauthn_library_is_used_only_by_the_donors_webauthn_adapter = noClasses()
            .that().resideOutsideOfPackage("cz.novanadeje.app.donors.infrastructure.webauthn..")
            .should().dependOnClassesThat().resideInAPackage("com.webauthn4j..");

    @ArchTest
    static final ArchRule cache_library_is_used_only_by_infrastructure_adapters = noClasses()
            .that().resideOutsideOfPackage("..infrastructure..")
            .should().dependOnClassesThat().resideInAPackage("com.github.benmanes.caffeine..");

    @ArchTest
    static final ArchRule outbound_requests_are_made_only_by_the_reviewed_adapters = noClasses()
            .that().resideOutsideOfPackages(OUTBOUND_ADAPTERS)
            .should().dependOnClassesThat(NETWORK_CONNECTIONS)
            .orShould().accessTargetWhere(NAME_LOOKUP)
            .because(OUTBOUND);

    @ArchTest
    static final ArchRule no_class_starts_a_process = noClasses()
            .should().accessTargetWhere(STARTING_A_PROCESS)
            .because(OUTBOUND);

    @ArchTest
    static final ArchRule schema_migration_library_is_used_only_by_the_migration_lock = noClasses()
            .that().resideOutsideOfPackage("cz.novanadeje.app.shared.infrastructure.lock..")
            .should().dependOnClassesThat().resideInAPackage("liquibase..");

    @ArchTest
    static final ArchRule token_library_is_used_only_by_the_security_adapter = noClasses()
            .that().resideOutsideOfPackage("cz.novanadeje.app.shared.infrastructure.security..")
            .should().dependOnClassesThat().resideInAPackage("com.nimbusds..");

    @ArchTest
    static final ArchRule persistence_libraries_are_used_only_by_persistence_adapters = noClasses()
            .that().resideOutsideOfPackages(PERSISTENCE_ADAPTERS)
            .should().dependOnClassesThat(PERSISTENCE_LIBRARIES);

    @ArchTest
    static final ArchRule plain_jdbc_is_used_only_by_persistence_and_the_settings_and_diagnostics_adapters = noClasses()
            .that().resideOutsideOfPackages(JDBC_USERS)
            .should().dependOnClassesThat().resideInAnyPackage("java.sql..", "javax.sql..");

    @ArchTest
    static final ArchRule mail_libraries_are_used_only_by_the_mail_adapters = noClasses()
            .that().resideOutsideOfPackages(MAIL_ADAPTERS)
            .should().dependOnClassesThat().resideInAnyPackage("jakarta.mail..", "org.springframework.mail..");

    @ArchTest
    static final ArchRule json_and_security_libraries_stay_out_of_the_domain_and_the_use_cases = noClasses()
            .that().resideInAnyPackage("..domain..", "..application..")
            .should().dependOnClassesThat().resideInAnyPackage("tools.jackson..", "com.fasterxml.jackson..", "org.springframework.security..");

    @BeforeAll
    static void plantLibraryUses(@TempDir Path folder) throws IOException {
        planted = PlantedClasses.compiled(folder, plantedUses().collect(Collectors.toMap(PlantedUse::className, PlantedUse::source)));
    }

    @ParameterizedTest(name = "{0} reports {1}")
    @MethodSource("plantedUses")
    @DisplayName("Given a planted class that uses a library outside its adapter, when the library's rule checks it, then exactly that use is reported")
    void should_report_the_planted_use_when_checked_given_a_class_outside_the_adapter(String rule, String className) throws ReflectiveOperationException {
        ArchRule checked = (ArchRule) AdapterLibraryRulesTest.class.getDeclaredField(rule).get(null);

        JavaClasses plantedClass = planted.that(DescribedPredicate.describe("the planted class", type -> type.getName().equals(className)));

        assertThat(checked.evaluate(plantedClass).getFailureReport().getDetails())
                .isNotEmpty().allSatisfy(detail -> assertThat(detail).contains(className));
    }

    static Stream<PlantedUse> plantedUses() {
        return Stream.of(
                planted("schema_migration_library_is_used_only_by_the_migration_lock", "donations.application.PlantedMigration", "liquibase.Liquibase"),
                planted("token_library_is_used_only_by_the_security_adapter", "donors.infrastructure.mail.PlantedToken", "com.nimbusds.jwt.JWTClaimsSet"),
                planted("persistence_libraries_are_used_only_by_persistence_adapters", "donations.application.PlantedEntityManager", "jakarta.persistence.EntityManager"),
                planted("persistence_libraries_are_used_only_by_persistence_adapters", "donations.infrastructure.report.PlantedRepository",
                        "org.springframework.data.repository.Repository<Object, Object>"),
                planted("persistence_libraries_are_used_only_by_persistence_adapters", "donors.infrastructure.mail.PlantedHibernate", "org.hibernate.Session"),
                planted("persistence_libraries_are_used_only_by_persistence_adapters", "donations.infrastructure.report.PlantedJdbcClient",
                        "org.springframework.jdbc.core.simple.JdbcClient"),
                planted("plain_jdbc_is_used_only_by_persistence_and_the_settings_and_diagnostics_adapters", "content.infrastructure.media.PlantedConnection",
                        "java.sql.Connection"),
                planted("mail_libraries_are_used_only_by_the_mail_adapters", "donors.infrastructure.oauth.PlantedSpringMail", "org.springframework.mail.MailSender"),
                planted("mail_libraries_are_used_only_by_the_mail_adapters", "donors.infrastructure.oauth.PlantedJakartaMail", "jakarta.mail.Transport"),
                planted("json_and_security_libraries_stay_out_of_the_domain_and_the_use_cases", "donations.domain.PlantedJson", "tools.jackson.databind.json.JsonMapper"),
                planted("json_and_security_libraries_stay_out_of_the_domain_and_the_use_cases", "donations.domain.PlantedOldJson",
                        "com.fasterxml.jackson.annotation.JsonProperty"),
                planted("json_and_security_libraries_stay_out_of_the_domain_and_the_use_cases", "donors.application.PlantedAuthentication",
                        "org.springframework.security.core.Authentication"),
                planted("template_library_is_used_only_by_the_shared_mail_adapter", "donors.infrastructure.mail.PlantedTemplates", "org.thymeleaf.TemplateEngine"),
                planted("image_libraries_are_used_only_by_the_content_media_receipt_signature_and_bank_logo_adapters", "content.infrastructure.persistence.PlantedDrawing",
                        "java.awt.Graphics2D"),
                planted("outbound_requests_are_made_only_by_the_reviewed_adapters", "donations.infrastructure.fio.PlantedHttpClient", "java.net.http.HttpClient"),
                planted("outbound_requests_are_made_only_by_the_reviewed_adapters", "donors.infrastructure.mail.PlantedUrl", "java.net.URL"),
                planted("outbound_requests_are_made_only_by_the_reviewed_adapters", "donors.infrastructure.mail.PlantedConnection", "java.net.HttpURLConnection"),
                planted("outbound_requests_are_made_only_by_the_reviewed_adapters", "donors.infrastructure.mail.PlantedSocket", "java.net.Socket"),
                planted("outbound_requests_are_made_only_by_the_reviewed_adapters", "donors.infrastructure.mail.PlantedDatagram", "java.net.DatagramSocket"),
                planted("outbound_requests_are_made_only_by_the_reviewed_adapters", "donors.infrastructure.mail.PlantedSslSockets", "javax.net.ssl.SSLSocketFactory"),
                planted("outbound_requests_are_made_only_by_the_reviewed_adapters", "donors.infrastructure.mail.PlantedChannel", "java.nio.channels.SocketChannel"),
                planted("outbound_requests_are_made_only_by_the_reviewed_adapters", "donors.infrastructure.mail.PlantedNaming", "javax.naming.InitialContext"),
                planted("outbound_requests_are_made_only_by_the_reviewed_adapters", "donors.infrastructure.mail.PlantedRestClient",
                        "org.springframework.web.client.RestClient"),
                planted("outbound_requests_are_made_only_by_the_reviewed_adapters", "donors.infrastructure.mail.PlantedRequestFactory",
                        "org.springframework.http.client.ClientHttpRequestFactory"),
                plantedSource("outbound_requests_are_made_only_by_the_reviewed_adapters", "donors.infrastructure.mail.PlantedLookup",
                        "java.util.function.Function<String, Object> lookup = name -> { try { return java.net.InetAddress.getAllByName(name); }"
                                + " catch (java.net.UnknownHostException e) { return null; } };"),
                plantedSource("no_class_starts_a_process", "donors.infrastructure.mail.PlantedProcess",
                        "Object started() throws java.io.IOException { return new ProcessBuilder(\"curl\").start(); }"));
    }

    private static PlantedUse planted(String rule, String relativeName, String library) {
        return plantedSource(rule, relativeName, library + " used;");
    }

    private static PlantedUse plantedSource(String rule, String relativeName, String body) {
        String className = "cz.novanadeje.app." + relativeName;
        String packageName = className.substring(0, className.lastIndexOf('.'));
        String simpleName = className.substring(className.lastIndexOf('.') + 1);
        return new PlantedUse(rule, className, "package " + packageName + ";\npublic class " + simpleName + " { " + body + " }\n");
    }

    record PlantedUse(String rule, String className, String source) implements Arguments {

        @Override
        public Object[] get() {
            return new Object[]{rule, className};
        }
    }
}
