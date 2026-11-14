package cz.novanadeje.app.content.infrastructure.mail;

import cz.novanadeje.app.content.application.event.ReceiptSignatureChanged;
import cz.novanadeje.app.shared.application.account.AdministratorContact;
import cz.novanadeje.app.shared.application.account.AdministratorContacts;
import cz.novanadeje.app.shared.domain.FoundationZone;
import cz.novanadeje.app.shared.infrastructure.mail.BrandedEmails;
import cz.novanadeje.app.shared.infrastructure.mail.EmailDraft;
import cz.novanadeje.app.shared.infrastructure.mail.MailSenderProperties;
import cz.novanadeje.app.shared.infrastructure.mail.ObservedMailSender;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.MessageSource;
import org.springframework.mail.MailException;
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
class ReceiptSignatureChangedEmailSender {

    private static final Logger log = LoggerFactory.getLogger(ReceiptSignatureChangedEmailSender.class);
    private static final String KEYS = "content.receiptSignatureChanged.email.";
    private static final String TEMPLATE = "email/content/receipt-signature-changed";

    private final ObservedMailSender mailSender;
    private final BrandedEmails emails;
    private final MessageSource messages;
    private final MailSenderProperties sender;
    private final AdministratorContacts administrators;

    ReceiptSignatureChangedEmailSender(ObservedMailSender mailSender, BrandedEmails emails, MessageSource messages, MailSenderProperties sender,
                                       AdministratorContacts administrators) {
        this.mailSender = mailSender;
        this.emails = emails;
        this.messages = messages;
        this.sender = sender;
        this.administrators = administrators;
    }

    @Async
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void sendChangedNotice(ReceiptSignatureChanged event) {
        try {
            List<AdministratorContact> recipients = administrators.all();
            Optional<String> changedBy = recipients.stream()
                    .filter(contact -> contact.accountId().equals(event.adminId()))
                    .map(contact -> contact.email().value())
                    .findFirst();
            recipients.forEach(recipient -> send(recipient, changedBy, event));
        } catch (RuntimeException e) {
            log.error("The notices that admin {} changed the receipt signature could not be prepared: {}", event.adminId(), e.getClass().getSimpleName());
        }
    }

    private void send(AdministratorContact recipient, Optional<String> changedBy, ReceiptSignatureChanged event) {
        Locale locale = recipient.preferredLocale().toLocale();
        String when = DateTimeFormatter.ofPattern(text("dateFormat", locale), locale).format(event.changedAt().atZone(FoundationZone.ZONE));
        String who = changedBy.map(address -> text("admin", locale, address)).orElseGet(() -> text("adminUnknown", locale));
        String intro = text(event.removed() ? "removed" : "changed", locale, who, when, event.personName());
        Optional<String> client = event.client().map(name -> text("client", locale, name));
        String footer = text("footer", locale, sender.senderEmail());
        List<String> paragraphs = new ArrayList<>(List.of(text("greeting", locale), intro));
        client.ifPresent(paragraphs::add);
        paragraphs.addAll(List.of(text("expected", locale), text("warning", locale, sender.senderEmail()), text("signature", locale), footer));
        Map<String, Object> variables = new HashMap<>(Map.of("intro", intro, "senderEmail", sender.senderEmail()));
        client.ifPresent(line -> variables.put("client", line));
        EmailDraft draft = new EmailDraft(locale, recipient.email().value(), text("subject", locale), text("title", locale), TEMPLATE,
                variables, String.join("\n\n", paragraphs) + "\n", footer);
        try {
            mailSender.send(emails.compose(draft));
        } catch (MailException e) {
            log.error("The notice of the changed receipt signature for admin {} could not be sent: {}", recipient.accountId(), e.getClass().getSimpleName());
        }
    }

    private String text(String key, Locale locale, Object... arguments) {
        return messages.getMessage(KEYS + key, arguments.length == 0 ? null : arguments, locale);
    }
}
