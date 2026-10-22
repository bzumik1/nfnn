package cz.novanadeje.app.donations.infrastructure.report;

import cz.novanadeje.app.donations.application.report.MonthlyReportNotDelivered;
import cz.novanadeje.app.donations.domain.importing.ImportFailureKind;
import cz.novanadeje.app.donations.domain.report.BankImportStatus;
import cz.novanadeje.app.donations.domain.report.DonorCounts;
import cz.novanadeje.app.donations.domain.report.ImportFailure;
import cz.novanadeje.app.donations.domain.report.MonthlyReport;
import cz.novanadeje.app.donations.domain.report.ReportMonth;
import cz.novanadeje.app.donations.domain.report.Tally;
import cz.novanadeje.app.shared.domain.Money;
import cz.novanadeje.app.support.Emails;
import cz.novanadeje.app.support.MailContents;
import cz.novanadeje.app.support.MailPreviews;
import jakarta.mail.Message;
import jakarta.mail.Session;
import jakarta.mail.internet.InternetAddress;
import jakarta.mail.internet.MimeMessage;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.mail.MailSendException;
import org.springframework.mail.javamail.JavaMailSender;

import java.time.Instant;
import java.util.Optional;
import java.util.Properties;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class MonthlyReportEmailSenderTest {

    private static final ReportMonth SEPTEMBER = ReportMonth.of(2026, 9);
    private static final Instant SUCCEEDED_AT = Instant.parse("2026-10-01T10:00:00Z");
    private static final Instant FAILED_AT = Instant.parse("2026-10-02T04:00:00Z");
    private static final MonthlyReport REPORT = new MonthlyReport(SEPTEMBER, DonorCounts.between(1, 2), new Tally(2, Money.czk(153450)),
            new Tally(3, Money.czk(173450)), new Tally(1, Money.czk(15000)), new BankImportStatus(Optional.of(SUCCEEDED_AT), Optional.empty()));

    private final JavaMailSender mailSender = mock(JavaMailSender.class);
    private final MonthlyReportEmailSender sender = new MonthlyReportEmailSender(mailSender,
            Emails.branded(mailSender, "info@nfnn.cz", "https://nfnn.cz"), Emails.messages(), new MonthlyReportProperties("0 0 7 * * *", "prehled@nfnn.cz"));

    @BeforeEach
    void prepareMail() {
        when(mailSender.createMimeMessage()).thenAnswer(invocation -> new MimeMessage(Session.getInstance(new Properties())));
    }

    @Test
    @DisplayName("Given September's report, when it is sent, then it goes to the report recipient from the foundation with the month in the subject")
    void should_address_report_when_sent_given_september() throws Exception {
        sender.send(REPORT);

        MimeMessage email = MailContents.asReceived(sentEmail());
        assertThat(email.getSubject()).isEqualTo("Měsíční přehled Nová naděje – září 2026");
        assertThat(email.getRecipients(Message.RecipientType.TO)).extracting(Object::toString).containsExactly("prehled@nfnn.cz");
        InternetAddress from = (InternetAddress) email.getFrom()[0];
        assertThat(from.getAddress()).isEqualTo("info@nfnn.cz");
        assertThat(from.getPersonal()).isEqualTo("Nová naděje – nadační fond");
        assertThat(MailContents.html(email))
                .contains(">Měsíční přehled – září 2026</h1>")
                .contains("Registrovaní dárci k 30. 9. 2026: 2")
                .contains("Poslední úspěšné stažení plateb z banky: 1. 10. 2026 12:00")
                .contains("Tento přehled posílá web automaticky jednou za měsíc.")
                .contains("src=\"cid:logo\"");
        MailPreviews.save("monthly-report", email);
    }

    @Test
    @DisplayName("Given September's report, when it is sent, then its text lists the donors, the donations, the unpaired payments and the bank import")
    void should_list_every_section_when_sent_given_september() {
        sender.send(REPORT);

        assertThat(plainText()).contains(
                "Registrovaní dárci k 30. 9. 2026: 2",
                "Noví dárci za září 2026: 1",
                "Přijaté dary za září 2026: počet 2, celkem 1 534,50 Kč",
                "Přijaté dary od 1. 1. 2026: počet 3, celkem 1 734,50 Kč",
                "Nespárované příchozí platby za září 2026: počet 1, celkem 150,00 Kč",
                "Poslední úspěšné stažení plateb z banky: 1. 10. 2026 12:00");
        assertThat(plainText()).doesNotContain("selhal");
    }

    @Test
    @DisplayName("Given a bank import that never succeeded and last failed on the token, when the report is sent, then it says so in Czech")
    void should_describe_failure_when_sent_given_failed_import_without_success() {
        sender.send(new MonthlyReport(SEPTEMBER, DonorCounts.between(0, 0), new Tally(0, Money.czk(0)), new Tally(0, Money.czk(0)),
                new Tally(0, Money.czk(0)), new BankImportStatus(Optional.empty(), Optional.of(new ImportFailure(ImportFailureKind.UNAUTHORIZED, FAILED_AT)))));

        assertThat(plainText()).contains(
                "Poslední úspěšné stažení plateb z banky: zatím žádné",
                "Poslední pokus o stažení 2. 10. 2026 6:00 selhal: Fio token chybí, ještě neplatí nebo vypršel (platí 180 dní); je potřeba vytvořit nový.",
                "Přijaté dary za září 2026: počet 0, celkem 0,00 Kč");
    }

    @Test
    @DisplayName("Given a mail server that refuses the e-mail, when the report is sent, then the refusal becomes a report not delivered for that month")
    void should_report_not_delivered_when_sent_given_refused_mail() {
        MailSendException refused = new MailSendException("refused");
        doThrow(refused).when(mailSender).send(any(MimeMessage.class));

        assertThatThrownBy(() -> sender.send(REPORT))
                .isInstanceOfSatisfying(MonthlyReportNotDelivered.class, failure -> {
                    assertThat(failure.month()).isEqualTo(SEPTEMBER);
                    assertThat(failure.getCause()).isSameAs(refused);
                });
    }

    private MimeMessage sentEmail() {
        ArgumentCaptor<MimeMessage> sent = ArgumentCaptor.forClass(MimeMessage.class);
        verify(mailSender).send(sent.capture());
        return sent.getValue();
    }

    private String plainText() {
        return MailContents.plainText(sentEmail()).replace(' ', ' ');
    }
}
