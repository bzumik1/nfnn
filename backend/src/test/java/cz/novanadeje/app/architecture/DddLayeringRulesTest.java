package cz.novanadeje.app.architecture;

import com.tngtech.archunit.base.DescribedPredicate;
import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;
import cz.novanadeje.app.AppApplication;
import jakarta.persistence.Embeddable;
import jakarta.persistence.Entity;
import jakarta.persistence.MappedSuperclass;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.context.MessageSource;
import org.springframework.data.repository.Repository;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.net.URI;
import java.net.URISyntaxException;
import java.net.URLEncoder;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static com.tngtech.archunit.base.DescribedPredicate.alwaysTrue;
import static com.tngtech.archunit.base.DescribedPredicate.not;
import static com.tngtech.archunit.core.domain.JavaClass.Predicates.belongToAnyOf;
import static com.tngtech.archunit.core.domain.JavaClass.Predicates.resideInAPackage;
import static com.tngtech.archunit.core.domain.JavaClass.Predicates.resideInAnyPackage;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.classes;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static com.tngtech.archunit.library.Architectures.layeredArchitecture;
import static com.tngtech.archunit.library.dependencies.SlicesRuleDefinition.slices;
import static org.assertj.core.api.Assertions.assertThat;

@AnalyzeClasses(
        packagesOf = AppApplication.class,
        importOptions = ImportOption.DoNotIncludeTests.class
)
class DddLayeringRulesTest {

    private static final String LAYERS = "backend.md, Contexts and layers";
    private static final String SHARED_KERNEL = "cz.novanadeje.app.shared..";
    private static final String CONTEXT_LAYERS = "cz.novanadeje.app.*.(domain|application|infrastructure|interfaces)..";
    private static final String DOMAIN = "cz.novanadeje.app.*.domain..";
    private static final DescribedPredicate<JavaClass> WHAT_THE_DOMAIN_MAY_USE = resideInAnyPackage(
            "java.lang", "java.util", "java.util.function", "java.util.regex", "java.util.stream", "java.util.random", "java.time..", "java.math",
            "java.text", "java.security", "java.nio", "java.nio.charset", "javax.crypto..", DOMAIN)
            .or(belongToAnyOf(URI.class, URISyntaxException.class, URLEncoder.class,
                    InputStream.class, ByteArrayOutputStream.class, IOException.class, UncheckedIOException.class))
            .as("the JDK's core or a domain package");
    private static final DescribedPredicate<JavaClass> PORTS_THAT_PERSISTENCE_IMPLEMENTS = DescribedPredicate.describe(
            "a port that persistence implements",
            type -> type.isInterface() && type.getAllSubclasses().stream().anyMatch(resideInAPackage("..infrastructure.persistence..")::test));
    private static final Pattern CONTEXT_OF_PACKAGE = Pattern.compile("^cz\\.novanadeje\\.app\\.([^.]+)\\.(domain|application|infrastructure)(\\..*)?$");
    private static final DescribedPredicate<JavaClass> DRIVEN_ADAPTERS = DescribedPredicate.describe(
            "implement a port of their own context's application or domain and run no scheduled work",
            type -> layerOf(type).filter("infrastructure"::equals).isPresent()
                    && type.getMethods().stream().noneMatch(method -> method.isAnnotatedWith(Scheduled.class))
                    && type.getAllRawInterfaces().stream().anyMatch(port -> isPortOfTheContextOf(port, type)));
    private static final DescribedPredicate<JavaClass> APPLICATION_SERVICES = DescribedPredicate.describe(
            "are application services (Spring beans of an application package)",
            type -> !type.isInterface() && layerOf(type).filter("application"::equals).isPresent() && type.isMetaAnnotatedWith(Component.class));

    @ArchTest
    static final ArchRule layers_must_respect_ddd_dependency_rule = layeredArchitecture()
            .consideringAllDependencies()
            .layer("Domain").definedBy(DOMAIN)
            .layer("Application").definedBy("cz.novanadeje.app.*.application..")
            .layer("Infrastructure").definedBy("cz.novanadeje.app.*.infrastructure..")
            .layer("Interfaces").definedBy("cz.novanadeje.app.*.interfaces..")
            .whereLayer("Interfaces").mayNotBeAccessedByAnyLayer()
            .whereLayer("Infrastructure").mayOnlyBeAccessedByLayers("Interfaces")
            .whereLayer("Application").mayOnlyBeAccessedByLayers("Interfaces", "Infrastructure")
            .whereLayer("Domain").mayOnlyBeAccessedByLayers("Application", "Infrastructure", "Interfaces");

    @ArchTest
    static final ArchRule every_class_lives_in_a_layer_of_a_context = classes()
            .that().doNotBelongToAnyOf(AppApplication.class)
            .should().resideInAPackage(CONTEXT_LAYERS)
            .because(LAYERS);

    @ArchTest
    static final ArchRule bounded_contexts_must_not_depend_on_each_other = slices()
            .matching("cz.novanadeje.app.(*)..")
            .namingSlices("Bounded context: $1")
            .should().notDependOnEachOther()
            .ignoreDependency(alwaysTrue(), resideInAPackage(SHARED_KERNEL));

    @ArchTest
    static final ArchRule shared_kernel_must_not_depend_on_any_context = noClasses()
            .that().resideInAPackage(SHARED_KERNEL)
            .should().dependOnClassesThat(resideInAPackage("cz.novanadeje.app..").and(not(resideInAPackage(SHARED_KERNEL))));

    @ArchTest
    static final ArchRule domain_must_not_depend_on_frameworks = classes()
            .that().resideInAPackage(DOMAIN)
            .should().onlyDependOnClassesThat(WHAT_THE_DOMAIN_MAY_USE)
            .because(LAYERS);

    @ArchTest
    static final ArchRule application_must_not_depend_on_web = noClasses()
            .that().resideInAPackage("..application..")
            .should().dependOnClassesThat()
            .resideInAnyPackage("org.springframework.web..", "org.springframework.http..", "jakarta.servlet..");

    @ArchTest
    static final ArchRule message_bundles_must_be_read_only_by_adapters = noClasses()
            .that().resideInAnyPackage("..domain..", "..application..")
            .should().dependOnClassesThat()
            .areAssignableTo(MessageSource.class);

    @ArchTest
    static final ArchRule rest_controllers_must_not_expose_infrastructure_types = noClasses()
            .that().resideInAPackage("..interfaces..")
            .should().dependOnClassesThat(resideInAPackage("..infrastructure.persistence..")
                    .or(resideInAPackage("..infrastructure..").and(not(resideInAPackage("cz.novanadeje.app.shared.infrastructure..")))))
            .because(LAYERS);

    @ArchTest
    static final ArchRule rest_controllers_must_not_use_persistence_ports = noClasses()
            .that().resideInAPackage("..interfaces..")
            .should().dependOnClassesThat(PORTS_THAT_PERSISTENCE_IMPLEMENTS)
            .because(LAYERS);

    @ArchTest
    static final ArchRule driven_adapters_must_not_drive_a_use_case = noClasses()
            .that(DRIVEN_ADAPTERS)
            .should().dependOnClassesThat(APPLICATION_SERVICES)
            .because("backend.md, Application: a driven adapter implements its port on the domain and its technology; a use case is driven "
                    + "only from the driving side (a scheduler, a listener, a controller, or another context through a shared port)");

    @ArchTest
    static final ArchRule jpa_entities_and_spring_data_repositories_are_package_private_adapter_details = classes()
            .that().areAnnotatedWith(Entity.class)
            .or().areAnnotatedWith(Embeddable.class)
            .or().areAnnotatedWith(MappedSuperclass.class)
            .or().areAssignableTo(Repository.class)
            .should().notBePublic()
            .andShould().resideInAnyPackage("..infrastructure.persistence..", "cz.novanadeje.app.shared.infrastructure.audit..");

    @Nested
    @DisplayName("Given planted classes that break each rule")
    class GivenPlantedViolations {

        private static JavaClasses planted;

        @BeforeAll
        static void plantViolations(@TempDir Path folder) throws IOException {
            planted = PlantedClasses.compiled(folder, Map.ofEntries(
                    planted("planteda.domain.Gift", "public class Gift {}"),
                    planted("planteda.domain.Gifts", "public interface Gifts {}"),
                    planted("planteda.domain.Upward", "public class Upward { cz.novanadeje.app.planteda.application.GiftService service; }"),
                    planted("planteda.domain.LoggingGift", "public class LoggingGift { org.slf4j.Logger log; }"),
                    planted("planteda.domain.TimedGift", "public class TimedGift { java.sql.Timestamp at; }"),
                    planted("planteda.domain.ConcurrentGift", "public class ConcurrentGift { java.util.concurrent.ConcurrentHashMap<String, String> map; }"),
                    planted("planteda.domain.ReflectiveGift", "public class ReflectiveGift { java.lang.reflect.Method method; }"),
                    planted("planteda.domain.NetworkGift", "public class NetworkGift { java.net.Socket socket; }"),
                    planted("planteda.application.GiftService", "public class GiftService {}"),
                    planted("planteda.application.GiftPairing", "public interface GiftPairing { void pair(); }"),
                    planted("planteda.application.PairingService", "@org.springframework.stereotype.Service public class PairingService { public void pair() {} }"),
                    planted("planteda.application.GiftComponent", "@org.springframework.stereotype.Component public class GiftComponent { public void read() {} }"),
                    planted("planteda.infrastructure.pairing.ServicePairing", """
                            public class ServicePairing implements cz.novanadeje.app.planteda.application.GiftPairing {
                                cz.novanadeje.app.planteda.application.PairingService service;
                                public void pair() { service.pair(); }
                            }
                            """),
                    planted("planteda.infrastructure.persistence.ComponentGifts", """
                            public class ComponentGifts implements cz.novanadeje.app.planteda.domain.Gifts {
                                cz.novanadeje.app.planteda.application.GiftComponent component;
                            }
                            """),
                    planted("planteda.infrastructure.events.PairingListener", """
                            public class PairingListener {
                                cz.novanadeje.app.planteda.application.PairingService service;
                                void onRegistered() { service.pair(); }
                            }
                            """),
                    planted("planteda.infrastructure.schedule.PairingScheduler", """
                            public class PairingScheduler implements cz.novanadeje.app.planteda.application.GiftPairing {
                                cz.novanadeje.app.planteda.application.PairingService service;
                                @org.springframework.scheduling.annotation.Scheduled(fixedDelay = 1000) void tick() { service.pair(); }
                                public void pair() { }
                            }
                            """),
                    planted("planteda.infrastructure.account.KernelPortAdapter", """
                            public class KernelPortAdapter implements cz.novanadeje.app.shared.application.account.KernelPort {
                                cz.novanadeje.app.planteda.application.PairingService service;
                                public void pair() { service.pair(); }
                            }
                            """),
                    planted("shared.application.account.KernelPort", "public interface KernelPort { void pair(); }"),
                    planted("planteda.application.WebGiftService", "public class WebGiftService { org.springframework.http.HttpStatus status; }"),
                    planted("planteda.application.TextGiftService", "public class TextGiftService { org.springframework.context.MessageSource texts; }"),
                    planted("planteda.infrastructure.mail.GiftMailer", "public class GiftMailer {}"),
                    planted("planteda.infrastructure.mail.GiftRow", "@jakarta.persistence.Entity class GiftRow {}"),
                    planted("planteda.infrastructure.persistence.JpaGifts", "public class JpaGifts implements cz.novanadeje.app.planteda.domain.Gifts {}"),
                    planted("planteda.interfaces.rest.GiftController", """
                            public class GiftController {
                                cz.novanadeje.app.planteda.infrastructure.mail.GiftMailer mailer;
                                cz.novanadeje.app.planteda.domain.Gifts gifts;
                            }
                            """),
                    planted("planteda.interfaces.rest.KernelController", """
                            public class KernelController {
                                cz.novanadeje.app.shared.infrastructure.persistence.KernelRow row;
                                cz.novanadeje.app.shared.infrastructure.security.Guard guard;
                            }
                            """),
                    planted("planteda.config.LooseSettings", "public class LooseSettings {}"),
                    planted("plantedb.domain.Reader", "public class Reader { cz.novanadeje.app.planteda.domain.Gift gift; }"),
                    planted("shared.domain.PlantedKernel", "public class PlantedKernel { cz.novanadeje.app.planteda.domain.Gift gift; }"),
                    planted("shared.infrastructure.persistence.KernelRow", "public class KernelRow {}"),
                    planted("shared.infrastructure.security.Guard", "public class Guard {}")));
        }

        @Test
        @DisplayName("when the layer rule checks a domain class on an application service, then it is reported")
        void should_report_domain_on_application_when_checked_given_a_planted_domain_class() {
            assertThat(reportOf(layers_must_respect_ddd_dependency_rule)).anySatisfy(detail -> assertThat(detail).contains("planteda.domain.Upward"));
        }

        @Test
        @DisplayName("when the layer rule checks a class outside every layer, then it is reported")
        void should_report_class_outside_the_layers_when_checked_given_a_config_package() {
            assertThat(reportOf(every_class_lives_in_a_layer_of_a_context)).anySatisfy(detail -> assertThat(detail).contains("planteda.config.LooseSettings"));
        }

        @Test
        @DisplayName("when the context rule checks contexts that are not listed anywhere, then each dependency between them is reported, the kernel's too")
        void should_report_dependency_between_contexts_when_checked_given_contexts_not_listed() {
            assertThat(reportOf(bounded_contexts_must_not_depend_on_each_other))
                    .anySatisfy(detail -> assertThat(detail).contains("plantedb.domain.Reader"))
                    .anySatisfy(detail -> assertThat(detail).contains("shared.domain.PlantedKernel"));
        }

        @Test
        @DisplayName("when the shared kernel rule checks a kernel class that reads an unlisted context, then it is reported")
        void should_report_kernel_reading_a_context_when_checked_given_a_context_not_listed() {
            assertThat(reportOf(shared_kernel_must_not_depend_on_any_context)).anySatisfy(detail -> assertThat(detail).contains("shared.domain.PlantedKernel"));
        }

        @Test
        @DisplayName("when the domain rule checks domain classes on a logger, JDBC, concurrency, reflection and a socket, then each is reported")
        void should_report_every_library_outside_the_jdk_core_when_checked_given_planted_domain_classes() {
            assertThat(reportOf(domain_must_not_depend_on_frameworks))
                    .anySatisfy(detail -> assertThat(detail).contains("LoggingGift").contains("org.slf4j.Logger"))
                    .anySatisfy(detail -> assertThat(detail).contains("TimedGift").contains("java.sql.Timestamp"))
                    .anySatisfy(detail -> assertThat(detail).contains("ConcurrentGift").contains("java.util.concurrent.ConcurrentHashMap"))
                    .anySatisfy(detail -> assertThat(detail).contains("ReflectiveGift").contains("java.lang.reflect.Method"))
                    .anySatisfy(detail -> assertThat(detail).contains("NetworkGift").contains("java.net.Socket"))
                    .noneSatisfy(detail -> assertThat(detail).contains("planteda.domain.Gift>"));
        }

        @Test
        @DisplayName("when the web rule checks an application service on an HTTP status, then it is reported")
        void should_report_application_on_http_when_checked_given_a_planted_service() {
            assertThat(reportOf(application_must_not_depend_on_web)).anySatisfy(detail -> assertThat(detail).contains("WebGiftService"));
        }

        @Test
        @DisplayName("when the message bundle rule checks an application service on a MessageSource, then it is reported")
        void should_report_application_on_message_source_when_checked_given_a_planted_service() {
            assertThat(reportOf(message_bundles_must_be_read_only_by_adapters)).anySatisfy(detail -> assertThat(detail).contains("TextGiftService"));
        }

        @Test
        @DisplayName("when the controller rule checks controllers on a context adapter and on shared infrastructure, then the adapter and shared persistence are reported and shared security is not")
        void should_report_context_adapter_and_shared_persistence_when_checked_given_planted_controllers() {
            assertThat(reportOf(rest_controllers_must_not_expose_infrastructure_types))
                    .anySatisfy(detail -> assertThat(detail).contains("GiftController").contains("GiftMailer"))
                    .anySatisfy(detail -> assertThat(detail).contains("KernelController").contains("KernelRow"))
                    .noneSatisfy(detail -> assertThat(detail).contains("Guard"));
        }

        @Test
        @DisplayName("when the port rule checks a controller on a port that persistence implements, then it is reported whatever the port is called")
        void should_report_controller_on_a_persistence_port_when_checked_given_a_port_without_the_repository_suffix() {
            assertThat(reportOf(rest_controllers_must_not_use_persistence_ports))
                    .anySatisfy(detail -> assertThat(detail).contains("GiftController").contains("planteda.domain.Gifts"));
        }

        @Test
        @DisplayName("when the JPA rule checks an entity outside the persistence package, then it is reported")
        void should_report_entity_outside_persistence_when_checked_given_an_entity_in_a_mail_adapter() {
            assertThat(reportOf(jpa_entities_and_spring_data_repositories_are_package_private_adapter_details))
                    .anySatisfy(detail -> assertThat(detail).contains("infrastructure.mail.GiftRow"));
        }

        @Test
        @DisplayName("when the driven adapter rule checks adapters of the context's own ports on an application service, then they are reported and the driving side is not")
        void should_report_adapters_of_own_ports_on_a_service_when_checked_given_planted_driven_and_driving_adapters() {
            assertThat(reportOf(driven_adapters_must_not_drive_a_use_case))
                    .anySatisfy(detail -> assertThat(detail).contains("ServicePairing").contains("PairingService"))
                    .anySatisfy(detail -> assertThat(detail).contains("ComponentGifts").contains("GiftComponent"))
                    .noneSatisfy(detail -> assertThat(detail).contains("PairingListener"))
                    .noneSatisfy(detail -> assertThat(detail).contains("PairingScheduler"))
                    .noneSatisfy(detail -> assertThat(detail).contains("KernelPortAdapter"));
        }

        private static Map.Entry<String, String> planted(String relativeName, String body) {
            String className = "cz.novanadeje.app." + relativeName;
            return Map.entry(className, "package " + className.substring(0, className.lastIndexOf('.')) + ";\n" + body);
        }

        private static List<String> reportOf(ArchRule rule) {
            return rule.evaluate(planted).getFailureReport().getDetails();
        }
    }

    private static Optional<String> layerOf(JavaClass type) {
        Matcher matcher = CONTEXT_OF_PACKAGE.matcher(type.getPackageName());
        return matcher.matches() ? Optional.of(matcher.group(2)) : Optional.empty();
    }

    private static boolean isPortOfTheContextOf(JavaClass port, JavaClass adapter) {
        Matcher portPackage = CONTEXT_OF_PACKAGE.matcher(port.getPackageName());
        Matcher adapterPackage = CONTEXT_OF_PACKAGE.matcher(adapter.getPackageName());
        return portPackage.matches() && adapterPackage.matches() && !"infrastructure".equals(portPackage.group(2))
                && portPackage.group(1).equals(adapterPackage.group(1));
    }
}
