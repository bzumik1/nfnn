package cz.novanadeje.app.donors.infrastructure.mail;

import cz.novanadeje.app.donors.application.AdministratorContact;
import cz.novanadeje.app.donors.application.AdministratorService;
import cz.novanadeje.app.shared.application.event.BackupKeyRevealed;
import cz.novanadeje.app.shared.domain.FoundationZone;
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

import java.time.Instant;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

@Component
class BackupKeyRevealedEmailSender {

    private static final Logger log = LoggerFactory.getLogger(BackupKeyRevealedEmailSender.class);
    private static final String KEYS = "donors.backupKeyRevealed.email.";
    private static final String TEMPLATE = "email/donors/backup-key-revealed";

    private final JavaMailSender mailSender;
    private final BrandedEmails emails;
    private final MessageSource messages;
    private final MailSenderProperties sender;
    private final AdministratorService administrators;

    BackupKeyRevealedEmailSender(JavaMailSender mailSender, BrandedEmails emails, MessageSource messages, MailSenderProperties sender,
                                 AdministratorService administrators) {
        this.mailSender = mailSender;
        this.emails = emails;
        this.messages = messages;
        this.sender = sender;
        this.administrators = administrators;
    }

    @Async
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void sendRevealedNotice(BackupKeyRevealed event) {
        try {
            List<AdministratorContact> recipients = administrators.contacts();
            Optional<String> revealedBy = recipients.stream()
                    .filter(contact -> contact.id().value().equals(event.adminId()))
                    .map(contact -> contact.email().value())
                    .findFirst();
            recipients.forEach(recipient -> send(recipient, revealedBy, event.revealedAt()));
        } catch (RuntimeException e) {
            log.error("The notices that admin {} viewed the backup key could not be prepared: {}", event.adminId(), e.getClass().getSimpleName());
        }
    }

    private void send(AdministratorContact recipient, Optional<String> revealedBy, Instant revealedAt) {
        Locale locale = recipient.preferredLocale().toLocale();
        String when = DateTimeFormatter.ofPattern(text("dateFormat", locale), locale).format(revealedAt.atZone(FoundationZone.ZONE));
        String intro = revealedBy.map(address -> text("intro", locale, address, when)).orElseGet(() -> text("introUnknown", locale, when));
        String footer = text("footer", locale, sender.senderEmail());
        String plainText = String.join("\n\n", List.of(
                text("greeting", locale),
                intro,
                text("expected", locale),
                text("warning", locale, sender.senderEmail()),
                text("signature", locale),
                footer)) + "\n";
        EmailDraft draft = new EmailDraft(locale, recipient.email().value(), text("subject", locale), text("title", locale), TEMPLATE,
                Map.of("intro", intro, "senderEmail", sender.senderEmail()), plainText, footer);
        try {
            mailSender.send(emails.compose(draft));
        } catch (MailException e) {
            log.error("The backup key notice for admin {} could not be sent: {}", recipient.id(), e.getClass().getSimpleName());
        }
    }

    private String text(String key, Locale locale, Object... arguments) {
        return messages.getMessage(KEYS + key, arguments.length == 0 ? null : arguments, locale);
    }
}
