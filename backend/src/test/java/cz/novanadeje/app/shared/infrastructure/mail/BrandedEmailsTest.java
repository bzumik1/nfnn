package cz.novanadeje.app.shared.infrastructure.mail;

import cz.novanadeje.app.support.Emails;
import cz.novanadeje.app.support.MailContents;
import jakarta.mail.BodyPart;
import jakarta.mail.Message;
import jakarta.mail.Multipart;
import jakarta.mail.Part;
import jakarta.mail.Session;
import jakarta.mail.internet.InternetAddress;
import jakarta.mail.internet.MimeMessage;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mail.MailPreparationException;
import org.springframework.mail.javamail.JavaMailSender;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Properties;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class BrandedEmailsTest {

    private static final Locale CZECH = Locale.forLanguageTag("cs");
    private static final String CONTENT = "email/donors/password-reset";
    private static final Map<String, Object> RESET_VARIABLES = Map.of(
            "email", "jana@example.cz", "link", "https://nfnn.cz/obnova-hesla#token=abc", "validMinutes", 60L);

    private final JavaMailSender mailSender = mock(JavaMailSender.class);
    private final BrandedEmails emails = Emails.branded(mailSender, "info@nfnn.cz", "https://nfnn.cz/");

    BrandedEmailsTest() {
        when(mailSender.createMimeMessage()).thenAnswer(invocation -> new MimeMessage(Session.getInstance(new Properties())));
    }

    @Test
    @DisplayName("Given a Czech draft, when it is composed, then it goes from the foundation to the recipient with the subject and both parts")
    void should_address_and_fill_both_parts_when_composed_given_czech_draft() throws Exception {
        MimeMessage email = MailContents.asReceived(emails.compose(draft(CZECH, "Máte-li dotaz, napište nám na info@nfnn.cz.")));

        InternetAddress from = (InternetAddress) email.getFrom()[0];
        assertThat(from.getAddress()).isEqualTo("info@nfnn.cz");
        assertThat(from.getPersonal()).isEqualTo("Nová naděje – nadační fond");
        assertThat(email.getRecipients(Message.RecipientType.TO)).extracting(Object::toString).containsExactly("jana@example.cz");
        assertThat(email.getSubject()).isEqualTo("Obnova hesla k dárcovskému účtu – Nová naděje");
        assertThat(MailContents.plainText(email)).startsWith("Dobrý den,");
        assertThat(MailContents.html(email))
                .contains("lang=\"cs\"")
                .contains("<title>Obnova hesla</title>")
                .contains(">Obnova hesla</h1>")
                .contains("Obnovit přístup")
                .contains("Máte-li dotaz, napište nám na info@nfnn.cz.")
                .contains("Nová naděje – nadační fond · IČO 27278794 · Jiráskova 436, 473 01 Nový Bor")
                .contains("href=\"https://nfnn.cz\"")
                .contains(">nfnn.cz</a>");
    }

    @Test
    @DisplayName("Given a draft, when it is composed, then the logo travels as an inline PNG that the HTML references by its content id")
    void should_embed_logo_inline_when_composed_given_draft() throws Exception {
        MimeMessage email = MailContents.asReceived(emails.compose(draft(CZECH, "Poznámka.")));

        assertThat(MailContents.html(email)).contains("src=\"cid:logo\"").contains("alt=\"Nová naděje – nadační fond\"");
        List<Part> inline = new ArrayList<>();
        collectInline(email, inline);
        assertThat(inline).hasSize(1);
        Part logo = inline.getFirst();
        assertThat(logo.getContentType()).startsWith("image/png");
        assertThat(logo.getHeader("Content-ID")).containsExactly("<logo>");
        assertThat(logo.getDisposition()).isEqualTo(Part.INLINE);
    }

    @Test
    @DisplayName("Given an English draft, when it is composed, then the page language, the sender name and the footer follow the locale")
    void should_localise_layout_when_composed_given_english_draft() throws Exception {
        MimeMessage email = MailContents.asReceived(emails.compose(new EmailDraft(Locale.ENGLISH, "jana@example.cz", "Password reset",
                "Password reset", CONTENT, RESET_VARIABLES, "Hello,\n", "Questions? Write to info@nfnn.cz.")));

        assertThat(MailContents.html(email))
                .contains("lang=\"en\"")
                .contains("Restore access")
                .contains("If the button does not work, open this link:")
                .contains("Kind regards")
                .contains("Questions? Write to info@nfnn.cz.")
                .contains("Nový Bor, Czech Republic");
    }

    @Test
    @DisplayName("Given a variable with markup, when it is composed, then the HTML part escapes it")
    void should_escape_variables_when_composed_given_markup() throws Exception {
        MimeMessage email = MailContents.asReceived(emails.compose(new EmailDraft(CZECH, "jana@example.cz", "Obnova hesla", "Obnova <b>hesla</b>",
                CONTENT, Map.of("email", "<script>alert(1)</script>", "link", "https://nfnn.cz/x", "validMinutes", 60L), "text", "pozn")));

        assertThat(MailContents.html(email))
                .contains("Obnova &lt;b&gt;hesla&lt;/b&gt;")
                .contains("&lt;script&gt;alert(1)&lt;/script&gt;")
                .doesNotContain("<script>");
    }

    @Test
    @DisplayName("Given a draft that names a layout variable, when it is composed, then it is refused")
    void should_refuse_when_composed_given_reserved_variable() {
        EmailDraft draft = new EmailDraft(CZECH, "jana@example.cz", "s", "t", CONTENT, Map.of("title", "x"), "text", "pozn");

        assertThatThrownBy(() -> emails.compose(draft))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("title");
    }

    @Test
    @DisplayName("Given a blank recipient, when the draft is made, then it is refused")
    void should_refuse_when_made_given_blank_recipient() {
        assertThatThrownBy(() -> new EmailDraft(CZECH, " ", "s", "t", CONTENT, Map.of(), "text", "pozn"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("to");
    }

    @Test
    @DisplayName("Given a mail session that cannot build a message, when the draft is composed, then the failure is a MailException")
    void should_wrap_failure_when_composed_given_broken_session() {
        JavaMailSender broken = mock(JavaMailSender.class);
        when(broken.createMimeMessage()).thenReturn(new MimeMessage(Session.getInstance(new Properties())) {
            @Override
            public void setSubject(String subject, String charset) throws jakarta.mail.MessagingException {
                throw new jakarta.mail.MessagingException("broken");
            }
        });

        assertThatThrownBy(() -> Emails.branded(broken, "info@nfnn.cz", "https://nfnn.cz").compose(draft(CZECH, "pozn")))
                .isInstanceOf(MailPreparationException.class);
    }

    private static EmailDraft draft(Locale locale, String footerNote) {
        return new EmailDraft(locale, "jana@example.cz", "Obnova hesla k dárcovskému účtu – Nová naděje", "Obnova hesla", CONTENT, RESET_VARIABLES,
                "Dobrý den,\n", footerNote);
    }

    private static void collectInline(Part part, List<Part> found) throws Exception {
        if (part.isMimeType("multipart/*")) {
            Multipart multipart = (Multipart) part.getContent();
            for (int i = 0; i < multipart.getCount(); i++) {
                BodyPart child = multipart.getBodyPart(i);
                collectInline(child, found);
            }
        } else if (part.isMimeType("image/*")) {
            found.add(part);
        }
    }
}
