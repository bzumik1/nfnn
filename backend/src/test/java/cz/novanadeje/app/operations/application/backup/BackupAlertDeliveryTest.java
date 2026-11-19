package cz.novanadeje.app.operations.application.backup;

import cz.novanadeje.app.operations.domain.backup.BackupAlert;
import cz.novanadeje.app.operations.domain.backup.BackupAlertId;
import cz.novanadeje.app.operations.domain.backup.BackupAlertRepository;
import cz.novanadeje.app.operations.domain.backup.BackupProblem;
import cz.novanadeje.app.operations.domain.backup.WaitingBackupAlert;
import cz.novanadeje.app.shared.application.alert.AlertRecipients;
import cz.novanadeje.app.shared.domain.EmailAddress;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.InOrder;
import org.springframework.transaction.support.TransactionOperations;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class BackupAlertDeliveryTest {

    private static final Instant NOW = Instant.parse("2026-10-23T05:15:00Z");
    private static final List<EmailAddress> RECIPIENTS = List.of(new EmailAddress("info@nfnn.cz"));
    private static final LastBackupRuns LAST_RUNS = new LastBackupRuns(Optional.empty(), Optional.empty());
    private static final WaitingBackupAlert PROBLEMS = new WaitingBackupAlert(BackupAlertId.newId(NOW),
            new BackupAlert.ProblemsDetected(Set.of(BackupProblem.BACKUP_FAILED), NOW.minusSeconds(86_400)));
    private static final WaitingBackupAlert RECOVERY = new WaitingBackupAlert(BackupAlertId.newId(NOW.plusMillis(1)),
            new BackupAlert.Recovered(Set.of(BackupProblem.BACKUP_FAILED), NOW));

    private final BackupAlertRepository alerts = mock(BackupAlertRepository.class);
    private final AlertRecipients recipients = mock(AlertRecipients.class);
    private final BackupAlertSender sender = mock(BackupAlertSender.class);
    private final BackupAlertDelivery delivery = new BackupAlertDelivery(alerts, recipients, sender, TransactionOperations.withoutTransaction(),
            Clock.fixed(NOW, ZoneOffset.UTC));

    @Test
    @DisplayName("Given two waiting alerts, when they are delivered, then each is sent to the alert recipients with the last runs and marked sent after its send, oldest first")
    void should_send_and_mark_each_after_its_send_when_delivered_given_two_waiting_alerts() {
        when(alerts.waiting()).thenReturn(List.of(PROBLEMS, RECOVERY));
        when(recipients.emailAddresses()).thenReturn(RECIPIENTS);
        when(sender.send(any(), any(), any())).thenReturn(true);

        delivery.deliverWaiting(LAST_RUNS);

        InOrder order = inOrder(sender, alerts);
        order.verify(sender).send(PROBLEMS.alert(), LAST_RUNS, RECIPIENTS);
        order.verify(alerts).markSent(PROBLEMS.id(), NOW);
        order.verify(sender).send(RECOVERY.alert(), LAST_RUNS, RECIPIENTS);
        order.verify(alerts).markSent(RECOVERY.id(), NOW);
    }

    @Test
    @DisplayName("Given a mail server that refuses the first of two waiting alerts, when they are delivered, then neither is marked sent and the second is not tried")
    void should_keep_both_waiting_when_delivered_given_refused_first_send() {
        when(alerts.waiting()).thenReturn(List.of(PROBLEMS, RECOVERY));
        when(recipients.emailAddresses()).thenReturn(RECIPIENTS);
        when(sender.send(PROBLEMS.alert(), LAST_RUNS, RECIPIENTS)).thenReturn(false);

        delivery.deliverWaiting(LAST_RUNS);

        verify(alerts, never()).markSent(any(), any());
        verify(sender, never()).send(RECOVERY.alert(), LAST_RUNS, RECIPIENTS);
    }

    @Test
    @DisplayName("Given no waiting alert, when they are delivered, then neither the recipients nor the mail server are asked")
    void should_ask_nobody_when_delivered_given_no_waiting_alert() {
        when(alerts.waiting()).thenReturn(List.of());

        delivery.deliverWaiting(LAST_RUNS);

        verifyNoInteractions(recipients, sender);
    }
}
