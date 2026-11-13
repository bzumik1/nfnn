package cz.novanadeje.app.operations.application.sync;

import cz.novanadeje.app.donations.DonationRowsContext;
import cz.novanadeje.app.operations.application.settings.SettingsService;
import cz.novanadeje.app.operations.domain.backup.BackupSchedule;
import cz.novanadeje.app.sharedcases.CaseRows;
import cz.novanadeje.app.support.DatabaseCleaner;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.util.AopTestUtils;

import java.time.DayOfWeek;
import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.reset;

@DonationRowsContext
class AdminOperationsSyncSnapshotTest {

    private static final Instant NOW = Instant.parse("2026-10-23T10:00:00Z");

    @Autowired
    private AdminOperationsSyncService sync;
    @Autowired
    private SettingsService settings;
    @Autowired
    private JdbcClient jdbc;

    @BeforeEach
    void administrator() {
        new DatabaseCleaner(jdbc).emptyAllTables();
        jdbc.sql("insert into donor (id, type, name, company_identifier, street, city, postal_code, email, password_hash, variable_symbol, "
                        + "preferred_locale, registered_at, email_verified_at, erased_at) values (:id, 'PERSON', 'Správce provozu', null, 'Dlouhá 12', "
                        + "'Ústí nad Labem', '400 01', 'spravce@example.cz', null, '3999999999', 'cs', :at, :at, null)")
                .param("id", CaseRows.administratorId())
                .param("at", CaseRows.timestamp(NOW.toString()))
                .update();
        jdbc.sql("insert into donor_role (donor_id, role) values (:id, 'ADMIN')").param("id", CaseRows.administratorId()).update();
    }

    @AfterEach
    void clean() {
        reset(AopTestUtils.<SettingsService>getUltimateTargetObject(settings));
        new DatabaseCleaner(jdbc).emptyAllTables();
    }

    @Test
    @DisplayName("Given a backup plan committed by another transaction while the settings are read, when the snapshot is taken, then it holds the operations as they stood when its read began")
    void should_hold_the_operations_as_they_stood_when_the_read_began_when_the_snapshot_is_taken_given_a_change_committed_meanwhile() {
        SettingsService spy = AopTestUtils.getUltimateTargetObject(settings);
        doAnswer(call -> {
            Thread meanwhile = Thread.ofPlatform().start(() -> jdbc.sql("insert into operations_backup_schedule (id, backup_time, test_restore_day, "
                    + "test_restore_time) values (1, '05:45', 3, '06:15')").update());
            meanwhile.join();
            return call.callRealMethod();
        }).when(spy).view();

        AdminOperationsSyncSnapshot snapshot = sync.snapshotFor(CaseRows.administratorId());

        assertThat(jdbc.sql("select count(*) from operations_backup_schedule").query(Integer.class).single()).as("the plan committed meanwhile").isEqualTo(1);
        assertThat(snapshot.operations().orElseThrow().backupSchedule().planned()).as("the plan in a snapshot whose read began before it")
                .isEqualTo(BackupSchedule.DEFAULT);
        reset(spy);
        assertThat(sync.snapshotFor(CaseRows.administratorId()).operations().orElseThrow().backupSchedule().planned().testRestoreDay())
                .isEqualTo(DayOfWeek.WEDNESDAY);
    }
}
