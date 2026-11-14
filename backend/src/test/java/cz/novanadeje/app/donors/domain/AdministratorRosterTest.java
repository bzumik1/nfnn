package cz.novanadeje.app.donors.domain;

import cz.novanadeje.app.shared.domain.DonorName;
import cz.novanadeje.app.shared.domain.DonorType;
import cz.novanadeje.app.shared.domain.EmailAddress;
import cz.novanadeje.app.shared.domain.LocaleCode;
import cz.novanadeje.app.shared.domain.PostalAddress;
import cz.novanadeje.app.shared.domain.VariableSymbol;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class AdministratorRosterTest {

    private static final Instant NOW = Instant.parse("2026-11-14T10:00:00Z");
    private static final PostalAddress ADDRESS = new PostalAddress("Dlouhá 12", "Ústí nad Labem", "400 01");
    private static final DonorId JANA = DonorId.newId(NOW.minusSeconds(300));
    private static final DonorId PETR = DonorId.newId(NOW.minusSeconds(200));

    @Test
    @DisplayName("Given two administrators, when one takes the role from the other, then the other keeps only DONOR")
    void should_leave_only_donor_role_when_revoked_given_two_administrators() {
        Donor jana = administrator(JANA);
        Donor petr = administrator(PETR);

        AdministratorRoster.revoke(petr, List.of(jana, petr), JANA);

        assertThat(petr.roles()).containsExactly(Role.DONOR);
    }

    @Test
    @DisplayName("Given two administrators, when one takes the role from themselves, then it is refused as the own role and the role stays")
    void should_refuse_as_own_role_when_revoked_given_the_revoking_administrator() {
        Donor jana = administrator(JANA);

        assertThatThrownBy(() -> AdministratorRoster.revoke(jana, List.of(jana, administrator(PETR)), JANA))
                .isInstanceOfSatisfying(OwnAdministrationRevoked.class, refused -> assertThat(refused.code()).isEqualTo("donors/own-administration"));

        assertThat(jana.isAdministrator()).isTrue();
    }

    @Test
    @DisplayName("Given an administrator whose own role was taken meanwhile, when they take the role from the last administrator, then it is refused and the role stays")
    void should_refuse_as_last_administrator_when_revoked_given_no_other_administrator() {
        Donor petr = administrator(PETR);

        assertThatThrownBy(() -> AdministratorRoster.revoke(petr, List.of(petr), JANA))
                .isInstanceOfSatisfying(LastAdministratorRevoked.class, refused -> assertThat(refused.code()).isEqualTo("donors/last-administrator"));

        assertThat(petr.isAdministrator()).isTrue();
    }

    @Test
    @DisplayName("Given a plain donor and no other administrator, when the role is taken from the donor, then it is refused as not an administrator")
    void should_refuse_as_not_administrator_when_revoked_given_plain_donor() {
        Donor petr = plainDonor(PETR, NOW);

        assertThatThrownBy(() -> AdministratorRoster.revoke(petr, List.of(), JANA)).isInstanceOf(NotAdministrator.class);
    }

    @Test
    @DisplayName("Given a site without administrators and a confirmed plain donor, when the first administration is granted, then the donor becomes an administrator")
    void should_grant_when_first_granted_given_site_without_administrators() {
        Donor petr = plainDonor(PETR, NOW);

        assertThat(AdministratorRoster.grantFirst(petr, List.of())).isEqualTo(FirstAdministration.GRANTED);

        assertThat(petr.isAdministrator()).isTrue();
    }

    @Test
    @DisplayName("Given a site with an administrator and a confirmed plain donor, when the first administration is granted, then nothing is granted")
    void should_grant_nothing_when_first_granted_given_site_with_administrator() {
        Donor petr = plainDonor(PETR, NOW);

        assertThat(AdministratorRoster.grantFirst(petr, List.of(administrator(JANA)))).isEqualTo(FirstAdministration.SITE_HAS_ADMINISTRATOR);

        assertThat(petr.isAdministrator()).isFalse();
    }

    @Test
    @DisplayName("Given the donor already is the site's administrator, when the first administration is granted, then it says so and nothing changes")
    void should_say_already_administrator_when_first_granted_given_administrator() {
        Donor petr = administrator(PETR);

        assertThat(AdministratorRoster.grantFirst(petr, List.of(petr))).isEqualTo(FirstAdministration.ALREADY_ADMINISTRATOR);

        assertThat(petr.roles()).containsExactlyInAnyOrder(Role.DONOR, Role.ADMIN);
    }

    @Test
    @DisplayName("Given a site without administrators and a donor who has not confirmed the e-mail, when the first administration is granted, then it says so and nothing is granted")
    void should_say_not_confirmed_when_first_granted_given_unconfirmed_donor() {
        Donor petr = plainDonor(PETR, null);

        assertThat(AdministratorRoster.grantFirst(petr, List.of())).isEqualTo(FirstAdministration.NOT_CONFIRMED);

        assertThat(petr.isAdministrator()).isFalse();
    }

    private static Donor administrator(DonorId id) {
        return donor(id, Set.of(Role.DONOR, Role.ADMIN), NOW);
    }

    private static Donor plainDonor(DonorId id, Instant emailVerifiedAt) {
        return donor(id, Set.of(Role.DONOR), emailVerifiedAt);
    }

    private static Donor donor(DonorId id, Set<Role> roles, Instant emailVerifiedAt) {
        return Donor.reconstitute(id, DonorType.PERSON, new DonorName("Petr Svoboda"), null, ADDRESS, new EmailAddress(id.value() + "@example.cz"),
                new PasswordHash("$hash"), new VariableSymbol("4821937560"), LocaleCode.CS, roles, NOW.minusSeconds(1000), emailVerifiedAt, null);
    }
}
