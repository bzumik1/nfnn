package cz.novanadeje.app.donors.infrastructure.mail;

import cz.novanadeje.app.donors.application.event.DonorSecondFactorRecoveryStarted;
import cz.novanadeje.app.donors.application.event.DonorSenderAccountLearned;
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

import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

@Component
class DonorSecurityNoticeEmailSender {

    private static final Logger log = LoggerFactory.getLogger(DonorSecurityNoticeEmailSender.class);
    private static final String RECOVERY_KEYS = "donors.secondFactorRecoveryStarted.email.";
    private static final String RECOVERY_TEMPLATE = "email/donors/second-factor-recovery-started";
    private static final String ACCOUNT_KEYS = "donors.senderAccountLearned.email.";
    private static final String ACCOUNT_TEMPLATE = "email/donors/sender-account-learned";

    private final ObservedMailSender mailSender;
    private final BrandedEmails emails;
    private final MessageSource messages;
    private final MailSenderProperties sender;

    DonorSecurityNoticeEmailSender(ObservedMailSender mailSender, BrandedEmails emails, MessageSource messages, MailSenderProperties sender) {
        this.mailSender = mailSender;
        this.emails = emails;
        this.messages = messages;
        this.sender = sender;
    }

    @Async
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void sendRecoveryStartedNotice(DonorSecondFactorRecoveryStarted event) {
        Locale locale = event.preferredLocale().toLocale();
        String footer = text(RECOVERY_KEYS, "footer", locale, sender.senderEmail());
        String plainText = String.join("\n\n", List.of(
                text(RECOVERY_KEYS, "greeting", locale),
                text(RECOVERY_KEYS, "intro", locale),
                text(RECOVERY_KEYS, "action", locale),
                text(RECOVERY_KEYS, "warning", locale, sender.senderEmail()),
                text(RECOVERY_KEYS, "signature", locale),
                footer)) + "\n";
        send(event.donorId(), "second-factor recovery start", new EmailDraft(locale, event.email().value(), text(RECOVERY_KEYS, "subject", locale),
                text(RECOVERY_KEYS, "title", locale), RECOVERY_TEMPLATE, Map.of("senderEmail", sender.senderEmail()), plainText, footer));
    }

    @Async
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void sendSenderAccountLearnedNotice(DonorSenderAccountLearned event) {
        Locale locale = event.preferredLocale().toLocale();
        String footer = text(ACCOUNT_KEYS, "footer", locale, sender.senderEmail());
        String plainText = String.join("\n\n", List.of(
                text(ACCOUNT_KEYS, "greeting", locale),
                text(ACCOUNT_KEYS, "intro", locale, event.accountLastDigits()),
                text(ACCOUNT_KEYS, "action", locale),
                text(ACCOUNT_KEYS, "warning", locale, sender.senderEmail()),
                text(ACCOUNT_KEYS, "signature", locale),
                footer)) + "\n";
        send(event.donorId(), "learned sender account", new EmailDraft(locale, event.email().value(), text(ACCOUNT_KEYS, "subject", locale),
                text(ACCOUNT_KEYS, "title", locale), ACCOUNT_TEMPLATE,
                Map.of("senderEmail", sender.senderEmail(), "accountLastDigits", event.accountLastDigits()), plainText, footer));
    }

    private void send(UUID donorId, String notice, EmailDraft draft) {
        try {
            mailSender.send(emails.compose(draft));
        } catch (MailException e) {
            log.error("The {} e-mail for donor {} could not be sent: {}", notice, donorId, e.getClass().getSimpleName());
        }
    }

    private String text(String keys, String key, Locale locale, Object... arguments) {
        return messages.getMessage(keys + key, arguments.length == 0 ? null : arguments, locale);
    }
}
