package cz.novanadeje.app.donations.application.signing;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKeyId;
import cz.novanadeje.app.shared.application.audit.AdminActionTrail;
import cz.novanadeje.app.shared.application.event.AdminActionPerformed;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;

import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ReceiptSigningKeyWithdrawalRefusalsTest {

    private static final Instant NOW = Instant.parse("2026-11-20T09:30:00Z");
    private static final UUID ADMIN = UUID.fromString("019a1c00-0000-7000-8000-00000000a001");

    private final AdminActionTrail trail = mock(AdminActionTrail.class);
    private final ApplicationEventPublisher events = mock(ApplicationEventPublisher.class);
    private final ReceiptSigningKeyWithdrawalRefusals refusals = new ReceiptSigningKeyWithdrawalRefusals(trail, events);
    private final ListAppender<ILoggingEvent> lines = new ListAppender<>();

    @BeforeEach
    void log() {
        lines.start();
        logger().addAppender(lines);
    }

    @AfterEach
    void releaseLog() {
        logger().detachAppender(lines);
    }

    @Test
    @DisplayName("Given four refused withdrawals in the last quarter of an hour, when the withdrawal is asked whether it is paused, then it is not")
    void should_not_pause_when_asked_given_four_refusals() {
        when(trail.countPerformedSince(ADMIN, ReceiptSigningKeyWithdrawalRefusals.REFUSED_ACTION, NOW.minus(Duration.ofMinutes(15)))).thenReturn(4L);

        assertThat(refusals.paused(ADMIN, NOW)).isFalse();
    }

    @Test
    @DisplayName("Given five refused withdrawals in the last quarter of an hour, when the withdrawal is asked whether it is paused, then it is")
    void should_pause_when_asked_given_five_refusals() {
        when(trail.countPerformedSince(ADMIN, ReceiptSigningKeyWithdrawalRefusals.REFUSED_ACTION, NOW.minus(Duration.ofMinutes(15)))).thenReturn(5L);

        assertThat(refusals.paused(ADMIN, NOW)).isTrue();
    }

    @Test
    @DisplayName("Given a refused second factor, when it is recorded, then the administration history names the key and a WARN says it was refused")
    void should_audit_and_warn_when_recorded_given_a_refused_second_factor() {
        refusals.record(ADMIN, new ReceiptSigningKeyId("21fe31df"), NOW);

        verify(events).publishEvent(new AdminActionPerformed(ADMIN, "WITHDRAW_RECEIPT_SIGNING_KEY_REFUSED", Optional.empty(),
                "Klíč k ověřovacím QR 21fe31df se nestáhl: druhý faktor nesouhlasil", NOW));
        assertThat(lines.list).singleElement().satisfies(line -> {
            assertThat(line.getLevel()).isEqualTo(Level.WARN);
            assertThat(line.getFormattedMessage())
                    .isEqualTo("Admin " + ADMIN + " was refused the withdrawal of the receipt signing key 21fe31df: the second factor did not match");
        });
    }

    private static Logger logger() {
        return (Logger) LoggerFactory.getLogger(ReceiptSigningKeyWithdrawalRefusals.class);
    }
}
