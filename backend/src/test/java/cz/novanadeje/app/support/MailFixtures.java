package cz.novanadeje.app.support;

import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;

public final class MailFixtures {

    private static final String FOLDER = "/emails/";

    private MailFixtures() {
    }

    public static void assertSeenAsRecorded(MimeMessage received, String name) {
        try {
            assertThat(received.getSubject()).isEqualTo(fixture(name + ".subject.txt").strip());
        } catch (MessagingException unreadable) {
            throw new IllegalStateException("The e-mail's subject cannot be read", unreadable);
        }
        assertThat(MailContents.plainText(received).replace("\r\n", "\n")).isEqualTo(fixture(name + ".txt"));
        assertThat(MailContents.html(received).replace("\r\n", "\n")).isEqualTo(fixture(name + ".html"));
    }

    private static String fixture(String file) {
        try (InputStream stream = MailFixtures.class.getResourceAsStream(FOLDER + file)) {
            if (stream == null) {
                throw new AssertionError("The e-mail fixture " + FOLDER + file + " is missing");
            }
            return new String(stream.readAllBytes(), StandardCharsets.UTF_8).replace("\r\n", "\n");
        } catch (IOException unreadable) {
            throw new IllegalStateException("The e-mail fixture " + file + " cannot be read", unreadable);
        }
    }
}
