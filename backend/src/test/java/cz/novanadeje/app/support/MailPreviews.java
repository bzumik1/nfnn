package cz.novanadeje.app.support;

import jakarta.mail.BodyPart;
import jakarta.mail.MessagingException;
import jakarta.mail.Multipart;
import jakarta.mail.Part;
import jakarta.mail.internet.MimeMessage;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Base64;
import java.util.Optional;

public final class MailPreviews {

    private static final Path FOLDER = Path.of("build", "email-preview");

    private MailPreviews() {
    }

    public static Path save(String name, MimeMessage email) {
        try {
            MimeMessage received = MailContents.asReceived(email);
            String html = MailContents.html(received);
            Optional<String> logo = inlineImage(received, "<logo>");
            if (logo.isPresent()) {
                html = html.replace("cid:logo", logo.get());
            }
            Files.createDirectories(FOLDER);
            Path file = FOLDER.resolve(name + ".html");
            Files.writeString(file, html, StandardCharsets.UTF_8);
            Files.writeString(FOLDER.resolve(name + ".txt"), MailContents.plainText(received), StandardCharsets.UTF_8);
            return file;
        } catch (IOException | MessagingException unreadable) {
            throw new IllegalStateException("The e-mail preview cannot be written", unreadable);
        }
    }

    private static Optional<String> inlineImage(Part part, String contentId) throws MessagingException, IOException {
        if (part.isMimeType("multipart/*")) {
            Multipart multipart = (Multipart) part.getContent();
            for (int i = 0; i < multipart.getCount(); i++) {
                BodyPart child = multipart.getBodyPart(i);
                Optional<String> found = inlineImage(child, contentId);
                if (found.isPresent()) {
                    return found;
                }
            }
            return Optional.empty();
        }
        String[] ids = part.getHeader("Content-ID");
        if (ids != null && ids.length > 0 && contentId.equals(ids[0])) {
            try (InputStream content = part.getInputStream()) {
                return Optional.of("data:" + part.getContentType().split(";")[0].trim() + ";base64,"
                        + Base64.getEncoder().encodeToString(content.readAllBytes()));
            }
        }
        return Optional.empty();
    }
}
