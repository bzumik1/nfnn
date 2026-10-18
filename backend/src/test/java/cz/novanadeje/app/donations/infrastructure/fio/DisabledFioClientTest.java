package cz.novanadeje.app.donations.infrastructure.fio;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThatIllegalStateException;

class DisabledFioClientTest {

    private static final String DISABLED = "Fio import is disabled: FIO_TOKEN is not set";

    private final DisabledFioClient client = new DisabledFioClient();

    @Test
    void should_refuse_when_any_request_made_given_no_token() {
        assertThatIllegalStateException().isThrownBy(client::transactions).withMessage(DISABLED);
        assertThatIllegalStateException().isThrownBy(client::statements).withMessage(DISABLED);
        assertThatIllegalStateException().isThrownBy(client::merchant).withMessage(DISABLED);
        assertThatIllegalStateException().isThrownBy(client::bookmark).withMessage(DISABLED);
        assertThatIllegalStateException().isThrownBy(client::payments).withMessage(DISABLED);
    }
}
