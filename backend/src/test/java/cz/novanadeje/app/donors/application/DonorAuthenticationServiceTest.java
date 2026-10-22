package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.CompanyIdentifier;
import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.DonorRepository;
import cz.novanadeje.app.donors.domain.EmailNotVerified;
import cz.novanadeje.app.donors.domain.InvalidCredentials;
import cz.novanadeje.app.donors.domain.PasswordHash;
import cz.novanadeje.app.donors.domain.PasswordHasher;
import cz.novanadeje.app.donors.domain.RawPassword;
import cz.novanadeje.app.shared.domain.DonorType;
import cz.novanadeje.app.shared.domain.VariableSymbol;
import cz.novanadeje.app.shared.domain.EmailAddress;
import cz.novanadeje.app.shared.domain.LocaleCode;
import cz.novanadeje.app.shared.domain.PostalAddress;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class DonorAuthenticationServiceTest {

    private static final Instant NOW = Instant.parse("2026-10-17T10:00:00Z");
    private static final EmailAddress EMAIL = new EmailAddress("jana@example.cz");
    private static final PasswordHash HASH = new PasswordHash("$hash");
    private static final String BCRYPT_COST_12 = "\\$2[aby]\\$12\\$[./0-9A-Za-z]{53}";

    @Mock
    private DonorRepository donors;
    @Mock
    private PasswordHasher passwordHasher;
    @Mock
    private DonorSessionService sessions;

    private DonorAuthenticationService service;
    private Donor donor;

    @BeforeEach
    void setUp() {
        service = new DonorAuthenticationService(donors, passwordHasher, sessions);
        donor = Donor.register(DonorId.newId(NOW), DonorType.COMPANY, "Stavby Novák s.r.o.", new CompanyIdentifier("45274649"),
                new PostalAddress("Průmyslová 5", "Teplice", "415 01"), EMAIL, HASH, new VariableSymbol("1234567890"), LocaleCode.CS, NOW);
        donor.verifyEmail(NOW);
    }

    @Test
    @DisplayName("Given a donor whose e-mail is not verified, when signing in with the right password, then it is refused as not verified and no session opens")
    void should_refuse_as_not_verified_when_logged_in_given_unverified_donor_and_matching_password() {
        Donor unverified = Donor.register(DonorId.newId(NOW), DonorType.PERSON, "Jana Nováková", null,
                new PostalAddress("Dlouhá 12", "Ústí nad Labem", "400 01"), EMAIL, HASH, new VariableSymbol("1234567891"), LocaleCode.CS, NOW);
        when(donors.findByEmail(EMAIL)).thenReturn(Optional.of(unverified));
        when(passwordHasher.matches(new RawPassword("correct horse battery"), HASH)).thenReturn(true);

        assertThatThrownBy(() -> service.login("jana@example.cz", "correct horse battery"))
                .isInstanceOfSatisfying(EmailNotVerified.class, refused -> assertThat(refused.code()).isEqualTo("auth/email-not-verified"));

        verify(sessions, never()).open(any(), any());
    }

    @Test
    @DisplayName("Given a donor whose e-mail is not verified, when signing in with a wrong password, then it is refused as wrong credentials, not as unverified")
    void should_refuse_as_wrong_credentials_when_logged_in_given_unverified_donor_and_wrong_password() {
        Donor unverified = Donor.register(DonorId.newId(NOW), DonorType.PERSON, "Jana Nováková", null,
                new PostalAddress("Dlouhá 12", "Ústí nad Labem", "400 01"), EMAIL, HASH, new VariableSymbol("1234567891"), LocaleCode.CS, NOW);
        when(donors.findByEmail(EMAIL)).thenReturn(Optional.of(unverified));
        when(passwordHasher.matches(any(), any())).thenReturn(false);

        assertThatThrownBy(() -> service.login("jana@example.cz", "wrong horse battery")).isInstanceOf(InvalidCredentials.class);
    }

    @Test
    void should_open_session_when_logged_in_given_matching_password() {
        when(donors.findByEmail(EMAIL)).thenReturn(Optional.of(donor));
        when(passwordHasher.matches(new RawPassword("correct horse battery"), HASH)).thenReturn(true);
        when(sessions.open(donor.id(), donor.roles())).thenReturn(new IssuedTokens("access", NOW.plus(Duration.ofMinutes(15)), "refresh", NOW.plus(Duration.ofDays(14))));

        AuthenticatedDonor result = service.login("jana@example.cz", "correct horse battery");

        assertThat(result.donor().companyIdentifier()).isEqualTo("45274649");
        assertThat(result.tokens().refreshToken()).isEqualTo("refresh");
    }

    @Test
    void should_refuse_when_logged_in_given_wrong_password() {
        when(donors.findByEmail(EMAIL)).thenReturn(Optional.of(donor));
        when(passwordHasher.matches(any(), any())).thenReturn(false);

        assertThatThrownBy(() -> service.login("jana@example.cz", "wrong horse battery"))
                .isInstanceOf(InvalidCredentials.class);

        verify(sessions, never()).open(any(), any());
    }

    @Test
    void should_refuse_when_logged_in_given_unknown_email() {
        when(donors.findByEmail(EMAIL)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.login("jana@example.cz", "correct horse battery"))
                .isInstanceOf(InvalidCredentials.class);
    }

    @Test
    @DisplayName("Given an unknown email, when signing in, then the password is still compared against a cost-12 BCrypt hash that no password matches")
    void should_compare_against_real_bcrypt_hash_when_logged_in_given_unknown_email() {
        when(donors.findByEmail(EMAIL)).thenReturn(Optional.empty());
        ArgumentCaptor<PasswordHash> compared = ArgumentCaptor.forClass(PasswordHash.class);

        assertThatThrownBy(() -> service.login("jana@example.cz", "correct horse battery"))
                .isInstanceOf(InvalidCredentials.class);

        verify(passwordHasher).matches(eq(new RawPassword("correct horse battery")), compared.capture());
        String unknownDonorHash = compared.getValue().value();
        assertThat(unknownDonorHash).matches(BCRYPT_COST_12);
        BCryptPasswordEncoder bcrypt = new BCryptPasswordEncoder(12);
        assertThat(bcrypt.matches("correct horse battery", unknownDonorHash)).isFalse();
        assertThat(bcrypt.matches(UUID.randomUUID().toString(), unknownDonorHash)).isFalse();
        verify(sessions, never()).open(any(), any());
    }

    @Test
    void should_refuse_when_logged_in_given_malformed_email() {
        assertThatThrownBy(() -> service.login("not an email", "correct horse battery"))
                .isInstanceOf(InvalidCredentials.class);
    }
}
