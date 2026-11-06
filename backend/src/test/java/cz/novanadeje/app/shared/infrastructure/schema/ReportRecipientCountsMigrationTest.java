package cz.novanadeje.app.shared.infrastructure.schema;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.util.LinkedHashMap;
import java.util.Map;

import static cz.novanadeje.app.shared.infrastructure.schema.BaselineDatabase.CURRENT_CHANGELOG;
import static org.assertj.core.api.Assertions.assertThat;

class ReportRecipientCountsMigrationTest {

    private static final String BEFORE_COUNTS_CHANGELOG = "migrations/before-report-recipient-counts-changelog.xml";
    private static final String ADMIN = "0190a000-0000-7000-8000-000000000010";

    @Test
    @DisplayName("Given audit records that name the monthly report's recipients by address, when the current changelogs run, then they name only how many there were and every other record stays as it was")
    void should_replace_recipient_addresses_with_their_count_when_current_changelogs_run_given_records_with_addresses() throws Exception {
        Map<String, String[]> records = new LinkedHashMap<>();
        records.put("0190a000-0000-7000-8000-000000000041", new String[]{"CHANGE_REPORT_SETTINGS",
                "Nastavení měsíčního přehledu změněno: příjemci jana@example.cz, petr@example.cz; odesílá se 5. den v měsíci v 9:00; části dárci, dary",
                "Nastavení měsíčního přehledu změněno: počet příjemců 2; odesílá se 5. den v měsíci v 9:00; části dárci, dary"});
        records.put("0190a000-0000-7000-8000-000000000042", new String[]{"CHANGE_REPORT_SETTINGS",
                "Monthly report settings changed: recipients jana@example.cz; sent on day 3 of the month; sections donors, unpaired payments",
                "Monthly report settings changed: 1 recipient(s); sent on day 3 of the month; sections donors, unpaired payments"});
        records.put("0190a000-0000-7000-8000-000000000043", new String[]{"SEND_MONTHLY_REPORT",
                "Měsíční přehled za 2026-09 ručně odeslán na info@nfnn.cz",
                "Měsíční přehled za 2026-09 ručně odeslán, počet příjemců 1"});
        records.put("0190a000-0000-7000-8000-000000000044", new String[]{"SEND_MONTHLY_REPORT",
                "Monthly report for 2026-08 sent by hand to jana@example.cz, petr@example.cz, eva@example.cz",
                "Monthly report for 2026-08 sent by hand to 3 recipient(s)"});
        records.put("0190a000-0000-7000-8000-000000000045", new String[]{"SEND_MONTHLY_REPORT",
                "Měsíční přehled za 2026-10 ručně odeslán, počet příjemců 2",
                "Měsíční přehled za 2026-10 ručně odeslán, počet příjemců 2"});
        records.put("0190a000-0000-7000-8000-000000000046", new String[]{"CHANGE_SETTINGS",
                "Změněna nastavení: MAIL_HOST; backend se restartuje, aby je použil",
                "Změněna nastavení: MAIL_HOST; backend se restartuje, aby je použil"});
        try (var postgres = new PostgreSQLContainer(DockerImageName.parse("postgres:17-alpine"))) {
            postgres.start();
            try (var connection = DriverManager.getConnection(postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword())) {
                BaselineDatabase.migrate(connection, BEFORE_COUNTS_CHANGELOG);
                for (var record : records.entrySet()) {
                    insert(connection, record.getKey(), record.getValue()[0], record.getValue()[1]);
                }

                BaselineDatabase.migrate(connection, CURRENT_CHANGELOG);

                for (var record : records.entrySet()) {
                    assertThat(detailsOf(connection, record.getKey())).as(record.getValue()[1]).isEqualTo(record.getValue()[2]);
                }
            }
        }
    }

    private static void insert(Connection connection, String id, String action, String details) throws SQLException {
        try (var statement = connection.prepareStatement(
                "insert into admin_action (id, admin_id, action, details, performed_at) values (?::uuid, ?::uuid, ?, ?, now())")) {
            statement.setString(1, id);
            statement.setString(2, ADMIN);
            statement.setString(3, action);
            statement.setString(4, details);
            statement.executeUpdate();
        }
    }

    private static String detailsOf(Connection connection, String id) throws SQLException {
        try (var statement = connection.prepareStatement("select details from admin_action where id = ?::uuid")) {
            statement.setString(1, id);
            try (var result = statement.executeQuery()) {
                result.next();
                return result.getString(1);
            }
        }
    }
}
