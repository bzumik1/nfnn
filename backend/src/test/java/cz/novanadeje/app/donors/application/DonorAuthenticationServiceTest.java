package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.CompanyIdentifier;
import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.DonorRepository;
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
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Duration;
import java.time.Instant;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class DonorAuthenticationServiceTest {

    private static final Instant NOW = Instant.parse("2026-10-17T10:00:00Z");
    private static final EmailAddress EMAIL = new EmailAddress("jana@example.cz");
    private static final PasswordHash HASH = new PasswordHash("$hash");

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
    void should_refuse_when_logged_in_given_malformed_email() {
        assertThatThrownBy(() -> service.login("not an email", "correct horse battery"))
                .isInstanceOf(InvalidCredentials.class);
    }
}
