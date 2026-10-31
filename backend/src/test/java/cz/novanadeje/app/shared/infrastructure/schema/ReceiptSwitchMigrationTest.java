package cz.novanadeje.app.shared.infrastructure.schema;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;

import static cz.novanadeje.app.shared.infrastructure.schema.BaselineDatabase.BASELINE_CHANGELOG;
import static cz.novanadeje.app.shared.infrastructure.schema.BaselineDatabase.CURRENT_CHANGELOG;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ReceiptSwitchMigrationTest {

    private static final String DONATION_WITH_TEST_RECEIPTS = "0190a000-0000-7000-8000-000000000023";
    private static final String PAYMENT_OF_THAT_DONATION = "0190a000-0000-7000-8000-000000000020";
    private static final String UNPAIR = "delete from donation where id = '" + DONATION_WITH_TEST_RECEIPTS + "'";

    private static PostgreSQLContainer postgres;

    @BeforeAll
    static void startDatabase() {
        postgres = new PostgreSQLContainer(DockerImageName.parse("postgres:17-alpine"));
        postgres.start();
    }

    @AfterAll
    static void stopDatabase() {
        postgres.stop();
    }

    @Nested
    @DisplayName("Given the baseline with a v2 test receipt, a frozen test receipt of the same donation and the receipt numbering at serial 41")
    class GivenTestReceipts {

        @Test
        @DisplayName("when the donation is unpaired before the switch, then its test receipts refuse it")
        void should_refuse_unpairing_when_unpaired_before_the_switch() throws Exception {
            try (var connection = baseline("before_switch")) {
                assertThatThrownBy(() -> execute(connection, UNPAIR)).isInstanceOf(SQLException.class)
                        .hasMessageContaining("violates foreign key constraint");
            }
        }

        @Test
        @DisplayName("when the current changelogs run, then the old receipt tables are gone, no receipt is left and the next receipt number is serial 1")
        void should_drop_old_tables_delete_receipts_and_restart_numbering_when_current_changelogs_run() throws Exception {
            try (var connection = baseline("switch")) {
                BaselineDatabase.migrate(connection, CURRENT_CHANGELOG);

                assertThat(BaselineDatabase.rowCounts(connection)).doesNotContainKeys("donation_receipt", "receipt_template")
                        .containsEntry("issued_receipt", 0L).containsKeys("receipt_image", "donation_receipt_signature", "receipt_signing_key");
                assertThat(BaselineDatabase.count(connection, "select nextval('donation_receipt_number_seq')")).isEqualTo(1L);
            }
        }

        @Test
        @DisplayName("when the donation is unpaired after the switch, then it goes and its bank payment stays")
        void should_unpair_when_unpaired_after_the_switch() throws Exception {
            try (var connection = baseline("after_switch")) {
                BaselineDatabase.migrate(connection, CURRENT_CHANGELOG);

                execute(connection, UNPAIR);

                assertThat(BaselineDatabase.count(connection, "select count(*) from donation where id = '" + DONATION_WITH_TEST_RECEIPTS + "'")).isZero();
                assertThat(BaselineDatabase.count(connection, "select count(*) from bank_payment where id = '" + PAYMENT_OF_THAT_DONATION + "'")).isOne();
            }
        }
    }

    private static Connection baseline(String database) throws Exception {
        try (var admin = DriverManager.getConnection(postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword())) {
            execute(admin, "create database " + database);
        }
        var connection = DriverManager.getConnection(postgres.getJdbcUrl().replace("/" + postgres.getDatabaseName(), "/" + database),
                postgres.getUsername(), postgres.getPassword());
        BaselineDatabase.migrate(connection, BASELINE_CHANGELOG);
        BaselineDatabase.fill(connection);
        execute(connection, "select setval('donation_receipt_number_seq', 41)");
        return connection;
    }

    private static void execute(Connection connection, String sql) throws SQLException {
        try (var statement = connection.createStatement()) {
            statement.execute(sql);
        }
    }
}
