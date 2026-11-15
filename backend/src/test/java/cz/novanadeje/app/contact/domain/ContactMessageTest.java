package cz.novanadeje.app.contact.domain;

import cz.novanadeje.app.shared.domain.EmailAddress;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

class ContactMessageTest {

    private static final EmailAddress SENDER = new EmailAddress("jana@example.cz");
    private static final Instant NOW = Instant.parse("2026-10-17T10:00:00Z");

    @Test
    @DisplayName("Given a name, an email and a body, when a message is received, then it gets an id and keeps the trimmed values")
    void should_create_message_with_id_when_received_given_valid_data() {
        ContactMessage message = ContactMessage.receive(" Jana Nováková ", SENDER, " Dobrý den. ", NOW);

        assertThat(message.id()).isNotNull();
        assertThat(message.senderName()).isEqualTo("Jana Nováková");
        assertThat(message.senderEmail()).isEqualTo(SENDER);
        assertThat(message.body()).isEqualTo("Dobrý den.");
        assertThat(message.receivedAt()).isEqualTo(NOW);
    }

    @Test
    @DisplayName("Given a name with a line break or another control character inside, when a message is received, then each becomes a space, so the name never breaks the forwarded e-mail's subject")
    void should_replace_control_characters_with_spaces_when_received_given_name_with_control_characters() {
        for (String inside : List.of("\r\n", "\n", "\r", "\u0000", "\t", "\u001b", "\u007f", "\u0085", "\u009f", "\u2028", "\u2029")) {
            ContactMessage message = ContactMessage.receive("Jana" + inside + "Nováková", SENDER, "Dobrý den.", NOW);

            assertThat(message.senderName()).as("U+%04X", (int) inside.charAt(0)).isEqualTo("Jana" + " ".repeat(inside.length()) + "Nováková");
        }
    }

    @Test
    @DisplayName("Given a name of control characters only, when a message is received, then it is rejected as blank")
    void should_reject_when_received_given_name_of_control_characters_only() {
        assertThatIllegalArgumentException()
                .isThrownBy(() -> ContactMessage.receive("\u0000\u0007\u2028", SENDER, "Dobrý den.", NOW));
    }

    @Test
    @DisplayName("Given a body with line breaks, when a message is received, then it keeps them")
    void should_keep_line_breaks_when_received_given_body_with_line_breaks() {
        ContactMessage message = ContactMessage.receive("Jana", SENDER, "Dobrý den,\r\nprosím o potvrzení.\n\tDěkuji", NOW);

        assertThat(message.body()).isEqualTo("Dobrý den,\r\nprosím o potvrzení.\n\tDěkuji");
    }

    @Test
    @DisplayName("Given a blank name, when a message is received, then it is rejected")
    void should_reject_when_received_given_blank_name() {
        assertThatIllegalArgumentException()
                .isThrownBy(() -> ContactMessage.receive("  ", SENDER, "Dobrý den.", NOW));
    }

    @Test
    @DisplayName("Given a blank body, when a message is received, then it is rejected")
    void should_reject_when_received_given_blank_body() {
        assertThatIllegalArgumentException()
                .isThrownBy(() -> ContactMessage.receive("Jana", SENDER, "", NOW));
    }

    @Test
    @DisplayName("Given a name longer than 120 characters, when a message is received, then it is rejected")
    void should_reject_when_received_given_name_longer_than_120_characters() {
        assertThatIllegalArgumentException()
                .isThrownBy(() -> ContactMessage.receive("J".repeat(121), SENDER, "Dobrý den.", NOW));
    }

    @Test
    @DisplayName("Given a body longer than 5000 characters, when a message is received, then it is rejected")
    void should_reject_when_received_given_body_longer_than_5000_characters() {
        assertThatIllegalArgumentException()
                .isThrownBy(() -> ContactMessage.receive("Jana", SENDER, "x".repeat(5001), NOW));
    }

    @Test
    @DisplayName("Given no e-mail, when a message is received, then it is rejected")
    void should_reject_when_received_given_no_email() {
        assertThatIllegalArgumentException()
                .isThrownBy(() -> ContactMessage.receive("Jana", null, "Dobrý den.", NOW));
    }
}
