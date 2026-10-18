package cz.novanadeje.app.donations.cucumber;

import cz.novanadeje.app.donations.application.report.MonthlyReportNotDelivered;
import cz.novanadeje.app.donations.application.report.MonthlyReportService;
import cz.novanadeje.app.donations.domain.FoundationCalendar;
import cz.novanadeje.app.donations.domain.report.ReportMonth;
import cz.novanadeje.app.support.MailContents;
import cz.novanadeje.app.support.MutableClock;
import cz.novanadeje.app.support.RecordingMailSender;
import io.cucumber.java.en.Given;
import io.cucumber.java.en.Then;
import io.cucumber.java.en.When;
import jakarta.mail.Message;
import jakarta.mail.MessagingException;
import jakarta.mail.internet.InternetAddress;
import jakarta.mail.internet.MimeMessage;
import org.springframework.jdbc.core.simple.JdbcClient;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.YearMonth;
import java.util.Arrays;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

public class MonthlyReportStepDefinitions {

    private static final LocalTime CHECK_TIME = LocalTime.of(7, 0);

    private final MonthlyReportService reports;
    private final RecordingMailSender mailSender;
    private final MutableClock clock;
    private final JdbcClient jdbc;
    private RuntimeException lastFailure;

    public MonthlyReportStepDefinitions(MonthlyReportService reports, RecordingMailSender mailSender, MutableClock clock, JdbcClient jdbc) {
        this.reports = reports;
        this.mailSender = mailSender;
        this.clock = clock;
        this.jdbc = jdbc;
    }

    @Given("the mail server refuses the next e-mail")
    public void theMailServerRefusesTheNextEmail() {
        mailSender.failNextSend();
    }

    @When("the monthly report check runs on {date}")
    public void theMonthlyReportCheckRunsOn(LocalDate day) {
        clock.set(day.atTime(CHECK_TIME).atZone(FoundationCalendar.ZONE).toInstant());
        lastFailure = null;
        try {
            reports.sendDueReport();
        } catch (MonthlyReportNotDelivered notDelivered) {
            lastFailure = notDelivered;
        }
    }

    @When("the report for {string} is asked for")
    public void theReportForIsAskedFor(String month) {
        lastFailure = null;
        try {
            reports.sendReportFor(new ReportMonth(YearMonth.parse(month)));
        } catch (IllegalArgumentException refused) {
            lastFailure = refused;
        }
    }

    @Then("the monthly report was not delivered")
    public void theMonthlyReportWasNotDelivered() {
        assertThat(lastFailure).isInstanceOf(MonthlyReportNotDelivered.class);
    }

    @Then("the report is refused because the month has not ended")
    public void theReportIsRefusedBecauseTheMonthHasNotEnded() {
        assertThat(lastFailure).isInstanceOf(IllegalArgumentException.class).hasMessageContaining("has not ended");
    }

    @Then("{int} monthly report e-mail(s) is/are sent to {string}")
    public void monthlyReportEmailsAreSentTo(int count, String recipient) {
        List<MimeMessage> emails = mailSender.sent();
        assertThat(emails).hasSize(count);
        assertThat(emails).allSatisfy(email -> assertThat(recipientsOf(email)).containsExactly(recipient));
    }

    @Then("no monthly report e-mail is sent")
    public void noMonthlyReportEmailIsSent() {
        assertThat(mailSender.sent()).isEmpty();
    }

    @Then("the monthly report e-mail comes from {string} named {string}")
    public void theMonthlyReportEmailComesFrom(String address, String name) throws MessagingException {
        InternetAddress from = (InternetAddress) MailContents.asReceived(lastEmail()).getFrom()[0];
        assertThat(from.getAddress()).isEqualTo(address);
        assertThat(from.getPersonal()).isEqualTo(name);
    }

    @Then("monthly report e-mail {int} has the subject {string}")
    public void monthlyReportEmailHasTheSubject(int number, String subject) throws MessagingException {
        assertThat(MailContents.asReceived(mailSender.sent().get(number - 1)).getSubject()).isEqualTo(subject);
    }

    @Then("both parts of the monthly report e-mail say:")
    public void bothPartsOfTheMonthlyReportEmailSay(List<String> lines) {
        String text = spaced(MailContents.plainText(lastEmail()));
        String html = spaced(MailContents.html(lastEmail()));
        assertThat(text).contains(lines);
        assertThat(html).contains(lines);
    }

    @Then("the report for {string} is recorded as sent")
    public void theReportForIsRecordedAsSent(String month) {
        assertThat(recordsOf(month)).isEqualTo(1);
    }

    @Then("the report for {string} is not recorded")
    public void theReportForIsNotRecorded(String month) {
        assertThat(recordsOf(month)).isZero();
    }

    private long recordsOf(String month) {
        return jdbc.sql("select count(*) from donation_monthly_report where report_month = ?")
                .param(YearMonth.parse(month).atDay(1))
                .query(Long.class)
                .single();
    }

    private MimeMessage lastEmail() {
        List<MimeMessage> emails = mailSender.sent();
        assertThat(emails).withFailMessage("No monthly report e-mail was sent").isNotEmpty();
        return emails.getLast();
    }

    private static List<String> recipientsOf(MimeMessage email) {
        try {
            return Arrays.stream(MailContents.asReceived(email).getRecipients(Message.RecipientType.TO)).map(Object::toString).toList();
        } catch (MessagingException unreadable) {
            throw new IllegalStateException("The e-mail's recipients cannot be read", unreadable);
        }
    }

    private static String spaced(String text) {
        return text.replace(' ', ' ');
    }
}
