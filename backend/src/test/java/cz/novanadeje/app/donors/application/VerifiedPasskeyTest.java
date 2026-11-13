package cz.novanadeje.app.donors.application;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class VerifiedPasskeyTest {

    private static final byte[] CREDENTIAL_DATA = {1, 2, 3, 4, 5};

    @Test
    @DisplayName("Given credential data, when a verified passkey is made, then it keeps a copy and hands out copies")
    void should_keep_copy_when_created_given_credential_data() {
        byte[] bytes = CREDENTIAL_DATA.clone();

        VerifiedPasskey passkey = new VerifiedPasskey("credential-1", bytes, 3, List.of("internal"));
        bytes[0] = 0;
        passkey.credentialData()[1] = 0;

        assertThat(passkey.credentialData()).isEqualTo(CREDENTIAL_DATA);
    }

    @Test
    @DisplayName("Given two verified passkeys of the same credential, when compared, then they are equal, and another sign count makes them differ")
    void should_be_equal_when_compared_given_same_credential() {
        assertThat(new VerifiedPasskey("credential-1", CREDENTIAL_DATA, 3, List.of("internal")))
                .isEqualTo(new VerifiedPasskey("credential-1", CREDENTIAL_DATA.clone(), 3, List.of("internal")))
                .hasSameHashCodeAs(new VerifiedPasskey("credential-1", CREDENTIAL_DATA.clone(), 3, List.of("internal")));
        assertThat(new VerifiedPasskey("credential-1", CREDENTIAL_DATA, 3, List.of("internal")))
                .isNotEqualTo(new VerifiedPasskey("credential-1", CREDENTIAL_DATA, 4, List.of("internal")));
    }

    @Test
    @DisplayName("Given a verified passkey, when printed, then its credential id and sign count show and its credential data do not")
    void should_print_without_credential_data_when_printed_given_verified_passkey() {
        assertThat(new VerifiedPasskey("credential-1", CREDENTIAL_DATA, 3, List.of("internal")))
                .hasToString("VerifiedPasskey[credential-1, 5 bytes, sign count 3, transports [internal]]");
    }
}
