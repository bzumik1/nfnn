package cz.novanadeje.app.shared.infrastructure.schema;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

import java.sql.DriverManager;

import static cz.novanadeje.app.shared.infrastructure.schema.BaselineDatabase.CURRENT_CHANGELOG;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class AdminActionMigrationTest {

    private static final String REWRITING_CHANGELOG = "migrations/rewrite-admin-action-changelog.xml";
    private static final String TRAIL_APPEND_ONLY_BEFORE_COUNTS_CHANGELOG = "migrations/append-only-trail-before-report-recipient-counts-changelog.xml";

    @Test
    @DisplayName("Given a migrated database with administrators' actions, which the database keeps append-only, when a later changeset rewrites and deletes some, then Liquibase applies it while the application still cannot")
    void should_apply_a_changeset_that_rewrites_the_trail_when_liquibase_runs_it_given_an_append_only_trail() throws Exception {
        try (var postgres = new PostgreSQLContainer(DockerImageName.parse("postgres:17-alpine"))) {
            postgres.start();
            try (var connection = DriverManager.getConnection(postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword())) {
                BaselineDatabase.migrate(connection, CURRENT_CHANGELOG);
                connection.setAutoCommit(true);
                try (var statement = connection.createStatement()) {
                    statement.execute("""
                            insert into admin_action (id, admin_id, action, details, performed_at) values
                            ('0190a000-0000-7000-8000-000000000001', '0190a000-0000-7000-8000-000000000009', 'CHANGE_REPORT_SETTINGS', 'as recorded', now()),
                            ('0190a000-0000-7000-8000-000000000002', '0190a000-0000-7000-8000-000000000009', 'SEND_MONTHLY_REPORT', 'as recorded', now())
                            """);
                }
                assertThatThrownBy(() -> {
                    try (var statement = connection.createStatement()) {
                        statement.execute("update admin_action set details = 'rewritten by the application'");
                    }
                }).hasMessageContaining("admin_action is append-only");

                BaselineDatabase.migrate(connection, REWRITING_CHANGELOG);
                connection.setAutoCommit(true);

                assertThat(BaselineDatabase.count(connection, "select count(*) from admin_action where details = 'rewritten by a migration'")).isEqualTo(1);
                assertThat(BaselineDatabase.count(connection, "select count(*) from admin_action")).isEqualTo(1);
                assertThat(BaselineDatabase.count(connection, "select count(*) from pg_locks where locktype = 'advisory' and pid = pg_backend_pid()")).isZero();
                assertThatThrownBy(() -> {
                    try (var statement = connection.createStatement()) {
                        statement.execute("delete from admin_action");
                    }
                }).hasMessageContaining("admin_action is append-only");
            }
        }
    }

    @Test
    @DisplayName("Given a database whose trail became append-only before the recipient counts changeset ran, when the current changelogs run, then that changeset still rewrites the addresses into counts")
    void should_rewrite_recipient_addresses_when_the_counts_changeset_runs_after_the_trail_became_append_only_given_records_with_addresses() throws Exception {
        try (var postgres = new PostgreSQLContainer(DockerImageName.parse("postgres:17-alpine"))) {
            postgres.start();
            try (var connection = DriverManager.getConnection(postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword())) {
                BaselineDatabase.migrate(connection, TRAIL_APPEND_ONLY_BEFORE_COUNTS_CHANGELOG);
                connection.setAutoCommit(true);
                try (var statement = connection.createStatement()) {
                    statement.execute("""
                            insert into admin_action (id, admin_id, action, details, performed_at) values
                            ('0190a000-0000-7000-8000-000000000041', '0190a000-0000-7000-8000-000000000009', 'SEND_MONTHLY_REPORT',
                             'Monthly report for 2026-08 sent by hand to jana@example.cz, petr@example.cz', now())
                            """);
                }
                assertThatThrownBy(() -> {
                    try (var statement = connection.createStatement()) {
                        statement.execute("update admin_action set details = 'rewritten by the application'");
                    }
                }).hasMessageContaining("admin_action is append-only");

                BaselineDatabase.migrate(connection, CURRENT_CHANGELOG);
                connection.setAutoCommit(true);

                assertThat(BaselineDatabase.appliedChangesets(connection))
                        .containsSubsequence("shared/007-keep-admin-action-append-only", "shared/005-count-report-recipients-in-admin-action");
                assertThat(BaselineDatabase.count(connection,
                        "select count(*) from admin_action where details = 'Monthly report for 2026-08 sent by hand to 2 recipient(s)'")).isEqualTo(1);
            }
        }
    }
}
