package cz.novanadeje.app.architecture;

import com.tngtech.archunit.base.DescribedPredicate;
import com.tngtech.archunit.core.domain.JavaAnnotation;
import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.domain.JavaCodeUnit;
import com.tngtech.archunit.core.domain.JavaField;
import com.tngtech.archunit.core.domain.JavaMethod;
import com.tngtech.archunit.core.domain.JavaModifier;
import com.tngtech.archunit.core.domain.JavaParameter;
import com.tngtech.archunit.core.domain.JavaType;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchCondition;
import com.tngtech.archunit.lang.ArchRule;
import cz.novanadeje.app.AppApplication;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.context.ApplicationEvent;
import org.springframework.context.ApplicationListener;
import org.springframework.context.PayloadApplicationEvent;
import org.springframework.context.event.EventListener;
import org.springframework.transaction.event.TransactionalEventListener;

import java.io.IOException;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import static com.tngtech.archunit.core.domain.JavaClass.Predicates.INTERFACES;
import static com.tngtech.archunit.core.domain.JavaClass.Predicates.assignableTo;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.methods;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noCodeUnits;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noFields;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

@AnalyzeClasses(
        packagesOf = AppApplication.class,
        importOptions = ImportOption.DoNotIncludeTests.class
)
class EventListenerRulesTest {

    private static final String SHARED_EVENTS = "cz.novanadeje.app.shared.application.event";

    private static final Map<String, String> PLAIN_LISTENERS = Map.of(
            "cz.novanadeje.app.operations.infrastructure.events.MailDeliveryListener",
            "a send happens inside a transaction that may roll back (the monthly report) or outside any (the @Async senders), and the outage must be kept either way",
            "cz.novanadeje.app.donors.infrastructure.recovery.SecondFactorRecoveryPaymentListener",
            "it turns the factor off in the import's own transaction, so a failure rolls the import back and the next run retries");

    private static final DescribedPredicate<JavaClass> SHARED_EVENT = DescribedPredicate.describe(
            "a top-level record of " + SHARED_EVENTS,
            type -> type.isRecord() && type.isTopLevelClass() && type.getPackageName().equals(SHARED_EVENTS));

    private static final DescribedPredicate<JavaMethod> LISTENING_PLAINLY_TO_A_SHARED_EVENT = DescribedPredicate.describe(
            "listen with a plain @EventListener to an event of " + SHARED_EVENTS,
            method -> method.isMetaAnnotatedWith(EventListener.class) && !method.isMetaAnnotatedWith(TransactionalEventListener.class)
                    && listensToASharedEvent(method));

    private static final DescribedPredicate<JavaMethod> LISTENING_TO_A_SHARED_EVENT = DescribedPredicate.describe(
            "listen to an event of " + SHARED_EVENTS,
            method -> method.isMetaAnnotatedWith(EventListener.class) && listensToASharedEvent(method));

    private static final DescribedPredicate<JavaClass> HEARING_A_SHARED_EVENT = DescribedPredicate.describe(
            SHARED_EVENT.getDescription() + " or a type every shared event is",
            type -> SHARED_EVENT.test(type)
                    || Stream.of(Object.class, Record.class, ApplicationEvent.class, PayloadApplicationEvent.class).anyMatch(type::isEquivalentTo)
                    || type.getAllSubclasses().stream().anyMatch(SHARED_EVENT));

    private static final DescribedPredicate<JavaCodeUnit> TAKING_A_SHARED_EVENT = DescribedPredicate.describe(
            "take a parameter that is or holds " + SHARED_EVENT.getDescription() + ", or hand out a function of one",
            codeUnit -> Stream.concat(
                            codeUnit.getParameters().stream().flatMap(parameter -> parameter.getType().getAllInvolvedRawTypes().stream()),
                            codeUnit.getRawReturnType().isAnnotatedWith(FunctionalInterface.class)
                                    ? typeArgumentsOf(codeUnit.getReturnType())
                                    : Stream.empty())
                    .anyMatch(SHARED_EVENT));

    private static final DescribedPredicate<JavaField> HOLDING_A_SHARED_EVENT = DescribedPredicate.describe(
            "hold " + SHARED_EVENT.getDescription(),
            field -> field.getType().getAllInvolvedRawTypes().stream().anyMatch(SHARED_EVENT));

    @ArchTest
    static final ArchRule shared_events_are_consumed_by_infrastructure_adapters = methods()
            .that(LISTENING_TO_A_SHARED_EVENT)
            .should().beDeclaredInClassesThat().resideInAPackage("..infrastructure..")
            .because("backend.md, Contexts and layers: a listener of a cross-context event is a driving adapter in infrastructure that calls "
                    + "the application with the event's values, so no application service takes a shared event as its API");

    @ArchTest
    static final ArchRule application_code_takes_no_shared_event = noCodeUnits()
            .that().areDeclaredInClassesThat().resideInAPackage("..application..")
            .and().arePublic()
            .should(ArchCondition.from(TAKING_A_SHARED_EVENT))
            .because("backend.md, Contexts and layers: the adapter that hears a cross-context event calls the application with the event's values, "
                    + "so no application API takes a shared event");

    @ArchTest
    static final ArchRule application_values_hold_no_shared_event = noFields()
            .that().areDeclaredInClassesThat().resideInAPackage("..application..")
            .and().doNotHaveModifier(JavaModifier.SYNTHETIC)
            .should(ArchCondition.from(HOLDING_A_SHARED_EVENT))
            .because("backend.md, Contexts and layers: a command or value that wraps a cross-context event would carry the event into the "
                    + "application API all the same");

    @ArchTest
    static final ArchRule shared_events_are_heard_by_their_transaction_phase = methods()
            .that(LISTENING_PLAINLY_TO_A_SHARED_EVENT)
            .should().beDeclaredInClassesThat(DescribedPredicate.describe("are named as plain listeners with their reason",
                    type -> PLAIN_LISTENERS.containsKey(type.getName())))
            .because("backend.md, Contexts and layers: a cross-context event is consumed with @TransactionalEventListener, so its copy or side "
                    + "effect follows the publisher's commit; a plain listener runs even when the publisher rolls back");

    @ArchTest
    static final ArchRule shared_events_are_heard_only_through_annotated_listeners = noClasses()
            .should().dependOnClassesThat(assignableTo(ApplicationListener.class).and(INTERFACES))
            .orShould().callCodeUnitWhere(DescribedPredicate.describe("it takes an ApplicationListener",
                    call -> call.getTarget().getRawParameterTypes().stream()
                            .map(type -> type.isArray() ? type.getComponentType() : type)
                            .anyMatch(type -> type.isInterface() && type.isAssignableTo(ApplicationListener.class))))
            .because("backend.md, Contexts and layers: a listener registered in code (an ApplicationListener bean, a forPayload listener or a "
                    + "lambda added to the context) carries no annotation, so neither its placement nor its transaction phase could be checked");

    @Test
    @DisplayName("Given the plain listeners named with their reason, when they are read, then each exists, so the list names no class that is gone")
    void should_find_every_named_plain_listener_when_read_given_the_list() {
        assertThat(PLAIN_LISTENERS.keySet()).allSatisfy(name -> assertThatCode(() -> Class.forName(name)).doesNotThrowAnyException());
    }

    @Test
    @DisplayName("Given a planted listener of a shared event with a plain @EventListener and one with its transaction phase, when the rule checks them, then only the plain one is reported")
    void should_report_a_plain_listener_of_a_shared_event_when_checked_given_planted_listeners(@TempDir Path folder) throws IOException {
        JavaClasses planted = PlantedClasses.compiled(folder, Map.of("cz.novanadeje.app.planteda.infrastructure.events.PlantedRegistrationListener", """
                package cz.novanadeje.app.planteda.infrastructure.events;

                import cz.novanadeje.app.shared.application.event.DonorRegistered;
                import org.springframework.context.event.EventListener;
                import org.springframework.transaction.event.TransactionPhase;
                import org.springframework.transaction.event.TransactionalEventListener;

                class PlantedRegistrationListener {

                    @EventListener
                    void plainly(DonorRegistered registered) {
                    }

                    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
                    void afterTheCommit(DonorRegistered registered) {
                    }
                }
                """));

        assertThat(shared_events_are_heard_by_their_transaction_phase.evaluate(planted).getFailureReport().getDetails())
                .singleElement().satisfies(detail -> assertThat(detail).contains("plainly"));
    }

    @Test
    @DisplayName("Given planted listeners of a shared event in application and in infrastructure and one of a context's own event, when the placement rule checks them, then only the application listeners of the shared event are reported")
    void should_report_an_application_listener_of_a_shared_event_when_checked_given_planted_listeners(@TempDir Path folder) throws IOException {
        JavaClasses planted = PlantedClasses.compiled(folder, Map.of(
                "cz.novanadeje.app.planteda.application.PlantedRegistrationService", """
                        package cz.novanadeje.app.planteda.application;

                        import cz.novanadeje.app.shared.application.event.DonorRegistered;
                        import cz.novanadeje.app.shared.application.event.MailDeliveryFailed;
                        import org.springframework.context.event.EventListener;
                        import org.springframework.transaction.event.TransactionPhase;
                        import org.springframework.transaction.event.TransactionalEventListener;

                        public class PlantedRegistrationService {

                            @TransactionalEventListener(phase = TransactionPhase.BEFORE_COMMIT)
                            public void beforeTheCommit(DonorRegistered registered) {
                            }

                            @EventListener
                            public void plainly(MailDeliveryFailed failed) {
                            }
                        }
                        """,
                "cz.novanadeje.app.planteda.application.PlantedAlertService", """
                        package cz.novanadeje.app.planteda.application;

                        import cz.novanadeje.app.operations.application.event.OperationalAlertChanged;
                        import org.springframework.transaction.event.TransactionPhase;
                        import org.springframework.transaction.event.TransactionalEventListener;

                        public class PlantedAlertService {

                            @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
                            public void ownEvent(OperationalAlertChanged changed) {
                            }
                        }
                        """,
                "cz.novanadeje.app.planteda.infrastructure.events.PlantedRegistrationListener", """
                        package cz.novanadeje.app.planteda.infrastructure.events;

                        import cz.novanadeje.app.shared.application.event.DonorRegistered;
                        import org.springframework.transaction.event.TransactionPhase;
                        import org.springframework.transaction.event.TransactionalEventListener;

                        class PlantedRegistrationListener {

                            @TransactionalEventListener(phase = TransactionPhase.BEFORE_COMMIT)
                            void adapted(DonorRegistered registered) {
                            }
                        }
                        """));

        assertThat(shared_events_are_consumed_by_infrastructure_adapters.evaluate(planted).getFailureReport().getDetails())
                .hasSize(2)
                .anySatisfy(detail -> assertThat(detail).contains("PlantedRegistrationService.beforeTheCommit"))
                .anySatisfy(detail -> assertThat(detail).contains("PlantedRegistrationService.plainly"));
    }

    @Test
    @DisplayName("Given planted listeners that name a shared event in @EventListener's value or classes or as a payload's type argument, and one that names only framework events, when the plain rule checks them, then each plain one of a shared event is reported and the others are not")
    void should_report_a_plain_listener_naming_a_shared_event_in_its_annotation_or_payload_when_checked_given_planted_listeners(@TempDir Path folder)
            throws IOException {
        JavaClasses planted = PlantedClasses.compiled(folder, Map.of("cz.novanadeje.app.planteda.infrastructure.events.PlantedNamingListener", """
                package cz.novanadeje.app.planteda.infrastructure.events;

                import cz.novanadeje.app.shared.application.event.DonorErased;
                import cz.novanadeje.app.shared.application.event.DonorRegistered;
                import org.springframework.context.ApplicationEvent;
                import org.springframework.context.PayloadApplicationEvent;
                import org.springframework.context.event.ContextClosedEvent;
                import org.springframework.context.event.ContextRefreshedEvent;
                import org.springframework.context.event.EventListener;
                import org.springframework.transaction.event.TransactionalEventListener;

                class PlantedNamingListener {

                    @EventListener(DonorRegistered.class)
                    void byValue() {
                    }

                    @EventListener(classes = DonorErased.class)
                    void byClasses() {
                    }

                    @EventListener
                    void byPayload(PayloadApplicationEvent<DonorRegistered> registered) {
                    }

                    @TransactionalEventListener(classes = DonorErased.class)
                    void transactionally() {
                    }

                    @EventListener({ContextRefreshedEvent.class, ContextClosedEvent.class})
                    void framework(ApplicationEvent event) {
                    }
                }
                """));

        assertThat(shared_events_are_heard_by_their_transaction_phase.evaluate(planted).getFailureReport().getDetails())
                .hasSize(3)
                .anySatisfy(detail -> assertThat(detail).contains("PlantedNamingListener.byValue"))
                .anySatisfy(detail -> assertThat(detail).contains("PlantedNamingListener.byClasses"))
                .anySatisfy(detail -> assertThat(detail).contains("PlantedNamingListener.byPayload"));
    }

    @Test
    @DisplayName("Given planted application listeners that name a shared event in the annotation's value or classes, after another listener annotation, on a custom listener annotation, through a single-class alias, as a payload's type argument or through a type every shared event is, and one that names only other events, when the placement rule checks them, then each but the last is reported")
    void should_report_an_application_listener_naming_a_shared_event_in_its_annotation_or_payload_when_checked_given_planted_listeners(@TempDir Path folder)
            throws IOException {
        JavaClasses planted = PlantedClasses.compiled(folder, Map.of("cz.novanadeje.app.planteda.application.OnErasure", """
                package cz.novanadeje.app.planteda.application;

                import cz.novanadeje.app.shared.application.event.DonorErased;
                import org.springframework.transaction.event.TransactionalEventListener;

                import java.lang.annotation.Retention;
                import java.lang.annotation.RetentionPolicy;

                @Retention(RetentionPolicy.RUNTIME)
                @TransactionalEventListener(classes = DonorErased.class)
                public @interface OnErasure {
                }
                """, "cz.novanadeje.app.planteda.application.OnEvent", """
                package cz.novanadeje.app.planteda.application;

                import org.springframework.core.annotation.AliasFor;
                import org.springframework.transaction.event.TransactionalEventListener;

                import java.lang.annotation.Retention;
                import java.lang.annotation.RetentionPolicy;

                @Retention(RetentionPolicy.RUNTIME)
                @TransactionalEventListener
                public @interface OnEvent {

                    @AliasFor(annotation = TransactionalEventListener.class, attribute = "classes")
                    Class<?> value();
                }
                """, "cz.novanadeje.app.planteda.application.PlantedNamingService", """
                package cz.novanadeje.app.planteda.application;

                import cz.novanadeje.app.operations.application.event.OperationalAlertChanged;
                import cz.novanadeje.app.shared.application.event.DonorErased;
                import cz.novanadeje.app.shared.application.event.DonorRegistered;
                import org.springframework.context.ApplicationEvent;
                import org.springframework.context.PayloadApplicationEvent;
                import org.springframework.context.event.ContextRefreshedEvent;
                import org.springframework.context.event.EventListener;
                import org.springframework.transaction.event.TransactionalEventListener;

                public class PlantedNamingService {

                    @EventListener(DonorRegistered.class)
                    public void byValue() {
                    }

                    @TransactionalEventListener(classes = DonorErased.class)
                    public void byClasses() {
                    }

                    @EventListener
                    public void byPayload(PayloadApplicationEvent<DonorRegistered> registered) {
                    }

                    @EventListener(String.class)
                    public void ofAnotherEvent() {
                    }

                    @OnErasure
                    public void byCustomAnnotation() {
                    }

                    @TransactionalEventListener
                    @EventListener(DonorRegistered.class)
                    public void afterAnotherListenerAnnotation() {
                    }

                    @OnEvent(DonorErased.class)
                    public void bySingleClassAlias() {
                    }

                    @EventListener
                    public void anything(Object event) {
                    }

                    @EventListener
                    public void anyApplicationEvent(ApplicationEvent event) {
                    }

                    @EventListener
                    public void anyPayload(PayloadApplicationEvent<?> event) {
                    }

                    @EventListener(Record.class)
                    public void anyRecord() {
                    }

                    @EventListener({ContextRefreshedEvent.class, OperationalAlertChanged.class})
                    public void namedOwnEvents(Object event) {
                    }
                }
                """));

        assertThat(shared_events_are_consumed_by_infrastructure_adapters.evaluate(planted).getFailureReport().getDetails())
                .hasSize(10)
                .anySatisfy(detail -> assertThat(detail).contains("PlantedNamingService.anything"))
                .anySatisfy(detail -> assertThat(detail).contains("PlantedNamingService.anyApplicationEvent"))
                .anySatisfy(detail -> assertThat(detail).contains("PlantedNamingService.anyPayload"))
                .anySatisfy(detail -> assertThat(detail).contains("PlantedNamingService.anyRecord"))
                .anySatisfy(detail -> assertThat(detail).contains("PlantedNamingService.afterAnotherListenerAnnotation"))
                .anySatisfy(detail -> assertThat(detail).contains("PlantedNamingService.bySingleClassAlias"))
                .anySatisfy(detail -> assertThat(detail).contains("PlantedNamingService.byCustomAnnotation"))
                .anySatisfy(detail -> assertThat(detail).contains("PlantedNamingService.byValue"))
                .anySatisfy(detail -> assertThat(detail).contains("PlantedNamingService.byClasses"))
                .anySatisfy(detail -> assertThat(detail).contains("PlantedNamingService.byPayload"));
    }

    @Test
    @DisplayName("Given planted application methods that take a shared event, a list of them, a context's own event, a shared kind and plain values, a constructor that takes one, a method handing out a function of one, publishers returning one or a list or optional of them, a private helper taking one, a helper beside the shared events that takes one, and an adapter that takes a shared event, when the application API rule checks them, then only the public application code taking a shared event or handing out a function of one is reported")
    void should_report_application_code_taking_a_shared_event_when_checked_given_planted_classes(@TempDir Path folder) throws IOException {
        JavaClasses planted = PlantedClasses.compiled(folder, Map.of(
                "cz.novanadeje.app.planteda.application.PlantedRecoveryService", """
                        package cz.novanadeje.app.planteda.application;

                        import cz.novanadeje.app.operations.application.event.OperationalAlertChanged;
                        import cz.novanadeje.app.shared.application.event.DonorErased;
                        import cz.novanadeje.app.shared.application.event.LiveFeed;
                        import cz.novanadeje.app.shared.application.event.OperationalAlertRaised;
                        import cz.novanadeje.app.shared.application.event.SecondFactorRecoveryPaid;

                        import java.util.List;
                        import java.util.Optional;
                        import java.util.UUID;
                        import java.util.function.Consumer;

                        public class PlantedRecoveryService {

                            public void complete(SecondFactorRecoveryPaid payment) {
                            }

                            public void eraseAll(List<DonorErased> erasures) {
                            }

                            public void changed(OperationalAlertChanged changed) {
                            }

                            public void complete(UUID donorId, String senderAccount) {
                            }

                            public void feed(LiveFeed feed, OperationalAlertRaised.Area area) {
                            }

                            public Consumer<DonorErased> erasureHandler() {
                                return erased -> {
                                };
                            }

                            public DonorErased erasureOf(UUID donorId) {
                                return null;
                            }

                            public List<DonorErased> erasuresToPublish() {
                                return List.of();
                            }

                            public Optional<DonorErased> erasureIfDue(UUID donorId) {
                                return Optional.empty();
                            }

                            private void audit(DonorErased erased) {
                            }
                        }
                        """,
                "cz.novanadeje.app.planteda.application.RecordDonor", """
                        package cz.novanadeje.app.planteda.application;

                        import cz.novanadeje.app.shared.application.event.DonorRegistered;

                        import java.util.UUID;

                        public record RecordDonor(UUID donorId) {

                            public RecordDonor(DonorRegistered registered) {
                                this(registered.donorId());
                            }
                        }
                        """,
                "cz.novanadeje.app.shared.application.event.PlantedErasureHelper", """
                        package cz.novanadeje.app.shared.application.event;

                        public class PlantedErasureHelper {

                            public void forward(DonorErased erased) {
                            }
                        }
                        """,
                "cz.novanadeje.app.planteda.infrastructure.events.PlantedRecoveryListener", """
                        package cz.novanadeje.app.planteda.infrastructure.events;

                        import cz.novanadeje.app.shared.application.event.SecondFactorRecoveryPaid;

                        class PlantedRecoveryListener {

                            void onPaid(SecondFactorRecoveryPaid payment) {
                            }
                        }
                        """));

        assertThat(application_code_takes_no_shared_event.evaluate(planted).getFailureReport().getDetails())
                .hasSize(5)
                .anySatisfy(detail -> assertThat(detail).contains("PlantedRecoveryService.erasureHandler"))
                .anySatisfy(detail -> assertThat(detail).contains("RecordDonor.<init>(cz.novanadeje.app.shared.application.event.DonorRegistered)"))
                .anySatisfy(detail -> assertThat(detail).contains("PlantedErasureHelper.forward"))
                .anySatisfy(detail -> assertThat(detail).contains("PlantedRecoveryService.complete(cz.novanadeje.app.shared.application.event.SecondFactorRecoveryPaid)"))
                .anySatisfy(detail -> assertThat(detail).contains("PlantedRecoveryService.eraseAll"));
    }

    @Test
    @DisplayName("Given planted application records that wrap a shared event or a list of them, one that holds a shared kind, a publisher whose anonymous class captures an event, and an adapter's record that wraps a shared event, when the application value rule checks them, then only the application records wrapping a shared event are reported")
    void should_report_an_application_value_wrapping_a_shared_event_when_checked_given_planted_records(@TempDir Path folder) throws IOException {
        JavaClasses planted = PlantedClasses.compiled(folder, Map.of(
                "cz.novanadeje.app.planteda.application.CompleteRecovery", """
                        package cz.novanadeje.app.planteda.application;

                        import cz.novanadeje.app.shared.application.event.SecondFactorRecoveryPaid;

                        public record CompleteRecovery(SecondFactorRecoveryPaid payment) {
                        }
                        """,
                "cz.novanadeje.app.planteda.application.EraseAll", """
                        package cz.novanadeje.app.planteda.application;

                        import cz.novanadeje.app.shared.application.event.DonorErased;

                        import java.util.List;

                        public record EraseAll(List<DonorErased> erasures) {
                        }
                        """,
                "cz.novanadeje.app.planteda.application.PlantedPublisher", """
                        package cz.novanadeje.app.planteda.application;

                        import cz.novanadeje.app.shared.application.event.DonorErased;

                        import java.time.Instant;
                        import java.util.UUID;

                        public class PlantedPublisher {

                            public Runnable publishing(UUID donorId, Instant at) {
                                DonorErased erased = new DonorErased(donorId, at);
                                return new Runnable() {
                                    @Override
                                    public void run() {
                                        System.identityHashCode(erased);
                                    }
                                };
                            }
                        }
                        """,
                "cz.novanadeje.app.planteda.application.FeedChange", """
                        package cz.novanadeje.app.planteda.application;

                        import cz.novanadeje.app.shared.application.event.LiveFeed;

                        public record FeedChange(LiveFeed feed) {
                        }
                        """,
                "cz.novanadeje.app.planteda.infrastructure.events.HeardPayment", """
                        package cz.novanadeje.app.planteda.infrastructure.events;

                        import cz.novanadeje.app.shared.application.event.SecondFactorRecoveryPaid;

                        record HeardPayment(SecondFactorRecoveryPaid payment) {
                        }
                        """));

        assertThat(application_values_hold_no_shared_event.evaluate(planted).getFailureReport().getDetails())
                .hasSize(2)
                .anySatisfy(detail -> assertThat(detail).contains("CompleteRecovery.payment"))
                .anySatisfy(detail -> assertThat(detail).contains("EraseAll.erasures"));
    }

    @Test
    @DisplayName("Given planted listeners registered in code (an ApplicationListener bean, ApplicationListener.forPayload, TransactionalApplicationListener.forPayload, a lambda added to the context), an annotated listener and a user of a scheduler that is a listener itself, passing it to a helper, when the rule checks them, then only the four registered in code are reported")
    void should_report_a_listener_registered_in_code_when_checked_given_planted_listeners(@TempDir Path folder) throws IOException {
        JavaClasses planted = PlantedClasses.compiled(folder, Map.of(
                "cz.novanadeje.app.planteda.infrastructure.events.PlantedErasureBean", """
                        package cz.novanadeje.app.planteda.infrastructure.events;

                        import cz.novanadeje.app.shared.application.event.DonorErased;
                        import org.springframework.context.ApplicationListener;
                        import org.springframework.context.PayloadApplicationEvent;

                        class PlantedErasureBean implements ApplicationListener<PayloadApplicationEvent<DonorErased>> {

                            @Override
                            public void onApplicationEvent(PayloadApplicationEvent<DonorErased> event) {
                            }
                        }
                        """,
                "cz.novanadeje.app.planteda.infrastructure.events.PlantedPayloadListeners", """
                        package cz.novanadeje.app.planteda.infrastructure.events;

                        import cz.novanadeje.app.shared.application.event.DonorErased;
                        import org.springframework.context.ApplicationListener;

                        class PlantedPayloadListeners {

                            Object erasures() {
                                return ApplicationListener.<DonorErased>forPayload(erased -> {
                                });
                            }
                        }
                        """,
                "cz.novanadeje.app.planteda.infrastructure.events.PlantedTransactionalPayloadListeners", """
                        package cz.novanadeje.app.planteda.infrastructure.events;

                        import cz.novanadeje.app.shared.application.event.DonorErased;
                        import org.springframework.transaction.event.TransactionPhase;
                        import org.springframework.transaction.event.TransactionalApplicationListener;

                        class PlantedTransactionalPayloadListeners {

                            Object erasures() {
                                return TransactionalApplicationListener.<DonorErased>forPayload(TransactionPhase.BEFORE_COMMIT, erased -> {
                                });
                            }
                        }
                        """,
                "cz.novanadeje.app.planteda.infrastructure.events.PlantedContextListeners", """
                        package cz.novanadeje.app.planteda.infrastructure.events;

                        import org.springframework.context.ConfigurableApplicationContext;

                        class PlantedContextListeners {

                            void register(ConfigurableApplicationContext context) {
                                context.addApplicationListener(event -> {
                                });
                            }
                        }
                        """,
                "cz.novanadeje.app.planteda.infrastructure.config.PlantedScheduling", """
                        package cz.novanadeje.app.planteda.infrastructure.config;

                        import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;

                        class PlantedScheduling {

                            ThreadPoolTaskScheduler scheduler() {
                                ThreadPoolTaskScheduler scheduler = new ThreadPoolTaskScheduler();
                                scheduler.setExecuteExistingDelayedTasksAfterShutdownPolicy(false);
                                return bounded(scheduler);
                            }

                            private ThreadPoolTaskScheduler bounded(ThreadPoolTaskScheduler scheduler) {
                                scheduler.setPoolSize(1);
                                return scheduler;
                            }
                        }
                        """,
                "cz.novanadeje.app.planteda.infrastructure.events.PlantedAnnotatedListener", """
                        package cz.novanadeje.app.planteda.infrastructure.events;

                        import cz.novanadeje.app.shared.application.event.DonorErased;
                        import org.springframework.transaction.event.TransactionPhase;
                        import org.springframework.transaction.event.TransactionalEventListener;

                        class PlantedAnnotatedListener {

                            @TransactionalEventListener(phase = TransactionPhase.BEFORE_COMMIT)
                            void erased(DonorErased erased) {
                            }
                        }
                        """));

        assertThat(shared_events_are_heard_only_through_annotated_listeners.evaluate(planted).getFailureReport().getDetails())
                .allSatisfy(detail -> assertThat(detail).containsAnyOf("PlantedErasureBean", "PlantedPayloadListeners",
                        "PlantedTransactionalPayloadListeners", "PlantedContextListeners"))
                .anySatisfy(detail -> assertThat(detail).contains("PlantedErasureBean"))
                .anySatisfy(detail -> assertThat(detail).contains("PlantedPayloadListeners.erasures"))
                .anySatisfy(detail -> assertThat(detail).contains("PlantedTransactionalPayloadListeners"))
                .anySatisfy(detail -> assertThat(detail).contains("PlantedContextListeners"));
    }

    private static boolean listensToASharedEvent(JavaMethod method) {
        Set<JavaClass> named = eventsNamedByListenerAnnotations(method.getAnnotations(), new HashSet<>()).collect(Collectors.toSet());
        return (named.isEmpty() ? eventsTakenAsParameters(method) : named.stream()).anyMatch(HEARING_A_SHARED_EVENT);
    }

    private static Stream<JavaClass> eventsNamedByListenerAnnotations(Set<? extends JavaAnnotation<?>> annotations, Set<String> visited) {
        return annotations.stream()
                .filter(annotation -> annotation.getRawType().isEquivalentTo(EventListener.class)
                        || annotation.getRawType().isMetaAnnotatedWith(EventListener.class))
                .flatMap(annotation -> Stream.concat(
                        annotation.getProperties().values().stream().flatMap(EventListenerRulesTest::classesOf),
                        visited.add(annotation.getRawType().getName())
                                ? eventsNamedByListenerAnnotations(annotation.getRawType().getAnnotations(), visited)
                                : Stream.empty()));
    }

    private static Stream<JavaClass> classesOf(Object value) {
        if (value instanceof JavaClass[] classes) {
            return Arrays.stream(classes);
        }
        return value instanceof JavaClass single ? Stream.of(single) : Stream.empty();
    }

    private static Stream<JavaClass> eventsTakenAsParameters(JavaMethod method) {
        return method.getParameters().stream()
                .map(JavaParameter::getType)
                .flatMap(type -> type.toErasure().isEquivalentTo(PayloadApplicationEvent.class) ? payloadsOf(type) : Stream.of(type.toErasure()));
    }

    private static Stream<JavaClass> payloadsOf(JavaType payloadEvent) {
        Set<JavaClass> payloads = typeArgumentsOf(payloadEvent).collect(Collectors.toSet());
        return payloads.isEmpty() ? Stream.of(payloadEvent.toErasure()) : payloads.stream();
    }

    private static Stream<JavaClass> typeArgumentsOf(JavaType type) {
        return type.getAllInvolvedRawTypes().stream().filter(involved -> !involved.getName().equals(type.toErasure().getName()));
    }
}
