package cz.novanadeje.app.operations.application.backup;

import cz.novanadeje.app.shared.application.audit.AdminActionTrail;
import cz.novanadeje.app.shared.application.event.AdminActionPerformed;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.context.ApplicationEventPublisher;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class BackupKeyRevealRefusalsTest {

    private static final Instant NOW = Instant.parse("2026-10-29T19:00:00Z");
    private static final UUID ADMIN = UUID.fromString("019a1b2c-0000-7000-8000-00000000000a");

    private final AdminActionTrail trail = mock(AdminActionTrail.class);
    private final ApplicationEventPublisher events = mock(ApplicationEventPublisher.class);
    private final BackupKeyRevealRefusals refusals = new BackupKeyRevealRefusals(trail, events);

    @Test
    @DisplayName("Given four refusals in the last quarter of an hour, when the reveal is asked whether it is paused, then it is not")
    void should_not_pause_when_asked_given_four_refusals() {
        when(trail.countPerformedSince(ADMIN, BackupKeyRevealRefusals.REFUSED_ACTION, NOW.minus(Duration.ofMinutes(15)))).thenReturn(4L);

        assertThat(refusals.paused(ADMIN, NOW)).isFalse();
    }

    @Test
    @DisplayName("Given five refusals in the last quarter of an hour, when the reveal is asked whether it is paused, then it is")
    void should_pause_when_asked_given_five_refusals() {
        when(trail.countPerformedSince(ADMIN, BackupKeyRevealRefusals.REFUSED_ACTION, NOW.minus(Duration.ofMinutes(15)))).thenReturn(5L);

        assertThat(refusals.paused(ADMIN, NOW)).isTrue();
    }

    @Test
    @DisplayName("Given a refused second factor, when it is recorded, then the administration history gets a refusal without the key")
    void should_audit_refusal_when_recorded_given_refused_second_factor() {
        refusals.record(ADMIN, NOW);

        ArgumentCaptor<AdminActionPerformed> audited = ArgumentCaptor.forClass(AdminActionPerformed.class);
        verify(events).publishEvent(audited.capture());
        assertThat(audited.getValue().action()).isEqualTo(BackupKeyRevealRefusals.REFUSED_ACTION);
        assertThat(audited.getValue().adminId()).isEqualTo(ADMIN);
        assertThat(audited.getValue().performedAt()).isEqualTo(NOW);
        assertThat(audited.getValue().details()).contains("druhý faktor nesouhlasil");
    }
}
