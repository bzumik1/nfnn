package cz.novanadeje.app.donations.cucumber;

import cz.novanadeje.app.cucumber.ApiClient;
import cz.novanadeje.app.cucumber.DonorSessions;
import cz.novanadeje.app.cucumber.ScenarioDonors;
import io.cucumber.datatable.DataTable;
import io.cucumber.java.en.Then;
import io.cucumber.java.en.When;
import org.springframework.jdbc.core.simple.JdbcClient;
import tools.jackson.databind.JsonNode;

import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

public class AdminReceiptsStepDefinitions {

    private static final String RECEIPTS_PATH = "/api/admin/donations/receipts";
    private static final String IMAGES_PATH = "/api/admin/donations/receipt-images/";
    private static final String ACCESS_TOKEN = "access_token";

    private final ApiClient api;
    private final DonorSessions sessions;
    private final ScenarioDonors scenarioDonors;
    private final JdbcClient jdbc;
    private String exchangedApiToken;

    public AdminReceiptsStepDefinitions(ApiClient api, DonorSessions sessions, ScenarioDonors scenarioDonors, JdbcClient jdbc) {
        this.api = api;
        this.sessions = sessions;
        this.scenarioDonors = scenarioDonors;
        this.jdbc = jdbc;
    }

    @When("{string} issues in the administration the yearly receipt of {string} for {int}")
    public void issuesInTheAdministrationTheYearlyReceipt(String alias, String donor, int year) {
        sessions.actAs(alias);
        issue(scenarioDonors.idOf(donor), Map.of("year", year));
    }

    @When("{string} issues in the administration the receipt of the donation of {string} received on {date}")
    public void issuesInTheAdministrationTheReceiptOfTheDonation(String alias, String donor, LocalDate receivedOn) {
        sessions.actAs(alias);
        issue(scenarioDonors.idOf(donor), Map.of("donationId", donationIdOf(donor, receivedOn).toString()));
    }

    @When("{string} issues in the administration the receipt of the donation of {string} numbered {string}")
    public void issuesInTheAdministrationTheReceiptOfTheDonationNumbered(String alias, String donor, String donationId) {
        sessions.actAs(alias);
        issue(scenarioDonors.idOf(donor), Map.of("donationId", donationId));
    }

    @When("{string} issues in the administration a receipt of {string} naming the year {string} and the donation {string}")
    public void issuesInTheAdministrationAReceiptNaming(String alias, String donor, String year, String donationId) {
        sessions.actAs(alias);
        Map<String, Object> body = new LinkedHashMap<>();
        if (!year.isEmpty()) {
            body.put("year", Long.parseLong(year));
        }
        if (!donationId.isEmpty()) {
            body.put("donationId", donationId);
        }
        issue(scenarioDonors.idOf(donor), body);
    }

    @When("{string} issues in the administration the yearly receipt of an unknown donor for {int}")
    public void issuesInTheAdministrationTheYearlyReceiptOfAnUnknownDonor(String alias, int year) {
        sessions.actAs(alias);
        issue(UUID.fromString("0192f0f1-0000-7000-8000-00000000d0d0"), Map.of("year", year));
    }

    @When("someone without a token issues in the administration the yearly receipt of {string} for {int}")
    public void someoneWithoutATokenIssuesInTheAdministration(String donor, int year) {
        api.forgetCredentials();
        issue(scenarioDonors.idOf(donor), Map.of("year", year));
    }

    @When("the exchanged API token issues the yearly receipt of {string} for {int}")
    public void theExchangedApiTokenIssuesTheYearlyReceipt(String donor, int year) {
        actAsExchangedApiToken();
        issue(scenarioDonors.idOf(donor), Map.of("year", year));
    }

    @When("the exchanged API token issues the receipt of the donation of {string} received on {date}")
    public void theExchangedApiTokenIssuesTheReceiptOfTheDonation(String donor, LocalDate receivedOn) {
        actAsExchangedApiToken();
        issue(scenarioDonors.idOf(donor), Map.of("donationId", donationIdOf(donor, receivedOn).toString()));
    }

    @When("{string} lists the issued receipts in the administration")
    public void listsTheIssuedReceipts(String alias) {
        sessions.actAs(alias);
        api.get(RECEIPTS_PATH);
    }

    @When("{string} lists the issued receipts in the administration, {int} on page {int}")
    public void listsTheIssuedReceiptsOnPage(String alias, int limit, int page) {
        sessions.actAs(alias);
        api.get(RECEIPTS_PATH + "?limit=" + limit + "&page=" + page);
    }

    @When("{string} lists the issued receipts in the administration issued in {int}")
    public void listsTheIssuedReceiptsIssuedIn(String alias, int year) {
        sessions.actAs(alias);
        api.get(RECEIPTS_PATH + "?issuedIn=" + year);
    }

    @When("{string} lists the issued receipts of {string} in the administration")
    public void listsTheIssuedReceiptsOf(String alias, String donor) {
        sessions.actAs(alias);
        api.get(RECEIPTS_PATH + "?donorId=" + scenarioDonors.idOf(donor));
    }

    @When("{string} lists the issued receipts of {string} in the administration issued in {int}, {int} on page {int}")
    public void listsTheIssuedReceiptsOfIssuedInOnPage(String alias, String donor, int year, int limit, int page) {
        sessions.actAs(alias);
        api.get(RECEIPTS_PATH + "?donorId=" + scenarioDonors.idOf(donor) + "&issuedIn=" + year + "&limit=" + limit + "&page=" + page);
    }

    @When("someone without a token lists the issued receipts in the administration")
    public void someoneWithoutATokenListsTheIssuedReceipts() {
        api.forgetCredentials();
        api.get(RECEIPTS_PATH);
    }

    @When("the exchanged API token lists the issued receipts of {string}")
    public void theExchangedApiTokenListsTheIssuedReceiptsOf(String donor) {
        actAsExchangedApiToken();
        api.get(RECEIPTS_PATH + "?donorId=" + scenarioDonors.idOf(donor));
    }

    @When("{string} reads in the administration the receipt {string}")
    public void readsInTheAdministrationTheReceipt(String alias, String number) {
        sessions.actAs(alias);
        api.get(RECEIPTS_PATH + "/" + receiptIdOf(number));
    }

    @When("{string} reads in the administration the receipt with id {string}")
    public void readsInTheAdministrationTheReceiptWithId(String alias, String id) {
        sessions.actAs(alias);
        api.get(RECEIPTS_PATH + "/" + id);
    }

    @When("someone without a token reads in the administration the receipt with id {string}")
    public void someoneWithoutATokenReadsInTheAdministrationTheReceipt(String id) {
        api.forgetCredentials();
        api.get(RECEIPTS_PATH + "/" + id);
    }

    @When("the exchanged API token reads the receipt {string}")
    public void theExchangedApiTokenReadsTheReceipt(String number) {
        actAsExchangedApiToken();
        api.get(RECEIPTS_PATH + "/" + receiptIdOf(number));
    }

    @When("{string} fetches in the administration the signature image of receipt {string}")
    public void fetchesInTheAdministrationTheSignatureImageOfReceipt(String alias, String number) {
        sessions.actAs(alias);
        api.getBytes(IMAGES_PATH + signatureImageOf(number));
    }

    @When("{string} fetches in the administration the receipt image {string}")
    public void fetchesInTheAdministrationTheReceiptImage(String alias, String digest) {
        sessions.actAs(alias);
        api.getBytes(IMAGES_PATH + digest);
    }

    @When("someone without a token fetches in the administration the receipt image {string}")
    public void someoneWithoutATokenFetchesInTheAdministrationTheReceiptImage(String digest) {
        api.forgetCredentials();
        api.getBytes(IMAGES_PATH + digest);
    }

    @Then("the issued receipt belongs to {string}")
    public void theIssuedReceiptBelongsTo(String alias) {
        assertThat(api.lastResponseJson().get("donorId").asString()).isEqualTo(scenarioDonors.idOf(alias).toString());
    }

    @Then("the administration's receipt list counts {int} of {int} receipts:")
    public void theAdministrationsReceiptListCounts(int shown, int total, DataTable table) {
        JsonNode answer = api.lastResponseJson();
        assertThat(answer.get("items")).withFailMessage("No items in %s", api.lastResponse().getBody()).isNotNull();
        assertThat(answer.get("total").asLong()).isEqualTo(total);
        List<String> expected = table.asMaps().stream()
                .map(row -> row.get("number") + " " + row.get("status") + " " + row.get("kind") + " " + scenarioDonors.idOf(row.get("donor")))
                .toList();
        List<String> actual = answer.get("items").valueStream()
                .map(item -> item.get("number").asString() + " " + item.get("status").asString() + " " + item.get("kind").asString() + " "
                        + item.get("donorId").asString())
                .toList();
        assertThat(actual).hasSize(shown).containsExactlyElementsOf(expected);
        answer.get("items").forEach(item -> assertThat(item.has("receipt")).withFailMessage("A list item carries the frozen receipt: %s", item).isFalse());
    }

    private void issue(UUID donor, Map<String, ?> body) {
        api.post("/api/admin/donations/donors/" + donor + "/receipts", body);
    }

    private void actAsExchangedApiToken() {
        JsonNode last = api.lastResponseJson();
        if (last != null && last.has(ACCESS_TOKEN)) {
            exchangedApiToken = last.get(ACCESS_TOKEN).asString();
        }
        api.forgetCredentials();
        api.authorize(exchangedApiToken);
    }

    private UUID donationIdOf(String alias, LocalDate receivedOn) {
        return jdbc.sql("select id from donation where donor_id = ? and received_on = ?")
                .params(scenarioDonors.idOf(alias), receivedOn)
                .query(UUID.class)
                .single();
    }

    private UUID receiptIdOf(String number) {
        return jdbc.sql("select id from issued_receipt where number = ?").param(number).query(UUID.class).single();
    }

    private String signatureImageOf(String number) {
        return jdbc.sql("select signature_image_sha256 from issued_receipt where number = ?").param(number).query(String.class).single();
    }
}
