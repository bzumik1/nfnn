package cz.novanadeje.app.donors.cucumber;

import cz.novanadeje.app.cucumber.ApiClient;
import cz.novanadeje.app.cucumber.DonorSessions;
import cz.novanadeje.app.cucumber.ScenarioDonors;
import cz.novanadeje.app.donors.application.AdministratorBootstrap;
import cz.novanadeje.app.donors.application.AdministratorProperties;
import cz.novanadeje.app.donors.application.AdministratorService;
import cz.novanadeje.app.support.RecordingMailSender;
import io.cucumber.java.en.Given;
import io.cucumber.java.en.Then;
import io.cucumber.java.en.When;
import jakarta.mail.Message;
import jakarta.mail.internet.MimeMessage;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.simple.JdbcClient;
import tools.jackson.databind.JsonNode;

import java.time.Duration;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.StreamSupport;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

public class AdminAdministratorsStepDefinitions {

    private static final String ADMINISTRATORS_PATH = "/api/admin/donors/administrators";
    private static final String DONORS_PATH = "/api/admin/donors/";
    private static final Duration MAIL_WAIT = Duration.ofSeconds(5);

    private final ApiClient api;
    private final DonorSessions sessions;
    private final ScenarioDonors scenarioDonors;
    private final JdbcClient jdbc;
    private final RecordingMailSender mailSender;
    private final AdministratorService administrators;
    private AdministratorProperties configured = new AdministratorProperties(List.of());

    public AdminAdministratorsStepDefinitions(ApiClient api, DonorSessions sessions, ScenarioDonors scenarioDonors, JdbcClient jdbc,
                                              RecordingMailSender mailSender, AdministratorService administrators) {
        this.api = api;
        this.sessions = sessions;
        this.scenarioDonors = scenarioDonors;
        this.jdbc = jdbc;
        this.mailSender = mailSender;
        this.administrators = administrators;
    }

    @When("{string} lists the administrators")
    public void listsTheAdministrators(String alias) {
        sessions.actAs(alias);
        api.get(ADMINISTRATORS_PATH);
    }

    @When("someone without a token lists the administrators")
    public void someoneWithoutATokenListsTheAdministrators() {
        api.forgetCredentials();
        api.get(ADMINISTRATORS_PATH);
    }

    @When("{string} makes {string} an administrator")
    public void makesAnAdministrator(String alias, String donorAlias) {
        makesTheEmailAnAdministrator(alias, scenarioDonors.credentialsOf(donorAlias).email());
    }

    @Given("{string} made {string} an administrator")
    public void madeAnAdministrator(String alias, String donorAlias) {
        makesAnAdministrator(alias, donorAlias);
        assertThat(api.lastResponse().getStatusCode().value()).isEqualTo(201);
    }

    @When("{string} makes the e-mail {string} an administrator")
    public void makesTheEmailAnAdministrator(String alias, String email) {
        sessions.actAs(alias);
        api.post(ADMINISTRATORS_PATH, Map.of("email", email));
    }

    @When("{string} removes {string} from the administrators")
    public void removesFromTheAdministrators(String alias, String donorAlias) {
        sessions.actAs(alias);
        api.delete(ADMINISTRATORS_PATH + "/" + scenarioDonors.idOf(donorAlias));
    }

    @When("{string} removes an unknown donor from the administrators")
    public void removesAnUnknownDonorFromTheAdministrators(String alias) {
        sessions.actAs(alias);
        api.delete(ADMINISTRATORS_PATH + "/" + UUID.fromString("019a1c00-0000-7000-8000-00000000dead"));
    }

    @When("{string} turns off the two-factor authentication of {string}")
    public void turnsOffTheTwoFactorAuthenticationOf(String alias, String donorAlias) {
        sessions.actAs(alias);
        api.post(DONORS_PATH + scenarioDonors.idOf(donorAlias) + "/second-factor/reset", Map.of());
    }

    @Then("^the administrators are ([A-Za-z, ]+)$")
    public void theAdministratorsAre(String aliases) {
        List<String> expected = Arrays.stream(aliases.split(",")).map(String::trim).map(alias -> scenarioDonors.credentialsOf(alias).email()).toList();
        assertThat(administratorEmails()).containsExactlyElementsOf(expected);
    }

    @Then("administrator {string} has two-factor authentication on")
    public void administratorHasTwoFactorAuthenticationOn(String alias) {
        assertThat(administrator(alias).get("secondFactorEnabled").asBoolean()).isTrue();
    }

    @Then("administrator {string} has two-factor authentication off")
    public void administratorHasTwoFactorAuthenticationOff(String alias) {
        assertThat(administrator(alias).get("secondFactorEnabled").asBoolean()).isFalse();
    }

    @Then("the administrator response names {string} without two-factor authentication")
    public void theAdministratorResponseNamesWithoutTwoFactorAuthentication(String alias) {
        JsonNode response = api.lastResponseJson();
        assertThat(response.get("donorId").asString()).isEqualTo(scenarioDonors.idOf(alias).toString());
        assertThat(response.get("email").asString()).isEqualTo(scenarioDonors.credentialsOf(alias).email());
        assertThat(response.get("name").asString()).isNotBlank();
        assertThat(response.get("secondFactorEnabled").asBoolean()).isFalse();
    }

    @Then("the admin action {string} by {string} on {string} is recorded")
    public void theAdminActionByOnIsRecorded(String action, String alias, String subjectAlias) {
        assertThat(actionCount(action, scenarioDonors.idOf(alias), scenarioDonors.idOf(subjectAlias))).isEqualTo(1);
    }

    @Then("the admin action {string} by {string} is not recorded")
    public void theAdminActionByIsNotRecorded(String action, String alias) {
        Long count = jdbc.sql("select count(*) from admin_action where action = ? and admin_id = ?")
                .param(action).param(scenarioDonors.idOf(alias)).query(Long.class).single();
        assertThat(count).isZero();
    }

    @Then("no admin action is recorded for {string}")
    public void noAdminActionIsRecordedFor(String alias) {
        Long count = jdbc.sql("select count(*) from admin_action where subject_id = ?").param(scenarioDonors.idOf(alias)).query(Long.class).single();
        assertThat(count).isZero();
    }

    @Then("e-mail {int} goes to the address of {string} with the subject {string}")
    public void emailGoesToTheAddressOfWithTheSubject(int position, String alias, String subject) throws Exception {
        await().atMost(MAIL_WAIT).untilAsserted(() -> assertThat(mailSender.sent()).hasSizeGreaterThanOrEqualTo(position));
        MimeMessage sent = mailSender.sent().get(position - 1);
        assertThat(sent.getRecipients(Message.RecipientType.TO)).extracting(Object::toString)
                .containsExactly(scenarioDonors.credentialsOf(alias).email());
        assertThat(sent.getSubject()).isEqualTo(subject);
    }

    @Given("the configuration names {string} and {string} as administrators")
    public void theConfigurationNamesAsAdministrators(String alias, String email) {
        configured = new AdministratorProperties(List.of(scenarioDonors.credentialsOf(alias).email(), email));
    }

    @When("the application starts")
    public void theApplicationStarts() {
        new AdministratorBootstrap(configured, administrators).run();
    }

    @Given("nobody administers the site")
    public void nobodyAdministersTheSite() {
        jdbc.sql("delete from donor_role where role = 'ADMIN'").update();
    }

    @Then("{string} is an administrator in the database")
    public void isAnAdministratorInTheDatabase(String alias) {
        assertThat(administratorRows(alias)).isEqualTo(1);
    }

    @Then("{string} is not an administrator in the database")
    public void isNotAnAdministratorInTheDatabase(String alias) {
        assertThat(administratorRows(alias)).isZero();
    }

    private long administratorRows(String alias) {
        return jdbc.sql("select count(*) from donor_role where role = 'ADMIN' and donor_id = ?").param(scenarioDonors.idOf(alias))
                .query(Long.class).single();
    }

    private List<String> administratorEmails() {
        ResponseEntity<String> response = api.lastResponse();
        assertThat(response.getStatusCode().value()).withFailMessage("Listing answered %s", response.getBody()).isEqualTo(200);
        return StreamSupport.stream(api.lastResponseJson().get("items").spliterator(), false).map(item -> item.get("email").asString()).toList();
    }

    private JsonNode administrator(String alias) {
        String email = scenarioDonors.credentialsOf(alias).email();
        return StreamSupport.stream(api.lastResponseJson().get("items").spliterator(), false)
                .filter(item -> item.get("email").asString().equals(email))
                .findFirst()
                .orElseThrow(() -> new AssertionError("No administrator " + alias + " in " + api.lastResponse().getBody()));
    }

    private long actionCount(String action, UUID adminId, UUID subjectId) {
        return jdbc.sql("select count(*) from admin_action where action = ? and admin_id = ? and subject_id = ?")
                .param(action).param(adminId).param(subjectId).query(Long.class).single();
    }
}
