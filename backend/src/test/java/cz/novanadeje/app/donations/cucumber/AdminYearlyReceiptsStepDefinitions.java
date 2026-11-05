package cz.novanadeje.app.donations.cucumber;

import cz.novanadeje.app.cucumber.ApiClient;
import cz.novanadeje.app.cucumber.DonorSessions;
import cz.novanadeje.app.cucumber.ScenarioDonors;
import io.cucumber.datatable.DataTable;
import io.cucumber.java.en.Then;
import io.cucumber.java.en.When;
import org.springframework.jdbc.core.simple.JdbcClient;
import tools.jackson.databind.JsonNode;

import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.IntStream;

import static org.assertj.core.api.Assertions.assertThat;

public class AdminYearlyReceiptsStepDefinitions {

    private static final String YEARLY_PATH = "/api/admin/donations/receipts/yearly";
    private static final String RECEIPTS_PATH = "/api/admin/donations/receipts/";
    private static final String ACCESS_TOKEN = "access_token";

    private final ApiClient api;
    private final DonorSessions sessions;
    private final ScenarioDonors scenarioDonors;
    private final JdbcClient jdbc;
    private String exchangedApiToken;

    public AdminYearlyReceiptsStepDefinitions(ApiClient api, DonorSessions sessions, ScenarioDonors scenarioDonors, JdbcClient jdbc) {
        this.api = api;
        this.sessions = sessions;
        this.scenarioDonors = scenarioDonors;
        this.jdbc = jdbc;
    }

    @When("{string} lists in the administration the donors to receive yearly receipts for {int}")
    public void listsTheDonorsToReceiveYearlyReceipts(String alias, int year) {
        sessions.actAs(alias);
        api.get(YEARLY_PATH + "?year=" + year);
    }

    @When("{string} lists in the administration the donors to receive yearly receipts of the last completed year")
    public void listsTheDonorsToReceiveYearlyReceiptsOfTheLastCompletedYear(String alias) {
        sessions.actAs(alias);
        api.get(YEARLY_PATH);
    }

    @When("someone without a token lists in the administration the donors to receive yearly receipts for {int}")
    public void someoneWithoutATokenListsTheDonors(int year) {
        api.forgetCredentials();
        api.get(YEARLY_PATH + "?year=" + year);
    }

    @When("the exchanged API token lists the donors to receive yearly receipts for {int}")
    public void theExchangedApiTokenListsTheDonors(int year) {
        actAsExchangedApiToken();
        api.get(YEARLY_PATH + "?year=" + year);
    }

    @When("{string} issues in the administration the yearly receipts for {int} of {string}")
    public void issuesTheYearlyReceipts(String alias, int year, String donors) {
        sessions.actAs(alias);
        issue(year, idsOf(donors));
    }

    @When("{string} issues in the administration the yearly receipts for {int} of no donor")
    public void issuesTheYearlyReceiptsOfNoDonor(String alias, int year) {
        sessions.actAs(alias);
        issue(year, List.of());
    }

    @When("{string} issues in the administration the yearly receipts for {int} of {int} unknown donors")
    public void issuesTheYearlyReceiptsOfUnknownDonors(String alias, int year, int count) {
        sessions.actAs(alias);
        issue(year, IntStream.range(0, count).mapToObj(index -> String.format("0192f0f1-0000-7000-8000-%012d", index)).toList());
    }

    @When("someone without a token issues in the administration the yearly receipts for {int} of {string}")
    public void someoneWithoutATokenIssuesTheYearlyReceipts(int year, String donors) {
        api.forgetCredentials();
        issue(year, idsOf(donors));
    }

    @When("the exchanged API token issues the yearly receipts for {int} of {string}")
    public void theExchangedApiTokenIssuesTheYearlyReceipts(int year, String donors) {
        actAsExchangedApiToken();
        issue(year, idsOf(donors));
    }

    @Then("the donors to receive yearly receipts are, {int} erased donor(s) left out:")
    public void theDonorsToReceiveYearlyReceiptsAre(int erased, DataTable table) {
        JsonNode answer = api.lastResponseJson();
        assertThat(answer.get("donors")).withFailMessage("No donors in %s", api.lastResponse().getBody()).isNotNull();
        assertThat(answer.get("erasedDonors").asInt()).isEqualTo(erased);
        List<String> expected = table.asMaps().stream()
                .map(row -> scenarioDonors.idOf(row.get("donor")) + " " + row.get("giftCount") + " " + row.get("totalAmountMinor") + " "
                        + Optional.ofNullable(row.get("receipt")).orElse(""))
                .toList();
        List<String> actual = answer.get("donors").valueStream()
                .map(donor -> donor.get("donorId").asString() + " " + donor.get("giftCount").asInt() + " " + donor.get("totalAmountMinor").asLong() + " "
                        + (donor.get("receipt").isNull() ? "" : donor.get("receipt").get("number").asString()))
                .toList();
        assertThat(actual).containsExactlyInAnyOrderElementsOf(expected);
        answer.get("donors").forEach(donor -> assertThat(donor.get("name").asString()).isNotBlank());
    }

    @Then("the donors to receive yearly receipts are those of {int}, among completed years from {int} through {int}")
    public void theDonorsToReceiveYearlyReceiptsAreThoseOf(int year, int from, int through) {
        JsonNode answer = api.lastResponseJson();
        assertThat(List.of(answer.get("year").asInt(), answer.get("receiptsAvailableFrom").asInt(), answer.get("yearlyReceiptsAvailableThrough").asInt()))
                .withFailMessage("Answered %s", api.lastResponse().getBody())
                .containsExactly(year, from, through);
    }

    @Then("the yearly receipts were issued as:")
    public void theYearlyReceiptsWereIssuedAs(DataTable table) {
        JsonNode answer = api.lastResponseJson();
        assertThat(answer.get("results")).withFailMessage("No results in %s", api.lastResponse().getBody()).isNotNull();
        List<String> expected = table.asMaps().stream()
                .map(row -> scenarioDonors.idOf(row.get("donor")) + " " + row.get("outcome") + " " + blankIfMissing(row.get("number")) + " "
                        + blankIfMissing(row.get("problem")) + " " + blankIfMissing(row.get("replaced")))
                .toList();
        List<String> actual = answer.get("results").valueStream()
                .map(result -> result.get("donorId").asString() + " " + result.get("outcome").asString() + " "
                        + (result.get("receipt").isNull() ? "" : result.get("receipt").get("number").asString()) + " "
                        + textOrBlank(result.get("problem")) + " " + (table.asMaps().getFirst().containsKey("replaced") ? textOrBlank(result.get("replacedNumber")) : ""))
                .toList();
        assertThat(actual).containsExactlyElementsOf(expected);
    }

    @Then("the yearly receipts were counted as {int} issued, {int} replaced, {int} unchanged and {int} skipped")
    public void theYearlyReceiptsWereCountedAs(int issued, int replaced, int unchanged, int skipped) {
        JsonNode answer = api.lastResponseJson();
        assertThat(List.of(answer.get("issued").asInt(), answer.get("replaced").asInt(), answer.get("unchanged").asInt(), answer.get("skipped").asInt()))
                .withFailMessage("Counted %s", api.lastResponse().getBody())
                .containsExactly(issued, replaced, unchanged, skipped);
    }

    @Then("every receipt of the yearly receipts answer is the receipt the administration reads by its id")
    public void everyReceiptOfTheYearlyReceiptsAnswerIsTheReceiptReadByItsId() {
        List<JsonNode> receipts = api.lastResponseJson().get("results").valueStream()
                .map(result -> result.get("receipt"))
                .filter(receipt -> !receipt.isNull())
                .toList();
        assertThat(receipts).isNotEmpty();
        for (JsonNode receipt : receipts) {
            api.get(RECEIPTS_PATH + receipt.get("id").asString());
            assertThat(api.lastResponseJson()).isEqualTo(receipt);
        }
    }

    @Then("no bulk receipt issue is audited")
    public void noBulkReceiptIssueIsAudited() {
        assertThat(jdbc.sql("select count(*) from admin_action where action = 'ISSUE_RECEIPTS'").query(Long.class).single()).isZero();
    }

    private void issue(int year, List<String> donorIds) {
        api.post(YEARLY_PATH, Map.of("year", year, "donorIds", donorIds));
    }

    private List<String> idsOf(String donors) {
        return Arrays.stream(donors.split(",\\s*")).map(alias -> scenarioDonors.idOf(alias).toString()).toList();
    }

    private static String blankIfMissing(String cell) {
        return cell == null ? "" : cell;
    }

    private static String textOrBlank(JsonNode node) {
        return node == null || node.isNull() ? "" : node.asString();
    }

    private void actAsExchangedApiToken() {
        JsonNode last = api.lastResponseJson();
        if (last != null && last.has(ACCESS_TOKEN)) {
            exchangedApiToken = last.get(ACCESS_TOKEN).asString();
        }
        api.forgetCredentials();
        api.authorize(exchangedApiToken);
    }
}
