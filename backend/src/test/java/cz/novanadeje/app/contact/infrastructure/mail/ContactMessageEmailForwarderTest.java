package cz.novanadeje.app.contact.infrastructure.mail;

import cz.novanadeje.app.contact.application.event.ContactMessageReceived;
import cz.novanadeje.app.contact.domain.ContactMessageId;
import cz.novanadeje.app.shared.domain.EmailAddress;
import cz.novanadeje.app.support.Emails;
import cz.novanadeje.app.support.MailContents;
import cz.novanadeje.app.support.MailPreviews;
import jakarta.mail.Message;
import jakarta.mail.Session;
import jakarta.mail.internet.InternetAddress;
import jakarta.mail.internet.MimeMessage;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.mail.javamail.JavaMailSender;

import java.time.Instant;
import java.util.Properties;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ContactMessageEmailForwarderTest {

    private static final Instant RECEIVED_AT = Instant.parse("2026-10-17T10:00:00Z");

    private final JavaMailSender mailSender = mock(JavaMailSender.class);
    private final ContactMessageEmailForwarder forwarder = new ContactMessageEmailForwarder(mailSender,
            Emails.branded(mailSender, "info@nfnn.cz", "https://nfnn.cz"), Emails.messages(), new ContactMailProperties("info@nfnn.cz"));

    @BeforeEach
    void prepareMail() {
        when(mailSender.createMimeMessage()).thenAnswer(invocation -> new MimeMessage(Session.getInstance(new Properties())));
    }

    @Test
    @DisplayName("Given a mail server that refuses the message, when it is forwarded, then the failure stays in the forwarder instead of reaching the async handler with the addresses in its message")
    void should_keep_failure_when_forwarded_given_refusing_server() {
        org.mockito.Mockito.doThrow(new org.springframework.mail.MailSendException("550 jana@example.cz rejected"))
                .when(mailSender).send(org.mockito.ArgumentMatchers.any(MimeMessage.class));

        org.assertj.core.api.Assertions.assertThatCode(() -> forwarder.forward(event("Jana Nováková", "Dotaz"))).doesNotThrowAnyException();
    }

    @Test
    @DisplayName("Given a message from Jana, when it is forwarded, then the foundation's mailbox gets it from the site, answerable to Jana, with her name in the subject")
    void should_address_forward_when_forwarded_given_message() throws Exception {
        forwarder.forward(event("Jana Nováková", "Mám dotaz k projektu Dominik."));

        MimeMessage email = MailContents.asReceived(sentEmail());
        InternetAddress from = (InternetAddress) email.getFrom()[0];
        assertThat(from.getAddress()).isEqualTo("info@nfnn.cz");
        assertThat(from.getPersonal()).isEqualTo("Nová naděje – nadační fond");
        assertThat(email.getRecipients(Message.RecipientType.TO)).extracting(Object::toString).containsExactly("info@nfnn.cz");
        assertThat(email.getReplyTo()).extracting(Object::toString).containsExactly("jana@example.cz");
        assertThat(email.getSubject()).isEqualTo("Nová zpráva z webu od Jana Nováková");
    }

    @Test
    @DisplayName("Given a message from Jana, when it is forwarded, then both parts carry her name, address, the time in Prague and the message")
    void should_write_both_parts_when_forwarded_given_message() throws Exception {
        forwarder.forward(event("Jana Nováková", "Mám dotaz k projektu Dominik.\nDíky, Jana"));

        MimeMessage email = sentEmail();
        assertThat(MailContents.plainText(email).replace("\r\n", "\n")).isEqualTo("""
                Jméno: Jana Nováková
                E-mail: jana@example.cz
                Přijato: 17. 10. 2026 12:00

                Zpráva:
                Mám dotaz k projektu Dominik.
                Díky, Jana

                Odpovězte přímo na tento e-mail, odpověď dorazí odesílateli.
                """);
        assertThat(MailContents.html(email).replace("\r\n", "\n"))
                .contains(">Nová zpráva z webu</h1>")
                .contains(">Jana Nováková<")
                .contains("href=\"mailto:jana@example.cz\"")
                .contains("17. 10. 2026 12:00")
                .contains("Mám dotaz k projektu Dominik.\nDíky, Jana")
                .contains("Odpovězte přímo na tento e-mail, odpověď dorazí odesílateli.")
                .contains("src=\"cid:logo\"");
        MailPreviews.save("contact-message", email);
    }

    @Test
    @DisplayName("Given a message with markup, when it is forwarded, then the HTML part shows it as text")
    void should_escape_markup_when_forwarded_given_message_with_tags() throws Exception {
        forwarder.forward(event("<b>Jana</b>", "<script>alert(1)</script>"));

        assertThat(MailContents.html(sentEmail()))
                .contains("&lt;b&gt;Jana&lt;/b&gt;")
                .contains("&lt;script&gt;alert(1)&lt;/script&gt;")
                .doesNotContain("<script>");
    }

    private MimeMessage sentEmail() {
        ArgumentCaptor<MimeMessage> sent = ArgumentCaptor.forClass(MimeMessage.class);
        verify(mailSender).send(sent.capture());
        return sent.getValue();
    }

    private static ContactMessageReceived event(String senderName, String body) {
        return new ContactMessageReceived(ContactMessageId.newId(RECEIVED_AT), senderName, new EmailAddress("jana@example.cz"), body, RECEIVED_AT);
    }
}
