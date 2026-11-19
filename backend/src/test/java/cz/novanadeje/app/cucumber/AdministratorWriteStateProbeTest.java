package cz.novanadeje.app.cucumber;

import cz.novanadeje.app.IntegrationTest;
import cz.novanadeje.app.cucumber.AdministratorWriteAudits.StateProbe;
import cz.novanadeje.app.support.DatabaseCleaner;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

@IntegrationTest
class AdministratorWriteStateProbeTest {

    private static final StateProbe PROJECT_ORDER = new StateProbe("planted: the project order", List.of("content_project_order"));

    @Autowired
    private JdbcClient jdbc;

    @BeforeEach
    void emptyTables() {
        new DatabaseCleaner(jdbc).emptyAllTables();
    }

    @Test
    @DisplayName("Given a probed table, when a row is inserted, changed, written again unchanged and deleted, then the state differs after each change and stays the same after the unchanged write")
    void should_tell_every_change_from_an_unchanged_write_when_read_given_a_probed_table() {
        String empty = PROJECT_ORDER.stateIn(jdbc);
        jdbc.sql("insert into content_project_order (id, project_order, updated_at) values (1, 'YEAR', timestamp with time zone '2026-11-19 10:00:00+00')").update();
        String inserted = PROJECT_ORDER.stateIn(jdbc);
        jdbc.sql("update content_project_order set project_order = 'CATEGORY_THEN_YEAR'").update();
        String changed = PROJECT_ORDER.stateIn(jdbc);
        jdbc.sql("update content_project_order set project_order = 'CATEGORY_THEN_YEAR'").update();
        String unchanged = PROJECT_ORDER.stateIn(jdbc);
        jdbc.sql("delete from content_project_order").update();

        assertThat(inserted).isNotEqualTo(empty);
        assertThat(changed).isNotEqualTo(inserted);
        assertThat(unchanged).isEqualTo(changed);
        assertThat(PROJECT_ORDER.stateIn(jdbc)).isEqualTo(empty);
    }
}
