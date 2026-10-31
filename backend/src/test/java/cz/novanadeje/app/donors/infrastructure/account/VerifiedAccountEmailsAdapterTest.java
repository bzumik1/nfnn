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
class VerifiedAccountEmailsAdapterTest {

    private static final Instant NOW = Instant.parse("2026-10-31T08:00:00Z");
    private static final DonorId DONOR = new DonorId(UUID.fromString("019a1c00-0000-7000-8000-00000000d001"));
    private static final EmailAddress EMAIL = new EmailAddress("jana@example.cz");

    @Mock
    private DonorRepository donors;

    private VerifiedAccountEmailsAdapter adapter() {
        return new VerifiedAccountEmailsAdapter(donors);
    }

    @Test
    @DisplayName("Given an account with a confirmed e-mail, when its e-mail is asked for and the address is checked, then both name the account")
    void should_answer_with_the_email_when_asked_given_a_confirmed_account() {
        Donor donor = donor();
        donor.verifyEmail(NOW);
        when(donors.findById(DONOR)).thenReturn(Optional.of(donor));
        when(donors.findByEmail(EMAIL)).thenReturn(Optional.of(donor));

        assertThat(adapter().verifiedEmailOf(DONOR.value())).contains(EMAIL);
        assertThat(adapter().belongsToVerifiedAccount(EMAIL)).isTrue();
    }

    @Test
    @DisplayName("Given an account whose e-mail is not confirmed, when its e-mail is asked for and the address is checked, then neither counts it")
    void should_answer_with_nothing_when_asked_given_an_unconfirmed_account() {
        when(donors.findById(DONOR)).thenReturn(Optional.of(donor()));
        when(donors.findByEmail(EMAIL)).thenReturn(Optional.of(donor()));

        assertThat(adapter().verifiedEmailOf(DONOR.value())).isEmpty();
        assertThat(adapter().belongsToVerifiedAccount(EMAIL)).isFalse();
    }

    @Test
    @DisplayName("Given no account, when an e-mail is asked for and an address is checked, then there is none")
    void should_answer_with_nothing_when_asked_given_no_account() {
        when(donors.findById(DONOR)).thenReturn(Optional.empty());
        when(donors.findByEmail(EMAIL)).thenReturn(Optional.empty());

        assertThat(adapter().verifiedEmailOf(DONOR.value())).isEmpty();
        assertThat(adapter().belongsToVerifiedAccount(EMAIL)).isFalse();
    }

    private static Donor donor() {
        return Donor.register(DONOR, DonorType.PERSON, "Jana Nováková", null, new PostalAddress("Dlouhá 12", "Ústí nad Labem", "400 01"),
                EMAIL, new PasswordHash("$hash"), new VariableSymbol("1234567890"),
                LocaleCode.CS, NOW);
    }
}
