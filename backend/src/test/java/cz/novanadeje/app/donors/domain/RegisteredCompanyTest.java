package cz.novanadeje.app.donors.domain;

import cz.novanadeje.app.shared.domain.PostalAddress;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

class RegisteredCompanyTest {

    private static final CompanyIdentifier ICO = new CompanyIdentifier("45274649");

    @Test
    @DisplayName("Given a name with surrounding and repeated spaces, when the company is created, then the name is tidied")
    void should_tidy_name_when_created_given_repeated_spaces() {
        RegisteredCompany company = new RegisteredCompany(ICO, "  VIENNA INTERNATIONAL   a.s. ",
                Optional.of(new PostalAddress("Evropská 370/15", "Praha 6", "160 00")));

        assertThat(company.name()).isEqualTo("VIENNA INTERNATIONAL a.s.");
        assertThat(company.seat()).map(PostalAddress::city).contains("Praha 6");
    }

    @Test
    @DisplayName("Given a blank name, when the company is created, then it is rejected")
    void should_reject_when_created_given_blank_name() {
        assertThatIllegalArgumentException().isThrownBy(() -> new RegisteredCompany(ICO, "  ", Optional.empty()));
    }

    @Test
    @DisplayName("Given a name longer than a donor's name may be, when the company is created, then it is rejected")
    void should_reject_when_created_given_name_longer_than_donor_name() {
        assertThatIllegalArgumentException().isThrownBy(() -> new RegisteredCompany(ICO, "x".repeat(Donor.MAX_NAME_LENGTH + 1), Optional.empty()));
    }
}
