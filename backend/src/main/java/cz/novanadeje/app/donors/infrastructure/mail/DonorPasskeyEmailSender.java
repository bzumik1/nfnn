package cz.novanadeje.app.donors.infrastructure.mail;

import cz.novanadeje.app.donors.application.event.DonorPasskeyAdded;
import cz.novanadeje.app.donors.application.event.DonorPasskeyRemoved;
import cz.novanadeje.app.donors.application.event.DonorPasskeysRemoved;
import cz.novanadeje.app.shared.domain.EmailAddress;
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
class DonorPasskeyEmailSender {

    private static final Logger log = LoggerFactory.getLogger(DonorPasskeyEmailSender.class);
    private static final String ADDED_KEYS = "donors.passkeyAdded.email.";
    private static final String ADDED_TEMPLATE = "email/donors/passkey-added";
    private static final String REMOVED_KEYS = "donors.passkeysRemoved.email.";
    private static final String REMOVED_TEMPLATE = "email/donors/passkeys-removed";
    private static final String REMOVED_BY_DONOR_KEYS = "donors.passkeyRemoved.email.";
    private static final String REMOVED_BY_DONOR_TEMPLATE = "email/donors/passkey-removed";

    private final JavaMailSender mailSender;
    private final BrandedEmails emails;
    private final MessageSource messages;
    private final MailSenderProperties sender;

    DonorPasskeyEmailSender(JavaMailSender mailSender, BrandedEmails emails, MessageSource messages, MailSenderProperties sender) {
        this.mailSender = mailSender;
        this.emails = emails;
        this.messages = messages;
        this.sender = sender;
    }

    @Async
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void sendAddedNotice(DonorPasskeyAdded event) {
        Locale locale = event.preferredLocale().toLocale();
        send(event.donorId(), event.email(), locale, ADDED_KEYS, ADDED_TEMPLATE, text(ADDED_KEYS, "intro", locale, event.passkeyName()),
                Map.of("senderEmail", sender.senderEmail(), "passkeyName", event.passkeyName()));
    }

    @Async
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void sendRemovedNotice(DonorPasskeysRemoved event) {
        Locale locale = event.preferredLocale().toLocale();
        send(event.donorId(), event.email(), locale, REMOVED_KEYS, REMOVED_TEMPLATE, text(REMOVED_KEYS, "intro", locale),
                Map.of("senderEmail", sender.senderEmail()));
    }

    @Async
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void sendRemovedByDonorNotice(DonorPasskeyRemoved event) {
        Locale locale = event.preferredLocale().toLocale();
        send(event.donorId(), event.email(), locale, REMOVED_BY_DONOR_KEYS, REMOVED_BY_DONOR_TEMPLATE,
                text(REMOVED_BY_DONOR_KEYS, "intro", locale, event.passkeyName()),
                Map.of("senderEmail", sender.senderEmail(), "passkeyName", event.passkeyName()));
    }

    private void send(UUID donorId, EmailAddress recipient, Locale locale, String keys, String template, String intro, Map<String, Object> model) {
        String footer = text(keys, "footer", locale, sender.senderEmail());
        String plainText = String.join("\n\n", List.of(
                text(keys, "greeting", locale),
                intro,
                text(keys, "action", locale),
                text(keys, "warning", locale, sender.senderEmail()),
                text(keys, "signature", locale),
                footer)) + "\n";
        EmailDraft draft = new EmailDraft(locale, recipient.value(), text(keys, "subject", locale), text(keys, "title", locale), template, model,
                plainText, footer);
        try {
            mailSender.send(emails.compose(draft));
        } catch (MailException e) {
            log.error("The passkey e-mail {} for donor {} could not be sent: {}", template, donorId, e.getClass().getSimpleName());
        }
    }

    private String text(String keys, String key, Locale locale, Object... arguments) {
        return messages.getMessage(keys + key, arguments.length == 0 ? null : arguments, locale);
    }
}
