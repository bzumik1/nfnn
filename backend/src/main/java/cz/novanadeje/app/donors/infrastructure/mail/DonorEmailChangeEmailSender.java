package cz.novanadeje.app.donors.infrastructure.mail;

import cz.novanadeje.app.donors.application.DonorEmailVerificationProperties;
import cz.novanadeje.app.donors.application.event.DonorEmailAddressInUse;
import cz.novanadeje.app.donors.application.event.DonorEmailChangeRequested;
import cz.novanadeje.app.donors.application.event.DonorEmailChanged;
import cz.novanadeje.app.shared.infrastructure.config.PublicUrlProperties;
import cz.novanadeje.app.shared.infrastructure.mail.BrandedEmails;
import cz.novanadeje.app.shared.infrastructure.mail.EmailDraft;
import cz.novanadeje.app.shared.infrastructure.mail.MailSenderProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.MessageSource;
import org.springframework.mail.MailException;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

@Component
class DonorEmailChangeEmailSender {

    private static final Logger log = LoggerFactory.getLogger(DonorEmailChangeEmailSender.class);
    private static final String CHANGE_KEYS = "donors.emailChange.email.";
    private static final String CHANGE_TEMPLATE = "email/donors/email-change";
    private static final String VERIFICATION_PAGE = "/potvrzeni-emailu#token=";
    private static final String CHANGED_KEYS = "donors.emailChanged.email.";
    private static final String CHANGED_TEMPLATE = "email/donors/email-changed";
    private static final String IN_USE_KEYS = "donors.emailInUse.email.";
    private static final String IN_USE_TEMPLATE = "email/donors/email-in-use";

    private final JavaMailSender mailSender;
    private final BrandedEmails emails;
    private final MessageSource messages;
    private final MailSenderProperties sender;
    private final PublicUrlProperties publicUrl;
    private final DonorEmailVerificationProperties properties;

    DonorEmailChangeEmailSender(JavaMailSender mailSender, BrandedEmails emails, MessageSource messages, MailSenderProperties sender,
                                PublicUrlProperties publicUrl, DonorEmailVerificationProperties properties) {
        this.mailSender = mailSender;
        this.emails = emails;
        this.messages = messages;
        this.sender = sender;
        this.publicUrl = publicUrl;
        this.properties = properties;
    }

    @Async
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void sendChangeLink(DonorEmailChangeRequested event) {
        Locale locale = event.preferredLocale().toLocale();
        String link = publicUrl.link(VERIFICATION_PAGE + event.secret().value()).toString();
        long validHours = properties.tokenTtl().toHours();
        String footer = text(CHANGE_KEYS, "footer", locale, sender.senderEmail());
        String plainText = paragraphs(
                text(CHANGE_KEYS, "greeting", locale),
                text(CHANGE_KEYS, "intro", locale, event.newEmail().value()),
                link,
                text(CHANGE_KEYS, "validity", locale, validHours),
                text(CHANGE_KEYS, "ignore", locale),
                text(CHANGE_KEYS, "signature", locale),
                footer);
        send(event.donorId(), "e-mail change", new EmailDraft(locale, event.newEmail().value(), text(CHANGE_KEYS, "subject", locale),
                text(CHANGE_KEYS, "title", locale), CHANGE_TEMPLATE,
                Map.of("newEmail", event.newEmail().value(), "link", link, "validHours", validHours), plainText, footer));
    }

    @Async
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void sendChangedNotice(DonorEmailChanged event) {
        Locale locale = event.preferredLocale().toLocale();
        String footer = text(CHANGED_KEYS, "footer", locale, sender.senderEmail());
        String plainText = paragraphs(
                text(CHANGED_KEYS, "greeting", locale),
                text(CHANGED_KEYS, "intro", locale, event.previousEmail().value(), event.newEmail().value()),
                text(CHANGED_KEYS, "warning", locale, sender.senderEmail()),
                text(CHANGED_KEYS, "signature", locale),
                footer);
        send(event.donorId(), "e-mail changed", new EmailDraft(locale, event.previousEmail().value(), text(CHANGED_KEYS, "subject", locale),
                text(CHANGED_KEYS, "title", locale), CHANGED_TEMPLATE,
                Map.of("previousEmail", event.previousEmail().value(), "newEmail", event.newEmail().value(), "senderEmail", sender.senderEmail()),
                plainText, footer));
    }

    @Async
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void sendInUseNotice(DonorEmailAddressInUse event) {
        Locale locale = event.preferredLocale().toLocale();
        String footer = text(IN_USE_KEYS, "footer", locale, sender.senderEmail());
        String plainText = paragraphs(
                text(IN_USE_KEYS, "greeting", locale),
                text(IN_USE_KEYS, "intro", locale, event.email().value()),
                text(IN_USE_KEYS, "action", locale),
                text(IN_USE_KEYS, "ignore", locale),
                text(IN_USE_KEYS, "signature", locale),
                footer);
        send(event.ownerId(), "e-mail in use", new EmailDraft(locale, event.email().value(), text(IN_USE_KEYS, "subject", locale),
                text(IN_USE_KEYS, "title", locale), IN_USE_TEMPLATE, Map.of("email", event.email().value()), plainText, footer));
    }

    private void send(UUID donorId, String kind, EmailDraft draft) {
        try {
            mailSender.send(emails.compose(draft));
        } catch (MailException e) {
            log.error("The {} e-mail for donor {} could not be sent: {}", kind, donorId, e.getClass().getSimpleName());
        }
    }

    private static String paragraphs(String... texts) {
        return String.join("\n\n", List.of(texts)) + "\n";
    }

    private String text(String keys, String key, Locale locale, Object... arguments) {
        return messages.getMessage(keys + key, arguments.length == 0 ? null : arguments, locale);
    }
}
