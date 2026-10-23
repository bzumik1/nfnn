package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.PasswordHash;
import cz.novanadeje.app.donors.domain.Role;
import cz.novanadeje.app.donors.domain.SecondFactor;
import cz.novanadeje.app.donors.domain.SecondFactorRepository;
import cz.novanadeje.app.donors.domain.TotpSecret;
import cz.novanadeje.app.shared.domain.DonorType;
import cz.novanadeje.app.shared.domain.EmailAddress;
import cz.novanadeje.app.shared.domain.LocaleCode;
import cz.novanadeje.app.shared.domain.PostalAddress;
import cz.novanadeje.app.shared.domain.VariableSymbol;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.util.Optional;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class DonorViewsTest {

    private static final Instant NOW = Instant.parse("2026-10-22T10:00:00Z");
    private static final DonorId DONOR = DonorId.newId(NOW);
    private static final TotpSecret SECRET = new TotpSecret("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");

    @Mock
    private SecondFactorRepository secondFactors;

    @Test
    @DisplayName("Given a plain donor without a second factor, when the view is built, then it is not enabled and not needed")
    void should_report_disabled_and_not_needed_when_view_built_given_plain_donor() {
        when(secondFactors.findByDonor(DONOR)).thenReturn(Optional.empty());

        DonorView view = new DonorViews(secondFactors).forSession(donor(Set.of(Role.DONOR)), Set.of(Role.DONOR));

        assertThat(view.secondFactor()).isEqualTo(new SecondFactorView(false, false));
        assertThat(view.roles()).containsExactly(Role.DONOR);
    }

    @Test
    @DisplayName("Given an administrator with only a pending second factor, when the view is built, then the factor is needed for administration and the session roles are shown")
    void should_report_needed_when_view_built_given_administrator_with_pending_factor() {
        when(secondFactors.findByDonor(DONOR)).thenReturn(Optional.of(SecondFactor.enrol(DONOR, SECRET, NOW)));

        DonorView view = new DonorViews(secondFactors).forSession(donor(Set.of(Role.DONOR, Role.ADMIN)), Set.of(Role.DONOR));

        assertThat(view.secondFactor()).isEqualTo(new SecondFactorView(false, true));
        assertThat(view.roles()).containsExactly(Role.DONOR);
    }

    @Test
    @DisplayName("Given an administrator with an enabled second factor, when the view is built for a verified session, then it is enabled and ADMIN is among the roles")
    void should_report_enabled_when_view_built_given_administrator_with_enabled_factor() {
        when(secondFactors.findByDonor(DONOR)).thenReturn(Optional.of(SecondFactor.reconstitute(DONOR, SECRET, NOW, NOW, 1L)));

        AuthenticatedDonor result = new DonorViews(secondFactors).authenticated(donor(Set.of(Role.DONOR, Role.ADMIN)),
                new IssuedTokens("access", NOW, "refresh", NOW, Set.of(Role.DONOR, Role.ADMIN)));

        assertThat(result.donor().secondFactor()).isEqualTo(new SecondFactorView(true, false));
        assertThat(result.donor().roles()).containsExactlyInAnyOrder(Role.DONOR, Role.ADMIN);
    }

    private static Donor donor(Set<Role> roles) {
        return Donor.reconstitute(DONOR, DonorType.PERSON, "Jana Nováková", null, new PostalAddress("Dlouhá 12", "Ústí nad Labem", "400 01"),
                new EmailAddress("jana@example.cz"), new PasswordHash("$hash"), new VariableSymbol("1234567890"), LocaleCode.CS, roles, NOW, NOW, null);
    }
}
