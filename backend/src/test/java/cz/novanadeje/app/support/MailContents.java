package cz.novanadeje.app.support;

import jakarta.mail.BodyPart;
import jakarta.mail.MessagingException;
import jakarta.mail.Multipart;
import jakarta.mail.Part;
import jakarta.mail.Session;
import jakarta.mail.internet.MimeMessage;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.Properties;

public final class MailContents {

    private MailContents() {
    }

    public static MimeMessage asReceived(MimeMessage sent) {
        try {
            ByteArrayOutputStream wire = new ByteArrayOutputStream();
            sent.writeTo(wire);
            return new MimeMessage(Session.getInstance(new Properties()), new ByteArrayInputStream(wire.toByteArray()));
        } catch (MessagingException | IOException unreadable) {
            throw new IllegalStateException("The e-mail cannot be serialised", unreadable);
        }
    }

    public static String plainText(MimeMessage email) {
        return part(email, "text/plain").orElseThrow(() -> new AssertionError("The e-mail has no text/plain part"));
    }

    public static String html(MimeMessage email) {
        return part(email, "text/html").orElseThrow(() -> new AssertionError("The e-mail has no text/html part"));
    }

    private static Optional<String> part(MimeMessage email, String mimeType) {
        try {
            List<String> found = new ArrayList<>();
            collect(asReceived(email), mimeType, found);
            return found.stream().findFirst();
        } catch (MessagingException | IOException unreadable) {
            throw new IllegalStateException("The e-mail cannot be read", unreadable);
        }
    }

    private static void collect(Part part, String mimeType, List<String> found) throws MessagingException, IOException {
        if (part.isMimeType("multipart/*")) {
            Multipart multipart = (Multipart) part.getContent();
            for (int i = 0; i < multipart.getCount(); i++) {
                BodyPart child = multipart.getBodyPart(i);
                collect(child, mimeType, found);
            }
        } else if (part.isMimeType(mimeType)) {
            found.add(part.getContent().toString());
        }
    }
}
