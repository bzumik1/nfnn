package cz.novanadeje.app.shared.infrastructure.audit;

import cz.novanadeje.app.IntegrationTest;
import cz.novanadeje.app.shared.infrastructure.lock.AdvisoryLock;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@IntegrationTest
class AdminActionAppendOnlyTest {

    @Autowired
    private JdbcClient jdbc;
    @Autowired
    private TransactionTemplate transactions;

    private UUID action;

    @BeforeEach
    void storeAnAction() {
        action = UUID.randomUUID();
        jdbc.sql("insert into admin_action (id, admin_id, action, details, performed_at) values (:id, :admin, 'PAIR_PAYMENT', 'as recorded', now())")
                .param("id", action)
                .param("admin", UUID.randomUUID())
                .update();
    }

    @AfterEach
    void releaseTheChangelogLock() {
        jdbc.sql("update databasechangeloglock set locked = false, lockgranted = null, lockedby = null").update();
    }

    @Test
    @DisplayName("Given a stored administrator's action, when a statement changes its details, then the database refuses it and the action stays as recorded")
    void should_refuse_and_keep_the_action_when_its_details_change_given_a_stored_action() {
        assertThatThrownBy(() -> jdbc.sql("update admin_action set details = 'rewritten' where id = :id").param("id", action).update())
                .isInstanceOf(DataAccessException.class)
                .hasMessageContaining("admin_action is append-only");

        assertThat(detailsOf(action)).isEqualTo("as recorded");
    }

    @Test
    @DisplayName("Given a stored administrator's action, when a statement deletes it, then the database refuses it and the action stays")
    void should_refuse_and_keep_the_action_when_deleted_given_a_stored_action() {
        assertThatThrownBy(() -> jdbc.sql("delete from admin_action where id = :id").param("id", action).update())
                .isInstanceOf(DataAccessException.class)
                .hasMessageContaining("admin_action is append-only");

        assertThat(detailsOf(action)).isEqualTo("as recorded");
    }

    @Test
    @DisplayName("Given a stored administrator's action, when the table is truncated, then the database refuses it and the action stays")
    void should_refuse_and_keep_the_action_when_the_table_is_truncated_given_a_stored_action() {
        assertThatThrownBy(() -> jdbc.sql("truncate admin_action").update())
                .isInstanceOf(DataAccessException.class)
                .hasMessageContaining("admin_action is append-only");

        assertThat(detailsOf(action)).isEqualTo("as recorded");
    }

    @Test
    @DisplayName("Given a stored administrator's action, when a statement deletes rows of other actions only, then the database lets it through")
    void should_let_through_when_a_statement_matches_no_action_given_a_stored_action() {
        int deleted = jdbc.sql("delete from admin_action where id = :id").param("id", UUID.randomUUID()).update();

        assertThat(deleted).isZero();
        assertThat(detailsOf(action)).isEqualTo("as recorded");
    }

    @Test
    @DisplayName("Given a stored administrator's action and a changelog lock left set by a migration that no longer runs, when a statement deletes the action, then the database still refuses it")
    void should_refuse_the_delete_when_a_changelog_lock_is_left_set_given_a_stored_action() {
        jdbc.sql("update databasechangeloglock set locked = true, lockgranted = now(), lockedby = 'a migration that died'").update();

        assertThatThrownBy(() -> jdbc.sql("delete from admin_action where id = :id").param("id", action).update())
                .hasMessageContaining("admin_action is append-only");

        assertThat(detailsOf(action)).isEqualTo("as recorded");
    }

    @Test
    @DisplayName("Given a stored administrator's action and a migration whose session holds the migration lock, when the migration rewrites its details, then the database lets it")
    void should_let_a_migration_rewrite_the_action_when_its_session_holds_the_migration_lock_given_a_stored_action() {
        String rewritten = transactions.execute(status -> {
            jdbc.sql("select 1 from pg_advisory_lock(:key)").param("key", AdvisoryLock.SCHEMA_MIGRATION.key()).query(Integer.class).single();
            try {
                jdbc.sql("update admin_action set details = 'rewritten by a migration' where id = :id").param("id", action).update();
                return detailsOf(action);
            } finally {
                jdbc.sql("select pg_advisory_unlock(:key)").param("key", AdvisoryLock.SCHEMA_MIGRATION.key()).query(Boolean.class).single();
            }
        });

        assertThat(rewritten).isEqualTo("rewritten by a migration");
    }

    private String detailsOf(UUID id) {
        return jdbc.sql("select details from admin_action where id = :id").param("id", id).query(String.class).single();
    }
}
