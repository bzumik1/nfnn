package cz.novanadeje.app.content.domain;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThatNoException;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class PublicListPageTest {

    @Test
    @DisplayName("Given a first page and a size from 1 to 50, when the page is checked, then it passes")
    void should_pass_when_checked_given_a_page_within_the_bounds() {
        assertThatNoException().isThrownBy(() -> PublicListPage.check(0, 1));
        assertThatNoException().isThrownBy(() -> PublicListPage.check(7, PublicListPage.MAX_SIZE));
    }

    @Test
    @DisplayName("Given a negative page, a size below 1 or above 50, when the page is checked, then it is refused")
    void should_refuse_when_checked_given_a_page_outside_the_bounds() {
        assertThatThrownBy(() -> PublicListPage.check(-1, 10)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> PublicListPage.check(0, 0)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> PublicListPage.check(0, 51)).isInstanceOf(IllegalArgumentException.class);
    }
}
