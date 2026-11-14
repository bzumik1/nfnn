package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.DeviceId;
import cz.novanadeje.app.donors.domain.DeviceSignOutReason;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.EmailVerificationTokenRepository;
import cz.novanadeje.app.donors.domain.PasswordResetTokenRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class CredentialChangesTest {

    private static final Instant NOW = Instant.parse("2026-11-14T10:00:00Z");
    private static final DonorId JANA = DonorId.newId(NOW.minusSeconds(60));
    private static final Optional<DeviceId> THIS_DEVICE = Optional.of(new DeviceId(UUID.fromString("019a5a3c-0000-7000-8000-00000000000d")));
    private static final UUID USED_RESET_LINK = UUID.fromString("019a5a3c-0000-7000-8000-0000000000aa");

    @Mock
    private DeviceSignOuts signOuts;
    @Mock
    private EmailVerificationTokenRepository verificationLinks;
    @Mock
    private PasswordResetTokenRepository resetLinks;

    @Test
    @DisplayName("Given a change of the credentials made without a session, when every session ends, then the pending e-mail change and every password reset link are spent before the sessions end")
    void should_spend_change_and_reset_links_before_ending_sessions_when_every_session_ends() {
        credentialChanges().endEverySessionAndLinkOf(JANA, NOW);

        InOrder order = inOrder(verificationLinks, resetLinks, signOuts);
        order.verify(verificationLinks).deleteChangeLinksOf(JANA);
        order.verify(resetLinks).deleteAllOf(JANA);
        order.verify(signOuts).endAllOf(JANA, DeviceSignOutReason.CREDENTIALS_CHANGED, NOW);
    }

    @Test
    @DisplayName("Given a change of the credentials made in a session, when every other session ends, then the links are spent and this device's session continues")
    void should_spend_links_and_keep_this_session_when_every_other_session_ends() {
        credentialChanges().endEveryOtherSessionAndLinkOf(JANA, THIS_DEVICE, NOW);

        InOrder order = inOrder(verificationLinks, resetLinks, signOuts);
        order.verify(verificationLinks).deleteChangeLinksOf(JANA);
        order.verify(resetLinks).deleteAllOf(JANA);
        order.verify(signOuts).endAllOf(JANA, THIS_DEVICE, DeviceSignOutReason.CREDENTIALS_CHANGED, NOW);
    }

    @Test
    @DisplayName("Given a change of the credentials made with a password reset link, when every session ends, then every other link is spent and the used one is kept")
    void should_spend_every_other_link_when_every_session_ends_given_change_through_reset_link() {
        credentialChanges().endEverySessionAndOtherLinkOf(JANA, USED_RESET_LINK, NOW);

        InOrder order = inOrder(verificationLinks, resetLinks, signOuts);
        order.verify(verificationLinks).deleteChangeLinksOf(JANA);
        order.verify(resetLinks).deleteOthersOf(JANA, USED_RESET_LINK);
        order.verify(signOuts).endAllOf(JANA, DeviceSignOutReason.CREDENTIALS_CHANGED, NOW);
        verify(resetLinks, never()).deleteAllOf(JANA);
    }

    private CredentialChanges credentialChanges() {
        return new CredentialChanges(signOuts, verificationLinks, resetLinks);
    }
}
