package cz.novanadeje.app.donations.infrastructure.fio;

import org.junit.jupiter.api.Test;

import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThatIllegalStateException;

class DisabledFioClientTest {

    private static final String DISABLED = "Fio import is disabled: FIO_TOKEN is not set";

    private final DisabledFioClient client = new DisabledFioClient();

    @Test
    void should_refuse_when_any_request_made_given_no_token() {
        assertThatIllegalStateException().isThrownBy(() -> client.transactionsBetween(LocalDate.of(2026, 10, 1), LocalDate.of(2026, 10, 17)))
                .withMessage(DISABLED);
        assertThatIllegalStateException().isThrownBy(client::newTransactions).withMessage(DISABLED);
        assertThatIllegalStateException().isThrownBy(() -> client.setLastDownloadedId(1)).withMessage(DISABLED);
        assertThatIllegalStateException().isThrownBy(() -> client.setLastDownloadedDate(LocalDate.of(2026, 10, 1))).withMessage(DISABLED);
    }
}
