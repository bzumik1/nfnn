package cz.novanadeje.app.donations.domain.importing;

import org.junit.jupiter.api.Test;

import java.time.LocalDate;

import static cz.novanadeje.app.donations.domain.importing.ImportPeriodTest.period;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

class ImportCoverageTest {

    @Test
    void should_be_empty_when_created_given_none() {
        assertThat(ImportCoverage.none().isEmpty()).isTrue();
        assertThat(ImportCoverage.none().period()).isEmpty();
    }

    @Test
    void should_reject_when_created_given_only_one_bound() {
        assertThatIllegalArgumentException().isThrownBy(() -> new ImportCoverage(LocalDate.of(2026, 10, 1), null));
        assertThatIllegalArgumentException().isThrownBy(() -> new ImportCoverage(null, LocalDate.of(2026, 10, 1)));
    }

    @Test
    void should_reject_when_created_given_end_before_start() {
        assertThatIllegalArgumentException().isThrownBy(() -> new ImportCoverage(LocalDate.of(2026, 10, 2), LocalDate.of(2026, 10, 1)));
    }

    @Test
    void should_become_the_covered_period_when_extended_given_empty_coverage() {
        CoverageChange change = ImportCoverage.none().extendedBy(period("2026-07-20", "2026-10-17"));

        assertThat(change.coverage()).isEqualTo(coverage("2026-07-20", "2026-10-17"));
        assertThat(change.gap()).isEmpty();
    }

    @Test
    void should_unite_when_extended_given_overlapping_period() {
        CoverageChange change = coverage("2026-07-20", "2026-10-17").extendedBy(period("2026-10-14", "2026-10-18"));

        assertThat(change.coverage()).isEqualTo(coverage("2026-07-20", "2026-10-18"));
        assertThat(change.gap()).isEmpty();
    }

    @Test
    void should_unite_when_extended_given_adjoining_period() {
        CoverageChange change = coverage("2026-07-20", "2026-10-17").extendedBy(period("2026-10-18", "2026-10-18"));

        assertThat(change.coverage()).isEqualTo(coverage("2026-07-20", "2026-10-18"));
        assertThat(change.gap()).isEmpty();
    }

    @Test
    void should_unite_when_extended_given_deeper_period_reaching_the_coverage() {
        CoverageChange change = coverage("2026-07-20", "2026-10-17").extendedBy(period("2025-01-01", "2026-10-17"));

        assertThat(change.coverage()).isEqualTo(coverage("2025-01-01", "2026-10-17"));
        assertThat(change.gap()).isEmpty();
    }

    @Test
    void should_open_gap_and_replace_coverage_when_extended_given_later_detached_period() {
        CoverageChange change = coverage("2026-01-01", "2026-03-31").extendedBy(period("2026-07-20", "2026-10-17"));

        assertThat(change.coverage()).isEqualTo(coverage("2026-07-20", "2026-10-17"));
        assertThat(change.gap()).contains(period("2026-04-01", "2026-07-19"));
    }

    @Test
    void should_keep_coverage_and_report_gap_when_extended_given_earlier_detached_period() {
        CoverageChange change = coverage("2026-07-20", "2026-10-17").extendedBy(period("2026-01-01", "2026-03-31"));

        assertThat(change.coverage()).isEqualTo(coverage("2026-07-20", "2026-10-17"));
        assertThat(change.gap()).contains(period("2026-04-01", "2026-07-19"));
    }

    static ImportCoverage coverage(String from, String to) {
        return new ImportCoverage(LocalDate.parse(from), LocalDate.parse(to));
    }
}
