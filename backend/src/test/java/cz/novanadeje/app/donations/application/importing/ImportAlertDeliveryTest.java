package cz.novanadeje.app.donations.application.importing;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import cz.novanadeje.app.donations.domain.importing.ImportAlertRepository;
import cz.novanadeje.app.donations.domain.importing.ImportFailureKind;
import cz.novanadeje.app.donations.domain.importing.ImportOutage;
import cz.novanadeje.app.donations.domain.importing.ImportRecovery;
import cz.novanadeje.app.donations.domain.importing.WaitingImportAlert;
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

import java.time.Instant;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
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

    @Mock
    private ImportAlertRepository alerts;
    @Mock
    private ImportAlertSender sender;

    private ImportAlertDelivery delivery;
    private ListAppender<ILoggingEvent> logged;

    @BeforeEach
    void setUp() {
        delivery = new ImportAlertDelivery(alerts, sender, new MutableClock(NOW, ZoneId.of("UTC")));
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

        verifyNoInteractions(sender);
        verify(alerts, never()).markSent(any(), any());
    }

    @Test
    @DisplayName("Given two waiting alerts, when both are accepted, then they are sent oldest first and each is marked sent after its sending")
    void should_send_oldest_first_and_mark_each_when_delivered_given_mail_server_accepts() {
        when(alerts.waiting()).thenReturn(List.of(OUTAGE, RECOVERY));
        when(sender.send(any())).thenReturn(true);

        delivery.deliverWaiting();

        InOrder order = inOrder(sender, alerts);
        order.verify(sender).send(OUTAGE.alert());
        order.verify(alerts).markSent(OUTAGE.id(), NOW);
        order.verify(sender).send(RECOVERY.alert());
        order.verify(alerts).markSent(RECOVERY.id(), NOW);
    }

    @Test
    @DisplayName("Given a mail server that refuses the first alert, when the alerts are delivered, then nothing is marked, the later alert waits too and a warning says it is retried")
    void should_keep_every_alert_waiting_when_delivered_given_mail_server_refuses() {
        when(alerts.waiting()).thenReturn(List.of(OUTAGE, RECOVERY));
        when(sender.send(OUTAGE.alert())).thenReturn(false);

        delivery.deliverWaiting();

        verify(sender, never()).send(RECOVERY.alert());
        verify(alerts, never()).markSent(any(), any());
        assertThat(logged.list).singleElement().satisfies(line -> {
            assertThat(line.getLevel()).isEqualTo(Level.WARN);
            assertThat(line.getFormattedMessage()).isEqualTo("Fio import alert " + OUTAGE.id() + " was not delivered; it is sent again after the next import");
        });
    }

    private static Logger logger() {
        return (Logger) LoggerFactory.getLogger(ImportAlertDelivery.class);
    }
}
