package cz.novanadeje.app.donors.domain;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

class CompanyIdentifierTest {

    @Test
    @DisplayName("Given eight digits with a valid check digit, when the identifier is created, then it is accepted")
    void should_accept_when_created_given_eight_digits_with_valid_check_digit() {
        assertThat(new CompanyIdentifier("45274649").value()).isEqualTo("45274649");
    }

    @Test
    @DisplayName("Given grouped digits, when the identifier is created, then the spaces are stripped")
    void should_strip_spaces_when_created_given_grouped_digits() {
        assertThat(new CompanyIdentifier("452 746 49").value()).isEqualTo("45274649");
    }

    @Test
    @DisplayName("Given a wrong check digit, when the identifier is created, then it is rejected")
    void should_reject_when_created_given_wrong_check_digit() {
        assertThatIllegalArgumentException().isThrownBy(() -> new CompanyIdentifier("45274648"));
    }

    @Test
    @DisplayName("Given seven digits, when the identifier is created, then it is rejected")
    void should_reject_when_created_given_seven_digits() {
        assertThatIllegalArgumentException().isThrownBy(() -> new CompanyIdentifier("4527464"));
    }

    @Test
    @DisplayName("Given letters, when the identifier is created, then it is rejected")
    void should_reject_when_created_given_letters() {
        assertThatIllegalArgumentException().isThrownBy(() -> new CompanyIdentifier("4527464A"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"\uff14\uff15\uff12\uff17\uff14\uff16\uff14\uff19", "\u0664\u0665\u0662\u0667\u0664\u0666\u0664\u0669", "4527464\u0669"})
    @DisplayName("Given the digits of a valid identifier written in another script, when the identifier is created or checked, then it is rejected")
    void should_reject_when_created_given_digits_of_another_script(String digits) {
        assertThatIllegalArgumentException().isThrownBy(() -> new CompanyIdentifier(digits));
        assertThat(CompanyIdentifier.isValid(digits)).isFalse();
    }

    @Test
    @DisplayName("Given a candidate, when asked, then the validity is reported")
    void should_report_validity_when_asked_given_candidate() {
        assertThat(CompanyIdentifier.isValid("45274649")).isTrue();
        assertThat(CompanyIdentifier.isValid("12345678")).isFalse();
        assertThat(CompanyIdentifier.isValid(null)).isFalse();
    }

    @Test
    @DisplayName("Given an identifier with a wrong check digit, when it is created, then the message names the rule without the identifier")
    void should_name_the_rule_without_the_identifier_when_created_given_a_wrong_check_digit() {
        assertThatIllegalArgumentException().isThrownBy(() -> new CompanyIdentifier("12345678"))
                .withMessage("Company identifier is not valid")
                .satisfies(refused -> assertThat(refused.getMessage()).doesNotContain("1234"));
    }
}
