package cz.novanadeje.app.donations.cucumber;

import cz.novanadeje.app.donations.domain.importing.BankImportState;
import cz.novanadeje.app.donations.domain.importing.BankImportStateRepository;
import cz.novanadeje.app.donations.domain.importing.ImportFailureKind;
import cz.novanadeje.app.support.MailContents;
import cz.novanadeje.app.support.RecordingMailSender;
import io.cucumber.java.en.Then;
import jakarta.mail.Message;
import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;

import java.time.Duration;
import java.util.Arrays;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

public class ImportAlertStepDefinitions {

    private static final Duration MAIL_WAIT = Duration.ofSeconds(5);
    private static final Duration SETTLE = Duration.ofMillis(300);

    private final RecordingMailSender mailSender;
    private final BankImportStateRepository states;

    public ImportAlertStepDefinitions(RecordingMailSender mailSender, BankImportStateRepository states) {
        this.mailSender = mailSender;
        this.states = states;
    }

    @Then("no alert e-mail is sent")
    public void noAlertEmailIsSent() {
        await().pollDelay(SETTLE).atMost(MAIL_WAIT).until(() -> true);
        assertThat(mailSender.sent()).isEmpty();
    }

    @Then("{int} e-mails are sent to {string}")
    public void emailsAreSentTo(int count, String recipient) {
        await().atMost(MAIL_WAIT).untilAsserted(() -> assertThat(mailSender.sent()).hasSizeGreaterThanOrEqualTo(count));
        await().pollDelay(SETTLE).atMost(MAIL_WAIT).until(() -> true);
        assertThat(mailSender.sent()).hasSize(count);
        assertThat(mailSender.sent()).allSatisfy(email -> assertThat(recipientsOf(email)).containsExactly(recipient));
    }

    @Then("alert e-mail {int} has the subject {string}")
    public void alertEmailHasTheSubject(int number, String subject) throws MessagingException {
        await().atMost(MAIL_WAIT).untilAsserted(() -> assertThat(mailSender.sent()).hasSizeGreaterThanOrEqualTo(number));
        assertThat(MailContents.asReceived(mailSender.sent().get(number - 1)).getSubject()).isEqualTo(subject);
    }

    @Then("both parts of the alert e-mail say:")
    public void bothPartsOfTheAlertEmailSay(List<String> lines) {
        await().atMost(MAIL_WAIT).untilAsserted(() -> assertThat(mailSender.sent()).withFailMessage("No alert e-mail was sent").isNotEmpty());
        MimeMessage email = mailSender.sent().getLast();
        assertThat(spaced(MailContents.plainText(email))).contains(lines);
        assertThat(spaced(MailContents.html(email))).contains(lines);
    }

    @Then("the import state reports the outage {string} after {int} failures")
    public void theImportStateReportsTheOutage(String kind, int failures) {
        BankImportState state = states.current();
        assertThat(state.reportedOutage()).contains(ImportFailureKind.valueOf(kind));
        assertThat(state.consecutiveFailures()).isEqualTo(failures);
    }

    @Then("the import state reports no outage")
    public void theImportStateReportsNoOutage() {
        BankImportState state = states.current();
        assertThat(state.reportedOutage()).isEmpty();
        assertThat(state.consecutiveFailures()).isZero();
    }

    private static List<String> recipientsOf(MimeMessage email) {
        try {
            return Arrays.stream(MailContents.asReceived(email).getRecipients(Message.RecipientType.TO))
                    .map(Object::toString).toList();
        } catch (MessagingException unreadable) {
            throw new IllegalStateException("The e-mail's recipients cannot be read", unreadable);
        }
    }

    private static String spaced(String text) {
        return text.replace(' ', ' ');
    }
}
