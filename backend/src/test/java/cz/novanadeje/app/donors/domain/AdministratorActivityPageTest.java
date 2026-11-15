package cz.novanadeje.app.donors.domain;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThatNoException;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class AdministratorActivityPageTest {

    @Test
    @DisplayName("Given a size from 1 to 200, when the activity page is checked, then it passes")
    void should_pass_when_checked_given_a_size_within_the_bounds() {
        assertThatNoException().isThrownBy(() -> AdministratorActivityPage.check(1));
        assertThatNoException().isThrownBy(() -> AdministratorActivityPage.check(AdministratorActivityPage.MAX_SIZE));
    }

    @Test
    @DisplayName("Given a size below 1 or above 200, when the activity page is checked, then it is refused")
    void should_refuse_when_checked_given_a_size_outside_the_bounds() {
        assertThatThrownBy(() -> AdministratorActivityPage.check(0)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> AdministratorActivityPage.check(201)).isInstanceOf(IllegalArgumentException.class);
    }
}
