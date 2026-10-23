package cz.novanadeje.app.donors.domain;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

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

    @Test
    @DisplayName("Given a candidate, when asked, then the validity is reported")
    void should_report_validity_when_asked_given_candidate() {
        assertThat(CompanyIdentifier.isValid("45274649")).isTrue();
        assertThat(CompanyIdentifier.isValid("12345678")).isFalse();
        assertThat(CompanyIdentifier.isValid(null)).isFalse();
    }
}
