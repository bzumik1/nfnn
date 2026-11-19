package cz.novanadeje.app.operations.domain.settings;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class MailServerAddressTest {

    @Test
    @DisplayName("Given a mail server's address, when it is written as text, then it names the host, port and STARTTLS but not the user")
    void should_leave_the_user_out_when_written_given_an_address() {
        assertThat(new MailServerAddress("smtp.example.cz", 587, "nadace@example.cz", true).toString())
                .contains("smtp.example.cz:587").contains("startTls=true").doesNotContain("nadace");
    }
}
