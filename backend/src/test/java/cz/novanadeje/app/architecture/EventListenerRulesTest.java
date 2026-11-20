package cz.novanadeje.app.architecture;

import com.tngtech.archunit.base.DescribedPredicate;
import com.tngtech.archunit.core.domain.JavaAnnotation;
import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.domain.JavaCodeUnit;
import com.tngtech.archunit.core.domain.JavaEnumConstant;
import com.tngtech.archunit.core.domain.JavaField;
import com.tngtech.archunit.core.domain.JavaMethod;
import com.tngtech.archunit.core.domain.JavaCall;
import com.tngtech.archunit.core.domain.JavaModifier;
import com.tngtech.archunit.core.domain.JavaParameter;
import com.tngtech.archunit.core.domain.JavaType;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchCondition;
import com.tngtech.archunit.lang.ArchRule;
import com.tngtech.archunit.lang.ConditionEvents;
import com.tngtech.archunit.lang.SimpleConditionEvent;
import cz.novanadeje.app.AppApplication;
import cz.novanadeje.app.shared.infrastructure.transaction.PublishingTransaction;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.context.ApplicationEvent;
import org.springframework.context.ApplicationListener;
import org.springframework.context.PayloadApplicationEvent;
import org.springframework.context.event.EventListener;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import java.io.IOException;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
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

@AnalyzeClasses(
        packagesOf = AppApplication.class,
        importOptions = ImportOption.DoNotIncludeTests.class
)
class EventListenerRulesTest {

    private static final String SITE_PACKAGE = "cz.novanadeje.app.";
    private static final String SHARED_EVENTS = "cz.novanadeje.app.shared.application.event";

    private static final String MAIL_DELIVERY_LISTENER = "cz.novanadeje.app.operations.infrastructure.events.MailDeliveryListener";
    private static final String MAIL_DELIVERY_REASON = "a send happens inside a transaction that may roll back (the monthly report) or outside any "
            + "(the @Async senders), and the outage must be kept either way";

    private static final Map<PlainListener, String> PLAIN_LISTENERS = Map.of(
            new PlainListener(MAIL_DELIVERY_LISTENER, SHARED_EVENTS + ".MailDeliveryFailed"), MAIL_DELIVERY_REASON,
            new PlainListener(MAIL_DELIVERY_LISTENER, SHARED_EVENTS + ".MailDeliverySucceeded"), MAIL_DELIVERY_REASON,
            new PlainListener("cz.novanadeje.app.donors.infrastructure.recovery.SecondFactorRecoveryPaymentListener",
                    SHARED_EVENTS + ".SecondFactorRecoveryPaid"),
            "it turns the factor off in the import's own transaction, so a failure rolls the import back and the next run retries");

    private static final Map<String, String> AT_MOST_ONCE_LISTENERS = Map.ofEntries(
            Map.entry("contact.infrastructure.mail.ContactMessageEmailForwarder.forward(ContactMessageReceived)",
                    "open: #1446; the message is lost to the foundation, nothing reads its row, and the yearly cleanup deletes it"),
            Map.entry("content.infrastructure.mail.ReceiptSignatureChangedEmailSender.sendChangedNotice(ReceiptSignatureChanged)",
                    "an administrator security notice: lost, and the audit trail is the durable record (#621; reliability.md: a failed send is logged and not retried)"),
            Map.entry("donations.infrastructure.events.DonorRecordSynchronizer.pairAfterRegistration(DonorRegistered)",
                    "nothing lasting is lost: the pairing pass of the next successful import pairs the new donor's payments (#621)"),
            Map.entry("donations.infrastructure.signing.ReceiptSigningKeyWithdrawnEmailSender.sendWithdrawnNotice(ReceiptSigningKeyWithdrawn)",
                    "an administrator security notice: lost, also when the restart the withdrawal triggers stops the server after waiting at most 3 minutes for the executor, and the audit trail is the durable record (#621, T12; reliability.md: a failed send is logged and not retried)"),
            Map.entry("donors.infrastructure.events.SenderAccountLearnedListener.on(SenderAccountLearned)",
                    "the first hop of a security notice to the donor: lost, and nothing durable shows it to the donor (#621; reliability.md: a failed send is logged and not retried)"),
            Map.entry("donors.infrastructure.mail.DonorAccountErasedEmailSender.sendErasureNotice(DonorAccountErased)",
                    "a security notice to the donor: lost, and nothing durable shows it to the donor (#621; reliability.md: a failed send is logged and not retried)"),
            Map.entry("donors.infrastructure.mail.DonorEmailChangeEmailSender.sendChangeLink(DonorEmailChangeRequested)",
                    "a link mail: lost, and the donor asks for a new link (#621; reliability.md: a failed send is logged and not retried)"),
            Map.entry("donors.infrastructure.mail.DonorEmailChangeEmailSender.sendChangedNotice(DonorEmailChanged)",
                    "a security notice to the old address: lost, and nothing durable shows it to the donor (#621; reliability.md: a failed send is logged and not retried)"),
            Map.entry("donors.infrastructure.mail.DonorEmailChangeEmailSender.sendInUseNotice(DonorEmailAddressInUse)",
                    "a privacy notice: lost, and nothing depends on it, since the requester got the same answer as for a free address (#621; reliability.md: a failed send is logged and not retried)"),
            Map.entry("donors.infrastructure.mail.DonorPasskeyEmailSender.sendAddedNotice(DonorPasskeyAdded)",
                    "a security notice to the donor: lost, and nothing durable shows it to the donor (#621; reliability.md: a failed send is logged and not retried)"),
            Map.entry("donors.infrastructure.mail.DonorPasskeyEmailSender.sendRemovedByDonorNotice(DonorPasskeyRemoved)",
                    "a security notice to the donor: lost, and nothing durable shows it to the donor (#621; reliability.md: a failed send is logged and not retried)"),
            Map.entry("donors.infrastructure.mail.DonorPasskeyEmailSender.sendRemovedNotice(DonorPasskeysRemoved)",
                    "a security notice to the donor: lost, and nothing durable shows it to the donor (#621; reliability.md: a failed send is logged and not retried)"),
            Map.entry("donors.infrastructure.mail.DonorPasswordChangedEmailSender.sendChangedNotice(DonorPasswordChanged)",
                    "a security notice to the donor: lost, and nothing durable shows it to the donor (#621; reliability.md: a failed send is logged and not retried)"),
            Map.entry("donors.infrastructure.mail.DonorRegistrationEmailSender.sendRegistrationRepeated(DonorRegistrationRepeated)",
                    "a privacy notice: lost, and nothing depends on it, since the requester got the same answer as for a free address (#621; reliability.md: a failed send is logged and not retried)"),
            Map.entry("donors.infrastructure.mail.DonorRegistrationEmailSender.sendReminder(DonorRegistrationReminderDue)",
                    "a link mail: lost, and the reminder's bookmark keeps it from being sent again; the donor registers again (#621; reliability.md: a failed send is logged and not retried)"),
            Map.entry("donors.infrastructure.mail.DonorRegistrationEmailSender.sendVerification(DonorEmailVerificationRequested)",
                    "a link mail: lost, and the donor asks for a new link (#621; reliability.md: a failed send is logged and not retried)"),
            Map.entry("donors.infrastructure.mail.DonorSecondFactorEmailSender.sendCodesPausedNotice(DonorSecondFactorCodesPaused)",
                    "a security notice to the donor: lost, and nothing durable shows it to the donor (#621; reliability.md: a failed send is logged and not retried)"),
            Map.entry("donors.infrastructure.mail.DonorSecondFactorEmailSender.sendDisabledNotice(DonorSecondFactorDisabled)",
                    "a security notice to the donor: lost, and nothing durable shows it to the donor (#621; reliability.md: a failed send is logged and not retried)"),
            Map.entry("donors.infrastructure.mail.DonorSecondFactorEmailSender.sendEnabledNotice(DonorSecondFactorEnabled)",
                    "a security notice to the donor: lost, and nothing durable shows it to the donor (#621; reliability.md: a failed send is logged and not retried)"),
            Map.entry("donors.infrastructure.mail.DonorSecondFactorRecoveredEmailSender.sendRecoveryNotice(DonorSecondFactorRecovered)",
                    "a security notice to the donor: lost, and nothing durable shows it to the donor (#621; reliability.md: a failed send is logged and not retried)"),
            Map.entry("donors.infrastructure.mail.DonorSecondFactorRecoveredEmailSender.tellTheOtherAdministrators(AdministratorSecondFactorRecovered)",
                    "an administrator security notice: lost, and the audit trail is the durable record (#621; reliability.md: a failed send is logged and not retried)"),
            Map.entry("donors.infrastructure.mail.DonorSecondFactorResetEmailSender.sendResetNotice(DonorSecondFactorReset)",
                    "a security notice to the donor: lost, and nothing durable shows it to the donor (#621; reliability.md: a failed send is logged and not retried)"),
            Map.entry("donors.infrastructure.mail.DonorSecurityNoticeEmailSender.sendRecoveryStartedNotice(DonorSecondFactorRecoveryStarted)",
                    "a security notice to the donor: lost, and nothing durable shows it to the donor (#621; reliability.md: a failed send is logged and not retried)"),
            Map.entry("donors.infrastructure.mail.DonorSecurityNoticeEmailSender.sendSenderAccountLearnedNotice(DonorSenderAccountLearned)",
                    "a security notice to the donor: lost, and nothing durable shows it to the donor (#621; reliability.md: a failed send is logged and not retried)"),
            Map.entry("donors.infrastructure.mail.PasswordResetEmailSender.send(DonorPasswordResetRequested)",
                    "a link mail: lost, and the donor asks for a new link (#621; reliability.md: a failed send is logged and not retried)"),
            Map.entry("donors.infrastructure.session.DeviceSessionLiveness.forget(DeviceSignedOut)",
                    "evicts a cache entry: a lost eviction is bounded by the cache's 30 s lifetime (#621)"),
            Map.entry("operations.infrastructure.backup.BackupKeyRevealedEmailSender.sendRevealedNotice(BackupKeyRevealed)",
                    "an administrator security notice: lost, and the audit trail is the durable record (#621; reliability.md: a failed send is logged and not retried)"),
            Map.entry("operations.infrastructure.events.DonorPushListener.on(DonationsArrived)",
                    "a push to donors: lost, and the gifts show in the portal (#621)"),
            Map.entry("operations.infrastructure.events.DonorPushListener.on(YearlyReceiptsReady)",
                    "a push to donors: lost, and the yearly announcement is bookmarked before it, so it is not sent twice (#621)"),
            Map.entry("operations.infrastructure.events.OperationalAlertPushListener.on(OperationalAlertChanged)",
                    "a push to administrators, retried in memory: lost on a restart, and the alert stays in /sprava (#621)"),
            Map.entry("operations.infrastructure.events.ReceiptSigningKeyWithdrawnListener.on(ReceiptSigningKeyWithdrawn)",
                    "open: #1449; requests the seed renewal and the restart: lost, the renewal is never requested and signing stays paused, failing safe until an administrator acts (#621, T11)"),
            Map.entry("shared.infrastructure.live.LiveHintListener.onDeviceSignedOut(DeviceSignedOut)",
                    "a live hint or stream close: lost, and the clients recover by their next read and the session check (#621)"),
            Map.entry("shared.infrastructure.live.LiveHintListener.onSessionsEnded(DonorSessionsEnded)",
                    "a live hint or stream close: lost, and the clients recover by their next read and the session check (#621)"),
            Map.entry("shared.infrastructure.live.LiveHintListener.onStoredDataChanged(StoredDataChanged)",
                    "a live hint: lost, and the clients recover by their next read (#621)"));

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
            .should(ArchCondition.from(DescribedPredicate.describe(
                    "hear only the shared events their class is named for as a plain listener, with its reason",
                    EventListenerRulesTest::hearsOnlyItsNamedEventsPlainly)))
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

    @ArchTest
    static final ArchRule before_commit_listeners_fail_without_the_publishers_read_write_transaction = methods()
            .that(DescribedPredicate.describe("are @TransactionalEventListener methods of the BEFORE_COMMIT phase",
                    method -> transactionalListenerOf(method).map(EventListenerRulesTest::phaseOf).filter(TransactionPhase.BEFORE_COMMIT.name()::equals).isPresent()))
            .should(runWithoutATransactionAndRequireTheirPublishers())
            .because("backend.md, Contexts and layers: a BEFORE_COMMIT listener writes what must commit with its publisher (the audit trail, a copy, "
                    + "an alert); without fallbackExecution Spring drops an event published outside a transaction silently, so the listener runs "
                    + "anyway and fails through PublishingTransaction.require, which refuses a missing or read-only transaction (#621, Khononov T4)");

    private static ArchCondition<JavaMethod> runWithoutATransactionAndRequireTheirPublishers() {
        return new ArchCondition<>("declare fallbackExecution = true and call PublishingTransaction.require before anything else") {
            @Override
            public void check(JavaMethod method, ConditionEvents events) {
                boolean fallback = transactionalListenerOf(method).flatMap(listener -> listener.get("fallbackExecution"))
                        .filter(Boolean.TRUE::equals).isPresent();
                Optional<Integer> requireLine = method.getCallsFromSelf().stream().filter(EventListenerRulesTest::requiresThePublishersTransaction)
                        .map(JavaCall::getLineNumber).min(Integer::compare);
                boolean requires = requireLine.filter(line -> method.getCallsFromSelf().stream()
                        .filter(call -> !requiresThePublishersTransaction(call)).allMatch(call -> call.getLineNumber() > line)).isPresent();
                if (!fallback) {
                    events.add(SimpleConditionEvent.violated(method, method.getFullName() + " does not declare fallbackExecution = true in "
                            + method.getSourceCodeLocation()));
                }
                if (!requires) {
                    events.add(SimpleConditionEvent.violated(method, method.getFullName() + " does not call PublishingTransaction.require before anything else in "
                            + method.getSourceCodeLocation()));
                }
            }
        };
    }

    @Test
    @DisplayName("Given planted BEFORE_COMMIT listeners without fallbackExecution or with it false, without the transaction check or with it after another call or on its line, on a composed annotation without fallbackExecution, and ones that declare and call both first or listen after the commit, by default too, when the rule checks them, then each missing part is reported and nothing else")
    void should_report_each_missing_part_when_checked_given_planted_before_commit_listeners(@TempDir Path folder) throws IOException {
        JavaClasses planted = PlantedClasses.compiled(folder, Map.of(
                "cz.novanadeje.app.planteda.infrastructure.events.PlantedBeforeCommit", """
                        package cz.novanadeje.app.planteda.infrastructure.events;

                        import java.lang.annotation.ElementType;
                        import java.lang.annotation.Retention;
                        import java.lang.annotation.RetentionPolicy;
                        import java.lang.annotation.Target;
                        import org.springframework.transaction.event.TransactionPhase;
                        import org.springframework.transaction.event.TransactionalEventListener;

                        @Retention(RetentionPolicy.RUNTIME)
                        @Target(ElementType.METHOD)
                        @TransactionalEventListener(phase = TransactionPhase.BEFORE_COMMIT)
                        @interface PlantedBeforeCommit {
                        }
                        """,
                "cz.novanadeje.app.planteda.infrastructure.events.PlantedCopyListener", """
                        package cz.novanadeje.app.planteda.infrastructure.events;

                        import cz.novanadeje.app.shared.application.event.DonorErased;
                        import cz.novanadeje.app.shared.application.event.DonorRegistered;
                        import cz.novanadeje.app.shared.infrastructure.transaction.PublishingTransaction;
                        import org.springframework.transaction.event.TransactionPhase;
                        import org.springframework.transaction.event.TransactionalEventListener;

                        class PlantedCopyListener {

                            @TransactionalEventListener(phase = TransactionPhase.BEFORE_COMMIT)
                            void droppedOutsideATransaction(DonorRegistered registered) {
                                PublishingTransaction.require(registered);
                            }

                            @TransactionalEventListener(phase = TransactionPhase.BEFORE_COMMIT, fallbackExecution = true)
                            void runsWithoutAnyTransaction(DonorRegistered registered) {
                            }

                            @PlantedBeforeCommit
                            void composedWithoutFallback(DonorErased erased) {
                                PublishingTransaction.require(erased);
                            }

                            @TransactionalEventListener(phase = TransactionPhase.BEFORE_COMMIT, fallbackExecution = true)
                            void failsWithoutItsPublishersTransaction(DonorErased erased) {
                                PublishingTransaction.require(erased);
                            }

                            @TransactionalEventListener(phase = TransactionPhase.BEFORE_COMMIT, fallbackExecution = false)
                            void fallbackTurnedOff(DonorErased erased) {
                                PublishingTransaction.require(erased);
                            }

                            @TransactionalEventListener(phase = TransactionPhase.BEFORE_COMMIT, fallbackExecution = true)
                            void checksAfterWriting(DonorErased erased) {
                                erased.donorId();
                                PublishingTransaction.require(erased);
                            }

                            @TransactionalEventListener(phase = TransactionPhase.BEFORE_COMMIT, fallbackExecution = true)
                            void checksOnTheSameLineAsWriting(DonorErased erased) {
                                erased.donorId(); PublishingTransaction.require(erased);
                            }

                            @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
                            void afterTheCommit(DonorErased erased) {
                            }

                            @TransactionalEventListener
                            void afterTheCommitByDefault(DonorErased erased) {
                            }
                        }
                        """));

        assertThat(before_commit_listeners_fail_without_the_publishers_read_write_transaction.evaluate(planted).getFailureReport().getDetails())
                .hasSize(6)
                .anySatisfy(detail -> assertThat(detail).contains("droppedOutsideATransaction").contains("fallbackExecution"))
                .anySatisfy(detail -> assertThat(detail).contains("fallbackTurnedOff").contains("fallbackExecution"))
                .anySatisfy(detail -> assertThat(detail).contains("checksAfterWriting").contains("before anything else"))
                .anySatisfy(detail -> assertThat(detail).contains("checksOnTheSameLineAsWriting").contains("before anything else"))
                .anySatisfy(detail -> assertThat(detail).contains("runsWithoutAnyTransaction").contains("PublishingTransaction.require"))
                .anySatisfy(detail -> assertThat(detail).contains("composedWithoutFallback").contains("fallbackExecution"))
                .noneSatisfy(detail -> assertThat(detail).containsAnyOf("failsWithoutItsPublishersTransaction", "afterTheCommit"));
    }

    @Test
    @DisplayName("Given the plain listeners named with their reason, when the site is read, then each class still hears its event with a plain @EventListener, so the list names no listener or event that is gone")
    void should_find_every_named_plain_listener_when_read_given_the_list() {
        JavaClasses site = new ClassFileImporter().withImportOption(new ImportOption.DoNotIncludeTests()).importPackagesOf(AppApplication.class);

        assertThat(PLAIN_LISTENERS.keySet()).allSatisfy(listener -> assertThat(site.get(listener.listener()).getMethods())
                .filteredOn(LISTENING_PLAINLY_TO_A_SHARED_EVENT)
                .as(listener.toString())
                .anySatisfy(method -> assertThat(eventsHeardBy(method)).anySatisfy(event -> assertThat(event.getName()).isEqualTo(listener.event()))));
    }

    @Test
    @DisplayName("Given a planted listener named for one shared event that also hears another plainly, when the rule checks it, then only the methods hearing another shared event are reported, and its own event beside a framework event is not")
    void should_report_a_named_listener_hearing_another_event_plainly_when_checked_given_a_planted_listener(@TempDir Path folder) throws IOException {
        JavaClasses planted = PlantedClasses.compiled(folder, Map.of(MAIL_DELIVERY_LISTENER, """
                package cz.novanadeje.app.operations.infrastructure.events;

                import cz.novanadeje.app.shared.application.event.DonorRegistered;
                import cz.novanadeje.app.shared.application.event.MailDeliveryFailed;
                import org.springframework.context.event.ContextRefreshedEvent;
                import org.springframework.context.event.EventListener;

                class MailDeliveryListener {

                    @EventListener
                    void on(MailDeliveryFailed failed) {
                    }

                    @EventListener
                    void registered(DonorRegistered registered) {
                    }

                    @EventListener(classes = {MailDeliveryFailed.class, DonorRegistered.class})
                    void named() {
                    }

                    @EventListener
                    void anything(Object event) {
                    }

                    @EventListener(classes = {MailDeliveryFailed.class, ContextRefreshedEvent.class})
                    void withAFrameworkEvent() {
                    }
                }
                """));

        assertThat(shared_events_are_heard_by_their_transaction_phase.evaluate(planted).getFailureReport().getDetails())
                .hasSize(3)
                .anySatisfy(detail -> assertThat(detail).contains("MailDeliveryListener.registered("))
                .anySatisfy(detail -> assertThat(detail).contains("MailDeliveryListener.named("))
                .anySatisfy(detail -> assertThat(detail).contains("MailDeliveryListener.anything("))
                .noneSatisfy(detail -> assertThat(detail).containsAnyOf("MailDeliveryListener.on(", "withAFrameworkEvent("));
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
                        import cz.novanadeje.app.shared.application.event.ImportOutageChanged;
                        import cz.novanadeje.app.shared.application.event.SecondFactorRecoveryPaid;
                        import cz.novanadeje.app.shared.application.event.StoredDataChanged.LiveFeed;

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

                            public void feed(LiveFeed feed, ImportOutageChanged.Change change) {
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

                        import cz.novanadeje.app.shared.application.event.StoredDataChanged.LiveFeed;

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

    private static boolean requiresThePublishersTransaction(JavaCall<?> call) {
        return call.getTargetOwner().isEquivalentTo(PublishingTransaction.class) && call.getName().equals("require");
    }

    private static Optional<JavaAnnotation<?>> transactionalListenerOf(JavaMethod method) {
        return method.getAnnotations().stream()
                .<JavaAnnotation<?>>flatMap(annotation -> annotation.getRawType().isEquivalentTo(TransactionalEventListener.class)
                        ? Stream.of(annotation)
                        : annotation.getRawType().getAnnotations().stream().filter(meta -> meta.getRawType().isEquivalentTo(TransactionalEventListener.class)))
                .findFirst();
    }

    private static String phaseOf(JavaAnnotation<?> listener) {
        return listener.get("phase").filter(JavaEnumConstant.class::isInstance).map(JavaEnumConstant.class::cast).map(JavaEnumConstant::name)
                .orElse(TransactionPhase.AFTER_COMMIT.name());
    }

    private static boolean listensToASharedEvent(JavaMethod method) {
        return eventsHeardBy(method).stream().anyMatch(HEARING_A_SHARED_EVENT);
    }

    private static List<JavaClass> eventsHeardBy(JavaMethod method) {
        Set<JavaClass> named = eventsNamedByListenerAnnotations(method.getAnnotations(), new HashSet<>()).collect(Collectors.toSet());
        return (named.isEmpty() ? eventsTakenAsParameters(method) : named.stream()).toList();
    }

    private static boolean hearsOnlyItsNamedEventsPlainly(JavaMethod method) {
        return eventsHeardBy(method).stream()
                .filter(HEARING_A_SHARED_EVENT)
                .allMatch(event -> PLAIN_LISTENERS.containsKey(new PlainListener(method.getOwner().getName(), event.getName())));
    }

    private record PlainListener(String listener, String event) {
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

    @ArchTest
    static final ArchRule after_commit_listeners_are_reviewed_as_at_most_once = afterCommitListenersReviewedIn(AT_MOST_ONCE_LISTENERS);

    @ArchTest
    static void every_at_most_once_listing_names_an_after_commit_listener_with_its_reason(JavaClasses classes) {
        assertThat(listingsThatNameNoAfterCommitListener(classes, AT_MOST_ONCE_LISTENERS))
                .as("the reviewed at-most-once list names only AFTER_COMMIT listener methods of the site, so an entry left behind by a rename, "
                        + "a move or an outbox that replaced the listener is found")
                .isEmpty();
        assertThat(listingsWithoutAReason(AT_MOST_ONCE_LISTENERS)).as("every listed listener says why its loss is acceptable").isEmpty();
    }

    @Test
    @DisplayName("Given planted AFTER_COMMIT listeners by phase, by default and through a composed annotation, a BEFORE_COMMIT one, a nested one and one of the same simple name in another package, and a reviewed list naming one of them, the nested one without a reason, a BEFORE_COMMIT listener and a gone one, when the rule and the listing checks read them, then the three unlisted after-commit listeners, the two listings that name no after-commit listener and the one without a reason are reported")
    void should_report_unlisted_listeners_and_stale_listings_when_checked_given_planted_listeners(@TempDir Path folder) throws IOException {
        JavaClasses planted = PlantedClasses.compiled(folder, Map.of(
                "cz.novanadeje.app.planteda.infrastructure.mail.PlantedAfterCommit", """
                        package cz.novanadeje.app.planteda.infrastructure.mail;

                        import java.lang.annotation.ElementType;
                        import java.lang.annotation.Retention;
                        import java.lang.annotation.RetentionPolicy;
                        import java.lang.annotation.Target;
                        import org.springframework.transaction.event.TransactionPhase;
                        import org.springframework.transaction.event.TransactionalEventListener;

                        @Retention(RetentionPolicy.RUNTIME)
                        @Target(ElementType.METHOD)
                        @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
                        @interface PlantedAfterCommit {
                        }
                        """,
                "cz.novanadeje.app.planteda.infrastructure.mail.PlantedNoticeSender", """
                        package cz.novanadeje.app.planteda.infrastructure.mail;

                        import cz.novanadeje.app.shared.application.event.DonorErased;
                        import cz.novanadeje.app.shared.application.event.DonorRegistered;
                        import org.springframework.transaction.event.TransactionPhase;
                        import org.springframework.transaction.event.TransactionalEventListener;

                        class PlantedNoticeSender {

                            @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
                            void reviewedNotice(DonorRegistered registered) {
                            }

                            @TransactionalEventListener
                            void unreviewedByDefault(DonorRegistered registered) {
                            }

                            @PlantedAfterCommit
                            void unreviewedComposed(DonorErased erased) {
                            }

                            @TransactionalEventListener(phase = TransactionPhase.BEFORE_COMMIT)
                            void beforeTheCommit(DonorErased erased) {
                            }

                            static class Nested {

                                @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
                                void reviewedNotice(DonorRegistered registered) {
                                }
                            }
                        }
                        """,
                "cz.novanadeje.app.planteda.infrastructure.events.PlantedNoticeSender", """
                        package cz.novanadeje.app.planteda.infrastructure.events;

                        import cz.novanadeje.app.shared.application.event.DonorRegistered;
                        import org.springframework.transaction.event.TransactionalEventListener;

                        class PlantedNoticeSender {

                            @TransactionalEventListener
                            void reviewedNotice(DonorRegistered registered) {
                            }
                        }
                        """));
        String sender = "planteda.infrastructure.mail.PlantedNoticeSender";
        Map<String, String> reviewed = Map.of(
                sender + ".reviewedNotice(DonorRegistered)", "planted: a notice whose loss is acceptable",
                sender + "$Nested.reviewedNotice(DonorRegistered)", " ",
                sender + ".beforeTheCommit(DonorErased)", "planted: listed although it commits with its publisher",
                sender + ".goneNotice(DonorErased)", "planted: replaced by an outbox long ago");

        assertThat(afterCommitListenersReviewedIn(reviewed).evaluate(planted).getFailureReport().getDetails())
                .hasSize(3)
                .anySatisfy(detail -> assertThat(detail).contains(sender + ".unreviewedByDefault(DonorRegistered)"))
                .anySatisfy(detail -> assertThat(detail).contains(sender + ".unreviewedComposed(DonorErased)"))
                .anySatisfy(detail -> assertThat(detail).contains("planteda.infrastructure.events.PlantedNoticeSender.reviewedNotice(DonorRegistered)"));
        assertThat(listingsThatNameNoAfterCommitListener(planted, reviewed))
                .containsExactly(sender + ".beforeTheCommit(DonorErased)", sender + ".goneNotice(DonorErased)");
        assertThat(listingsWithoutAReason(reviewed)).containsExactly(sender + "$Nested.reviewedNotice(DonorRegistered)");
    }

    private static ArchRule afterCommitListenersReviewedIn(Map<String, String> reviewed) {
        return methods()
                .that(DescribedPredicate.describe("are @TransactionalEventListener methods of the AFTER_COMMIT phase", EventListenerRulesTest::listensAfterTheCommit))
                .should(new ArchCondition<>("be listed in AT_MOST_ONCE_LISTENERS with the reason their loss is acceptable") {
                    @Override
                    public void check(JavaMethod method, ConditionEvents events) {
                        if (!reviewed.containsKey(atMostOnceKeyOf(method))) {
                            events.add(SimpleConditionEvent.violated(method, atMostOnceKeyOf(method) + " runs after the commit and may be lost "
                                    + "(a refused send, a stop, a task still queued at shutdown), but AT_MOST_ONCE_LISTENERS does not say why that is acceptable, in "
                                    + method.getSourceCodeLocation()));
                        }
                    }
                })
                .because("Khononov T3 (#621): an AFTER_COMMIT side effect runs at most once, so each one names why its loss is acceptable "
                        + "or which issue gives it an outbox, and a new one cannot slip in with the \"things will be okay\" mindset");
    }

    private static List<String> listingsThatNameNoAfterCommitListener(JavaClasses classes, Map<String, String> reviewed) {
        Set<String> listeners = classes.stream().flatMap(type -> type.getMethods().stream())
                .filter(EventListenerRulesTest::listensAfterTheCommit)
                .map(EventListenerRulesTest::atMostOnceKeyOf)
                .collect(Collectors.toSet());
        return reviewed.keySet().stream().filter(listed -> !listeners.contains(listed)).sorted().toList();
    }

    private static List<String> listingsWithoutAReason(Map<String, String> reviewed) {
        return reviewed.entrySet().stream().filter(listing -> listing.getValue().isBlank()).map(Map.Entry::getKey).sorted().toList();
    }

    private static boolean listensAfterTheCommit(JavaMethod method) {
        return !method.getModifiers().contains(JavaModifier.BRIDGE) && listenerAnnotationOf(method).map(EventListenerRulesTest::listenerPhase).filter(TransactionPhase.AFTER_COMMIT.name()::equals).isPresent();
    }

    private static String atMostOnceKeyOf(JavaMethod method) {
        return method.getOwner().getName().substring(SITE_PACKAGE.length()) + "." + method.getName() + "("
                + method.getRawParameterTypes().stream().map(JavaClass::getSimpleName).collect(Collectors.joining(", ")) + ")";
    }

    private static Optional<JavaAnnotation<?>> listenerAnnotationOf(JavaMethod method) {
        return method.getAnnotations().stream()
                .<JavaAnnotation<?>>flatMap(annotation -> annotation.getRawType().isEquivalentTo(TransactionalEventListener.class)
                        ? Stream.of(annotation)
                        : annotation.getRawType().getAnnotations().stream().filter(meta -> meta.getRawType().isEquivalentTo(TransactionalEventListener.class)))
                .findFirst();
    }

    private static String listenerPhase(JavaAnnotation<?> listener) {
        return listener.get("phase").filter(JavaEnumConstant.class::isInstance).map(JavaEnumConstant.class::cast).map(JavaEnumConstant::name)
                .orElse(TransactionPhase.AFTER_COMMIT.name());
    }
}
