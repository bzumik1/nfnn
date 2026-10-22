package cz.novanadeje.app.shared.infrastructure.audit;

import cz.novanadeje.app.TestcontainersConfiguration;
import cz.novanadeje.app.shared.application.event.AdminActionPerformed;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.support.TransactionTemplate;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = {"app.donations.fio.token=", "app.donations.report.cron=-", "app.contact.retention.cron=-"})
class AdminActionLogTest {

    private static final UUID ADMIN = UUID.fromString("01a18e56-bdb0-775a-bd0a-a60756831369");
    private static final UUID SUBJECT = UUID.fromString("0192f0f1-0000-7000-8000-000000000001");
    private static final Instant AT = Instant.parse("2026-10-22T10:00:00Z");

    @Autowired
    private ApplicationEventPublisher events;
    @Autowired
    private TransactionTemplate transactions;
    @Autowired
    private JdbcClient jdbc;

    @Test
    @DisplayName("Given an admin action published inside a transaction, when it commits, then the action is in admin_action with who, what, on what and when")
    void should_store_action_when_transaction_commits_given_published_event() {
        transactions.executeWithoutResult(status -> events.publishEvent(
                new AdminActionPerformed(ADMIN, "PAIR_PAYMENT", Optional.of(SUBJECT), "payment 1001 paired to donor Jana", AT)));

        Map<String, Object> row = jdbc.sql("select admin_id, action, subject_id, details, performed_at from admin_action where admin_id = ?")
                .param(ADMIN).query().singleRow();
        assertThat(row).containsEntry("admin_id", ADMIN).containsEntry("action", "PAIR_PAYMENT").containsEntry("subject_id", SUBJECT)
                .containsEntry("details", "payment 1001 paired to donor Jana");
        assertThat(((Timestamp) row.get("performed_at")).toInstant()).isEqualTo(AT);
    }

    @Test
    @DisplayName("Given an admin action published inside a transaction that rolls back, when it ends, then nothing is stored")
    void should_store_nothing_when_transaction_rolls_back_given_published_event() {
        UUID admin = UUID.randomUUID();

        assertThatThrownBy(() -> transactions.executeWithoutResult(status -> {
            events.publishEvent(new AdminActionPerformed(admin, "PAIR_PAYMENT", Optional.empty(), "details", AT));
            throw new IllegalStateException("the use case failed after the action");
        })).isInstanceOf(IllegalStateException.class);

        assertThat(jdbc.sql("select count(*) from admin_action where admin_id = ?").param(admin).query(Long.class).single()).isZero();
    }
}
