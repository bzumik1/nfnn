package cz.novanadeje.app.donors.domain;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

class PasskeyTest {

    private static final Instant NOW = Instant.parse("2026-10-23T10:00:00Z");
    private static final DonorId DONOR = DonorId.newId(NOW);
    private static final String CREDENTIAL_ID = "AbCd-_0123456789";

    @Test
    @DisplayName("Given a verified credential, when it is registered, then it keeps a trimmed name, the known transports and no use yet")
    void should_keep_trimmed_name_and_known_transports_when_registered() {
        byte[] credentialData = {1, 2, 3};

        Passkey passkey = Passkey.register(DONOR, CREDENTIAL_ID, credentialData, 0, List.of("internal", "hybrid", "carrier-pigeon", "internal"),
                "  iPhone  ", NOW);
        credentialData[0] = 9;

        assertThat(passkey.name()).isEqualTo("iPhone");
        assertThat(passkey.transports()).containsExactly("internal", "hybrid");
        assertThat(passkey.credentialData()).containsExactly(1, 2, 3);
        assertThat(passkey.createdAt()).isEqualTo(NOW);
        assertThat(passkey.lastUsedAt()).isEmpty();
        assertThat(passkey.belongsTo(DONOR)).isTrue();
        assertThat(passkey.belongsTo(DonorId.newId(NOW))).isFalse();
    }

    @Test
    @DisplayName("Given a name that is blank, too long or holds control characters, when a passkey is registered, then it is refused")
    void should_refuse_invalid_name_when_registered() {
        assertThatIllegalArgumentException().isThrownBy(() -> Passkey.register(DONOR, CREDENTIAL_ID, new byte[]{1}, 0, List.of(), "   ", NOW));
        assertThatIllegalArgumentException().isThrownBy(() -> Passkey.register(DONOR, CREDENTIAL_ID, new byte[]{1}, 0, List.of(),
                "a".repeat(Passkey.MAX_NAME_LENGTH + 1), NOW));
        assertThatIllegalArgumentException().isThrownBy(() -> Passkey.register(DONOR, CREDENTIAL_ID, new byte[]{1}, 0, List.of(), "a\nb", NOW));
        assertThat(Passkey.register(DONOR, CREDENTIAL_ID, new byte[]{1}, 0, List.of(), "a".repeat(Passkey.MAX_NAME_LENGTH), NOW).name())
                .hasSize(Passkey.MAX_NAME_LENGTH);
    }

    @Test
    @DisplayName("Given a credential id that is not base64url or too long, when a passkey is registered, then it is refused")
    void should_refuse_malformed_credential_id_when_registered() {
        assertThatIllegalArgumentException().isThrownBy(() -> Passkey.register(DONOR, "not+base64", new byte[]{1}, 0, List.of(), "Mac", NOW));
        assertThatIllegalArgumentException().isThrownBy(() -> Passkey.register(DONOR, "a".repeat(Passkey.MAX_CREDENTIAL_ID_LENGTH + 1),
                new byte[]{1}, 0, List.of(), "Mac", NOW));
    }

    @Test
    @DisplayName("Given a registered passkey, when it signs the donor in, then it remembers the time and the authenticator's counter")
    void should_remember_use_when_signed_in() {
        Passkey passkey = Passkey.register(DONOR, CREDENTIAL_ID, new byte[]{1}, 3, List.of("usb"), "Klíčenka", NOW);

        passkey.recordSignIn(4, NOW.plusSeconds(60));

        assertThat(passkey.signCount()).isEqualTo(4);
        assertThat(passkey.lastUsedAt()).contains(NOW.plusSeconds(60));
    }

    @Test
    @DisplayName("Given a registered passkey, when the donor renames it, then it keeps the trimmed new name and everything else")
    void should_keep_trimmed_new_name_when_renamed_given_registered_passkey() {
        Passkey passkey = Passkey.register(DONOR, CREDENTIAL_ID, new byte[]{1}, 3, List.of("internal"), "iPhone", NOW);

        passkey.rename("  iPhone 16 Pro Max (práce)  ");

        assertThat(passkey.name()).isEqualTo("iPhone 16 Pro Max (práce)");
        assertThat(passkey.credentialId()).isEqualTo(CREDENTIAL_ID);
        assertThat(passkey.createdAt()).isEqualTo(NOW);
        assertThat(passkey.signCount()).isEqualTo(3);
    }

    @Test
    @DisplayName("Given a registered passkey, when it is renamed to a blank, too long or control-character name, then it is refused and keeps its name")
    void should_refuse_invalid_name_when_renamed_given_registered_passkey() {
        Passkey passkey = Passkey.register(DONOR, CREDENTIAL_ID, new byte[]{1}, 0, List.of(), "Mac", NOW);

        assertThatIllegalArgumentException().isThrownBy(() -> passkey.rename("  "));
        assertThatIllegalArgumentException().isThrownBy(() -> passkey.rename("a".repeat(Passkey.MAX_NAME_LENGTH + 1)));
        assertThatIllegalArgumentException().isThrownBy(() -> passkey.rename("a\tb"));
        assertThat(passkey.name()).isEqualTo("Mac");
    }
}
