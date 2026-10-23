package cz.novanadeje.app.donations.infrastructure.persistence;

import cz.novanadeje.app.donations.domain.importing.ImportAlertRepository;
import cz.novanadeje.app.donations.domain.importing.ImportFailureKind;
import cz.novanadeje.app.donations.domain.importing.ImportOutage;
import cz.novanadeje.app.donations.domain.importing.ImportRecovery;
import cz.novanadeje.app.donations.domain.importing.WaitingImportAlert;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import static cz.novanadeje.app.donations.infrastructure.persistence.BankPersistenceTestConfiguration.NOW;
import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(BankPersistenceTestConfiguration.class)
class JpaImportAlertRepositoryTest {

    private static final Instant LAST_SUCCESS = Instant.parse("2026-10-16T10:00:00Z");
    private static final ImportOutage OUTAGE = new ImportOutage(ImportFailureKind.TRANSPORT, 3, Optional.of(LAST_SUCCESS), NOW);
    private static final ImportRecovery RECOVERY = new ImportRecovery(ImportFailureKind.UNAUTHORIZED, 2, Optional.empty(), NOW.plusSeconds(7200));

    @Autowired
    private ImportAlertRepository alerts;
    @Autowired
    private JdbcClient jdbc;

    @Test
    @DisplayName("Given an outage and a recovery added an hour apart, when the waiting alerts are read, then both come back whole, oldest first")
    void should_return_waiting_alerts_oldest_first_when_read_given_two_added() {
        alerts.add(RECOVERY, NOW.plusSeconds(3600));
        alerts.add(OUTAGE, NOW);

        assertThat(alerts.waiting()).extracting(WaitingImportAlert::alert).containsExactly(OUTAGE, RECOVERY);
    }

    @Test
    @DisplayName("Given a waiting alert, when it is marked sent, then it no longer waits and keeps the time it was sent")
    void should_stop_waiting_when_marked_sent_given_waiting_alert() {
        alerts.add(OUTAGE, NOW);
        WaitingImportAlert waiting = alerts.waiting().getFirst();

        alerts.markSent(waiting.id(), NOW.plusSeconds(60));

        assertThat(alerts.waiting()).isEmpty();
        assertThat(jdbc.sql("select outcome from donation_import_alert").query(String.class).single()).isEqualTo("SENT");
        assertThat(jdbc.sql("select settled_at from donation_import_alert").query(Instant.class).single()).isEqualTo(NOW.plusSeconds(60));
    }

    @Test
    @DisplayName("Given a waiting outage and a sent one, when the waiting outages are dropped, then only the waiting one is marked dropped")
    void should_drop_only_waiting_outages_when_dropped_given_waiting_and_sent_outage() {
        alerts.add(OUTAGE, NOW.minusSeconds(86400));
        alerts.markSent(alerts.waiting().getFirst().id(), NOW.minusSeconds(86400));
        alerts.add(OUTAGE, NOW);

        alerts.dropWaitingOutages(NOW.plusSeconds(60));

        assertThat(alerts.waiting()).isEmpty();
        assertThat(jdbc.sql("select outcome from donation_import_alert order by created_at").query(String.class).list())
                .containsExactly("SENT", "DROPPED");
    }

    @Test
    @DisplayName("Given a waiting recovery, when the waiting outages are dropped, then the recovery still waits")
    void should_keep_recovery_when_outages_dropped_given_waiting_recovery() {
        alerts.add(RECOVERY, NOW);

        alerts.dropWaitingOutages(NOW.plusSeconds(60));

        assertThat(alerts.waiting()).extracting(WaitingImportAlert::alert).isEqualTo(List.of(RECOVERY));
    }
}
