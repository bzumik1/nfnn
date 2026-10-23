package cz.novanadeje.app.operations.application.settings;

import cz.novanadeje.app.operations.domain.settings.Setting;
import cz.novanadeje.app.operations.domain.settings.SettingChange;
import cz.novanadeje.app.operations.domain.settings.SettingError;
import cz.novanadeje.app.operations.domain.settings.SettingProblem;
import cz.novanadeje.app.operations.domain.settings.SettingsRejected;
import cz.novanadeje.app.operations.domain.settings.StoredSetting;
import cz.novanadeje.app.shared.application.event.AdminActionPerformed;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.context.ApplicationEventPublisher;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class SettingsServiceTest {

    private static final Instant NOW = Instant.parse("2026-10-23T16:00:00Z");
    private static final UUID ADMIN = UUID.randomUUID();

    private final InMemorySettingsRepository repository = new InMemorySettingsRepository();
    private final ReversibleSealer sealer = new ReversibleSealer();
    private final SettingsValidator validator = mock(SettingsValidator.class);
    private final CurrentSettings current = mock(CurrentSettings.class);
    private final MailServerProbe mailProbe = mock(MailServerProbe.class);
    private final ApplicationRestarter restarter = mock(ApplicationRestarter.class);
    private final ApplicationEventPublisher events = mock(ApplicationEventPublisher.class);
    private final SettingsService settings = new SettingsService(new SettingsWriter(repository, sealer, validator), current, sealer, mailProbe,
            restarter, events, Clock.fixed(NOW, ZoneOffset.UTC));

    @Test
    @DisplayName("Given running values, when the settings are viewed, then plain values show, secrets only as set and unreadable ones are marked")
    void should_show_values_and_hide_secrets_when_viewed_given_running_values() {
        when(current.effectiveValue(any())).thenReturn(Optional.empty());
        when(current.effectiveValue(Setting.MAIL_HOST)).thenReturn(Optional.of("smtp-relay.brevo.com"));
        when(current.effectiveValue(Setting.MAIL_PASSWORD)).thenReturn(Optional.of("key"));
        repository.save(new StoredSetting(Setting.MAIL_HOST, "smtp-relay.brevo.com", false, NOW));
        repository.save(new StoredSetting(Setting.FIO_TOKEN, "sealed with a lost key", true, NOW));

        SettingsView view = settings.view();

        assertThat(view.settings()).extracting(SettingView::setting).containsExactlyElementsOf(Setting.inAdministration());
        assertThat(viewOf(view, Setting.MAIL_HOST)).isEqualTo(new SettingView(Setting.MAIL_HOST, Optional.of("smtp-relay.brevo.com"), true, true, false));
        assertThat(viewOf(view, Setting.MAIL_PASSWORD)).isEqualTo(new SettingView(Setting.MAIL_PASSWORD, Optional.empty(), true, false, false));
        assertThat(viewOf(view, Setting.FIO_TOKEN)).isEqualTo(new SettingView(Setting.FIO_TOKEN, Optional.empty(), false, false, true));
        assertThat(view.secretsCanBeStored()).isTrue();
    }

    @Test
    @DisplayName("Given changes, when an administrator saves them, then they are stored, audited by name only and the backend restarts")
    void should_store_audit_and_restart_when_saved_given_changes() {
        when(validator.validate(any(), any(), any())).thenReturn(List.of());

        settings.change(ADMIN, List.of(new SettingChange(Setting.FIO_TOKEN, "secret-token"), new SettingChange(Setting.RECEIPT_FIRST_YEAR, "2025")));

        ArgumentCaptor<AdminActionPerformed> audit = ArgumentCaptor.forClass(AdminActionPerformed.class);
        verify(events).publishEvent(audit.capture());
        assertThat(audit.getValue().adminId()).isEqualTo(ADMIN);
        assertThat(audit.getValue().action()).isEqualTo(SettingsService.CHANGE_ACTION);
        assertThat(audit.getValue().details()).contains("FIO_TOKEN", "RECEIPT_FIRST_YEAR").doesNotContain("secret-token", "2025");
        verify(restarter).restartAfterCommit();
        assertThat(repository.findAll()).hasSize(2);
    }

    @Test
    @DisplayName("Given no changes, when an administrator saves, then nothing is audited and nothing restarts")
    void should_do_nothing_when_saved_given_no_changes() {
        settings.change(ADMIN, List.of());

        verifyNoInteractions(events, restarter);
    }

    @Test
    @DisplayName("Given the first administrator's e-mail, when an administrator changes it here, then it is refused")
    void should_refuse_when_saved_given_setup_only_setting() {
        assertThatThrownBy(() -> settings.change(ADMIN, List.of(new SettingChange(Setting.ADMIN_EMAILS, "x@example.cz"))))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("Given no password typed, when the mail server is tested, then the running password is used")
    void should_use_running_password_when_tested_given_no_password() {
        runningMailServer();
        MailServer typed = new MailServer("smtp-relay.brevo.com", 587, "user", "", true, true);
        when(mailProbe.canSignIn(typed.withPassword("running-key"))).thenReturn(true);

        assertThat(settings.testMail(typed)).isTrue();
    }

    @Test
    @DisplayName("Given a stored password, when another mail server is tested without a password, then the stored password is not sent to it")
    void should_not_send_running_password_when_tested_given_other_server_without_password() {
        runningMailServer();
        MailServer elsewhere = new MailServer("smtp.attacker.example", 587, "user", "", true, true);
        MailServer otherUser = new MailServer("smtp-relay.brevo.com", 587, "someone-else", "", true, true);
        MailServer withoutTls = new MailServer("smtp-relay.brevo.com", 587, "user", "", true, false);

        settings.testMail(elsewhere);
        settings.testMail(otherUser);
        settings.testMail(withoutTls);

        verify(mailProbe).canSignIn(elsewhere);
        verify(mailProbe).canSignIn(otherUser);
        verify(mailProbe).canSignIn(withoutTls);
        verify(mailProbe, never()).canSignIn(argThat(server -> "running-key".equals(server.password())));
    }

    @Test
    @DisplayName("Given a stored password, when the mail server, its port, user or STARTTLS change without the password, then the change is refused at the password")
    void should_refuse_when_saved_given_mail_server_moved_without_password() {
        runningMailServer();
        for (SettingChange moved : List.of(new SettingChange(Setting.MAIL_HOST, "smtp.attacker.example"), new SettingChange(Setting.MAIL_PORT, "2525"),
                new SettingChange(Setting.MAIL_USERNAME, "someone-else"), new SettingChange(Setting.MAIL_STARTTLS, "false"),
                new SettingChange(Setting.MAIL_HOST, ""))) {
            assertThatThrownBy(() -> settings.change(ADMIN, List.of(moved)))
                    .isInstanceOfSatisfying(SettingsRejected.class, rejected -> assertThat(rejected.errors())
                            .containsExactly(SettingError.of(Setting.MAIL_PASSWORD, SettingProblem.PASSWORD_FOR_NEW_MAIL_SERVER)));
        }
        verifyNoInteractions(events, restarter);
        assertThat(repository.findAll()).isEmpty();
    }

    @Test
    @DisplayName("Given a password saved but not yet running, when the mail server changes without the password, then the change is refused at the password")
    void should_refuse_when_saved_given_password_stored_before_restart_and_server_moved() {
        when(current.effectiveValue(any())).thenReturn(Optional.empty());
        repository.save(new StoredSetting(Setting.MAIL_PASSWORD, sealer.seal(Setting.MAIL_PASSWORD, "stored-key"), true, NOW));

        assertThatThrownBy(() -> settings.change(ADMIN, List.of(new SettingChange(Setting.MAIL_HOST, "smtp.attacker.example"))))
                .isInstanceOfSatisfying(SettingsRejected.class, rejected -> assertThat(rejected.errors())
                        .containsExactly(SettingError.of(Setting.MAIL_PASSWORD, SettingProblem.PASSWORD_FOR_NEW_MAIL_SERVER)));
        verifyNoInteractions(events, restarter);
    }

    @Test
    @DisplayName("Given a stored password, when the mail server changes with a new password or keeps its values, then the change is saved")
    void should_save_when_saved_given_mail_server_moved_with_password_or_unchanged() {
        runningMailServer();
        when(validator.validate(any(), any(), any())).thenReturn(List.of());

        settings.change(ADMIN, List.of(new SettingChange(Setting.MAIL_HOST, "smtp.example.cz"), new SettingChange(Setting.MAIL_PASSWORD, "new-key")));
        settings.change(ADMIN, List.of(new SettingChange(Setting.MAIL_HOST, "SMTP-relay.brevo.com"), new SettingChange(Setting.MAIL_FROM, "info@nfnn.cz")));

        assertThat(repository.findAll()).extracting(StoredSetting::setting)
                .containsExactlyInAnyOrder(Setting.MAIL_HOST, Setting.MAIL_PASSWORD, Setting.MAIL_FROM);
    }

    private void runningMailServer() {
        when(current.effectiveValue(any())).thenReturn(Optional.empty());
        when(current.effectiveValue(Setting.MAIL_HOST)).thenReturn(Optional.of("smtp-relay.brevo.com"));
        when(current.effectiveValue(Setting.MAIL_PORT)).thenReturn(Optional.of("587"));
        when(current.effectiveValue(Setting.MAIL_USERNAME)).thenReturn(Optional.of("user"));
        when(current.effectiveValue(Setting.MAIL_STARTTLS)).thenReturn(Optional.of("true"));
        when(current.effectiveValue(Setting.MAIL_PASSWORD)).thenReturn(Optional.of("running-key"));
    }

    private static SettingView viewOf(SettingsView view, Setting setting) {
        return view.settings().stream().filter(candidate -> candidate.setting() == setting).findFirst().orElse(null);
    }
}
