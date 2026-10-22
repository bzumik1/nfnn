package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.shared.domain.EmailAddress;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

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
}
