package cz.novanadeje.app.donors.domain;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThatNoException;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class DonorSearchPageTest {

    @Test
    @DisplayName("Given a first page and a limit from 1 to 100, when the search page is checked, then it passes")
    void should_pass_when_checked_given_a_page_within_the_bounds() {
        assertThatNoException().isThrownBy(() -> DonorSearchPage.check(0, 1));
        assertThatNoException().isThrownBy(() -> DonorSearchPage.check(3, DonorSearchPage.MAX_LIMIT));
    }

    @Test
    @DisplayName("Given a negative page, a limit below 1 or above 100, when the search page is checked, then it is refused")
    void should_refuse_when_checked_given_a_page_outside_the_bounds() {
        assertThatThrownBy(() -> DonorSearchPage.check(-1, 20)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> DonorSearchPage.check(0, 0)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> DonorSearchPage.check(0, 101)).isInstanceOf(IllegalArgumentException.class);
    }
}
