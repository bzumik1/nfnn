package cz.novanadeje.app.donations.application.importing;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import cz.novanadeje.app.donations.application.report.ReportSettingsService;
import cz.novanadeje.app.donations.domain.importing.ImportAlertRepository;
import cz.novanadeje.app.donations.domain.importing.ImportFailureKind;
import cz.novanadeje.app.donations.domain.importing.ImportOutage;
import cz.novanadeje.app.donations.domain.importing.ImportRecovery;
import cz.novanadeje.app.donations.domain.importing.WaitingImportAlert;
import cz.novanadeje.app.donations.domain.report.ReportRecipients;
import cz.novanadeje.app.support.MutableClock;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.slf4j.LoggerFactory;
import org.springframework.transaction.support.SimpleTransactionStatus;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.TransactionOperations;

import java.time.Instant;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ImportAlertDeliveryTest {

    private static final Instant NOW = Instant.parse("2026-10-18T10:00:00Z");
    private static final WaitingImportAlert OUTAGE = new WaitingImportAlert(UUID.fromString("01a18e56-bdb0-775a-bd0a-a60756831301"),
            new ImportOutage(ImportFailureKind.TRANSPORT, 3, Optional.of(Instant.parse("2026-10-17T10:00:00Z")), NOW.minusSeconds(3600)));
    private static final WaitingImportAlert RECOVERY = new WaitingImportAlert(UUID.fromString("01a18e56-bdb0-775a-bd0a-a60756831302"),
            new ImportRecovery(ImportFailureKind.TRANSPORT, 4, Optional.of(Instant.parse("2026-10-17T10:00:00Z")), NOW));
    private static final ReportRecipients RECIPIENTS = ReportRecipients.parse(List.of("pavel@example.cz", "info@nfnn.cz"));

    @Mock
    private ImportAlertRepository alerts;
    @Mock
    private ReportSettingsService settings;
    @Mock
    private ImportAlertSender sender;

    private RecordingTransactions transactions;
    private ImportAlertDelivery delivery;
    private ListAppender<ILoggingEvent> logged;

    @BeforeEach
    void setUp() {
        transactions = new RecordingTransactions();
        delivery = new ImportAlertDelivery(alerts, settings, sender, transactions, new MutableClock(NOW, ZoneId.of("UTC")));
        logged = new ListAppender<>();
        logged.start();
        logger().addAppender(logged);
    }

    @AfterEach
    void tearDown() {
        logger().detachAppender(logged);
    }

    @Test
    @DisplayName("Given no waiting alert, when the alerts are delivered, then nothing is sent")
    void should_send_nothing_when_delivered_given_no_waiting_alert() {
        when(alerts.waiting()).thenReturn(List.of());

        delivery.deliverWaiting();

        verifyNoInteractions(sender, settings);
        verify(alerts, never()).markSent(any(), any());
    }

    @Test
    @DisplayName("Given two waiting alerts, when both are accepted, then they are sent oldest first and each is marked sent after its sending")
    void should_send_oldest_first_and_mark_each_when_delivered_given_mail_server_accepts() {
        when(alerts.waiting()).thenReturn(List.of(OUTAGE, RECOVERY));
        when(settings.recipients()).thenReturn(RECIPIENTS);
        when(sender.send(any(), any())).thenReturn(true);

        delivery.deliverWaiting();

        InOrder order = inOrder(sender, alerts);
        order.verify(sender).send(OUTAGE.alert(), RECIPIENTS);
        order.verify(alerts).markSent(OUTAGE.id(), NOW);
        order.verify(sender).send(RECOVERY.alert(), RECIPIENTS);
        order.verify(alerts).markSent(RECOVERY.id(), NOW);
    }

    @Test
    @DisplayName("Given two waiting alerts and the report's recipients, when the alerts are delivered, then the recipients are read once from the report settings and both alerts go to them")
    void should_send_every_alert_to_the_report_recipients_read_once_when_delivered_given_two_waiting_alerts() {
        when(alerts.waiting()).thenReturn(List.of(OUTAGE, RECOVERY));
        when(settings.recipients()).thenReturn(RECIPIENTS);
        when(sender.send(any(), any())).thenReturn(true);

        delivery.deliverWaiting();

        verify(settings).recipients();
        verify(sender).send(OUTAGE.alert(), RECIPIENTS);
        verify(sender).send(RECOVERY.alert(), RECIPIENTS);
    }

    @Test
    @DisplayName("Given a waiting alert, when it is delivered, then it is sent outside any transaction and marked sent inside one")
    void should_send_outside_and_mark_inside_a_transaction_when_delivered_given_a_waiting_alert() {
        when(alerts.waiting()).thenReturn(List.of(OUTAGE));
        when(settings.recipients()).thenReturn(RECIPIENTS);
        when(sender.send(OUTAGE.alert(), RECIPIENTS)).thenAnswer(sending -> !transactions.open());
        doAnswer(marking -> {
            assertThat(transactions.open()).as("marked inside a transaction").isTrue();
            return null;
        }).when(alerts).markSent(OUTAGE.id(), NOW);

        delivery.deliverWaiting();

        verify(alerts).markSent(OUTAGE.id(), NOW);
    }

    @Test
    @DisplayName("Given a mail server that refuses the first alert, when the alerts are delivered, then nothing is marked, the later alert waits too and a warning says it is retried")
    void should_keep_every_alert_waiting_when_delivered_given_mail_server_refuses() {
        when(alerts.waiting()).thenReturn(List.of(OUTAGE, RECOVERY));
        when(settings.recipients()).thenReturn(RECIPIENTS);
        when(sender.send(OUTAGE.alert(), RECIPIENTS)).thenReturn(false);

        delivery.deliverWaiting();

        verify(sender, never()).send(RECOVERY.alert(), RECIPIENTS);
        verify(alerts, never()).markSent(any(), any());
        assertThat(logged.list).singleElement().satisfies(line -> {
            assertThat(line.getLevel()).isEqualTo(Level.WARN);
            assertThat(line.getFormattedMessage()).isEqualTo("Fio import alert " + OUTAGE.id() + " was not delivered; it is sent again after the next import");
        });
    }

    private static final class RecordingTransactions implements TransactionOperations {

        private boolean open;

        @Override
        public <T> T execute(TransactionCallback<T> action) {
            open = true;
            try {
                return action.doInTransaction(new SimpleTransactionStatus());
            } finally {
                open = false;
            }
        }

        boolean open() {
            return open;
        }
    }

    private static Logger logger() {
        return (Logger) LoggerFactory.getLogger(ImportAlertDelivery.class);
    }
}
