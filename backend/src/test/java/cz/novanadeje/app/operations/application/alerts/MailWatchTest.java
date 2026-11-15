package cz.novanadeje.app.operations.application.alerts;

import cz.novanadeje.app.operations.application.event.OperationalAlertChanged;
import cz.novanadeje.app.operations.domain.alerts.MonitoredArea;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class MailWatchTest {

    private static final Instant NOW = Instant.parse("2026-11-05T10:00:00Z");

    private final InMemoryOperationalAlerts alerts = new InMemoryOperationalAlerts();
    private final List<Object> published = new ArrayList<>();
    private final MailWatch watch = new MailWatch(new MailAlertRecorder(new OperationalAlertService(alerts, published::add)));

    @Test
    @DisplayName("Given working mail, when a send fails, then the mail alert opens")
    void should_open_alert_when_send_fails_given_working_mail() {
        watch.failed(NOW);

        assertThat(published).containsExactly(new OperationalAlertChanged(MonitoredArea.MAIL, true, 1, 1, NOW));
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
        MailAlertRecorder unreachable = mock(MailAlertRecorder.class);
        when(unreachable.open()).thenThrow(new IllegalStateException("no connection"));
        doThrow(new IllegalStateException("no connection")).when(unreachable).record(anyBoolean(), any());
        MailWatch watchOverUnreachable = new MailWatch(unreachable);

        assertThatCode(() -> {
            watchOverUnreachable.failed(NOW);
            watchOverUnreachable.succeeded(NOW);
        }).doesNotThrowAnyException();
        verify(unreachable, never()).record(eq(false), any());
    }
}
