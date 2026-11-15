package cz.novanadeje.app.architecture;

import com.tngtech.archunit.base.DescribedPredicate;
import com.tngtech.archunit.core.domain.AccessTarget.CodeUnitAccessTarget;
import com.tngtech.archunit.core.domain.JavaAccess;
import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.domain.JavaCodeUnit;
import com.tngtech.archunit.core.domain.JavaField;
import com.tngtech.archunit.core.domain.JavaFieldAccess;
import com.tngtech.archunit.core.domain.JavaMethod;
import com.tngtech.archunit.core.domain.JavaModifier;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchCondition;
import com.tngtech.archunit.lang.ArchRule;
import com.tngtech.archunit.lang.ConditionEvents;
import com.tngtech.archunit.lang.SimpleConditionEvent;
import cz.novanadeje.app.AppApplication;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.io.IOException;
import java.nio.file.Path;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Stream;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.methods;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static org.assertj.core.api.Assertions.assertThat;

@AnalyzeClasses(
        packagesOf = AppApplication.class,
        importOptions = ImportOption.DoNotIncludeTests.class
)
class BeanWiringRulesTest {

    private static final DescribedPredicate<JavaClass> WIRING_CODE = DescribedPredicate.describe(
            "are configuration classes, classes that declare a @Bean method, or classes nested in one (an anonymous class of a @Bean method included)",
            type -> enclosingChainOf(type).anyMatch(BeanWiringRulesTest::declaresWiring));
    private static final DescribedPredicate<JavaAccess<?>> A_MEMBER_OF_AN_APPLICATION_SERVICE = DescribedPredicate.describe(
            "a member of an application service (a call, a method reference or a field access, in a lambda too)",
            access -> DddLayeringRulesTest.APPLICATION_SERVICES.test(access.getTargetOwner()));
    private static final DescribedPredicate<JavaMethod> RETURN_A_PORT_OF_THEIR_CONTEXT = DescribedPredicate.describe(
            "are methods of infrastructure (a @Bean method among them) that return a port of their own context, or a type that is, extends or "
                    + "implements one, inside an Optional or another generic type too (a port: an interface or abstract class of its application or domain, or a shared port its application or "
                    + "domain uses, that no concrete class of an application or domain package implements, so a use case's sealed result is none), the "
                    + "reviewed driving port implementers apart, so the lambda, method reference or object they return is a driven adapter",
            method -> DddLayeringRulesTest.layerOf(method.getOwner()).filter("infrastructure"::equals).isPresent()
                    && !DddLayeringRulesTest.DRIVING_PORT_IMPLEMENTERS.containsKey(method.getRawReturnType().getName())
                    && method.getReturnType().getAllInvolvedRawTypes().stream()
                    .flatMap(returned -> Stream.concat(Stream.of(returned), DddLayeringRulesTest.portsOf(returned)))
                    .anyMatch(type -> isAPortOfTheContextOf(type, method.getOwner())));

    @ArchTest
    static final ArchRule wiring_never_drives_a_use_case = noClasses()
            .that(WIRING_CODE)
            .should().accessTargetWhere(A_MEMBER_OF_AN_APPLICATION_SERVICE)
            .because("backend.md, Application: a configuration class only wires beans; a use case is driven by a named driving adapter "
                    + "(a controller, a scheduler, a listener, a startup listener in infrastructure/startup), never from a @Bean method, its lambda, "
                    + "its method reference or its anonymous class, where no rule about driving adapters would see it");

    @ArchTest
    static final ArchRule infrastructure_methods_build_no_port_on_a_use_case = methods()
            .that(RETURN_A_PORT_OF_THEIR_CONTEXT)
            .should(notReachAnApplicationServiceDirectlyOrThroughTheInfrastructureOfTheirContext())
            .because("backend.md, Application: a lambda or method reference a @Bean or other infrastructure method returns for a port is a driven adapter too, and a driven "
                    + "adapter implements its port on the domain and its technology, never on a use case");

    @Nested
    @DisplayName("Given planted configurations that wire beans with lambdas, method references and anonymous classes")
    class GivenPlantedWiring {

        private static JavaClasses planted;

        @BeforeAll
        static void plantWiring(@TempDir Path folder) throws IOException {
            planted = PlantedClasses.compiled(folder, Map.ofEntries(
                    planted("planteda.domain.Gift", "public record Gift(long amount) { public boolean isLarge() { return amount > 1000; } }"),
                    planted("planteda.domain.GiftPolicy", "public interface GiftPolicy { boolean refuses(Gift gift); }"),
                    planted("planteda.application.GiftPairing", "public interface GiftPairing { void pair(); }"),
                    planted("planteda.application.SpecificPairing", "public interface SpecificPairing extends GiftPairing {}"),
                    planted("planteda.application.AbstractGiftPairing", "public abstract class AbstractGiftPairing { public abstract void pair(); }"),
                    planted("planteda.application.PairingService", """
                            @org.springframework.stereotype.Service
                            public class PairingService {
                                public static int pairedCount;
                                public static void pairAll() {}
                                public PairingOutcome outcome() { return new PairingOutcome.Skipped(); }
                                public void pair() {}
                            }
                            """),
                    planted("planteda.application.PairingSettings", "public record PairingSettings(int batch) {}"),
                    planted("planteda.application.PairingOutcome", """
                            public sealed interface PairingOutcome {
                                record Paired(int count) implements PairingOutcome {}
                                record Skipped() implements PairingOutcome {}
                            }
                            """),
                    planted("planteda.application.GiftRegistry", "public interface GiftRegistry { boolean knows(long gift); }"),
                    planted("planteda.infrastructure.pairing.RegistryBreaker", """
                            public class RegistryBreaker implements cz.novanadeje.app.planteda.application.GiftRegistry {
                                public RegistryBreaker(Runnable onTrip) {}
                                public boolean knows(long gift) { return false; }
                            }
                            """),
                    planted("planteda.infrastructure.pairing.OutcomeScheduler", """
                            public class OutcomeScheduler {
                                private final cz.novanadeje.app.planteda.application.PairingService service;
                                public OutcomeScheduler(cz.novanadeje.app.planteda.application.PairingService service) { this.service = service; }
                                public void tick() { runPairing(); }
                                private cz.novanadeje.app.planteda.application.PairingOutcome runPairing() { return service.outcome(); }
                            }
                            """),
                    planted("donations.application.PlantedImportRequests", "public interface PlantedImportRequests { void request(); }"),
                    planted("donations.application.PlantedImportService", """
                            @org.springframework.stereotype.Service
                            public class PlantedImportService { public void importAll() {} }
                            """),
                    planted("donations.infrastructure.fio.FioImportScheduler", """
                            public class FioImportScheduler implements cz.novanadeje.app.donations.application.PlantedImportRequests {
                                private final cz.novanadeje.app.donations.application.PlantedImportService service;
                                public FioImportScheduler(cz.novanadeje.app.donations.application.PlantedImportService service) { this.service = service; }
                                public void request() {}
                            }
                            """),
                    configuration("donations.infrastructure.fio.PlantedImportConfiguration", """
                            @org.springframework.context.annotation.Bean
                            FioImportScheduler scheduler(cz.novanadeje.app.donations.application.PlantedImportService service) {
                                return new FioImportScheduler(service);
                            }
                            """),
                    planted("planteda.application.GiftPairings", """
                            public final class GiftPairings {
                                private GiftPairings() {}
                                public static GiftPairing on(PairingService service) { return () -> {}; }
                            }
                            """),
                    planted("planteda.application.LazyPairings", """
                            public final class LazyPairings {
                                private LazyPairings() {}
                                public static GiftPairing over(java.util.function.Supplier<PairingService> services) { return () -> {}; }
                            }
                            """),
                    planted("planteda.application.PairingCoordinator", """
                            public class PairingCoordinator {
                                public PairingCoordinator(PairingService service) {}
                            }
                            """),
                    planted("planteda.application.PairingWiring", """
                            @org.springframework.stereotype.Component
                            public class PairingWiring {
                                @org.springframework.context.annotation.Bean
                                GiftPairing pairing(PairingService service) { return service::pair; }
                            }
                            """),
                    planted("planteda.infrastructure.pairing.PairingHelper", """
                            public class PairingHelper {
                                private final cz.novanadeje.app.planteda.application.PairingService service;
                                public PairingHelper(cz.novanadeje.app.planteda.application.PairingService service) { this.service = service; }
                                public void run() { service.pair(); }
                            }
                            """),
                    planted("planteda.infrastructure.pairing.PairingScheduler", """
                            public class PairingScheduler {
                                private final cz.novanadeje.app.planteda.application.PairingService service;
                                public PairingScheduler(cz.novanadeje.app.planteda.application.PairingService service) { this.service = service; }
                                public void tick() { service.pair(); }
                            }
                            """),
                    planted("planteda.domain.Gifts", "public interface Gifts { static Object none() { return null; } }"),
                    planted("planteda.infrastructure.persistence.JpaGifts", "public class JpaGifts implements cz.novanadeje.app.planteda.domain.Gifts {}"),
                    planted("planteda.infrastructure.config.LocalPairing", "public interface LocalPairing extends cz.novanadeje.app.planteda.application.GiftPairing {}"),
                    planted("planteda.infrastructure.pairing.PairingFactory", """
                            public class PairingFactory {
                                private final cz.novanadeje.app.planteda.application.PairingService service;
                                public PairingFactory(cz.novanadeje.app.planteda.application.PairingService service) { this.service = service; }
                                public cz.novanadeje.app.planteda.application.GiftPairing pairing() { return service::pair; }
                            }
                            """),
                    planted("planteda.infrastructure.pairing.PairingJob", """
                            public class PairingJob {
                                private final cz.novanadeje.app.planteda.application.PairingService service;
                                private final cz.novanadeje.app.planteda.application.GiftRegistry registry;
                                public PairingJob(cz.novanadeje.app.planteda.application.PairingService service,
                                        cz.novanadeje.app.planteda.application.GiftRegistry registry) {
                                    this.service = service;
                                    this.registry = registry;
                                }
                                public void tick() { service.pair(); }
                                public cz.novanadeje.app.planteda.application.GiftRegistry registry() { return registry; }
                            }
                            """),
                    planted("planteda.infrastructure.pairing.OptionalPairings", """
                            public class OptionalPairings {
                                private final cz.novanadeje.app.planteda.application.PairingService service;
                                public OptionalPairings(cz.novanadeje.app.planteda.application.PairingService service) { this.service = service; }
                                public java.util.Optional<cz.novanadeje.app.planteda.application.GiftPairing> pairing() { return java.util.Optional.of(service::pair); }
                            }
                            """),
                    planted("planteda.infrastructure.mail.GiftMailer", "public class GiftMailer { public static Object send() { return null; } }"),
                    planted("planteda.interfaces.rest.GiftLinks", "public class GiftLinks { public static Object link() { return null; } }"),
                    planted("plantedb.application.OtherService", "public class OtherService { public static Object read() { return null; } }"),
                    configuration("planteda.infrastructure.config.LambdaPairingConfiguration", """
                            @org.springframework.context.annotation.Bean
                            cz.novanadeje.app.planteda.application.GiftPairing pairing(cz.novanadeje.app.planteda.application.PairingService service) {
                                return () -> service.pair();
                            }
                            """),
                    configuration("planteda.infrastructure.config.ReferencePairingConfiguration", """
                            @org.springframework.context.annotation.Bean
                            cz.novanadeje.app.planteda.application.GiftPairing pairing(cz.novanadeje.app.planteda.application.PairingService service) {
                                return service::pair;
                            }
                            """),
                    configuration("planteda.infrastructure.config.HelperPairingConfiguration", """
                            @org.springframework.context.annotation.Bean
                            cz.novanadeje.app.planteda.application.GiftPairing pairing(cz.novanadeje.app.planteda.infrastructure.pairing.PairingHelper helper) {
                                return helper::run;
                            }
                            """),
                    configuration("planteda.infrastructure.config.AbstractPairingConfiguration", """
                            @org.springframework.context.annotation.Bean
                            cz.novanadeje.app.planteda.application.AbstractGiftPairing pairing(cz.novanadeje.app.planteda.infrastructure.pairing.PairingHelper helper) {
                                return new cz.novanadeje.app.planteda.application.AbstractGiftPairing() { public void pair() { helper.run(); } };
                            }
                            """),
                    configuration("planteda.infrastructure.config.FactoryPairingConfiguration", """
                            @org.springframework.context.annotation.Bean
                            cz.novanadeje.app.planteda.application.GiftPairing pairing(cz.novanadeje.app.planteda.application.PairingService service) {
                                return cz.novanadeje.app.planteda.application.GiftPairings.on(service);
                            }
                            """),
                    configuration("planteda.infrastructure.config.StaticPairingConfiguration", """
                            @org.springframework.context.annotation.Bean
                            cz.novanadeje.app.planteda.application.GiftPairing pairing() {
                                return cz.novanadeje.app.planteda.application.PairingService::pairAll;
                            }
                            """),
                    configuration("planteda.infrastructure.config.OwnMethodPairingConfiguration", """
                            private final cz.novanadeje.app.planteda.infrastructure.pairing.PairingHelper helper;
                            private final cz.novanadeje.app.planteda.application.PairingService service;
                            public OwnMethodPairingConfiguration(cz.novanadeje.app.planteda.infrastructure.pairing.PairingHelper helper,
                                    cz.novanadeje.app.planteda.application.PairingService service) {
                                this.helper = helper;
                                this.service = service;
                            }
                            @org.springframework.context.annotation.Bean
                            cz.novanadeje.app.planteda.application.GiftPairing fromField() {
                                return cz.novanadeje.app.planteda.application.GiftPairings.on(service);
                            }
                            @org.springframework.context.annotation.Bean
                            cz.novanadeje.app.planteda.application.GiftPairing pairing() {
                                return this::viaHelper;
                            }
                            @org.springframework.context.annotation.Bean
                            Runnable task() {
                                return new Runnable() { public void run() {} };
                            }
                            private void viaHelper() { helper.run(); }
                            """),
                    configuration("planteda.infrastructure.config.PrecomputedPairingConfiguration", """
                            private final cz.novanadeje.app.planteda.application.GiftPairing precomputed;
                            public PrecomputedPairingConfiguration(cz.novanadeje.app.planteda.infrastructure.pairing.PairingHelper helper) {
                                this.precomputed = helper::run;
                            }
                            @org.springframework.context.annotation.Bean
                            cz.novanadeje.app.planteda.application.GiftPairing pairing() {
                                return precomputed;
                            }
                            """),
                    configuration("planteda.infrastructure.config.PrecomputedFactoryConfiguration", """
                            private final cz.novanadeje.app.planteda.application.GiftPairing precomputed;
                            public PrecomputedFactoryConfiguration(cz.novanadeje.app.planteda.application.PairingService service) {
                                this.precomputed = cz.novanadeje.app.planteda.application.GiftPairings.on(service);
                            }
                            @org.springframework.context.annotation.Bean
                            cz.novanadeje.app.planteda.application.GiftPairing pairing() {
                                return precomputed;
                            }
                            """),
                    configuration("planteda.infrastructure.config.LookupPairingConfiguration", """
                            @org.springframework.context.annotation.Bean
                            cz.novanadeje.app.planteda.application.GiftPairing pairing(org.springframework.context.ApplicationContext context) {
                                return cz.novanadeje.app.planteda.application.GiftPairings.on(context.getBean(cz.novanadeje.app.planteda.application.PairingService.class));
                            }
                            """),
                    configuration("planteda.infrastructure.config.NamedLookupConfiguration", """
                            @org.springframework.context.annotation.Bean
                            cz.novanadeje.app.planteda.application.GiftPairing pairing(org.springframework.context.ApplicationContext context) {
                                return cz.novanadeje.app.planteda.application.GiftPairings.on(
                                        (cz.novanadeje.app.planteda.application.PairingService) context.getBean("pairingService"));
                            }
                            """),
                    configuration("planteda.infrastructure.config.LazyFactoryConfiguration", """
                            private final cz.novanadeje.app.planteda.application.GiftPairing pairing;
                            public LazyFactoryConfiguration(org.springframework.beans.factory.ObjectProvider<cz.novanadeje.app.planteda.application.PairingService> services) {
                                this.pairing = cz.novanadeje.app.planteda.application.LazyPairings.over(services::getObject);
                            }
                            @org.springframework.context.annotation.Bean
                            cz.novanadeje.app.planteda.application.GiftPairing pairing() {
                                return pairing;
                            }
                            """),
                    planted("planteda.infrastructure.config.PairingBase", """
                            public abstract class PairingBase {
                                protected final cz.novanadeje.app.planteda.application.PairingService service;
                                protected final cz.novanadeje.app.planteda.application.PairingSettings settings;
                                protected PairingBase(cz.novanadeje.app.planteda.application.PairingService service,
                                        cz.novanadeje.app.planteda.application.PairingSettings settings) {
                                    this.service = service;
                                    this.settings = settings;
                                }
                            }
                            """),
                    planted("planteda.infrastructure.config.InheritingConfiguration", """
                            @org.springframework.context.annotation.Configuration(proxyBeanMethods = false)
                            public class InheritingConfiguration extends PairingBase {
                                public InheritingConfiguration(cz.novanadeje.app.planteda.application.PairingService service,
                                        cz.novanadeje.app.planteda.application.PairingSettings settings) {
                                    super(service, settings);
                                }
                                @org.springframework.context.annotation.Bean
                                cz.novanadeje.app.planteda.domain.GiftPolicy policy() {
                                    return gift -> gift.amount() > settings.batch();
                                }
                            }
                            """),
                    planted("planteda.infrastructure.pairing.CachedRegistry", """
                            public class CachedRegistry {
                                private cz.novanadeje.app.planteda.application.GiftRegistry cached;
                                public cz.novanadeje.app.planteda.application.GiftRegistry registry() {
                                    if (cached == null) {
                                        cached = gift -> false;
                                    }
                                    return cached;
                                }
                            }
                            """),
                    configuration("planteda.infrastructure.config.SeveralBeansConfiguration", """
                            private final cz.novanadeje.app.planteda.application.PairingService service;
                            private final cz.novanadeje.app.planteda.application.PairingSettings settings;
                            public SeveralBeansConfiguration(cz.novanadeje.app.planteda.application.PairingService service,
                                    cz.novanadeje.app.planteda.application.PairingSettings settings) {
                                this.service = service;
                                this.settings = settings;
                            }
                            @org.springframework.context.annotation.Bean
                            cz.novanadeje.app.planteda.infrastructure.pairing.PairingScheduler scheduler() {
                                return new cz.novanadeje.app.planteda.infrastructure.pairing.PairingScheduler(service);
                            }
                            @org.springframework.context.annotation.Bean
                            cz.novanadeje.app.planteda.domain.GiftPolicy policy() {
                                return gift -> gift.amount() > settings.batch();
                            }
                            """),
                    configuration("planteda.infrastructure.config.ProviderPairingConfiguration", """
                            @org.springframework.context.annotation.Bean
                            cz.novanadeje.app.planteda.application.GiftPairing pairing(
                                    org.springframework.beans.factory.ObjectProvider<cz.novanadeje.app.planteda.application.PairingService> services) {
                                return cz.novanadeje.app.planteda.application.GiftPairings.on(services.getObject());
                            }
                            """),
                    configuration("planteda.infrastructure.config.BreakerConfiguration", """
                            @org.springframework.context.annotation.Bean
                            cz.novanadeje.app.planteda.infrastructure.pairing.RegistryBreaker breaker(cz.novanadeje.app.planteda.infrastructure.pairing.PairingHelper helper) {
                                return new cz.novanadeje.app.planteda.infrastructure.pairing.RegistryBreaker(helper::run);
                            }
                            """),
                    configuration("planteda.infrastructure.config.ExtendedPortConfiguration", """
                            @org.springframework.context.annotation.Bean
                            LocalPairing pairing(cz.novanadeje.app.planteda.infrastructure.pairing.PairingHelper helper) {
                                return helper::run;
                            }
                            """),
                    configuration("planteda.infrastructure.config.ConstructorConfiguration", """
                            public ConstructorConfiguration(cz.novanadeje.app.planteda.application.PairingService service) {
                                service.pair();
                            }
                            """),
                    configuration("planteda.infrastructure.config.GiftsLambdaConfiguration", """
                            @org.springframework.context.annotation.Bean
                            java.util.function.Supplier<Object> gifts() {
                                return () -> cz.novanadeje.app.planteda.domain.Gifts.none();
                            }
                            """),
                    configuration("planteda.infrastructure.config.AnonymousTaskConfiguration", """
                            @org.springframework.context.annotation.Bean
                            Runnable task(cz.novanadeje.app.planteda.application.PairingService service) {
                                return new Runnable() { public void run() { service.pair(); } };
                            }
                            """),
                    configuration("planteda.infrastructure.config.NestedLambdaConfiguration", """
                            @org.springframework.context.annotation.Bean
                            java.util.function.Supplier<Runnable> task(cz.novanadeje.app.planteda.application.PairingService service) {
                                return () -> () -> service.pair();
                            }
                            """),
                    configuration("planteda.infrastructure.config.StartupConfiguration", """
                            @org.springframework.context.annotation.Bean
                            Object marker(cz.novanadeje.app.planteda.application.PairingService service) {
                                service.pair();
                                return new Object();
                            }
                            """),
                    configuration("planteda.infrastructure.config.CountingConfiguration", """
                            @org.springframework.context.annotation.Bean
                            java.util.function.IntSupplier paired() {
                                return () -> cz.novanadeje.app.planteda.application.PairingService.pairedCount;
                            }
                            """),
                    planted("planteda.infrastructure.config.LiteComponent", """
                            @org.springframework.stereotype.Component
                            public class LiteComponent {
                                @org.springframework.context.annotation.Bean
                                Runnable task(cz.novanadeje.app.planteda.application.PairingService service) {
                                    return service::pair;
                                }
                            }
                            """),
                    configuration("planteda.infrastructure.config.WiringConfiguration", """
                            @org.springframework.context.annotation.Bean
                            cz.novanadeje.app.planteda.infrastructure.pairing.PairingScheduler scheduler(cz.novanadeje.app.planteda.application.PairingService service) {
                                return new cz.novanadeje.app.planteda.infrastructure.pairing.PairingScheduler(service);
                            }
                            @org.springframework.context.annotation.Bean
                            cz.novanadeje.app.planteda.domain.GiftPolicy policy() {
                                return gift -> gift.isLarge();
                            }
                            @org.springframework.context.annotation.Bean
                            cz.novanadeje.app.planteda.application.PairingCoordinator coordinator(cz.novanadeje.app.planteda.application.PairingService service) {
                                return new cz.novanadeje.app.planteda.application.PairingCoordinator(service);
                            }
                            @org.springframework.context.annotation.Bean
                            cz.novanadeje.app.planteda.application.PairingSettings settings() {
                                return new cz.novanadeje.app.planteda.application.PairingSettings(10);
                            }
                            """),
                    configuration("planteda.infrastructure.config.CrossLambdaConfiguration", """
                            @org.springframework.context.annotation.Bean
                            java.util.function.Supplier<Object> other() {
                                return () -> cz.novanadeje.app.plantedb.application.OtherService.read();
                            }
                            """),
                    configuration("planteda.infrastructure.config.CrossReferenceConfiguration", """
                            @org.springframework.context.annotation.Bean
                            java.util.function.Supplier<Object> other() {
                                return cz.novanadeje.app.plantedb.application.OtherService::read;
                            }
                            """),
                    configuration("planteda.infrastructure.config.CrossAnonymousConfiguration", """
                            @org.springframework.context.annotation.Bean
                            java.util.function.Supplier<Object> other() {
                                return new java.util.function.Supplier<Object>() {
                                    public Object get() { return cz.novanadeje.app.plantedb.application.OtherService.read(); }
                                };
                            }
                            """),
                    configuration("planteda.infrastructure.config.UpwardLambdaConfiguration", """
                            @org.springframework.context.annotation.Bean
                            java.util.function.Supplier<Object> link() {
                                return () -> cz.novanadeje.app.planteda.interfaces.rest.GiftLinks.link();
                            }
                            """),
                    configuration("planteda.interfaces.rest.MailingWebConfiguration", """
                            @org.springframework.context.annotation.Bean
                            java.util.function.Supplier<Object> mail() {
                                return cz.novanadeje.app.planteda.infrastructure.mail.GiftMailer::send;
                            }
                            """)));
        }

        @Test
        @DisplayName("when the context rule checks configurations that reach another context in a lambda, a method reference and an anonymous class, then each is reported")
        void should_report_each_cross_context_reach_when_checked_given_lambdas_references_and_anonymous_classes() {
            assertThat(reportOf(DddLayeringRulesTest.bounded_contexts_must_not_depend_on_each_other))
                    .anySatisfy(detail -> assertThat(detail).contains("CrossLambdaConfiguration.other()").contains("OtherService.read()"))
                    .anySatisfy(detail -> assertThat(detail).contains("CrossReferenceConfiguration.other()").contains("OtherService.read()"))
                    .anySatisfy(detail -> assertThat(detail).contains("CrossAnonymousConfiguration$1.get()").contains("OtherService.read()"));
        }

        @Test
        @DisplayName("when the layer rules check an infrastructure configuration whose lambda reaches interfaces and a web configuration whose method reference reaches a mail adapter, then each is reported")
        void should_report_each_layer_breach_when_checked_given_a_lambda_and_a_method_reference() {
            assertThat(reportOf(DddLayeringRulesTest.layers_must_respect_ddd_dependency_rule))
                    .anySatisfy(detail -> assertThat(detail).contains("UpwardLambdaConfiguration.link()").contains("GiftLinks.link()"));
            assertThat(reportOf(DddLayeringRulesTest.rest_controllers_must_not_expose_infrastructure_types))
                    .anySatisfy(detail -> assertThat(detail).contains("MailingWebConfiguration.mail()").contains("GiftMailer.send()"));
        }

        @Test
        @DisplayName("when the persistence port rule checks a configuration whose lambda alone reaches a port a persistence adapter implements, then it is reported")
        void should_report_a_persistence_port_reached_in_a_lambda_when_checked_given_a_planted_configuration() {
            assertThat(reportOf(DddLayeringRulesTest.only_persistence_adapters_use_persistence_ports))
                    .anySatisfy(detail -> assertThat(detail).contains("GiftsLambdaConfiguration.gifts()").contains("planteda.domain.Gifts.none()"));
        }

        @Test
        @DisplayName("when the driven adapter rule checks an anonymous class a @Bean method returns for a port, then it is reported as the adapter it is")
        void should_report_the_anonymous_port_when_checked_given_a_bean_method_returning_one() {
            assertThat(reportOf(DddLayeringRulesTest.driven_adapters_must_not_drive_a_use_case))
                    .anySatisfy(detail -> assertThat(detail).contains("AbstractPairingConfiguration$1").contains("PairingService"));
        }

        @Test
        @DisplayName("when the wiring rule checks configurations, then a call in a lambda, in a nested lambda and in an anonymous class, a method reference, "
                + "a field read in a lambda, a call while wiring, a call in the constructor of a configuration without a @Bean method and method references of @Bean methods in components are reported, and handing a "
                + "service to a scheduler's constructor or a factory, a domain policy lambda and a helper's method reference are not")
        void should_report_every_use_of_an_application_service_when_checked_given_planted_configurations() {
            assertThat(reportOf(wiring_never_drives_a_use_case))
                    .anySatisfy(detail -> assertThat(detail).contains("LambdaPairingConfiguration.pairing(").contains("PairingService.pair()"))
                    .anySatisfy(detail -> assertThat(detail).contains("ReferencePairingConfiguration.pairing(").contains("PairingService.pair()"))
                    .anySatisfy(detail -> assertThat(detail).contains("AnonymousTaskConfiguration$1.run()").contains("PairingService.pair()"))
                    .anySatisfy(detail -> assertThat(detail).contains("NestedLambdaConfiguration.task(").contains("PairingService.pair()"))
                    .anySatisfy(detail -> assertThat(detail).contains("StartupConfiguration.marker(").contains("PairingService.pair()"))
                    .anySatisfy(detail -> assertThat(detail).contains("CountingConfiguration.paired()").contains("PairingService.pairedCount"))
                    .anySatisfy(detail -> assertThat(detail).contains("LiteComponent.task(").contains("PairingService.pair()"))
                    .anySatisfy(detail -> assertThat(detail).contains("PairingWiring.pairing(").contains("PairingService.pair()"))
                    .anySatisfy(detail -> assertThat(detail).contains("ConstructorConfiguration.<init>(").contains("PairingService.pair()"))
                    .noneSatisfy(detail -> assertThat(detail).contains("FactoryPairingConfiguration"))
                    .noneSatisfy(detail -> assertThat(detail).contains("PairingFactory"))
                    .noneSatisfy(detail -> assertThat(detail).contains("WiringConfiguration"))
                    .noneSatisfy(detail -> assertThat(detail).contains("HelperPairingConfiguration"))
                    .noneSatisfy(detail -> assertThat(detail).contains("PairingScheduler"))
                    .noneSatisfy(detail -> assertThat(detail).contains("PairingHelper"));
        }

        @Test
        @DisplayName("when the port rule checks methods, then a port of infrastructure built on a service in a lambda, by a method reference, by a static "
                + "method reference alone, from a service parameter alone, from a provider of a service, from a bean looked up by its class or its name, through a helper, through a method and field "
                + "of its own class, from a field its constructor set by a method reference, a factory or a factory over a provider, inside an Optional, of a port an application sub-interface extends, as an anonymous abstract port, as an interface extending the port, as a concrete adapter handed a helper's method reference and by a plain method of an adapter is reported, and a scheduler, "
                + "a domain policy, a settings record, an application class on a service, a Runnable, a scheduler's helper returning a use case's sealed result, "
                + "a reviewed driving port implementer, a policy reading a field beside a service the "
                + "constructor also stored, in its own class or a base class, a lazily cached port, a driving adapter's getter of a port it was handed and a @Bean method of the application layer are not")
        void should_report_every_port_built_on_a_use_case_when_checked_given_planted_bean_methods() {
            assertThat(reportOf(infrastructure_methods_build_no_port_on_a_use_case))
                    .anySatisfy(detail -> assertThat(detail).contains("LambdaPairingConfiguration.pairing(").contains("PairingService"))
                    .anySatisfy(detail -> assertThat(detail).contains("ReferencePairingConfiguration.pairing(").contains("PairingService"))
                    .anySatisfy(detail -> assertThat(detail).contains("HelperPairingConfiguration.pairing(").contains("through")
                            .contains("PairingHelper").contains("PairingService"))
                    .anySatisfy(detail -> assertThat(detail).contains("AbstractPairingConfiguration.pairing(").contains("PairingService"))
                    .anySatisfy(detail -> assertThat(detail).contains("FactoryPairingConfiguration.pairing(").contains("PairingService"))
                    .anySatisfy(detail -> assertThat(detail).contains("StaticPairingConfiguration.pairing(").contains("PairingService"))
                    .anySatisfy(detail -> assertThat(detail).contains("OwnMethodPairingConfiguration.pairing(").contains("PairingHelper").contains("PairingService"))
                    .anySatisfy(detail -> assertThat(detail).contains("OwnMethodPairingConfiguration.fromField(").contains("PairingService"))
                    .anySatisfy(detail -> assertThat(detail).contains("ProviderPairingConfiguration.pairing(").contains("PairingService"))
                    .anySatisfy(detail -> assertThat(detail).contains("ExtendedPortConfiguration.pairing(").contains("PairingService"))
                    .anySatisfy(detail -> assertThat(detail).contains("PairingFactory.pairing(").contains("PairingService"))
                    .anySatisfy(detail -> assertThat(detail).contains("PrecomputedPairingConfiguration.pairing(").contains("PairingHelper").contains("PairingService"))
                    .anySatisfy(detail -> assertThat(detail).contains("OptionalPairings.pairing(").contains("PairingService"))
                    .anySatisfy(detail -> assertThat(detail).contains("PrecomputedFactoryConfiguration.pairing(").contains("PairingService"))
                    .anySatisfy(detail -> assertThat(detail).contains("LazyFactoryConfiguration.pairing(").contains("PairingService"))
                    .anySatisfy(detail -> assertThat(detail).contains("LookupPairingConfiguration.pairing(").contains("PairingService"))
                    .anySatisfy(detail -> assertThat(detail).contains("NamedLookupConfiguration.pairing(").contains("PairingService"))
                    .noneSatisfy(detail -> assertThat(detail).contains("SeveralBeansConfiguration"))
                    .noneSatisfy(detail -> assertThat(detail).contains("InheritingConfiguration"))
                    .noneSatisfy(detail -> assertThat(detail).contains("CachedRegistry"))
                    .noneSatisfy(detail -> assertThat(detail).contains("PairingJob"))
                    .anySatisfy(detail -> assertThat(detail).contains("BreakerConfiguration.breaker(").contains("PairingHelper").contains("PairingService"))
                    .noneSatisfy(detail -> assertThat(detail).contains("OutcomeScheduler"))
                    .noneSatisfy(detail -> assertThat(detail).contains("PlantedImportConfiguration"))
                    .noneSatisfy(detail -> assertThat(detail).contains("OwnMethodPairingConfiguration.task("))
                    .noneSatisfy(detail -> assertThat(detail).contains("WiringConfiguration"))
                    .noneSatisfy(detail -> assertThat(detail).contains("PairingWiring"))
                    .noneSatisfy(detail -> assertThat(detail).contains("AnonymousTaskConfiguration"))
                    .noneSatisfy(detail -> assertThat(detail).contains("LiteComponent"));
        }

        private static Map.Entry<String, String> configuration(String relativeName, String members) {
            String simpleName = relativeName.substring(relativeName.lastIndexOf('.') + 1);
            return planted(relativeName, "@org.springframework.context.annotation.Configuration(proxyBeanMethods = false)\npublic class "
                    + simpleName + " {\n" + members + "}\n");
        }

        private static Map.Entry<String, String> planted(String relativeName, String body) {
            String className = "cz.novanadeje.app." + relativeName;
            return Map.entry(className, "package " + className.substring(0, className.lastIndexOf('.')) + ";\n" + body);
        }

        private static List<String> reportOf(ArchRule rule) {
            return rule.evaluate(planted).getFailureReport().getDetails();
        }
    }

    private static boolean declaresWiring(JavaClass type) {
        return type.isMetaAnnotatedWith(Configuration.class) || type.getMethods().stream().anyMatch(method -> method.isMetaAnnotatedWith(Bean.class));
    }

    private static Stream<JavaClass> enclosingChainOf(JavaClass type) {
        return Stream.iterate(Optional.of(type), Optional::isPresent, current -> current.flatMap(JavaClass::getEnclosingClass)).map(Optional::orElseThrow);
    }

    private static boolean isAPortOfTheContextOf(JavaClass type, JavaClass owner) {
        return isAbstractType(type)
                && type.getAllSubclasses().stream().noneMatch(implementation -> !isAbstractType(implementation)
                        && DddLayeringRulesTest.layerOf(implementation).filter(layer -> layer.equals("application") || layer.equals("domain")).isPresent())
                && DddLayeringRulesTest.isPortOfTheContextOf(type, owner);
    }

    private static boolean isAbstractType(JavaClass type) {
        return type.isInterface() || type.getModifiers().contains(JavaModifier.ABSTRACT);
    }

    private static ArchCondition<JavaMethod> notReachAnApplicationServiceDirectlyOrThroughTheInfrastructureOfTheirContext() {
        return new ArchCondition<>("not reach " + DddLayeringRulesTest.APPLICATION_SERVICES.getDescription()
                + " through their parameters (type arguments included), their code (lambdas and method references included) with the parameters of what it calls, or the methods and fields "
                + "of their own class it uses, and the class literals it names (for a field it reads, what the code that writes the field calls and references, with those targets' "
                + "parameters), directly or through the infrastructure of their context") {
            @Override
            public void check(JavaMethod method, ConditionEvents events) {
                DddLayeringRulesTest.applicationServicesReachedFrom(typesReachedBy(method), method.getOwner())
                        .forEach(reach -> events.add(SimpleConditionEvent.violated(method, method.getFullName() + " builds a port of its context on " + reach)));
            }
        };
    }

    private static List<JavaClass> typesReachedBy(JavaMethod method) {
        Set<JavaClass> own = new HashSet<>(method.getOwner().getAllRawSuperclasses());
        own.add(method.getOwner());
        List<JavaClass> reached = new ArrayList<>();
        Set<Visit> visited = new HashSet<>();
        Deque<Visit> pending = new ArrayDeque<>(List.of(new Visit(method, false)));
        while (!pending.isEmpty()) {
            Visit visit = pending.poll();
            if (visited.add(visit)) {
                if (!visit.asWriter()) {
                    visit.codeUnit().getParameterTypes().forEach(type -> reached.addAll(type.getAllInvolvedRawTypes()));
                }
                visit.codeUnit().getReferencedClassObjects().forEach(literal -> reached.add(literal.getRawType()));
                for (JavaAccess<?> access : visit.codeUnit().getAccessesFromSelf()) {
                    if (own.contains(access.getTargetOwner())) {
                        followOwnMember(access, visit.asWriter(), pending, reached);
                    } else {
                        reached.add(access.getTargetOwner());
                        reached.addAll(parameterTypesOf(access));
                    }
                }
            }
        }
        return reached;
    }

    private static void followOwnMember(JavaAccess<?> access, boolean asWriter, Deque<Visit> pending, List<JavaClass> reached) {
        access.getTarget().resolveMember().ifPresent(member -> {
            if (member instanceof JavaCodeUnit codeUnit) {
                pending.add(new Visit(codeUnit, asWriter));
            } else if (member instanceof JavaField field && access instanceof JavaFieldAccess read && read.getAccessType() == JavaFieldAccess.AccessType.GET) {
                reached.addAll(field.getType().getAllInvolvedRawTypes());
                field.getAccessesToSelf().stream()
                        .filter(write -> write.getAccessType() == JavaFieldAccess.AccessType.SET)
                        .map(write -> new Visit(write.getOrigin(), true))
                        .forEach(pending::add);
            }
        });
    }

    private static List<JavaClass> parameterTypesOf(JavaAccess<?> access) {
        if (!(access.getTarget() instanceof CodeUnitAccessTarget target)) {
            return List.of();
        }
        return target.resolveMember()
                .map(codeUnit -> codeUnit.getParameterTypes().stream().flatMap(type -> type.getAllInvolvedRawTypes().stream()).toList())
                .orElse(List.of());
    }

    private record Visit(JavaCodeUnit codeUnit, boolean asWriter) {
    }
}
