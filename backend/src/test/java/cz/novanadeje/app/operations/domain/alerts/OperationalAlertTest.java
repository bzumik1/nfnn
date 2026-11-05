package cz.novanadeje.app.operations.domain.alerts;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

class OperationalAlertTest {

    private static final Instant NOW = Instant.parse("2026-11-05T09:00:00Z");

    @Test
    @DisplayName("Given a closed alert, when it opens, then it is open since then and counts one change, and opening it again changes nothing")
    void should_open_once_when_opened_given_closed_alert() {
        OperationalAlert opened = OperationalAlert.closed(MonitoredArea.MAIL).openedAt(NOW).orElseThrow();

        assertThat(opened).isEqualTo(new OperationalAlert(MonitoredArea.MAIL, Optional.of(NOW), 1));
        assertThat(opened.open()).isTrue();
        assertThat(opened.openedAt(NOW.plusSeconds(60))).isEmpty();
    }

    @Test
    @DisplayName("Given an open alert, when it is resolved, then it is closed and counts another change, and resolving it again changes nothing")
    void should_resolve_once_when_resolved_given_open_alert() {
        OperationalAlert resolved = OperationalAlert.closed(MonitoredArea.BACKUPS).openedAt(NOW).orElseThrow().resolvedAt(NOW.plusSeconds(60)).orElseThrow();

        assertThat(resolved).isEqualTo(new OperationalAlert(MonitoredArea.BACKUPS, Optional.empty(), 2));
        assertThat(resolved.open()).isFalse();
        assertThat(resolved.resolvedAt(NOW.plusSeconds(120))).isEmpty();
    }

    @Test
    @DisplayName("Given an alert opened after a success was seen, when that older success is recorded, then the alert stays open")
    void should_stay_open_when_resolved_given_success_older_than_the_opening() {
        OperationalAlert opened = OperationalAlert.closed(MonitoredArea.MAIL).openedAt(NOW).orElseThrow();

        assertThat(opened.resolvedAt(NOW.minusSeconds(1))).isEmpty();
        assertThat(opened.resolvedAt(NOW)).isPresent();
    }

    @Test
    @DisplayName("Given no area or a negative count, when an alert is built, then it is refused")
    void should_refuse_when_built_given_no_area_or_negative_count() {
        assertThatIllegalArgumentException().isThrownBy(() -> new OperationalAlert(null, Optional.empty(), 0));
        assertThatIllegalArgumentException().isThrownBy(() -> new OperationalAlert(MonitoredArea.MAIL, Optional.empty(), -1));
    }
}
