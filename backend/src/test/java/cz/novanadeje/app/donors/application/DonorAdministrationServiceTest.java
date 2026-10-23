package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.DonorNotFound;
import cz.novanadeje.app.donors.domain.DonorRepository;
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
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class DonorAdministrationServiceTest {

    private static final Instant NOW = Instant.parse("2026-10-22T21:00:00Z");
    private static final DonorId JANA = DonorId.newId(NOW.minusSeconds(300));
    private static final DonorId PETR = DonorId.newId(NOW.minusSeconds(200));
    private static final PostalAddress ADDRESS = new PostalAddress("Dlouhá 12", "Ústí nad Labem", "400 01");
    private static final TotpSecret SECRET = new TotpSecret("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");

    @Mock
    private DonorRepository donors;
    @Mock
    private SecondFactorRepository secondFactors;

    private DonorAdministrationService service;

    @BeforeEach
    void setUp() {
        service = new DonorAdministrationService(donors, secondFactors);
    }

    @Test
    @DisplayName("Given two matching donors, one with the second factor on and one still enrolling, when searched, then the query is trimmed, the limit applied and each view says who has the factor")
    void should_describe_each_match_when_searched_given_two_matching_donors() {
        Donor jana = donor(JANA, "Jana Nováková", "jana@example.cz", Set.of(Role.DONOR, Role.ADMIN));
        Donor petr = donor(PETR, "Petr Svoboda", "petr@example.cz", Set.of(Role.DONOR));
        when(donors.search("nov", DonorAdministrationService.SEARCH_LIMIT)).thenReturn(List.of(jana, petr));
        when(secondFactors.findByDonor(JANA)).thenReturn(Optional.of(SecondFactor.reconstitute(JANA, SECRET, NOW.minusSeconds(100), NOW.minusSeconds(50), 1L)));
        when(secondFactors.findByDonor(PETR)).thenReturn(Optional.of(SecondFactor.enrol(PETR, SECRET, NOW.minusSeconds(10))));

        List<DonorAccountView> views = service.search("  nov ");

        assertThat(views).containsExactly(new DonorAccountView(jana, true), new DonorAccountView(petr, false));
    }

    @Test
    @DisplayName("Given a blank query, when searched, then nothing is looked up and nothing comes back")
    void should_return_nothing_when_searched_given_blank_query() {
        assertThat(service.search("   ")).isEmpty();
        assertThat(service.search(null)).isEmpty();
        verifyNoInteractions(donors, secondFactors);
    }

    @Test
    @DisplayName("Given a donor without a second factor, when the donor is viewed, then the account comes with the factor off")
    void should_view_account_when_viewed_given_donor_without_factor() {
        Donor petr = donor(PETR, "Petr Svoboda", "petr@example.cz", Set.of(Role.DONOR));
        when(donors.findById(PETR)).thenReturn(Optional.of(petr));
        when(secondFactors.findByDonor(PETR)).thenReturn(Optional.empty());

        assertThat(service.view(PETR)).isEqualTo(new DonorAccountView(petr, false));
    }

    @Test
    @DisplayName("Given no donor with the id, when the donor is viewed, then the request fails as not found")
    void should_refuse_when_viewed_given_unknown_donor() {
        when(donors.findById(PETR)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.view(PETR)).isInstanceOf(DonorNotFound.class);
        verifyNoInteractions(secondFactors);
    }

    private static Donor donor(DonorId id, String name, String email, Set<Role> roles) {
        return Donor.reconstitute(id, DonorType.PERSON, name, null, ADDRESS, new EmailAddress(email), new PasswordHash("$hash"),
                new VariableSymbol("4821937560"), LocaleCode.CS, roles, NOW.minusSeconds(1000), NOW.minusSeconds(900), null);
    }
}
