package cz.novanadeje.app.donors.infrastructure.mail;

import cz.novanadeje.app.donors.application.event.AdministratorSecondFactorRecovered;
import cz.novanadeje.app.donors.application.event.DonorSecondFactorRecovered;
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

@Component
class DonorSecondFactorRecoveredEmailSender {

    private static final Logger log = LoggerFactory.getLogger(DonorSecondFactorRecoveredEmailSender.class);
    private static final String DONOR_KEYS = "donors.secondFactorRecovered.email.";
    private static final String DONOR_TEMPLATE = "email/donors/second-factor-recovered";
    private static final String ADMINISTRATOR_KEYS = "donors.administratorSecondFactorRecovered.email.";
    private static final String ADMINISTRATOR_TEMPLATE = "email/donors/administrator-second-factor-recovered";

    private final JavaMailSender mailSender;
    private final BrandedEmails emails;
    private final MessageSource messages;
    private final MailSenderProperties sender;

    DonorSecondFactorRecoveredEmailSender(JavaMailSender mailSender, BrandedEmails emails, MessageSource messages, MailSenderProperties sender) {
        this.mailSender = mailSender;
        this.emails = emails;
        this.messages = messages;
        this.sender = sender;
    }

    @Async
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void sendRecoveryNotice(DonorSecondFactorRecovered event) {
        Locale locale = event.preferredLocale().toLocale();
        String footer = text(DONOR_KEYS, "footer", locale, sender.senderEmail());
        String plainText = String.join("\n\n", List.of(
                text(DONOR_KEYS, "greeting", locale),
                text(DONOR_KEYS, "intro", locale, event.senderAccount()),
                text(DONOR_KEYS, "action", locale),
                text(DONOR_KEYS, "warning", locale, sender.senderEmail()),
                text(DONOR_KEYS, "signature", locale),
                footer)) + "\n";
        EmailDraft draft = new EmailDraft(locale, event.email().value(), text(DONOR_KEYS, "subject", locale), text(DONOR_KEYS, "title", locale),
                DONOR_TEMPLATE, Map.of("senderEmail", sender.senderEmail(), "senderAccount", event.senderAccount()), plainText, footer);
        try {
            mailSender.send(emails.compose(draft));
        } catch (MailException e) {
            log.error("The second-factor recovery e-mail for donor {} could not be sent: {}", event.donorId(), e.getClass().getSimpleName());
        }
    }

    @Async
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void tellTheOtherAdministrators(AdministratorSecondFactorRecovered event) {
        int index = 0;
        for (AdministratorSecondFactorRecovered.Recipient recipient : event.recipients()) {
            index++;
            try {
                mailSender.send(emails.compose(administratorDraft(event, recipient)));
            } catch (MailException e) {
                log.error("The second-factor recovery notice about administrator {} could not be sent to administrator {} of {}: {}",
                        event.donorId(), index, event.recipients().size(), e.getClass().getSimpleName());
            }
        }
    }

    private EmailDraft administratorDraft(AdministratorSecondFactorRecovered event, AdministratorSecondFactorRecovered.Recipient recipient) {
        Locale locale = recipient.preferredLocale().toLocale();
        String footer = text(ADMINISTRATOR_KEYS, "footer", locale);
        String plainText = String.join("\n\n", List.of(
                text(ADMINISTRATOR_KEYS, "greeting", locale),
                text(ADMINISTRATOR_KEYS, "intro", locale, event.name(), event.email().value(), event.senderAccount()),
                text(ADMINISTRATOR_KEYS, "action", locale),
                text(ADMINISTRATOR_KEYS, "warning", locale, sender.senderEmail()),
                text(ADMINISTRATOR_KEYS, "signature", locale),
                footer)) + "\n";
        return new EmailDraft(locale, recipient.email().value(), text(ADMINISTRATOR_KEYS, "subject", locale),
                text(ADMINISTRATOR_KEYS, "title", locale), ADMINISTRATOR_TEMPLATE,
                Map.of("senderEmail", sender.senderEmail(), "senderAccount", event.senderAccount(), "administratorName", event.name(),
                        "administratorEmail", event.email().value()), plainText, footer);
    }

    private String text(String keys, String key, Locale locale, Object... arguments) {
        return messages.getMessage(keys + key, arguments.length == 0 ? null : arguments, locale);
    }
}
