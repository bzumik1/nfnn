package cz.novanadeje.app.donors.infrastructure.mail;

import cz.novanadeje.app.donors.application.AdministratorContact;
import cz.novanadeje.app.donors.application.AdministratorService;
import cz.novanadeje.app.shared.application.event.ReceiptSigningKeyWithdrawalAnnounced;
import cz.novanadeje.app.shared.application.event.ReceiptSigningKeyWithdrawn;
import cz.novanadeje.app.shared.domain.FoundationZone;
import cz.novanadeje.app.shared.infrastructure.mail.BrandedEmails;
import cz.novanadeje.app.shared.infrastructure.mail.EmailDraft;
import cz.novanadeje.app.shared.infrastructure.mail.MailSenderProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.MessageSource;
import org.springframework.mail.MailException;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

@Component
class ReceiptSigningKeyWithdrawnEmailSender {

    private static final Logger log = LoggerFactory.getLogger(ReceiptSigningKeyWithdrawnEmailSender.class);
    private static final String KEYS = "donors.receiptSigningKeyWithdrawn.email.";
    private static final String TEMPLATE = "email/donors/receipt-signing-key-withdrawn";

    private final JavaMailSender mailSender;
    private final BrandedEmails emails;
    private final MessageSource messages;
    private final MailSenderProperties sender;
    private final AdministratorService administrators;
    private final ApplicationEventPublisher events;

    ReceiptSigningKeyWithdrawnEmailSender(JavaMailSender mailSender, BrandedEmails emails, MessageSource messages, MailSenderProperties sender,
                                          AdministratorService administrators, ApplicationEventPublisher events) {
        this.mailSender = mailSender;
        this.emails = emails;
        this.messages = messages;
        this.sender = sender;
        this.administrators = administrators;
        this.events = events;
    }

    @Async
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void sendWithdrawnNotice(ReceiptSigningKeyWithdrawn event) {
        try {
            List<AdministratorContact> recipients = administrators.contacts();
            Optional<String> withdrawnBy = recipients.stream()
                    .filter(contact -> contact.id().value().equals(event.adminId()))
                    .map(contact -> contact.email().value())
                    .findFirst();
            recipients.forEach(recipient -> send(recipient, withdrawnBy, event));
        } catch (RuntimeException e) {
            log.error("The notices that admin {} withdrew a receipt signing key could not be prepared: {}", event.adminId(), e.getClass().getSimpleName());
        } finally {
            events.publishEvent(new ReceiptSigningKeyWithdrawalAnnounced(event.keyId(), event.current()));
        }
    }

    private void send(AdministratorContact recipient, Optional<String> withdrawnBy, ReceiptSigningKeyWithdrawn event) {
        Locale locale = recipient.preferredLocale().toLocale();
        String when = DateTimeFormatter.ofPattern(text("dateFormat", locale), locale).format(event.withdrawnAt().atZone(FoundationZone.ZONE));
        String intro = withdrawnBy.map(address -> text("intro", locale, address, when, event.keyId()))
                .orElseGet(() -> text("introUnknown", locale, when, event.keyId()));
        Optional<String> newKey = event.current() ? Optional.of(text("newKey", locale)) : Optional.empty();
        String footer = text("footer", locale, sender.senderEmail());
        List<String> paragraphs = new ArrayList<>(List.of(text("greeting", locale), intro));
        newKey.ifPresent(paragraphs::add);
        paragraphs.addAll(List.of(text("expected", locale), text("warning", locale, sender.senderEmail()), text("signature", locale), footer));
        Map<String, Object> variables = new HashMap<>(Map.of("intro", intro, "senderEmail", sender.senderEmail()));
        newKey.ifPresent(text -> variables.put("newKey", text));
        EmailDraft draft = new EmailDraft(locale, recipient.email().value(), text("subject", locale), text("title", locale), TEMPLATE,
                variables, String.join("\n\n", paragraphs) + "\n", footer);
        try {
            mailSender.send(emails.compose(draft));
        } catch (MailException e) {
            log.error("The notice of the withdrawn receipt signing key for admin {} could not be sent: {}", recipient.id(), e.getClass().getSimpleName());
        }
    }

    private String text(String key, Locale locale, Object... arguments) {
        return messages.getMessage(KEYS + key, arguments.length == 0 ? null : arguments, locale);
    }
}
