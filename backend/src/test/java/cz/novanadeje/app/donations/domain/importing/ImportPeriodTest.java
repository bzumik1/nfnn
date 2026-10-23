package cz.novanadeje.app.donations.domain.importing;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

class ImportPeriodTest {

    @Test
    @DisplayName("Given an end before the start, when a period is created, then it is rejected")
    void should_reject_when_created_given_end_before_start() {
        assertThatIllegalArgumentException().isThrownBy(() -> period("2026-10-17", "2026-10-16"));
    }

    @Test
    @DisplayName("Given a single day, when a period is created, then it is accepted")
    void should_accept_when_created_given_single_day() {
        assertThat(period("2026-10-17", "2026-10-17").from()).isEqualTo(LocalDate.of(2026, 10, 17));
    }

    @Test
    @DisplayName("Given a period that starts the day after the other ends, when they are compared, then they adjoin")
    void should_adjoin_when_compared_given_next_day_starts_the_other() {
        assertThat(period("2026-10-01", "2026-10-10").adjoinsOrOverlaps(period("2026-10-11", "2026-10-20"))).isTrue();
        assertThat(period("2026-10-11", "2026-10-20").adjoinsOrOverlaps(period("2026-10-01", "2026-10-10"))).isTrue();
    }

    @Test
    @DisplayName("Given periods that share days, when they are compared, then they overlap")
    void should_overlap_when_compared_given_shared_days() {
        assertThat(period("2026-10-01", "2026-10-10").adjoinsOrOverlaps(period("2026-10-05", "2026-10-20"))).isTrue();
    }

    @Test
    @DisplayName("Given a day between two periods, when they are compared, then they neither adjoin nor overlap")
    void should_neither_adjoin_nor_overlap_when_compared_given_a_day_between() {
        assertThat(period("2026-10-01", "2026-10-10").adjoinsOrOverlaps(period("2026-10-12", "2026-10-20"))).isFalse();
        assertThat(period("2026-10-12", "2026-10-20").adjoinsOrOverlaps(period("2026-10-01", "2026-10-10"))).isFalse();
    }

    @Test
    @DisplayName("Given an inner period, when it is compared, then the outer one contains it")
    void should_contain_when_compared_given_inner_period() {
        assertThat(period("2026-10-01", "2026-10-20").contains(period("2026-10-05", "2026-10-20"))).isTrue();
        assertThat(period("2026-10-01", "2026-10-20").contains(period("2026-09-30", "2026-10-05"))).isFalse();
        assertThat(period("2026-10-01", "2026-10-20").contains(period("2026-10-05", "2026-10-21"))).isFalse();
    }

    @Test
    @DisplayName("Given overlapping periods, when they are united, then the result spans both")
    void should_span_both_when_united_given_overlapping_periods() {
        assertThat(period("2026-10-01", "2026-10-10").union(period("2026-10-05", "2026-10-20"))).isEqualTo(period("2026-10-01", "2026-10-20"));
    }

    @Test
    @DisplayName("Given a period, when it is printed, then it prints as from/to")
    void should_print_from_slash_to_when_printed_given_period() {
        assertThat(period("2026-10-01", "2026-10-10")).hasToString("2026-10-01/2026-10-10");
    }

    static ImportPeriod period(String from, String to) {
        return new ImportPeriod(LocalDate.parse(from), LocalDate.parse(to));
    }
}
