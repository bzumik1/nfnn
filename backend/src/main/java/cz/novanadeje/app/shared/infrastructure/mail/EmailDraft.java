package cz.novanadeje.app.shared.infrastructure.mail;

import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;

public record EmailDraft(Locale locale, List<String> to, String subject, String title, String contentTemplate, Map<String, Object> variables,
                         String plainText, String footerNote) {

    public EmailDraft {
        Objects.requireNonNull(locale, "locale");
        if (to == null || to.isEmpty()) {
            throw new IllegalArgumentException("An e-mail draft needs a recipient");
        }
        to = to.stream().map(address -> requireText(address, "to")).toList();
        subject = requireText(subject, "subject");
        title = requireText(title, "title");
        contentTemplate = requireText(contentTemplate, "contentTemplate");
        variables = Map.copyOf(variables);
        plainText = requireText(plainText, "plainText");
        footerNote = requireText(footerNote, "footerNote");
    }

    public EmailDraft(Locale locale, String to, String subject, String title, String contentTemplate, Map<String, Object> variables,
                      String plainText, String footerNote) {
        this(locale, to == null ? null : List.of(to), subject, title, contentTemplate, variables, plainText, footerNote);
    }

    private static String requireText(String value, String name) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException("An e-mail draft needs a " + name);
        }
        return value;
    }
}
