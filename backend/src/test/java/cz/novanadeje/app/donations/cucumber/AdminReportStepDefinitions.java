package cz.novanadeje.app.donations.cucumber;

import cz.novanadeje.app.cucumber.ApiClient;
import cz.novanadeje.app.cucumber.DonorSessions;
import cz.novanadeje.app.cucumber.ScenarioDonors;
import cz.novanadeje.app.support.MailContents;
import cz.novanadeje.app.support.RecordingMailSender;
import io.cucumber.java.en.Then;
import io.cucumber.java.en.When;
import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;
import org.springframework.jdbc.core.simple.JdbcClient;
import tools.jackson.databind.JsonNode;

import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

public class AdminReportStepDefinitions {

    private static final String REPORT = "/api/admin/donations/report";
    private static final String OVERVIEW = "/api/admin/donations/overview";
    private static final String SUBJECT_PREFIX = "Měsíční přehled";

    private final ApiClient api;
    private final DonorSessions sessions;
    private final ScenarioDonors scenarioDonors;
    private final RecordingMailSender mailSender;
    private final JdbcClient jdbc;

    public AdminReportStepDefinitions(ApiClient api, DonorSessions sessions, ScenarioDonors scenarioDonors, RecordingMailSender mailSender,
                                      JdbcClient jdbc) {
        this.api = api;
        this.sessions = sessions;
        this.scenarioDonors = scenarioDonors;
        this.mailSender = mailSender;
        this.jdbc = jdbc;
    }

    @When("{string} asks for the monthly report settings")
    public void asksForTheMonthlyReportSettings(String alias) {
        sessions.actAs(alias);
        api.get(REPORT);
    }

    @When("someone without a token asks for the monthly report settings")
    public void someoneWithoutATokenAsksForTheMonthlyReportSettings() {
        api.forgetCredentials();
        api.get(REPORT);
    }

    @When("{string} changes the monthly report settings:")
    public void changesTheMonthlyReportSettings(String alias, Map<String, String> settings) {
        sessions.actAs(alias);
        List<String> sections = list(settings.getOrDefault("sections", ""));
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("recipients", list(settings.get("recipients")));
        body.put("sendDay", Integer.parseInt(settings.get("sendDay")));
        String sendHour = settings.containsKey("sendHour") ? settings.get("sendHour") : "7";
        if (sendHour != null && !sendHour.isBlank()) {
            body.put("sendHour", Integer.parseInt(sendHour));
        }
        body.put("sections", Map.of(
                "donors", sections.contains("donors"),
                "donations", sections.contains("donations"),
                "unpairedPayments", sections.contains("unpairedPayments"),
                "bankImport", sections.contains("bankImport")));
        api.put(REPORT + "/settings", body);
    }

    @When("{string} sends the monthly report for {string} again")
    public void sendsTheMonthlyReportForAgain(String alias, String month) {
        sessions.actAs(alias);
        api.post(REPORT + "/send", Map.of("month", month));
    }

    @When("{string} asks for the donations overview")
    public void asksForTheDonationsOverview(String alias) {
        sessions.actAs(alias);
        api.get(OVERVIEW);
    }

    @When("{string} asks for the donations overview of {int}")
    public void asksForTheDonationsOverviewOf(String alias, int year) {
        sessions.actAs(alias);
        api.get(OVERVIEW + "?year=" + year);
    }

    @Then("the monthly report settings say:")
    @Then("the sent report says:")
    @Then("the donations overview says:")
    public void theResponseSays(Map<String, String> expected) {
        JsonNode response = api.lastResponseJson();
        expected.forEach((path, value) -> assertThat(at(response, path).asString()).as(path).isEqualTo(value));
    }

    @Then("the monthly report settings list no sent report")
    public void theMonthlyReportSettingsListNoSentReport() {
        assertThat(api.lastResponseJson().get("sentReports")).isEmpty();
    }

    @Then("the donations overview lists {int} months")
    public void theDonationsOverviewListsMonths(int count) {
        assertThat(api.lastResponseJson().get("months")).hasSize(count);
    }

    @Then("the monthly report e-mail does not say {string}")
    public void theMonthlyReportEmailDoesNotSay(String text) {
        MimeMessage email = mailSender.sent().stream().filter(sent -> subjectOf(sent).startsWith(SUBJECT_PREFIX)).toList().getLast();
        assertThat(MailContents.plainText(email)).doesNotContain(text);
        assertThat(MailContents.html(email)).doesNotContain(text);
    }

    @Then("the admin action {string} by {string} is recorded with details containing {string}")
    public void theAdminActionByIsRecordedWithDetailsContaining(String action, String alias, String details) {
        List<String> recorded = jdbc.sql("select details from admin_action where action = ? and admin_id = ? and subject_id is null")
                .param(action)
                .param(scenarioDonors.idOf(alias))
                .query(String.class)
                .list();
        assertThat(recorded).singleElement().asString().contains(details);
    }

    @Then("no admin action {string} is recorded")
    public void noAdminActionIsRecorded(String action) {
        assertThat(jdbc.sql("select count(*) from admin_action where action = ?").param(action).query(Long.class).single()).isZero();
    }

    private static List<String> list(String commaSeparated) {
        if (commaSeparated == null || commaSeparated.isBlank()) {
            return List.of();
        }
        return Arrays.stream(commaSeparated.split(",")).map(String::trim).toList();
    }

    private static String subjectOf(MimeMessage email) {
        try {
            return MailContents.asReceived(email).getSubject();
        } catch (MessagingException unreadable) {
            throw new IllegalStateException("The e-mail's subject cannot be read", unreadable);
        }
    }

    private static JsonNode at(JsonNode node, String path) {
        JsonNode current = node;
        for (String segment : path.split("\\.")) {
            current = segment.chars().allMatch(Character::isDigit) ? current.get(Integer.parseInt(segment)) : current.get(segment);
            assertThat(current).as(path).isNotNull();
        }
        return current;
    }
}
