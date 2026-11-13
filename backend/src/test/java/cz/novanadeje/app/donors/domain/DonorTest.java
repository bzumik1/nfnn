package cz.novanadeje.app.donors.domain;

import cz.novanadeje.app.shared.domain.DonorType;
import cz.novanadeje.app.shared.domain.ErasedPersonalData;
import cz.novanadeje.app.shared.domain.VariableSymbol;
import cz.novanadeje.app.shared.domain.EmailAddress;
import cz.novanadeje.app.shared.domain.LocaleCode;
import cz.novanadeje.app.shared.domain.PostalAddress;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
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
    @DisplayName("Given no password, when a donor registers, then the account has no password and keeps a given one otherwise")
    void should_have_no_password_when_registered_given_no_password() {
        Donor passwordless = Donor.register(DonorId.newId(NOW), DonorType.PERSON, "Jana Nováková", null, ADDRESS, EMAIL, null, SYMBOL, LocaleCode.CS, NOW);
        Donor withPassword = Donor.register(DonorId.newId(NOW), DonorType.PERSON, "Jana Nováková", null, ADDRESS, EMAIL, HASH, SYMBOL, LocaleCode.CS, NOW);

        assertThat(passwordless.hasPassword()).isFalse();
        assertThat(passwordless.passwordHash()).isEmpty();
        assertThat(withPassword.hasPassword()).isTrue();
        assertThat(withPassword.passwordHash()).contains(HASH);
    }

    @Test
    @DisplayName("Given a donor with a password, when the password is removed and later set again, then the account follows")
    void should_follow_when_password_removed_and_set_again_given_donor_with_password() {
        Donor donor = Donor.register(DonorId.newId(NOW), DonorType.PERSON, "Jana Nováková", null, ADDRESS, EMAIL, HASH, SYMBOL, LocaleCode.CS, NOW);

        donor.removePassword(1);

        assertThat(donor.hasPassword()).isFalse();
        donor.changePassword(new PasswordHash("$2a$12$other"));
        assertThat(donor.passwordHash()).contains(new PasswordHash("$2a$12$other"));
    }

    @Test
    @DisplayName("Given a donor with a password and no passkey, when the password is removed, then it is refused as the last way to sign in and the password stays")
    void should_refuse_when_password_removed_given_no_passkey() {
        Donor donor = Donor.register(DonorId.newId(NOW), DonorType.PERSON, "Jana Nováková", null, ADDRESS, EMAIL, HASH, SYMBOL, LocaleCode.CS, NOW);

        assertThatThrownBy(() -> donor.removePassword(0))
                .isInstanceOf(LastSignInMethod.class)
                .hasFieldOrPropertyWithValue("code", "donors/last-sign-in-method");
        assertThat(donor.passwordHash()).contains(HASH);
    }

    @Test
    @DisplayName("Given an erased donor with a passkey, when the password is removed, then it is refused as already erased")
    void should_refuse_when_password_removed_given_erased_donor() {
        DonorId id = DonorId.newId(NOW);
        Donor donor = Donor.reconstitute(id, DonorType.PERSON, ErasedPersonalData.NAME, null, ErasedPersonalData.ADDRESS,
                ErasedPersonalData.emailFor(id.value()), HASH, SYMBOL, LocaleCode.CS, Set.of(), NOW, null, NOW.plusSeconds(5));

        assertThatThrownBy(() -> donor.removePassword(1)).isInstanceOf(DonorAlreadyErased.class);
        assertThat(donor.passwordHash()).contains(HASH);
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

        assertThatThrownBy(() -> donor.verifyEmail(NOW.plusSeconds(120)))
                .isInstanceOf(EmailAlreadyConfirmed.class)
                .hasFieldOrPropertyWithValue("code", "donors/email-already-confirmed");
        assertThat(donor.emailVerifiedAt()).contains(NOW.plusSeconds(90));
    }

    @Test
    @DisplayName("Given a stored verified donor, when reconstituted, then the verification time is kept")
    void should_keep_verification_time_when_reconstituted_given_stored_row() {
        Donor donor = Donor.reconstitute(DonorId.newId(NOW), DonorType.PERSON, "Jana Nováková", null, ADDRESS, EMAIL, HASH, SYMBOL, LocaleCode.CS,
                Set.of(Role.DONOR), NOW, NOW.plusSeconds(5), null);

        assertThat(donor.emailVerifiedAt()).contains(NOW.plusSeconds(5));
        assertThat(Donor.reconstitute(DonorId.newId(NOW), DonorType.PERSON, "Jana Nováková", null, ADDRESS, EMAIL, HASH, SYMBOL, LocaleCode.CS,
                Set.of(Role.DONOR), NOW, null, null).isEmailVerified()).isFalse();
    }

    @Test
    @DisplayName("Given company data, when a donor registers, then the company identifier is kept")
    void should_keep_company_identifier_when_registered_given_company_data() {
        Donor donor = Donor.register(DonorId.newId(NOW), DonorType.COMPANY, "Stavby Novák s.r.o.", new CompanyIdentifier("45274649"), ADDRESS, EMAIL, HASH, SYMBOL, LocaleCode.CS, NOW);

        assertThat(donor.companyIdentifier()).contains(new CompanyIdentifier("45274649"));
    }

    @Test
    @DisplayName("Given a company without an identifier, when it registers, then it is rejected")
    void should_reject_when_registered_given_company_without_identifier() {
        assertThatThrownBy(() -> Donor.register(DonorId.newId(NOW), DonorType.COMPANY, "Stavby Novák s.r.o.", null, ADDRESS, EMAIL, HASH, SYMBOL, LocaleCode.CS, NOW))
                .isInstanceOf(CompanyIdentifierRequired.class)
                .hasFieldOrPropertyWithValue("code", "donors/company-identifier-required");
    }

    @Test
    @DisplayName("Given a person with an identifier, when they register, then it is rejected")
    void should_reject_when_registered_given_person_with_identifier() {
        assertThatThrownBy(() -> Donor.register(DonorId.newId(NOW), DonorType.PERSON, "Jana Nováková", new CompanyIdentifier("45274649"), ADDRESS, EMAIL, HASH, SYMBOL, LocaleCode.CS, NOW))
                .isInstanceOf(CompanyIdentifierNotAllowed.class);
    }

    @Test
    @DisplayName("Given a blank name, when a donor registers, then it is rejected")
    void should_reject_when_registered_given_blank_name() {
        assertThatThrownBy(() -> Donor.register(DonorId.newId(NOW), DonorType.PERSON, " ", null, ADDRESS, EMAIL, HASH, SYMBOL, LocaleCode.CS, NOW))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("Given a donor, when the profile is updated, then the name, address and locale change")
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

        assertThatThrownBy(() -> donor.changeEmail(new EmailAddress("jana.nova@example.cz")))
                .isInstanceOf(EmailNotConfirmed.class)
                .hasFieldOrPropertyWithValue("code", "donors/email-not-confirmed");
        assertThat(donor.email()).isEqualTo(EMAIL);
    }

    @Test
    @DisplayName("Given an administrator, when the session roles are asked without the second factor, then ADMIN is left out, and with it every role is granted")
    void should_grant_admin_only_with_second_factor_when_session_roles_asked_given_administrator() {
        Donor admin = Donor.reconstitute(DonorId.newId(NOW), DonorType.PERSON, "Jana Nováková", null, ADDRESS, EMAIL, HASH, SYMBOL, LocaleCode.CS,
                Set.of(Role.DONOR, Role.ADMIN), NOW, NOW, null);

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

    @Test
    @DisplayName("Given a plain donor, when administration is granted, then the donor is an administrator with both roles")
    void should_become_administrator_when_administration_granted_given_plain_donor() {
        Donor donor = Donor.register(DonorId.newId(NOW), DonorType.PERSON, "Jana Nováková", null, ADDRESS, EMAIL, HASH, SYMBOL, LocaleCode.CS, NOW);
        donor.verifyEmail(NOW);

        donor.grantAdministration(true);

        assertThat(donor.isAdministrator()).isTrue();
        assertThat(donor.roles()).containsExactlyInAnyOrder(Role.DONOR, Role.ADMIN);
    }

    @Test
    @DisplayName("Given a confirmed donor who holds no second factor, when administration is granted, then the donor refuses and stays a plain donor")
    void should_refuse_when_administration_granted_given_no_second_factor() {
        Donor donor = Donor.register(DonorId.newId(NOW), DonorType.PERSON, "Jana Nováková", null, ADDRESS, EMAIL, HASH, SYMBOL, LocaleCode.CS, NOW);
        donor.verifyEmail(NOW);

        assertThatThrownBy(() -> donor.grantAdministration(false))
                .isInstanceOf(AdministratorWithoutSecondFactor.class)
                .hasFieldOrPropertyWithValue("code", "donors/administrator-without-second-factor");

        assertThat(donor.isAdministrator()).isFalse();
        assertThat(donor.roles()).containsExactly(Role.DONOR);
    }

    @Test
    @DisplayName("Given a donor who has confirmed neither the e-mail nor a second factor, when administration is granted, then the unconfirmed e-mail is named first")
    void should_name_unconfirmed_email_when_administration_granted_given_neither_email_nor_second_factor() {
        Donor donor = Donor.register(DonorId.newId(NOW), DonorType.PERSON, "Jana Nováková", null, ADDRESS, EMAIL, HASH, SYMBOL, LocaleCode.CS, NOW);

        assertThatThrownBy(() -> donor.grantAdministration(false)).isInstanceOf(AdministratorEmailNotConfirmed.class);
    }

    @Test
    @DisplayName("Given a confirmed donor who holds no second factor, when the first administration is granted, then the donor becomes an administrator")
    void should_become_administrator_when_first_administration_granted_given_no_second_factor() {
        Donor donor = Donor.register(DonorId.newId(NOW), DonorType.PERSON, "Jana Nováková", null, ADDRESS, EMAIL, HASH, SYMBOL, LocaleCode.CS, NOW);
        donor.verifyEmail(NOW);

        donor.grantFirstAdministration();

        assertThat(donor.isAdministrator()).isTrue();
    }

    @Test
    @DisplayName("Given a donor who has not confirmed the e-mail, when the first administration is granted, then the donor refuses and stays a plain donor")
    void should_refuse_when_first_administration_granted_given_unconfirmed_email() {
        Donor donor = Donor.register(DonorId.newId(NOW), DonorType.PERSON, "Jana Nováková", null, ADDRESS, EMAIL, HASH, SYMBOL, LocaleCode.CS, NOW);

        assertThatThrownBy(donor::grantFirstAdministration).isInstanceOf(AdministratorEmailNotConfirmed.class);

        assertThat(donor.isAdministrator()).isFalse();
    }

    @Test
    @DisplayName("Given a donor who has not confirmed the e-mail, when administration is granted, then the donor refuses and stays a plain donor")
    void should_refuse_when_administration_granted_given_unconfirmed_email() {
        Donor donor = Donor.register(DonorId.newId(NOW), DonorType.PERSON, "Jana Nováková", null, ADDRESS, EMAIL, HASH, SYMBOL, LocaleCode.CS, NOW);

        assertThatThrownBy(() -> donor.grantAdministration(true)).isInstanceOf(AdministratorEmailNotConfirmed.class);

        assertThat(donor.isAdministrator()).isFalse();
    }

    @Test
    @DisplayName("Given an administrator, when administration is granted again, then the donor refuses")
    void should_refuse_when_administration_granted_given_administrator() {
        Donor admin = Donor.reconstitute(DonorId.newId(NOW), DonorType.PERSON, "Jana Nováková", null, ADDRESS, EMAIL, HASH, SYMBOL, LocaleCode.CS,
                Set.of(Role.DONOR, Role.ADMIN), NOW, NOW, null);

        assertThatThrownBy(() -> admin.grantAdministration(true)).isInstanceOf(AlreadyAdministrator.class);
    }

    @Test
    @DisplayName("Given an administrator, when administration is revoked, then only DONOR is left")
    void should_keep_only_donor_role_when_administration_revoked_given_administrator() {
        Donor admin = Donor.reconstitute(DonorId.newId(NOW), DonorType.PERSON, "Jana Nováková", null, ADDRESS, EMAIL, HASH, SYMBOL, LocaleCode.CS,
                Set.of(Role.DONOR, Role.ADMIN), NOW, NOW, null);

        admin.revokeAdministration();

        assertThat(admin.isAdministrator()).isFalse();
        assertThat(admin.roles()).containsExactly(Role.DONOR);
    }

    @Test
    @DisplayName("Given a plain donor, when administration is revoked, then the donor refuses")
    void should_refuse_when_administration_revoked_given_plain_donor() {
        Donor donor = Donor.register(DonorId.newId(NOW), DonorType.PERSON, "Jana Nováková", null, ADDRESS, EMAIL, HASH, SYMBOL, LocaleCode.CS, NOW);

        assertThatThrownBy(donor::revokeAdministration).isInstanceOf(NotAdministrator.class);
    }

    @Test
    @DisplayName("Given a verified company donor, when erased, then every personal detail is a placeholder, the password no longer matches anything known, the roles are gone and the time is kept")
    void should_replace_personal_data_when_erased_given_verified_company() {
        DonorId id = DonorId.newId(NOW);
        Donor donor = Donor.register(id, DonorType.COMPANY, "Stavby Novák s.r.o.", new CompanyIdentifier("45274649"), ADDRESS, EMAIL, HASH, SYMBOL,
                LocaleCode.EN, NOW);
        donor.verifyEmail(NOW.plusSeconds(60));

        donor.erase(NOW.plusSeconds(3600));

        assertThat(donor.isErased()).isTrue();
        assertThat(donor.erasedAt()).contains(NOW.plusSeconds(3600));
        assertThat(donor.name()).isEqualTo(ErasedPersonalData.NAME);
        assertThat(donor.companyIdentifier()).isEmpty();
        assertThat(donor.type()).isEqualTo(DonorType.COMPANY);
        assertThat(donor.address()).isEqualTo(ErasedPersonalData.ADDRESS);
        assertThat(donor.email()).isEqualTo(new EmailAddress("erased-" + id.value() + "@erased.invalid"));
        assertThat(donor.passwordHash()).isEmpty();
        assertThat(donor.hasPassword()).isFalse();
        assertThat(donor.roles()).isEmpty();
        assertThat(donor.isEmailVerified()).isFalse();
        assertThat(donor.variableSymbol()).isEqualTo(SYMBOL);
        assertThat(donor.preferredLocale()).isEqualTo(LocaleCode.EN);
        assertThat(donor.registeredAt()).isEqualTo(NOW);
    }

    @Test
    @DisplayName("Given an erased donor, when erased again, then it is refused as already erased and the first time stays")
    void should_refuse_when_erased_twice_given_erased_donor() {
        Donor donor = Donor.register(DonorId.newId(NOW), DonorType.PERSON, "Jana Nováková", null, ADDRESS, EMAIL, HASH, SYMBOL, LocaleCode.CS, NOW);
        donor.erase(NOW.plusSeconds(10));

        assertThatThrownBy(() -> donor.erase(NOW.plusSeconds(20)))
                .isInstanceOf(DonorAlreadyErased.class)
                .hasFieldOrPropertyWithValue("code", "donors/already-erased");
        assertThat(donor.erasedAt()).contains(NOW.plusSeconds(10));
    }

    @Test
    @DisplayName("Given a donor a restore marked erased while its personal data came back with the backup, when the erasure is completed, then every personal detail is a placeholder, the password, the roles and the confirmation are gone and the first erasure time stays")
    void should_replace_personal_data_and_keep_the_time_when_erasure_completed_given_donor_marked_erased_by_a_restore() {
        DonorId id = DonorId.newId(NOW);
        Donor donor = Donor.reconstitute(id, DonorType.COMPANY, "Stavby Novák s.r.o.", new CompanyIdentifier("45274649"), ADDRESS, EMAIL, HASH, SYMBOL,
                LocaleCode.EN, Set.of(Role.DONOR, Role.ADMIN), NOW, NOW.plusSeconds(60), NOW.plusSeconds(3600));

        assertThat(donor.erasureIncomplete()).isTrue();
        donor.completeErasure();

        assertThat(donor.erasureIncomplete()).isFalse();
        assertThat(donor.erasedAt()).contains(NOW.plusSeconds(3600));
        assertThat(donor.name()).isEqualTo(ErasedPersonalData.NAME);
        assertThat(donor.companyIdentifier()).isEmpty();
        assertThat(donor.address()).isEqualTo(ErasedPersonalData.ADDRESS);
        assertThat(donor.email()).isEqualTo(ErasedPersonalData.emailFor(id.value()));
        assertThat(donor.passwordHash()).isEmpty();
        assertThat(donor.roles()).isEmpty();
        assertThat(donor.isEmailVerified()).isFalse();
        assertThat(donor.variableSymbol()).isEqualTo(SYMBOL);
        assertThat(donor.preferredLocale()).isEqualTo(LocaleCode.EN);
    }

    @Test
    @DisplayName("Given a donor erased in full, a donor marked erased with only an address left, and a donor never erased, when asked whether the erasure is incomplete, then only the one with data left says so")
    void should_tell_an_incomplete_erasure_when_asked_given_erased_partly_erased_and_active_donors() {
        Donor erased = Donor.register(DonorId.newId(NOW), DonorType.PERSON, "Jana Nováková", null, ADDRESS, EMAIL, HASH, SYMBOL, LocaleCode.CS, NOW);
        erased.erase(NOW.plusSeconds(10));
        DonorId partlyErasedId = DonorId.newId(NOW);
        Donor partlyErased = Donor.reconstitute(partlyErasedId, DonorType.PERSON, ErasedPersonalData.NAME, null, ADDRESS,
                ErasedPersonalData.emailFor(partlyErasedId.value()), null, SYMBOL, LocaleCode.CS, Set.of(), NOW, null, NOW.plusSeconds(10));
        Donor active = Donor.register(DonorId.newId(NOW), DonorType.PERSON, "Jana Nováková", null, ADDRESS, EMAIL, HASH, SYMBOL, LocaleCode.CS, NOW);

        assertThat(erased.erasureIncomplete()).isFalse();
        assertThat(partlyErased.erasureIncomplete()).isTrue();
        assertThat(active.erasureIncomplete()).isFalse();
    }

    @Test
    @DisplayName("Given a donor never erased, when the erasure is completed, then it is refused and nothing changes")
    void should_refuse_when_erasure_completed_given_donor_never_erased() {
        Donor donor = Donor.register(DonorId.newId(NOW), DonorType.PERSON, "Jana Nováková", null, ADDRESS, EMAIL, HASH, SYMBOL, LocaleCode.CS, NOW);

        assertThatThrownBy(donor::completeErasure).isInstanceOf(IllegalStateException.class);
        assertThat(donor.name()).isEqualTo("Jana Nováková");
        assertThat(donor.isErased()).isFalse();
    }

    @Test
    @DisplayName("Given an administrator, when erased, then it is refused and nothing changes")
    void should_refuse_when_erased_given_administrator() {
        Donor donor = Donor.register(DonorId.newId(NOW), DonorType.PERSON, "Jana Nováková", null, ADDRESS, EMAIL, HASH, SYMBOL, LocaleCode.CS, NOW);
        donor.verifyEmail(NOW);
        donor.grantAdministration(true);

        assertThatThrownBy(() -> donor.erase(NOW.plusSeconds(10)))
                .isInstanceOf(AdministratorNotErasable.class)
                .hasFieldOrPropertyWithValue("code", "donors/administrator-not-erasable");
        assertThat(donor.isErased()).isFalse();
        assertThat(donor.name()).isEqualTo("Jana Nováková");
        assertThat(donor.email()).isEqualTo(EMAIL);
    }

    @Test
    @DisplayName("Given a stored erased donor without roles, when reconstituted, then it is erased and has no roles")
    void should_keep_erasure_when_reconstituted_given_erased_row() {
        DonorId id = DonorId.newId(NOW);
        Donor donor = Donor.reconstitute(id, DonorType.PERSON, ErasedPersonalData.NAME, null, ErasedPersonalData.ADDRESS,
                ErasedPersonalData.emailFor(id.value()), HASH, SYMBOL, LocaleCode.CS, Set.of(), NOW, null, NOW.plusSeconds(5));

        assertThat(donor.isErased()).isTrue();
        assertThat(donor.erasedAt()).contains(NOW.plusSeconds(5));
        assertThat(donor.roles()).isEmpty();
        assertThat(donor.isAdministrator()).isFalse();
    }

    @Nested
    @DisplayName("Given an erased donor")
    class GivenErasedDonor {

        private final DonorId id = DonorId.newId(NOW);
        private final Donor donor = erased();

        private Donor erased() {
            Donor registered = Donor.register(id, DonorType.PERSON, "Jana Nováková", null, ADDRESS, EMAIL, HASH, SYMBOL, LocaleCode.CS, NOW);
            registered.verifyEmail(NOW);
            registered.erase(NOW.plusSeconds(10));
            return registered;
        }

        @Test
        @DisplayName("when the profile is updated, then it is refused as already erased and the placeholders stay")
        void should_refuse_when_profile_updated() {
            assertThatThrownBy(() -> donor.updateProfile("Jana Nováková", ADDRESS, LocaleCode.EN))
                    .isInstanceOf(DonorAlreadyErased.class)
                    .hasFieldOrPropertyWithValue("code", "donors/already-erased");
            assertThat(donor.name()).isEqualTo(ErasedPersonalData.NAME);
            assertThat(donor.address()).isEqualTo(ErasedPersonalData.ADDRESS);
            assertThat(donor.preferredLocale()).isEqualTo(LocaleCode.CS);
        }

        @Test
        @DisplayName("when a password is set, then it is refused as already erased and the account keeps no password")
        void should_refuse_when_password_changed() {
            assertThatThrownBy(() -> donor.changePassword(HASH)).isInstanceOf(DonorAlreadyErased.class);
            assertThat(donor.hasPassword()).isFalse();
        }

        @Test
        @DisplayName("when the e-mail is changed, then it is refused as already erased and the placeholder address stays")
        void should_refuse_when_email_changed() {
            assertThatThrownBy(() -> donor.changeEmail(EMAIL)).isInstanceOf(DonorAlreadyErased.class);
            assertThat(donor.email()).isEqualTo(ErasedPersonalData.emailFor(id.value()));
        }

        @Test
        @DisplayName("when the e-mail is verified, then it is refused as already erased and stays unverified")
        void should_refuse_when_email_verified() {
            assertThatThrownBy(() -> donor.verifyEmail(NOW.plusSeconds(20))).isInstanceOf(DonorAlreadyErased.class);
            assertThat(donor.isEmailVerified()).isFalse();
        }
    }
}
