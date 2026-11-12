package cz.novanadeje.app.shared.infrastructure.schema;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class BaselineChangelogTest {

    private static final List<String> MASTER = List.of(
            "db/changelog/content/001_a.xml", "db/changelog/content/002_b.xml", "db/changelog/content/004_d.xml",
            "db/changelog/donors/001_a.xml", "db/changelog/donors/002_b.xml",
            "db/changelog/shared/001_a.xml");

    @Test
    @DisplayName("Given a baseline taken at the deployed revision that names the master's files in its order, leaving out those merged later, when it is checked, then nothing is reported")
    void should_report_nothing_when_checked_given_the_deployed_files_in_master_order() {
        var baseline = new BaselineChangelog("d953749", List.of(
                "db/changelog/content/001_a.xml", "db/changelog/content/004_d.xml", "db/changelog/donors/001_a.xml", "db/changelog/shared/001_a.xml"));

        assertThat(baseline.problems(MASTER, "d953749")).isEmpty();
    }

    @Test
    @DisplayName("Given a baseline taken at an older revision than the deployed one, when it is checked, then the move to the deployed revision is asked for")
    void should_ask_for_the_deployed_revision_when_checked_given_a_baseline_behind_the_server() {
        var baseline = new BaselineChangelog("6226e16", List.of("db/changelog/content/001_a.xml"));

        assertThat(baseline.problems(MASTER, "d953749")).containsExactly("the baseline is taken at 6226e16, but the server runs d953749"
                + " (.github/deployed-revision): include every changelog that `git ls-tree -r --name-only d953749 backend/src/main/resources/db/changelog/`"
                + " lists, in the master's order, give migrations/baseline-data.sql a row for every table they create and set the baseline revision to d953749");
    }

    @Test
    @DisplayName("Given a baseline with a file out of the master's order, a file twice and a file the master does not have, when it is checked, then each is reported")
    void should_report_each_when_checked_given_a_misordered_repeated_and_unknown_file() {
        var baseline = new BaselineChangelog("d953749", List.of(
                "db/changelog/donors/001_a.xml", "db/changelog/content/001_a.xml", "db/changelog/content/001_a.xml", "db/changelog/content/003_c.xml"));

        assertThat(baseline.problems(MASTER, "d953749")).containsExactly(
                "db/changelog/content/003_c.xml is no changelog of the master",
                "db/changelog/content/001_a.xml is included twice",
                "the baseline does not follow the master's order, which is [db/changelog/content/001_a.xml, db/changelog/donors/001_a.xml]");
    }
}
