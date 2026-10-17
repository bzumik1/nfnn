package cz.novanadeje.app.donors.domain;

import cz.novanadeje.app.shared.domain.VariableSymbol;
import cz.novanadeje.app.shared.domain.EmailAddress;
import cz.novanadeje.app.shared.domain.LocaleCode;
import cz.novanadeje.app.shared.domain.PostalAddress;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class DonorTest {

    private static final Instant NOW = Instant.parse("2026-10-17T10:00:00Z");
    private static final PostalAddress ADDRESS = new PostalAddress("Dlouhá 12", "Ústí nad Labem", "400 01");
    private static final EmailAddress EMAIL = new EmailAddress("jana@example.cz");
    private static final PasswordHash HASH = new PasswordHash("$2a$12$hash");
    private static final VariableSymbol SYMBOL = new VariableSymbol("1234567890");

    @Test
    @DisplayName("Given a person's data, when a donor registers, then it is a DONOR with the given profile and no company identifier")
    void should_create_person_donor_when_registered_given_person_data() {
        Donor donor = Donor.register(DonorId.newId(NOW), DonorType.PERSON, " Jana Nováková ", null, ADDRESS, EMAIL, HASH, SYMBOL, LocaleCode.CS, NOW);

        assertThat(donor.type()).isEqualTo(DonorType.PERSON);
        assertThat(donor.name()).isEqualTo("Jana Nováková");
        assertThat(donor.companyIdentifier()).isEmpty();
        assertThat(donor.address()).isEqualTo(ADDRESS);
        assertThat(donor.email()).isEqualTo(EMAIL);
        assertThat(donor.variableSymbol()).isEqualTo(SYMBOL);
        assertThat(donor.roles()).isEqualTo(Set.of(Role.DONOR));
        assertThat(donor.registeredAt()).isEqualTo(NOW);
    }

    @Test
    void should_keep_company_identifier_when_registered_given_company_data() {
        Donor donor = Donor.register(DonorId.newId(NOW), DonorType.COMPANY, "Stavby Novák s.r.o.", new CompanyIdentifier("45274649"), ADDRESS, EMAIL, HASH, SYMBOL, LocaleCode.CS, NOW);

        assertThat(donor.companyIdentifier()).contains(new CompanyIdentifier("45274649"));
    }

    @Test
    void should_reject_when_registered_given_company_without_identifier() {
        assertThatThrownBy(() -> Donor.register(DonorId.newId(NOW), DonorType.COMPANY, "Stavby Novák s.r.o.", null, ADDRESS, EMAIL, HASH, SYMBOL, LocaleCode.CS, NOW))
                .isInstanceOf(CompanyIdentifierRequired.class)
                .hasFieldOrPropertyWithValue("code", "donors/company-identifier-required");
    }

    @Test
    void should_reject_when_registered_given_person_with_identifier() {
        assertThatThrownBy(() -> Donor.register(DonorId.newId(NOW), DonorType.PERSON, "Jana Nováková", new CompanyIdentifier("45274649"), ADDRESS, EMAIL, HASH, SYMBOL, LocaleCode.CS, NOW))
                .isInstanceOf(CompanyIdentifierNotAllowed.class);
    }

    @Test
    void should_reject_when_registered_given_blank_name() {
        assertThatThrownBy(() -> Donor.register(DonorId.newId(NOW), DonorType.PERSON, " ", null, ADDRESS, EMAIL, HASH, SYMBOL, LocaleCode.CS, NOW))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void should_change_name_address_and_locale_when_profile_updated() {
        Donor donor = Donor.register(DonorId.newId(NOW), DonorType.PERSON, "Jana Nováková", null, ADDRESS, EMAIL, HASH, SYMBOL, LocaleCode.CS, NOW);
        PostalAddress moved = new PostalAddress("Krátká 3", "Most", "434 01");

        donor.updateProfile("Jana Svobodová", moved, LocaleCode.EN);

        assertThat(donor.name()).isEqualTo("Jana Svobodová");
        assertThat(donor.address()).isEqualTo(moved);
        assertThat(donor.preferredLocale()).isEqualTo(LocaleCode.EN);
    }
}
