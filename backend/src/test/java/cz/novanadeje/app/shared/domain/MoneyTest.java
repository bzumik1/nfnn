package cz.novanadeje.app.shared.domain;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class MoneyTest {

    @Test
    @DisplayName("Given a decimal amount, when money is created, then it keeps the amount in minor units")
    void should_keep_minor_units_when_created_given_decimal_amount() {
        assertThat(Money.of(new BigDecimal("500.50"), Currency.CZK)).isEqualTo(Money.czk(50050));
        assertThat(Money.of(new BigDecimal("500"), Currency.CZK)).isEqualTo(Money.czk(50000));
    }

    @Test
    @DisplayName("Given more than two decimals, when money is created, then it is rejected")
    void should_reject_when_created_given_more_than_two_decimals() {
        assertThatThrownBy(() -> Money.of(new BigDecimal("1.005"), Currency.CZK)).isInstanceOf(ArithmeticException.class);
    }

    @Test
    @DisplayName("Given minor units, when money is converted, then it renders the decimal amount")
    void should_render_decimal_when_converted_given_minor_units() {
        assertThat(Money.czk(123456).toDecimal()).isEqualByComparingTo("1234.56");
    }

    @Test
    @DisplayName("Given the same currency, when two amounts are summed, then they add up")
    void should_add_when_summed_given_same_currency() {
        assertThat(Money.czk(100).plus(Money.czk(250))).isEqualTo(Money.czk(350));
    }

    @Test
    @DisplayName("Given no currency, when money is created, then it is rejected")
    void should_reject_when_created_given_no_currency() {
        assertThatIllegalArgumentException().isThrownBy(() -> new Money(100, null));
    }

    @Test
    @DisplayName("Given positive, zero and negative amounts, when asked, then money tells its sign and negates")
    void should_tell_sign_when_asked() {
        assertThat(Money.czk(1).isPositive()).isTrue();
        assertThat(Money.czk(-1).isNegative()).isTrue();
        assertThat(Money.czk(0).isPositive()).isFalse();
        assertThat(Money.czk(5).negated()).isEqualTo(Money.czk(-5));
    }

    @Test
    @DisplayName("Given a currency code in any case, when it is resolved, then it is parsed")
    void should_parse_code_case_insensitively_when_currency_resolved() {
        assertThat(Currency.fromCode("czk")).isEqualTo(Currency.CZK);
        assertThatIllegalArgumentException().isThrownBy(() -> Currency.fromCode("EUR"));
    }
}
