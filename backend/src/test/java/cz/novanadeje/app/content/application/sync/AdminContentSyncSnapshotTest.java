package cz.novanadeje.app.content.application.sync;

import cz.novanadeje.app.content.application.people.FoundersNoteService;
import cz.novanadeje.app.donations.DonationRowsContext;
import cz.novanadeje.app.sharedcases.CaseRows;
import cz.novanadeje.app.support.DatabaseCleaner;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.util.AopTestUtils;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.reset;

@DonationRowsContext
class AdminContentSyncSnapshotTest {

    private static final Instant NOW = Instant.parse("2026-10-23T10:00:00Z");
    private static final String WRITTEN_MEANWHILE = "Řádek zapsaný mezitím";

    @Autowired
    private AdminContentSyncService sync;
    @Autowired
    private FoundersNoteService foundersNote;
    @Autowired
    private JdbcClient jdbc;

    @BeforeEach
    void administrator() {
        new DatabaseCleaner(jdbc).emptyAllTables();
        insertAdministrator(jdbc);
    }

    @AfterEach
    void clean() {
        reset(AopTestUtils.<FoundersNoteService>getUltimateTargetObject(foundersNote));
        new DatabaseCleaner(jdbc).emptyAllTables();
    }

    @Test
    @DisplayName("Given a line under the board committed by another transaction while the content is read, when the snapshot is taken, then it holds the content as it stood when its read began")
    void should_hold_the_content_as_it_stood_when_the_read_began_when_the_snapshot_is_taken_given_a_change_committed_meanwhile() {
        FoundersNoteService spy = AopTestUtils.getUltimateTargetObject(foundersNote);
        doAnswer(call -> {
            Thread meanwhile = Thread.ofPlatform().start(() -> jdbc.sql("insert into content_people_footnote (id, text, updated_at) values (1, :text, :at)")
                    .param("text", WRITTEN_MEANWHILE).param("at", CaseRows.timestamp(NOW.toString())).update());
            meanwhile.join();
            return call.callRealMethod();
        }).when(spy).current();

        AdminContentSyncSnapshot snapshot = sync.snapshotFor(CaseRows.administratorId());

        assertThat(jdbc.sql("select text from content_people_footnote").query(String.class).single()).as("the line committed meanwhile")
                .isEqualTo(WRITTEN_MEANWHILE);
        assertThat(snapshot.content().orElseThrow().peopleFootnote().view()).as("the line in a snapshot whose read began before it").isEmpty();
        reset(spy);
        assertThat(sync.snapshotFor(CaseRows.administratorId()).content().orElseThrow().peopleFootnote().view()).contains(WRITTEN_MEANWHILE);
    }

    private static void insertAdministrator(JdbcClient jdbc) {
        jdbc.sql("insert into donor (id, type, name, company_identifier, street, city, postal_code, email, password_hash, variable_symbol, "
                        + "preferred_locale, registered_at, email_verified_at, erased_at) values (:id, 'PERSON', 'Správce obsahu', null, 'Dlouhá 12', "
                        + "'Ústí nad Labem', '400 01', 'spravce@example.cz', null, '3999999999', 'cs', :at, :at, null)")
                .param("id", CaseRows.administratorId())
                .param("at", CaseRows.timestamp(NOW.toString()))
                .update();
        jdbc.sql("insert into donor_role (donor_id, role) values (:id, 'ADMIN')").param("id", CaseRows.administratorId()).update();
    }
}
