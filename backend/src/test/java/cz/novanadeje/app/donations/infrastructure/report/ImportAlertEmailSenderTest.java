package cz.novanadeje.app.donations.infrastructure.report;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import cz.novanadeje.app.donations.application.event.BankImportOutageDetected;
import cz.novanadeje.app.donations.application.event.BankImportRecovered;
import cz.novanadeje.app.donations.domain.importing.ImportFailureKind;
import cz.novanadeje.app.donations.domain.importing.ImportOutage;
import cz.novanadeje.app.donations.domain.importing.ImportRecovery;
import cz.novanadeje.app.donations.domain.report.ReportSettings;
import cz.novanadeje.app.donations.domain.report.ReportSettingsRepository;
import cz.novanadeje.app.shared.domain.EmailAddress;
import cz.novanadeje.app.support.Emails;
import cz.novanadeje.app.support.MailContents;
import cz.novanadeje.app.support.MailPreviews;
import jakarta.mail.Message;
import jakarta.mail.Session;
import jakarta.mail.internet.InternetAddress;
import jakarta.mail.internet.MimeMessage;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.slf4j.LoggerFactory;
import org.springframework.mail.MailSendException;
import org.springframework.mail.javamail.JavaMailSender;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.Properties;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ImportAlertEmailSenderTest {

    private static final Instant LAST_SUCCESS = Instant.parse("2026-10-22T10:00:00Z");
    private static final Instant DETECTED_AT = Instant.parse("2026-10-22T13:00:00Z");
    private static final Instant RECOVERED_AT = Instant.parse("2026-10-22T14:00:00Z");

    private final JavaMailSender mailSender = mock(JavaMailSender.class);
    private final ReportSettingsRepository settings = mock(ReportSettingsRepository.class);
    private final ImportAlertEmailSender sender = new ImportAlertEmailSender(mailSender,
            Emails.branded(mailSender, "info@nfnn.cz", "https://nfnn.cz"), Emails.messages(),
            settings);
    private ListAppender<ILoggingEvent> log;

    @BeforeEach
    void prepareMail() {
        when(mailSender.createMimeMessage()).thenAnswer(invocation -> new MimeMessage(Session.getInstance(new Properties())));
        when(settings.current()).thenReturn(ReportSettings.defaults(new EmailAddress("prehled@nfnn.cz")));
        log = new ListAppender<>();
        log.start();
        logger().addAppender(log);
    }

    @AfterEach
    void detachLog() {
        logger().detachAppender(log);
    }

    @Test
    @DisplayName("Given three transport failures after a success, when the outage is sent, then the report recipient reads how often it failed, why, what to do and the last success")
    void should_describe_repeated_failures_when_outage_sent_given_transport_outage() throws Exception {
        sender.sendOutage(new BankImportOutageDetected(new ImportOutage(ImportFailureKind.TRANSPORT, 3, Optional.of(LAST_SUCCESS), DETECTED_AT)));

        MimeMessage email = MailContents.asReceived(sentEmail());
        assertThat(email.getSubject()).isEqualTo("Stahování plateb z banky selhává – Nová naděje");
        assertThat(email.getRecipients(Message.RecipientType.TO)).extracting(Object::toString).containsExactly("prehled@nfnn.cz");
        InternetAddress from = (InternetAddress) email.getFrom()[0];
        assertThat(from.getAddress()).isEqualTo("info@nfnn.cz");
        assertThat(from.getPersonal()).isEqualTo("Nová naděje – nadační fond");
        assertThat(MailContents.html(email))
                .contains(">Stahování plateb z banky selhává</h1>")
                .contains("web Nová naděje už 3× za sebou nedokázal stáhnout platby z Fio, naposledy 22. 10. 2026 15:00.")
                .contains("Fio nebylo dostupné: spojení selhalo nebo vypršelo.")
                .contains("Zkontrolujte připojení serveru k internetu a stav Fio API; další pokusy proběhnou samy každou hodinu.")
                .contains("Poslední úspěšné stažení plateb z banky: 22. 10. 2026 12:00")
                .contains("Dokud porucha trvá, nové dary se dárcům v portálu neukážou a potvrzení o daru za ně nevydáme.")
                .contains("Až se stahování obnoví, pošleme ještě jednu zprávu; do té doby už tuto zprávu neopakujeme.")
                .contains("Tuto zprávu posílá web automaticky, když stahování plateb z banky selže třikrát za sebou")
                .contains("src=\"cid:logo\"");
        assertThat(plainText()).contains(
                "web Nová naděje už 3× za sebou nedokázal stáhnout platby z Fio, naposledy 22. 10. 2026 15:00.",
                "Fio nebylo dostupné: spojení selhalo nebo vypršelo.",
                "Poslední úspěšné stažení plateb z banky: 22. 10. 2026 12:00",
                "Nová naděje – nadační fond");
        assertThat(infos()).containsExactly("Fio import alert e-mail sent: outage TRANSPORT");
        MailPreviews.save("import-outage", email);
    }

    @Test
    @DisplayName("Given a rejected token on a state that never succeeded, when the outage is sent, then the e-mail names the token, the renewal steps and no last success")
    void should_describe_token_renewal_when_outage_sent_given_rejected_token() {
        sender.sendOutage(new BankImportOutageDetected(new ImportOutage(ImportFailureKind.UNAUTHORIZED, 1, Optional.empty(), DETECTED_AT)));

        assertThat(plainText()).contains(
                "Fio 22. 10. 2026 15:00 odmítlo token, kterým web Nová naděje stahuje platby z účtu fondu.",
                "Token chybí, ještě neplatí nebo vypršel (platí 180 dní).",
                "vytvořte nový token typu „Sledování účtu“, zapište ho na serveru do backend.env na řádek FIO_TOKEN a aplikaci přeinstalujte.",
                "Poslední úspěšné stažení plateb z banky: zatím žádné");
        assertThat(plainText()).doesNotContain("za sebou nedokázal");
        MailPreviews.save("import-outage-token", sentEmail());
    }

    @Test
    @DisplayName("Given a recovery after three failures, when it is sent, then the e-mail tells when the import worked again, how many attempts failed and the success before")
    void should_describe_recovery_when_sent_given_three_failures() throws Exception {
        sender.sendRecovery(new BankImportRecovered(new ImportRecovery(ImportFailureKind.TRANSPORT, 3, Optional.of(LAST_SUCCESS), RECOVERED_AT)));

        MimeMessage email = MailContents.asReceived(sentEmail());
        assertThat(email.getSubject()).isEqualTo("Stahování plateb z banky zase funguje – Nová naděje");
        assertThat(email.getRecipients(Message.RecipientType.TO)).extracting(Object::toString).containsExactly("prehled@nfnn.cz");
        assertThat(MailContents.html(email))
                .contains(">Stahování plateb z banky zase funguje</h1>")
                .contains("web Nová naděje 22. 10. 2026 16:00 znovu stáhl platby z Fio. Předtím selhaly 3 pokusy za sebou.")
                .contains("Poslední úspěšné stažení před poruchou: 22. 10. 2026 12:00")
                .contains("Platby, které mezitím přišly, jsou stažené a spárované; dárci je vidí ve svém přehledu.");
        assertThat(plainText()).contains("Předtím selhaly 3 pokusy za sebou.", "Poslední úspěšné stažení před poruchou: 22. 10. 2026 12:00");
        assertThat(infos()).containsExactly("Fio import alert e-mail sent: recovery from TRANSPORT");
        MailPreviews.save("import-recovered", email);
    }

    @Test
    @DisplayName("Given recoveries after one and after five failures, when they are sent, then the Czech plural fits the count")
    void should_decline_attempts_when_recovery_sent_given_other_counts() {
        sender.sendRecovery(new BankImportRecovered(new ImportRecovery(ImportFailureKind.UNAUTHORIZED, 1, Optional.empty(), RECOVERED_AT)));
        sender.sendRecovery(new BankImportRecovered(new ImportRecovery(ImportFailureKind.UNEXPECTED, 5, Optional.of(LAST_SUCCESS), RECOVERED_AT)));

        ArgumentCaptor<MimeMessage> sent = ArgumentCaptor.forClass(MimeMessage.class);
        verify(mailSender, times(2)).send(sent.capture());
        List<String> texts = sent.getAllValues().stream().map(MailContents::plainText).toList();
        assertThat(texts.get(0)).contains("Předtím selhal 1 pokus za sebou.", "Před poruchou se stažení plateb z banky nikdy nepodařilo.");
        assertThat(texts.get(1)).contains("Předtím selhalo 5 pokusů za sebou.");
    }

    @Test
    @DisplayName("Given a mail server that refuses the e-mail, when the outage is sent, then the refusal is logged at ERROR with the alert and the exception class, and nothing is thrown")
    void should_log_error_when_outage_sent_given_refused_mail() {
        doThrow(new MailSendException("refused")).when(mailSender).send(any(MimeMessage.class));

        sender.sendOutage(new BankImportOutageDetected(new ImportOutage(ImportFailureKind.UNAUTHORIZED, 1, Optional.empty(), DETECTED_AT)));

        assertThat(log.list).filteredOn(event -> event.getLevel() == Level.ERROR).extracting(ILoggingEvent::getFormattedMessage)
                .containsExactly("The Fio import alert e-mail (outage UNAUTHORIZED) could not be sent: MailSendException");
        assertThat(infos()).isEmpty();
    }

    private MimeMessage sentEmail() {
        ArgumentCaptor<MimeMessage> sent = ArgumentCaptor.forClass(MimeMessage.class);
        verify(mailSender).send(sent.capture());
        return sent.getValue();
    }

    private String plainText() {
        return MailContents.plainText(sentEmail()).replace(' ', ' ');
    }

    private List<String> infos() {
        return log.list.stream().filter(event -> event.getLevel() == Level.INFO).map(ILoggingEvent::getFormattedMessage).toList();
    }

    private static Logger logger() {
        return (Logger) LoggerFactory.getLogger(ImportAlertEmailSender.class);
    }
}
