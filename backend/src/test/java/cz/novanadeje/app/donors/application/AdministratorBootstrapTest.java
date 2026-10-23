package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.shared.application.event.DonorRegistered;
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
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AdministratorBootstrapTest {

    @Mock
    private AdministratorService administrators;

    @Test
    @DisplayName("Given two configured e-mails, when the application is ready, then each is granted the role, whatever the outcome of the other")
    void should_grant_each_configured_email_when_ready_given_two_emails() {
        AdministratorProperties properties = new AdministratorProperties(List.of("jakub@example.cz", " pavel@example.cz "));
        when(administrators.grantAtStartup(new EmailAddress("jakub@example.cz"))).thenReturn(StartupGrant.NOT_REGISTERED);
        when(administrators.grantAtStartup(new EmailAddress("pavel@example.cz"))).thenReturn(StartupGrant.GRANTED);

        new AdministratorBootstrap(properties, administrators).run();

        verify(administrators).grantAtStartup(new EmailAddress("jakub@example.cz"));
        verify(administrators).grantAtStartup(new EmailAddress("pavel@example.cz"));
        verifyNoMoreInteractions(administrators);
    }

    @Test
    @DisplayName("Given no configured e-mail, when the application is ready, then nothing is granted")
    void should_do_nothing_when_ready_given_no_email() {
        new AdministratorBootstrap(new AdministratorProperties(List.of()), administrators).run();

        verifyNoInteractions(administrators);
    }

    @Test
    @DisplayName("Given a configured e-mail, when that donor confirms the address, then the role is granted at once")
    void should_grant_role_when_address_confirmed_given_configured_email() {
        AdministratorProperties properties = new AdministratorProperties(List.of("pavel@example.cz"));
        when(administrators.grantAtStartup(new EmailAddress("pavel@example.cz"))).thenReturn(StartupGrant.GRANTED);

        new AdministratorBootstrap(properties, administrators).onRegistered(registered("pavel@example.cz"));

        verify(administrators).grantAtStartup(new EmailAddress("pavel@example.cz"));
    }

    @Test
    @DisplayName("Given another e-mail configured, when a donor confirms the address, then nothing is granted")
    void should_grant_nothing_when_address_confirmed_given_other_email() {
        new AdministratorBootstrap(new AdministratorProperties(List.of("pavel@example.cz")), administrators).onRegistered(registered("jana@example.cz"));

        verifyNoInteractions(administrators);
    }

    private static DonorRegistered registered(String email) {
        return new DonorRegistered(UUID.randomUUID(), DonorType.PERSON, "Jana", Optional.empty(),
                new PostalAddress("Jiráskova 436", "Nový Bor", "47301"), new EmailAddress(email), new VariableSymbol("1234567890"),
                LocaleCode.fromTag("cs"), Instant.parse("2026-10-23T10:00:00Z"));
    }
}
