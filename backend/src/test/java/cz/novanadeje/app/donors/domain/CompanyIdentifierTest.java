package cz.novanadeje.app.donors.domain;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

class CompanyIdentifierTest {

    @Test
    void should_accept_when_created_given_eight_digits_with_valid_check_digit() {
        assertThat(new CompanyIdentifier("45274649").value()).isEqualTo("45274649");
    }

    @Test
    void should_strip_spaces_when_created_given_grouped_digits() {
        assertThat(new CompanyIdentifier("452 746 49").value()).isEqualTo("45274649");
    }

    @Test
    void should_reject_when_created_given_wrong_check_digit() {
        assertThatIllegalArgumentException().isThrownBy(() -> new CompanyIdentifier("45274648"));
    }

    @Test
    void should_reject_when_created_given_seven_digits() {
        assertThatIllegalArgumentException().isThrownBy(() -> new CompanyIdentifier("4527464"));
    }

    @Test
    void should_reject_when_created_given_letters() {
        assertThatIllegalArgumentException().isThrownBy(() -> new CompanyIdentifier("4527464A"));
    }

    @Test
    void should_report_validity_when_asked_given_candidate() {
        assertThat(CompanyIdentifier.isValid("45274649")).isTrue();
        assertThat(CompanyIdentifier.isValid("12345678")).isFalse();
        assertThat(CompanyIdentifier.isValid(null)).isFalse();
    }
}
