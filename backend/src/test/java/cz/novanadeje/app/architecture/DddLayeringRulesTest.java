package cz.novanadeje.app.architecture;

import com.tngtech.archunit.base.DescribedPredicate;
import com.tngtech.archunit.core.domain.Dependency;
import com.tngtech.archunit.core.domain.JavaAccess;
import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.domain.JavaModifier;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchCondition;
import com.tngtech.archunit.lang.ArchRule;
import com.tngtech.archunit.lang.conditions.ArchConditions;
import com.tngtech.archunit.lang.ConditionEvents;
import com.tngtech.archunit.lang.SimpleConditionEvent;
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
import org.springframework.context.annotation.Bean;
import org.springframework.data.repository.Repository;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.net.URI;
import java.net.URISyntaxException;
import java.net.URLEncoder;
import java.nio.file.Path;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.ResourceBundle;
import java.util.ServiceLoader;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

import static com.tngtech.archunit.base.DescribedPredicate.alwaysTrue;
import static com.tngtech.archunit.base.DescribedPredicate.not;
import static com.tngtech.archunit.core.domain.JavaClass.Predicates.assignableTo;
import static com.tngtech.archunit.core.domain.JavaClass.Predicates.belongToAnyOf;
import static com.tngtech.archunit.core.domain.JavaClass.Predicates.equivalentTo;
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
    private static final DescribedPredicate<JavaClass> VALUE_LEVEL_JAVA_LANG = belongToAnyOf(
            Object.class, String.class, StringBuilder.class, CharSequence.class, Character.class, Boolean.class, Byte.class, Short.class,
            Integer.class, Long.class, Float.class, Double.class, Number.class, Void.class, Math.class, StrictMath.class, Enum.class, Record.class,
            Comparable.class, Iterable.class, Override.class, FunctionalInterface.class, SuppressWarnings.class, Deprecated.class, SafeVarargs.class)
            .or(resideInAPackage("java.lang").and(assignableTo(Throwable.class)))
            .or(equivalentTo(System.class));
    private static final DescribedPredicate<JavaClass> THE_DOMAIN_MAY_USE_AS_A_TYPE = resideInAnyPackage(
            "java.util", "java.util.function", "java.util.regex", "java.util.stream", "java.util.random", "java.time..", "java.math",
            "java.text", "java.security", "java.nio", "java.nio.charset", "javax.crypto..", DOMAIN)
            .or(VALUE_LEVEL_JAVA_LANG)
            .or(belongToAnyOf(URI.class, URISyntaxException.class, URLEncoder.class, ByteArrayOutputStream.class));
    private static final DescribedPredicate<JavaClass> WHAT_THE_DOMAIN_MAY_USE = DescribedPredicate.describe(
            "the JDK's core (of java.lang its values, boxes, maths, exceptions and System for arraycopy only) or a domain package, or arrays of them",
            DddLayeringRulesTest::isWhatTheDomainMayUse);
    private static final DescribedPredicate<JavaAccess<?>> A_SYSTEM_MEMBER_BUT_ARRAYCOPY = DescribedPredicate.describe(
            "a member of System other than arraycopy (the environment, properties, clocks, console streams, exit, native libraries)",
            access -> access.getTargetOwner().isEquivalentTo(System.class) && !"arraycopy".equals(access.getName()));
    private static final Pattern CLASSPATH_READS = Pattern.compile("(get(System)?Resources?(AsStream)?|resources|systemResources)");
    private static final Map<String, Pattern> RESOURCE_READS_BY_OWNER = Map.of(
            Class.class.getName(), CLASSPATH_READS,
            ClassLoader.class.getName(), CLASSPATH_READS,
            Module.class.getName(), CLASSPATH_READS,
            ResourceBundle.class.getName(), Pattern.compile("getBundle"),
            ServiceLoader.class.getName(), Pattern.compile("load(Installed)?"));
    private static final DescribedPredicate<JavaAccess<?>> READS_A_CLASSPATH_RESOURCE = DescribedPredicate.describe(
            "read a classpath resource, a resource bundle or a service loader",
            access -> RESOURCE_READS_BY_OWNER.entrySet().stream()
                    .anyMatch(owner -> access.getTargetOwner().isAssignableTo(owner.getKey()) && owner.getValue().matcher(access.getName()).matches()));
    private static final DescribedPredicate<JavaClass> DRIVEN_PORTS = DescribedPredicate.describe(
            "a driven port (an interface or abstract class of an application or domain package that a class of an infrastructure package implements "
                    + "or a @Bean method of one provides)",
            type -> layerOf(type).filter(layer -> "application".equals(layer) || "domain".equals(layer)).isPresent()
                    && (type.isInterface() || type.getModifiers().contains(JavaModifier.ABSTRACT))
                    && (type.getAllSubclasses().stream().anyMatch(DddLayeringRulesTest::isInInfrastructure)
                    || type.getMethodsWithReturnTypeOfSelf().stream().anyMatch(method -> isInInfrastructure(method.getOwner())
                    && (method.isAnnotatedWith(Bean.class) || method.isMetaAnnotatedWith(Bean.class)))));
    private static final DescribedPredicate<Dependency> NOT_ON_A_PERSISTENCE_PORT_BUT_ONE_IT_IMPLEMENTS = DescribedPredicate.describe(
            "target no persistence port, except that a persistence adapter outside the persistence packages implements or extends one that "
                    + "no class of those packages implements and that is no persistence adapter itself, calling the constructor of the port it extends",
            dependency -> !PersistencePorts.PERSISTENCE_PORTS.test(dependency.getTargetClass())
                    || PersistencePorts.PERSISTENCE_ADAPTERS.test(dependency.getOriginClass()) && isInheritanceOfItsOwnPort(dependency));
    private static final Pattern CONTEXT_OF_PACKAGE = Pattern.compile("^cz\\.novanadeje\\.app\\.([^.]+)\\.(domain|application|infrastructure)(\\..*)?$");
    private static final Map<String, String> DRIVING_PORT_IMPLEMENTERS = Map.of(
            "cz.novanadeje.app.donations.infrastructure.fio.FioImportScheduler",
            "its BankImportRequests methods only queue a run on the scheduler thread, which then drives the import as a scheduler");
    private static final Map<String, String> PERSISTENCE_PORT_READERS = Map.of(
            "cz.novanadeje.app.donors.infrastructure.account.AccountEmailsAdapter",
            "pending #959: should answer the shared AccountEmails through a donors application service",
            "cz.novanadeje.app.donors.infrastructure.account.AdministrationHoldersAdapter",
            "pending #959: should answer the shared AdministrationHolders through a donors application service",
            "cz.novanadeje.app.content.infrastructure.people.ContentFoundationPeople",
            "pending #959: should answer the shared FoundationPeople through a content application service",
            "cz.novanadeje.app.operations.infrastructure.settings.SettingsKeyRecordSeals",
            "pending #959: should read the carried settings key through CarriedSettingsKeyService",
            "cz.novanadeje.app.operations.infrastructure.settings.SettingsConfiguration",
            "pending #959: hands the carried settings key repository to SettingsKeyRecordSeals until that reads through the service");
    private static final DescribedPredicate<JavaClass> REVIEWED_PERSISTENCE_PORT_READERS_APART = DescribedPredicate.describe(
            "are not one of the persistence port readers #959 empties", type -> !PERSISTENCE_PORT_READERS.containsKey(type.getName()));
    private static final DescribedPredicate<JavaClass> DRIVEN_ADAPTERS = DescribedPredicate.describe(
            "implement a port of their own context (an interface or abstract class of its application or domain, or a shared port its application "
                    + "or domain uses), the reviewed driving port implementers apart",
            type -> layerOf(type).filter("infrastructure"::equals).isPresent()
                    && !DRIVING_PORT_IMPLEMENTERS.containsKey(type.getName())
                    && portsOf(type).anyMatch(port -> isPortOfTheContextOf(port, type)));
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
    static final ArchRule interfaces_hold_only_the_rest_package = classes()
            .that().resideInAPackage("cz.novanadeje.app.*.interfaces..")
            .should().resideInAPackage("cz.novanadeje.app.*.interfaces.rest")
            .because(LAYERS + ": interfaces/rest holds the HTTP adapter (controllers, requests, responses, problem handlers, filters and "
                    + "argument resolvers); a scheduler or any other entry point that is not HTTP lives in infrastructure");

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
    static final ArchRule domain_uses_system_only_to_copy_arrays = noClasses()
            .that().resideInAPackage(DOMAIN)
            .should().accessTargetWhere(A_SYSTEM_MEMBER_BUT_ARRAYCOPY)
            .because(LAYERS + ": the domain computes on values it is handed; what the process, the machine or the clock says reaches it through an adapter");

    @ArchTest
    static final ArchRule domain_must_not_read_classpath_resources = noClasses()
            .that().resideInAPackage(DOMAIN)
            .should().accessTargetWhere(READS_A_CLASSPATH_RESOURCE)
            .because(LAYERS + ": a list the domain needs is loaded by infrastructure at startup and handed to the domain as a value");

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
            .should().dependOnClassesThat(PersistencePorts.PERSISTENCE_PORTS)
            .because(LAYERS);

    @ArchTest
    static final ArchRule rest_controllers_must_not_use_driven_ports = noClasses()
            .that().resideInAPackage("..interfaces..")
            .should().dependOnClassesThat(DRIVEN_PORTS)
            .because(LAYERS + ": a controller drives a use case through an application service, which reads and writes through the driven ports");

    @ArchTest
    static final ArchRule only_persistence_adapters_use_persistence_ports = onlyPersistenceAdaptersUsePersistencePorts(REVIEWED_PERSISTENCE_PORT_READERS_APART);

    private static ArchRule onlyPersistenceAdaptersUsePersistencePorts(DescribedPredicate<JavaClass> readersApart) {
        return classes()
            .that().resideInAPackage("..infrastructure..")
            .and().resideOutsideOfPackages(AdapterLibraryRulesTest.persistenceAdapters())
            .and(readersApart)
            .should(ArchConditions.onlyHaveDependenciesWhere(NOT_ON_A_PERSISTENCE_PORT_BUT_ONE_IT_IMPLEMENTS))
            .because("backend.md, Application: an adapter that is not a persistence adapter renders, sends or drives; what it needs from the "
                    + "database an application service reads inside its transaction and hands it, so no rule hides in a mail or other adapter");
    }

    @ArchTest
    static final ArchRule driven_adapters_must_not_drive_a_use_case = noClasses()
            .that(DRIVEN_ADAPTERS)
            .should(dependOnAnApplicationServiceDirectlyOrThroughTheirInfrastructure())
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

    @Test
    @DisplayName("Given the driving port implementers, when they are read, then each exists, so the list names no class that is gone")
    void should_find_every_driving_port_implementer_when_read_given_the_list() throws ClassNotFoundException {
        for (String implementer : DRIVING_PORT_IMPLEMENTERS.keySet()) {
            assertThat(Class.forName(implementer)).as(implementer).isNotNull();
        }
    }

    @Test
    @DisplayName("Given the persistence port readers #959 empties, when the rule checks the site without them apart, then each is still reported, so the list names no reader that no longer needs it")
    void should_report_every_listed_reader_when_checked_without_the_list_given_the_site() {
        JavaClasses site = new ClassFileImporter().withImportOption(new ImportOption.DoNotIncludeTests()).importPackagesOf(AppApplication.class);

        List<String> details = onlyPersistenceAdaptersUsePersistencePorts(DescribedPredicate.alwaysTrue()).evaluate(site).getFailureReport().getDetails();

        assertThat(PERSISTENCE_PORT_READERS.keySet()).allSatisfy(reader -> assertThat(details).anySatisfy(detail -> assertThat(detail).contains(reader + ".")));
    }

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
                    planted("planteda.domain.EnvironmentGift", """
                            public class EnvironmentGift {
                                String token() { return System.getenv("FIO_TOKEN"); }
                                String home() { return System.getProperty("user.home"); }
                                long ticks() { return System.nanoTime(); }
                                void print() { System.out.println("gift"); }
                            }
                            """),
                    planted("planteda.domain.ExitingGift", """
                            public class ExitingGift {
                                void stop() { System.exit(1); }
                                java.util.function.IntConsumer stopper() { return System::exit; }
                                void halt() { Runtime.getRuntime().halt(1); }
                            }
                            """),
                    planted("planteda.domain.ThreadedGift", """
                            public class ThreadedGift {
                                ThreadLocal<String> current;
                                InheritableThreadLocal<String> inherited;
                                ScopedValue<String> scoped;
                                Thread[] threads;
                                boolean interrupted() { return Thread.currentThread().isInterrupted(); }
                            }
                            """),
                    planted("planteda.domain.ProcessGift", "public class ProcessGift { ProcessBuilder builder; ProcessHandle handle; }"),
                    planted("planteda.domain.LoadingGift", """
                            public class LoadingGift {
                                Object load() throws ClassNotFoundException { return Class.forName("cz.novanadeje.app.planteda.domain.Gift"); }
                                ClassLoader loader;
                                Module module;
                                StackWalker walker;
                                System.Logger logger;
                            }
                            """),
                    planted("planteda.domain.HandleGift", "public class HandleGift { Object lookup() { return java.lang.invoke.MethodHandles.lookup(); } }"),
                    planted("planteda.domain.ValueGift", """
                            public final class ValueGift implements Comparable<ValueGift>, Iterable<Character> {
                                private final byte[] bytes;
                                private final String text;
                                public ValueGift(byte[] bytes, String text) {
                                    if (text == null || text.isBlank()) {
                                        throw new IllegalArgumentException("A gift has a text");
                                    }
                                    this.bytes = new byte[bytes.length];
                                    System.arraycopy(bytes, 0, this.bytes, 0, bytes.length);
                                    this.text = text;
                                }
                                long checked() { return Math.addExact(Integer.parseInt(text), Long.valueOf(bytes.length)); }
                                String upper() { return new StringBuilder().append(Character.toUpperCase(text.charAt(0))).append(Boolean.TRUE).toString(); }
                                String kind(Object value) {
                                    return switch (value) {
                                        case Integer number -> "number " + number;
                                        case CharSequence chars -> "text " + chars.length();
                                        default -> "other";
                                    };
                                }
                                @Override
                                public int compareTo(ValueGift other) { return text.compareTo(other.text); }
                                @Override
                                public java.util.Iterator<Character> iterator() { return text.chars().mapToObj(each -> (char) each).iterator(); }
                                @Override
                                public boolean equals(Object other) { return other != null && getClass() == other.getClass() && text.equals(((ValueGift) other).text); }
                                @Override
                                public int hashCode() { return text.hashCode(); }
                                String[] parts() { return text.split(","); }
                                ValueGift[] pair() { return new ValueGift[] {this, this}; }
                            }
                            """),
                    planted("planteda.domain.ValueKind", """
                            public enum ValueKind {
                                GIFT;
                                static ValueKind of(String text) { return valueOf(text); }
                                static int count() { return values().length; }
                            }
                            """),
                    planted("planteda.domain.ValuePart", "public record ValuePart(String text) {}"),
                    planted("planteda.domain.StreamedGift", """
                            public class StreamedGift {
                                byte[] read() throws java.io.IOException {
                                    try (java.io.InputStream list = StreamedGift.class.getResourceAsStream("gift.txt")) {
                                        return list.readAllBytes();
                                    }
                                }
                            }
                            """),
                    planted("planteda.domain.ResourceGift", """
                            public class ResourceGift {
                                Object list() { return ResourceGift.class.getResourceAsStream("gift.txt"); }
                                Object loaded() { return ResourceGift.class.getClassLoader().getResource("gift.txt"); }
                                java.util.function.Function<String, Object> reader() { return ResourceGift.class::getResourceAsStream; }
                            }
                            """),
                    planted("planteda.domain.BundledGift", """
                            public class BundledGift {
                                Object bundle() { return java.util.ResourceBundle.getBundle("gift"); }
                                Object propertyBundle() { return java.util.PropertyResourceBundle.getBundle("gift"); }
                                Object services() { return java.util.ServiceLoader.load(Runnable.class); }
                                Object installed() { return java.util.ServiceLoader.loadInstalled(Runnable.class); }
                            }
                            """),
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
                                public void pair() { service.pair(); }
                            }
                            """),
                    planted("planteda.infrastructure.account.KernelPortAdapter", """
                            public class KernelPortAdapter implements cz.novanadeje.app.shared.application.account.KernelPort {
                                cz.novanadeje.app.planteda.application.PairingService service;
                                public void pair() { service.pair(); }
                            }
                            """),
                    planted("shared.application.account.KernelPort", "public interface KernelPort { void pair(); }"),
                    planted("shared.application.account.LoopPort", "public interface LoopPort { void pair(); }"),
                    planted("planteda.application.LoopUser", "public class LoopUser { cz.novanadeje.app.shared.application.account.LoopPort port; }"),
                    planted("planteda.infrastructure.account.LoopPortAdapter", """
                            public class LoopPortAdapter implements cz.novanadeje.app.shared.application.account.LoopPort {
                                cz.novanadeje.app.planteda.application.PairingService service;
                                public void pair() { service.pair(); }
                            }
                            """),
                    planted("planteda.infrastructure.pairing.HelperPairing", """
                            public class HelperPairing implements cz.novanadeje.app.planteda.application.GiftPairing {
                                PairingHelper helper;
                                public void pair() { helper.run(); }
                            }
                            """),
                    planted("planteda.infrastructure.pairing.PairingHelper", """
                            public class PairingHelper {
                                cz.novanadeje.app.planteda.application.PairingService service;
                                void run() { service.pair(); }
                            }
                            """),
                    planted("planteda.application.AbstractGiftPairing", "public abstract class AbstractGiftPairing { public abstract void pair(); }"),
                    planted("planteda.infrastructure.pairing.ExtendingPairing", """
                            public class ExtendingPairing extends cz.novanadeje.app.planteda.application.AbstractGiftPairing {
                                cz.novanadeje.app.planteda.application.PairingService service;
                                public void pair() { service.pair(); }
                            }
                            """),
                    planted("planteda.application.WebGiftService", "public class WebGiftService { org.springframework.http.HttpStatus status; }"),
                    planted("planteda.application.TextGiftService", "public class TextGiftService { org.springframework.context.MessageSource texts; }"),
                    planted("planteda.infrastructure.mail.GiftMailer", "public class GiftMailer {}"),
                    planted("planteda.infrastructure.mail.GiftRecipientsMailer", """
                            public class GiftRecipientsMailer {
                                cz.novanadeje.app.planteda.domain.Gifts gifts;
                            }
                            """),
                    planted("planteda.domain.GiftLog", "public interface GiftLog {}"),
                    planted("shared.infrastructure.audit.PlantedGiftLog", "public class PlantedGiftLog implements cz.novanadeje.app.planteda.domain.GiftLog {}"),
                    planted("planteda.infrastructure.mail.GiftLogMailer", """
                            public class GiftLogMailer {
                                cz.novanadeje.app.planteda.domain.GiftLog log;
                            }
                            """),
                    planted("planteda.infrastructure.mail.PairingMailer", """
                            public class PairingMailer {
                                cz.novanadeje.app.planteda.application.GiftPairing pairing;
                            }
                            """),
                    planted("planteda.infrastructure.persistence.CachingGifts", """
                            public class CachingGifts {
                                cz.novanadeje.app.planteda.domain.Gifts gifts;
                            }
                            """),
                    planted("donors.infrastructure.account.AccountEmailsAdapter", """
                            class AccountEmailsAdapter {
                                cz.novanadeje.app.planteda.domain.Gifts gifts;
                            }
                            """),
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
                    planted("planteda.interfaces.rest.GiftLogController", "public class GiftLogController { cz.novanadeje.app.planteda.domain.GiftLog log; }"),
                    planted("planteda.domain.Ledger", "public abstract class Ledger {}"),
                    planted("planteda.infrastructure.persistence.JpaLedger", "public class JpaLedger extends cz.novanadeje.app.planteda.domain.Ledger {}"),
                    planted("planteda.interfaces.rest.LedgerController", "public class LedgerController { cz.novanadeje.app.planteda.domain.Ledger ledger; }"),
                    planted("shared.infrastructure.lock.PlantedLock", "public class PlantedLock {}"),
                    planted("planteda.interfaces.rest.LockController", "public class LockController { cz.novanadeje.app.shared.infrastructure.lock.PlantedLock lock; }"),
                    planted("planteda.domain.Archive", "public interface Archive {}"),
                    planted("planteda.infrastructure.archive.AnnotatedArchive",
                            "@org.springframework.stereotype.Repository public class AnnotatedArchive implements cz.novanadeje.app.planteda.domain.Archive {}"),
                    planted("planteda.domain.Shelf", "public interface Shelf {}"),
                    planted("planteda.infrastructure.archive.SqlShelf",
                            "public class SqlShelf implements cz.novanadeje.app.planteda.domain.Shelf { javax.sql.DataSource source; }"),
                    planted("planteda.domain.PaperRepository", "public interface PaperRepository {}"),
                    planted("planteda.infrastructure.mail.ArchiveMailer", "public class ArchiveMailer { cz.novanadeje.app.planteda.domain.Archive archive; }"),
                    planted("planteda.infrastructure.mail.ShelfMailer", "public class ShelfMailer { cz.novanadeje.app.planteda.domain.Shelf shelf; }"),
                    planted("planteda.infrastructure.mail.PaperMailer", "public class PaperMailer { cz.novanadeje.app.planteda.domain.PaperRepository papers; }"),
                    planted("planteda.infrastructure.mail.AnnotatedMailer",
                            "@org.springframework.stereotype.Repository public class AnnotatedMailer { cz.novanadeje.app.planteda.domain.Gifts gifts; }"),
                    planted("planteda.infrastructure.archive.JdbcShelfReader", """
                            public class JdbcShelfReader implements cz.novanadeje.app.planteda.domain.Shelf {
                                javax.sql.DataSource source;
                                cz.novanadeje.app.planteda.domain.Gifts gifts;
                            }
                            """),
                    planted("planteda.infrastructure.mail.GiftsDecorator", """
                            public class GiftsDecorator implements cz.novanadeje.app.planteda.domain.Gifts {
                                cz.novanadeje.app.planteda.domain.Gifts gifts;
                            }
                            """),
                    planted("planteda.domain.GiftReads", "public interface GiftReads {}"),
                    planted("planteda.domain.ReadableGifts", "public interface ReadableGifts extends GiftReads {}"),
                    planted("planteda.infrastructure.persistence.JpaReadableGifts",
                            "public class JpaReadableGifts implements cz.novanadeje.app.planteda.domain.ReadableGifts {}"),
                    planted("planteda.infrastructure.mail.RepositoryDecorator", """
                            @org.springframework.stereotype.Repository
                            public class RepositoryDecorator implements cz.novanadeje.app.planteda.domain.Gifts {
                                cz.novanadeje.app.planteda.domain.Gifts gifts;
                            }
                            """),
                    planted("planteda.infrastructure.mail.ReadsDecorator", """
                            @org.springframework.stereotype.Repository
                            public class ReadsDecorator implements cz.novanadeje.app.planteda.domain.ReadableGifts {
                                cz.novanadeje.app.planteda.domain.GiftReads reads;
                            }
                            """),
                    planted("planteda.domain.Book", "public abstract class Book {}"),
                    planted("planteda.infrastructure.archive.SqlLedger", """
                            public class SqlLedger extends cz.novanadeje.app.planteda.domain.Book {
                                javax.sql.DataSource source;
                            }
                            """),
                    planted("planteda.infrastructure.mail.InheritingMailer",
                            "@org.springframework.stereotype.Repository public class InheritingMailer extends cz.novanadeje.app.planteda.infrastructure.persistence.JpaGifts {}"),
                    planted("planteda.infrastructure.cache.RepositoryCache",
                            "@org.springframework.stereotype.Repository public class RepositoryCache implements cz.novanadeje.app.planteda.domain.Gifts {}"),
                    planted("planteda.application.SeedList", "public interface SeedList { int size(); }"),
                    planted("planteda.infrastructure.config.SeedConfiguration", """
                            public class SeedConfiguration {
                                @org.springframework.context.annotation.Bean
                                cz.novanadeje.app.planteda.application.SeedList seeds() { return () -> 1; }
                            }
                            """),
                    planted("planteda.interfaces.rest.SeedController", "public class SeedController { cz.novanadeje.app.planteda.application.SeedList seeds; }"),
                    planted("planteda.application.GiftLabels", "public interface GiftLabels { String label(); }"),
                    planted("planteda.infrastructure.config.LabelHelper", """
                            public class LabelHelper {
                                cz.novanadeje.app.planteda.application.GiftLabels labels() { return () -> "gift"; }
                            }
                            """),
                    planted("planteda.interfaces.rest.LabelController", "public class LabelController { cz.novanadeje.app.planteda.application.GiftLabels labels; }"),
                    planted("planteda.infrastructure.mail.JpaGiftsMailer",
                            "public class JpaGiftsMailer { cz.novanadeje.app.planteda.infrastructure.persistence.JpaGifts gifts; }"),
                    planted("planteda.interfaces.rest.PairingController", "public class PairingController { cz.novanadeje.app.planteda.application.GiftPairing pairing; }"),
                    planted("planteda.interfaces.rest.AbstractPairingController",
                            "public class AbstractPairingController { cz.novanadeje.app.planteda.application.AbstractGiftPairing pairing; }"),
                    planted("planteda.interfaces.rest.KernelPortController",
                            "public class KernelPortController { cz.novanadeje.app.shared.application.account.KernelPort port; }"),
                    planted("planteda.application.GiftQueries", "public interface GiftQueries { int count(); }"),
                    planted("planteda.application.GiftQueryService", "public class GiftQueryService implements GiftQueries { public int count() { return 0; } }"),
                    planted("planteda.interfaces.rest.QueryController", """
                            public class QueryController {
                                cz.novanadeje.app.planteda.application.GiftQueries queries;
                                cz.novanadeje.app.planteda.application.PairingService service;
                            }
                            """),
                    planted("planteda.config.LooseSettings", "public class LooseSettings {}"),
                    planted("plantedb.domain.Reader", "public class Reader { cz.novanadeje.app.planteda.domain.Gift gift; }"),
                    planted("shared.domain.PlantedKernel", "public class PlantedKernel { cz.novanadeje.app.planteda.domain.Gift gift; }"),
                    planted("shared.infrastructure.persistence.KernelRow", "public class KernelRow {}"),
                    planted("shared.infrastructure.security.Guard", "public class Guard {}"),
                    planted("planteda.interfaces.LooseHandler", "public class LooseHandler {}"),
                    planted("planteda.interfaces.web.GiftPage", "public class GiftPage {}"),
                    planted("planteda.interfaces.rest.admin.AdminGiftController", "public class AdminGiftController {}"),
                    planted("shared.interfaces.web.KernelPage", "public class KernelPage {}")));
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
        @DisplayName("when the interfaces rule checks classes directly in interfaces, in another package beside rest, below rest and in the "
                + "shared kernel's interfaces, then each is reported and a controller in rest is not")
        void should_report_every_interfaces_package_but_rest_when_checked_given_planted_classes() {
            assertThat(reportOf(interfaces_hold_only_the_rest_package))
                    .anySatisfy(detail -> assertThat(detail).contains("planteda.interfaces.LooseHandler"))
                    .anySatisfy(detail -> assertThat(detail).contains("planteda.interfaces.web.GiftPage"))
                    .anySatisfy(detail -> assertThat(detail).contains("planteda.interfaces.rest.admin.AdminGiftController"))
                    .anySatisfy(detail -> assertThat(detail).contains("shared.interfaces.web.KernelPage"))
                    .noneSatisfy(detail -> assertThat(detail).contains("planteda.interfaces.rest.GiftController"));
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
        @DisplayName("when the domain rule checks domain classes on a logger, JDBC, concurrency, reflection, a socket and a stream, then each is reported")
        void should_report_every_library_outside_the_jdk_core_when_checked_given_planted_domain_classes() {
            assertThat(reportOf(domain_must_not_depend_on_frameworks))
                    .anySatisfy(detail -> assertThat(detail).contains("LoggingGift").contains("org.slf4j.Logger"))
                    .anySatisfy(detail -> assertThat(detail).contains("TimedGift").contains("java.sql.Timestamp"))
                    .anySatisfy(detail -> assertThat(detail).contains("ConcurrentGift").contains("java.util.concurrent.ConcurrentHashMap"))
                    .anySatisfy(detail -> assertThat(detail).contains("ReflectiveGift").contains("java.lang.reflect.Method"))
                    .anySatisfy(detail -> assertThat(detail).contains("NetworkGift").contains("java.net.Socket"))
                    .anySatisfy(detail -> assertThat(detail).contains("StreamedGift").contains("java.io.InputStream"))
                    .anySatisfy(detail -> assertThat(detail).contains("StreamedGift").contains("java.io.IOException"))
                    .noneSatisfy(detail -> assertThat(detail).contains("planteda.domain.Gift>"));
        }

        @Test
        @DisplayName("when the domain rule checks domain classes on the runtime, threads, thread and scoped values, an array of threads, processes, class loading, modules, stack walking, the system logger and method handles, then each is reported and a value class on strings, boxes, maths, characters, records, enums and exceptions is not")
        void should_report_every_side_effecting_part_of_java_lang_when_checked_given_planted_domain_classes() {
            assertThat(reportOf(domain_must_not_depend_on_frameworks))
                    .anySatisfy(detail -> assertThat(detail).contains("ExitingGift").contains("<java.lang.Runtime"))
                    .anySatisfy(detail -> assertThat(detail).contains("ThreadedGift").contains("<java.lang.Thread."))
                    .anySatisfy(detail -> assertThat(detail).contains("ThreadedGift").contains("<java.lang.ThreadLocal>"))
                    .anySatisfy(detail -> assertThat(detail).contains("ThreadedGift").contains("<java.lang.InheritableThreadLocal>"))
                    .anySatisfy(detail -> assertThat(detail).contains("ThreadedGift").contains("<java.lang.ScopedValue>"))
                    .anySatisfy(detail -> assertThat(detail).contains("ThreadedGift").contains("<[Ljava.lang.Thread;>"))
                    .anySatisfy(detail -> assertThat(detail).contains("ProcessGift").contains("<java.lang.ProcessBuilder>"))
                    .anySatisfy(detail -> assertThat(detail).contains("ProcessGift").contains("<java.lang.ProcessHandle>"))
                    .anySatisfy(detail -> assertThat(detail).contains("LoadingGift").contains("<java.lang.Class.forName"))
                    .anySatisfy(detail -> assertThat(detail).contains("LoadingGift").contains("<java.lang.ClassLoader>"))
                    .anySatisfy(detail -> assertThat(detail).contains("LoadingGift").contains("<java.lang.Module>"))
                    .anySatisfy(detail -> assertThat(detail).contains("LoadingGift").contains("<java.lang.StackWalker>"))
                    .anySatisfy(detail -> assertThat(detail).contains("LoadingGift").contains("<java.lang.System$Logger>"))
                    .anySatisfy(detail -> assertThat(detail).contains("HandleGift").contains("java.lang.invoke.MethodHandles"))
                    .noneSatisfy(detail -> assertThat(detail).contains("ValueGift"))
                    .noneSatisfy(detail -> assertThat(detail).contains("ValueKind"))
                    .noneSatisfy(detail -> assertThat(detail).contains("ValuePart"));
        }

        @Test
        @DisplayName("when the system rule checks domain classes that read the environment, a system property or the clock, print, exit by a call or a method reference and copy an array, then each but the copy is reported")
        void should_report_every_system_member_but_the_array_copy_when_checked_given_planted_domain_classes() {
            assertThat(reportOf(domain_uses_system_only_to_copy_arrays))
                    .anySatisfy(detail -> assertThat(detail).contains("EnvironmentGift.token()").contains("java.lang.System.getenv"))
                    .anySatisfy(detail -> assertThat(detail).contains("EnvironmentGift.home()").contains("java.lang.System.getProperty"))
                    .anySatisfy(detail -> assertThat(detail).contains("EnvironmentGift.ticks()").contains("java.lang.System.nanoTime"))
                    .anySatisfy(detail -> assertThat(detail).contains("EnvironmentGift.print()").contains("java.lang.System.out"))
                    .anySatisfy(detail -> assertThat(detail).contains("ExitingGift.stop()").contains("java.lang.System.exit"))
                    .anySatisfy(detail -> assertThat(detail).contains("ExitingGift.stopper()").contains("java.lang.System.exit"))
                    .noneSatisfy(detail -> assertThat(detail).contains("ValueGift"));
        }

        @Test
        @DisplayName("when the resource rule checks domain classes that read a classpath resource by a call, through the class loader, by a method reference, as a resource bundle, through a subclass of one and through a service loader, then each is reported and a class that reads none is not")
        void should_report_every_resource_read_when_checked_given_planted_domain_classes() {
            assertThat(reportOf(domain_must_not_read_classpath_resources))
                    .anySatisfy(detail -> assertThat(detail).contains("StreamedGift.read()").contains("getResourceAsStream"))
                    .anySatisfy(detail -> assertThat(detail).contains("ResourceGift.list()").contains("getResourceAsStream"))
                    .anySatisfy(detail -> assertThat(detail).contains("ResourceGift.loaded()").contains("java.lang.ClassLoader.getResource"))
                    .anySatisfy(detail -> assertThat(detail).contains("ResourceGift.reader()").contains("getResourceAsStream"))
                    .anySatisfy(detail -> assertThat(detail).contains("BundledGift.bundle()").contains("java.util.ResourceBundle.getBundle"))
                    .anySatisfy(detail -> assertThat(detail).contains("BundledGift.propertyBundle()").contains("java.util.PropertyResourceBundle.getBundle"))
                    .anySatisfy(detail -> assertThat(detail).contains("BundledGift.services()").contains("java.util.ServiceLoader.load"))
                    .anySatisfy(detail -> assertThat(detail).contains("BundledGift.installed()").contains("java.util.ServiceLoader.loadInstalled"))
                    .noneSatisfy(detail -> assertThat(detail).contains("NetworkGift"));
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
        @DisplayName("when the port rule checks controllers on persistence ports, then a port persistence implements whatever it is called, the audit "
                + "trail's port, an abstract port and a concrete adapter of the shared lock are each reported")
        void should_report_controller_on_a_persistence_port_when_checked_given_planted_ports() {
            assertThat(reportOf(rest_controllers_must_not_use_persistence_ports))
                    .anySatisfy(detail -> assertThat(detail).contains("GiftController").contains("planteda.domain.Gifts"))
                    .anySatisfy(detail -> assertThat(detail).contains("GiftLogController").contains("planteda.domain.GiftLog"))
                    .anySatisfy(detail -> assertThat(detail).contains("LedgerController").contains("planteda.domain.Ledger"))
                    .anySatisfy(detail -> assertThat(detail).contains("LockController").contains("shared.infrastructure.lock.PlantedLock"));
        }

        @Test
        @DisplayName("when the driven port rule checks controllers, then a controller on a domain or application interface, an abstract application "
                + "class or a shared port that infrastructure implements, or an interface an infrastructure @Bean method provides as a lambda, is "
                + "reported, and one on an application service, a port only the application implements or an interface an infrastructure method "
                + "that is no @Bean returns is not")
        void should_report_controller_on_a_driven_port_when_checked_given_planted_controllers() {
            assertThat(reportOf(rest_controllers_must_not_use_driven_ports))
                    .anySatisfy(detail -> assertThat(detail).contains("GiftController").contains("planteda.domain.Gifts"))
                    .anySatisfy(detail -> assertThat(detail).contains("PairingController").contains("planteda.application.GiftPairing"))
                    .anySatisfy(detail -> assertThat(detail).contains("AbstractPairingController").contains("planteda.application.AbstractGiftPairing"))
                    .anySatisfy(detail -> assertThat(detail).contains("KernelPortController").contains("shared.application.account.KernelPort"))
                    .anySatisfy(detail -> assertThat(detail).contains("SeedController").contains("planteda.application.SeedList"))
                    .noneSatisfy(detail -> assertThat(detail).contains("QueryController"))
                    .noneSatisfy(detail -> assertThat(detail).contains("LabelController"));
        }

        @Test
        @DisplayName("when the persistence port rule checks adapters on ports, then a mail adapter on a port a persistence adapter implements (the audit "
                + "trail's, a @Repository's outside the persistence packages and a JDBC adapter's included), on a port named …Repository and on a "
                + "persistence adapter itself is reported, also from a @Repository or JDBC class outside the persistence packages and from a "
                + "decorator that implements the port, a @Repository one included, and from a @Repository class that implements a port of the "
                + "persistence packages or extends one of their adapters, and a @Repository or JDBC class that only implements or extends a port "
                + "of its own, an adapter on a port persistence does not implement and a reviewed reader are not")
        void should_report_only_a_non_persistence_adapter_on_a_persistence_port_when_checked_given_planted_adapters() {
            assertThat(reportOf(only_persistence_adapters_use_persistence_ports))
                    .anySatisfy(detail -> assertThat(detail).contains("GiftRecipientsMailer").contains("planteda.domain.Gifts"))
                    .anySatisfy(detail -> assertThat(detail).contains("GiftLogMailer").contains("planteda.domain.GiftLog"))
                    .anySatisfy(detail -> assertThat(detail).contains("ArchiveMailer").contains("planteda.domain.Archive"))
                    .anySatisfy(detail -> assertThat(detail).contains("ShelfMailer").contains("planteda.domain.Shelf"))
                    .anySatisfy(detail -> assertThat(detail).contains("PaperMailer").contains("planteda.domain.PaperRepository"))
                    .anySatisfy(detail -> assertThat(detail).contains("JpaGiftsMailer").contains("planteda.infrastructure.persistence.JpaGifts"))
                    .anySatisfy(detail -> assertThat(detail).contains("AnnotatedMailer").contains("planteda.domain.Gifts"))
                    .anySatisfy(detail -> assertThat(detail).contains("GiftsDecorator").contains("implements").contains("planteda.domain.Gifts"))
                    .anySatisfy(detail -> assertThat(detail).contains("GiftsDecorator.gifts").contains("planteda.domain.Gifts"))
                    .anySatisfy(detail -> assertThat(detail).contains("RepositoryDecorator.gifts").contains("planteda.domain.Gifts"))
                    .anySatisfy(detail -> assertThat(detail).contains("ReadsDecorator.reads").contains("planteda.domain.GiftReads"))
                    .anySatisfy(detail -> assertThat(detail).contains("RepositoryDecorator").contains("implements"))
                    .anySatisfy(detail -> assertThat(detail).contains("ReadsDecorator").contains("implements"))
                    .anySatisfy(detail -> assertThat(detail).contains("InheritingMailer").contains("extends").contains("JpaGifts"))
                    .anySatisfy(detail -> assertThat(detail).contains("RepositoryCache").contains("implements").contains("planteda.domain.Gifts"))
                    .noneSatisfy(detail -> assertThat(detail).contains("SqlLedger"))
                    .anySatisfy(detail -> assertThat(detail).contains("JdbcShelfReader").contains("planteda.domain.Gifts"))
                    .noneSatisfy(detail -> assertThat(detail).contains("JdbcShelfReader").contains("planteda.domain.Shelf"))
                    .noneSatisfy(detail -> assertThat(detail).contains("AnnotatedArchive"))
                    .noneSatisfy(detail -> assertThat(detail).contains("SqlShelf"))
                    .noneSatisfy(detail -> assertThat(detail).contains("CachingGifts"))
                    .noneSatisfy(detail -> assertThat(detail).contains("PairingMailer"))
                    .noneSatisfy(detail -> assertThat(detail).contains("AccountEmailsAdapter"));
        }

        @Test
        @DisplayName("when the JPA rule checks an entity outside the persistence package, then it is reported")
        void should_report_entity_outside_persistence_when_checked_given_an_entity_in_a_mail_adapter() {
            assertThat(reportOf(jpa_entities_and_spring_data_repositories_are_package_private_adapter_details))
                    .anySatisfy(detail -> assertThat(detail).contains("infrastructure.mail.GiftRow"));
        }

        @Test
        @DisplayName("when the driven adapter rule checks adapters of the context's own ports on an application service, directly, through a helper, as a scheduler, of an abstract port and of a shared port the context uses, then they are reported and the driving side and a shared port the context does not use are not")
        void should_report_adapters_of_own_ports_on_a_service_when_checked_given_planted_driven_and_driving_adapters() {
            assertThat(reportOf(driven_adapters_must_not_drive_a_use_case))
                    .anySatisfy(detail -> assertThat(detail).contains("ServicePairing").contains("PairingService"))
                    .anySatisfy(detail -> assertThat(detail).contains("ComponentGifts").contains("GiftComponent"))
                    .anySatisfy(detail -> assertThat(detail).contains("PairingScheduler"))
                    .anySatisfy(detail -> assertThat(detail).contains("HelperPairing").contains("PairingHelper"))
                    .anySatisfy(detail -> assertThat(detail).contains("ExtendingPairing"))
                    .anySatisfy(detail -> assertThat(detail).contains("LoopPortAdapter"))
                    .noneSatisfy(detail -> assertThat(detail).contains("PairingListener"))
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

    private static boolean isWhatTheDomainMayUse(JavaClass type) {
        JavaClass element = type.isArray() ? type.getBaseComponentType() : type;
        return element.isPrimitive() || THE_DOMAIN_MAY_USE_AS_A_TYPE.test(element);
    }

    private static boolean isInheritanceOfItsOwnPort(Dependency dependency) {
        JavaClass origin = dependency.getOriginClass();
        JavaClass port = dependency.getTargetClass();
        String description = dependency.getDescription();
        boolean implemented = origin.getRawInterfaces().contains(port)
                && description.startsWith("Class <" + origin.getName() + "> implements interface <" + port.getName() + ">");
        boolean extended = origin.getRawSuperclass().filter(port::equals).isPresent()
                && (description.startsWith("Class <" + origin.getName() + "> extends class <" + port.getName() + ">")
                || description.startsWith("Constructor <" + origin.getName() + ".<init>(") && description.contains("> calls constructor <" + port.getName() + ".<init>("));
        return (implemented || extended) && isOnlyAPortOutsideThePersistencePackages(port);
    }

    private static boolean isOnlyAPortOutsideThePersistencePackages(JavaClass port) {
        return !PersistencePorts.PERSISTENCE_ADAPTERS.test(port)
                && port.getAllSubclasses().stream().noneMatch(resideInAnyPackage(AdapterLibraryRulesTest.persistenceAdapters())::test);
    }

    private static boolean isInInfrastructure(JavaClass type) {
        return layerOf(type).filter("infrastructure"::equals).isPresent();
    }

    private static Optional<String> layerOf(JavaClass type) {
        Matcher matcher = CONTEXT_OF_PACKAGE.matcher(type.getPackageName());
        return matcher.matches() ? Optional.of(matcher.group(2)) : Optional.empty();
    }

    private static Stream<JavaClass> portsOf(JavaClass type) {
        return Stream.concat(type.getAllRawInterfaces().stream(), type.getAllRawSuperclasses().stream());
    }

    private static boolean isPortOfTheContextOf(JavaClass port, JavaClass adapter) {
        Matcher portPackage = CONTEXT_OF_PACKAGE.matcher(port.getPackageName());
        Matcher adapterPackage = CONTEXT_OF_PACKAGE.matcher(adapter.getPackageName());
        if (!portPackage.matches() || !adapterPackage.matches() || "infrastructure".equals(portPackage.group(2))) {
            return false;
        }
        String context = adapterPackage.group(1);
        return portPackage.group(1).equals(context) || "shared".equals(portPackage.group(1)) && usedByTheContext(port, context);
    }

    private static boolean usedByTheContext(JavaClass port, String context) {
        return port.getDirectDependenciesToSelf().stream()
                .map(dependency -> CONTEXT_OF_PACKAGE.matcher(dependency.getOriginClass().getPackageName()))
                .anyMatch(origin -> origin.matches() && origin.group(1).equals(context) && !"infrastructure".equals(origin.group(2)));
    }

    private static ArchCondition<JavaClass> dependOnAnApplicationServiceDirectlyOrThroughTheirInfrastructure() {
        return new ArchCondition<>("depend on " + APPLICATION_SERVICES.getDescription() + ", directly or through the infrastructure of their context") {
            @Override
            public void check(JavaClass adapter, ConditionEvents events) {
                Set<JavaClass> seen = new HashSet<>(Set.of(adapter));
                Deque<JavaClass> pending = new ArrayDeque<>(Set.of(adapter));
                while (!pending.isEmpty()) {
                    JavaClass current = pending.poll();
                    for (Dependency dependency : current.getDirectDependenciesFromSelf()) {
                        JavaClass target = dependency.getTargetClass();
                        if (APPLICATION_SERVICES.test(target)) {
                            String through = current.equals(adapter) ? "" : " through " + current.getName();
                            events.add(SimpleConditionEvent.satisfied(adapter, adapter.getName() + through + " depends on " + target.getName()));
                        } else if (inTheInfrastructureOfTheContextOf(target, adapter) && seen.add(target)) {
                            pending.add(target);
                        }
                    }
                }
            }
        };
    }

    private static boolean inTheInfrastructureOfTheContextOf(JavaClass type, JavaClass adapter) {
        Matcher typePackage = CONTEXT_OF_PACKAGE.matcher(type.getPackageName());
        Matcher adapterPackage = CONTEXT_OF_PACKAGE.matcher(adapter.getPackageName());
        return typePackage.matches() && adapterPackage.matches() && "infrastructure".equals(typePackage.group(2))
                && typePackage.group(1).equals(adapterPackage.group(1));
    }
}
