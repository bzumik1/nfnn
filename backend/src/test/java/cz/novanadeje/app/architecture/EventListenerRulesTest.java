package cz.novanadeje.app.architecture;

import com.tngtech.archunit.base.DescribedPredicate;
import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.domain.JavaMethod;
import com.tngtech.archunit.core.domain.JavaParameter;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchCondition;
import com.tngtech.archunit.lang.ArchRule;
import cz.novanadeje.app.AppApplication;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.context.PayloadApplicationEvent;
import org.springframework.context.event.EventListener;
import org.springframework.transaction.event.TransactionalEventListener;

import java.io.IOException;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.Map;
import java.util.stream.Stream;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.methods;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noMethods;
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
            "cz.novanadeje.app.operations.infrastructure.backup.ReceiptSeedRenewal",
            "the announcement is published after the withdrawal committed, once the notices are handed over",
            "cz.novanadeje.app.donors.infrastructure.recovery.SecondFactorRecoveryPaymentListener",
            "it turns the factor off in the import's own transaction, so a failure rolls the import back and the next run retries");

    private static final DescribedPredicate<JavaMethod> LISTENING_PLAINLY_TO_A_SHARED_EVENT = DescribedPredicate.describe(
            "listen with a plain @EventListener to an event of " + SHARED_EVENTS,
            method -> method.isMetaAnnotatedWith(EventListener.class) && !method.isMetaAnnotatedWith(TransactionalEventListener.class)
                    && listensToASharedEvent(method));

    private static final DescribedPredicate<JavaMethod> LISTENING_TO_A_SHARED_EVENT = DescribedPredicate.describe(
            "listen to an event of " + SHARED_EVENTS,
            method -> method.isMetaAnnotatedWith(EventListener.class) && listensToASharedEvent(method));

    private static final DescribedPredicate<JavaMethod> TAKING_A_SHARED_EVENT = DescribedPredicate.describe(
            "take a parameter whose type is in " + SHARED_EVENTS,
            method -> method.getParameters().stream()
                    .flatMap(parameter -> parameter.getType().getAllInvolvedRawTypes().stream())
                    .anyMatch(type -> type.getPackageName().equals(SHARED_EVENTS)));

    @ArchTest
    static final ArchRule shared_events_are_consumed_by_infrastructure_adapters = methods()
            .that(LISTENING_TO_A_SHARED_EVENT)
            .should().beDeclaredInClassesThat().resideInAPackage("..infrastructure..")
            .because("backend.md, Contexts and layers: a listener of a cross-context event is a driving adapter in infrastructure that calls "
                    + "the application with the event's values, so no application service takes a shared event as its API");

    @ArchTest
    static final ArchRule application_methods_take_no_shared_event = noMethods()
            .that().areDeclaredInClassesThat().resideInAPackage("..application..")
            .and().areDeclaredInClassesThat().resideOutsideOfPackage(SHARED_EVENTS)
            .should(ArchCondition.from(TAKING_A_SHARED_EVENT))
            .because("backend.md, Contexts and layers: the adapter that hears a cross-context event calls the application with the event's values, "
                    + "so no application API takes a shared event");

    @ArchTest
    static final ArchRule shared_events_are_heard_by_their_transaction_phase = methods()
            .that(LISTENING_PLAINLY_TO_A_SHARED_EVENT)
            .should().beDeclaredInClassesThat(DescribedPredicate.describe("are named as plain listeners with their reason",
                    type -> PLAIN_LISTENERS.containsKey(type.getName())))
            .because("backend.md, Contexts and layers: a cross-context event is consumed with @TransactionalEventListener, so its copy or side "
                    + "effect follows the publisher's commit; a plain listener runs even when the publisher rolls back");

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
                import org.springframework.context.PayloadApplicationEvent;
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
                        import org.springframework.context.PayloadApplicationEvent;
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
    @DisplayName("Given planted listeners that name a shared event in @EventListener's value or classes or as a payload's type argument, when the plain rule checks them, then each plain one is reported and a transactional one is not")
    void should_report_a_plain_listener_naming_a_shared_event_in_its_annotation_or_payload_when_checked_given_planted_listeners(@TempDir Path folder)
            throws IOException {
        JavaClasses planted = PlantedClasses.compiled(folder, Map.of("cz.novanadeje.app.planteda.infrastructure.events.PlantedNamingListener", """
                package cz.novanadeje.app.planteda.infrastructure.events;

                import cz.novanadeje.app.shared.application.event.DonorErased;
                import cz.novanadeje.app.shared.application.event.DonorRegistered;
                import org.springframework.context.PayloadApplicationEvent;
                import org.springframework.context.PayloadApplicationEvent;
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
                }
                """));

        assertThat(shared_events_are_heard_by_their_transaction_phase.evaluate(planted).getFailureReport().getDetails())
                .hasSize(3)
                .anySatisfy(detail -> assertThat(detail).contains("PlantedNamingListener.byValue"))
                .anySatisfy(detail -> assertThat(detail).contains("PlantedNamingListener.byClasses"))
                .anySatisfy(detail -> assertThat(detail).contains("PlantedNamingListener.byPayload"));
    }

    @Test
    @DisplayName("Given planted application listeners that name a shared event in the annotation's value or classes or as a payload's type argument, when the placement rule checks them, then each is reported")
    void should_report_an_application_listener_naming_a_shared_event_in_its_annotation_or_payload_when_checked_given_planted_listeners(@TempDir Path folder)
            throws IOException {
        JavaClasses planted = PlantedClasses.compiled(folder, Map.of("cz.novanadeje.app.planteda.application.PlantedNamingService", """
                package cz.novanadeje.app.planteda.application;

                import cz.novanadeje.app.shared.application.event.DonorErased;
                import cz.novanadeje.app.shared.application.event.DonorRegistered;
                import org.springframework.context.PayloadApplicationEvent;
                import org.springframework.context.PayloadApplicationEvent;
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
                }
                """));

        assertThat(shared_events_are_consumed_by_infrastructure_adapters.evaluate(planted).getFailureReport().getDetails())
                .hasSize(3)
                .anySatisfy(detail -> assertThat(detail).contains("PlantedNamingService.byValue"))
                .anySatisfy(detail -> assertThat(detail).contains("PlantedNamingService.byClasses"))
                .anySatisfy(detail -> assertThat(detail).contains("PlantedNamingService.byPayload"));
    }

    @Test
    @DisplayName("Given planted application methods that take a shared event, a list of them, a context's own event and plain values, and an adapter that takes a shared event, when the application API rule checks them, then only the application methods taking a shared event are reported")
    void should_report_an_application_method_taking_a_shared_event_when_checked_given_planted_classes(@TempDir Path folder) throws IOException {
        JavaClasses planted = PlantedClasses.compiled(folder, Map.of(
                "cz.novanadeje.app.planteda.application.PlantedRecoveryService", """
                        package cz.novanadeje.app.planteda.application;

                        import cz.novanadeje.app.operations.application.event.OperationalAlertChanged;
                        import cz.novanadeje.app.shared.application.event.DonorErased;
                        import cz.novanadeje.app.shared.application.event.SecondFactorRecoveryPaid;

                        import java.util.List;
                        import java.util.UUID;

                        public class PlantedRecoveryService {

                            public void complete(SecondFactorRecoveryPaid payment) {
                            }

                            public void eraseAll(List<DonorErased> erasures) {
                            }

                            public void changed(OperationalAlertChanged changed) {
                            }

                            public void complete(UUID donorId, String senderAccount) {
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

        assertThat(application_methods_take_no_shared_event.evaluate(planted).getFailureReport().getDetails())
                .hasSize(2)
                .anySatisfy(detail -> assertThat(detail).contains("PlantedRecoveryService.complete(cz.novanadeje.app.shared.application.event.SecondFactorRecoveryPaid)"))
                .anySatisfy(detail -> assertThat(detail).contains("PlantedRecoveryService.eraseAll"));
    }

    private static boolean listensToASharedEvent(JavaMethod method) {
        return Stream.concat(eventsNamedByListenerAnnotations(method), eventsTakenAsParameters(method))
                .anyMatch(type -> type.getPackageName().equals(SHARED_EVENTS));
    }

    private static Stream<JavaClass> eventsNamedByListenerAnnotations(JavaMethod method) {
        return method.getAnnotations().stream()
                .filter(annotation -> annotation.getRawType().isEquivalentTo(EventListener.class)
                        || annotation.getRawType().isMetaAnnotatedWith(EventListener.class))
                .flatMap(annotation -> Stream.of("value", "classes").flatMap(attribute -> annotation.get(attribute).stream()))
                .filter(JavaClass[].class::isInstance)
                .flatMap(classes -> Arrays.stream((JavaClass[]) classes));
    }

    private static Stream<JavaClass> eventsTakenAsParameters(JavaMethod method) {
        return method.getParameters().stream()
                .map(JavaParameter::getType)
                .flatMap(type -> type.toErasure().isEquivalentTo(PayloadApplicationEvent.class)
                        ? type.getAllInvolvedRawTypes().stream().filter(involved -> !involved.isEquivalentTo(PayloadApplicationEvent.class))
                        : Stream.of(type.toErasure()));
    }
}
