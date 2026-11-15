package cz.novanadeje.app.donations.domain.bank;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThatNoException;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class BankPaymentSearchTest {

    @Test
    @DisplayName("Given a text of at most 100 characters, when it is checked, then it passes, and one character more is refused")
    void should_refuse_only_a_longer_text_when_checked_given_texts_around_the_bound() {
        assertThatNoException().isThrownBy(() -> BankPaymentSearch.checkText("a".repeat(BankPaymentSearch.MAX_TEXT_LENGTH)));
        assertThatThrownBy(() -> BankPaymentSearch.checkText("a".repeat(BankPaymentSearch.MAX_TEXT_LENGTH + 1)))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("Given a limit from 1 to 500, when it is checked, then it passes, and one below 1 or above 500 is refused")
    void should_refuse_a_limit_outside_the_bounds_when_checked_given_limits_around_them() {
        assertThatNoException().isThrownBy(() -> BankPaymentSearch.checkLimit(1));
        assertThatNoException().isThrownBy(() -> BankPaymentSearch.checkLimit(BankPaymentSearch.MAX_LIMIT));
        assertThatThrownBy(() -> BankPaymentSearch.checkLimit(0)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> BankPaymentSearch.checkLimit(501)).isInstanceOf(IllegalArgumentException.class);
    }
}
