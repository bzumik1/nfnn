package cz.novanadeje.app.donors.domain;

import cz.novanadeje.app.shared.domain.DonorType;
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
        assertThat(donor.isEmailVerified()).isFalse();
        assertThat(donor.emailVerifiedAt()).isEmpty();
    }

    @Test
    @DisplayName("Given a fresh registration, when the e-mail is verified, then the donor remembers when and is verified")
    void should_remember_time_when_email_verified_given_fresh_registration() {
        Donor donor = Donor.register(DonorId.newId(NOW), DonorType.PERSON, "Jana Nováková", null, ADDRESS, EMAIL, HASH, SYMBOL, LocaleCode.CS, NOW);

        donor.verifyEmail(NOW.plusSeconds(90));

        assertThat(donor.isEmailVerified()).isTrue();
        assertThat(donor.emailVerifiedAt()).contains(NOW.plusSeconds(90));
    }

    @Test
    @DisplayName("Given a verified donor, when the e-mail is verified again, then it refuses and keeps the first time")
    void should_refuse_when_email_verified_twice_given_verified_donor() {
        Donor donor = Donor.register(DonorId.newId(NOW), DonorType.PERSON, "Jana Nováková", null, ADDRESS, EMAIL, HASH, SYMBOL, LocaleCode.CS, NOW);
        donor.verifyEmail(NOW.plusSeconds(90));

        assertThatThrownBy(() -> donor.verifyEmail(NOW.plusSeconds(120))).isInstanceOf(IllegalStateException.class);
        assertThat(donor.emailVerifiedAt()).contains(NOW.plusSeconds(90));
    }

    @Test
    @DisplayName("Given a stored verified donor, when reconstituted, then the verification time is kept")
    void should_keep_verification_time_when_reconstituted_given_stored_row() {
        Donor donor = Donor.reconstitute(DonorId.newId(NOW), DonorType.PERSON, "Jana Nováková", null, ADDRESS, EMAIL, HASH, SYMBOL, LocaleCode.CS,
                Set.of(Role.DONOR), NOW, NOW.plusSeconds(5));

        assertThat(donor.emailVerifiedAt()).contains(NOW.plusSeconds(5));
        assertThat(Donor.reconstitute(DonorId.newId(NOW), DonorType.PERSON, "Jana Nováková", null, ADDRESS, EMAIL, HASH, SYMBOL, LocaleCode.CS,
                Set.of(Role.DONOR), NOW, null).isEmailVerified()).isFalse();
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

    @Test
    @DisplayName("Given a verified donor, when the e-mail is changed to a new address, then the donor carries it and stays verified")
    void should_carry_new_address_when_email_changed_given_verified_donor() {
        Donor donor = Donor.register(DonorId.newId(NOW), DonorType.PERSON, "Jana Nováková", null, ADDRESS, EMAIL, HASH, SYMBOL, LocaleCode.CS, NOW);
        donor.verifyEmail(NOW.plusSeconds(60));

        donor.changeEmail(new EmailAddress("jana.nova@example.cz"));

        assertThat(donor.email()).isEqualTo(new EmailAddress("jana.nova@example.cz"));
        assertThat(donor.isEmailVerified()).isTrue();
    }

    @Test
    @DisplayName("Given a verified donor, when the e-mail is changed to the address it already has, then it is refused as unchanged")
    void should_refuse_when_email_changed_given_same_address() {
        Donor donor = Donor.register(DonorId.newId(NOW), DonorType.PERSON, "Jana Nováková", null, ADDRESS, EMAIL, HASH, SYMBOL, LocaleCode.CS, NOW);
        donor.verifyEmail(NOW.plusSeconds(60));

        assertThatThrownBy(() -> donor.changeEmail(new EmailAddress("JANA@example.cz"))).isInstanceOf(EmailUnchanged.class);
        assertThatThrownBy(() -> donor.changeEmail(null)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("Given an unverified donor, when the e-mail is changed, then it is refused")
    void should_refuse_when_email_changed_given_unverified_donor() {
        Donor donor = Donor.register(DonorId.newId(NOW), DonorType.PERSON, "Jana Nováková", null, ADDRESS, EMAIL, HASH, SYMBOL, LocaleCode.CS, NOW);

        assertThatThrownBy(() -> donor.changeEmail(new EmailAddress("jana.nova@example.cz"))).isInstanceOf(IllegalStateException.class);
    }

    @Test
    @DisplayName("Given an administrator, when the session roles are asked without the second factor, then ADMIN is left out, and with it every role is granted")
    void should_grant_admin_only_with_second_factor_when_session_roles_asked_given_administrator() {
        Donor admin = Donor.reconstitute(DonorId.newId(NOW), DonorType.PERSON, "Jana Nováková", null, ADDRESS, EMAIL, HASH, SYMBOL, LocaleCode.CS,
                Set.of(Role.DONOR, Role.ADMIN), NOW, NOW);

        assertThat(admin.isAdministrator()).isTrue();
        assertThat(admin.sessionRoles(false)).containsExactly(Role.DONOR);
        assertThat(admin.sessionRoles(true)).containsExactlyInAnyOrder(Role.DONOR, Role.ADMIN);
        assertThat(admin.roles()).containsExactlyInAnyOrder(Role.DONOR, Role.ADMIN);
    }

    @Test
    @DisplayName("Given a plain donor, when the session roles are asked either way, then they are DONOR")
    void should_keep_donor_role_when_session_roles_asked_given_plain_donor() {
        Donor donor = Donor.register(DonorId.newId(NOW), DonorType.PERSON, "Jana Nováková", null, ADDRESS, EMAIL, HASH, SYMBOL, LocaleCode.CS, NOW);

        assertThat(donor.isAdministrator()).isFalse();
        assertThat(donor.sessionRoles(false)).containsExactly(Role.DONOR);
        assertThat(donor.sessionRoles(true)).containsExactly(Role.DONOR);
    }
}
