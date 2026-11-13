package cz.novanadeje.app.donors.infrastructure.account;

import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.DonorRepository;
import cz.novanadeje.app.donors.domain.PasswordHash;
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
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AdministrationHoldersAdapterTest {

    private static final Instant NOW = Instant.parse("2026-11-05T08:00:00Z");
    private static final DonorId DONOR = new DonorId(UUID.fromString("019a1c00-0000-7000-8000-00000000d001"));

    @Mock
    private DonorRepository donors;

    @Test
    @DisplayName("Given an account that holds the administrator role, when the holders are asked about it, then it holds the administration")
    void should_hold_the_administration_when_asked_given_an_account_with_the_role() {
        Donor donor = donor();
        donor.verifyEmail(NOW);
        donor.grantAdministration(true);
        when(donors.findById(DONOR)).thenReturn(Optional.of(donor));

        assertThat(new AdministrationHoldersAdapter(donors).holdsAdministration(DONOR.value())).isTrue();
    }

    @Test
    @DisplayName("Given an account whose role was taken away, when the holders are asked about it, then it no longer holds the administration")
    void should_not_hold_the_administration_when_asked_given_the_role_taken_away() {
        Donor donor = donor();
        donor.verifyEmail(NOW);
        donor.grantAdministration(true);
        donor.revokeAdministration();
        when(donors.findById(DONOR)).thenReturn(Optional.of(donor));

        assertThat(new AdministrationHoldersAdapter(donors).holdsAdministration(DONOR.value())).isFalse();
    }

    @Test
    @DisplayName("Given no account, when the holders are asked about its id, then nobody holds the administration under it")
    void should_not_hold_the_administration_when_asked_given_no_account() {
        when(donors.findById(DONOR)).thenReturn(Optional.empty());

        assertThat(new AdministrationHoldersAdapter(donors).holdsAdministration(DONOR.value())).isFalse();
    }

    private static Donor donor() {
        return Donor.register(DONOR, DonorType.PERSON, "Jana Nováková", null, new PostalAddress("Dlouhá 12", "Ústí nad Labem", "400 01"),
                new EmailAddress("jana@example.cz"), new PasswordHash("$hash"), new VariableSymbol("1234567890"), LocaleCode.CS, NOW);
    }
}
