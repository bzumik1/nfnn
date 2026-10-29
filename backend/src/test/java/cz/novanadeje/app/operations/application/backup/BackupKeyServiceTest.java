package cz.novanadeje.app.operations.application.backup;

import cz.novanadeje.app.operations.domain.backup.BackupKey;
import cz.novanadeje.app.operations.domain.backup.BackupKeyCheckMismatch;
import cz.novanadeje.app.operations.domain.backup.BackupKeyConfirmation;
import cz.novanadeje.app.operations.domain.backup.BackupKeyRevealPaused;
import cz.novanadeje.app.operations.domain.backup.BackupKeyUnavailable;
import cz.novanadeje.app.shared.application.event.AdminActionPerformed;
import cz.novanadeje.app.shared.application.event.BackupKeyRevealed;
import cz.novanadeje.app.shared.application.secondfactor.FreshSecondFactor;
import cz.novanadeje.app.shared.application.secondfactor.FreshSecondFactorProof;
import cz.novanadeje.app.shared.domain.error.RuleViolation;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.context.ApplicationEventPublisher;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class BackupKeyServiceTest {

    private static final Instant NOW = Instant.parse("2026-10-28T09:00:00Z");
    private static final UUID ADMIN = UUID.fromString("019a1b2c-0000-7000-8000-00000000000a");
    private static final BackupKey KEY = new BackupKey("AGE-SECRET-KEY-1R45A984EXXAFC85YZSYGY9R6XJTD4E9AKY65ZCRGPDQ89E7ANW8QKT6GWH");
    private static final BackupKey OTHER_KEY = new BackupKey("AGE-SECRET-KEY-1ARXU2VF0GAFA8YLTUXNPDZE0UV33WNCJJEUWM3C2RKSR7A829JTS8HRKXT");
    private static final FreshSecondFactorProof CODE = new FreshSecondFactorProof(Optional.of("123456"), Optional.empty());

    private final InMemoryBackupKeyConfirmations confirmations = new InMemoryBackupKeyConfirmations();
    private final FreshSecondFactor freshSecondFactor = mock(FreshSecondFactor.class);
    private final ApplicationEventPublisher events = mock(ApplicationEventPublisher.class);
    private final BackupKeyRevealRefusals refusals = mock(BackupKeyRevealRefusals.class);
    private final Clock clock = Clock.fixed(NOW, ZoneOffset.UTC);

    private BackupKeyService service(Optional<BackupKey> key) {
        return new BackupKeyService(() -> key, confirmations, freshSecondFactor, refusals, events, clock);
    }

    @Test
    @DisplayName("Given a backup key nobody confirmed, when the state is asked for, then the key is there and not confirmed")
    void should_say_unconfirmed_when_asked_given_no_confirmation() {
        assertThat(service(Optional.of(KEY)).view()).isEqualTo(new BackupKeyView(true, false, Optional.empty()));
    }

    @Test
    @DisplayName("Given a confirmation of another key, when the state is asked for, then the current key is not confirmed")
    void should_say_unconfirmed_when_asked_given_another_key_confirmed() {
        confirmations.save(BackupKeyConfirmation.of(OTHER_KEY, NOW.minusSeconds(60), Optional.of(ADMIN)));

        assertThat(service(Optional.of(KEY)).view().confirmed()).isFalse();
    }

    @Test
    @DisplayName("Given no backup key reaches the backend, when the state is asked for, then the key is not available")
    void should_say_unavailable_when_asked_given_no_key() {
        assertThat(service(Optional.empty()).view()).isEqualTo(new BackupKeyView(false, false, Optional.empty()));
    }

    @Test
    @DisplayName("Given a fresh second factor, when the key is revealed, then the key comes back, the view is audited and the administrators are told")
    void should_reveal_key_when_revealed_given_fresh_second_factor() {
        BackupKey revealed = service(Optional.of(KEY)).reveal(ADMIN, CODE);

        assertThat(revealed).isEqualTo(KEY);
        verify(freshSecondFactor).require(ADMIN, CODE);
        ArgumentCaptor<AdminActionPerformed> audited = ArgumentCaptor.forClass(AdminActionPerformed.class);
        verify(events).publishEvent(audited.capture());
        assertThat(audited.getValue().action()).isEqualTo(BackupKeyService.VIEW_BACKUP_KEY_ACTION);
        assertThat(audited.getValue().adminId()).isEqualTo(ADMIN);
        assertThat(audited.getValue().details()).doesNotContain(KEY.value()).doesNotContain(KEY.lastCharacters());
        verify(events).publishEvent(new BackupKeyRevealed(ADMIN, NOW));
    }

    @Test
    @DisplayName("Given the second factor refuses, when the key is revealed, then nothing is shown, the refusal is recorded and nobody is told of a view")
    void should_refuse_reveal_when_revealed_given_refused_second_factor() {
        doThrow(new RuleViolation("donors/second-factor-code-rejected", "rejected")).when(freshSecondFactor).require(eq(ADMIN), any());

        assertThatThrownBy(() -> service(Optional.of(KEY)).reveal(ADMIN, CODE)).isInstanceOf(RuleViolation.class);

        verify(refusals).record(ADMIN, NOW);
        verifyNoInteractions(events);
    }

    @Test
    @DisplayName("Given the reveal is paused after refusals, when the key is revealed, then it is refused before any second factor is checked")
    void should_refuse_reveal_when_revealed_given_paused() {
        when(refusals.paused(ADMIN, NOW)).thenReturn(true);

        assertThatThrownBy(() -> service(Optional.of(KEY)).reveal(ADMIN, CODE)).isInstanceOf(BackupKeyRevealPaused.class);

        verifyNoInteractions(freshSecondFactor, events);
        verify(refusals, never()).record(any(), any());
    }

    @Test
    @DisplayName("Given no backup key, when it is revealed, then it is unavailable before any second factor is checked")
    void should_refuse_reveal_when_revealed_given_no_key() {
        assertThatThrownBy(() -> service(Optional.empty()).reveal(ADMIN, CODE)).isInstanceOf(BackupKeyUnavailable.class);

        verifyNoInteractions(freshSecondFactor, events);
    }

    @Test
    @DisplayName("Given the last four characters, when the administrator confirms the key is saved, then it counts as confirmed and is audited")
    void should_confirm_when_confirmed_given_last_four_characters() {
        BackupKeyView view = service(Optional.of(KEY)).confirm(ADMIN, "6gwh");

        assertThat(view).isEqualTo(new BackupKeyView(true, true, Optional.of(NOW)));
        assertThat(confirmations.find()).contains(BackupKeyConfirmation.of(KEY, NOW, Optional.of(ADMIN)));
        ArgumentCaptor<AdminActionPerformed> audited = ArgumentCaptor.forClass(AdminActionPerformed.class);
        verify(events).publishEvent(audited.capture());
        assertThat(audited.getValue().action()).isEqualTo(BackupKeyService.CONFIRM_BACKUP_KEY_ACTION);
    }

    @Test
    @DisplayName("Given other characters, when the administrator confirms the key is saved, then it is refused and nothing changes")
    void should_refuse_confirmation_when_confirmed_given_other_characters() {
        assertThatThrownBy(() -> service(Optional.of(KEY)).confirm(ADMIN, "AAAA")).isInstanceOf(BackupKeyCheckMismatch.class);

        assertThat(confirmations.find()).isEmpty();
        verifyNoInteractions(events);
    }

    @Test
    @DisplayName("Given no backup key, when the setup confirms it, then the setup goes on without a confirmation")
    void should_skip_confirmation_when_confirmed_in_setup_given_no_key() {
        service(Optional.empty()).confirmInSetup(null, NOW);

        assertThat(confirmations.find()).isEmpty();
    }
}
