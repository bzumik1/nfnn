package cz.novanadeje.app.shared.infrastructure.schema;

import cz.novanadeje.app.TestcontainersConfiguration;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

import static cz.novanadeje.app.shared.infrastructure.schema.BaselineDatabase.CURRENT_CHANGELOG;
import static org.assertj.core.api.Assertions.assertThat;

class PendingSecondFactorStepMigrationTest {

    private static final String BEFORE_CLEARING_CHANGELOG = "migrations/before-pending-second-factor-steps-changelog.xml";
    private static final String PENDING_WITH_STEP = "0190a000-0000-7000-8000-000000000051";
    private static final String PENDING_WITHOUT_STEP = "0190a000-0000-7000-8000-000000000052";
    private static final String CONFIRMED = "0190a000-0000-7000-8000-000000000053";

    @Test
    @DisplayName("Given a pending second factor with a last used step beside a pending one without and a confirmed one, when the current changelogs run, then only the pending one loses its step and every factor keeps its confirmation")
    void should_clear_the_step_of_a_pending_factor_only_when_current_changelogs_run_given_a_pending_factor_with_a_step() throws Exception {
        try (var postgres = TestcontainersConfiguration.newPostgres()) {
            postgres.start();
            try (var connection = DriverManager.getConnection(postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword())) {
                BaselineDatabase.migrate(connection, BEFORE_CLEARING_CHANGELOG);
                insertFactor(connection, PENDING_WITH_STEP, "1000000051", null, 59000000L);
                insertFactor(connection, PENDING_WITHOUT_STEP, "1000000052", null, null);
                insertFactor(connection, CONFIRMED, "1000000053", "2026-01-03T09:01:00Z", 59000001L);

                BaselineDatabase.migrate(connection, CURRENT_CHANGELOG);

                assertThat(factorOf(connection, PENDING_WITH_STEP)).containsExactly("pending", null);
                assertThat(factorOf(connection, PENDING_WITHOUT_STEP)).containsExactly("pending", null);
                assertThat(factorOf(connection, CONFIRMED)).containsExactly("confirmed", "59000001");
            }
        }
    }

    private static void insertFactor(Connection connection, String donorId, String variableSymbol, String confirmedAt, Long lastUsedStep) throws SQLException {
        try (var statement = connection.prepareStatement("""
                insert into donor (id, type, name, street, city, postal_code, email, variable_symbol, preferred_locale, registered_at)
                values (?::uuid, 'PERSON', 'Testovací Dárce', 'Ulice 1', 'Město', '110 00', ?, ?, 'cs', '2026-01-01T09:00:00Z')
                """)) {
            statement.setString(1, donorId);
            statement.setString(2, "darce-" + variableSymbol + "@example.cz");
            statement.setString(3, variableSymbol);
            statement.executeUpdate();
        }
        try (var statement = connection.prepareStatement("""
                insert into donor_second_factor (donor_id, secret, created_at, confirmed_at, last_used_step)
                values (?::uuid, 'JBSWY3DPEHPK3PXP', '2026-01-03T09:00:00Z', ?::timestamptz, ?)
                """)) {
            statement.setString(1, donorId);
            statement.setString(2, confirmedAt);
            statement.setObject(3, lastUsedStep);
            statement.executeUpdate();
        }
    }

    private static List<String> factorOf(Connection connection, String donorId) throws SQLException {
        try (var statement = connection.prepareStatement("""
                select case when confirmed_at is null then 'pending' else 'confirmed' end, last_used_step::text
                from donor_second_factor where donor_id = ?::uuid
                """)) {
            statement.setString(1, donorId);
            try (var result = statement.executeQuery()) {
                result.next();
                return new ArrayList<>(Arrays.asList(result.getString(1), result.getString(2)));
            }
        }
    }
}
