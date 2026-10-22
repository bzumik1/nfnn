package cz.novanadeje.app.shared.infrastructure.mail;

import java.util.Locale;
import java.util.Map;
import java.util.Objects;

public record EmailDraft(Locale locale, String to, String subject, String title, String contentTemplate, Map<String, Object> variables,
                         String plainText, String footerNote) {

    public EmailDraft {
        Objects.requireNonNull(locale, "locale");
        to = requireText(to, "to");
        subject = requireText(subject, "subject");
        title = requireText(title, "title");
        contentTemplate = requireText(contentTemplate, "contentTemplate");
        variables = Map.copyOf(variables);
        plainText = requireText(plainText, "plainText");
        footerNote = requireText(footerNote, "footerNote");
    }

    private static String requireText(String value, String name) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException("An e-mail draft needs a " + name);
        }
        return value;
    }
}
