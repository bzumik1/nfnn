package cz.novanadeje.app.architecture;

import com.tngtech.archunit.base.DescribedPredicate;
import com.tngtech.archunit.core.domain.AccessTarget.CodeUnitAccessTarget;
import com.tngtech.archunit.core.domain.AccessTarget.ConstructorCallTarget;
import com.tngtech.archunit.core.domain.AccessTarget.ConstructorReferenceTarget;
import com.tngtech.archunit.core.domain.AccessTarget.FieldAccessTarget;
import com.tngtech.archunit.core.domain.JavaAccess;
import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.domain.JavaMethod;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchCondition;
import com.tngtech.archunit.lang.ArchRule;
import com.tngtech.archunit.lang.ConditionEvents;
import com.tngtech.archunit.lang.SimpleConditionEvent;
import cz.novanadeje.app.AppApplication;
import cz.novanadeje.app.shared.application.event.DonorSessionsEnded;
import cz.novanadeje.app.shared.application.event.MailDeliveryFailed;
import cz.novanadeje.app.shared.application.event.MailDeliverySucceeded;
import cz.novanadeje.app.shared.application.event.StoredDataChanged;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.event.ApplicationEventMulticaster;
import org.springframework.context.event.EventListener;
import org.springframework.data.domain.AbstractAggregateRoot;
import org.springframework.data.domain.AfterDomainEventPublication;
import org.springframework.data.domain.DomainEvents;

import java.io.IOException;
import java.nio.file.Path;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import static cz.novanadeje.app.architecture.MethodAccesses.callsOrReferences;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.classes;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.methods;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noMethods;
import static org.assertj.core.api.Assertions.assertThat;

@AnalyzeClasses(
        packagesOf = AppApplication.class,
        importOptions = ImportOption.DoNotIncludeTests.class
)
class EventPublisherRulesTest {

    private static final String APPLICATION = "..application..";
    private static final String STORED_DATA_CHANGED = "a live hint that says only which feed to read again, no business fact: the persistence adapters "
            + "that save or delete what a feed shows publish it, so every writer of those tables, present or future, hints, and the import "
            + "scheduler when a run ends, after its in-progress flags are cleared (docs/system-overview.md, Live updates)";
    private static final String DONOR_SESSIONS_ENDED = "published with the bulk revocation in revokeAllOf, whose one caller is DeviceSignOuts.endAllOf "
            + "(DeviceSignOutRulesTest); a leftover from before that single entry point, which #1062 moves into DeviceSignOuts, dropping this entry";
    private static final String MAIL_DELIVERY = "only the observed sender sees whether the mail server took a message, the outcome of the "
            + "technology call itself, which the mail alert counts";
    private static final Map<Class<?>, InfrastructurePublishers> INFRASTRUCTURE_EVENTS = Map.of(
            StoredDataChanged.class, new InfrastructurePublishers(STORED_DATA_CHANGED, Set.of(
                    "cz.novanadeje.app.donations.infrastructure.persistence.JpaDonationRepository",
                    "cz.novanadeje.app.donations.infrastructure.persistence.JpaBankPaymentRepository",
                    "cz.novanadeje.app.donations.infrastructure.persistence.JpaDonorRecordRepository",
                    "cz.novanadeje.app.donations.infrastructure.persistence.JpaSymbolClaimRepository",
                    "cz.novanadeje.app.donations.infrastructure.fio.FioImportScheduler")),
            DonorSessionsEnded.class, new InfrastructurePublishers(DONOR_SESSIONS_ENDED, Set.of(
                    "cz.novanadeje.app.donors.infrastructure.persistence.JpaRefreshTokenRepository")),
            MailDeliveryFailed.class, new InfrastructurePublishers(MAIL_DELIVERY, Set.of(
                    "cz.novanadeje.app.shared.infrastructure.mail.ObservedMailSender")),
            MailDeliverySucceeded.class, new InfrastructurePublishers(MAIL_DELIVERY, Set.of(
                    "cz.novanadeje.app.shared.infrastructure.mail.ObservedMailSender")));
    private static final Map<String, Set<String>> SITE_PUBLISHERS = publishersOf(INFRASTRUCTURE_EVENTS);

    private static final DescribedPredicate<JavaClass> EVENT = DescribedPredicate.describe(
            "an event (a top-level record of an application event package or a package below one)",
            type -> type.isRecord() && type.isTopLevelClass()
                    && type.getPackageName().matches("cz\\.novanadeje\\.app\\.[^.]+\\.application\\.event(\\..+)?"));
    private static final DescribedPredicate<JavaAccess<?>> PUBLISHING = callsOrReferences("", ApplicationEventPublisher.class, "publishEvent"::equals)
            .or(callsOrReferences("", ApplicationEventMulticaster.class, "multicastEvent"::equals))
            .as("publish an event (ApplicationEventPublisher.publishEvent, the application context's included, or ApplicationEventMulticaster.multicastEvent)");

    @ArchTest
    static final ArchRule events_are_built_outside_application_only_by_their_listed_adapters = eventsBuiltOutsideApplicationOnlyBy(SITE_PUBLISHERS);

    @ArchTest
    static final ArchRule events_are_published_outside_application_only_by_their_listed_adapters = eventsPublishedOutsideApplicationOnlyBy(SITE_PUBLISHERS);

    @ArchTest
    static final ArchRule listeners_outside_application_publish_nothing_by_their_return = methods()
            .that().areMetaAnnotatedWith(EventListener.class)
            .and().areDeclaredInClassesThat().resideOutsideOfPackage(APPLICATION)
            .should().haveRawReturnType(void.class)
            .because("backend.md, Contexts and layers: Spring publishes whatever an event listener returns as a new event, which would publish "
                    + "a business event from infrastructure unseen by the publishing rules");

    @ArchTest
    static final ArchRule no_class_publishes_through_spring_data_domain_events = noMethods()
            .should().beMetaAnnotatedWith(DomainEvents.class)
            .orShould().beMetaAnnotatedWith(AfterDomainEventPublication.class)
            .because("backend.md, Contexts and layers: Spring Data publishes an entity's domain events on save, from the persistence adapter, "
                    + "so a business event would leave infrastructure unseen by the publishing rules");

    @ArchTest
    static final ArchRule no_class_is_a_spring_data_aggregate_root = noClasses()
            .should().beAssignableTo(AbstractAggregateRoot.class)
            .because("backend.md, Contexts and layers: Spring Data publishes an AbstractAggregateRoot's registered events on save, from the "
                    + "persistence adapter, so a business event would leave infrastructure unseen by the publishing rules");

    @Test
    @DisplayName("Given the events infrastructure may publish, when the build rule checks the site without the list, then every listed adapter is still reported for every listed event, so the list names no adapter or event that no longer needs it")
    void should_report_every_listed_build_when_checked_without_the_list_given_the_site() {
        List<String> details = eventsBuiltOutsideApplicationOnlyBy(Map.of()).evaluate(site()).getFailureReport().getDetails();

        INFRASTRUCTURE_EVENTS.forEach((event, allowed) -> assertThat(allowed.publishers()).allSatisfy(publisher -> assertThat(details)
                .anySatisfy(detail -> assertThat(detail).startsWith(publisher + " builds or obtains " + event.getName() + " "))));
    }

    @Test
    @DisplayName("Given the adapters that may publish, when the publish rule checks the site without the list, then each is still reported, so the list names no adapter that no longer publishes")
    void should_report_every_listed_publisher_when_checked_without_the_list_given_the_site() {
        List<String> details = eventsPublishedOutsideApplicationOnlyBy(Map.of()).evaluate(site()).getFailureReport().getDetails();

        assertThat(SITE_PUBLISHERS.keySet()).allSatisfy(publisher -> assertThat(details).anySatisfy(detail -> assertThat(detail).startsWith(publisher + " publishes in ")));
    }

    @Test
    @DisplayName("Given the events infrastructure may publish, when their reasons are read, then each names why, so no event is listed without one")
    void should_name_a_reason_for_every_event_when_read_given_the_list() {
        assertThat(INFRASTRUCTURE_EVENTS.values()).allSatisfy(allowed -> assertThat(allowed.reason()).isNotBlank());
    }

    @Nested
    @DisplayName("Given planted adapters that build, publish and return events")
    class GivenPlantedPublishers {

        private static final Map<String, Set<String>> PLANTED_PUBLISHERS = Map.of(
                "cz.novanadeje.app.planteda.infrastructure.persistence.JpaGifts", Set.of("cz.novanadeje.app.planteda.application.event.GiftsChanged"),
                "cz.novanadeje.app.planteda.infrastructure.persistence.JpaOrders", Set.of("cz.novanadeje.app.planteda.application.event.GiftsChanged"),
                "cz.novanadeje.app.planteda.infrastructure.persistence.JpaPayments", Set.of("cz.novanadeje.app.planteda.application.event.GiftsChanged"),
                "cz.novanadeje.app.planteda.infrastructure.persistence.JpaRefunds", Set.of("cz.novanadeje.app.planteda.application.event.GiftsChanged"));

        private static JavaClasses planted;

        @BeforeAll
        static void plantPublishers(@TempDir Path folder) throws IOException {
            planted = PlantedClasses.compiled(folder, Map.ofEntries(
                    planted("planteda.application.event.GiftPaired", "public record GiftPaired(long amount) {}"),
                    planted("planteda.application.event.GiftsChanged", """
                            public record GiftsChanged(Feed feed) {
                                public static GiftsChanged of(Feed feed) { return new GiftsChanged(feed); }
                                public record Feed(String name) {}
                            }
                            """),
                    planted("planteda.application.GiftEvents", """
                            public final class GiftEvents {
                                private GiftEvents() {}
                                public static final cz.novanadeje.app.planteda.application.event.GiftPaired PAIRED =
                                        new cz.novanadeje.app.planteda.application.event.GiftPaired(0);
                                public static cz.novanadeje.app.planteda.application.event.GiftPaired paired() {
                                    return new cz.novanadeje.app.planteda.application.event.GiftPaired(1);
                                }
                                public static java.util.Optional<cz.novanadeje.app.planteda.application.event.GiftPaired> maybePaired() {
                                    return java.util.Optional.of(paired());
                                }
                            }
                            """),
                    planted("planteda.application.PairingService", """
                            public class PairingService {
                                private final org.springframework.context.ApplicationEventPublisher events;
                                public PairingService(org.springframework.context.ApplicationEventPublisher events) { this.events = events; }
                                public void pair() { events.publishEvent(new cz.novanadeje.app.planteda.application.event.GiftPaired(1)); }
                                @org.springframework.context.event.EventListener
                                public cz.novanadeje.app.planteda.application.event.GiftPaired on(cz.novanadeje.app.planteda.application.event.GiftsChanged changed) {
                                    return new cz.novanadeje.app.planteda.application.event.GiftPaired(2);
                                }
                            }
                            """),
                    planted("planteda.infrastructure.persistence.JpaGifts", """
                            public class JpaGifts {
                                private final org.springframework.context.ApplicationEventPublisher events;
                                public JpaGifts(org.springframework.context.ApplicationEventPublisher events) { this.events = events; }
                                public void save() {
                                    events.publishEvent(cz.novanadeje.app.planteda.application.event.GiftsChanged.of(
                                            new cz.novanadeje.app.planteda.application.event.GiftsChanged.Feed("gifts")));
                                }
                            }
                            """),
                    planted("planteda.infrastructure.persistence.JpaOrders", """
                            public class JpaOrders {
                                private final org.springframework.context.ApplicationEventPublisher events;
                                public JpaOrders(org.springframework.context.ApplicationEventPublisher events) { this.events = events; }
                                public void save() {
                                    events.publishEvent(new cz.novanadeje.app.planteda.application.event.GiftsChanged(null));
                                    events.publishEvent(new cz.novanadeje.app.planteda.application.event.GiftPaired(1));
                                }
                            }
                            """),
                    planted("planteda.infrastructure.pairing.ConstructingAdapter", """
                            public class ConstructingAdapter {
                                Object event() { return new cz.novanadeje.app.planteda.application.event.GiftPaired(1); }
                            }
                            """),
                    planted("planteda.infrastructure.pairing.ReferencingAdapter", """
                            public class ReferencingAdapter {
                                java.util.function.LongFunction<Object> events() { return cz.novanadeje.app.planteda.application.event.GiftPaired::new; }
                            }
                            """),
                    planted("planteda.infrastructure.pairing.HelperAdapter", """
                            public class HelperAdapter {
                                Object event() { return cz.novanadeje.app.planteda.application.GiftEvents.paired(); }
                            }
                            """),
                    planted("planteda.application.event.live.GiftLive", "public record GiftLive(String feed) {}"),
                    planted("planteda.infrastructure.pairing.OptionalHelperAdapter", """
                            public class OptionalHelperAdapter {
                                Object event() { return cz.novanadeje.app.planteda.application.GiftEvents.maybePaired(); }
                            }
                            """),
                    planted("planteda.infrastructure.pairing.ConstantAdapter", """
                            public class ConstantAdapter {
                                Object event() { return cz.novanadeje.app.planteda.application.GiftEvents.PAIRED; }
                            }
                            """),
                    planted("planteda.infrastructure.pairing.FactoryReferenceAdapter", """
                            public class FactoryReferenceAdapter {
                                java.util.function.Supplier<Object> events() { return cz.novanadeje.app.planteda.application.GiftEvents::paired; }
                            }
                            """),
                    planted("planteda.infrastructure.pairing.LiveAdapter", """
                            public class LiveAdapter {
                                Object event() { return new cz.novanadeje.app.planteda.application.event.live.GiftLive("gifts"); }
                            }
                            """),
                    planted("planteda.infrastructure.persistence.JpaPayments", """
                            public class JpaPayments {
                                private final org.springframework.context.ApplicationEventPublisher events;
                                public JpaPayments(org.springframework.context.ApplicationEventPublisher events) { this.events = events; }
                                public void relay(cz.novanadeje.app.planteda.application.event.GiftPaired paired) { events.publishEvent(paired); }
                            }
                            """),
                    planted("planteda.infrastructure.persistence.JpaRefunds", """
                            public class JpaRefunds {
                                private final org.springframework.context.ApplicationEventPublisher events;
                                public JpaRefunds(org.springframework.context.ApplicationEventPublisher events) { this.events = events; }
                                public void relay(java.util.Optional<cz.novanadeje.app.planteda.application.event.GiftPaired> paired) {
                                    paired.ifPresent(events::publishEvent);
                                }
                            }
                            """),
                    planted("planteda.infrastructure.pairing.LambdaAdapter", """
                            public class LambdaAdapter {
                                java.util.function.Supplier<Object> events() {
                                    return () -> new cz.novanadeje.app.planteda.application.event.GiftPaired(1);
                                }
                            }
                            """),
                    planted("planteda.infrastructure.pairing.FeedsAdapter", """
                            public class FeedsAdapter {
                                Object feed() { return new cz.novanadeje.app.planteda.application.event.GiftsChanged.Feed("gifts"); }
                            }
                            """),
                    planted("planteda.interfaces.rest.GiftController", """
                            public class GiftController {
                                Object event() { return new cz.novanadeje.app.planteda.application.event.GiftPaired(1); }
                            }
                            """),
                    planted("planteda.infrastructure.relay.PublisherRelay", """
                            public class PublisherRelay {
                                void relay(org.springframework.context.ApplicationEventPublisher events, Object event) { events.publishEvent(event); }
                            }
                            """),
                    planted("planteda.infrastructure.relay.ContextRelay", """
                            public class ContextRelay {
                                void relay(org.springframework.context.ApplicationContext context, Object event) { context.publishEvent(event); }
                            }
                            """),
                    planted("planteda.infrastructure.relay.ReferenceRelay", """
                            public class ReferenceRelay {
                                java.util.function.Consumer<Object> relay(org.springframework.context.ApplicationEventPublisher events) {
                                    return events::publishEvent;
                                }
                            }
                            """),
                    planted("planteda.infrastructure.relay.MulticastRelay", """
                            public class MulticastRelay {
                                void relay(org.springframework.context.event.ApplicationEventMulticaster multicaster, Object event) {
                                    multicaster.multicastEvent(new org.springframework.context.PayloadApplicationEvent<>(this, event));
                                }
                            }
                            """),
                    planted("planteda.infrastructure.events.GiftListeners", """
                            public class GiftListeners {
                                @org.springframework.context.event.EventListener
                                public Object onChanged(cz.novanadeje.app.planteda.application.event.GiftsChanged changed) { return null; }
                                @org.springframework.transaction.event.TransactionalEventListener
                                public java.util.List<Object> onPaired(cz.novanadeje.app.planteda.application.event.GiftPaired paired) { return java.util.List.of(); }
                                @org.springframework.context.event.EventListener
                                public void onQuietly(cz.novanadeje.app.planteda.application.event.GiftPaired paired) {}
                            }
                            """),
                    planted("planteda.infrastructure.persistence.GiftRow", """
                            public class GiftRow {
                                @org.springframework.data.domain.DomainEvents
                                java.util.List<Object> events() { return java.util.List.of(); }
                                @org.springframework.data.domain.AfterDomainEventPublication
                                void clear() {}
                            }
                            """),
                    planted("planteda.infrastructure.persistence.OrderRow",
                            "public class OrderRow extends org.springframework.data.domain.AbstractAggregateRoot<OrderRow> {}")));
        }

        @Test
        @DisplayName("when the build rule checks them, then an adapter building or obtaining a business event by its constructor, a constructor reference, a "
                + "helper, a helper's Optional, a helper's constant, a factory method reference and a lambda, an event of a package below an event package, a listed adapter building an event it is not listed for and a controller are reported, and a listed adapter's own "
                + "event, a value nested in an event and the application are not")
        void should_report_every_unlisted_build_when_checked_given_planted_adapters() {
            List<String> details = eventsBuiltOutsideApplicationOnlyBy(PLANTED_PUBLISHERS).evaluate(planted).getFailureReport().getDetails();

            assertThat(details)
                    .anySatisfy(detail -> assertThat(detail).startsWith("cz.novanadeje.app.planteda.infrastructure.pairing.ConstructingAdapter builds or obtains").contains("GiftPaired"))
                    .anySatisfy(detail -> assertThat(detail).startsWith("cz.novanadeje.app.planteda.infrastructure.pairing.ReferencingAdapter builds or obtains").contains("GiftPaired"))
                    .anySatisfy(detail -> assertThat(detail).startsWith("cz.novanadeje.app.planteda.infrastructure.pairing.HelperAdapter builds or obtains").contains("GiftEvents.paired()"))
                    .anySatisfy(detail -> assertThat(detail).startsWith("cz.novanadeje.app.planteda.infrastructure.pairing.LambdaAdapter builds or obtains").contains("GiftPaired"))
                    .anySatisfy(detail -> assertThat(detail).startsWith("cz.novanadeje.app.planteda.infrastructure.persistence.JpaOrders builds or obtains").contains("GiftPaired"))
                    .anySatisfy(detail -> assertThat(detail).startsWith("cz.novanadeje.app.planteda.interfaces.rest.GiftController builds or obtains").contains("GiftPaired"))
                    .anySatisfy(detail -> assertThat(detail).startsWith("cz.novanadeje.app.planteda.infrastructure.pairing.OptionalHelperAdapter builds or obtains").contains("GiftEvents.maybePaired()"))
                    .anySatisfy(detail -> assertThat(detail).startsWith("cz.novanadeje.app.planteda.infrastructure.pairing.ConstantAdapter builds or obtains").contains("GiftEvents.PAIRED"))
                    .anySatisfy(detail -> assertThat(detail).startsWith("cz.novanadeje.app.planteda.infrastructure.pairing.FactoryReferenceAdapter builds or obtains").contains("GiftEvents.paired()"))
                    .anySatisfy(detail -> assertThat(detail).startsWith("cz.novanadeje.app.planteda.infrastructure.pairing.LiveAdapter builds or obtains").contains("GiftLive"))
                    .noneSatisfy(detail -> assertThat(detail).contains("GiftsChanged"))
                    .noneSatisfy(detail -> assertThat(detail).contains("GiftEvents builds"))
                    .noneSatisfy(detail -> assertThat(detail).contains("JpaPayments"))
                    .noneSatisfy(detail -> assertThat(detail).contains("JpaGifts"))
                    .noneSatisfy(detail -> assertThat(detail).contains("FeedsAdapter"))
                    .noneSatisfy(detail -> assertThat(detail).contains("PairingService"));
        }

        @Test
        @DisplayName("when the publish rule checks them, then an unlisted adapter publishing through the publisher, the application context, a method "
                + "reference and the multicaster is reported, a listed adapter that handles an event it is not listed for, as a parameter, inside an "
                + "Optional or by building it, is reported, and a listed adapter's own event and the application are not")
        void should_report_every_unlisted_publisher_when_checked_given_planted_relays() {
            List<String> details = eventsPublishedOutsideApplicationOnlyBy(PLANTED_PUBLISHERS).evaluate(planted).getFailureReport().getDetails();

            assertThat(details)
                    .anySatisfy(detail -> assertThat(detail).contains("PublisherRelay.relay(").contains("publishEvent"))
                    .anySatisfy(detail -> assertThat(detail).contains("ContextRelay.relay(").contains("publishEvent"))
                    .anySatisfy(detail -> assertThat(detail).contains("ReferenceRelay.relay(").contains("publishEvent"))
                    .anySatisfy(detail -> assertThat(detail).contains("MulticastRelay.relay(").contains("multicastEvent"))
                    .anySatisfy(detail -> assertThat(detail).startsWith("cz.novanadeje.app.planteda.infrastructure.persistence.JpaPayments publishes and depends on")
                            .contains("GiftPaired").contains("JpaPayments.relay("))
                    .anySatisfy(detail -> assertThat(detail).startsWith("cz.novanadeje.app.planteda.infrastructure.persistence.JpaRefunds publishes and depends on")
                            .contains("GiftPaired").contains("JpaRefunds.relay("))
                    .anySatisfy(detail -> assertThat(detail).startsWith("cz.novanadeje.app.planteda.infrastructure.persistence.JpaOrders publishes and depends on")
                            .contains("GiftPaired"))
                    .noneSatisfy(detail -> assertThat(detail).contains("JpaGifts"))
                    .noneSatisfy(detail -> assertThat(detail).contains("GiftsChanged,"))
                    .noneSatisfy(detail -> assertThat(detail).contains("PairingService"));
        }

        @Test
        @DisplayName("when the listener rule checks them, then an infrastructure listener returning a value, a transactional one too, is reported, and a "
                + "void listener and an application listener are not")
        void should_report_every_returning_infrastructure_listener_when_checked_given_planted_listeners() {
            assertThat(reportOf(listeners_outside_application_publish_nothing_by_their_return))
                    .anySatisfy(detail -> assertThat(detail).contains("GiftListeners.onChanged("))
                    .anySatisfy(detail -> assertThat(detail).contains("GiftListeners.onPaired("))
                    .noneSatisfy(detail -> assertThat(detail).contains("onQuietly"))
                    .noneSatisfy(detail -> assertThat(detail).contains("PairingService"));
        }

        @Test
        @DisplayName("when the Spring Data rules check them, then a @DomainEvents method, an @AfterDomainEventPublication method and an AbstractAggregateRoot are reported")
        void should_report_spring_data_domain_events_when_checked_given_planted_rows() {
            assertThat(reportOf(no_class_publishes_through_spring_data_domain_events))
                    .anySatisfy(detail -> assertThat(detail).contains("GiftRow.events()"))
                    .anySatisfy(detail -> assertThat(detail).contains("GiftRow.clear()"));
            assertThat(reportOf(no_class_is_a_spring_data_aggregate_root)).anySatisfy(detail -> assertThat(detail).contains("OrderRow"));
        }

        private static Map.Entry<String, String> planted(String relativeName, String body) {
            String className = "cz.novanadeje.app." + relativeName;
            return Map.entry(className, "package " + className.substring(0, className.lastIndexOf('.')) + ";\n" + body);
        }

        private static List<String> reportOf(ArchRule rule) {
            return rule.evaluate(planted).getFailureReport().getDetails();
        }
    }

    private static ArchRule eventsBuiltOutsideApplicationOnlyBy(Map<String, Set<String>> eventsByPublisher) {
        return classes()
                .that().resideOutsideOfPackage(APPLICATION)
                .should(buildOnlyTheEventsListedFor(eventsByPublisher))
                .because("backend.md, Contexts and layers: a business event is built and published by the application layer; an adapter builds "
                        + "only the technical events listed for it, each with its reason in docs/system-overview.md");
    }

    private static ArchRule eventsPublishedOutsideApplicationOnlyBy(Map<String, Set<String>> eventsByPublisher) {
        return classes()
                .that().resideOutsideOfPackage(APPLICATION)
                .should(publishOnlyIfListedAndHandleNoOtherEvent(eventsByPublisher))
                .because("backend.md, Contexts and layers: a business event is published by the application layer; an adapter publishes only "
                        + "the technical events listed for it, each with its reason in docs/system-overview.md");
    }

    private static ArchCondition<JavaClass> publishOnlyIfListedAndHandleNoOtherEvent(Map<String, Set<String>> eventsByPublisher) {
        return new ArchCondition<>("publish only when listed, and then depend on no event but the listed ones (as a parameter, a field, a return "
                + "value or a type argument such as an Optional of one)") {
            @Override
            public void check(JavaClass type, ConditionEvents events) {
                List<JavaAccess<?>> publishing = type.getAccessesFromSelf().stream().filter(PUBLISHING).toList();
                if (publishing.isEmpty()) {
                    return;
                }
                Set<String> listed = eventsByPublisher.get(type.getName());
                if (listed == null) {
                    publishing.forEach(access -> events.add(SimpleConditionEvent.violated(type, type.getName() + " publishes in " + access.getDescription())));
                    return;
                }
                type.getDirectDependenciesFromSelf().stream()
                        .filter(dependency -> EVENT.test(dependency.getTargetClass()) && !listed.contains(dependency.getTargetClass().getName()))
                        .forEach(dependency -> events.add(SimpleConditionEvent.violated(type, type.getName() + " publishes and depends on "
                                + dependency.getTargetClass().getName() + ", which it is not listed for, in " + dependency.getDescription())));
            }
        };
    }

    private static ArchCondition<JavaClass> buildOnlyTheEventsListedFor(Map<String, Set<String>> eventsByPublisher) {
        return new ArchCondition<>("build or obtain only the events listed for them (by a constructor, a constructor reference, a method or "
                + "method reference returning one, an Optional or other type of one included, or a field holding one)") {
            @Override
            public void check(JavaClass type, ConditionEvents events) {
                Set<String> listed = eventsByPublisher.getOrDefault(type.getName(), Set.of());
                for (JavaAccess<?> access : type.getAccessesFromSelf()) {
                    eventsObtainedBy(access).filter(event -> !listed.contains(event.getName())).distinct().forEach(event -> events.add(SimpleConditionEvent.violated(
                            type, type.getName() + " builds or obtains " + event.getName() + " in " + access.getDescription())));
                }
            }
        };
    }

    private static Stream<JavaClass> eventsObtainedBy(JavaAccess<?> access) {
        return typesObtainedBy(access).filter(EVENT);
    }

    private static Stream<JavaClass> typesObtainedBy(JavaAccess<?> access) {
        if (access.getTarget() instanceof ConstructorCallTarget || access.getTarget() instanceof ConstructorReferenceTarget) {
            return Stream.of(access.getTargetOwner());
        }
        if (access.getTarget() instanceof CodeUnitAccessTarget target) {
            return target.resolveMember()
                    .map(codeUnit -> codeUnit.getReturnType().getAllInvolvedRawTypes().stream())
                    .orElseGet(() -> Stream.of(target.getRawReturnType()));
        }
        if (access.getTarget() instanceof FieldAccessTarget target) {
            return target.resolveMember()
                    .map(field -> field.getType().getAllInvolvedRawTypes().stream())
                    .orElseGet(() -> Stream.of(target.getRawType()));
        }
        return Stream.empty();
    }

    private static Map<String, Set<String>> publishersOf(Map<Class<?>, InfrastructurePublishers> eventsAllowed) {
        return eventsAllowed.entrySet().stream()
                .flatMap(event -> event.getValue().publishers().stream().map(publisher -> Map.entry(publisher, event.getKey().getName())))
                .collect(Collectors.groupingBy(Map.Entry::getKey, Collectors.mapping(Map.Entry::getValue, Collectors.toSet())));
    }

    private static JavaClasses site() {
        return new ClassFileImporter().withImportOption(new ImportOption.DoNotIncludeTests()).importPackagesOf(AppApplication.class);
    }

    private record InfrastructurePublishers(String reason, Collection<String> publishers) {
    }
}
