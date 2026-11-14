package cz.novanadeje.app.architecture;

import com.tngtech.archunit.base.DescribedPredicate;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.domain.JavaMethod;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;
import cz.novanadeje.app.AppApplication;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.context.event.EventListener;
import org.springframework.transaction.event.TransactionalEventListener;

import java.io.IOException;
import java.nio.file.Path;
import java.util.Map;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.methods;
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
                    && method.getRawParameterTypes().stream().anyMatch(type -> type.getPackageName().equals(SHARED_EVENTS)));

    private static final DescribedPredicate<JavaMethod> LISTENING_TO_A_SHARED_EVENT = DescribedPredicate.describe(
            "listen to an event of " + SHARED_EVENTS,
            method -> method.isMetaAnnotatedWith(EventListener.class)
                    && method.getRawParameterTypes().stream().anyMatch(type -> type.getPackageName().equals(SHARED_EVENTS)));

    @ArchTest
    static final ArchRule shared_events_are_consumed_by_infrastructure_adapters = methods()
            .that(LISTENING_TO_A_SHARED_EVENT)
            .should().beDeclaredInClassesThat().resideInAPackage("..infrastructure..")
            .because("backend.md, Contexts and layers: a listener of a cross-context event is a driving adapter in infrastructure that calls "
                    + "the application with the event's values, so no application service takes a shared event as its API");

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
}
