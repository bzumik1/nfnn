package cz.novanadeje.app.operations.application.alerts;

import cz.novanadeje.app.operations.application.event.OperationalAlertChanged;
import cz.novanadeje.app.operations.domain.alerts.MonitoredArea;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class MailWatchTest {

    private static final Instant NOW = Instant.parse("2026-11-05T10:00:00Z");

    private final InMemoryOperationalAlerts alerts = new InMemoryOperationalAlerts();
    private final List<Object> published = new ArrayList<>();
    private final PlatformTransactionManager transactions = mock(PlatformTransactionManager.class);
    private final MailWatch watch = new MailWatch(new OperationalAlertService(alerts, published::add), transactions);

    @Test
    @DisplayName("Given working mail, when a send fails, then the mail alert opens in a transaction of its own, so a refused send that rolls back its caller still counts")
    void should_open_alert_in_own_transaction_when_send_fails_given_working_mail() {
        watch.failed(NOW);

        assertThat(published).containsExactly(new OperationalAlertChanged(MonitoredArea.MAIL, true, 1, 1, NOW));
        verify(transactions, atLeastOnce()).getTransaction(argThat(definition ->
                definition.getPropagationBehavior() == TransactionDefinition.PROPAGATION_REQUIRES_NEW));
    }

    @Test
    @DisplayName("Given an open mail alert, when a send fails again and then one succeeds, then only the success changes it, back to working")
    void should_resolve_only_on_success_when_sent_given_open_alert() {
        watch.failed(NOW);
        watch.failed(NOW.plusSeconds(30));
        watch.succeeded(NOW.plusSeconds(60));
        watch.succeeded(NOW.plusSeconds(90));

        assertThat(published).containsExactly(new OperationalAlertChanged(MonitoredArea.MAIL, true, 1, 1, NOW),
                new OperationalAlertChanged(MonitoredArea.MAIL, false, 2, 0, NOW.plusSeconds(60)));
    }

    @Test
    @DisplayName("Given working mail, when a send succeeds, then nothing is written")
    void should_write_nothing_when_sent_given_working_mail() {
        watch.succeeded(NOW);

        assertThat(alerts.find(MonitoredArea.MAIL)).isEmpty();
        assertThat(alerts.locks()).isZero();
        assertThat(published).isEmpty();
    }

    @Test
    @DisplayName("Given a database that cannot be reached, when a send fails or succeeds, then the watch swallows it, so the sender of the mail never sees it")
    void should_swallow_failures_when_recorded_given_unreachable_database() {
        when(transactions.getTransaction(argThat(definition -> true))).thenThrow(new IllegalStateException("no connection"));

        assertThatCode(() -> {
            watch.failed(NOW);
            watch.succeeded(NOW);
        }).doesNotThrowAnyException();
        assertThat(published).isEmpty();
    }
}
